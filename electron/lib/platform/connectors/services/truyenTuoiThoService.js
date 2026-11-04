const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  resolveUrl,
  getImageSrcFromEl,
  getFileExt,
} = require('../../../download/connector/htmlConnectorUtils');
const dtveBookService = require('./dtveBookService');

/** Marks chapter pages that are a single Google Drive PDF (not raster images). */
const DOWNLOAD_KIND_GOOGLE_DRIVE_PDF = 'google_drive_pdf';

const SITE_DOMAIN = 'https://truyentuoitho.com/';
const SITE_LABEL = 'Truyen tuoi tho';

function parseChapterNumber(url_string) {
  const chapter_match = String(url_string || '').match(/\/tap-(\d+)\/?$/i);
  if (!chapter_match) return null;
  return parseInt(chapter_match[1], 10);
}

function buildChapterUrl(base_url, chapter_number) {
  const trimmed_base = String(base_url || '').replace(/\/+$/, '');
  return `${trimmed_base}/tap-${chapter_number}/`;
}

class TruyenTuoiThoService extends HtmlConnectorService {
  constructor() {
    super({
      domain: SITE_DOMAIN,
      label: SITE_LABEL,
      siteId: 'truyentuoitho',
      imageReferer: SITE_DOMAIN,
      selectors: {
        chapterLinks: '.listing-chapters_wrap .wp-manga-chapter a',
        title: '.post-title h1, .post-title h1.h1, h1',
        cover: '.summary_image img, .tab-summary .summary_image img, meta[property="og:image"]',
      },
    });
  }

