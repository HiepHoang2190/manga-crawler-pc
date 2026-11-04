/**
 * VietMessenger Service — https://vietmessenger.com/comics/
 * Site truyện tranh cổ Việt Nam, yêu cầu cookie SESSION để xem.
 * Mỗi comic chỉ có 1 "chapter" (tất cả ảnh trên 1 trang).
 */
const { HtmlConnectorService } = require('../base/HtmlConnectorService');

class VietMessengerService extends HtmlConnectorService {
  constructor() {
    super({
      domain: 'https://vietmessenger.com/',
      label: 'VietMessenger',
      siteId: 'vietmessenger',
      selectors: {
        // VietMessenger: mỗi comic là 1 page duy nhất, không có chapter list riêng
        // Selector này chỉ dùng khi load từ trang listing
        chapterLinks: 'h2 a.title[href*="?title="]',
        title: 'h2 a.title',
        cover: 'img[src*="/comics/"][src*="/scover."]',
      },
    });
  }

  /**
   * Tự động duyệt qua tất cả các trang của danh sách truyện (Directory)
   * Thay vì chỉ parse trang đầu tiên.
   */
  async load(url, options = {}) {
    let userCookie = this._effectiveUserCookie();
    if (!userCookie || !userCookie.includes('SESSION=')) {
      userCookie = await this._autoLogin();
      if (!userCookie) {
         return { ok: false, error: 'VietMessenger yêu cầu đăng nhập và tự động lấy cookie thất bại.' };
      }
    }

    // Nếu tải trực tiếp 1 truyện cụ thể
    if (url.includes('?title=')) {
       let result = await super.load(url, options);
       if (result.ok) {
           // Nếu parseMangaPage không tìm thấy chapter vì HTML của trang đọc không có link
           if (!result.chapters || result.chapters.length === 0) {
               result.chapters = [{ url: url, title: 'Toàn tập' }];
           }
       }
       return result;
    }

    const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
    const cheerio = require('cheerio');
    
    let currentUrl = url;
    if (!currentUrl.includes('?page=')) {
      currentUrl = 'https://vietmessenger.com/comics/?page=1';
    }

    let fetched = await fetchHtml(currentUrl, { cookie: userCookie });
    if (!fetched.ok) return { ok: false, error: fetched.error };
    
    let $ = cheerio.load(fetched.html);
    let totalPages = 1;
    $('.pagenav select option').each((i, el) => {
        let val = $(el).attr('value');
        if (val) {
            let m = val.match(/page=(\d+)/);
            if (m && parseInt(m[1]) > totalPages) totalPages = parseInt(m[1]);
        }
    });

    // Nếu người dùng nhập thẳng URL là một trang cụ thể, thì tuỳ chọn là tải hết hay tải từ trang đó?
    // Để an toàn, chúng ta tải tất cả các trang từ 1 đến totalPages để quét toàn bộ site.
    let allChapters = [];
    
    for (let i = 1; i <= totalPages; i++) {
        let pageUrl = `https://vietmessenger.com/comics/?page=${i}`;
        let res = await fetchHtml(pageUrl, { cookie: userCookie });
        if (res.ok) {
            let $page = cheerio.load(res.html);
            $page(this.config.selectors.chapterLinks).each((idx, el) => {
                const href = $page(el).attr('href');
                const title = $page(el).text().trim();
                if (href) {
                    const chapterUrl = new URL(href, this.config.domain).href;
                    if (!allChapters.find(c => c.url === chapterUrl)) {
                        allChapters.push({ url: chapterUrl, title });
                    }
                }
            });
        }
    }

    return {
        ok: true,
        manga: {
            title: 'VietMessenger Library',
            coverUrl: '',
            mangaUrl: 'https://vietmessenger.com/comics/',
            mangaId: 'directory',
            siteId: 'vietmessenger',
            sourceLabel: 'VietMessenger'
        },
        chapters: allChapters
    };
  }

