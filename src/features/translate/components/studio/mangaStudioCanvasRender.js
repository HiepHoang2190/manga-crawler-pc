/**
 * mangaStudioCanvasRender.js
 * Các thuật toán tính toán hình học (geometry), bounding box và render trực tiếp
 * lên Canvas HTML5 cho MangaStudioEditor.
 */

import { DEFAULT_STUDIO_FONT } from './mangaStudioConstants';

let _measureCanvas = null;

/**
 * Tính toán font size tối ưu cho text nằm vừa vặn bên trong bounding box [boxWidth, boxHeight].
 * Tự động wrap text theo từ, hỗ trợ văn bản nhiều dòng (chia dòng tự nhiên),
 * và lặp tìm font size từ 44px xuống 9px sao cho text không bao giờ tràn ra ngoài khung.
 */
export function calculateOptimalFontSize(
  text,
  boxWidth,
  boxHeight,
  fontFamily = DEFAULT_STUDIO_FONT,
  fontWeight = '700',
  textTransform = 'uppercase',
  isOvalBubble = true
) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) return 14;
  const w = Number(boxWidth) || 100;
  const h = Number(boxHeight) || 60;
  if (w <= 20 || h <= 20) return 10;

  // Với bóng thoại Manga (hình oval/tròn):
  // Tính vùng an toàn nội tiếp hình ellipse để text nhiều dòng không bao giờ chạm/đè lên nét viền cong của bóng thoại.
  const padRatioX = isOvalBubble ? 0.15 : 0.08;
  const padRatioY = isOvalBubble ? 0.14 : 0.08;
  const padX = Math.max(4, Math.round(w * padRatioX));
  const padY = Math.max(4, Math.round(h * padRatioY));
  const maxW = Math.max(16, w - 2 * padX);
  const maxH = Math.max(16, h - 2 * padY);

  let ctx = null;
  if (typeof document !== 'undefined') {
    if (!_measureCanvas) {
      _measureCanvas = document.createElement('canvas');
    }
    ctx = _measureCanvas.getContext('2d');
  }

  const processedText = textTransform === 'none' ? text : text.toUpperCase();
  const paragraphs = processedText.trim().split(/\r?\n/);
  const MAX_FS = 44;
  const MIN_FS = 9;

  for (let fs = MAX_FS; fs >= MIN_FS; fs -= 1) {
    const lineHeight = fs * 1.25;
    let totalLines = 0;
    let fits = true;

    if (ctx) {
      ctx.font = `${fontWeight || '700'} ${fs}px ${fontFamily || 'sans-serif'}`;
      const spaceW = ctx.measureText(' ').width;

      for (const para of paragraphs) {
        const words = para.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
          totalLines += 1;
          continue;
        }

        let currentLineW = 0;
        for (let i = 0; i < words.length; i++) {
          const wordW = ctx.measureText(words[i]).width;
          if (wordW > maxW) {
            fits = false;
            break;
          }
          if (currentLineW === 0) {
            currentLineW = wordW;
            totalLines += 1;
          } else if (currentLineW + spaceW + wordW <= maxW) {
            currentLineW += spaceW + wordW;
          } else {
            currentLineW = wordW;
            totalLines += 1;
          }
        }
        if (!fits) break;
      }
    } else {
      const charW = fs * 0.55;
      const maxChars = Math.max(1, Math.floor(maxW / charW));

      for (const para of paragraphs) {
        const words = para.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
          totalLines += 1;
          continue;
        }

        let currentChars = 0;
        for (const word of words) {
          if (word.length > maxChars) {
            fits = false;
            break;
          }
          if (currentChars === 0) {
            currentChars = word.length;
            totalLines += 1;
          } else if (currentChars + 1 + word.length <= maxChars) {
            currentChars += 1 + word.length;
          } else {
            currentChars = word.length;
            totalLines += 1;
          }
        }
        if (!fits) break;
      }
    }

    if (!fits) continue;

    const totalTextH = totalLines * lineHeight;
    if (totalTextH <= maxH) {
      return fs;
    }
  }

  return MIN_FS;
}

/**
 * Tự động tính toán khung chat text (textBbox) nội tiếp bên trong bong bóng thoại (bbox) chuẩn Koharu.
 * - Khung text chiếm khoảng ~58% bề rộng và ~76% chiều cao bóng thoại.
 * - Căn giữa đối xứng trong lòng bóng thoại oval, giúp text ngắt dòng thanh thoát 1-2 từ/dòng.
 */