  async load(url) {
    const trimmed_url = String(url || '').trim();
    if (!trimmed_url) {
      return { ok: false, error: 'URL trống.' };
    }

    const fetched_page = await fetchHtml(trimmed_url, { referer: SITE_DOMAIN });
    if (!fetched_page.ok) {
      return { ok: false, error: fetched_page.error || 'Không tải được trang truyện.' };
    }

    const html_data = fetched_page.html;
    const cheerio_doc = cheerio.load(html_data);

    const manga_title =
      cheerio_doc('.post-title h1').first().text().trim() ||
      cheerio_doc('h1').first().text().trim() ||
      cheerio_doc('title').first().text().replace(/\s*-\s*Truyen tuoi tho\s*$/i, '').trim();
    if (!manga_title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    const raw_cover =
      cheerio_doc('.summary_image img').attr('src') ||
      cheerio_doc('meta[property="og:image"]').attr('content') ||
      '';
    const cover_url = resolveUrl(trimmed_url, raw_cover);

    const chapter_list = await this.collectChapterList(cheerio_doc, trimmed_url);

    return {
      ok: true,
      manga: {
        title: manga_title,
        coverUrl: cover_url,
        mangaUrl: trimmed_url,
        mangaId: '',
        siteId: this.config.siteId,
        sourceLabel: this.config.label,
      },
      chapters: chapter_list,
    };
  }

  async collectChapterList(cheerio_doc, manga_url) {
    const chapter_list = [];
    const chapter_seen = new Set();
    const normalized_manga_url = String(manga_url || '').replace(/\/+$/, '');

    const chapter_link_selectors = [
      '.listing-chapters_wrap .wp-manga-chapter a',
      '#manga-chapters-holder .wp-manga-chapter a',
      '#manga-chapters-holder a',
    ];

    for (const selector_text of chapter_link_selectors) {
      cheerio_doc(selector_text).each((_, element_node) => {
        const node_ref = cheerio_doc(element_node);
        const raw_href = (node_ref.attr('href') || '').trim();
        const link_text = node_ref.text().trim();
        if (!raw_href) return;
        const chapter_url = resolveUrl(manga_url, raw_href);
        if (!chapter_url || chapter_seen.has(chapter_url)) return;
        if (!chapter_url.startsWith(`${normalized_manga_url}/`)) return;
        if (!/\/tap-\d+/i.test(chapter_url) && !/\/chuong-\d+/i.test(chapter_url)) return;
        chapter_seen.add(chapter_url);
        chapter_list.push({
          url: chapter_url,
          title: link_text || chapter_url,
        });
      });
      if (chapter_list.length > 0) break;
    }

    if (chapter_list.length > 0) {
      return chapter_list;
    }

    const first_href = (cheerio_doc('#btn-read-last').attr('href') || '').trim();
    const last_href = (cheerio_doc('#btn-read-first').attr('href') || '').trim();
    const first_url = resolveUrl(manga_url, first_href);
    const last_url = resolveUrl(manga_url, last_href);
    const first_number = parseChapterNumber(first_url);
    const last_number = parseChapterNumber(last_url);

    if (
      first_number &&
      last_number &&
      last_number >= first_number &&
      /\/tap-\d+\/?$/i.test(first_url) &&
      /\/tap-\d+\/?$/i.test(last_url)
    ) {
      for (let chapter_number = last_number; chapter_number >= first_number; chapter_number -= 1) {
        const chapter_url = buildChapterUrl(manga_url, chapter_number);
        chapter_list.push({
          url: chapter_url,
          title: `Tập ${chapter_number}`,
        });
      }
      return chapter_list;
    }

    if (last_url && first_url) {
      const navigated_chapters = await this.collectChaptersByNavigation(first_url, last_url, manga_url);
      if (navigated_chapters.length > 0) {
        return navigated_chapters;
      }
    }

    if (first_url) chapter_list.push({ url: first_url, title: 'Chương đầu' });
    if (last_url && last_url !== first_url) chapter_list.push({ url: last_url, title: 'Chương cuối' });
    return chapter_list;
  }

  async collectChaptersByNavigation(first_chapter_url, last_chapter_url, manga_url) {
    const chapter_list = [];
    const visited_urls = new Set();
    const normalized_manga_url = String(manga_url || '').replace(/\/+$/, '');
    const MAX_NAVIGATION_STEPS = 800;
    let current_chapter_url = String(first_chapter_url || '').trim();
    let step_number = 0;

    while (current_chapter_url && step_number < MAX_NAVIGATION_STEPS) {
      if (visited_urls.has(current_chapter_url)) break;
      if (!current_chapter_url.startsWith(`${normalized_manga_url}/`)) break;
      visited_urls.add(current_chapter_url);
      step_number += 1;

      const chapter_slug = current_chapter_url
        .replace(`${normalized_manga_url}/`, '')
        .replace(/\/+$/, '');
      chapter_list.push({
        url: current_chapter_url,
        title: chapter_slug || current_chapter_url,
      });

      if (current_chapter_url === last_chapter_url) break;

      const fetched_page = await fetchHtml(current_chapter_url, { referer: SITE_DOMAIN });
      if (!fetched_page.ok) break;
      const chapter_doc = cheerio.load(fetched_page.html);

      const next_chapter_selectors = [
        'a.next_page',
        '.nav-next a',
        '.chapter-nav-next a',
      ];

      let next_chapter_url = '';
      for (const selector_text of next_chapter_selectors) {
        const link_node = chapter_doc(selector_text).first();
        const raw_href = (link_node.attr('href') || '').trim();
        if (!raw_href) continue;
        const resolved_url = resolveUrl(current_chapter_url, raw_href);
        if (!resolved_url) continue;
        if (!resolved_url.startsWith(`${normalized_manga_url}/`)) continue;
        next_chapter_url = resolved_url;
        break;
      }

      if (!next_chapter_url || next_chapter_url === current_chapter_url) break;
      current_chapter_url = next_chapter_url;
    }

    if (chapter_list.length === 0) return [];
    if (last_chapter_url && chapter_list[chapter_list.length - 1].url !== last_chapter_url) return [];
    return chapter_list;
  }

  /**
   * Embedded Google Drive reader (iframe /file/d/{id}/preview) used instead of img tags.
   */
  collectGoogleDrivePdfEmbeds(cheerio_doc, chapter_url) {
    const pdf_list = [];
    const seen_ids = new Set();
    const iframe_selector =
      '.reading-content iframe[src*="drive.google.com"], .chapter-content iframe[src*="drive.google.com"]';

    cheerio_doc(iframe_selector).each((_, element_node) => {
      const raw_src = (cheerio_doc(element_node).attr('src') || '').trim();
      if (!raw_src) return;
      const iframe_url = resolveUrl(chapter_url, raw_src);
      const file_id = dtveBookService.extractGoogleDriveFileId(iframe_url);
      if (!file_id || seen_ids.has(file_id)) return;
      seen_ids.add(file_id);
      pdf_list.push({
        imageUrl: dtveBookService.buildGoogleDriveDownloadUrl(file_id),
        ext: 'pdf',
        downloadKind: DOWNLOAD_KIND_GOOGLE_DRIVE_PDF,
        googleDriveFileId: file_id,
      });
    });

    return pdf_list;
  }

  /**
   * Google Drive PDF export needs browser-like headers; optional virus-scan HTML hop.
   */
  async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts = 3, imageInfo = {}) {
    if (imageInfo.downloadKind === DOWNLOAD_KIND_GOOGLE_DRIVE_PDF) {
      const file_id =
        imageInfo.googleDriveFileId || dtveBookService.extractGoogleDriveFileId(String(imageUrl || ''));
      if (!file_id) {
        return { ok: false };
      }
      const initial_url = dtveBookService.buildGoogleDriveDownloadUrl(file_id);
      const fetch_headers = {
        'User-Agent': this.getUserAgent(),
        Referer: 'https://drive.google.com/',
        Accept: '*/*',
      };

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          let res = await fetch(initial_url, {
            headers: fetch_headers,
            redirect: 'follow',
          });
          if (!res.ok) {
            if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 1000));
            continue;
          }