  /**
   * Fetch chapter images từ trang manga.
   * VietMessenger hiển thị tất cả ảnh trên 1 trang, nhưng yêu cầu đăng nhập hợp lệ.
   */
  async fetchChapterImages(chapterUrl, referer) {
    let userCookie = this._effectiveUserCookie();
    
    if (!userCookie || !userCookie.includes('SESSION=')) {
      userCookie = await this._autoLogin();
      if (!userCookie) {
        throw new Error('VietMessenger yêu cầu đăng nhập và tự động lấy cookie thất bại.');
      }
    }
    
    const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
    
    const fetched = await fetchHtml(chapterUrl, {
      referer,
      cookie: userCookie,
    });
    
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    const cheerio = require('cheerio');
    const $ = cheerio.load(fetched.html);
    
    const bookData = $('#book-data');
    if (!bookData.length) {
      const bodyClass = $('body').attr('class') || '';
      throw new Error(
        'Không tìm thấy dữ liệu truyện. Cookie có thể đã hết hạn hoặc không hợp lệ. ' +
        `Body class: ${bodyClass}. Vui lòng kiểm tra lại tài khoản và lấy lại cookie.`
      );
    }

    const media = bookData.attr('media');
    if (media !== 'comic') {
      throw new Error(`Truyện này là truyện chữ (media="${media}"). Crawler chỉ hỗ trợ tải truyện tranh!`);
    }

    const t = bookData.attr('t');
    const c = bookData.attr('c') != null ? bookData.attr('c') : '1';
    const lStr = bookData.attr('l');
    const initialL = parseInt(lStr, 10);

    if (!t || isNaN(initialL) || initialL <= 0) {
      throw new Error(`Dữ liệu cấu hình truyện không hợp lệ (t=${t}, c=${c}, l=${lStr})`);
    }

    // Determine the true page count by probing the backend.
    // The server often underreports 'l' by 1-2 pages (e.g. l=105 but page 106 exists).
    let actualL = initialL;
    const apiUrl = new URL('/comics/getcomic.php', this.config.domain).href;
    
    // Probe up to 5 extra pages beyond initialL
    for (let p = initialL - 1; p < initialL + 5; p++) {
      if (p < 0) continue;
      try {
        const res = await fetchHtml(apiUrl, {
          referer: this.config.domain,
          cookie: userCookie,
          method: 'POST',
          body: new URLSearchParams({ t, c, p }).toString(),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        
        let responseData = res.html.trim();
        // Assume empty if response is very short (< 1000 bytes) 
        // A typical AES empty header is ~116 bytes. A real image base64 is hundreds of KB.
        if (responseData.length >= 1000) {
          actualL = Math.max(actualL, p + 1);
        }
      } catch (e) {
        console.error(`Error probing page ${p}:`, e);
      }
    }

    console.log(`[VietMessenger] Determined true page count: ${actualL} (reported ${initialL})`);

    const images = [];
    
    // Tạo fake url để DownloadManager xử lý và gọi custom download logic bên dưới
    for (let i = 0; i < actualL; i++) {
      images.push({
        imageUrl: `vietmessenger://comic/${t}/${c}/${i}`,
        ext: 'jpg', 
      });
    }

    return images;
  }

  /**
   * Custom referer cho image requests.
   */
  getReferer(payload) {
    return payload?.chapterUrl || payload?.mangaUrl || this.config.domain;
  }

  /**
   * Merge cookie vào image headers.
   */
  getImageHeaders(referer) {
    const headers = super.getImageHeaders(referer);
    return {
      ...headers,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };
  }

  /**
   * Override downloadImageWithRetry để bắt các link vietmessenger://comic/...
   * và gọi API getcomic.php để tải về từng trang rồi decrypt ra file ảnh thật.
   */
  async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts = 3, imageInfo = {}, shouldAbort) {
    if (imageUrl.startsWith('vietmessenger://comic/')) {
      return this._downloadComicPage(imageUrl, filePath, maxAttempts);
    }
    return super.downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts, imageInfo, shouldAbort);
  }