export function computeOptimalTextBox(bbox, explicitTextBbox, hasBubble = true, isCustom = false) {
  const [bx, by, bw, bh] = Array.isArray(bbox) && bbox.length === 4 ? bbox : [0, 0, 100, 100];
  if (!hasBubble) {
    if (Array.isArray(explicitTextBbox) && explicitTextBbox.length === 4) {
      return [...explicitTextBbox];
    }
    return [bx, by, bw, bh];
  }

  // Nếu user đã tự căn chỉnh (isCustom) hoặc explicitTextBbox hợp lệ và khác với bubble bbox
  if (
    Array.isArray(explicitTextBbox) &&
    explicitTextBbox.length === 4 &&
    explicitTextBbox[2] > 10 &&
    explicitTextBbox[3] > 10 &&
    (isCustom || (Math.abs(explicitTextBbox[2] - bw) > 4 || Math.abs(explicitTextBbox[3] - bh) > 4))
  ) {
    return [...explicitTextBbox];
  }

  // Tỷ lệ vàng khung chat text chuẩn manga Koharu
  const tw = Math.max(20, Math.round(bw * 0.58));
  const th = Math.max(24, Math.round(bh * 0.76));
  const tx = Math.round(bx + (bw - tw) / 2);
  const ty = Math.round(by + (bh - th) / 2);
  return [tx, ty, tw, th];
}

export function normalizePages(rawPages) {
  return (rawPages || []).map((p, idx) => {
    let layers = [];
    if (Array.isArray(p.layers) && p.layers.length > 0) {
      layers = p.layers.map((l) => ({
        ...l,
        textBbox: computeOptimalTextBox(l.bbox, l.textBbox, l.hasBubble !== false, l.isCustomTextBox),
      }));
    } else {
      layers = (p.translations || []).map((t, lIdx) => {
        const sourceText = t.sourceText || t.originalText || t.rawText || '';
        const text = t.text || t.translatedText || '';
        const bbox = Array.isArray(t.bbox) ? [...t.bbox] : [100, 100, 200, 150];
        const hasBubble = t.hasBubble !== false;
        const textBbox = computeOptimalTextBox(bbox, t.textBbox, hasBubble, t.isCustomTextBox);
        return {
          id: `layer-${idx}-${lIdx}-${Date.now()}`,
          type: 'dialogue',
          sourceText,
          text,
          bbox,
          textBbox,
          fontFamily: t.fontFamily || DEFAULT_STUDIO_FONT,
          fontSize: t.fontSize || 'auto',
          fontWeight: t.fontWeight || '700',
          fontStyle: t.fontStyle || 'normal',
          color: t.color || '#000000',
          strokeColor: t.strokeColor || '#ffffff',
          strokeWidth: typeof t.strokeWidth === 'number' ? t.strokeWidth : 1.5,
          align: t.align || 'center',
          direction: t.direction || 'auto',
          textTransform: t.textTransform || 'uppercase',
          hasBubble,
          fillBackground: Boolean(t.fillBackground === true),
          visible: t.visible !== false,
          opacity: t.opacity ?? 1,
          isTranslated: t.isTranslated !== false,
        };
      });
    }

    const pageIndex = typeof p.index === 'number' ? p.index : idx;
    return {
      id: p.id || `page-${pageIndex}`,
      index: pageIndex,
      imagePath: p.imagePath || p.path || '',
      savedPath: p.savedPath || '',
      filename: p.filename || (p.imagePath ? p.imagePath.split(/[/\\]/).pop() : `Page ${pageIndex + 1}`),
      cleanDataUrl: p.cleanDataUrl || null,
      dataUrl: p.originalDataUrl || p.dataUrl || p.cleanDataUrl || p.translatedImageDataUrl || null,
      originalDataUrl: p.originalDataUrl || p.dataUrl || null,
      translatedImageDataUrl: p.translatedImageDataUrl || null,
      width: (typeof p.width === 'number' && p.width > 100) ? p.width : (p.naturalWidth || 0),
      height: (typeof p.height === 'number' && p.height > 100) ? p.height : (p.naturalHeight || 0),
      layers,
    };
  });
}