          let content_type = String(res.headers.get('content-type') || '').toLowerCase();
          if (content_type.includes('text/html')) {
            const html_text = await res.text();
            if (dtveBookService.isGoogleDriveVirusScanPage(html_text)) {
              const confirm_url = dtveBookService.extractVirusScanConfirmUrl(html_text, file_id);
              if (!confirm_url) {
                if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 1000));
                continue;
              }
              res = await fetch(confirm_url, {
                headers: fetch_headers,
                redirect: 'follow',
              });
              if (!res.ok) {
                if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 1000));
                continue;
              }
              content_type = String(res.headers.get('content-type') || '').toLowerCase();
              if (content_type.includes('text/html')) {
                if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 1000));
                continue;
              }
            } else {
              if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 1000));
              continue;
            }
          }

          const file_buffer = Buffer.from(await res.arrayBuffer());
          if (!file_buffer.length) {
            if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, file_buffer);
          return { ok: true, fileSize: file_buffer.length };
        } catch {
          if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 1000));
        }
      }
      return { ok: false };
    }

    return super.downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts, imageInfo);
  }

  async fetchChapterImages(chapter_url, referer_url) {
    const fetched_page = await fetchHtml(chapter_url, { referer: referer_url || SITE_DOMAIN });
    if (!fetched_page.ok) {
      throw new Error(`Không tải được trang chương: ${fetched_page.error}`);
    }

    const cheerio_doc = cheerio.load(fetched_page.html);
    const image_list = [];
    const image_seen = new Set();

    const image_selectors = [
      '.reading-content .read-container img',
      '.reading-content img',
      '.chapter-content img',
      '.read-container img',
    ];

    for (const selector_text of image_selectors) {
      cheerio_doc(selector_text).each((_, element_node) => {
        const node_ref = cheerio_doc(element_node);
        const raw_source = getImageSrcFromEl(node_ref);
        if (!raw_source) return;
        const image_url = resolveUrl(chapter_url, raw_source);
        if (!image_url || image_seen.has(image_url)) return;
        const file_ext = getFileExt(image_url) || 'jpg';
        image_seen.add(image_url);
        image_list.push({ imageUrl: image_url, ext: file_ext });
      });
      if (image_list.length > 0) break;
    }

    if (image_list.length === 0) {
      const drive_pdf_list = this.collectGoogleDrivePdfEmbeds(cheerio_doc, chapter_url);
      if (drive_pdf_list.length > 0) {
        return drive_pdf_list;
      }
    }

    return image_list;
  }
}

const service_instance = new TruyenTuoiThoService();

function load(url, options) {
  return service_instance.load(url, options);
}

function downloadChapter(payload, connector) {
  return service_instance.downloadChapter(payload, connector || SITE_LABEL);
}

module.exports = {
  SITE_DOMAIN,
  SITE_LABEL,
  load,
  downloadChapter,
};