  async _downloadComicPage(fakeUrl, filePath, maxAttempts) {
    const parts = fakeUrl.split('/');
    const p = parts.pop();
    const c = parts.pop();
    const t = parts.pop();
    
    // Always try auto-login first if no cached cookie
    if (!this._cachedAutoCookie) {
      await this._autoLogin();
    }
    let userCookie = this._effectiveUserCookie();
    const apiUrl = new URL('/comics/getcomic.php', this.config.domain).href;
    
    let lastError = null;
    let autoLoginAttempted = false;
    const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetchHtml(apiUrl, {
          referer: this.config.domain,
          cookie: userCookie,
          method: 'POST',
          body: new URLSearchParams({ t, c, p }).toString(),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        // Unescape HTML entities that fetchHtml may have introduced
        let responseData = res.html.trim()
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
        
        if (responseData.toLowerCase().startsWith('<!doctype') || responseData.toLowerCase().startsWith('<html')) {
           if (autoLoginAttempted) {
               throw new Error('Cookie đã hết hạn và tự động đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản cung cấp!');
           }
           autoLoginAttempted = true;
           this._cachedAutoCookie = null;
           const newCookie = await this._autoLogin();
           if (newCookie) {
               userCookie = newCookie;
               attempt--;
               continue;
           } else {
               throw new Error('Cookie đã hết hạn và tự động đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản cung cấp!');
           }
        }
        
        let base64Data;
        let wasAesEncrypted = false;
        
        // Check if response is AES-encrypted JSON (new format: {"ct":...,"iv":...,"s":...})
        if (responseData.startsWith('{') && responseData.includes('"ct"')) {
          const CryptoJS = require('crypto-js');
          const AES_PASSPHRASE = 'VXJ6dj^@L';
          
          const CryptoJSAesJson = {
            parse: function(jsonStr) {
              const j = JSON.parse(jsonStr);
              const cipherParams = CryptoJS.lib.CipherParams.create({
                ciphertext: CryptoJS.enc.Base64.parse(j.ct)
              });
              if (j.iv) cipherParams.iv = CryptoJS.enc.Hex.parse(j.iv);
              if (j.s) cipherParams.salt = CryptoJS.enc.Hex.parse(j.s);
              return cipherParams;
            }
          };
          
          const decrypted = CryptoJS.AES.decrypt(responseData, AES_PASSPHRASE, { format: CryptoJSAesJson });
          let decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
          
          try {
             base64Data = JSON.parse(decryptedStr);
          } catch (e) {
             base64Data = decryptedStr;
          }
          
          if (!base64Data || base64Data.length < 100) {
            throw new Error('AES decrypt thất bại hoặc dữ liệu rỗng');
          }
          wasAesEncrypted = true;
        } else {
          // Old format: raw base64 response (tiles are scrambled)
          base64Data = responseData;
        }
        
        // Remove surrounding quotes if they exist (fallback)
        if (typeof base64Data === 'string' && base64Data.startsWith('"') && base64Data.endsWith('"')) {
          base64Data = base64Data.slice(1, -1);
        }
        
        // Remove data URI prefix
        if (typeof base64Data === 'string' && base64Data.startsWith('data:image/')) {
          base64Data = base64Data.replace(/^data:image\/\w+;base64,/, '');
        }
        
        if (base64Data.length > 100) {
          const fs = require('fs');
          const path = require('path');
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          
          const imgBuffer = Buffer.from(base64Data, 'base64');
          
          if (wasAesEncrypted) {
            // New AES format: image is already correct, just save directly
            fs.writeFileSync(filePath, imgBuffer);
          } else {
            // Old format: tiles are scrambled, need to unshuffle
            const Jimp = require('jimp');
            const src = await Jimp.read(imgBuffer);
            const width = src.bitmap.width;
            const height = src.bitmap.height;
            
            const colCount = 10;
            const numTiles = 120;
            const rowCount = 12;
            const cellW = Math.floor(width / colCount);
            const cellH = Math.floor(height / rowCount);
            
            let seed = 0;
            for (let i = 0; i < t.length; i++) seed += t.charCodeAt(i);
            for (let i = 0; i < String(p).length; i++) seed += String(p).charCodeAt(i);
            
            let s = seed;
            function random() {
              let x = Math.sin(s++) * 10000;
              return x - Math.floor(x);
            }
            
            let tiles = [];
            for (let i = 0; i < numTiles; i++) tiles.push(i);
            for (let i = numTiles - 1; i > 0; i--) {
              let j = Math.floor(random() * (i + 1));
              let temp = tiles[i];
              tiles[i] = tiles[j];
              tiles[j] = temp;
            }
            
            const dest = new Jimp(width, height);
            for (let srcIndex = 0; srcIndex < numTiles; srcIndex++) {
              const dstIndex = tiles[srcIndex];
              const srcCol = srcIndex % colCount;
              const srcRow = Math.floor(srcIndex / colCount);
              const dstCol = dstIndex % colCount;
              const dstRow = Math.floor(dstIndex / colCount);
              
              const tile = src.clone().crop(srcCol * cellW, srcRow * cellH, cellW, cellH);
              dest.composite(tile, dstCol * cellW, dstRow * cellH);
            }
            
            await dest.writeAsync(filePath);
          }
          
          const fileSize = fs.statSync(filePath).size;
          return { ok: true, fileSize };
        } else {
           throw new Error(`Ảnh rỗng hoặc lỗi từ server: ${base64Data}`);
        }
      } catch (e) {
        lastError = e;
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    
    return { ok: false, error: lastError?.message };
  }

  /**
   * Automatically login to get a new SESSION cookie using the provided credentials
   */
  async _autoLogin() {
    const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
    try {
      const loginUrl = new URL('/cgi-bin/getmember.cgi', this.config.domain).href;
      const res = await fetchHtml(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': new URL('/login/', this.config.domain).href,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: 'cm=login&memid=pinkvagreen1&pass=03091987&rem=1',
        includeSetCookie: true
      });
      
      if (res.ok && res.cookie && res.cookie.includes('SESSION=')) {
        // res.cookie is typically a joined string like "SESSION=xyz; other=abc"
        // We just need to extract the SESSION=... part
        const cookies = res.cookie.split(';');
        for (const cookieStr of cookies) {
           const trimmed = cookieStr.trim();
           if (trimmed.startsWith('SESSION=')) {
              this._cachedAutoCookie = trimmed;
              return trimmed;
           }
        }
      }
    } catch (e) {
      console.error('Auto login failed:', e);
    }
    return null;
  }

  _effectiveUserCookie() {
    if (this._cachedAutoCookie) return this._cachedAutoCookie;
    const siteConfig = global.configManager?.getSiteConfig?.(this.config.siteId);
    return siteConfig?.cookie || '';
  }

}

module.exports = new VietMessengerService();