/** Tải dataUrl và kích thước thực (naturalWidth, naturalHeight) của file ảnh */
export async function loadPageImageData(filePath, api) {
  if (!filePath) return { dataUrl: null, width: 0, height: 0 };
  if (filePath.startsWith('data:') || filePath.startsWith('blob:')) {
    try {
      const dims = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 1200 });
        img.onerror = () => resolve({ width: 800, height: 1200 });
        img.src = filePath;
      });
      return { dataUrl: filePath, width: dims.width, height: dims.height };
    } catch {
      return { dataUrl: filePath, width: 800, height: 1200 };
    }
  }
  if (api?.translateReadImageDataUrl) {
    try {
      const res = await api.translateReadImageDataUrl(filePath);
      if (res?.ok && res.dataUrl) {
        const dims = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 1200 });
          img.onerror = () => resolve({ width: 800, height: 1200 });
          img.src = res.dataUrl;
        });
        return { dataUrl: res.dataUrl, width: dims.width, height: dims.height };
      }
    } catch (err) {
      console.warn('[MangaStudioEditor] Failed to load image data for:', filePath, err);
    }
  }
  return { dataUrl: null, width: 0, height: 0 };
}

/**
 * Render một trang manga hoàn chỉnh (Ảnh nền + Mặt nạ bóng thoại + Typography)
 * trực tiếp qua HTML5 Canvas của Chromium ở độ phân giải gốc 100% (WYSIWYG).
 */
export async function renderPageToDataUrl(page, options = {}, api = null) {
  if (!page) throw new Error('No page data to render');

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }

  const useClean = options.showCleanupLayer !== false && Boolean(page.cleanDataUrl);
  let imageSrc = useClean
    ? page.cleanDataUrl
    : (page.originalDataUrl || page.dataUrl || page.translatedImageDataUrl || page.cleanDataUrl);
  if (!imageSrc && page.imagePath && api?.translateReadImageDataUrl) {
    try {
      const res = await api.translateReadImageDataUrl(page.imagePath);
      if (res?.ok && res.dataUrl) {
        imageSrc = res.dataUrl;
      }
    } catch (e) {
      console.warn('[renderPageToDataUrl] Failed to read image via API:', e);
    }
  }
  if (!imageSrc && page.imagePath) {
    imageSrc = `file://${page.imagePath}`;
  }

  if (!imageSrc) throw new Error(`Image source not found for page: ${page.filename || page.id}`);

  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = (err) => reject(new Error('Failed to load image for export: ' + (err?.message || 'unknown')));
    el.src = imageSrc;
  });

  const realW = img.naturalWidth || page.width || 1200;
  const realH = img.naturalHeight || page.height || 1600;

  const canvas = document.createElement('canvas');
  canvas.width = realW;
  canvas.height = realH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to initialize 2D Canvas context');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(img, 0, 0, realW, realH);

  const fillBg = options.fillBackground === true;
  const pageLayers = Array.isArray(page.layers) ? page.layers : [];

  for (let idx = 0; idx < pageLayers.length; idx++) {
    const layer = pageLayers[idx];
    if (layer.visible === false) continue;

    const rawBbox = Array.isArray(layer.bbox) && layer.bbox.length === 4 ? layer.bbox : [0, 0, 100, 100];
    const bubbleX = Math.max(0, Math.round(Number(rawBbox[0]) || 0));
    const bubbleY = Math.max(0, Math.round(Number(rawBbox[1]) || 0));
    const bubbleW = Math.max(10, Math.round(Number(rawBbox[2]) || 100));
    const bubbleH = Math.max(10, Math.round(Number(rawBbox[3]) || 100));

    if (layer.fillBackground === true || (fillBg && layer.fillBackground !== false)) {
      const isOval = layer.hasBubble !== false && (layer.type === 'dialogue' || !layer.type);
      const inset = Math.max(2, Math.round(Math.min(bubbleW, bubbleH) * 0.035));
      const r = isOval ? Math.round(Math.min(bubbleW, bubbleH) * 0.40) : Math.round(Math.min(bubbleW, bubbleH) * 0.12);

      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(bubbleX + inset, bubbleY + inset, Math.max(4, bubbleW - 2 * inset), Math.max(4, bubbleH - 2 * inset), Math.max(2, r - inset));
      } else {
        ctx.rect(bubbleX + inset, bubbleY + inset, Math.max(4, bubbleW - 2 * inset), Math.max(4, bubbleH - 2 * inset));
      }
      ctx.fillStyle = layer.backgroundColor || '#ffffff';
      ctx.globalAlpha = layer.backgroundOpacity ?? 0.98;
      ctx.fill();
      ctx.restore();
    }

    const rawText = String(layer.text || '');
    if (!rawText.trim()) continue;

    const activeTextBbox = computeOptimalTextBox(rawBbox, layer.textBbox, layer.hasBubble !== false, layer.isCustomTextBox);
    const x = Math.max(0, Math.round(Number(activeTextBbox[0]) || 0));
    const y = Math.max(0, Math.round(Number(activeTextBbox[1]) || 0));
    const w = Math.max(10, Math.round(Number(activeTextBbox[2]) || 100));
    const h = Math.max(10, Math.round(Number(activeTextBbox[3]) || 100));

    const shouldUppercase = layer.textTransform !== 'none';
    const text = shouldUppercase ? rawText.toUpperCase() : rawText;

    const fontFamily = layer.fontFamily || DEFAULT_STUDIO_FONT;
    const fontWeight = layer.fontWeight || '700';
    const fontStyle = layer.fontStyle || 'normal';

    let fs = 14;
    if (layer.fontSize === 'auto' || !layer.fontSize) {
      fs = calculateOptimalFontSize(
        layer.text,
        w,
        h,
        fontFamily,
        fontWeight,
        layer.textTransform || 'uppercase',
        false
      );
    } else {
      fs = Number(layer.fontSize) || 14;
    }
    fs = Math.max(8, fs);

    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1;
    ctx.font = `${fontStyle} ${fontWeight} ${fs}px ${fontFamily}`;

    const padX = Math.max(2, Math.round(w * 0.04));
    const padY = Math.max(2, Math.round(h * 0.04));
    const maxW = Math.max(12, w - 2 * padX);
    const maxH = Math.max(12, h - 2 * padY);

    const paragraphs = text.split(/\r?\n/);
    const lines = [];
    const spaceW = ctx.measureText(' ').width;

    for (const para of paragraphs) {
      const words = para.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        lines.push('');
        continue;
      }
      let curLine = '';
      let curLineW = 0;

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordW = ctx.measureText(word).width;

        if (wordW > maxW) {
          if (curLine) {
            lines.push(curLine);
            curLine = '';
            curLineW = 0;
          }
          let rem = word;
          while (rem.length > 0) {
            let chunk = '';
            while (rem.length > 0 && ctx.measureText(chunk + rem[0]).width <= maxW) {
              chunk += rem[0];
              rem = rem.slice(1);
            }
            if (chunk) {
              lines.push(chunk);
            } else {
              lines.push(rem[0]);
              rem = rem.slice(1);
            }
          }
          continue;
        }

        if (!curLine) {
          curLine = word;
          curLineW = wordW;
        } else if (curLineW + spaceW + wordW <= maxW) {
          curLine += ' ' + word;
          curLineW += spaceW + wordW;
        } else {
          lines.push(curLine);
          curLine = word;
          curLineW = wordW;
        }
      }
      if (curLine) lines.push(curLine);
    }

    if (lines.length === 0) {
      ctx.restore();
      continue;
    }

    const lineHeight = fs * 1.2;
    const totalTextH = lines.length * lineHeight;
    const blockTop = y + (h - totalTextH) / 2;

    const align = layer.align || 'center';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const anchorX = align === 'left' ? x + padX : align === 'right' ? x + w - padX : x + w / 2;

    const strokeWidth = Number(layer.strokeWidth) || 0;
    if (strokeWidth > 0) {
      ctx.strokeStyle = layer.strokeColor || '#ffffff';
      ctx.lineWidth = strokeWidth * 2;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) {
          ctx.strokeText(lines[i], anchorX, blockTop + i * lineHeight + lineHeight / 2);
        }
      }
    }

    ctx.fillStyle = layer.color || '#000000';
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) {
        ctx.fillText(lines[i], anchorX, blockTop + i * lineHeight + lineHeight / 2);
      }
    }

    ctx.restore();
  }

  const ext = (page.imagePath ? page.imagePath.split('.').pop() : 'png').toLowerCase();
  const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
  const quality = options.quality ? options.quality / 100 : 0.92;
  const dataUrl = canvas.toDataURL(mime, quality);

  return { dataUrl, width: realW, height: realH };
}

