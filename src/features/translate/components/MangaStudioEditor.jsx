import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import { ResizeSplitter, SearchableSelect } from '../../../shared';
import TranslateSettingsPanel, { TranslateGuideModal } from '../TranslateSettingsPanel';
import { PREDEFINED_LOCAL_MODEL_META } from '../constants/providerModelGuides';

/**
 * MangaStudioEditor — Bộ biên tập Layer Manga & Typesetting chuyên nghiệp
 * Thiết kế Full Màn hình (Full App Screen Portal) chuẩn phong cách Koharu:
 * - Header thanh menu Window: Logo 🌸, Menu (File, Edit, Process, View, Help), Breadcrumb trang, Model Pill, Nút Run.
 * - Cột bên trái: Danh sách Pages với thẻ thumbnail, số lượng layer, độ phân giải và bộ lọc Filter pages.
 * - Khung Canvas giữa: Bảng công cụ nổi 7 icon (Pointer, Text, Brush, Frame, Pipette, Magic AI, Hand), Zoom slider, Kích thước thật.
 * - Cột bên phải: Tabs Properties & Agent. Bảng Type Inspector (Font, Color Swatch, Size, Weight, Alignment 3 nút hồng, Border Stroke, Textarea) và bảng Layers (Opacity, Eye toggle, Lock artwork).
 */

const DEFAULT_STUDIO_FONT = '"CC Wild Words", CCWILDWORDS, CCwildwords, "Adobe 黑体 Std", "Adobe Heiti Std", "SVN-CCWildWords", "HL Comic", "Patrick Hand SC", "Shantell Sans", "Playpen Sans", "Comic Neue", cursive, sans-serif';

const FONT_OPTIONS = [
  { value: DEFAULT_STUDIO_FONT, label: 'CC Wild Words (Standard Comic)', i18nKey: 'translate.studio.fontWildWords', matches: (f) => !f || f === 'Manga' || f === 'default' || /CC\s*Wild\s*Words|CCWILDWORDS|SVN-CCWildWords/i.test(f) },
  { value: '"Adobe 黑体 Std", "Adobe Heiti Std", "SimHei", sans-serif', label: 'Adobe 黑体 Std (Heiti Manga)', matches: (f) => /Adobe\s*黑体|Adobe\s*Heiti/i.test(f) },
  { value: '"Patrick Hand SC", "SVN-CCWildWords", cursive, sans-serif', label: 'Patrick Hand SC (Small Caps Manga)', matches: (f) => /Patrick\s*Hand\s*SC/i.test(f) },
  { value: '"Shantell Sans", cursive, sans-serif', label: 'Shantell Sans (Arrow Comic Bubble)', matches: (f) => /Shantell\s*Sans/i.test(f) },
  { value: '"Playpen Sans", cursive, sans-serif', label: 'Playpen Sans (Natural Dialogue)', i18nKey: 'translate.studio.fontPlaypen', matches: (f) => /Playpen\s*Sans/i.test(f) },
  { value: '"SVN-Anime Ace 2.0 BB", "Anime Ace", Bangers, "Comic Sans MS", cursive, sans-serif', label: 'Anime Ace (Traditional / Manga)', i18nKey: 'translate.studio.fontAnimeAce', matches: (f) => /Anime\s*Ace/i.test(f) },
  { value: '"Patrick Hand", "SVN-Ames", cursive, sans-serif', label: 'Patrick Hand (Handwriting / Thoughts)', i18nKey: 'translate.studio.fontPatrickHand', matches: (f) => /Patrick\s*Hand(?!.*SC)/i.test(f) },
  { value: '"SVN-Digital Strip", "Digital Strip", "Be Vietnam Pro", sans-serif', label: 'Digital Strip (Narration)', i18nKey: 'translate.studio.fontDigitalStrip', matches: (f) => /Digital\s*Strip/i.test(f) },
  { value: '"Be Vietnam Pro", "Segoe UI", Roboto, sans-serif', label: 'Be Vietnam Pro (Modern Text)', i18nKey: 'translate.studio.fontBeVietnam', matches: (f) => /Be\s*Vietnam\s*Pro/i.test(f) },
  { value: 'Bangers, Impact, cursive, sans-serif', label: 'Bangers / SFX (Shaking Sound Effect)', i18nKey: 'translate.studio.fontBangers', matches: (f) => /Bangers/i.test(f) },
  { value: 'Arial, "Segoe UI", "Noto Sans", sans-serif', label: 'Arial / System', i18nKey: 'translate.studio.fontArial', matches: (f) => /Arial/i.test(f) },
];

const FONT_SIZE_NUMBERS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48];

const BASE_FONT_SIZE_OPTIONS = [
  { value: 'auto', label: 'Auto', icon: 'magic_button' },
  ...FONT_SIZE_NUMBERS.map((s) => ({ value: String(s), label: `${s}px` })),
];

const FONT_WEIGHT_OPTIONS = [
  { value: '300', label: '300 (Light)' },
  { value: '400', label: '400 (Regular)' },
  { value: '600', label: '600 (SemiBold)' },
  { value: '700', label: '700 (Bold)' },
  { value: '900', label: '900 (Black)' },
];

const FONT_STYLE_OPTIONS = [
  { value: 'normal', label: 'Regular', icon: 'format_clear' },
  { value: 'italic', label: 'Italic', icon: 'format_italic' },
];

const TEXT_DIRECTION_OPTIONS = [
  { value: 'auto', label: 'Auto', icon: 'magic_button' },
  { value: 'horizontal', label: 'Horizontal', icon: 'arrow_right_alt' },
  { value: 'vertical', label: 'Vertical', icon: 'arrow_downward' },
];

function resolveFontOptionValue(fontFamily) {
  if (!fontFamily || fontFamily === 'Manga' || fontFamily === 'default') {
    return DEFAULT_STUDIO_FONT;
  }
  const exact = FONT_OPTIONS.find((f) => f.value === fontFamily);
  if (exact) return exact.value;
  const matched = FONT_OPTIONS.find((opt) => opt.matches?.(fontFamily));
  if (matched) return matched.value;
  return DEFAULT_STUDIO_FONT;
}

const QUICK_COLORS = [
  '#000000',
  '#ffffff',
  '#b3261e',
  '#1976d2',
  '#388e3c',
  '#f57c00',
  '#7b1fa2',
];

/**
 * Tính toán font size tối ưu cho text nằm vừa vặn bên trong bounding box [boxWidth, boxHeight].
 * Tự động wrap text theo từ, hỗ trợ văn bản nhiều dòng (chia dòng tự nhiên),
 * và lặp tìm font size từ 44px xuống 9px sao cho text không bao giờ tràn ra ngoài khung.
 */
let _measureCanvas = null;
function calculateOptimalFontSize(text, boxWidth, boxHeight, fontFamily = DEFAULT_STUDIO_FONT, fontWeight = '700', textTransform = 'uppercase', isOvalBubble = true) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) return 14;
  const w = Number(boxWidth) || 100;
  const h = Number(boxHeight) || 60;
  if (w <= 20 || h <= 20) return 10;

  // Với bóng thoại Manga (hình oval/tròn):
  // Tính vùng an toàn nội tiếp hình ellipse để text nhiều dòng không bao giờ chạm/đè lên nét viền cong của bóng thoại.
  // Diện tích chữ nhật nội tiếp hình elip: W_in = W * 0.707 (padding ~15% mỗi bên), H_in = H * 0.707 (padding ~14% trên dưới).
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
function computeOptimalTextBox(bbox, explicitTextBbox, hasBubble = true, isCustom = false) {
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

function normalizePages(rawPages) {
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
          // Chuẩn Koharu: text layer không tô đè hộp trắng lên viền khung gốc
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
async function loadPageImageData(filePath, api) {
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
    } catch (e) {
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
 * Đảm bảo file xuất ra giống 100% từng pixel so với những gì hiển thị trên màn hình Preview!
 */
async function renderPageToDataUrl(page, options = {}, api = null) {
  if (!page) throw new Error('No page data to render');

  // Đảm bảo toàn bộ font Google (Playpen Sans, Shantell Sans, ...) đã nạp đầy đủ vào Chromium
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch (e) {
      // ignore
    }
  }

  // 1. Tải ảnh nguồn (chuẩn Koharu: ưu tiên ảnh đã inpaint/tẩy sạch KHI có cleanDataUrl và showCleanupLayer bật)
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

  // Đợi ảnh nạp xong
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = (err) => reject(new Error('Failed to load image for export: ' + (err?.message || 'unknown')));
    el.src = imageSrc;
  });

  const realW = img.naturalWidth || page.width || 1200;
  const realH = img.naturalHeight || page.height || 1600;

  // Tạo Canvas ngầm ở kích thước gốc 1:1
  const canvas = document.createElement('canvas');
  canvas.width = realW;
  canvas.height = realH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to initialize 2D Canvas context');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 2. Vẽ ảnh nền
  ctx.drawImage(img, 0, 0, realW, realH);

  const fillBg = options.fillBackground === true;
  const pageLayers = Array.isArray(page.layers) ? page.layers : [];

  // 3. Lần lượt vẽ từng Layer thoại lên Canvas
  for (let idx = 0; idx < pageLayers.length; idx++) {
    const layer = pageLayers[idx];
    if (layer.visible === false) continue;

    // Lấy tọa độ bong bóng thoại (bubble bbox) và khung chat text (textBbox)
    const rawBbox = Array.isArray(layer.bbox) && layer.bbox.length === 4 ? layer.bbox : [0, 0, 100, 100];
    const bubbleX = Math.max(0, Math.round(Number(rawBbox[0]) || 0));
    const bubbleY = Math.max(0, Math.round(Number(rawBbox[1]) || 0));
    const bubbleW = Math.max(10, Math.round(Number(rawBbox[2]) || 100));
    const bubbleH = Math.max(10, Math.round(Number(rawBbox[3]) || 100));

    // A. Vẽ Speech Bubble Mask nếu bật fillBackground (che trọn vẹn trong lòng bong bóng)
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

    // B. Vẽ Typography Text vào khung chat text (textBbox) nội tiếp
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
        false // Rectangular text box standard
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

    // Căn giữa theo chiều dọc chuẩn xác như Flexbox CSS
    const lineHeight = fs * 1.2;
    const totalTextH = lines.length * lineHeight;
    const blockTop = y + (h - totalTextH) / 2;

    // Căn theo chiều ngang
    const align = layer.align || 'center';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const anchorX = align === 'left' ? x + padX : align === 'right' ? x + w - padX : x + w / 2;

    // Vẽ viền chữ (stroke) nếu có
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

    // Vẽ thân chữ (fill)
    ctx.fillStyle = layer.color || '#000000';
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) {
        ctx.fillText(lines[i], anchorX, blockTop + i * lineHeight + lineHeight / 2);
      }
    }

    ctx.restore();
  }

  // 4. Xuất ra Data URL
  const ext = (page.imagePath ? page.imagePath.split('.').pop() : 'png').toLowerCase();
  const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
  const quality = options.quality ? options.quality / 100 : 0.92;
  const dataUrl = canvas.toDataURL(mime, quality);

  return { dataUrl, width: realW, height: realH };
}

const EMPTY_INITIAL_PAGES = [];

function MangaStudioEditor({
  initialPages = EMPTY_INITIAL_PAGES,
  chapterTitle = 'Manga Chapter',
  onClose,
  onUpdatePages,
  onSavePage,
  onSaveChapter,
  settings: propSettings,
  onUpdateSetting,
  localEngines,
  isLocalEngineOnline = false,
  activeEngineLabel = 'Ollama (port 11434)',
  onRunTranslate,
  onImportSource,
  isStandaloneView = false,
  selectedDir: propSelectedDir = '',
  onRunningChange,
}) {
  const { t } = useI18n();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  // Local settings state (tự động fetch hoặc đồng bộ từ prop)
  const [localSettings, setLocalSettings] = useState(propSettings || null);
  const settings = propSettings || localSettings;

  useEffect(() => {
    if (!api) return;
    const syncSettings = () => {
      api.translateGetSettings?.()?.then((s) => {
        if (s) setLocalSettings(s);
      });
    };
    if (!propSettings) syncSettings();

    const handleSettingsUpdated = (e) => {
      if (e.detail) {
        setLocalSettings((prev) => ({ ...(prev || {}), ...e.detail }));
      }
    };
    window.addEventListener('translate:settingsUpdated', handleSettingsUpdated);
    return () => window.removeEventListener('translate:settingsUpdated', handleSettingsUpdated);
  }, [api, propSettings]);

  // Settings updater helper (đồng bộ local + lưu IPC + notify parent)
  const handleUpdateSetting = useCallback((partial) => {
    setLocalSettings((prev) => {
      const next = { ...(prev || {}), ...partial };
      api?.translateSaveSettings?.(next);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('translate:settingsUpdated', { detail: next }));
      }
      return next;
    });
    onUpdateSetting?.(partial);
  }, [api, onUpdateSetting]);

  // Live execution logs
  const [logs, setLogs] = useState([]);
  const addLog = useCallback((step, detail, type = 'info', extra = {}) => {
    if (!detail) return;
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    setLogs((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].detail === detail) return prev;
      return [...prev.slice(-199), { id: `${Date.now()}-${Math.random()}`, time: timeStr, step: step || 'info', detail, type, ...extra }];
    });
  }, []);

  // Local LLM engine auto-discovery
  const [detectedEngines, setDetectedEngines] = useState(localEngines || null);

  useEffect(() => {
    if (localEngines) setDetectedEngines(localEngines);
  }, [localEngines]);

  const refreshLocalEngines = useCallback(() => {
    if (!api?.translateDetectLocalEngines) return;
    api.translateDetectLocalEngines().then((res) => {
      if (res) setDetectedEngines(res);
    });
  }, [api]);

  useEffect(() => {
    refreshLocalEngines();
  }, [refreshLocalEngines]);

  // Provider & Model resolution (hỗ trợ DeepL, Gemini, OpenAI & Local Models)
  const rawProvider = settings?.translationProvider || 'gemini';
  const activeProvider = rawProvider === 'google' ? 'gemini' : rawProvider;
  const currentModelId = settings?.activeModel || settings?.apiKeys?.openaiCompatible?.model || 'qwen2.5:7b';

  // Check if a model is installed locally in Ollama / LM Studio / Koharu Cache
  const isModelInstalled = useCallback((modelId) => {
    if (!modelId) return false;
    const engines = detectedEngines || localEngines;
    if (!engines) return false;
    const allModels = [
      ...(engines.ollama?.models || []),
      ...(engines.lmstudio?.models || []),
      ...(engines.detectedModels || []),
    ];
    const target = modelId.toLowerCase().trim();
    return allModels.some((m) => {
      const mid = (m.id || m.name || '').toLowerCase().trim();
      return mid === target || mid.startsWith(target) || target.startsWith(mid);
    });
  }, [detectedEngines, localEngines]);

  const displayLocalModelName = useMemo(() => {
    if (!currentModelId) return 'Local AI';
    if (currentModelId.includes('qwen2.5:7b')) return 'Qwen 2.5 7B Instruct';
    if (currentModelId.includes('qwen2.5:1.5b')) return 'Qwen 2.5 1.5B Instruct';
    if (currentModelId.includes('qwen') && currentModelId.includes('14b')) return 'Qwen 2.5 14B';
    if (currentModelId.includes('gemma4') || currentModelId.includes('gemma-4')) return 'Gemma 4 12B Instruct';
    if (currentModelId.includes('gemma2') || currentModelId.includes('gemma-2')) return 'Gemma 2 9B Instruct';
    return currentModelId;
  }, [currentModelId]);

  const isLocalOnline = Boolean(
    isLocalEngineOnline ||
    localEngines?.ollama?.online ||
    detectedEngines?.ollama?.online ||
    localEngines?.lmstudio?.online ||
    detectedEngines?.lmstudio?.online
  );

  const activeProviderInfo = useMemo(() => {
    const pConfig = settings?.providers?.[activeProvider];
    const pCred = pConfig?.credential?.trim() || settings?.apiKeys?.[activeProvider]?.trim() || '';
    const hasKey = Boolean(pCred);

    switch (activeProvider) {
      case 'deepl': {
        const deeplKey = pCred || settings?.apiKeys?.deepl?.trim() || '';
        const hasDeeplKey = Boolean(deeplKey);
        return {
          id: 'deepl',
          name: 'DeepL Translation',
          shortName: 'DeepL API',
          icon: '🌐',
          badge: hasDeeplKey ? 'DeepL' : t('translate.studio.badgeMissingKey'),
          status: hasDeeplKey ? 'online' : 'warning',
          statusText: hasDeeplKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasDeeplKey,
          isLocal: false,
        };
      }
      case 'openai': {
        return {
          id: 'openai',
          name: 'OpenAI (GPT-4o / 4o-mini)',
          shortName: 'OpenAI GPT-4o',
          icon: '⚡',
          badge: hasKey ? 'OpenAI' : t('translate.studio.badgeMissingKey'),
          status: hasKey ? 'online' : 'warning',
          statusText: hasKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasKey,
          isLocal: false,
        };
      }
      case 'claude': {
        return {
          id: 'claude',
          name: 'Anthropic Claude (3.5 Sonnet)',
          shortName: 'Claude 3.5',
          icon: '🧠',
          badge: hasKey ? 'Claude' : t('translate.studio.badgeMissingKey'),
          status: hasKey ? 'online' : 'warning',
          statusText: hasKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasKey,
          isLocal: false,
        };
      }
      case 'deepseek': {
        return {
          id: 'deepseek',
          name: 'DeepSeek (V3 / R1)',
          shortName: 'DeepSeek',
          icon: '🐳',
          badge: hasKey ? 'DeepSeek' : t('translate.studio.badgeMissingKey'),
          status: hasKey ? 'online' : 'warning',
          statusText: hasKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasKey,
          isLocal: false,
        };
      }
      case 'openrouter': {
        return {
          id: 'openrouter',
          name: 'OpenRouter AI',
          shortName: 'OpenRouter',
          icon: '🔀',
          badge: hasKey ? 'Router' : t('translate.studio.badgeMissingKey'),
          status: hasKey ? 'online' : 'warning',
          statusText: hasKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasKey,
          isLocal: false,
        };
      }
      case 'ollama':
      case 'lmstudio':
      case 'openai_compatible': {
        const isInstalled = isModelInstalled(currentModelId);
        const isReady = isLocalOnline && isInstalled;
        let status = 'offline';
        let statusText = 'Offline';
        if (isLocalOnline) {
          if (isInstalled) {
            status = 'online';
            statusText = t('translate.studio.statusReady');
          } else {
            status = 'warning';
            statusText = t('translate.studio.statusNotDownloaded');
          }
        }
        return {
          id: activeProvider,
          name: displayLocalModelName,
          shortName: displayLocalModelName.split(' ')[0] + ' ' + (displayLocalModelName.split(' ')[1] || ''),
          icon: '🤖',
          badge: isReady ? 'Local AI' : (isLocalOnline ? t('translate.studio.statusNotDownloaded') : t('translate.studio.statusOffline')),
          status,
          statusText,
          isReady,
          isLocal: true,
        };
      }
      case 'gemini': {
        const geminiKey = pCred || settings?.apiKeys?.gemini?.trim() || '';
        const hasGeminiKey = Boolean(geminiKey);
        return {
          id: 'gemini',
          name: 'Google Gemini',
          shortName: 'Gemini',
          icon: '✨',
          badge: hasGeminiKey ? t('translate.studio.badgeRecommended') : t('translate.studio.badgeMissingKey'),
          status: hasGeminiKey ? 'online' : 'warning',
          statusText: hasGeminiKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasGeminiKey,
          isLocal: false,
        };
      }
      default: {
        if (pConfig) {
          const isLocal = pConfig.type === 'local' || pConfig.category === 'local' || Boolean(pConfig.baseUrl && (pConfig.baseUrl.includes('localhost') || pConfig.baseUrl.includes('127.0.0.1')));
          const isReady = isLocal ? (isLocalOnline || Boolean(pConfig.baseUrl)) : hasKey;
          return {
            id: activeProvider,
            name: pConfig.name || activeProvider,
            shortName: (pConfig.name || activeProvider).split(' ')[0],
            icon: isLocal ? '🤖' : '🌐',
            badge: pConfig.badge || (isLocal ? 'Local AI' : (hasKey ? 'Cloud' : t('translate.studio.badgeMissingKey'))),
            status: isReady ? 'online' : 'warning',
            statusText: isReady ? t('translate.studio.statusReady') : (isLocal ? t('translate.studio.statusOffline') : t('translate.studio.statusNeedKey')),
            isReady,
            isLocal,
          };
        }
        const geminiKey = pCred || settings?.apiKeys?.gemini?.trim() || '';
        const hasGeminiKey = Boolean(geminiKey);
        return {
          id: 'gemini',
          name: 'Google Gemini',
          shortName: 'Gemini',
          icon: '✨',
          badge: hasGeminiKey ? t('translate.studio.badgeRecommended') : t('translate.studio.badgeMissingKey'),
          status: hasGeminiKey ? 'online' : 'warning',
          statusText: hasGeminiKey ? t('translate.studio.statusReady') : t('translate.studio.statusNeedKey'),
          isReady: hasGeminiKey,
          isLocal: false,
        };
      }
    }
  }, [activeProvider, settings?.providers, settings?.apiKeys, isLocalOnline, displayLocalModelName, isModelInstalled, currentModelId, t]);

  // Danh sách Cloud Providers kèm trạng thái có Key / Sẵn sàng
  const cloudProviders = useMemo(() => {
    const list = [
      {
        id: 'gemini',
        name: 'Google Gemini (Free tier)',
        icon: '✨',
        badge: t('translate.studio.badgeRecommended'),
        defaultModel: 'gemini-3.5-flash',
      },
      {
        id: 'openai',
        name: 'OpenAI (GPT-4o / 4o-mini)',
        icon: '⚡',
        badge: 'Cloud',
        defaultModel: 'gpt-4o',
      },
      {
        id: 'claude',
        name: 'Anthropic Claude (3.5 Sonnet)',
        icon: '🧠',
        badge: 'Cloud',
        defaultModel: 'claude-3-5-sonnet-20240620',
      },
      {
        id: 'deepseek',
        name: 'DeepSeek (V3 / R1)',
        icon: '🐳',
        badge: 'Cloud',
        defaultModel: 'deepseek-chat',
      },
      {
        id: 'openrouter',
        name: 'OpenRouter (Multi-model)',
        icon: '🔀',
        badge: 'Router',
        defaultModel: 'google/gemini-2.0-flash-exp:free',
      },
      {
        id: 'deepl',
        name: 'DeepL Translation API',
        icon: '🌐',
        badge: t('translate.studio.badgeHighQuality'),
        defaultModel: '',
      },
    ];

    // Thêm các custom provider (nếu không phải local)
    if (settings?.providers) {
      for (const [id, cfg] of Object.entries(settings.providers)) {
        if (!cfg || cfg.isCustom !== true) continue;
        const isLocal = cfg.type === 'local' || cfg.category === 'local' || (cfg.baseUrl && (cfg.baseUrl.includes('localhost') || cfg.baseUrl.includes('127.0.0.1')));
        if (isLocal) continue;
        list.push({
          id,
          name: cfg.name || id,
          icon: '🌐',
          badge: 'Custom',
          defaultModel: cfg.defaultModel || '',
        });
      }
    }

    return list.map((p) => {
      const cred = settings?.providers?.[p.id]?.credential || settings?.apiKeys?.[p.id] || '';
      const hasKey = Boolean(cred.trim());
      return {
        ...p,
        isReady: hasKey,
        hasKey,
        statusText: hasKey ? t('translate.studio.statusReady') : t('translate.studio.badgeMissingKey'),
      };
    });
  }, [settings?.providers, settings?.apiKeys, t]);

  // Danh sách Local Models kèm trạng thái đã cài / server online (chỉ hiển thị model THỰC SỰ ĐÃ TẢI trong máy)
  const localModels = useMemo(() => {
    const predefinedMeta = PREDEFINED_LOCAL_MODEL_META;

    const engines = detectedEngines || localEngines;
    const installed = [
      ...(engines?.ollama?.models || []),
      ...(engines?.lmstudio?.models || []),
      ...(engines?.detectedModels || []),
    ];

    const modelMap = new Map();
    installed.forEach((m) => {
      const mid = m.id || m.name;
      if (!mid) return;
      if (/ocr|paddle|detr/i.test(mid)) return;
      const meta = predefinedMeta[mid] || {};
      modelMap.set(mid, {
        id: mid,
        name: meta.name || m.name || mid,
        badge: meta.badge || m.size || m.engine || 'Local',
        isInstalled: true,
        isReady: isLocalOnline,
        statusText: isLocalOnline ? t('translate.studio.statusReady') : 'Offline',
      });
    });

    if (currentModelId && !modelMap.has(currentModelId) && isModelInstalled(currentModelId)) {
      modelMap.set(currentModelId, {
        id: currentModelId,
        name: currentModelId,
        badge: 'Custom',
        isInstalled: true,
        isReady: isLocalOnline,
        statusText: isLocalOnline ? t('translate.studio.statusReady') : 'Offline',
      });
    }

    return Array.from(modelMap.values());
  }, [isLocalOnline, isModelInstalled, detectedEngines, localEngines, currentModelId, t]);

  const displayModelName = activeProviderInfo.name;
  const loadingPathsRef = useRef(new Set());

  // Normalized pages state with layer data
  const [pages, setPages] = useState(() => normalizePages(initialPages));

  // Đồng bộ lại pages khi initialPages cập nhật từ kết quả dịch bên ngoài (nếu có)
  useEffect(() => {
    if (!initialPages || initialPages.length === 0) return;

    setPages((prev) => {
      const normalized = normalizePages(initialPages);
      // Tránh ghi đè nếu danh sách đã đồng bộ hoàn toàn
      if (
        prev.length === normalized.length &&
        prev.every((p, idx) => p.imagePath === normalized[idx]?.imagePath && p.savedPath === normalized[idx]?.savedPath)
      ) {
        return prev;
      }
      return normalized.map((norm, idx) => {
        const existing = prev.find((p) => p.imagePath === norm.imagePath || p.index === idx) || prev[idx];
        if (existing) {
          const realWidth = (existing.width && existing.width > 100)
            ? existing.width
            : (norm.width && norm.width > 100 ? norm.width : 0);
          const realHeight = (existing.height && existing.height > 100)
            ? existing.height
            : (norm.height && norm.height > 100 ? norm.height : 0);

          return {
            ...norm,
            id: existing.id || `page-${idx}`,
            index: idx,
            dataUrl: existing.originalDataUrl || existing.dataUrl || norm.originalDataUrl || norm.dataUrl || null,
            originalDataUrl: existing.originalDataUrl || norm.originalDataUrl || existing.dataUrl || norm.dataUrl || null,
            width: realWidth,
            height: realHeight,
            layers: (Array.isArray(existing.layers) && existing.layers.length > 0) ? existing.layers : norm.layers,
            savedPath: norm.savedPath || existing.savedPath,
            translatedImageDataUrl: norm.translatedImageDataUrl || existing.translatedImageDataUrl,
          };
        }
        return {
          ...norm,
          id: norm.id || `page-${idx}`,
          index: idx,
        };
      });
    });
  }, [initialPages]);

  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [expandedLayerId, setExpandedLayerId] = useState(null);
  const [isTextGroupCollapsed, setIsTextGroupCollapsed] = useState(false);
  const [pageToDelete, setPageToDelete] = useState(null); // null | page object | 'all'
  const [filterQuery, setFilterQuery] = useState('');
  const [activeTool, setActiveTool] = useState('select'); // 'select' | 'text' | 'brush' | 'box' | 'pipette' | 'magic' | 'hand'

  // Toggle thu gọn / mở rộng trực tiếp khi click vào title của text layer
  const toggleLayerCollapse = useCallback((layerId) => {
    setExpandedLayerId((prev) => (prev === layerId ? null : layerId));
    setSelectedLayerId(layerId);
  }, []);

  // Reset expanded layer khi chuyển trang
  useEffect(() => {
    setExpandedLayerId(null);
  }, [activePageIndex]);

  // Tự động điều chỉnh activePageIndex nếu danh sách trang thay đổi
  useEffect(() => {
    if (pages.length > 0 && activePageIndex >= pages.length) {
      setActivePageIndex(pages.length - 1);
    }
  }, [pages.length, activePageIndex]);

  // Left sidebar (Pages list) visibility
  const SHOW_LEFT_SIDEBAR_STORAGE_KEY = 'manga_studio_show_left_sidebar_v1';
  const [showLeftSidebar, setShowLeftSidebar] = useState(() => {
    try {
      const saved = localStorage.getItem(SHOW_LEFT_SIDEBAR_STORAGE_KEY);
      if (saved !== null) return saved === 'true';
    } catch { }
    return true;
  });

  const toggleLeftSidebar = useCallback((forceState) => {
    setShowLeftSidebar((prev) => {
      const next = typeof forceState === 'boolean' ? forceState : !prev;
      try {
        localStorage.setItem(SHOW_LEFT_SIDEBAR_STORAGE_KEY, String(next));
      } catch { }
      return next;
    });
  }, []);

  // Right sidebar visibility & tabs (Workflow vs Settings)
  const SHOW_RIGHT_SIDEBAR_STORAGE_KEY = 'manga_studio_show_right_sidebar_v1';
  const [showRightSidebar, setShowRightSidebar] = useState(() => {
    try {
      const saved = localStorage.getItem(SHOW_RIGHT_SIDEBAR_STORAGE_KEY);
      if (saved !== null) return saved === 'true';
    } catch { }
    return true;
  });

  const toggleRightSidebar = useCallback((forceState) => {
    setShowRightSidebar((prev) => {
      const next = typeof forceState === 'boolean' ? forceState : !prev;
      try {
        localStorage.setItem(SHOW_RIGHT_SIDEBAR_STORAGE_KEY, String(next));
      } catch { }
      return next;
    });
  }, []);

  const [activeRightTab, setActiveRightTab] = useState('properties'); // 'properties' | 'settings'

  // Right sidebar width & resizing (đồng bộ chiều rộng Quy trình & Cài đặt)
  const RIGHT_SIDEBAR_STORAGE_KEY = 'manga_studio_sidebar_width_v1';
  const clampRightSidebarWidth = useCallback((w) => {
    const min = 360;
    const max = typeof window !== 'undefined' ? Math.max(min, Math.min(760, Math.floor(window.innerWidth * 0.65))) : 760;
    return Math.max(min, Math.min(w, max));
  }, []);

  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(RIGHT_SIDEBAR_STORAGE_KEY);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num >= 360 && num <= 800) {
          return num;
        }
      }
    } catch { }
    return 460;
  });

  const rightSidebarWidthRef = useRef(rightSidebarWidth);
  useEffect(() => {
    rightSidebarWidthRef.current = rightSidebarWidth;
  }, [rightSidebarWidth]);

  const handleRightSidebarResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightSidebarWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let lastW = startW;
    const onMove = (ev) => {
      // Thanh bên nằm bên phải màn hình: Kéo chuột sang trái (startX - ev.clientX > 0) -> tăng width
      const delta = startX - ev.clientX;
      const next = clampRightSidebarWidth(startW + delta);
      lastW = next;
      setRightSidebarWidth(next);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(RIGHT_SIDEBAR_STORAGE_KEY, String(lastW));
      } catch { }
    };

    function onUp() {
      cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [clampRightSidebarWidth]);

  // Left sidebar (Pages list) width & resizing
  const LEFT_SIDEBAR_STORAGE_KEY = 'manga_studio_left_sidebar_width_v1';
  const clampLeftSidebarWidth = useCallback((w) => {
    const min = 180;
    const max = typeof window !== 'undefined' ? Math.max(min, Math.min(500, Math.floor(window.innerWidth * 0.45))) : 500;
    return Math.max(min, Math.min(w, max));
  }, []);

  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(LEFT_SIDEBAR_STORAGE_KEY);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num >= 180 && num <= 600) {
          return num;
        }
      }
    } catch { }
    return 240;
  });

  const leftSidebarWidthRef = useRef(leftSidebarWidth);
  useEffect(() => {
    leftSidebarWidthRef.current = leftSidebarWidth;
  }, [leftSidebarWidth]);

  const handleLeftSidebarResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftSidebarWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let lastW = startW;
    const onMove = (ev) => {
      // Thanh bên nằm bên trái màn hình: Kéo chuột sang phải (ev.clientX - startX > 0) -> tăng width
      const delta = ev.clientX - startX;
      const next = clampLeftSidebarWidth(startW + delta);
      lastW = next;
      setLeftSidebarWidth(next);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(LEFT_SIDEBAR_STORAGE_KEY, String(lastW));
      } catch { }
    };

    function onUp() {
      cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [clampLeftSidebarWidth]);

  // Dropdown states: Model, Run, Export, Add Page
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showRunDropdown, setShowRunDropdown] = useState(false);
  const [draggedRunActionId, setDraggedRunActionId] = useState(null);
  const [dragOverRunActionId, setDragOverRunActionId] = useState(null);
  const isRunActionDraggingRef = useRef(false);

  const RUN_ACTIONS_STORAGE_KEY = 'manga_studio_run_actions_order_v2';
  const DEFAULT_RUN_ACTION_ORDER = ['all', 'current', 'untranslated'];

  const [runActionOrder, setRunActionOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(RUN_ACTIONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((id) => DEFAULT_RUN_ACTION_ORDER.includes(id));
          DEFAULT_RUN_ACTION_ORDER.forEach((id) => {
            if (!valid.includes(id)) valid.push(id);
          });
          return valid;
        }
      }
    } catch { }
    return DEFAULT_RUN_ACTION_ORDER;
  });

  const handleReorderRunAction = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setRunActionOrder((prev) => {
      const next = [...prev];
      const sourceIdx = next.indexOf(sourceId);
      const targetIdx = next.indexOf(targetId);
      if (sourceIdx === -1 || targetIdx === -1) return prev;
      next.splice(sourceIdx, 1);
      next.splice(targetIdx, 0, sourceId);
      try {
        localStorage.setItem(RUN_ACTIONS_STORAGE_KEY, JSON.stringify(next));
      } catch { }
      return next;
    });
  }, []);

  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showAddPageDropdown, setShowAddPageDropdown] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokeColorPicker, setShowStrokeColorPicker] = useState(false);
  const modelPickerRef = useRef(null);
  const runDropdownRef = useRef(null);
  const exportDropdownRef = useRef(null);
  const addPageDropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Canvas zoom & pan
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const spacePressedRef = useRef(false);

  // Layer drag & resize interaction state
  const [interaction, setInteraction] = useState(null);
  const canvasRef = useRef(null);
  const imageContainerRef = useRef(null);
  const imageRef = useRef(null);

  // Layer inspector textarea ref
  const layerTextareaRef = useRef(null);

  // Global overlay toggles (chuẩn Koharu: bật sẵn cleanup layer để hiển thị ảnh đã tẩy chữ sạch viền khung gốc)
  const [showCleanupLayer, setShowCleanupLayer] = useState(true);
  const [showArtworkLayer, setShowArtworkLayer] = useState(true);

  // Export & Agent status
  const [isExporting, setIsExporting] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState(null);
  const [statusMessage, setStatusMessage] = useState({ text: '', type: 'info' });
  const [agentPrompt, setAgentPrompt] = useState('');
  const [errorModal, setErrorModal] = useState(null);
  const [isRetryingResidual, setIsRetryingResidual] = useState(false);
  const [retryingSingleLayerId, setRetryingSingleLayerId] = useState(null);

  // --- Multi-Project & Session Persistence State (Quản lý đa dự án) ---
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [projectsList, setProjectsList] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newProjectNameInput, setNewProjectNameInput] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const saveSessionTimerRef = useRef(null);

  // Bảng đối chiếu dịch thuật & Live Terminal Console
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [showLogConsole, setShowLogConsole] = useState(true);
  const [isProgressHudCollapsed, setIsProgressHudCollapsed] = useState(false);
  const [comparisonSearchQuery, setComparisonSearchQuery] = useState('');
  const [comparisonFilter, setComparisonFilter] = useState('all'); // 'all' | 'clean' | 'residual'
  const [comparisonScope, setComparisonScope] = useState('current'); // 'current' | 'all'
  const [showComparisonPreview, setShowComparisonPreview] = useState(false);
  const [comparisonHoveredLayerId, setComparisonHoveredLayerId] = useState(null);
  const logConsoleRef = useRef(null);

  // Tùy chọn tự động mở thư mục khi xuất xong
  const [autoOpenExportFolder, setAutoOpenExportFolder] = useState(() => {
    try {
      const saved = localStorage.getItem('manga_studio_auto_open_export_folder');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Modal xác nhận xuất file thông minh (kiểm tra trang chưa có bản dịch)
  const [exportConfirmModal, setExportConfirmModal] = useState(null);
  const [includeUntranslatedPages, setIncludeUntranslatedPages] = useState(true);

  // Modal khôi phục tiến trình dịch dở dang (Smart Resume Checkpoint)
  const [resumePromptModal, setResumePromptModal] = useState(null);

  // Modal thông báo hoàn tất tiến trình Dịch / Xuất file / Auto-Processing
  const [completionModal, setCompletionModal] = useState(null);

  // Điều hướng phím mũi tên Trái / Phải khi mở Bảng đối chiếu
  useEffect(() => {
    if (!showComparisonModal) return;
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActivePageIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActivePageIndex((prev) => Math.min(pages.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showComparisonModal, pages.length]);

  // Tự động cuộn terminal log xuống dòng mới nhất
  useEffect(() => {
    if (logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [logs, showLogConsole]);

  // Tự động đóng HUD sau 25s khi đã hoàn thành (nếu user không bấm xem bảng đối chiếu hoặc xem log)
  useEffect(() => {
    if (translateProgress?.isFinished) {
      const timer = setTimeout(() => {
        setTranslateProgress(null);
      }, 25000);
      return () => clearTimeout(timer);
    }
  }, [translateProgress?.isFinished]);

  // Tự động ẩn toast thông báo sau 3.5 giây (tránh chiếm giữ màn hình)
  useEffect(() => {
    if (statusMessage?.text) {
      const timer = setTimeout(() => {
        setStatusMessage({ text: '', type: 'info' });
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [statusMessage?.text]);

  // Regex phát hiện chữ Nhật (Hiragana, Katakana, Kanji, Halfwidth Katakana)
  const JAPANESE_CHAR_REGEX = useMemo(() => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9d]/, []);

  useEffect(() => {
    onRunningChange?.(isTranslating);
  }, [isTranslating, onRunningChange]);

  // Serialize pages — chỉ gửi fields cần thiết, bỏ qua DOM refs
  const serializePagesForSession = useCallback((pagesList) => {
    return (pagesList || []).map((p) => ({
      id: p.id,
      index: p.index,
      imagePath: p.imagePath,
      filename: p.filename,
      width: p.width,
      height: p.height,
      dataUrl: p.dataUrl || null,
      originalDataUrl: p.originalDataUrl || null,
      cleanDataUrl: p.cleanDataUrl || null,
      translatedImageDataUrl: p.translatedImageDataUrl || null,
      savedPath: p.savedPath || '',
      layers: (p.layers || []).map((l) => ({
        id: l.id,
        type: l.type,
        bbox: l.bbox,
        textBbox: l.textBbox,
        text: l.text,
        translatedText: l.translatedText,
        sourceText: l.sourceText,
        fontFamily: l.fontFamily,
        fontSize: l.fontSize,
        fontWeight: l.fontWeight,
        fontColor: l.fontColor,
        textAlign: l.textAlign,
        textTransform: l.textTransform,
        opacity: l.opacity,
        visible: l.visible,
        borderWidth: l.borderWidth,
        borderColor: l.borderColor,
        cleanDataUrl: l.cleanDataUrl || null,
      })),
    }));
  }, []);

  // --- Auto-Save Session (Debounced 3s) ---
  // Mỗi khi pages thay đổi (dịch xong, chỉnh sửa, thêm/xóa trang), tự động lưu ngầm vào dự án hiện tại
  useEffect(() => {
    if (!api?.translateSaveSession || isTranslating || !currentProject) return;
    if (saveSessionTimerRef.current) clearTimeout(saveSessionTimerRef.current);

    // Nếu pages rỗng sau khi session đã được nạp -> dọn dẹp các trang của dự án hiện tại
    if (pages.length === 0) {
      if (sessionLoaded) {
        api.translateClearSession?.(currentProject.id).catch(() => { });
        setProjectsList((prev) =>
          prev.map((p) => (p.id === currentProject.id ? { ...p, pageCount: 0, coverThumb: null } : p))
        );
      }
      return;
    }

    saveSessionTimerRef.current = setTimeout(async () => {
      try {
        setIsSavingSession(true);
        const serializablePages = serializePagesForSession(pages);
        await api.translateSaveSession({
          projectId: currentProject.id,
          pages: serializablePages,
          activePageIndex,
          name: currentProject.name,
        });
        setProjectsList((prev) =>
          prev.map((p) => (p.id === currentProject.id ? { ...p, pageCount: pages.length } : p))
        );
      } catch (e) {
        console.warn('[AutoSave] Session save error:', e);
      } finally {
        setIsSavingSession(false);
      }
    }, 3000);

    return () => {
      if (saveSessionTimerRef.current) clearTimeout(saveSessionTimerRef.current);
    };
  }, [pages, activePageIndex, api, isTranslating, sessionLoaded, currentProject, serializePagesForSession]);

  // Load danh sách projects
  const loadProjectsList = useCallback(async () => {
    if (!api?.translateListProjects) return null;
    try {
      const res = await api.translateListProjects();
      if (res?.projects) {
        setProjectsList(res.projects);
        const active = res.projects.find((p) => p.id === res.activeProjectId) || res.projects[0] || null;
        setCurrentProject(active);
        return { activeProjectId: res.activeProjectId, projects: res.projects, activeProject: active };
      }
    } catch (e) {
      console.warn('[Projects] Failed to load projects list:', e);
    }
    return null;
  }, [api]);

  // --- Load Session & Projects on Mount ---
  useEffect(() => {
    if (sessionLoaded) return;
    if (initialPages && initialPages.length > 0) {
      setSessionLoaded(true);
      return;
    }

    (async () => {
      try {
        const projData = await loadProjectsList();
        const activeId = projData?.activeProjectId;
        if (api?.translateLoadSession) {
          const result = await api.translateLoadSession(activeId);
          if (result?.success) {
            if (result.project) setCurrentProject(result.project);
            if (Array.isArray(result.pages) && result.pages.length > 0) {
              const restored = normalizePages(result.pages);
              setPages(restored);
              setActivePageIndex(result.activePageIndex || 0);
              setStatusMessage({
                type: 'info',
                text: t('translate.studio.toastProjectOpened', { name: result.project?.name || t('translate.studio.projectDefaultName'), count: restored.length }),
              });
            }
          }
        }
      } catch (e) {
        console.warn('[Session] Load error:', e);
      } finally {
        setSessionLoaded(true);
      }
    })();
  }, [api, sessionLoaded, initialPages, loadProjectsList]);

  // --- Tạo Dự Án Mới ---
  const handleCreateProject = useCallback(async (customName) => {
    if (!api?.translateCreateProject) return;
    try {
      if (saveSessionTimerRef.current) clearTimeout(saveSessionTimerRef.current);
      // 1. Lưu dự án hiện tại nếu có trang
      if (pages.length > 0 && currentProject) {
        const serializable = serializePagesForSession(pages);
        await api.translateSaveSession({
          projectId: currentProject.id,
          pages: serializable,
          activePageIndex,
          name: currentProject.name,
        });
      }

      // 2. Tạo dự án mới
      const finalName = (customName || newProjectNameInput || '').trim();
      const res = await api.translateCreateProject({ name: finalName });
      if (res?.success) {
        setProjectsList(res.projects);
        setCurrentProject(res.project);
        setPages([]);
        setActivePageIndex(0);
        setSelectedLayerId(null);
        setExpandedLayerId(null);
        setLogs([]);
        setTranslateProgress(null);
        loadingPathsRef.current.clear();
        onUpdatePages?.([]);
        setShowProjectModal(false);
        setNewProjectNameInput('');
        setIsCreatingProject(false);
        setStatusMessage({
          type: 'success',
          text: t('translate.studio.toastProjectCreated', { name: res.project.name }),
        });
      }
    } catch (e) {
      console.error('[Projects] Create error:', e);
      setStatusMessage({ type: 'error', text: t('translate.studio.toastProjectCreateError', { error: e.message }) });
    }
  }, [api, pages, currentProject, activePageIndex, serializePagesForSession, newProjectNameInput, onUpdatePages]);

  // --- Chuyển Đổi Qua Lại Giữa Các Dự Án ---
  const handleSwitchProject = useCallback(async (targetProjectId) => {
    if (!api?.translateSwitchProject || !targetProjectId) return;
    if (targetProjectId === currentProject?.id) {
      setShowProjectModal(false);
      return;
    }

    try {
      if (saveSessionTimerRef.current) clearTimeout(saveSessionTimerRef.current);
      // 1. Lưu dự án hiện tại trước khi chuyển
      if (pages.length > 0 && currentProject) {
        const serializable = serializePagesForSession(pages);
        await api.translateSaveSession({
          projectId: currentProject.id,
          pages: serializable,
          activePageIndex,
          name: currentProject.name,
        });
      }

      // 2. Chuyển sang dự án đích
      const res = await api.translateSwitchProject({ projectId: targetProjectId });
      if (res?.success) {
        setProjectsList(res.projects);
        setCurrentProject(res.project);
        const restored = normalizePages(res.session?.pages || []);
        setPages(restored);
        setActivePageIndex(res.session?.activePageIndex || 0);
        setSelectedLayerId(null);
        setExpandedLayerId(null);
        setLogs([]);
        setTranslateProgress(null);
        loadingPathsRef.current.clear();
        onUpdatePages?.(restored);
        setShowProjectModal(false);
        setStatusMessage({
          type: 'info',
          text: t('translate.studio.toastProjectSwitched', { name: res.project?.name || targetProjectId, count: restored.length }),
        });
      }
    } catch (e) {
      console.error('[Projects] Switch error:', e);
      setStatusMessage({ type: 'error', text: t('translate.studio.toastProjectSwitchError', { error: e.message }) });
    }
  }, [api, currentProject, pages, activePageIndex, serializePagesForSession, onUpdatePages]);

  // --- Đổi Tên Dự Án ---
  const handleRenameProject = useCallback(async (projectId, newName) => {
    if (!api?.translateRenameProject || !newName?.trim()) return;
    try {
      const res = await api.translateRenameProject({ projectId, name: newName.trim() });
      if (res?.success) {
        setProjectsList(res.projects);
        if (currentProject?.id === projectId) {
          setCurrentProject(res.project);
        }
        setEditingProjectId(null);
        setEditingProjectName('');
        setStatusMessage({
          type: 'success',
          text: t('translate.studio.toastProjectRenamed', { name: res.project.name }),
        });
      }
    } catch (e) {
      console.error('[Projects] Rename error:', e);
    }
  }, [api, currentProject]);

  // --- Xóa Dự Án ---
  const handleDeleteProject = useCallback(async (projectId) => {
    if (!api?.translateDeleteProject || !projectId) return;
    try {
      if (saveSessionTimerRef.current) clearTimeout(saveSessionTimerRef.current);
      const res = await api.translateDeleteProject({ projectId });
      if (res?.success) {
        setProjectsList(res.projects);
        setProjectToDelete(null);
        if (currentProject?.id === projectId) {
          const newActive = res.projects.find((p) => p.id === res.activeProjectId) || res.projects[0];
          setCurrentProject(newActive);
          const restored = normalizePages(res.session?.pages || []);
          setPages(restored);
          setActivePageIndex(res.session?.activePageIndex || 0);
          onUpdatePages?.(restored);
        }
        setStatusMessage({
          type: 'info',
          text: t('translate.studio.toastProjectDeleted'),
        });
      }
    } catch (e) {
      console.error('[Projects] Delete error:', e);
      setStatusMessage({ type: 'error', text: t('translate.studio.toastProjectDeleteError', { error: e.message }) });
    }
  }, [api, currentProject, onUpdatePages]);

  // Process & integrate imported file paths into Studio state (lọc chống import trùng, hỗ trợ subfolder, hỗ trợ replaceExisting)
  const processImportedFiles = useCallback(
    async (filePaths, isFolder = false, sourceDir = '', fileDetails = null, replaceExisting = false) => {
      if (!filePaths || !filePaths.length) return;

      const normalizePath = (p) => (p || '').replace(/\\/g, '/').toLowerCase().trim();

      // 1. Lọc trùng nội bộ trong danh sách input
      const seenInputSet = new Set();
      const uniqueInputPaths = [];
      for (const fp of filePaths) {
        const norm = normalizePath(fp);
        if (norm && !seenInputSet.has(norm)) {
          seenInputSet.add(norm);
          uniqueInputPaths.push(fp);
        }
      }

      // 2. Kiểm tra trùng lặp với danh sách trang hiện tại của dự án (nếu không thay thế toàn bộ)
      let pathsToAdd = uniqueInputPaths;
      let duplicateCount = 0;
      let singleDuplicatePath = null;

      if (!replaceExisting && pages.length > 0) {
        const existingPathSet = new Set(
          pages.map((p) => normalizePath(p.imagePath)).filter(Boolean)
        );

        pathsToAdd = [];
        for (const fp of uniqueInputPaths) {
          const norm = normalizePath(fp);
          if (existingPathSet.has(norm)) {
            duplicateCount++;
            singleDuplicatePath = fp;
          } else {
            pathsToAdd.push(fp);
          }
        }

        // Nếu toàn bộ file được chọn đều đã tồn tại trong Studio
        if (pathsToAdd.length === 0) {
          if (duplicateCount === 1 && singleDuplicatePath) {
            const dupFilename = singleDuplicatePath.split(/[/\\]/).filter(Boolean).pop();
            const existingIdx = pages.findIndex(
              (p) => normalizePath(p.imagePath) === normalizePath(singleDuplicatePath)
            );
            if (existingIdx >= 0) {
              setActivePageIndex(existingIdx);
            }
            setStatusMessage({
              text: t('translate.studio.toastFileAlreadyInList', { filename: dupFilename, page: existingIdx >= 0 ? existingIdx + 1 : 1 }),
              type: 'info',
            });
          } else {
            setStatusMessage({
              text: isFolder
                ? t('translate.studio.toastAllFolderImagesInList', { count: duplicateCount })
                : t('translate.studio.toastAllSelectedImagesInList', { count: duplicateCount }),
              type: 'info',
            });
          }
          return;
        }
      }

      const sortedPaths = fileDetails
        ? pathsToAdd
        : [...pathsToAdd].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        );

      const detailMap = new Map();
      if (Array.isArray(fileDetails)) {
        for (const d of fileDetails) {
          detailMap.set(normalizePath(d.absPath), { relPath: d.relPath || '', subfolder: d.subfolder || '' });
        }
      }

      const basePages = replaceExisting ? [] : pages;
      const startIndex = basePages.length;

      setStatusMessage({
        text: t('translate.studio.toastLoadingPages', { count: sortedPaths.length }),
        type: 'info',
      });

      const newItems = sortedPaths.map((fp, idx) => {
        const detail = detailMap.get(normalizePath(fp));
        const parts = fp.split(/[/\\]/).filter(Boolean);
        const baseName = parts.pop() || `page-${startIndex + idx + 1}`;
        const subfolder = detail?.subfolder || (detail?.relPath ? detail.relPath.substring(0, detail.relPath.lastIndexOf('/')) : '');
        const filename = detail?.relPath || (subfolder ? `${subfolder}/${baseName}` : baseName);

        return {
          id: `page-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          index: startIndex + idx,
          imagePath: fp,
          savedPath: '',
          filename,
          relPath: detail?.relPath || (subfolder ? `${subfolder}/${baseName}` : ''),
          subfolder,
          dataUrl: null,
          originalDataUrl: null,
          translatedImageDataUrl: null,
          width: 0,
          height: 0,
          layers: [],
        };
      });

      try {
        const firstImg = await loadPageImageData(sortedPaths[0], api);
        if (firstImg?.dataUrl && newItems[0]) {
          newItems[0].dataUrl = firstImg.dataUrl;
          newItems[0].originalDataUrl = firstImg.dataUrl;
          newItems[0].width = firstImg.width || 800;
          newItems[0].height = firstImg.height || 1200;
        }
      } catch (e) {
        console.warn('[MangaStudioEditor] Failed to load first image:', e);
      }

      const finalPages = basePages.length === 0
        ? newItems
        : [...basePages, ...newItems].map((p, idx) => ({ ...p, index: idx, id: p.id || `page-${idx}` }));

      setPages(finalPages);
      if (basePages.length === 0) {
        setActivePageIndex(0);
        setSelectedLayerId(null);
      } else {
        setActivePageIndex(startIndex);
      }
      onUpdatePages?.(finalPages);

      const targetDir = sourceDir || (sortedPaths[0] ? sortedPaths[0].substring(0, sortedPaths[0].lastIndexOf('/')) : '');
      onImportSource?.({ dir: targetDir, files: sortedPaths, isFolder });

      const folderName = targetDir ? targetDir.split(/[/\\]/).filter(Boolean).pop() : '';
      const subCount = detailMap.size > 0 ? new Set([...detailMap.values()].map((d) => d.subfolder).filter(Boolean)).size : 0;
      setStatusMessage({
        text: isFolder
          ? (duplicateCount > 0
            ? t('translate.studio.toastFolderLoadedWithSub', { folder: folderName, count: sortedPaths.length, dup: duplicateCount, sub: subCount })
            : t('translate.studio.toastFolderLoaded', { folder: folderName, count: sortedPaths.length }))
          : (duplicateCount > 0
            ? t('translate.studio.toastFilesLoaded', { count: sortedPaths.length, dup: duplicateCount })
            : t('translate.studio.toastFilesLoadedSuccess', { count: sortedPaths.length })),
        type: 'success',
      });
    },
    [pages, api, onUpdatePages, onImportSource]
  );

  // --- Auto-Processing Mode State & Handlers ---
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideInitialTab, setGuideInitialTab] = useState('workflow');
  const [autoInputDir, setAutoInputDir] = useState('');
  const [autoOutputDir, setAutoOutputDir] = useState('');
  const [autoSkipExisting, setAutoSkipExisting] = useState(true);
  const [autoScannedCount, setAutoScannedCount] = useState(null);
  const [autoScannedData, setAutoScannedData] = useState(null);
  const [syncFolderModal, setSyncFolderModal] = useState(null);
  const [isScanningAuto, setIsScanningAuto] = useState(false);
  const [isAutoProcessing, setIsAutoProcessing] = useState(false);
  const [autoProgress, setAutoProgress] = useState(null);

  // Tự động nhận diện thư mục gốc của dự án hiện tại từ danh sách trang
  const detectedProjectDir = useMemo(() => {
    if (propSelectedDir) return propSelectedDir;
    if (pages.length > 0 && pages[0]?.imagePath) {
      const p0 = pages[0];
      const parentDir = p0.imagePath.substring(0, p0.imagePath.lastIndexOf('/'));
      if (p0.subfolder) {
        const levels = p0.subfolder.split(/[/\\]/).filter(Boolean).length;
        let dir = parentDir;
        for (let l = 0; l < levels; l++) {
          dir = dir.substring(0, dir.lastIndexOf('/'));
        }
        return dir;
      }
      return parentDir;
    }
    return '';
  }, [propSelectedDir, pages]);

  // Thư mục đầu ra mặc định: [Thư mục dự án]_translated
  const defaultOutputDir = useMemo(() => {
    if (!detectedProjectDir) return '';
    return `${detectedProjectDir}_translated`;
  }, [detectedProjectDir]);

  // Thư mục đầu vào & đầu ra hiệu lực (ưu tiên user tùy chọn, fallback về dự án hiện tại)
  const activeInputDir = autoInputDir || detectedProjectDir;
  const activeOutputDir = autoOutputDir || defaultOutputDir;

  // Trạng thái Chế Độ Tự Động 100% (Auto Mode Checkbox)
  const isAutoModeEnabled = Boolean(settings?.autoProcessing?.enabled);

  const toggleAutoMode = useCallback((newVal) => {
    const nextVal = typeof newVal === 'boolean' ? newVal : !isAutoModeEnabled;
    handleUpdateSetting({
      autoProcessing: {
        ...(settings?.autoProcessing || {}),
        enabled: nextVal,
        inputDir: autoInputDir || detectedProjectDir,
        outputDir: autoOutputDir || defaultOutputDir,
      },
    });
    setStatusMessage({
      type: nextVal ? 'success' : 'info',
      text: nextVal
        ? t('translate.auto.toastAutoOn', { dir: activeOutputDir || 'output' })
        : t('translate.auto.toastAutoOff'),
    });
  }, [isAutoModeEnabled, settings?.autoProcessing, handleUpdateSetting, autoInputDir, detectedProjectDir, autoOutputDir, defaultOutputDir, activeOutputDir]);

  // Sync settings when available
  useEffect(() => {
    if (settings?.autoProcessing) {
      if (!autoInputDir && settings.autoProcessing.inputDir) {
        setAutoInputDir(settings.autoProcessing.inputDir);
      }
      if (!autoOutputDir && settings.autoProcessing.outputDir) {
        setAutoOutputDir(settings.autoProcessing.outputDir);
      }
      if (typeof settings.autoProcessing.skipExisting === 'boolean') {
        setAutoSkipExisting(settings.autoProcessing.skipExisting);
      }
    }
  }, [settings]);

  // Helper: Tự động kết xuất và lưu tất cả các trang đã dịch vào thư mục đầu ra
  const handleAutoExportPages = useCallback(async (targetPages, customOutputDir) => {
    if (!api?.translateExportEditedPage || !targetPages || targetPages.length === 0) return;
    const finalOutputDir = customOutputDir || activeOutputDir || defaultOutputDir;
    if (!finalOutputDir) return;

    setIsExporting(true);
    let successCount = 0;

    for (let i = 0; i < targetPages.length; i++) {
      const p = targetPages[i];
      setTranslateProgress({
        step: 'export',
        percent: Math.round(((i + 1) / targetPages.length) * 100),
        detail: t('translate.auto.exportProgressDetail', { current: i + 1, total: targetPages.length }),
        imageIndex: i + 1,
        total: targetPages.length,
      });

      try {
        // Khi xuất file, chế độ Cleanup luôn luôn bật (showCleanupLayer: true) để tẩy sạch chữ Nhật gốc
        const rendered = await renderPageToDataUrl(
          p,
          { showCleanupLayer: true, fillBackground: false, quality: 92 },
          api
        );

        const pageLayers = Array.isArray(p.layers) ? p.layers : [];

        let computedSavePath = p.savedPath || undefined;
        if (!computedSavePath) {
          const rootFolderName = activeInputDir
            ? activeInputDir.split(/[/\\]/).filter(Boolean).pop()
            : (detectedProjectDir ? detectedProjectDir.split(/[/\\]/).filter(Boolean).pop() : (currentProject?.name || ''));
          const outBase = finalOutputDir ? finalOutputDir.split(/[/\\]/).filter(Boolean).pop() || '' : '';
          const isSameOrTranslated =
            rootFolderName &&
            (outBase.toLowerCase() === rootFolderName.toLowerCase() ||
              outBase.toLowerCase() === `${rootFolderName}_translated`.toLowerCase());

          const origExt = p.imagePath ? p.imagePath.substring(p.imagePath.lastIndexOf('.')) : '.jpg';
          const ext = origExt.toLowerCase() === '.png' ? '.png' : (origExt.toLowerCase() === '.webp' ? '.webp' : '.jpg');
          const baseName = p.imagePath ? p.imagePath.split(/[/\\]/).pop().replace(/\.[^.]+$/, '') + '_translated' + ext : `page_${i + 1}.jpg`;
          const sub = p.subfolder || '';

          if (!isSameOrTranslated && rootFolderName) {
            computedSavePath = sub
              ? `${finalOutputDir}/${rootFolderName}/${sub}/${baseName}`
              : `${finalOutputDir}/${rootFolderName}/${baseName}`;
          } else if (sub) {
            computedSavePath = `${finalOutputDir}/${sub}/${baseName}`;
          } else {
            computedSavePath = `${finalOutputDir}/${baseName}`;
          }
        }

        const res = await api.translateExportEditedPage({
          imagePath: p.imagePath,
          layers: pageLayers.filter((l) => l.visible),
          renderedDataUrl: rendered?.dataUrl,
          options: {
            quality: 92,
            fillBackground: false,
            savePath: computedSavePath,
            outputDir: finalOutputDir,
          },
        });

        if (res?.success) {
          successCount++;
          if (res.dataUrl) {
            setPages((prev) =>
              prev.map((item, idx) =>
                item.id === p.id || idx === i
                  ? { ...item, savedPath: res.savePath, dataUrl: res.dataUrl, translatedImageDataUrl: res.dataUrl }
                  : item
              )
            );
          }
        }
      } catch (e) {
        console.error(`[AutoExport] Export page error ${i}:`, e);
      }
    }

    setIsExporting(false);
    addLog('completed', t('translate.auto.logExportDone', { count: successCount, total: targetPages.length, dir: finalOutputDir }), 'info');
    setStatusMessage({
      type: 'success',
      text: t('translate.auto.toastExportDone', { count: successCount, total: targetPages.length, dir: finalOutputDir }),
      action: finalOutputDir ? {
        label: t('translate.studio.completionOpenFolderBtn'),
        onClick: () => {
          if (api?.translateOpenFolder) api.translateOpenFolder(finalOutputDir);
          else if (window.electronAPI?.openPath) window.electronAPI.openPath(finalOutputDir);
        },
      } : undefined,
    });

    // Tự động mở thư mục sau khi hoàn thành nếu bật autoOpenExportFolder
    if (autoOpenExportFolder && finalOutputDir) {
      if (api?.translateOpenFolder) api.translateOpenFolder(finalOutputDir);
      else if (window.electronAPI?.openPath) window.electronAPI.openPath(finalOutputDir);
    }

    // Hiển thị modal thông báo hoàn thành nổi bật
    setCompletionModal({
      title: t('translate.auto.completionAutoExportTitle'),
      message: t('translate.auto.completionAutoExportDesc', { count: successCount, total: targetPages.length }),
      folderPath: finalOutputDir,
      stats: { success: successCount, total: targetPages.length },
    });

    onSaveChapter?.({
      outputDir: finalOutputDir,
      savedPaths: targetPages.map((p) => p.savedPath).filter(Boolean),
      pages: targetPages,
    });
  }, [api, activeOutputDir, defaultOutputDir, autoOpenExportFolder, onSaveChapter, addLog]);

  // Subscribe Auto-Processing progress
  useEffect(() => {
    if (!api?.subscribeAutoProcessProgress) return;
    const unsub = api.subscribeAutoProcessProgress((data) => {
      setAutoProgress(data);
      if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'error') {
        setIsAutoProcessing(false);
        if (data.status === 'completed') {
          setStatusMessage({
            type: 'success',
            text: t('translate.auto.toastAutoProcessDone', { count: data.successCount, skipped: data.skippedCount }),
            action: activeOutputDir ? {
              label: t('translate.studio.completionOpenFolderBtn'),
              onClick: () => {
                if (api?.translateOpenFolder) api.translateOpenFolder(activeOutputDir);
                else if (window.electronAPI?.openPath) window.electronAPI.openPath(activeOutputDir);
              },
            } : undefined,
          });

          // Tự động mở thư mục sau khi Auto-Processing hoàn tất
          if (autoOpenExportFolder && activeOutputDir) {
            if (api?.translateOpenFolder) api.translateOpenFolder(activeOutputDir);
            else if (window.electronAPI?.openPath) window.electronAPI.openPath(activeOutputDir);
          }

          // Hiển thị modal thông báo hoàn tất Auto-Processing
          setCompletionModal({
            title: t('translate.auto.completionAutoProcessTitle'),
            message: t('translate.auto.completionAutoProcessDesc', { count: data.successCount }),
            folderPath: activeOutputDir,
            stats: { success: data.successCount, skipped: data.skippedCount, error: data.errorCount },
          });
        }
      } else {
        setIsAutoProcessing(true);
      }

      // Live sync: Cập nhật trạng thái trang đã dịch thành công trong Studio
      if (data.status === 'page_success' && data.stepData?.filePath) {
        const normTarget = (data.stepData.filePath || '').replace(/\\/g, '/').toLowerCase().trim();
        setPages((prev) =>
          prev.map((p) => {
            const normP = (p.imagePath || '').replace(/\\/g, '/').toLowerCase().trim();
            if (normP === normTarget) {
              return {
                ...p,
                savedPath: data.stepData.destPath || p.savedPath,
                layers: data.stepData.layers?.length ? data.stepData.layers : p.layers,
              };
            }
            return p;
          })
        );
      }
    });
    return () => unsub?.();
  }, [api]);

  // Check running auto process on mount
  useEffect(() => {
    if (!api?.translateGetAutoProcessStatus) return;
    (async () => {
      try {
        const statusRes = await api.translateGetAutoProcessStatus();
        if (statusRes?.isProcessing) {
          setIsAutoProcessing(true);
        }
      } catch (_) { }
    })();
  }, [api]);

  const handleSelectAutoInputDir = useCallback(async () => {
    try {
      const res = await api?.translateSelectFolder?.({ title: t('translate.auto.selectFolderTitle') });
      if (!res?.canceled && res?.folderPath) {
        const folderPath = res.folderPath;
        setAutoInputDir(folderPath);
        setIsScanningAuto(true);

        // Quét đệ quy thư mục để lấy chi tiết danh sách ảnh và cấu trúc thư mục con
        const scanRes = api?.translateListImagesInDirRecursive
          ? await api.translateListImagesInDirRecursive(folderPath)
          : await api?.translateScanFolderImages?.(folderPath);

        const files = scanRes?.files || [];
        const fileDetails = scanRes?.fileDetails || null;
        const count = files.length || scanRes?.count || 0;

        setAutoScannedCount(count);
        setAutoScannedData({ folderPath, files, fileDetails, count });
        setIsScanningAuto(false);

        if (files.length === 0) {
          setErrorModal({
            title: t('translate.studio.noImagesFoundTitle'),
            message: t('translate.studio.noImageInFolderDescDetailed', { dir: folderPath }),
          });
          return;
        }

        // Kiểm tra xem các file này đã có trong Studio chưa
        const normalizePath = (p) => (p || '').replace(/\\/g, '/').toLowerCase().trim();
        const existingPathSet = new Set(pages.map((p) => normalizePath(p.imagePath)).filter(Boolean));
        const allAlreadyInStudio = files.every((fp) => existingPathSet.has(normalizePath(fp)));

        if (pages.length === 0) {
          // Studio đang trống -> Tự động nạp đồng bộ ngay lập tức vào Studio
          await processImportedFiles(files, true, folderPath, fileDetails, true);
        } else if (!allAlreadyInStudio) {
          // Studio đang có trang -> Mở Modal gợi ý đồng bộ linh hoạt
          const folderBaseName = folderPath.split(/[/\\]/).filter(Boolean).pop() || t('translate.studio.projectNewDefaultName');
          setSyncFolderModal({
            folderPath,
            folderBaseName,
            files,
            fileDetails,
            count,
            currentProjectName: currentProject?.name || t('translate.studio.projectCurrentDefaultName'),
            currentPageCount: pages.length,
          });
        }
      }
    } catch (e) {
      console.error('[AutoMode] Select input dir error:', e);
      setIsScanningAuto(false);
    }
  }, [api, pages, currentProject, processImportedFiles]);

  // Kiểm tra xem thư mục đầu vào hiện tại đã được đồng bộ vào Studio hay chưa
  const isFolderSyncedToStudio = useMemo(() => {
    if (!activeInputDir || pages.length === 0) return false;
    if (activeInputDir === detectedProjectDir && pages.length > 0) return true;
    if (autoScannedData?.files?.length > 0) {
      const normalizePath = (p) => (p || '').replace(/\\/g, '/').toLowerCase().trim();
      const existingPathSet = new Set(pages.map((p) => normalizePath(p.imagePath)).filter(Boolean));
      return autoScannedData.files.every((fp) => existingPathSet.has(normalizePath(fp)));
    }
    return false;
  }, [activeInputDir, detectedProjectDir, pages, autoScannedData]);

  // Kích hoạt đồng bộ thủ công từ Auto-Processing Modal ra Studio
  const handleTriggerSyncFromAuto = useCallback(async () => {
    let files = autoScannedData?.files;
    let fileDetails = autoScannedData?.fileDetails;
    let folderPath = autoScannedData?.folderPath || activeInputDir;

    if (!files || files.length === 0) {
      if (!folderPath) return;
      setIsScanningAuto(true);
      const scanRes = api?.translateListImagesInDirRecursive
        ? await api.translateListImagesInDirRecursive(folderPath)
        : await api?.translateScanFolderImages?.(folderPath);
      files = scanRes?.files || [];
      fileDetails = scanRes?.fileDetails || null;
      setAutoScannedCount(files.length);
      setAutoScannedData({ folderPath, files, fileDetails, count: files.length });
      setIsScanningAuto(false);
    }

    if (!files || files.length === 0) {
      setErrorModal({
        title: t('translate.studio.noImagesFoundTitle'),
        message: t('translate.studio.noImageInFolderDescDetailed', { dir: folderPath }),
      });
      return;
    }

    if (pages.length === 0) {
      await processImportedFiles(files, true, folderPath, fileDetails, true);
    } else {
      const folderBaseName = folderPath.split(/[/\\]/).filter(Boolean).pop() || t('translate.studio.projectNewDefaultName');
      setSyncFolderModal({
        folderPath,
        folderBaseName,
        files,
        fileDetails,
        count: files.length,
        currentProjectName: currentProject?.name || t('translate.studio.projectCurrentDefaultName'),
        currentPageCount: pages.length,
      });
    }
  }, [api, autoScannedData, activeInputDir, pages, currentProject, processImportedFiles]);

  const handleSelectAutoOutputDir = useCallback(async () => {
    try {
      const res = await api?.translateSelectFolder?.({ title: t('translate.studio.selectDestFolderTitle') });
      if (!res?.canceled && res?.folderPath) {
        setAutoOutputDir(res.folderPath);
      }
    } catch (e) {
      console.error('[AutoMode] Select output dir error:', e);
    }
  }, [api]);

  const handleStartAuto = useCallback(async () => {
    const inputDirToUse = activeInputDir;
    const outputDirToUse = activeOutputDir;
    if (!inputDirToUse || !outputDirToUse) {
      setErrorModal({
        title: t('translate.studio.missingFoldersTitle'),
        message: t('translate.studio.missingFoldersDesc'),
      });
      return;
    }

    try {
      setIsAutoProcessing(true);
      setAutoProgress(null);
      const res = await api?.translateStartAutoProcess?.({
        inputDir: inputDirToUse,
        outputDir: outputDirToUse,
        options: {
          autoProcessing: {
            skipExisting: autoSkipExisting,
          },
        },
      });
      if (!res?.success) {
        setIsAutoProcessing(false);
        setErrorModal({
          title: t('translate.studio.errorStartAuto'),
          message: res?.error || t('translate.studio.errorUnknown'),
        });
      }
    } catch (e) {
      setIsAutoProcessing(false);
      console.error('[AutoMode] Start error:', e);
    }
  }, [api, activeInputDir, activeOutputDir, autoSkipExisting]);

  const handleCancelAuto = useCallback(async () => {
    try {
      await api?.translateCancelAutoProcess?.();
      setIsAutoProcessing(false);
    } catch (e) {
      console.error('[AutoMode] Cancel error:', e);
    }
  }, [api]);

  const activePage = pages[activePageIndex] || pages[0] || null;
  const layers = Array.isArray(activePage?.layers) ? activePage.layers : [];
  const selectedLayer = layers.find((l) => l.id === selectedLayerId) || null;

  const fontOptions = useMemo(() => {
    const base = FONT_OPTIONS.map((f) => ({
      value: f.value,
      label: f.i18nKey ? t(f.i18nKey) : f.label,
      icon: 'font_download',
    }));
    const cur = resolveFontOptionValue(selectedLayer?.fontFamily);
    if (cur && !base.some((b) => b.value === cur)) {
      return [{ value: cur, label: cur, icon: 'font_download' }, ...base];
    }
    return base;
  }, [t, selectedLayer?.fontFamily]);

  const fontSizeOptions = useMemo(() => {
    const cur = selectedLayer?.fontSize ? String(selectedLayer.fontSize) : 'auto';
    if (cur !== 'auto' && !BASE_FONT_SIZE_OPTIONS.some((o) => o.value === cur)) {
      return [
        BASE_FONT_SIZE_OPTIONS[0],
        { value: cur, label: `${cur}px` },
        ...BASE_FONT_SIZE_OPTIONS.slice(1),
      ];
    }
    return BASE_FONT_SIZE_OPTIONS;
  }, [selectedLayer?.fontSize]);

  const fontWeightOptions = useMemo(() => {
    const cur = selectedLayer?.fontWeight ? String(selectedLayer.fontWeight) : '400';
    if (!FONT_WEIGHT_OPTIONS.some((o) => o.value === cur)) {
      return [{ value: cur, label: cur }, ...FONT_WEIGHT_OPTIONS];
    }
    return FONT_WEIGHT_OPTIONS;
  }, [selectedLayer?.fontWeight]);


  const containerW = (activePage?.width && activePage.width > 100)
    ? activePage.width
    : (imageRef.current?.naturalWidth || 800);
  const containerH = (activePage?.height && activePage.height > 100)
    ? activePage.height
    : (imageRef.current?.naturalHeight || 1200);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const containerWRef = useRef(containerW);
  containerWRef.current = containerW;
  const containerHRef = useRef(containerH);
  containerHRef.current = containerH;

  // Helper to clamp pan offset so manga page never scrolls away into endless void
  const clampPan = useCallback((targetPan, targetZoom = zoom, margin = 40) => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return targetPan;

    const vW = canvasEl.clientWidth;
    const vH = canvasEl.clientHeight;
    if (!vW || !vH) return targetPan;

    const s = targetZoom / 100;
    const sW = containerW * s;
    const sH = containerH * s;

    let maxX = 0;
    let minX = 0;
    if (sW > vW) {
      maxX = (sW - vW) / 2 + margin;
      minX = -maxX;
    } else {
      maxX = Math.max(0, (vW - sW) / 2);
      minX = -maxX;
    }

    let maxY = 0;
    let minY = 0;
    if (sH > vH) {
      maxY = (sH - vH) / 2 + margin;
      minY = -maxY;
    } else {
      maxY = Math.max(0, (vH - sH) / 2);
      minY = -maxY;
    }

    return {
      x: Math.max(minX, Math.min(maxX, Math.round(targetPan.x))),
      y: Math.max(minY, Math.min(maxY, Math.round(targetPan.y))),
    };
  }, [containerW, containerH, zoom]);

  // Kiểm tra một layer có thực sự bị sót chữ Nhật / lỗi dịch hay không
  const isLayerResidual = useCallback((l) => {
    if (!l) return false;
    // 1. Đã được đánh dấu tường minh là sót chữ Nhật
    if (l.hasResidualJapanese) return true;
    // 2. Chữ dịch hiển thị có chứa ký tự tiếng Nhật
    if (l.text && JAPANESE_CHAR_REGEX.test(l.text)) return true;
    // 3. Chỉ tính là lỗi dịch nếu layer ĐÃ CÓ chữ gốc (sourceText) nhưng translation bị đánh dấu thất bại
    if (Boolean(l.sourceText && l.sourceText.trim()) && l.isTranslated === false) return true;
    return false;
  }, [JAPANESE_CHAR_REGEX]);

  // Danh sách các layer còn sót chữ tiếng Nhật hoặc chưa dịch xong trên trang hiện tại
  const residualLayers = useMemo(() => {
    return layers.filter(isLayerResidual);
  }, [layers, isLayerResidual]);

  // Danh sách toàn bộ layers của cả Chapter kèm thông tin trang
  const allChapterLayersWithMeta = useMemo(() => {
    const list = [];
    pages.forEach((page, pageIdx) => {
      (page.layers || []).forEach((layer, layerIdx) => {
        list.push({
          layer,
          pageIndex: pageIdx,
          pageFilename: page.filename || t('translate.compare.pageBtn', { page: pageIdx + 1 }),
          pageDataUrl: page.dataUrl || page.originalDataUrl,
          layerIndexOnPage: layerIdx,
          id: `${pageIdx}-${layer.id || layerIdx}`,
        });
      });
    });
    return list;
  }, [pages]);

  // Danh sách và tổng số khung sót chữ tiếng Nhật trên toàn bộ Chapter
  const allChapterResidualLayers = useMemo(() => {
    return allChapterLayersWithMeta.filter(({ layer }) => isLayerResidual(layer));
  }, [allChapterLayersWithMeta, isLayerResidual]);

  // Number of untranslated pages (for batch options)
  const untranslatedCount = useMemo(() => {
    return pages.filter((p) => !p.layers || p.layers.length === 0).length;
  }, [pages]);

  // Subscribe to translation progress for live on-canvas feedback (Koharu style)
  useEffect(() => {
    if (!api) return;
    const unsubSingle = api.subscribeTranslateProgress?.((p) => {
      setTranslateProgress(p);
      if (p?.detail) {
        setStatusMessage({ text: p.detail, type: p.isQuota || p.warning ? 'error' : 'info' });
      }

      // Step 1: Detect -> Áp dụng ngay viền xanh bao quanh các bóng thoại trực tiếp lên canvas
      if (p?.step === 'detect' && Array.isArray(p.detections) && p.detections.length > 0) {
        setPages((prev) =>
          prev.map((page, idx) => {
            if (idx !== activePageIndex) return page;
            const liveLayers = p.detections.map((d, dIdx) => {
              const bbox = d.bbox || [0, 0, 100, 100];
              const hasBubble = d.hasBubble !== false;
              const textBbox = computeOptimalTextBox(bbox, d.textBbox, hasBubble);
              return {
                id: `layer-${activePageIndex}-${dIdx}-${Date.now()}`,
                type: 'dialogue',
                sourceText: '',
                text: '',
                bbox,
                textBbox,
                fontFamily: DEFAULT_STUDIO_FONT,
                fontSize: 'auto',
                fontWeight: '700',
                fontStyle: 'normal',
                color: '#000000',
                strokeColor: '#ffffff',
                strokeWidth: 1.5,
                align: 'center',
                direction: 'auto',
                textTransform: 'uppercase',
                hasBubble,
                fillBackground: false, // Do not fill background to see bubble position on original artwork
                visible: true,
                opacity: 1,
                isTranslated: false,
              };
            });
            return { ...page, layers: liveLayers };
          })
        );
      }

      // Step 2: Inpaint -> Lưu ảnh đã tẩy chữ vào cleanDataUrl (để user toggle sau).
      // GIỮ NGUYÊN fillBackground = true cho layers — vì Preview luôn hiển ảnh gốc.
      if (p?.step === 'inpaint') {
        setPages((prev) =>
          prev.map((page, idx) => {
            if (idx !== activePageIndex) return page;
            return {
              ...page,
              cleanDataUrl: p.cleanDataUrl || page.cleanDataUrl,
              // Không thay đổi fillBackground — giữ nguyên giá trị hiện tại của từng layer
            };
          })
        );
      }

      // Step 3 & 4: Translate & Verify -> Trực tiếp điền các câu thoại dịch vào đúng từng khung trên canvas
      // Luôn xây dựng lại toàn bộ layers từ translations để tránh layer cũ bị đè lận
      if ((p?.step === 'translate' || p?.step === 'verify') && Array.isArray(p.translations) && p.translations.length > 0) {
        setPages((prev) =>
          prev.map((page, idx) => {
            if (idx !== activePageIndex) return page;
            // Lấy các thuộc tính hiện có của layer (font, màu sắc, v.v.) để preserve
            const existingLayerMap = new Map((page.layers || []).map((l, i) => [i, l]));
            const newLayers = p.translations.map((trans, tIdx) => {
              // Kế thừa các thuộc tính tự do nếu có layer cũ tương ứng
              const existing = existingLayerMap.get(tIdx) || {};
              const rawText = trans.text || trans.translatedText || existing.text || '';
              const hasResidual = Boolean(trans.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(rawText));
              const bbox = trans.bbox || existing.bbox || [100, 100, 200, 150];
              const hasBubble = trans.hasBubble !== false;
              const textBbox = computeOptimalTextBox(bbox, trans.textBbox || existing.textBbox, hasBubble, existing.isCustomTextBox);
              return {
                id: existing.id || `layer-${activePageIndex}-${tIdx}-${Date.now()}`,
                type: 'dialogue',
                sourceText: trans.sourceText || trans.originalText || existing.sourceText || '',
                text: rawText,
                bbox,
                textBbox,
                fontFamily: existing.fontFamily || DEFAULT_STUDIO_FONT,
                fontSize: existing.fontSize || 'auto',
                fontWeight: existing.fontWeight || '700',
                fontStyle: existing.fontStyle || 'normal',
                color: existing.color || '#000000',
                strokeColor: existing.strokeColor || '#ffffff',
                strokeWidth: typeof existing.strokeWidth === 'number' ? existing.strokeWidth : 1.5,
                align: existing.align || 'center',
                direction: existing.direction || 'auto',
                textTransform: existing.textTransform || 'uppercase',
                hasBubble,
                // Chuẩn Koharu: text layer không tô đè hộp trắng lên viền khung gốc
                fillBackground: Boolean(existing.fillBackground === true),
                visible: existing.visible !== false,
                opacity: existing.opacity ?? 1,
                isTranslated: trans.isTranslated !== false && !hasResidual,
                hasResidualJapanese: hasResidual,
              };
            });
            return { ...page, layers: newLayers };
          })
        );
      }
      if (p?.logItem) {
        addLog(p.logItem.step || p.step, p.logItem.text, p.logItem.type || 'info', p.logItem);
      } else if (p?.detail) {
        addLog(p.step, p.detail, p.isQuota || p.warning ? 'warn' : 'info');
      }
      if (p?.detail) {
        setStatusMessage({ text: p.detail, type: p.isQuota || p.warning ? 'error' : 'info' });
      }
    });

    const unsubChapter = api.subscribeTranslateChapterProgress?.((p) => {
      setTranslateProgress(p);
      if (p?.logItem) {
        addLog(p.logItem.step || p.step, p.logItem.text, p.logItem.type || 'info', p.logItem);
      } else if (p?.detail) {
        addLog(p.step, p.detail, p.isQuota || p.warning ? 'warn' : 'info');
      }
      if (p?.detail) {
        setStatusMessage({ text: p.detail, type: p.isQuota || p.warning ? 'error' : 'info' });
      }
    });

    // Lắng nghe Streaming Checkpoint từng trang hoàn tất để cập nhật Canvas theo thời gian thực
    const unsubPageDone = api.subscribeTranslateChapterPageDone?.((pagePayload) => {
      if (!pagePayload?.imagePath) return;
      setPages((prevPages) => {
        return prevPages.map((p) => {
          if (p.imagePath !== pagePayload.imagePath && p.index !== pagePayload.index) return p;
          const rawTranslations = Array.isArray(pagePayload.translations) ? pagePayload.translations : [];
          const newLayers = rawTranslations.map((t, lIdx) => {
            const sourceText = t.sourceText || t.originalText || t.rawText || '';
            const text = t.text || t.translatedText || '';
            return {
              id: `layer-${p.index}-${lIdx}-${Date.now()}`,
              type: 'dialogue',
              sourceText,
              text,
              bbox: Array.isArray(t.bbox) ? [...t.bbox] : [100, 100, 200, 150],
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
              hasBubble: t.hasBubble !== false,
              fillBackground: false,
              visible: t.visible !== false,
              opacity: t.opacity ?? 1,
              isTranslated: t.isTranslated !== false,
            };
          });

          return {
            ...p,
            cleanDataUrl: pagePayload.cleanDataUrl || p.cleanDataUrl || null,
            layers: newLayers.length > 0 ? newLayers : p.layers,
          };
        });
      });
    });

    // Lắng nghe Intermediate Step Checkpoint (Detection / OCR / Translate hoàn tất cho từng trang)
    const unsubStepDone = api.subscribeTranslateChapterStepDone?.((stepPayload) => {
      if (!stepPayload?.path) return;
      setPages((prevPages) => {
        return prevPages.map((p) => {
          if (p.imagePath !== stepPayload.path && p.index !== stepPayload.pageIndex) return p;

          // Nếu vừa xong Detection: tạo layers mới nếu chưa có
          if (stepPayload.step === 'detect' && Array.isArray(stepPayload.detections)) {
            const rawDets = stepPayload.detections;
            if (!Array.isArray(p.layers) || p.layers.length === 0) {
              const newLayers = rawDets.map((d, lIdx) => ({
                id: `layer-${p.index}-${lIdx}-${Date.now()}`,
                type: 'dialogue',
                sourceText: '',
                text: '',
                bbox: Array.isArray(d.bbox) ? [...d.bbox] : [100, 100, 200, 150],
                fontFamily: DEFAULT_STUDIO_FONT,
                fontSize: 'auto',
                fontWeight: '700',
                fontStyle: 'normal',
                color: '#000000',
                strokeColor: '#ffffff',
                strokeWidth: 1.5,
                align: 'center',
                direction: 'auto',
                textTransform: 'uppercase',
                hasBubble: d.hasBubble !== false,
                fillBackground: false,
                visible: true,
                opacity: 1,
                isTranslated: null,
                hasResidualJapanese: false,
              }));
              return { ...p, layers: newLayers };
            }
          }

          // Nếu vừa xong OCR: cập nhật sourceText vào layers
          if (stepPayload.step === 'ocr' && Array.isArray(stepPayload.ocrResults) && Array.isArray(p.layers)) {
            const ocrMap = new Map();
            stepPayload.ocrResults.forEach((r, idx) => {
              ocrMap.set(idx, r.text);
              if (r.id !== undefined) ocrMap.set(r.id, r.text);
              if (r.index !== undefined) ocrMap.set(r.index, r.text);
            });
            const updated = p.layers.map((l, idx) => ({
              ...l,
              sourceText: ocrMap.get(idx) ?? ocrMap.get(l.id) ?? l.sourceText ?? '',
            }));
            return { ...p, layers: updated };
          }

          // Nếu vừa xong Translation: cập nhật text tiếng Việt
          if (stepPayload.step === 'translate' && Array.isArray(stepPayload.translations) && Array.isArray(p.layers)) {
            const transMap = new Map();
            stepPayload.translations.forEach((t, idx) => {
              transMap.set(idx, t);
              if (t.id !== undefined) transMap.set(t.id, t);
              if (t.index !== undefined) transMap.set(t.index, t);
            });
            const updated = p.layers.map((l, idx) => {
              const t = transMap.get(idx) ?? transMap.get(l.id);
              if (!t) return l;
              const transText = t.translatedText || t.text || l.text || '';
              return {
                ...l,
                text: transText,
                translatedText: transText,
                sourceText: t.sourceText || l.sourceText || '',
                isTranslated: t.isTranslated !== false,
                hasResidualJapanese: Boolean(t.hasResidualJapanese),
              };
            });
            return { ...p, layers: updated };
          }

          return p;
        });
      });
    });

    return () => {
      if (typeof unsubSingle === 'function') unsubSingle();
      if (typeof unsubChapter === 'function') unsubChapter();
      if (typeof unsubPageDone === 'function') unsubPageDone();
      if (typeof unsubStepDone === 'function') unsubStepDone();
    };
  }, [api, activePageIndex]);

  // Click outside to dismiss menus
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target)) {
        setShowModelDropdown(false);
      }
      if (runDropdownRef.current && !runDropdownRef.current.contains(e.target)) {
        setShowRunDropdown(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
      if (addPageDropdownRef.current && !addPageDropdownRef.current.contains(e.target)) {
        setShowAddPageDropdown(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-fit image to screen viewport
  const handleFitToScreen = useCallback((targetW, targetH) => {
    if (!canvasRef.current) return;
    const viewportW = canvasRef.current.clientWidth - 96;
    const viewportH = canvasRef.current.clientHeight - 96;
    const imgW = targetW || activePage?.width || 800;
    const imgH = targetH || activePage?.height || 1200;
    if (viewportW > 100 && viewportH > 100 && imgW > 0 && imgH > 0) {
      const fitScale = Math.min(viewportW / imgW, viewportH / imgH);
      const fitZoom = Math.max(25, Math.min(200, Math.round(fitScale * 100)));
      setZoom(fitZoom);
      setPan({ x: 0, y: 0 });
    }
  }, [activePage?.width, activePage?.height]);

  // Auto-load dataUrl and dimensions for any pages missing dataUrl in background
  useEffect(() => {
    if (!api?.translateReadImageDataUrl || !pages.length) return;

    // Find pages missing dataUrl or dimensions that are not currently fetching
    const missingPages = pages.filter(
      (p) => (!p.dataUrl || !p.width || p.width <= 100) && p.imagePath && !loadingPathsRef.current.has(p.imagePath)
    );
    if (!missingPages.length) return;

    // Prioritize active page first, then by distance to active page
    const sorted = [...missingPages].sort((a, b) => {
      const distA = Math.abs(a.index - activePageIndex);
      const distB = Math.abs(b.index - activePageIndex);
      return distA - distB;
    });

    // Process in batches of up to 6 items to prevent UI/memory stalls
    const batch = sorted.slice(0, 6);

    batch.forEach((p) => {
      loadingPathsRef.current.add(p.imagePath);
      loadPageImageData(p.imagePath, api).then((res) => {
        loadingPathsRef.current.delete(p.imagePath);
        if (res.dataUrl) {
          setPages((prev) =>
            prev.map((item) =>
              item.imagePath === p.imagePath
                ? {
                  ...item,
                  dataUrl: res.dataUrl,
                  originalDataUrl: res.dataUrl,
                  width: (item.width && item.width > 100) ? item.width : res.width,
                  height: (item.height && item.height > 100) ? item.height : res.height,
                }
                : item
            )
          );
        }
      }).catch(() => {
        loadingPathsRef.current.delete(p.imagePath);
      });
    });
  }, [pages, activePageIndex, api]);

  // Read natural image dimensions once image is loaded & auto-fit
  const handleImageLoaded = useCallback((e) => {
    const { naturalWidth, naturalHeight } = e.target;
    if (naturalWidth && naturalHeight) {
      setPages((prev) =>
        prev.map((p, i) =>
          i === activePageIndex
            ? { ...p, width: naturalWidth, height: naturalHeight }
            : p
        )
      );
      handleFitToScreen(naturalWidth, naturalHeight);
    }
  }, [activePageIndex, handleFitToScreen]);

  // Synchronize dimensions if cached
  useEffect(() => {
    if (imageRef.current && imageRef.current.complete) {
      const { naturalWidth, naturalHeight } = imageRef.current;
      if (naturalWidth > 100 && naturalHeight > 100) {
        if (!activePage?.width || activePage.width !== naturalWidth || !activePage?.height || activePage.height !== naturalHeight) {
          setPages((prev) =>
            prev.map((p, i) =>
              i === activePageIndex
                ? { ...p, width: naturalWidth, height: naturalHeight }
                : p
            )
          );
        }
      }
    }
  }, [activePageIndex, activePage?.width, activePage?.height, activePage?.dataUrl, activePage?.originalDataUrl]);

  // Update a property of the selected layer
  const updateSelectedLayer = useCallback((updates) => {
    if (!selectedLayerId) return;
    setPages((prev) => {
      const next = prev.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        const pageLayers = Array.isArray(p.layers) ? p.layers : [];
        return {
          ...p,
          layers: pageLayers.map((l) => {
            if (l.id !== selectedLayerId) return l;
            const updated = { ...l, ...updates };
            if (typeof updates.text === 'string') {
              updated.hasResidualJapanese = JAPANESE_CHAR_REGEX.test(updates.text);
              updated.isTranslated = true;
            }
            return updated;
          }),
        };
      });
      onUpdatePages?.(next);
      return next;
    });
  }, [selectedLayerId, activePageIndex, onUpdatePages]);

  // Đổi font chữ: nếu có layer chọn -> đổi layer đó; nếu chưa chọn -> đổi toàn bộ layer trên trang
  const handleFontChange = useCallback((newFontValue) => {
    if (selectedLayerId) {
      updateSelectedLayer({ fontFamily: newFontValue });
    } else {
      setPages((prev) => {
        const next = prev.map((p, pIdx) => {
          if (pIdx !== activePageIndex) return p;
          const pageLayers = Array.isArray(p.layers) ? p.layers : [];
          return {
            ...p,
            layers: pageLayers.map((l) => ({ ...l, fontFamily: newFontValue })),
          };
        });
        onUpdatePages?.(next);
        return next;
      });
      setStatusMessage({
        text: t('translate.studio.fontAppliedAllToast', { defaultValue: 'Đã cập nhật phông chữ cho toàn bộ khung thoại trên trang' }),
        type: 'success',
      });
    }
  }, [selectedLayerId, activePageIndex, updateSelectedLayer, onUpdatePages, t]);

  // Toggle visibility of a specific layer
  const toggleLayerVisibility = useCallback((layerId) => {
    setPages((prev) => {
      const next = prev.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        const pageLayers = Array.isArray(p.layers) ? p.layers : [];
        return {
          ...p,
          layers: pageLayers.map((l) =>
            l.id === layerId ? { ...l, visible: l.visible === false } : l
          ),
        };
      });
      onUpdatePages?.(next);
      return next;
    });
  }, [activePageIndex, onUpdatePages]);

  // Toggle visibility của toàn bộ text layers trên trang hiện tại
  const toggleAllTextLayersVisibility = useCallback(() => {
    setPages((prev) => {
      const currentPage = prev[activePageIndex];
      const pageLayers = Array.isArray(currentPage?.layers) ? currentPage.layers : [];
      if (pageLayers.length === 0) return prev;

      const allVisible = pageLayers.every((l) => l.visible !== false);
      const nextVisible = !allVisible;

      const next = prev.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        return {
          ...p,
          layers: (Array.isArray(p.layers) ? p.layers : []).map((l) => ({
            ...l,
            visible: nextVisible,
          })),
        };
      });
      onUpdatePages?.(next);
      return next;
    });
  }, [activePageIndex, onUpdatePages]);

  // Delete selected layer
  const deleteLayer = useCallback((idToDelete) => {
    const targetId = idToDelete || selectedLayerId;
    if (!targetId) return;
    setPages((prev) => {
      const next = prev.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        const pageLayers = Array.isArray(p.layers) ? p.layers : [];
        return {
          ...p,
          layers: pageLayers.filter((l) => l.id !== targetId),
        };
      });
      onUpdatePages?.(next);
      return next;
    });
    setExpandedLayerId((prev) => (prev === targetId ? null : prev));
    if (targetId === selectedLayerId) setSelectedLayerId(null);
  }, [selectedLayerId, activePageIndex, onUpdatePages]);

  // Xóa một trang khỏi danh sách Pages
  const handleRemovePage = useCallback((targetPageOrIndex) => {
    const targetIdx = typeof targetPageOrIndex === 'number'
      ? targetPageOrIndex
      : pages.findIndex((p) => p.id === targetPageOrIndex?.id || p.index === targetPageOrIndex?.index);
    if (targetIdx < 0 || targetIdx >= pages.length) return;

    const pageToRemove = pages[targetIdx];
    const nextPages = pages
      .filter((_, idx) => idx !== targetIdx)
      .map((p, newIdx) => ({
        ...p,
        index: newIdx,
        id: `page-${newIdx}`,
      }));

    setActivePageIndex((prevIdx) => {
      if (nextPages.length === 0) return 0;
      if (prevIdx === targetIdx) {
        return Math.min(targetIdx, nextPages.length - 1);
      }
      if (prevIdx > targetIdx) {
        return prevIdx - 1;
      }
      return prevIdx;
    });

    setSelectedLayerId(null);
    setPages(nextPages);
    onUpdatePages?.(nextPages);

    if (pageToRemove?.imagePath) {
      loadingPathsRef.current.delete(pageToRemove.imagePath);
    }

    // Xóa blob files & pipeline cache của ảnh này trên đĩa
    api?.translateDeletePageBlobs?.(pageToRemove, nextPages, currentProject?.id).catch(() => { });

    // Cập nhật session trên đĩa ngay lập tức (không chờ 3s debounce để tránh mất đồng bộ nếu user đóng app)
    if (saveSessionTimerRef.current) clearTimeout(saveSessionTimerRef.current);
    if (nextPages.length === 0) {
      api?.translateClearSession?.(currentProject?.id).catch(() => { });
      setProjectsList((prev) =>
        prev.map((p) => (p.id === currentProject?.id ? { ...p, pageCount: 0, coverThumb: null } : p))
      );
    } else {
      const serializablePages = serializePagesForSession(nextPages);
      api?.translateSaveSession?.({
        projectId: currentProject?.id,
        pages: serializablePages,
        activePageIndex: Math.min(targetIdx, nextPages.length - 1),
        name: currentProject?.name,
      }).catch(() => { });
      setProjectsList((prev) =>
        prev.map((p) => (p.id === currentProject?.id ? { ...p, pageCount: nextPages.length } : p))
      );
    }

    setStatusMessage({
      type: 'info',
      text: t('translate.studio.toastPageDeleted', { name: pageToRemove?.filename || targetIdx + 1 }),
    });
  }, [pages, onUpdatePages, api, serializePagesForSession, currentProject]);

  // Xóa tất cả các trang khỏi Studio
  const handleRemoveAllPages = useCallback(async () => {
    if (saveSessionTimerRef.current) clearTimeout(saveSessionTimerRef.current);
    try {
      await api?.translateClearSession?.(currentProject?.id);
      setProjectsList((prev) =>
        prev.map((p) => (p.id === currentProject?.id ? { ...p, pageCount: 0, coverThumb: null } : p))
      );
    } catch (_) { }
    setPages([]);
    setActivePageIndex(0);
    setSelectedLayerId(null);
    onUpdatePages?.([]);
    loadingPathsRef.current.clear();
    setStatusMessage({
      type: 'info',
      text: t('translate.studio.toastAllPagesDeleted'),
    });
  }, [api, onUpdatePages, currentProject]);

  // Kích hoạt xác nhận xóa trang (nếu có layer thì hỏi xác nhận, nếu rỗng hoặc giữ Shift thì xóa ngay)
  const handlePromptRemovePage = useCallback((targetPage, e) => {
    if (e) e.stopPropagation();
    if (!targetPage) return;
    if (e?.shiftKey || !targetPage.layers || targetPage.layers.length === 0) {
      handleRemovePage(targetPage);
    } else {
      setPageToDelete(targetPage);
    }
  }, [handleRemovePage]);

  // Duplicate layer
  const handleDuplicateLayer = useCallback(() => {
    if (!selectedLayer || !activePage) return;
    const [x, y, w, h] = selectedLayer.bbox;
    const [tx, ty, tw, th] = selectedLayer.textBbox || [x, y, w, h];
    const duplicated = {
      ...selectedLayer,
      id: `layer-${activePageIndex}-${Date.now()}`,
      bbox: [x + 20, y + 20, w, h],
      textBbox: [tx + 20, ty + 20, tw, th],
    };
    setPages((prev) => {
      const next = prev.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        return { ...p, layers: [...p.layers, duplicated] };
      });
      onUpdatePages?.(next);
      return next;
    });
    setSelectedLayerId(duplicated.id);
  }, [selectedLayer, activePage, activePageIndex, onUpdatePages]);

  // Add new blank text layer
  const handleAddTextLayer = useCallback(() => {
    if (!activePage) return;
    const w = Math.round((activePage.width || 800) * 0.25);
    const h = Math.round((activePage.height || 1200) * 0.15);
    const x = Math.round(((activePage.width || 800) - w) / 2);
    const y = Math.round(((activePage.height || 1200) - h) / 2);

    const newLayer = {
      id: `layer-${activePageIndex}-${Date.now()}`,
      type: 'dialogue',
      sourceText: '',
      text: t('translate.studio.defaultDialogueText'),
      bbox: [x, y, w, h],
      textBbox: computeOptimalTextBox([x, y, w, h], null, true),
      fontFamily: DEFAULT_STUDIO_FONT,
      fontSize: 'auto',
      fontWeight: '700',
      fontStyle: 'normal',
      color: '#000000',
      strokeColor: '#ffffff',
      strokeWidth: 1.5,
      align: 'center',
      direction: 'auto',
      textTransform: 'uppercase',
      fillBackground: false,
      visible: true,
      opacity: 1,
      isTranslated: true,
    };

    setPages((prev) => {
      const next = prev.map((p, pIdx) => {
        const pageLayers = Array.isArray(p.layers) ? p.layers : [];
        return pIdx === activePageIndex ? { ...p, layers: [...pageLayers, newLayer] } : p;
      });
      onUpdatePages?.(next);
      return next;
    });
    setSelectedLayerId(newLayer.id);
    setExpandedLayerId(newLayer.id);
    setActiveTool('select');
    setActiveRightTab('properties');
    setShowRightSidebar(true);
    setTimeout(() => {
      layerTextareaRef.current?.focus();
      layerTextareaRef.current?.select();
    }, 50);
  }, [activePage, activePageIndex, onUpdatePages]);

  // --- Mouse & Touch interaction for Drag / Resize ---
  const handleMouseDownOnLayer = (e, layer, target = 'bubble') => {
    // If hand tool is active, space is pressed, or middle mouse clicked: pan canvas instead of selecting/dragging layer
    if (activeTool === 'hand' || isSpacePressed || spacePressedRef.current || e.button === 1) {
      handleCanvasMouseDown(e);
      return;
    }
    e.stopPropagation();
    setSelectedLayerId(layer.id);
    setExpandedLayerId(layer.id);
    setIsTextGroupCollapsed(false);
    setActiveRightTab('properties');
    setShowRightSidebar(true);

    const bubbleBbox = Array.isArray(layer.bbox) && layer.bbox.length === 4
      ? [...layer.bbox]
      : [0, 0, 100, 100];
    const textBbox = computeOptimalTextBox(bubbleBbox, layer.textBbox, layer.hasBubble !== false, layer.isCustomTextBox);

    setInteraction({
      type: 'drag',
      target, // 'bubble' | 'textBox' | 'top-pin'
      startX: e.clientX,
      startY: e.clientY,
      origBubbleBbox: bubbleBbox,
      origTextBbox: textBbox,
    });
  };

  const handleDoubleClickOnLayer = (e, layer) => {
    e.stopPropagation();
    if (activeTool === 'hand' || isSpacePressed || spacePressedRef.current) return;
    setSelectedLayerId(layer.id);
    setExpandedLayerId(layer.id);
    setIsTextGroupCollapsed(false);
    setActiveRightTab('properties');
    setShowRightSidebar(true);
    setTimeout(() => {
      layerTextareaRef.current?.focus();
      layerTextareaRef.current?.select();
    }, 50);
  };

  const handleMouseDownOnHandle = (e, layer, handle, target = 'textBox') => {
    e.stopPropagation();
    if (activeTool === 'hand' || isSpacePressed || spacePressedRef.current) return;
    setSelectedLayerId(layer.id);

    const bubbleBbox = Array.isArray(layer.bbox) && layer.bbox.length === 4
      ? [...layer.bbox]
      : [0, 0, 100, 100];
    const textBbox = computeOptimalTextBox(bubbleBbox, layer.textBbox, layer.hasBubble !== false, layer.isCustomTextBox);

    setInteraction({
      type: 'resize',
      target, // 'textBox' | 'bubble'
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origBubbleBbox: bubbleBbox,
      origTextBbox: textBbox,
    });
  };

  // Mouse move handler on canvas for drag & resize & pan
  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      const deltaX = e.clientX - panStartRef.current.x;
      const deltaY = e.clientY - panStartRef.current.y;
      setPan((prev) => clampPan({ x: prev.x + deltaX, y: prev.y + deltaY }, zoom, 80));
      panStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!interaction || !selectedLayerId || !activePage) return;

    const scale = zoom / 100;
    const dx = (e.clientX - interaction.startX) / scale;
    const dy = (e.clientY - interaction.startY) / scale;
    const pageW = activePage.width || 1200;
    const pageH = activePage.height || 1600;

    const [bx, by, bw, bh] = interaction.origBubbleBbox;
    const [tx, ty, tw, th] = interaction.origTextBbox;

    if (interaction.type === 'drag') {
      // Kéo khung text / chốt pin: di chuyển vị trí textBbox độc lập trong khung thoại chuẩn Koharu
      const newTx = Math.max(0, Math.min(pageW - tw, Math.round(tx + dx)));
      const newTy = Math.max(0, Math.min(pageH - th, Math.round(ty + dy)));

      updateSelectedLayer({
        textBbox: [newTx, newTy, tw, th],
        isCustomTextBox: true,
      });
    } else if (interaction.type === 'resize') {
      const h = interaction.handle;

      // Resize khung chat text chuẩn Koharu (8 handles)
      let x = tx, y = ty, w = tw, height = th;
      if (h.includes('e')) w = Math.max(20, Math.round(tw + dx));
      if (h.includes('s')) height = Math.max(20, Math.round(th + dy));
      if (h.includes('w')) {
        const potentialW = Math.max(20, Math.round(tw - dx));
        x = tx + (tw - potentialW);
        w = potentialW;
      }
      if (h.includes('n')) {
        const potentialH = Math.max(20, Math.round(th - dy));
        y = ty + (th - potentialH);
        height = potentialH;
      }
      updateSelectedLayer({
        textBbox: [x, y, w, height],
        isCustomTextBox: true,
      });
    }
  }, [isPanning, interaction, selectedLayerId, activePage, zoom, updateSelectedLayer, clampPan]);

  const handleMouseUp = useCallback(() => {
    if (interaction) {
      onUpdatePages?.(pages);
    }
    setInteraction(null);
    setIsPanning(false);
  }, [interaction, pages, onUpdatePages]);

  // Canvas Pan start
  const handleCanvasMouseDown = (e) => {
    if (activeTool === 'hand' || e.button === 1 || isSpacePressed || spacePressedRef.current) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
    } else {
      setSelectedLayerId(null);
    }
  };

  // Zoom controls
  const handleZoomChange = (newZoom) => {
    const clampedZoom = Math.max(20, Math.min(400, newZoom));
    setZoom(clampedZoom);
    zoomRef.current = clampedZoom;
    setPan((prev) => {
      const canvasEl = canvasRef.current;
      if (!canvasEl) return prev;
      const vW = canvasEl.clientWidth;
      const vH = canvasEl.clientHeight;
      const s = clampedZoom / 100;
      const sW = containerW * s;
      const sH = containerH * s;
      if (sW <= vW && sH <= vH) {
        return { x: 0, y: 0 };
      }
      return clampPan(prev, clampedZoom, 40);
    });
  };

  const handleResetZoom = () => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  };

  // Mouse wheel: Pan vertically / horizontally & Ctrl+Wheel zoom
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom in / out smoothly centered
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.max(20, Math.min(400, Math.round(zoomRef.current * factor)));
        setZoom(newZoom);
        zoomRef.current = newZoom;

        const el = canvasRef.current;
        if (el) {
          const vW = el.clientWidth;
          const vH = el.clientHeight;
          const s = newZoom / 100;
          const sW = containerWRef.current * s;
          const sH = containerHRef.current * s;

          setPan((prev) => {
            if (sW <= vW && sH <= vH) {
              return { x: 0, y: 0 };
            }
            let maxX = (sW > vW) ? (sW - vW) / 2 + 40 : Math.max(0, (vW - sW) / 2);
            let minX = -maxX;
            let maxY = (sH > vH) ? (sH - vH) / 2 + 40 : Math.max(0, (vH - sH) / 2);
            let minY = -maxY;
            return {
              x: Math.max(minX, Math.min(maxX, prev.x)),
              y: Math.max(minY, Math.min(maxY, prev.y)),
            };
          });
        }
      } else {
        // Natural scroll / pan in both X and Y
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;

        const el = canvasRef.current;
        const vW = el ? el.clientWidth : 800;
        const vH = el ? el.clientHeight : 600;
        const s = zoomRef.current / 100;
        const sW = containerWRef.current * s;
        const sH = containerHRef.current * s;

        // If the dimension fits on screen, do NOT scroll it away into empty space!
        const effectiveDx = (sW > vW) ? dx : 0;
        const effectiveDy = (sH > vH) ? dy : 0;

        if (effectiveDx === 0 && effectiveDy === 0) {
          // Entire image fits on screen: keep centered
          setPan((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
          return;
        }

        const margin = 40;
        let maxX = (sW > vW) ? (sW - vW) / 2 + margin : Math.max(0, (vW - sW) / 2);
        let minX = -maxX;
        let maxY = (sH > vH) ? (sH - vH) / 2 + margin : Math.max(0, (vH - sH) / 2);
        let minY = -maxY;

        setPan((prev) => ({
          x: Math.max(minX, Math.min(maxX, Math.round(prev.x - effectiveDx))),
          y: Math.max(minY, Math.min(maxY, Math.round(prev.y - effectiveDy))),
        }));
      }
    };

    canvasEl.addEventListener('wheel', onWheel, { passive: false });
    return () => canvasEl.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Spacebar hold for temporary hand pan tool (Photoshop/Figma standard)
      if (e.code === 'Space' && !spacePressedRef.current) {
        e.preventDefault();
        spacePressedRef.current = true;
        setIsSpacePressed(true);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLayerId) {
          deleteLayer(selectedLayerId);
        }
      } else if (e.key === 'Escape') {
        if (selectedLayerId) {
          setSelectedLayerId(null);
        } else if (onClose) {
          onClose();
        }
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      } else if (e.key === 't' || e.key === 'T') {
        handleAddTextLayer();
      } else if (e.key === 'h' || e.key === 'H') {
        setActiveTool((prev) => (prev === 'hand' ? 'select' : 'hand'));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleFitToScreen();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        handleResetZoom();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (e.shiftKey) {
          toggleLeftSidebar();
        } else {
          toggleRightSidebar();
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false;
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedLayerId, deleteLayer, handleFitToScreen, handleAddTextLayer, onClose, toggleRightSidebar, toggleLeftSidebar]);

  // --- Export Actions (WYSIWYG 100% Matching Studio Preview & Smart Verification Gate) ---
  const doExportCurrentPage = async () => {
    if (!api?.translateExportEditedPage || !activePage) return;
    setIsExporting(true);
    setStatusMessage({ text: t('translate.studio.renderingPage'), type: 'info' });

    try {
      // 1. Render bằng HTML5 Canvas của Chromium ở độ phân giải gốc 100%
      const rendered = await renderPageToDataUrl(
        activePage,
        { showCleanupLayer, fillBackground: false, quality: 92 },
        api
      );

      const outputDir = activePage.savedPath
        ? activePage.savedPath.substring(0, activePage.savedPath.lastIndexOf('/'))
        : undefined;

      const pageLayers = Array.isArray(activePage.layers) ? activePage.layers : [];
      const res = await api.translateExportEditedPage({
        imagePath: activePage.imagePath,
        layers: pageLayers.filter((l) => l.visible),
        renderedDataUrl: rendered?.dataUrl,
        options: {
          quality: 92,
          fillBackground: false,
          outputDir,
          savePath: activePage.savedPath || undefined,
        },
      });

      if (res?.success) {
        const sizeKb = Math.round((res.savedBytes || 0) / 1024);
        const folderToOpen = res.savePath ? res.savePath.substring(0, res.savePath.lastIndexOf('/')) : outputDir;
        setStatusMessage({
          text: t('translate.studio.renderedPageSuccess', { path: res.savePath, size: sizeKb }),
          type: 'success',
          action: folderToOpen ? {
            label: t('translate.studio.completionOpenFolderBtn'),
            onClick: () => {
              if (api?.translateOpenFolder) api.translateOpenFolder(folderToOpen);
            },
          } : undefined,
        });

        // Tự động mở thư mục nếu được bật
        if (autoOpenExportFolder && folderToOpen && api?.translateOpenFolder) {
          api.translateOpenFolder(folderToOpen);
        }

        if (res.dataUrl) {
          setPages((prev) =>
            prev.map((p, i) =>
              i === activePageIndex
                ? { ...p, savedPath: res.savePath, dataUrl: res.dataUrl, translatedImageDataUrl: res.dataUrl }
                : p
            )
          );
        }
        onSavePage?.({
          index: activePageIndex,
          savePath: res.savePath,
          dataUrl: res.dataUrl,
          layers: pageLayers,
          width: activePage.width,
          height: activePage.height,
        });
      } else {
        setStatusMessage({ text: t('translate.studio.exportPageError', { error: res?.error || 'Unknown' }), type: 'error' });
      }
    } catch (err) {
      console.error('[MangaStudioEditor] handleExportCurrentPage error:', err);
      setStatusMessage({ text: t('translate.studio.exportPageError', { error: err.message }), type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCurrentPage = async () => {
    if (!activePage) return;
    const hasLayers = Array.isArray(activePage.layers) && activePage.layers.some((l) => l.text && l.text.trim());
    if (!hasLayers) {
      setExportConfirmModal({
        type: 'single',
        title: t('translate.studio.singleUntranslatedTitle'),
        message: t('translate.studio.singleUntranslatedDesc', { name: activePage.filename || t('translate.compare.pageBtn', { page: activePageIndex + 1 }) }),
        confirmText: t('translate.studio.singleUntranslatedConfirm'),
        onConfirm: () => doExportCurrentPage(),
      });
      return;
    }
    doExportCurrentPage();
  };

  const doExportAllChapter = async (options = { includeUntranslated: true }) => {
    if (!api?.translateExportEditedPage || pages.length === 0) return;
    setIsExporting(true);
    let successCount = 0;

    const pagesToExport = options.includeUntranslated
      ? pages
      : pages.filter((p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim()));

    if (pagesToExport.length === 0) {
      setStatusMessage({ text: t('translate.studio.noPageEligibleExport'), type: 'warn' });
      setIsExporting(false);
      return;
    }

    // Xác định thư mục gốc đầu ra: _translated cạnh thư mục gốc import
    const baseDir = pages[0]?.imagePath
      ? (() => {
        // Nếu page có subfolder → lấy thư mục cha của ảnh gốc lùi lên theo số level subfolder
        const sub = pages[0].subfolder || '';
        const parentDir = pages[0].imagePath.substring(0, pages[0].imagePath.lastIndexOf('/'));
        if (sub) {
          // Lùi lên đúng số tầng subfolder
          const levels = sub.split(/[/\\]/).filter(Boolean).length;
          let dir = parentDir;
          for (let l = 0; l < levels; l++) {
            dir = dir.substring(0, dir.lastIndexOf('/'));
          }
          return dir;
        }
        return parentDir;
      })()
      : null;
    const outputBaseDir = baseDir ? `${baseDir}/_translated` : null;

    for (let i = 0; i < pagesToExport.length; i++) {
      const p = pagesToExport[i];
      setStatusMessage({ text: t('translate.studio.renderingPageProgress', { current: i + 1, total: pagesToExport.length }), type: 'info' });
      try {
        const rendered = await renderPageToDataUrl(
          p,
          { showCleanupLayer, fillBackground: false, quality: 92 },
          api
        );

        const pageLayers = Array.isArray(p.layers) ? p.layers : [];

        // Tính savePath giữ nguyên cấu trúc thư mục con khi export
        let computedSavePath = p.savedPath || undefined;
        if (!computedSavePath && outputBaseDir && p.subfolder) {
          const origExt = p.imagePath ? p.imagePath.substring(p.imagePath.lastIndexOf('.')) : '.jpg';
          const ext = origExt.toLowerCase() === '.png' ? '.png' : (origExt.toLowerCase() === '.webp' ? '.webp' : '.jpg');
          const baseName = p.imagePath.split(/[/\\]/).pop().replace(/\.[^.]+$/, '') + '_translated' + ext;
          computedSavePath = `${outputBaseDir}/${p.subfolder}/${baseName}`;
        }

        const res = await api.translateExportEditedPage({
          imagePath: p.imagePath,
          layers: pageLayers.filter((l) => l.visible),
          renderedDataUrl: rendered?.dataUrl,
          options: {
            quality: 92,
            fillBackground: false,
            savePath: computedSavePath,
            ...(outputBaseDir && !p.subfolder ? { outputDir: outputBaseDir } : {}),
          },
        });
        if (res?.success) {
          successCount++;
          if (res.dataUrl) {
            setPages((prev) =>
              prev.map((item) =>
                item.imagePath === p.imagePath
                  ? { ...item, savedPath: res.savePath, dataUrl: res.dataUrl, translatedImageDataUrl: res.dataUrl }
                  : item
              )
            );
          }
        }
      } catch (e) {
        console.error(`Export page ${i} failed:`, e);
      }
    }

    setIsExporting(false);
    const targetFolderToOpen = outputBaseDir || (pagesToExport[0]?.savedPath ? pagesToExport[0].savedPath.substring(0, pagesToExport[0].savedPath.lastIndexOf('/')) : null);
    setStatusMessage({
      text: t('translate.studio.exportAllSuccess', { count: successCount, total: pagesToExport.length, path: outDir }),
      type: 'success',
      action: targetFolderToOpen ? {
        label: t('translate.studio.completionOpenFolderBtn'),
        onClick: () => {
          if (api?.translateOpenFolder) api.translateOpenFolder(targetFolderToOpen);
        },
      } : undefined,
    });

    if (autoOpenExportFolder && targetFolderToOpen && api?.translateOpenFolder) {
      api.translateOpenFolder(targetFolderToOpen);
    }

    onSaveChapter?.({
      outputDir: outputBaseDir || (activePage?.savedPath ? activePage.savedPath.substring(0, activePage.savedPath.lastIndexOf('/')) : undefined),
      savedPaths: pages.map((p) => p.savedPath).filter(Boolean),
      pages,
    });
  };

  const handleExportAllChapter = async () => {
    if (!pages || pages.length === 0) return;
    const translatedPages = pages.filter((p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim()));
    const untranslatedCount = pages.length - translatedPages.length;

    if (translatedPages.length === 0) {
      // 100% trang chưa có bản dịch
      setExportConfirmModal({
        type: 'all_untranslated',
        title: t('translate.studio.noTranslatedPageTitle'),
        message: t('translate.studio.exportChapterConfirmDesc', { count: pages.length }),
        confirmText: t('translate.studio.exportChapterConfirmBtn'),
        onConfirm: () => doExportAllChapter({ includeUntranslated: true }),
      });
      return;
    }

    if (untranslatedCount > 0) {
      // Có trang đã dịch và có trang chưa dịch
      setExportConfirmModal({
        type: 'partial_chapter',
        title: t('translate.studio.exportChapterConfirmTitle'),
        translatedCount: translatedPages.length,
        untranslatedCount,
        totalCount: pages.length,
        isCbz: false,
        onConfirm: (includeUntranslated) => doExportAllChapter({ includeUntranslated }),
      });
      return;
    }

    doExportAllChapter({ includeUntranslated: true });
  };

  const currentDirectory = useMemo(() => {
    if (propSelectedDir) return propSelectedDir;
    if (activePage?.imagePath) {
      return activePage.imagePath.substring(0, activePage.imagePath.lastIndexOf('/'));
    }
    return '';
  }, [propSelectedDir, activePage?.imagePath]);

  const doExportCbz = async (options = { includeUntranslated: true }) => {
    if (!pages || pages.length === 0) {
      setStatusMessage({ text: t('translate.studio.noPageForCbz'), type: 'warn' });
      return;
    }
    setIsExporting(true);
    setStatusMessage({ text: t('translate.studio.packagingCbz'), type: 'info' });
    try {
      const pagesToInclude = options.includeUntranslated
        ? pages
        : pages.filter((p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim()));

      let pathsToExport = pagesToInclude.map((p) => p.savedPath).filter(Boolean);
      if (pathsToExport.length < pagesToInclude.length) {
        await doExportAllChapter(options);
        pathsToExport = pagesToInclude.map((p) => p.savedPath).filter(Boolean);
      }
      if (pathsToExport.length > 0 && api?.translateExportCbz) {
        const folderName = currentDirectory ? currentDirectory.split(/[/\\]/).filter(Boolean).pop() : (chapterTitle || 'Manga');
        const title = `${folderName} [Translated]`;
        const res = await api.translateExportCbz({
          imagePaths: pathsToExport,
          title,
        });
        if (res?.success) {
          const folderToOpen = res.filePath ? res.filePath.substring(0, res.filePath.lastIndexOf('/')) : null;
          setStatusMessage({
            text: t('translate.studio.exportCbzSuccess', { path: res.filePath }),
            type: 'success',
            action: (res.filePath || folderToOpen) ? {
              label: t('translate.studio.completionOpenFolderBtn'),
              onClick: () => {
                if (api?.translateOpenFolder) {
                  api.translateOpenFolder(res.filePath || folderToOpen);
                }
              },
            } : undefined,
          });
          if (autoOpenExportFolder && (res.filePath || folderToOpen) && api?.translateOpenFolder) {
            api.translateOpenFolder(res.filePath || folderToOpen);
          }
        } else if (!res?.canceled) {
          setStatusMessage({ text: t('translate.studio.exportCbzError', { error: 'Failed' }), type: 'error' });
        }
      } else {
        setStatusMessage({ text: t('translate.studio.noImagesForCbz'), type: 'warn' });
      }
    } catch (err) {
      console.error('[MangaStudioEditor] handleExportCbz error:', err);
      setStatusMessage({ text: t('translate.studio.exportCbzError', { error: err.message }), type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCbz = async () => {
    if (!pages || pages.length === 0) {
      setStatusMessage({ text: t('translate.studio.noPageForCbz'), type: 'warn' });
      return;
    }
    const translatedPages = pages.filter((p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim()));
    const untranslatedCount = pages.length - translatedPages.length;

    if (translatedPages.length === 0) {
      setExportConfirmModal({
        type: 'all_untranslated_cbz',
        title: t('translate.studio.noTranslatedPageTitle'),
        message: t('translate.studio.exportCbzConfirmDesc', { count: pages.length }),
        confirmText: t('translate.studio.exportCbzConfirmBtn'),
        onConfirm: () => doExportCbz({ includeUntranslated: true }),
      });
      return;
    }

    if (untranslatedCount > 0) {
      setExportConfirmModal({
        type: 'partial_chapter',
        title: t('translate.studio.exportCbzConfirmTitle'),
        translatedCount: translatedPages.length,
        untranslatedCount,
        totalCount: pages.length,
        isCbz: true,
        onConfirm: (includeUntranslated) => doExportCbz({ includeUntranslated }),
      });
      return;
    }

    doExportCbz({ includeUntranslated: true });
  };

  // Import image files (multi-file selection)
  const handleImportFiles = async () => {
    try {
      if (api?.selectImageFiles) {
        const filePaths = await api.selectImageFiles();
        if (filePaths && filePaths.length > 0) {
          processImportedFiles(filePaths, false);
        }
      } else if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    } catch (err) {
      console.error('[MangaStudioEditor] handleImportFiles error:', err);
      setErrorModal({
        title: t('translate.studio.selectImageError'),
        message: err.message || t('translate.studio.errorUnknown'),
      });
    }
  };

  // Import entire image directory (folder selection) — hỗ trợ đệ quy (sub-folders)
  const handleImportFolder = async () => {
    try {
      if (api?.selectDirectory) {
        const dir = await api.selectDirectory();
        if (!dir) return;
        // Ưu tiên quét đệ quy; fallback về shallow nếu API chưa có
        const res = api.translateListImagesInDirRecursive
          ? await api.translateListImagesInDirRecursive(dir)
          : await api.translateListImagesInDir?.(dir);
        if (!res?.ok || !Array.isArray(res.files) || res.files.length === 0) {
          setErrorModal({
            title: t('translate.studio.noImageInFolder'),
            message: res?.error || t('translate.studio.noImageInFolderDescDetailed', { dir }),
          });
          return;
        }
        const subCount = res.subfolderCount || 0;
        if (subCount > 0) {
          console.log(`[MangaStudioEditor] Scanned recursively ${subCount} subfolders, total ${res.files.length} images.`);
        }
        processImportedFiles(res.files, true, dir, res.fileDetails || null);
      } else if (folderInputRef.current) {
        folderInputRef.current.click();
      }
    } catch (err) {
      console.error('[MangaStudioEditor] handleImportFolder error:', err);
      setErrorModal({
        title: t('translate.studio.selectFolderErrorTitle'),
        message: err.message || t('translate.studio.selectFolderErrorDesc'),
      });
    }
  };



  // HTML Web Fallback for file selection (lọc chống trùng theo đường dẫn)
  const handleHtmlFileInputChange = async (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (!rawFiles.length) return;

    const normalizePath = (p) => (p || '').replace(/\\/g, '/').toLowerCase().trim();
    const existingSet = new Set(
      pages.map((p) => normalizePath(p.imagePath || p.relPath || p.filename)).filter(Boolean)
    );
    const files = rawFiles.filter((f) => {
      const p = normalizePath(f.webkitRelativePath || f.path || f.name);
      return !existingSet.has(p);
    });

    if (files.length === 0) {
      setStatusMessage({
        text: t('translate.studio.toastAllSelectedImagesInList', { count: sorted.length }),
        type: 'info',
      });
      e.target.value = '';
      return;
    }
    const duplicateCount = rawFiles.length - files.length;

    const sorted = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
    const startIndex = pages.length;
    const loadedPages = await Promise.all(
      sorted.map(async (file, idx) => {
        const url = URL.createObjectURL(file);
        const dims = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 1200 });
          img.onerror = () => resolve({ width: 800, height: 1200 });
          img.src = url;
        });
        return {
          id: `page-${Date.now()}-${idx}`,
          index: startIndex + idx,
          imagePath: file.path || file.name,
          filename: file.name,
          dataUrl: url,
          originalDataUrl: url,
          translatedImageDataUrl: null,
          width: dims.width,
          height: dims.height,
          layers: [],
        };
      })
    );
    const nextPages = pages.length === 0 ? loadedPages : [...pages, ...loadedPages].map((p, i) => ({ ...p, index: i }));
    setPages(nextPages);
    if (pages.length === 0) setActivePageIndex(0);
    else setActivePageIndex(startIndex);
    onUpdatePages?.(nextPages);
    setStatusMessage({
      text: duplicateCount > 0
        ? t('translate.studio.toastFilesLoaded', { count: sorted.length, dup: duplicateCount })
        : t('translate.studio.toastFilesLoadedSuccess', { count: sorted.length }),
      type: 'success',
    });
    e.target.value = '';
  };

  // HTML Web Fallback for folder selection
  const handleHtmlFolderInputChange = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)
    );
    if (!files.length) {
      setErrorModal({
        title: t('translate.studio.noImageInFolder'),
        message: t('translate.studio.noImageInFolderDesc'),
      });
      return;
    }
    const sorted = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
    const loadedPages = await Promise.all(
      sorted.map(async (file, idx) => {
        const url = URL.createObjectURL(file);
        const dims = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 1200 });
          img.onerror = () => resolve({ width: 800, height: 1200 });
          img.src = url;
        });
        return {
          id: `page-${Date.now()}-${idx}`,
          index: idx,
          imagePath: file.path || file.name,
          filename: file.name,
          dataUrl: url,
          originalDataUrl: url,
          translatedImageDataUrl: null,
          width: dims.width,
          height: dims.height,
          layers: [],
        };
      })
    );
    setPages(loadedPages);
    setActivePageIndex(0);
    setSelectedLayerId(null);
    onUpdatePages?.(loadedPages);
    setStatusMessage({ text: t('translate.studio.toastFolderLoaded', { folder: '', count: sorted.length }), type: 'success' });
    e.target.value = '';
  };

  // Drag & drop files onto Studio canvas
  const handleCanvasDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    const imageFiles = files.filter((f) => /\.(jpe?g|png|webp|gif|bmp|avif|tiff)$/i.test(f.name || ''));
    if (!imageFiles.length) return;
    const filePaths = imageFiles.map((f) => f.path).filter(Boolean);
    if (filePaths.length > 0 && api?.translateReadImageDataUrl) {
      processImportedFiles(filePaths, false);
    } else {
      handleHtmlFileInputChange({ target: { files: imageFiles } });
    }
  }, [api, processImportedFiles]);

  const handleOpenFolder = () => {
    if (!activePage) return;
    const targetPath = activePage.savedPath || activePage.imagePath;
    if (targetPath && api?.openPath) {
      const folder = targetPath.substring(0, targetPath.lastIndexOf('/'));
      api.openPath(folder);
    }
  };

  // Run AI translate on current page
  const handleRunTranslateCurrent = async () => {
    if (!activePage) {
      setErrorModal({
        title: t('translate.studio.noActivePageSelected'),
        message: t('translate.studio.noActivePageSelectedDesc'),
      });
      return;
    }

    const isLocalTranslateProvider =
      settings?.translationProvider === 'ollama' ||
      settings?.translationProvider === 'lmstudio' ||
      settings?.translationProvider === 'openai_compatible';

    if (isLocalTranslateProvider) {
      const ep =
        settings?.providers?.[settings?.translationProvider]?.baseUrl ||
        settings?.apiKeys?.openaiCompatible?.endpoint ||
        'http://localhost:11434/v1';
      if (!isLocalOnline) {
        setErrorModal({
          title: t('translate.studio.missingLocalServerTitle'),
          message: t('translate.studio.missingLocalServerDesc', { model: displayModelName, endpoint: ep }),
          suggestion: t('translate.studio.missingLocalServerTip'),
          canSwitchToCloud: true,
          openSettings: true,
        });
        setStatusMessage({
          text: t('translate.studio.localServerOfflineToast', { ep }),
          type: 'error',
        });
        return;
      }
      if (!isModelInstalled(currentModelId)) {
        setErrorModal({
          title: t('translate.studio.missingLocalModelTitle'),
          message: t('translate.studio.missingLocalModelDesc', { model: displayModelName, id: currentModelId }),
          suggestion: t('translate.studio.missingLocalModelTip', { id: currentModelId }),
          canSwitchToCloud: true,
          openSettings: true,
        });
        setStatusMessage({
          text: t('translate.studio.localModelNotInstalledToast', { id: currentModelId }),
          type: 'error',
        });
        return;
      }
    }

    if (settings?.translationProvider === 'openai' && (!settings?.apiKeys?.openai || !settings.apiKeys.openai.trim())) {
      setErrorModal({
        title: t('translate.studio.missingOpenAiKeyTitle'),
        message: t('translate.studio.missingOpenAiKeyDesc'),
        suggestion: t('translate.studio.missingOpenAiKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      setStatusMessage({
        text: t('translate.studio.missingOpenAiKeyToast'),
        type: 'error',
      });
      return;
    }

    if (settings?.translationProvider === 'gemini' && (!settings?.apiKeys?.gemini || !settings.apiKeys.gemini.trim())) {
      setErrorModal({
        title: t('translate.studio.missingApiKeyTitle'),
        message: t('translate.studio.missingGeminiKeyDesc'),
        suggestion: t('translate.studio.missingGeminiKeyTip'),
        canSwitchToCloud: false,
        openSettings: true,
      });
      setStatusMessage({
        text: t('translate.studio.missingGeminiKeyToast'),
        type: 'error',
      });
      return;
    }

    if (settings?.translationProvider === 'deepl' && (!settings?.apiKeys?.deepl || !settings.apiKeys.deepl.trim())) {
      setErrorModal({
        title: t('translate.studio.missingDeeplKeyTitle'),
        message: t('translate.studio.missingDeeplKeyDesc'),
        suggestion: t('translate.studio.missingDeeplKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      setStatusMessage({
        text: t('translate.studio.missingDeeplKeyToast'),
        type: 'error',
      });
      return;
    }

    if (settings?.translationProvider === 'deepl' && settings?.ocrProvider !== 'local' && (!settings?.apiKeys?.gemini || !settings.apiKeys.gemini.trim()) && (!settings?.apiKeys?.openai || !settings.apiKeys.openai.trim())) {
      setErrorModal({
        title: t('translate.studio.needOcrKeyTitle'),
        message: t('translate.studio.needOcrKeyDesc'),
        suggestion: t('translate.studio.needOcrKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      setStatusMessage({
        text: t('translate.studio.deeplNeedsOcrToast'),
        type: 'error',
      });
      return;
    }

    setIsTranslating(true);
    setLogs([]);
    addLog('init', t('translate.studio.startingPageLog', { name: activePage.filename, model: displayModelName }), 'info');
    setTranslateProgress({ step: 'init', percent: 10, detail: t('translate.studio.pageInitDetail', { name: activePage.filename }) });
    setStatusMessage({
      text: t('translate.studio.pageTranslatingToast', { name: activePage.filename, model: displayModelName }),
      type: 'info',
    });

    let hasError = false;
    try {
      if (api?.translateImage && (activePage.imagePath || activePage.dataUrl || activePage.originalDataUrl)) {
        const res = await api.translateImage({
          imagePath: activePage.imagePath || undefined,
          imageDataUrl: (!activePage.imagePath ? (activePage.originalDataUrl || activePage.dataUrl) : undefined),
          forceFresh: true,
        });

        if (res) {
          const rawTranslations = Array.isArray(res.translations) ? res.translations : [];
          const newLayers = rawTranslations.map((t, lIdx) => {
            const sourceText = t.sourceText || t.originalText || t.rawText || '';
            const text = t.text || t.translatedText || '';
            const hasResidual = Boolean(t.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(text));
            return {
              id: `layer-${activePageIndex}-${lIdx}-${Date.now()}`,
              type: 'dialogue',
              sourceText,
              text,
              bbox: Array.isArray(t.bbox) ? [...t.bbox] : [100, 100, 200, 150],
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
              hasBubble: t.hasBubble !== false,
              // Chuẩn Koharu: text layer không tô đè hộp trắng lên viền khung gốc
              fillBackground: false,
              visible: t.visible !== false,
              opacity: t.opacity ?? 1,
              isTranslated: t.isTranslated !== false && !hasResidual,
              hasResidualJapanese: hasResidual,
            };
          });

          const nextPages = pages.map((p, i) =>
            i === activePageIndex
              ? {
                ...p,
                layers: newLayers,
                cleanDataUrl: res.cleanDataUrl || p.cleanDataUrl || null,
                translatedImageDataUrl: res.translatedImageDataUrl || p.translatedImageDataUrl,
                // Giữ dataUrl = ảnh gốc; chỉ dùng cleanDataUrl khi user bật showCleanupLayer
                dataUrl: p.originalDataUrl || p.dataUrl || res.translatedImageDataUrl,
                width: (res.width && res.width > 100) ? res.width : p.width,
                height: (res.height && res.height > 100) ? res.height : p.height,
              }
              : p
          );

          setPages(nextPages);
          onUpdatePages?.(nextPages);
          onSavePage?.({
            index: activePageIndex,
            savePath: activePage.savedPath || res.savePath,
            dataUrl: res.translatedImageDataUrl || activePage.dataUrl,
            layers: newLayers,
            width: res.width || activePage.width,
            height: res.height || activePage.height,
          });

          // Không tự động focus vào khung đầu tiên khi dịch xong để người dùng xem trọn vẹn bản dịch
          setSelectedLayerId(null);
          setExpandedLayerId(null);

          const resResidualCount = newLayers.filter((l) => l.hasResidualJapanese).length;
          addLog('completed', t('translate.studio.pageCompletedLog', { name: activePage.filename, bubbles: newLayers.length, residuals: resResidualCount }), resResidualCount > 0 ? 'warn' : 'info');

          if (resResidualCount > 0) {
            setStatusMessage({
              text: t('translate.studio.pageCompletedWithResidualsToast', { residuals: resResidualCount, bubbles: newLayers.length }),
              type: 'warning',
            });
          } else {
            setStatusMessage({
              text: t('translate.studio.pageCompletedToast', { bubbles: newLayers.length }),
              type: 'success',
            });
          }

          // Tự động xuất file 100% nếu Chế độ Auto Mode đang BẬT
          if (isAutoModeEnabled) {
            const updatedPage = {
              ...activePage,
              cleanDataUrl: res.cleanDataUrl || activePage.cleanDataUrl,
              layers: newLayers,
            };
            addLog('auto', t('translate.studio.batchAutoExportLog', { count: 1, dir: activeOutputDir }), 'info');
            await handleAutoExportPages([updatedPage], activeOutputDir);
          }
        }
      } else if (onRunTranslate) {
        await onRunTranslate();
        addLog('completed', t('translate.studio.pageRetranslateLog'), 'info');
        setStatusMessage({ text: t('translate.studio.pageRetranslateToast'), type: 'success' });
      }
    } catch (err) {
      hasError = true;
      if (err?.message === 'Cancelled' || String(err).includes('cancel')) {
        addLog('cancel', t('translate.studio.pageTranslateCancelledLog'), 'warn');
        setStatusMessage({ text: t('translate.studio.pageTranslateCancelledToast'), type: 'info' });
      } else {
        console.error('[MangaStudioEditor] Translate page error:', err);
        addLog('error', t('translate.studio.pageTranslateErrorToast', { error: err?.message || 'Unknown' }), 'error');
        setErrorModal({
          title: t('translate.studio.pageTranslateErrorTitle'),
          message: err?.message || t('translate.studio.pageTranslateErrorDesc'),
        });
        setStatusMessage({ text: t('translate.studio.pageTranslateErrorToast', { error: err?.message || 'Unknown' }), type: 'error' });
      }
    } finally {
      setIsTranslating(false);
      if (!hasError) {
        setTranslateProgress((prev) => prev ? {
          ...prev,
          isFinished: true,
          percent: 100,
          step: 'completed',
          detail: prev.detail || t('translate.studio.pageTranslateCompletedDetail'),
        } : null);
      } else {
        setTranslateProgress((prev) => prev ? {
          ...prev,
          isFinished: true,
          isError: true,
          step: 'error',
          detail: t('translate.studio.pageTranslateErrorDetail'),
        } : null);
      }
    }
  };

  // --- Step 1: Run Detection (Chỉ nhận diện & bóc tách khung thoại) ---
  const handleRunDetection = async () => {
    if (!activePage) {
      setErrorModal({
        title: t('translate.studio.detectNoPageTitle'),
        message: t('translate.studio.detectNoPageDesc'),
      });
      return;
    }

    setIsTranslating(true);
    setLogs([]);
    addLog('detect', t('translate.studio.detectStartLog', { name: activePage.filename }), 'info');
    setTranslateProgress({ step: 'detect', percent: 20, detail: t('translate.studio.detectProgressDetailAi') });
    setStatusMessage({
      text: t('translate.studio.detectScanningToast', { name: activePage.filename }),
      type: 'info',
    });

    try {
      const res = await api?.translateRunDetection?.({
        imagePath: activePage.imagePath || undefined,
        imageDataUrl: (!activePage.imagePath ? (activePage.originalDataUrl || activePage.dataUrl) : undefined),
      });

      if (res?.detections) {
        const rawDetections = Array.isArray(res.detections) ? res.detections : [];
        const newLayers = rawDetections.map((d, lIdx) => ({
          id: `layer-${activePageIndex}-${lIdx}-${Date.now()}`,
          type: 'dialogue',
          sourceText: '',
          text: '',
          bbox: Array.isArray(d.bbox) ? [...d.bbox] : [100, 100, 200, 150],
          fontFamily: DEFAULT_STUDIO_FONT,
          fontSize: 'auto',
          fontWeight: '700',
          fontStyle: 'normal',
          color: '#000000',
          strokeColor: '#ffffff',
          strokeWidth: 1.5,
          align: 'center',
          direction: 'auto',
          textTransform: 'uppercase',
          hasBubble: d.hasBubble !== false,
          fillBackground: false,
          visible: true,
          opacity: 1,
          isTranslated: null,
          hasResidualJapanese: false,
        }));

        const nextPages = pages.map((p, i) =>
          i === activePageIndex
            ? { ...p, layers: newLayers }
            : p
        );

        setPages(nextPages);
        onUpdatePages?.(nextPages);

        setSelectedLayerId(null);
        setExpandedLayerId(null);
        setIsTextGroupCollapsed(false);

        addLog('detect', t('translate.studio.detectCompletedLog', { count: newLayers.length }), 'info');
        setStatusMessage({
          text: t('translate.studio.detectCompletedToast', { count: newLayers.length }),
          type: 'success',
        });
      }
    } catch (err) {
      console.error('[Run Detection] Detection error:', err);
      addLog('detect', t('translate.studio.logDetectError', { error: err?.message || err }), 'error');
      setStatusMessage({ text: t('translate.studio.toastDetectError', { error: err?.message || err }), type: 'error' });
    } finally {
      setIsTranslating(false);
      setTranslateProgress((prev) => prev ? { ...prev, isFinished: true, percent: 100 } : null);
    }
  };

  // --- Step 2: Run OCR (Chỉ nhận diện chữ trong các khung thoại) ---
  const handleRunOCR = async () => {
    if (!activePage) return;
    const currentLayers = Array.isArray(activePage.layers) ? activePage.layers : [];
    if (currentLayers.length === 0) {
      setErrorModal({
        title: t('translate.studio.noBubblesForTranslateTitle'),
        message: t('translate.studio.noBubblesRunDetectTip'),
      });
      return;
    }

    setIsTranslating(true);
    setLogs([]);
    addLog('ocr', t('translate.studio.logOcrStart', { count: currentLayers.length, name: activePage.filename }), 'info');
    setTranslateProgress({ step: 'ocr', percent: 20, detail: t('translate.studio.ocrProgressDetail', { count: currentLayers.length }) });
    setStatusMessage({
      text: t('translate.studio.ocrToast', { count: currentLayers.length }),
      type: 'info',
    });

    try {
      const res = await api?.translateRunOCR?.({
        imagePath: activePage.imagePath || undefined,
        imageDataUrl: (!activePage.imagePath ? (activePage.originalDataUrl || activePage.dataUrl) : undefined),
        layers: currentLayers,
      });

      if (res?.ocrResults) {
        const ocrList = Array.isArray(res.ocrResults) ? res.ocrResults : [];
        const ocrMap = new Map();
        ocrList.forEach((r, idx) => {
          ocrMap.set(idx, r.text);
          if (r.id !== undefined) ocrMap.set(r.id, r.text);
        });

        const updatedLayers = currentLayers.map((l, idx) => {
          const recognized = ocrMap.get(idx) ?? ocrMap.get(l.id) ?? l.sourceText ?? '';
          return {
            ...l,
            sourceText: recognized,
          };
        });

        const nextPages = pages.map((p, i) =>
          i === activePageIndex
            ? { ...p, layers: updatedLayers }
            : p
        );

        setPages(nextPages);
        onUpdatePages?.(nextPages);

        addLog('ocr', t('translate.studio.logOcrDoneWithTotal', { count: ocrList.length, total: currentLayers.length }), 'info');
        setStatusMessage({
          text: t('translate.studio.toastOcrDone', { count: ocrList.length }),
          type: 'success',
        });
      }
    } catch (err) {
      console.error('[Run OCR] OCR error:', err);
      addLog('ocr', t('translate.studio.logOcrError', { error: err?.message || err }), 'error');
      setStatusMessage({ text: t('translate.studio.toastOcrError', { error: err?.message || err }), type: 'error' });
    } finally {
      setIsTranslating(false);
      setTranslateProgress((prev) => prev ? { ...prev, isFinished: true, percent: 100 } : null);
    }
  };

  // --- Step 3: Run Translation (Chỉ dịch sang tiếng Việt) ---
  const handleRunTranslation = async () => {
    if (!activePage) return;
    const currentLayers = Array.isArray(activePage.layers) ? activePage.layers : [];
    if (currentLayers.length === 0) {
      setErrorModal({
        title: t('translate.studio.noBubblesForTranslateTitle'),
        message: t('translate.studio.noBubblesForTranslateDesc'),
      });
      return;
    }

    const hasAnyText = currentLayers.some((l) => (l.sourceText || l.text || '').trim());
    if (!hasAnyText) {
      setErrorModal({
        title: t('translate.studio.noTextForTranslateTitle'),
        message: t('translate.studio.noTextForTranslateDesc'),
      });
      return;
    }

    setIsTranslating(true);
    setLogs([]);
    addLog('translate', t('translate.studio.logTranslateStart', { count: currentLayers.length }), 'info');
    setTranslateProgress({ step: 'translate', percent: 20, detail: t('translate.studio.translateProgressDetail', { count: currentLayers.length }) });
    setStatusMessage({
      text: t('translate.studio.translateToast', { count: currentLayers.length }),
      type: 'info',
    });

    try {
      const res = await api?.translateRunTranslation?.({
        layers: currentLayers,
      });

      if (res?.translations) {
        const transList = Array.isArray(res.translations) ? res.translations : [];
        const transMap = new Map();
        transList.forEach((t, idx) => {
          transMap.set(idx, t);
          if (t.id !== undefined) transMap.set(t.id, t);
        });

        const updatedLayers = currentLayers.map((l, idx) => {
          const t = transMap.get(idx) ?? transMap.get(l.id);
          if (!t) return l;
          const translatedText = t.translatedText || t.text || l.text || '';
          const hasResidual = Boolean(t.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(translatedText));
          return {
            ...l,
            text: translatedText,
            translatedText: translatedText,
            sourceText: t.sourceText || l.sourceText || '',
            isTranslated: t.isTranslated !== false && !hasResidual,
            hasResidualJapanese: hasResidual,
          };
        });

        const nextPages = pages.map((p, i) =>
          i === activePageIndex
            ? { ...p, layers: updatedLayers }
            : p
        );

        setPages(nextPages);
        onUpdatePages?.(nextPages);

        const cleanCount = updatedLayers.filter((l) => l.isTranslated && !l.hasResidualJapanese).length;
        addLog('translate', t('translate.studio.logTranslateDoneWithTotal', { clean: cleanCount, total: updatedLayers.length }), 'info');
        setStatusMessage({
          text: t('translate.studio.toastTranslateDone', { clean: cleanCount, total: updatedLayers.length }),
          type: 'success',
        });
      }
    } catch (err) {
      console.error('[Run Translation] Translation error:', err);
      addLog('translate', t('translate.studio.logTranslateError', { error: err?.message || err }), 'error');
      setStatusMessage({ text: t('translate.studio.toastTranslateError', { error: err?.message || err }), type: 'error' });
    } finally {
      setIsTranslating(false);
      setTranslateProgress((prev) => prev ? { ...prev, isFinished: true, percent: 100 } : null);
    }
  };

  // --- Step 4: Run Inpainting (Chỉ tẩy chữ gốc trên tranh — Hoàn toàn độc lập với Dịch thuật) ---
  const handleRunInpainting = async () => {
    if (!activePage) return;
    const currentLayers = Array.isArray(activePage.layers) ? activePage.layers : [];

    setIsTranslating(true);
    setLogs([]);
    addLog('inpaint', t('translate.studio.logInpaintStart', { name: activePage.filename }), 'info');
    setTranslateProgress({ step: 'inpaint', percent: 20, detail: t('translate.studio.inpaintProgressDetail') });
    setStatusMessage({
      text: t('translate.studio.inpaintToast', { name: activePage.filename }),
      type: 'info',
    });

    try {
      const res = await api?.translateRunInpainting?.({
        imagePath: activePage.imagePath || undefined,
        imageDataUrl: (!activePage.imagePath ? (activePage.originalDataUrl || activePage.dataUrl) : undefined),
        layers: currentLayers,
      });

      if (res?.cleanDataUrl) {
        const nextPages = pages.map((p, i) =>
          i === activePageIndex
            ? { ...p, cleanDataUrl: res.cleanDataUrl }
            : p
        );

        setPages(nextPages);
        onUpdatePages?.(nextPages);
        setShowCleanupLayer(true);

        addLog('inpaint', t('translate.studio.logInpaintDoneWithTotal'), 'info');
        setStatusMessage({
          text: t('translate.studio.toastInpaintDone'),
          type: 'success',
        });
      }
    } catch (err) {
      console.error('[Run Inpainting] Inpainting error:', err);
      addLog('inpaint', t('translate.studio.logInpaintError', { error: err?.message || err }), 'error');
      setStatusMessage({ text: t('translate.studio.toastInpaintError', { error: err?.message || err }), type: 'error' });
    } finally {
      setIsTranslating(false);
      setTranslateProgress((prev) => prev ? { ...prev, isFinished: true, percent: 100 } : null);
    }
  };

  // Cập nhật bản dịch từ Bảng Đối Chiếu (hỗ trợ sửa inline cho mọi trang trong Chapter)
  const handleUpdateComparisonText = useCallback((targetPageIndex, layerId, newText) => {
    const isStillRes = Boolean(JAPANESE_CHAR_REGEX.test(newText));
    setPages((prev) =>
      prev.map((p, pIdx) => {
        if (pIdx !== targetPageIndex) return p;
        return {
          ...p,
          layers: (p.layers || []).map((l) =>
            l.id === layerId
              ? { ...l, text: newText, isTranslated: true, hasResidualJapanese: isStillRes }
              : l
          ),
        };
      })
    );
  }, [JAPANESE_CHAR_REGEX]);

  // Dịch lại AI một khung đơn lẻ trong Bảng Đối Chiếu hoặc Layer List
  const handleRetrySingleLayerInComparison = useCallback(async (targetPageIndex, layer, originalIdx) => {
    if (!api?.translateTextSegments || !layer) return;
    setRetryingSingleLayerId(layer.id);
    try {
      setStatusMessage({ text: t('translate.studio.retryingSingleBubble', { id: originalIdx + 1 }), type: 'info' });
      const ret = await api.translateTextSegments({
        segments: [{
          index: layer.id,
          id: layer.id,
          sourceText: layer.sourceText || layer.text,
          text: layer.sourceText || layer.text,
          bbox: layer.bbox,
        }],
        sourceLanguage: settings?.sourceLanguage || 'ja',
        targetLanguage: settings?.targetLanguage || 'vi',
      });
      if (Array.isArray(ret) && ret.length > 0) {
        const newText = ret[0].translatedText || ret[0].text || '';
        const isStillRes = Boolean(ret[0].hasResidualJapanese || JAPANESE_CHAR_REGEX.test(newText));
        setPages((prev) => {
          const next = prev.map((p, pIdx) => {
            if (pIdx !== targetPageIndex) return p;
            return {
              ...p,
              layers: (p.layers || []).map((l) =>
                l.id === layer.id
                  ? { ...l, text: newText, isTranslated: true, hasResidualJapanese: isStillRes }
                  : l
              ),
            };
          });
          onUpdatePages?.(next);
          return next;
        });
        setStatusMessage({ text: t('translate.studio.retriedSingleBubbleSuccess', { id: originalIdx + 1 }), type: 'success' });
      }
    } catch (err) {
      setStatusMessage({ text: t('translate.studio.retriedSingleBubbleError', { id: originalIdx + 1, error: err?.message }), type: 'error' });
    } finally {
      setRetryingSingleLayerId(null);
    }
  }, [api, settings, JAPANESE_CHAR_REGEX, onUpdatePages, t]);

  // Dịch lại các khung thoại bị sót chữ tiếng Nhật hoặc chưa dịch xong (Trang hiện tại hoặc Toàn bộ Chapter)
  const handleRetryResidualBubbles = async (scope = 'current') => {
    const isAllScope = scope === 'all';
    const targetResiduals = isAllScope
      ? allChapterLayersWithMeta.filter(({ layer }) => isLayerResidual(layer))
      : residualLayers.map((l) => ({ layer: l, pageIndex: activePageIndex }));

    if (targetResiduals.length === 0 || isRetryingResidual) return;
    setIsRetryingResidual(true);
    setStatusMessage({
      text: t('translate.studio.retryingResidualsToast', { count: targetResiduals.length, scope: isAllScope ? t('translate.studio.scopeAllChapter') : t('translate.studio.scopeCurrentPage') }),
      type: 'info',
    });

    try {
      const segments = targetResiduals.map(({ layer }) => ({
        index: layer.id,
        id: layer.id,
        sourceText: layer.sourceText || layer.text,
        text: layer.sourceText || layer.text,
        bbox: layer.bbox,
      }));

      const res = await api?.translateTextSegments?.({
        segments,
        sourceLanguage: settings?.sourceLanguage || 'ja',
        targetLanguage: settings?.targetLanguage || 'vi',
      });

      if (Array.isArray(res)) {
        const resMap = new Map(res.map((r) => [r.index, r]));
        const nextPages = pages.map((p, pIdx) => {
          if (!isAllScope && pIdx !== activePageIndex) return p;
          const updatedLayers = (p.layers || []).map((l) => {
            const retried = resMap.get(l.id);
            if (retried) {
              const newText = retried.translatedText || retried.text || '';
              const hasRes = Boolean(retried.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(newText));
              return {
                ...l,
                text: newText,
                isTranslated: retried.isTranslated !== false && !hasRes,
                hasResidualJapanese: hasRes,
              };
            }
            return l;
          });
          return { ...p, layers: updatedLayers };
        });

        setPages(nextPages);
        onUpdatePages?.(nextPages);

        setStatusMessage({
          text: t('translate.studio.retriedResidualsSuccess', { count: targetResiduals.length }),
          type: 'success',
        });
      }
    } catch (err) {
      console.error('[MangaStudioEditor] Retry residual error:', err);
      setStatusMessage({ text: t('translate.studio.retriedResidualsError', { error: err?.message }), type: 'error' });
    } finally {
      setIsRetryingResidual(false);
    }
  };

  // Run AI translate on entire chapter or untranslated pages in batch
  const doRunTranslateAll = async (onlyUntranslated = false) => {
    const hasTranslation = (p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim());
    const targetPages = onlyUntranslated
      ? pages.filter((p) => !hasTranslation(p))
      : pages;

    if (targetPages.length === 0) {
      setErrorModal({
        title: t('translate.studio.noResidualPagesToTranslate'),
        message: onlyUntranslated
          ? t('translate.studio.noPagesToTranslateDescAll')
          : t('translate.studio.noPagesToTranslateDescEmpty'),
      });
      return;
    }

    const isLocalTranslateProvider =
      settings?.translationProvider === 'ollama' ||
      settings?.translationProvider === 'lmstudio' ||
      settings?.translationProvider === 'openai_compatible';

    if (isLocalTranslateProvider) {
      const ep =
        settings?.providers?.[settings?.translationProvider]?.baseUrl ||
        settings?.apiKeys?.openaiCompatible?.endpoint ||
        'http://localhost:11434/v1';
      if (!isLocalOnline) {
        setErrorModal({
          title: t('translate.studio.missingLocalServerTitle'),
          message: t('translate.studio.missingLocalServerDesc', { model: displayModelName, endpoint: ep }),
          suggestion: t('translate.studio.missingLocalServerTip'),
          canSwitchToCloud: true,
          openSettings: true,
        });
        return;
      }
      if (!isModelInstalled(currentModelId)) {
        setErrorModal({
          title: t('translate.studio.missingLocalModelTitle'),
          message: t('translate.studio.missingLocalModelDesc', { model: displayModelName, id: currentModelId }),
          suggestion: t('translate.studio.missingLocalModelTip', { id: currentModelId }),
          canSwitchToCloud: true,
          openSettings: true,
        });
        return;
      }
    }

    if (settings?.translationProvider === 'openai' && (!settings?.apiKeys?.openai || !settings.apiKeys.openai.trim())) {
      setErrorModal({
        title: t('translate.studio.missingOpenAiKeyTitle'),
        message: t('translate.studio.missingOpenAiKeyDesc'),
        suggestion: t('translate.studio.missingOpenAiKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      return;
    }

    if (settings?.translationProvider === 'gemini' && (!settings?.apiKeys?.gemini || !settings.apiKeys.gemini.trim())) {
      setErrorModal({
        title: t('translate.studio.missingApiKeyTitle'),
        message: t('translate.studio.missingGeminiKeyDesc'),
        suggestion: t('translate.studio.missingGeminiKeyTip'),
        canSwitchToCloud: false,
        openSettings: true,
      });
      return;
    }

    if (settings?.translationProvider === 'deepl' && (!settings?.apiKeys?.deepl || !settings.apiKeys.deepl.trim())) {
      setErrorModal({
        title: t('translate.studio.missingDeeplKeyTitle'),
        message: t('translate.studio.missingDeeplKeyDesc'),
        suggestion: t('translate.studio.missingDeeplKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      return;
    }

    if (settings?.translationProvider === 'deepl' && settings?.ocrProvider !== 'local' && (!settings?.apiKeys?.gemini || !settings.apiKeys.gemini.trim()) && (!settings?.apiKeys?.openai || !settings.apiKeys.openai.trim())) {
      setErrorModal({
        title: t('translate.studio.needOcrKeyTitle'),
        message: t('translate.studio.needOcrKeyDesc'),
        suggestion: t('translate.studio.needOcrKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      return;
    }

    setIsTranslating(true);
    setLogs([]);
    addLog('init', t('translate.studio.startingBatchLog', { count: targetPages.length, model: displayModelName }), 'info');
    setTranslateProgress({
      step: 'init',
      percent: 5,
      detail: t('translate.studio.batchInitDetail', { count: targetPages.length }),
      imageIndex: 0,
      total: targetPages.length,
    });
    setStatusMessage({
      text: t('translate.studio.batchTranslatingToast', { count: targetPages.length, model: displayModelName }),
      type: 'info',
    });

    let hasError = false;
    try {
      if (api?.translateChapter) {
        const res = await api.translateChapter({
          projectId: currentProject?.id,
          imagePaths: targetPages.map((p) => p.imagePath).filter(Boolean),
          imageItems: targetPages.map((p) => ({
            path: p.imagePath,
            dataUrl: p.originalDataUrl || p.dataUrl,
            filename: p.filename,
          })),
        });

        if (res && Array.isArray(res.pages)) {
          const resMap = new Map();
          res.pages.forEach((rp) => {
            if (rp.imagePath) resMap.set(rp.imagePath, rp);
          });

          const nextPages = pages.map((p, idx) => {
            const rp = resMap.get(p.imagePath) || (targetPages.length === pages.length ? res.pages[idx] : null);
            if (!rp) return p;

            const rawTranslations = Array.isArray(rp.translations) ? rp.translations : [];
            const newLayers = rawTranslations.map((t, lIdx) => {
              const sourceText = t.sourceText || t.originalText || t.rawText || '';
              const text = t.text || t.translatedText || '';
              return {
                id: `layer-${p.index}-${lIdx}-${Date.now()}`,
                type: 'dialogue',
                sourceText,
                text,
                bbox: Array.isArray(t.bbox) ? [...t.bbox] : [100, 100, 200, 150],
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
                hasBubble: t.hasBubble !== false,
                // Chuẩn Koharu: text layer không tô đè hộp trắng lên viền khung gốc
                fillBackground: false,
                visible: t.visible !== false,
                opacity: t.opacity ?? 1,
                isTranslated: t.isTranslated !== false,
              };
            });

            return {
              ...p,
              cleanDataUrl: rp.cleanDataUrl || p.cleanDataUrl || null,
              // Giữ dataUrl = ảnh gốc; chỉ dùng cleanDataUrl khi user bật showCleanupLayer
              dataUrl: p.originalDataUrl || p.dataUrl,
              layers: newLayers.length > 0 ? newLayers : p.layers,
              savedPath: rp.savedPath || p.savedPath,
              translatedImageDataUrl: rp.savedPath ? `file://${rp.savedPath}` : p.translatedImageDataUrl,
            };
          });

          setPages(nextPages);
          onUpdatePages?.(nextPages);
          onSaveChapter?.({
            outputDir: res.outputDir,
            savedPaths: nextPages.map((p) => p.savedPath).filter(Boolean),
            pages: nextPages,
          });

          const totalDetected = res.pages.reduce((acc, rp) => acc + (rp.translations?.length || 0), 0);
          addLog('completed', t('translate.studio.batchCompleteLog', { count: res.pages.length, bubbles: totalDetected }), 'info');
          setStatusMessage({
            text: t('translate.studio.batchCompleteToast', { count: res.pages.length, bubbles: totalDetected }),
            type: 'success',
          });

          // Tự động xuất file 100% nếu Chế độ Auto Mode đang BẬT
          if (isAutoModeEnabled) {
            addLog('auto', t('translate.studio.batchAutoExportLog', { count: nextPages.length, dir: activeOutputDir }), 'info');
            await handleAutoExportPages(nextPages, activeOutputDir);
          }
        }
      } else if (onRunTranslate) {
        await onRunTranslate();
        addLog('completed', t('translate.studio.batchAllDoneLog'), 'info');
        setStatusMessage({ text: t('translate.studio.batchAllDoneToast'), type: 'success' });
      }
    } catch (err) {
      hasError = true;
      if (err?.message === 'Cancelled' || String(err).includes('cancel')) {
        addLog('cancel', t('translate.studio.batchCancelledLog'), 'warn');
        setStatusMessage({ text: t('translate.studio.batchCancelledToast'), type: 'info' });
      } else {
        console.error('[MangaStudioEditor] Batch translation error:', err);
        addLog('error', t('translate.studio.batchErrorToast', { error: err?.message || 'Unknown' }), 'error');
        setErrorModal({
          title: t('translate.studio.batchErrorTitle'),
          message: err?.message || t('translate.studio.batchErrorDesc'),
        });
        setStatusMessage({ text: t('translate.studio.batchErrorToast', { error: err?.message || 'Unknown' }), type: 'error' });
      }
    } finally {
      setIsTranslating(false);
      if (!hasError) {
        setTranslateProgress((prev) => prev ? {
          ...prev,
          isFinished: true,
          percent: 100,
          step: 'completed',
          detail: prev.detail || t('translate.studio.batchAllDoneToast'),
        } : null);
      } else {
        setTranslateProgress((prev) => prev ? {
          ...prev,
          isFinished: true,
          isError: true,
          step: 'error',
          detail: t('translate.studio.batchErrorDetail'),
        } : null);
      }
    }
  };

  // Smart Resume Translate Handler
  const handleRunTranslateAll = async (onlyUntranslated = false) => {
    const hasTranslation = (p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim());
    const translatedPages = pages.filter(hasTranslation);
    const untranslatedPages = pages.filter((p) => !hasTranslation(p));

    // Nếu người dùng chọn dịch thông thường (không truyền cờ onlyUntranslated)
    // và phát hiện có cả trang đã dịch lẫn trang chưa dịch: Hiển thị modal Smart Resume
    if (!onlyUntranslated && translatedPages.length > 0 && untranslatedPages.length > 0) {
      setResumePromptModal({
        translatedCount: translatedPages.length,
        untranslatedCount: untranslatedPages.length,
        totalCount: pages.length,
        onResume: () => doRunTranslateAll(true),
        onReTranslateAll: () => doRunTranslateAll(false),
      });
      return;
    }

    doRunTranslateAll(onlyUntranslated);
  };

  // Cancel running translation
  const handleCancelTranslate = useCallback(async () => {
    try {
      if (api?.translateCancel) {
        await api.translateCancel();
        setStatusMessage({ text: t('translate.studio.stopBatchSent'), type: 'info' });
      }
    } catch (e) {
      console.warn('[MangaStudioEditor] Cancel translation error:', e);
    } finally {
      setIsTranslating(false);
      setTranslateProgress(null);
    }
  }, [api]);

  // Filter pages
  const filteredPages = useMemo(() => {
    if (!filterQuery.trim()) return pages;
    const q = filterQuery.toLowerCase();
    return pages.filter(
      (p) => p.filename.toLowerCase().includes(q) || String(p.index + 1).includes(q)
    );
  }, [pages, filterQuery]);

  // Run actions definitions & ordering
  const allRunActions = useMemo(() => ({
    current: {
      id: 'current',
      title: t('translate.studio.actionCurrentPage'),
      subtitle: activePage?.filename || t('translate.studio.actionCurrentPageSub'),
      icon: 'play_arrow',
      iconColor: 'text-primary',
      buttonLabel: 'Run',
      buttonTitle: `${t('translate.studio.actionCurrentPage')}: ${activePage?.filename || ''}`,
      run: handleRunTranslateCurrent,
    },
    all: {
      id: 'all',
      title: t('translate.studio.actionAllChapter'),
      subtitle: t('translate.studio.actionAllChapterSub', { count: pages.length }),
      icon: 'bolt',
      iconColor: 'text-amber-500',
      buttonLabel: t('translate.studio.run'),
      buttonTitle: `${t('translate.studio.actionAllChapter')} (${pages.length})`,
      run: () => handleRunTranslateAll(false),
    },
    untranslated: {
      id: 'untranslated',
      title: t('translate.studio.actionUntranslated'),
      subtitle: t('translate.studio.actionUntranslatedSub', { count: untranslatedCount }),
      icon: 'filter_alt',
      iconColor: 'text-emerald-500',
      buttonLabel: t('translate.studio.run'),
      buttonTitle: `${t('translate.studio.actionUntranslated')} (${untranslatedCount})`,
      run: () => handleRunTranslateAll(true),
    },
  }), [t, activePage?.filename, pages.length, untranslatedCount, handleRunTranslateCurrent, handleRunTranslateAll]);

  const orderedRunActions = useMemo(() => {
    return runActionOrder.map((id) => allRunActions[id]).filter(Boolean);
  }, [runActionOrder, allRunActions]);

  const defaultRunAction = orderedRunActions[0] || allRunActions.current;

  return (
    <div
      className={
        isStandaloneView
          ? "relative flex flex-col w-full h-full min-h-0 bg-surface text-on-surface select-none overflow-hidden font-sans"
          : "fixed inset-0 z-[9990] flex flex-col bg-surface text-on-surface select-none overflow-hidden font-sans"
      }
      style={{ WebkitAppRegion: 'no-drag' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* ─── 1. Top Window Header Bar ─── */}
      <div
        className="relative z-50 flex items-center justify-between px-3 py-1.5 bg-surface-container-lowest border-b border-outline-variant/20 shrink-0 text-xs select-none shadow-2xs flex-nowrap gap-2"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {/* Zone 1: Left - Dự án Selector & Auto-save Indicator */}
        <div className="flex items-center gap-2 shrink-0 font-medium text-on-surface-variant select-none cursor-default" style={{ WebkitAppRegion: 'no-drag' }}>
          {/* Nút chuyên dụng Ẩn / Hiện danh sách trang bên trái */}
          <button
            type="button"
            onClick={() => toggleLeftSidebar()}
            style={{ WebkitAppRegion: 'no-drag' }}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer border shrink-0 ${showLeftSidebar
              ? 'border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 shadow-2xs'
              : 'border-outline-variant/25 bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            title={showLeftSidebar ? t('translate.studio.sidebarToggleHide') : t('translate.studio.sidebarToggleShow')}
          >
            <span className={`material-symbols-outlined text-[17px] ${!showLeftSidebar ? 'scale-x-[-1]' : ''}`}>
              {showLeftSidebar ? 'dock_to_left' : 'view_sidebar'}
            </span>
          </button>

          {/* Project Selector Button (Mở danh sách các dự án đang làm để chuyển đổi hoặc tạo mới) */}
          <button
            type="button"
            onClick={() => {
              loadProjectsList();
              setShowProjectModal(true);
            }}
            disabled={isTranslating}
            style={{ WebkitAppRegion: 'no-drag' }}
            className="h-7 px-2.5 rounded-full border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs shrink-0 max-w-[200px] hover:border-primary/40 whitespace-nowrap"
            title={t('translate.studio.projectManageTitle')}
          >
            <span className="material-symbols-outlined text-[15px] text-primary shrink-0">folder_open</span>
            <span className="truncate max-w-[100px] sm:max-w-[130px] text-left font-medium">
              {currentProject?.name || t('translate.studio.projectDefaultName')}
            </span>
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">expand_more</span>
          </button>

          {/* Auto-Save Indicator */}
          {pages.length > 0 && (
            <div
              className={`text-[11px] h-7 px-2 rounded-full flex items-center gap-1 shrink-0 whitespace-nowrap transition-opacity duration-300 ${isSavingSession
                ? 'text-primary bg-primary/10 border border-primary/20'
                : 'text-on-surface-variant/60 hover:text-on-surface-variant'
                }`}
              title={isSavingSession ? t('translate.studio.projectAutoSaving') : t('translate.studio.projectAutoSaved')}
            >
              <span className={`material-symbols-outlined text-[13px] ${isSavingSession ? 'animate-spin' : ''}`}>
                {isSavingSession ? 'sync' : 'cloud_done'}
              </span>
              <span className="text-[10px] font-medium hidden sm:inline">
                {isSavingSession ? t('translate.studio.savingLabel') : t('translate.studio.savedLabel')}
              </span>
            </div>
          )}
        </div>

        {/* Zone 2: Center - Action Buttons Group (Model Selector, Run Button, Đối chiếu, Xuất file) */}
        <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-1" style={{ WebkitAppRegion: 'no-drag' }}>

          {/* Provider / Model Selector Pill */}
          <div ref={modelPickerRef} className="relative shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
            <button
              type="button"
              onClick={() => {
                if (!showModelDropdown) {
                  refreshLocalEngines();
                }
                setShowModelDropdown(!showModelDropdown);
              }}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="h-7 px-2.5 rounded-full border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container text-on-surface shadow-2xs flex items-center gap-1.5 cursor-pointer text-xs font-medium transition-all shrink-0 whitespace-nowrap"
              title={t('translate.studio.providerTooltip', { name: activeProviderInfo.name, status: activeProviderInfo.statusText })}
            >
              <span className="text-xs select-none shrink-0">{activeProviderInfo.icon}</span>
              <span className="font-semibold text-on-surface truncate max-w-[90px] sm:max-w-[120px]">
                {activeProviderInfo.shortName || displayModelName}
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${activeProviderInfo.status === 'online'
                  ? 'bg-emerald-500 animate-pulse'
                  : activeProviderInfo.status === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-error'
                  }`}
                title={activeProviderInfo.statusText}
              />
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant/70">keyboard_arrow_down</span>
            </button>

            {showModelDropdown && (
              <div
                className="absolute left-0 top-full mt-1.5 w-80 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-2.5 z-[100] space-y-2.5 animate-fadeIn text-on-surface"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                {/* Active Info Header */}
                <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/20 text-xs font-bold text-on-surface">
                  <div className="flex items-center gap-1.5 truncate">
                    <span>{activeProviderInfo.icon}</span>
                    <span className="truncate">{activeProviderInfo.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${activeProviderInfo.status === 'online'
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : activeProviderInfo.status === 'warning'
                          ? 'bg-amber-500/15 text-amber-600'
                          : 'bg-error/15 text-error'
                        }`}
                    >
                      {activeProviderInfo.statusText}
                    </span>
                    {!activeProviderInfo.isReady && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveRightTab('settings');
                          setShowModelDropdown(false);
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25 font-bold cursor-pointer transition-colors"
                        title={t('translate.studio.openSettingsAddKey')}
                      >
                        + Key
                      </button>
                    )}
                  </div>
                </div>

                {/* Section 1: Cloud Providers */}
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider px-1">
                    {t('translate.studio.cloudProvidersGroup')}
                  </div>
                  {cloudProviders.map((p) => {
                    const isSelected = activeProvider === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`w-full p-1.5 rounded-xl text-xs flex items-center justify-between gap-1.5 transition-colors ${isSelected
                          ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/20'
                          : p.isReady
                            ? 'hover:bg-surface-container-high text-on-surface'
                            : 'opacity-50 text-on-surface-variant bg-surface-container/20'
                          }`}
                      >
                        <button
                          type="button"
                          disabled={!p.isReady}
                          onClick={() => {
                            const targetModel = settings?.providers?.[p.id]?.defaultModel || p.defaultModel;
                            handleUpdateSetting({
                              translationProvider: p.id,
                              ...(targetModel ? { activeModel: targetModel } : {}),
                            });
                            setShowModelDropdown(false);
                          }}
                          style={{ WebkitAppRegion: 'no-drag' }}
                          className={`flex items-center gap-1.5 min-w-0 flex-1 text-left ${p.isReady ? 'cursor-pointer' : 'cursor-not-allowed'
                            }`}
                          title={p.isReady ? p.name : t('translate.studio.cloudProviderNotConfigured', { name: p.name })}
                        >
                          <span className="text-sm shrink-0">{p.icon}</span>
                          <span className="truncate">{p.name}</span>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
                          {p.isReady ? (
                            <>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-medium">
                                {p.badge}
                              </span>
                              {isSelected && (
                                <span className="material-symbols-outlined text-[15px] text-primary font-bold">check</span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold">
                                {t('translate.studio.badgeMissingKey')}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveRightTab('settings');
                                  setShowModelDropdown(false);
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 hover:bg-primary/25 text-primary font-bold cursor-pointer transition-colors"
                                title={t('translate.studio.openSettingsAddKey')}
                              >
                                + Key
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Section 2: Local Models */}
                <div className="space-y-1 pt-1 border-t border-outline-variant/20">
                  <div className="flex items-center justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-wider px-1">
                    <span>{t('translate.studio.localLlmGroup')}</span>
                    <span className={isLocalOnline ? 'text-emerald-600 font-semibold flex items-center gap-1' : 'text-amber-600 font-medium flex items-center gap-1'}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isLocalOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                      {isLocalOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  {localModels.length === 0 ? (
                    <div className="p-2.5 text-center text-xs text-on-surface-variant">
                      Chưa có mô hình Local nào trong máy
                    </div>
                  ) : (
                    localModels.map((m) => {
                      const isSelected =
                        (activeProvider === 'openai_compatible' || activeProvider === 'ollama' || activeProvider === 'lmstudio') &&
                        (currentModelId === m.id || currentModelId === m.name);
                      return (
                        <div
                          key={m.id}
                          className={`w-full p-1.5 rounded-xl text-xs flex items-center justify-between gap-1.5 transition-colors ${isSelected
                            ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/20'
                            : m.isReady
                              ? 'hover:bg-surface-container-high text-on-surface'
                              : 'opacity-50 text-on-surface-variant bg-surface-container/20'
                            }`}
                        >
                          <button
                            type="button"
                            disabled={!m.isReady}
                            onClick={() => {
                              const updatedProviders = {
                                ...(settings?.providers || {}),
                                ollama: {
                                  ...(settings?.providers?.ollama || {}),
                                  defaultModel: m.id,
                                },
                              };
                              delete updatedProviders.openai_compatible;

                              handleUpdateSetting({
                                translationProvider: 'ollama',
                                activeModel: m.id,
                                apiKeys: {
                                  ...settings?.apiKeys,
                                  openaiCompatible: {
                                    ...settings?.apiKeys?.openaiCompatible,
                                    model: m.id,
                                    endpoint: settings?.apiKeys?.openaiCompatible?.endpoint || 'http://localhost:11434/v1',
                                  },
                                },
                                providers: updatedProviders,
                              });
                              setShowModelDropdown(false);
                            }}
                            style={{ WebkitAppRegion: 'no-drag' }}
                            className={`flex items-center gap-1.5 min-w-0 flex-1 text-left ${m.isReady ? 'cursor-pointer' : 'cursor-not-allowed'
                              }`}
                            title={
                              !isLocalOnline
                                ? t('translate.studio.localLlmOff')
                                : t('translate.studio.localLlmSelect', { name: m.name })
                            }
                          >
                            <span className="text-sm shrink-0">🤖</span>
                            <span className="truncate">{m.name}</span>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-medium">
                              {m.badge}
                            </span>
                            {isSelected && (
                              <span className="material-symbols-outlined text-[15px] text-primary font-bold">check</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer link to settings */}
                <div className="pt-1.5 border-t border-outline-variant/20 flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRightTab('settings');
                      setShowModelDropdown(false);
                    }}
                    style={{ WebkitAppRegion: 'no-drag' }}
                    className="text-[11px] text-primary hover:text-primary/80 hover:bg-primary/8 px-1.5 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer font-medium transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">tune</span>
                    <span>{t('translate.studio.openSettingsOcr')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Run Button & Dropdown for Batch Run */}
          {isTranslating ? (
            <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
              <div
                className="px-3.5 py-1 rounded-full bg-primary text-on-primary font-semibold text-xs flex items-center gap-1.5 shadow-sm animate-pulse"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                <span>
                  {translateProgress?.imageIndex !== undefined && translateProgress?.total
                    ? t('translate.studio.runningProgress', { current: translateProgress.imageIndex + 1, total: translateProgress.total })
                    : t('translate.studio.running')}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelTranslate}
                style={{ WebkitAppRegion: 'no-drag' }}
                className="px-2.5 py-1 rounded-full border border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-error/10 hover:text-error text-xs font-medium cursor-pointer transition-all shadow-xs"
                title={t('translate.studio.stopTitle')}
              >
                {t('translate.studio.stop')}
              </button>
            </div>
          ) : (
            <div
              ref={runDropdownRef}
              className="relative inline-flex items-center rounded-full bg-primary hover:brightness-110 shadow-sm text-on-primary transition-all shrink-0 whitespace-nowrap h-7"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              <button
                type="button"
                onClick={defaultRunAction.run}
                style={{ WebkitAppRegion: 'no-drag' }}
                className="h-7 px-2.5 rounded-l-full font-semibold text-xs flex items-center gap-1 cursor-pointer hover:bg-black/10 transition-colors whitespace-nowrap"
                title={
                  isAutoModeEnabled
                    ? `${defaultRunAction.buttonTitle} — ⚡ ${t('translate.studio.auto100')}: ${activeOutputDir || ''}`
                    : defaultRunAction.buttonTitle
                }
              >
                <span className="material-symbols-outlined text-[15px]">{defaultRunAction.icon}</span>
                <span>{defaultRunAction.buttonLabel}</span>
                {isAutoModeEnabled && (
                  <span className="px-1 py-0.2 rounded-full bg-amber-400 text-amber-950 text-[9px] font-extrabold tracking-wide uppercase shadow-2xs ml-0.5">
                    Auto
                  </span>
                )}
              </button>
              <div className="w-px h-3.5 bg-on-primary/20" />
              <button
                type="button"
                onClick={() => setShowRunDropdown(!showRunDropdown)}
                style={{ WebkitAppRegion: 'no-drag' }}
                className="h-7 px-1 rounded-r-full cursor-pointer hover:bg-black/10 transition-colors flex items-center justify-center"
                title={t('translate.studio.optionsTitle')}
              >
                <span className="material-symbols-outlined text-[14px]">arrow_drop_down</span>
              </button>

              {showRunDropdown && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-80 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-2.5 z-[100] text-xs space-y-1.5 animate-fadeIn text-on-surface select-none whitespace-normal"
                  style={{ WebkitAppRegion: 'no-drag' }}
                >
                  <div className="px-1 pb-1 border-b border-outline-variant/20 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <span>{t('translate.studio.optionsTitle')}</span>
                  </div>

                  <div className="space-y-1">
                    {orderedRunActions.map((action, idx) => {
                      const isDefault = idx === 0;
                      const isDragging = draggedRunActionId === action.id;
                      const isDragOver = dragOverRunActionId === action.id && draggedRunActionId !== action.id;

                      return (
                        <div
                          key={action.id}
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            isRunActionDraggingRef.current = true;
                            setDraggedRunActionId(action.id);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverRunActionId !== action.id) {
                              setDragOverRunActionId(action.id);
                            }
                          }}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            if (dragOverRunActionId !== action.id) {
                              setDragOverRunActionId(action.id);
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverRunActionId === action.id) {
                              setDragOverRunActionId(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedRunActionId && draggedRunActionId !== action.id) {
                              handleReorderRunAction(draggedRunActionId, action.id);
                            }
                            setDraggedRunActionId(null);
                            setDragOverRunActionId(null);
                            setTimeout(() => {
                              isRunActionDraggingRef.current = false;
                            }, 120);
                          }}
                          onDragEnd={() => {
                            setDraggedRunActionId(null);
                            setDragOverRunActionId(null);
                            setTimeout(() => {
                              isRunActionDraggingRef.current = false;
                            }, 120);
                          }}
                          onClick={() => {
                            if (isRunActionDraggingRef.current) return;
                            setShowRunDropdown(false);
                            action.run();
                          }}
                          style={{ WebkitAppRegion: 'no-drag' }}
                          className={`w-full text-left p-2 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer ${isDragging
                            ? 'opacity-30 scale-95 border border-dashed border-primary bg-primary/5'
                            : isDragOver
                              ? 'border-t-2 border-primary bg-primary/10'
                              : isDefault
                                ? 'bg-primary/8 border border-primary/25 hover:bg-primary/15'
                                : 'hover:bg-surface-container-high border border-transparent'
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div
                              className="text-on-surface-variant/40 hover:text-on-surface cursor-grab active:cursor-grabbing shrink-0"
                              title={t('translate.studio.dragReorderHint')}
                            >
                              <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
                            </div>
                            <span className={`material-symbols-outlined text-[18px] shrink-0 ${action.iconColor}`}>
                              {action.icon}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-xs text-on-surface truncate">{action.title}</p>
                                {isDefault && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-primary text-on-primary font-bold tracking-wide shrink-0">
                                    {t('translate.studio.defaultBadge')}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-on-surface-variant truncate">{action.subtitle}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Selective Pipeline: Chạy từng bước riêng biệt chuẩn Koharu */}
                  <div className="pt-2 mt-1 border-t border-outline-variant/20 space-y-1">
                    <div className="px-1 pb-0.5 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      <span>{t('translate.studio.selectiveSteps')}</span>
                    </div>

                    <div className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setShowRunDropdown(false);
                          handleRunDetection();
                        }}
                        style={{ WebkitAppRegion: 'no-drag' }}
                        className="w-full text-left p-1.5 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer group/step"
                        title={t('translate.studio.runDetectionTitle')}
                      >
                        <span className="material-symbols-outlined text-[17px] text-blue-500 shrink-0 group-hover/step:scale-110 transition-transform">
                          crop_free
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs text-on-surface leading-tight">{t('translate.studio.runDetection')}</p>
                          <p className="text-[10px] text-on-surface-variant leading-tight">{t('translate.studio.runDetectionSub')}</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowRunDropdown(false);
                          handleRunOCR();
                        }}
                        style={{ WebkitAppRegion: 'no-drag' }}
                        className="w-full text-left p-1.5 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer group/step"
                        title={t('translate.studio.runOcrTitle')}
                      >
                        <span className="material-symbols-outlined text-[17px] text-emerald-500 shrink-0 group-hover/step:scale-110 transition-transform">
                          document_scanner
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs text-on-surface leading-tight">{t('translate.studio.runOcr')}</p>
                          <p className="text-[10px] text-on-surface-variant leading-tight">{t('translate.studio.runOcrSub')}</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowRunDropdown(false);
                          handleRunTranslation();
                        }}
                        style={{ WebkitAppRegion: 'no-drag' }}
                        className="w-full text-left p-1.5 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer group/step"
                        title={t('translate.studio.runTranslationTitle')}
                      >
                        <span className="material-symbols-outlined text-[17px] text-primary shrink-0 group-hover/step:scale-110 transition-transform">
                          translate
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs text-on-surface leading-tight">{t('translate.studio.runTranslation')}</p>
                          <p className="text-[10px] text-on-surface-variant leading-tight">{t('translate.studio.runTranslationSub')}</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowRunDropdown(false);
                          handleRunInpainting();
                        }}
                        style={{ WebkitAppRegion: 'no-drag' }}
                        className="w-full text-left p-1.5 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer group/step"
                        title={t('translate.studio.runInpaintingTitle')}
                      >
                        <span className="material-symbols-outlined text-[17px] text-purple-500 shrink-0 group-hover/step:scale-110 transition-transform">
                          brush
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs text-on-surface leading-tight">{t('translate.studio.runInpainting')}</p>
                          <p className="text-[10px] text-on-surface-variant leading-tight">{t('translate.studio.runInpaintingSub')}</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 mt-0.5 border-t border-outline-variant/20 px-1 text-[10px] text-on-surface-variant/80 flex items-start gap-1.5 leading-normal whitespace-normal break-words">
                    <span className="material-symbols-outlined text-[13px] text-primary shrink-0 mt-0.5">info</span>
                    <span className="flex-1 min-w-0 break-words">{t('translate.studio.dragReorderHint')}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Option: Chế độ Tự Động Hoá 100% (Auto Mode Checkbox & Quick Config) */}
          <div
            className={`h-7 px-2 rounded-full border flex items-center gap-1 text-xs font-semibold shadow-2xs transition-all shrink-0 whitespace-nowrap ${isAutoModeEnabled
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300 shadow-amber-500/10'
              : 'border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant'
              }`}
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <label
              className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap"
              title={
                isAutoModeEnabled
                  ? t('translate.studio.auto100TitleOn')
                  : t('translate.studio.auto100TitleOff')
              }
            >
              <input
                type="checkbox"
                checked={isAutoModeEnabled}
                onChange={(e) => toggleAutoMode(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
              />
              <span className={`material-symbols-outlined text-[15px] ${isAutoProcessing ? 'text-amber-500 animate-spin' : 'text-amber-500'}`}>
                {isAutoProcessing ? 'sync' : 'auto_mode'}
              </span>
              <span className={`text-xs ${isAutoModeEnabled ? 'font-bold text-amber-700 dark:text-amber-300' : 'font-medium text-on-surface'}`}>
                {isAutoProcessing ? `Auto (${autoProgress?.percent ?? 0}%)` : t('translate.studio.auto100')}
              </span>
            </label>

            {/* Quick Config Icon: Mở Cấu hình Thư mục Đầu ra & Nâng cao */}
            <button
              type="button"
              onClick={() => setShowAutoModal(true)}
              className="w-5 h-5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer text-on-surface-variant hover:text-on-surface"
              title={t('translate.studio.openAutoModal')}
            >
              <span className="material-symbols-outlined text-[13px]">settings</span>
            </button>
          </div>

          {/* Nút Mở Bảng Đối Chiếu Dịch Thuật & Soát Lỗi */}
          <button
            type="button"
            onClick={() => setShowComparisonModal(true)}
            style={{ WebkitAppRegion: 'no-drag' }}
            className={`h-7 px-2.5 rounded-full border flex items-center gap-1 text-xs font-semibold shadow-2xs transition-all cursor-pointer shrink-0 whitespace-nowrap ${residualLayers.length > 0
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
              : 'border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container text-on-surface'
              }`}
            title={t('translate.studio.comparisonTableTitle')}
          >
            <span className={`material-symbols-outlined text-[15px] ${residualLayers.length > 0 ? 'text-amber-500' : 'text-primary'}`}>
              table_chart
            </span>
            <span>{t('translate.studio.comparisonTable')} ({layers.length})</span>
            {residualLayers.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white dark:text-amber-950 text-[10px] font-bold">
                {residualLayers.length}
              </span>
            )}
          </button>

          {/* Primary Action Button: "Xuất file" (Export) with Split Dropdown */}
          <div ref={exportDropdownRef} className="relative flex items-center shrink-0 whitespace-nowrap" style={{ WebkitAppRegion: 'no-drag' }}>
            {/* Main Export Button */}
            <button
              type="button"
              disabled={isExporting || !activePage}
              onClick={handleExportCurrentPage}
              className="h-7 px-2.5 rounded-l-full bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              title={t('translate.studio.exportCurrentPage')}
            >
              {isExporting ? (
                <>
                  <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                  <span>...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[15px]">file_download</span>
                  <span>{t('translate.studio.exportMenu')}</span>
                </>
              )}
            </button>

            {/* Split Arrow Dropdown Button */}
            <button
              type="button"
              disabled={isExporting || pages.length === 0}
              onClick={() => setShowExportDropdown((prev) => !prev)}
              className="h-7 px-1 rounded-r-full border-l border-white/20 bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white flex items-center justify-center cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('translate.studio.exportMenu')}
            >
              <span className="material-symbols-outlined text-[14px]">arrow_drop_down</span>
            </button>

            {/* Export Dropdown Menu */}
            {showExportDropdown && (
              <div
                className="absolute right-0 top-full mt-1.5 w-64 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-1.5 z-[100] text-xs space-y-1 animate-fadeIn text-on-surface"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <button
                  type="button"
                  disabled={!activePage || isExporting}
                  onClick={() => {
                    setShowExportDropdown(false);
                    handleExportCurrentPage();
                  }}
                  style={{ WebkitAppRegion: 'no-drag' }}
                  className="w-full text-left p-2 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-on-surface"
                >
                  <span className="material-symbols-outlined text-emerald-500 text-[18px]">image</span>
                  <div>
                    <p className="font-bold text-xs text-on-surface">{t('translate.studio.exportCurrentPage')}</p>
                    <p className="text-[10px] text-on-surface-variant truncate max-w-[190px]">
                      {activePage?.filename ? t('translate.studio.pageColon', { name: activePage.filename }) : ''}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={pages.length === 0 || isExporting}
                  onClick={() => {
                    setShowExportDropdown(false);
                    handleExportAllChapter();
                  }}
                  style={{ WebkitAppRegion: 'no-drag' }}
                  className="w-full text-left p-2 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-on-surface"
                >
                  <span className="material-symbols-outlined text-teal-500 text-[18px]">folder_zip</span>
                  <div>
                    <p className="font-bold text-xs text-on-surface">{t('translate.studio.exportAllPages')}</p>
                    <p className="text-[10px] text-on-surface-variant">{t('translate.studio.actionAllChapterSub', { count: pages.length })}</p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={pages.length === 0 || isExporting}
                  onClick={() => {
                    setShowExportDropdown(false);
                    handleExportCbz();
                  }}
                  style={{ WebkitAppRegion: 'no-drag' }}
                  className="w-full text-left p-2 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-on-surface"
                >
                  <span className="material-symbols-outlined text-primary text-[18px]">archive</span>
                  <div>
                    <p className="font-bold text-xs text-on-surface">{t('translate.studio.menuPackCbz')}</p>
                    <p className="text-[10px] text-on-surface-variant">{t('translate.studio.menuPackCbzSub')}</p>
                  </div>
                </button>

                <div className="h-px bg-outline-variant/20 my-1" />

                <button
                  type="button"
                  disabled={!activePage}
                  onClick={() => {
                    setShowExportDropdown(false);
                    handleOpenFolder();
                  }}
                  style={{ WebkitAppRegion: 'no-drag' }}
                  className="w-full text-left p-2 rounded-xl flex items-center gap-2.5 hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-on-surface"
                >
                  <span className="material-symbols-outlined text-on-surface-variant text-[18px]">folder_open</span>
                  <div>
                    <p className="font-bold text-xs text-on-surface">{t('translate.studio.menuOpenFolder')}</p>
                    <p className="text-[10px] text-on-surface-variant">{t('translate.studio.menuOpenFolderSub')}</p>
                  </div>
                </button>

                <div className="h-px bg-outline-variant/20 my-1" />

                {/* Tùy chọn tự động mở thư mục khi xuất xong */}
                <label
                  style={{ WebkitAppRegion: 'no-drag' }}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-surface-container-high transition-colors cursor-pointer select-none"
                >
                  <span className="flex items-center gap-2 text-xs font-medium text-on-surface">
                    <span className="material-symbols-outlined text-[16px] text-primary">folder_managed</span>
                    <span>{t('translate.studio.autoOpenFolder')}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={autoOpenExportFolder}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setAutoOpenExportFolder(val);
                      try {
                        localStorage.setItem('manga_studio_auto_open_export_folder', String(val));
                      } catch { }
                    }}
                    className="accent-primary w-3.5 h-3.5 rounded cursor-pointer"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Zone 3: Right - Tab Switcher (Khung thoại, Quy trình, Cài đặt) + Toggle Sidebar + Close */}
        <div className="flex items-center justify-end gap-1.5 shrink-0 whitespace-nowrap" style={{ WebkitAppRegion: 'no-drag' }}>
          {/* Segmented control: [ 💬 Khung thoại ] [ 📋 Quy trình ] [ ⚙️ Cài đặt ] + [ ◨ Ẩn/Hiện thanh bên ] */}
          <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
            <div className="flex items-center p-0.5 rounded-xl bg-surface-container border border-outline-variant/20 shrink-0 whitespace-nowrap">
              <button
                type="button"
                onClick={() => {
                  if (showRightSidebar && activeRightTab === 'properties') {
                    toggleRightSidebar(false);
                  } else {
                    setActiveRightTab('properties');
                    toggleRightSidebar(true);
                  }
                }}
                style={{ WebkitAppRegion: 'no-drag' }}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${showRightSidebar && activeRightTab === 'properties'
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                title={t('translate.studio.tabPropertiesTitle')}
              >
                <span className="material-symbols-outlined text-[14px]">edit_note</span>
                <span className="whitespace-nowrap">{t('translate.studio.tabProperties')}</span>
                {layers.length > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono shrink-0 ${showRightSidebar && activeRightTab === 'properties'
                    ? 'bg-primary/15 text-primary font-bold'
                    : 'bg-surface-container-high text-on-surface-variant'
                    }`}>
                    {layers.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (showRightSidebar && activeRightTab === 'settings') {
                    toggleRightSidebar(false);
                  } else {
                    setActiveRightTab('settings');
                    toggleRightSidebar(true);
                  }
                }}
                style={{ WebkitAppRegion: 'no-drag' }}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${showRightSidebar && activeRightTab === 'settings'
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                data-tooltip={t('translate.studio.tabSettingsTitle')}
                aria-label={t('translate.studio.tabSettingsTitle')}
              >
                <span className="material-symbols-outlined text-[14px]">settings</span>
                <span className="whitespace-nowrap">{t('translate.studio.tabSettings')}</span>
              </button>
            </div>

            {/* Nút chuyên dụng Ẩn / Hiện thanh bên phải */}
            <button
              type="button"
              onClick={() => toggleRightSidebar()}
              style={{ WebkitAppRegion: 'no-drag' }}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer border shrink-0 ${showRightSidebar
                ? 'border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 shadow-2xs'
                : 'border-outline-variant/25 bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              data-tooltip={showRightSidebar ? t('translate.studio.rightSidebarHide') : t('translate.studio.rightSidebarShow')}
              aria-label={showRightSidebar ? t('translate.studio.rightSidebarHide') : t('translate.studio.rightSidebarShow')}
            >
              <span className="material-symbols-outlined text-[17px]">
                {showRightSidebar ? 'dock_to_right' : 'view_sidebar'}
              </span>
            </button>

            {/* Nút Trợ giúp & Hướng dẫn Quy trình (?) */}
            <button
              type="button"
              onClick={() => {
                setGuideInitialTab('workflow');
                setShowGuideModal(true);
              }}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-outline-variant/25 bg-surface-container text-on-surface-variant hover:text-primary hover:border-primary/30 hover:bg-primary/5 shadow-2xs shrink-0 font-bold"
              data-tooltip={t('translate.studio.helpBtnTitle')}
              aria-label={t('translate.studio.helpBtnTitle')}
            >
              <span className="material-symbols-outlined text-[17px]">help</span>
            </button>
          </div>

          {/* Close Studio / Exit — chỉ hiển thị khi không phải standalone view */}
          {!isStandaloneView && typeof onClose === 'function' && (
            <button
              type="button"
              onClick={onClose}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors cursor-pointer shrink-0"
              data-tooltip={t('translate.studio.exitStudio')}
              aria-label={t('translate.studio.exitStudio')}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── 3-Column Studio Workspace ─── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── 2. Left Rail: Pages List ── */}
        {showLeftSidebar && (
          <div
            style={{ width: `${leftSidebarWidth}px` }}
            className="shrink-0 border-r border-outline-variant/20 bg-surface-container-low flex flex-col select-none relative"
          >
            {/* Draggable Resize Handle on the right border */}
            <ResizeSplitter
              variant="overlay"
              side="right"
              onPointerDown={handleLeftSidebarResizeStart}
              title={t('translate.studio.resizePageList')}
            />

            {/* Header Pages & Filter */}
            <div className="p-3 border-b border-outline-variant/20 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-on-surface">{t('translate.studio.pagesTitle')}</span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-mono text-[11px] font-semibold">
                    {pages.length}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* + Button to import images */}
                  <div ref={addPageDropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setShowAddPageDropdown((prev) => !prev)}
                      className="h-6.5 px-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container hover:border-primary text-on-surface flex items-center gap-1 text-xs font-medium shadow-2xs transition-all cursor-pointer"
                      data-tooltip={t('translate.studio.pageAdd')}
                      aria-label={t('translate.studio.pageAdd')}
                    >
                      <span className="material-symbols-outlined text-[16px] text-primary">add</span>
                      <span>{t('translate.studio.pageAdd')}</span>
                    </button>

                    {showAddPageDropdown && (
                      <div className="absolute left-0 top-full mt-1.5 w-56 rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xl p-1 z-[100] text-xs space-y-0.5 animate-fadeIn text-on-surface">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddPageDropdown(false);
                            handleImportFiles();
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-surface-container-high text-on-surface cursor-pointer transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px] text-primary">add_photo_alternate</span>
                          <div>
                            <div className="font-semibold text-on-surface">{t('translate.studio.pageAddFiles')}</div>
                            <div className="text-[10px] text-on-surface-variant">{t('translate.studio.pageAddFilesSub')}</div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddPageDropdown(false);
                            handleImportFolder();
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-surface-container-high text-on-surface cursor-pointer transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px] text-amber-500">create_new_folder</span>
                          <div>
                            <div className="font-semibold text-on-surface">{t('translate.studio.pageAddFolder')}</div>
                            <div className="text-[10px] text-on-surface-variant">{t('translate.studio.pageAddFolderSub')}</div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  {pages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPageToDelete('all')}
                      className="h-6.5 px-1.5 text-[11px] text-on-surface-variant hover:text-error rounded-lg hover:bg-error/10 transition-colors flex items-center gap-0.5 cursor-pointer"
                      title={t('translate.studio.pageClearAllTitle')}
                    >
                      <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                      <span>{t('translate.studio.pageClearAll')}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="relative">
                <span className="material-symbols-outlined text-[15px] text-on-surface-variant/60 absolute left-2.5 top-2">
                  search
                </span>
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder={t('translate.studio.filterPagesPlaceholder')}
                  className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest pl-8 pr-7 py-1 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                />
                {filterQuery && (
                  <button
                    type="button"
                    onClick={() => setFilterQuery('')}
                    className="absolute right-2 top-2 text-on-surface-variant hover:text-on-surface text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Thumbnail List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {pages.length > 0 && filteredPages.length === 0 ? (
                <div className="text-center py-8 text-xs text-on-surface-variant">
                  {t('translate.studio.noPagesFound', { query: filterQuery })}
                </div>
              ) : (
                filteredPages.map((p) => {
                  const isSelected = p.index === activePageIndex;
                  const isTranslated = Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim());
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setActivePageIndex(p.index);
                        setSelectedLayerId(null);
                        setPan({ x: 0, y: 0 });
                      }}
                      className={`cursor-pointer group flex items-center gap-2.5 p-2 rounded-2xl transition-all border ${isSelected
                        ? 'bg-primary/10 border-primary/40 text-primary shadow-xs ring-1 ring-primary/20'
                        : 'border-outline-variant/15 bg-surface-container-lowest/80 hover:bg-surface-container hover:border-outline-variant/30 text-on-surface'
                        }`}
                    >
                      <div className="relative w-11 h-15 bg-surface-container-high rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-outline-variant/20 shadow-xs">
                        {(p.dataUrl || p.originalDataUrl || p.translatedImageDataUrl) ? (
                          <img
                            src={p.dataUrl || p.originalDataUrl || p.translatedImageDataUrl}
                            alt={p.filename}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-on-surface-variant gap-0.5">
                            <span className="material-symbols-outlined text-[13px] animate-spin text-primary">sync</span>
                            <span className="text-[9px] font-mono">#{p.index + 1}</span>
                          </div>
                        )}
                        {/* Translation Status Dot Badge */}
                        <span
                          className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-surface-container-lowest shadow-xs ${isTranslated ? 'bg-emerald-500' : 'bg-outline-variant/60'
                            }`}
                          title={isTranslated ? t('translate.studio.statusTranslated') : t('translate.studio.statusUntranslated')}
                        />
                      </div>
                      <div className="flex-1 min-w-0 pr-1">
                        <p className={`text-xs truncate ${isSelected ? 'font-bold text-primary' : 'font-semibold text-on-surface'}`}>
                          {p.filename}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-on-surface-variant">
                            {t('translate.studio.layersCount', { count: p.layers.length })}
                          </span>
                          <span className="text-[9px] text-outline-variant/50">•</span>
                          <span className={`text-[10px] font-medium flex items-center gap-1 ${isTranslated ? 'text-emerald-500' : 'text-on-surface-variant/60'}`}>
                            {isTranslated ? t('translate.studio.statusTranslated') : t('translate.studio.statusUntranslated')}
                          </span>
                        </div>
                        <p className="text-[10px] text-on-surface-variant/70 font-mono mt-0.5">
                          {p.width && p.height ? `${p.width} × ${p.height}` : '...'}
                        </p>
                      </div>

                      {/* Nút xóa trang khỏi danh sách */}
                      <button
                        type="button"
                        onClick={(e) => handlePromptRemovePage(p, e)}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer shrink-0 ${isSelected
                          ? 'opacity-70 hover:opacity-100 text-primary hover:bg-primary/20'
                          : 'opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error hover:bg-error/10'
                          }`}
                        title={t('translate.studio.removePagePrompt')}
                      >
                        <span className="material-symbols-outlined text-[15px]">close</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── 3. Center Canvas & Floating Tools Palette ── */}
        <div className="flex-1 min-w-0 bg-surface text-on-surface relative flex flex-col overflow-hidden">
          {/* Enhanced Pipeline Execution Progress HUD with Collapse / Expand */}
          {(isTranslating || translateProgress?.isFinished) && (
            <div
              className={`absolute left-1/2 -translate-x-1/2 z-40 animate-slideDown select-none pointer-events-auto w-full px-4 transition-all duration-300 ${isProgressHudCollapsed ? 'top-2.5 max-w-xl' : 'top-4 max-w-2xl'
                }`}
            >
              <div
                className={`rounded-2xl bg-surface-container-lowest/95 text-on-surface backdrop-blur-xl shadow-2xl border transition-all duration-300 flex flex-col ${isProgressHudCollapsed
                  ? 'border-primary/40 px-3.5 py-2 gap-1.5 shadow-xl'
                  : 'border-primary/30 p-3.5 gap-2.5'
                  }`}
              >
                {/* Top header row */}
                <div className="flex items-center justify-between gap-2.5">
                  <div
                    onClick={() => setIsProgressHudCollapsed((prev) => !prev)}
                    className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-85 transition-opacity"
                    title={isProgressHudCollapsed ? t('translate.studio.progressExpandTooltip') : t('translate.studio.progressCollapseTooltip')}
                  >
                    {isTranslating ? (
                      <span className="material-symbols-outlined text-[19px] text-primary animate-spin shrink-0">
                        progress_activity
                      </span>
                    ) : translateProgress?.residualCount > 0 ? (
                      <span className="material-symbols-outlined text-[19px] text-amber-500 shrink-0">
                        warning
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[19px] text-emerald-500 shrink-0">
                        check_circle
                      </span>
                    )}
                    <span className="font-bold text-xs text-on-surface truncate">
                      {translateProgress?.isFinished
                        ? (translateProgress.residualCount > 0
                          ? t('translate.studio.progressPageResiduals', { count: translateProgress.residualCount })
                          : t('translate.studio.progressPageAllDone'))
                        : (translateProgress?.imageIndex !== undefined && translateProgress?.total
                          ? t('translate.studio.progressBatchProcessing', { current: translateProgress.imageIndex + 1, total: translateProgress.total })
                          : t('translate.studio.progressTitleDefault'))}
                    </span>
                    {!isProgressHudCollapsed && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold border border-primary/20 shrink-0">
                        {displayModelName}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-mono font-bold text-primary mr-0.5">
                      {translateProgress?.isFinished ? '100%' : (typeof translateProgress?.percent === 'number' ? `${translateProgress.percent}%` : t('translate.studio.progressProcessingLabel'))}
                    </span>

                    {/* Nút bật tắt Live Console (chỉ hiện khi mở rộng) */}
                    {!isProgressHudCollapsed && (
                      <button
                        type="button"
                        onClick={() => setShowLogConsole((prev) => !prev)}
                        className={`text-[11px] px-2 py-1 rounded-lg border transition-colors cursor-pointer flex items-center gap-1 font-medium ${showLogConsole
                          ? 'border-primary/40 bg-primary/15 text-primary'
                          : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                          }`}
                        title={showLogConsole ? t('translate.studio.logsToggleHide') : t('translate.studio.logsToggleShow')}
                      >
                        <span className="material-symbols-outlined text-[13px]">terminal</span>
                        <span>{t('translate.studio.logsBtnLabel', { count: logs.length })}</span>
                      </button>
                    )}

                    {/* Nút mở Bảng đối chiếu */}
                    <button
                      type="button"
                      onClick={() => setShowComparisonModal(true)}
                      className="text-[11px] px-2 py-1 rounded-lg border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer flex items-center gap-1 font-medium"
                      title={t('translate.studio.compareTableOpen')}
                    >
                      <span className="material-symbols-outlined text-[13px] text-primary">table_chart</span>
                      <span className={isProgressHudCollapsed ? 'hidden sm:inline' : ''}>{t('translate.studio.compareTableBtn')}</span>
                    </button>

                    {/* Nút Hủy / Đóng */}
                    {isTranslating ? (
                      <button
                        type="button"
                        onClick={handleCancelTranslate}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-surface-container hover:bg-error/20 text-on-surface-variant hover:text-error transition-colors cursor-pointer flex items-center gap-1 font-medium"
                        title={t('translate.studio.stopTitle')}
                      >
                        <span className="material-symbols-outlined text-[14px]">stop_circle</span>
                        <span>{t('translate.studio.cancelBtn')}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTranslateProgress(null)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer flex items-center gap-1 font-medium"
                        title={t('translate.studio.closeBtn')}
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                        <span>{t('translate.studio.closeBtn')}</span>
                      </button>
                    )}

                    {/* Nút Thu gọn / Mở rộng (Collapse / Expand) */}
                    <button
                      type="button"
                      onClick={() => setIsProgressHudCollapsed((prev) => !prev)}
                      className="w-6.5 h-6.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer flex items-center justify-center shrink-0 border border-outline-variant/20"
                      title={isProgressHudCollapsed ? t('translate.studio.progressExpandTooltip') : t('translate.studio.progressCollapseTooltip')}
                    >
                      <span className="material-symbols-outlined text-[17px]">
                        {isProgressHudCollapsed ? 'expand_more' : 'expand_less'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Mini progress bar khi thu gọn (Collapsed) */}
                {isProgressHudCollapsed && (
                  <div className="w-full h-1 rounded-full bg-surface-container overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${translateProgress?.isFinished
                        ? 'bg-emerald-500'
                        : 'bg-gradient-to-r from-primary via-primary to-emerald-500'
                        }`}
                      style={{
                        width: `${translateProgress?.isFinished ? 100 : Math.max(5, Math.min(100, typeof translateProgress?.percent === 'number' ? translateProgress.percent : 25))}%`,
                      }}
                    />
                  </div>
                )}

                {/* Chi tiết khi mở rộng (Expanded) */}
                {!isProgressHudCollapsed && (
                  <>
                    {/* 5-Step Visual Stepper */}
                    <div className="grid grid-cols-5 gap-1.5">
                      {[
                        { id: 'detect', label: t('translate.studio.pipelineStepDetect'), icon: 'crop_free', stepNum: 1 },
                        { id: 'ocr', label: t('translate.studio.pipelineStepOcr'), icon: 'document_scanner', stepNum: 2 },
                        { id: 'translate', label: t('translate.studio.pipelineStepTranslate'), icon: 'translate', stepNum: 3 },
                        { id: 'verify', label: t('translate.studio.pipelineStepVerify'), icon: 'verified', stepNum: 4 },
                        { id: 'typeset', label: t('translate.studio.pipelineStepTypeset'), icon: 'layers', stepNum: 5 },
                      ].map((s) => {
                        const stepOrder = { load: 0, detect: 1, ocr: 2, translate: 3, verify: 4, inpaint: 5, typeset: 5, review: 5, completed: 6 };
                        const currentIdx = translateProgress?.isFinished ? 6 : (stepOrder[translateProgress?.step] ?? 1);
                        const isDone = currentIdx > s.stepNum || translateProgress?.isFinished;
                        const isCurrent = !translateProgress?.isFinished && currentIdx === s.stepNum;

                        return (
                          <div
                            key={s.id}
                            className={`flex items-center gap-1.5 p-1.5 rounded-xl border text-[11px] transition-all ${isDone
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold'
                              : isCurrent
                                ? 'bg-primary/15 border-primary/50 text-primary font-bold shadow-2xs'
                                : 'border-outline-variant/15 bg-surface-container/50 text-on-surface-variant/70'
                              }`}
                          >
                            <span className="material-symbols-outlined text-[15px] shrink-0">
                              {isDone ? 'check_circle' : (isCurrent ? 'radio_button_checked' : s.icon)}
                            </span>
                            <span className="truncate">{s.label}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${translateProgress?.isFinished
                          ? 'bg-emerald-500'
                          : 'bg-gradient-to-r from-primary via-primary to-emerald-500'
                          }`}
                        style={{
                          width: `${translateProgress?.isFinished ? 100 : Math.max(5, Math.min(100, typeof translateProgress?.percent === 'number' ? translateProgress.percent : 25))}%`,
                        }}
                      />
                    </div>

                    {/* Detail summary line */}
                    <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                      <span className="truncate max-w-lg font-medium text-on-surface">
                        {translateProgress?.detail || statusMessage.text || t('translate.studio.processingCanvas')}
                      </span>
                      {translateProgress?.residualCount > 0 ? (
                        <button
                          type="button"
                          onClick={handleRetryResidualBubbles}
                          disabled={isRetryingResidual}
                          className="text-amber-500 hover:text-amber-600 font-semibold flex items-center gap-0.5 shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
                          title={t('translate.studio.retryResidualTooltip')}
                        >
                          <span className="material-symbols-outlined text-[13px]">warning</span>
                          <span>{t('translate.studio.residualCountBtn', { count: translateProgress.residualCount })}</span>
                        </button>
                      ) : translateProgress?.isFinished ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5 shrink-0">
                          <span className="material-symbols-outlined text-[13px]">verified</span>
                          <span>{t('translate.studio.allPassedBadge')}</span>
                        </span>
                      ) : null}
                    </div>

                    {/* Live Streaming Terminal Log Console */}
                    {showLogConsole && (
                      <div className="flex flex-col gap-1.5 pt-2 border-t border-outline-variant/20">
                        <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                          <span className="flex items-center gap-1 font-semibold text-on-surface">
                            <span className="material-symbols-outlined text-[14px] text-primary">terminal</span>
                            <span>{t('translate.studio.detailedAiLogsTitle', { count: logs.length })}</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const text = logs.map((l) => `[${l.time}] [${l.step?.toUpperCase()}] ${l.detail}`).join('\n');
                                navigator.clipboard?.writeText(text);
                                setStatusMessage({ text: t('translate.studio.logsCopiedToast'), type: 'info' });
                              }}
                              className="text-[10px] text-on-surface-variant hover:text-primary transition-colors cursor-pointer flex items-center gap-0.5"
                              title={t('translate.studio.copyLogs')}
                            >
                              <span className="material-symbols-outlined text-[12px]">content_copy</span>
                              <span>{t('translate.studio.copyLogs')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setLogs([])}
                              className="text-[10px] text-on-surface-variant hover:text-error transition-colors cursor-pointer flex items-center gap-0.5"
                              title={t('translate.studio.clearLogs')}
                            >
                              <span className="material-symbols-outlined text-[12px]">delete_sweep</span>
                              <span>{t('translate.studio.clearLogs')}</span>
                            </button>
                          </div>
                        </div>

                        <div
                          ref={logConsoleRef}
                          className="max-h-48 overflow-y-auto rounded-xl bg-surface-container-lowest border border-outline-variant/20 p-2.5 font-mono text-[11px] leading-relaxed space-y-1 shadow-inner select-text"
                        >
                          {logs.length === 0 ? (
                            <div className="text-on-surface-variant/50 text-center py-2 italic text-[11px]">
                              {t('translate.studio.emptyLogs')}
                            </div>
                          ) : (
                            logs.map((log) => {
                              const isWarn = log.type === 'warn';
                              const isError = log.type === 'error';
                              const stepBadgeMap = {
                                init: t('translate.studio.logTagInit'),
                                detect: t('translate.studio.logTagDetect'),
                                ocr: t('translate.studio.logTagOcr'),
                                translate: t('translate.studio.logTagTranslate'),
                                verify: t('translate.studio.logTagVerify'),
                                inpaint: t('translate.studio.logTagInpaint'),
                                typeset: t('translate.studio.logTagTypeset'),
                                completed: t('translate.studio.logTagCompleted'),
                              };
                              const stepBadge = stepBadgeMap[log.step] || log.step?.toUpperCase() || 'INFO';
                              const stepColorMap = {
                                init: 'text-primary',
                                detect: 'text-cyan-500 dark:text-cyan-400',
                                ocr: 'text-sky-500 dark:text-sky-400',
                                translate: 'text-purple-500 dark:text-purple-400',
                                verify: isWarn ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-500 dark:text-emerald-400',
                                inpaint: 'text-pink-500 dark:text-pink-400',
                                typeset: 'text-indigo-500 dark:text-indigo-400',
                                completed: 'text-emerald-500 dark:text-emerald-400 font-bold',
                              };
                              const stepColor = stepColorMap[log.step] || 'text-primary';

                              return (
                                <div
                                  key={log.id}
                                  className={`flex items-start gap-1.5 py-0.5 transition-colors ${isError
                                    ? 'text-error font-medium'
                                    : isWarn
                                      ? 'text-amber-600 dark:text-amber-300 font-medium'
                                      : 'text-on-surface'
                                    }`}
                                >
                                  <span className="text-[10px] text-on-surface-variant/60 shrink-0 select-none">
                                    [{log.time}]
                                  </span>
                                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 select-none bg-surface-container ${stepColor}`}>
                                    {stepBadge}
                                  </span>
                                  <span className="break-all whitespace-pre-wrap flex-1">{log.detail}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Persistent Residual Japanese Warning & Quick Action Banner */}
          {!isTranslating && residualLayers.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 animate-slideDown select-none max-w-xl w-full px-4">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-amber-950/90 text-amber-200 border border-amber-500/40 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">
                    warning
                  </span>
                  <div className="min-w-0 text-xs">
                    <p className="font-bold text-amber-300 truncate">
                      {t('translate.studio.residualBannerTitle', { count: residualLayers.length })}
                    </p>
                    <p className="text-[11px] text-amber-200/80 truncate">
                      {t('translate.studio.residualBannerDesc')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRetryResidualBubbles}
                  disabled={isRetryingResidual}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1 shrink-0 disabled:opacity-50"
                  title={t('translate.studio.retryResidualsTitle')}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {isRetryingResidual ? 'sync' : 'bolt'}
                  </span>
                  <span>{isRetryingResidual ? t('translate.studio.retryingLabel') : t('translate.studio.retryResidualsBtn', { count: residualLayers.length })}</span>
                </button>
              </div>
            </div>
          )}

          {/* Floating Vertical Tool Palette (Docked on Left of Canvas) */}
          <div className="absolute left-4 top-4 z-30 flex flex-col gap-1 p-1 bg-surface-container-lowest/95 border border-outline-variant/30 rounded-2xl shadow-xl backdrop-blur-md">
            {[
              { id: 'select', icon: 'near_me', label: t('translate.studio.toolSelect') },
              { id: 'text', icon: 'title', label: t('translate.studio.toolText'), action: handleAddTextLayer },
              { id: 'hand', icon: 'pan_tool', label: t('translate.studio.toolHand') },
            ].map((tool) => {
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    if (tool.action) tool.action();
                    else setActiveTool(tool.id);
                  }}
                  title={tool.label}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${isActive
                    ? 'bg-primary/15 text-primary font-bold shadow-2xs border border-primary/30'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                >
                  <span className="material-symbols-outlined text-[17px]">{tool.icon}</span>
                </button>
              );
            })}
          </div>

          {/* Canvas Scroll & Viewport Area */}
          <div
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={handleCanvasDrop}
            className={`flex-1 overflow-hidden flex items-center justify-center p-8 relative bg-surface-container-low/40 ${activeTool === 'hand' || isSpacePressed || isPanning
              ? (isPanning ? 'cursor-grabbing' : 'cursor-grab')
              : 'cursor-default'
              }`}
          >
            {(activePage?.dataUrl || activePage?.originalDataUrl || activePage?.translatedImageDataUrl) ? (
              <div
                ref={imageContainerRef}
                style={{
                  width: `${containerW * (zoom / 100)}px`,
                  height: `${containerH * (zoom / 100)}px`,
                  transform: `translate(${pan.x}px, ${pan.y}px)`,
                  transition: isPanning ? 'none' : 'transform 0.05s ease-out',
                }}
                className="relative shadow-2xl bg-white select-none shrink-0 ring-1 ring-black/5 dark:ring-white/10"
              >
                {/* Layer 0: Original Manga Artwork (Hiện ảnh clean khi bật Cleanup, hoặc ảnh gốc khi tắt) */}
                {showArtworkLayer && (
                  <img
                    ref={imageRef}
                    src={
                      showCleanupLayer && activePage.cleanDataUrl
                        ? activePage.cleanDataUrl
                        : (activePage.originalDataUrl || activePage.dataUrl || activePage.translatedImageDataUrl)
                    }
                    alt={activePage.filename}
                    onLoad={handleImageLoaded}
                    draggable={false}
                    className="w-full h-full object-contain pointer-events-none block"
                  />
                )}

                {/* Layer Overlays: Speech Bubble (Vòng nét đứt xanh) & Text Box (Khung chữ nhật đỏ có chốt pin) chuẩn Koharu */}
                {layers.map((layer, layerIdx) => {
                  if (!layer.visible) return null;
                  const scale = zoom / 100;
                  const isSelected = layer.id === selectedLayerId;

                  // 1. Tọa độ Bong bóng thoại (Outer Speech Bubble)
                  const rawBubbleBbox = Array.isArray(layer.bbox) && layer.bbox.length === 4
                    ? layer.bbox
                    : [0, 0, 100, 100];
                  const [bx, by, bw, bh] = rawBubbleBbox;

                  // 2. Tọa độ Khung chat text (Inner Text Box)
                  const rawTextBbox = computeOptimalTextBox(
                    rawBubbleBbox,
                    layer.textBbox,
                    layer.hasBubble !== false,
                    layer.isCustomTextBox
                  );
                  const [tx, ty, tw, th] = rawTextBbox;

                  // Bo góc mềm mại cho Bong bóng thoại theo hình dáng oval
                  const isOvalBubble = layer.hasBubble !== false && (layer.type === 'dialogue' || !layer.type);
                  const bubbleRadius = isOvalBubble
                    ? Math.round(Math.min(bw, bh) * 0.45 * scale)
                    : Math.round(Math.min(bw, bh) * 0.12 * scale);

                  // Tự động tính toán font size vừa vặn bên trong khung chat text (tw, th)
                  let computedFontSize = 14;
                  if (layer.fontSize === 'auto' || !layer.fontSize) {
                    computedFontSize = calculateOptimalFontSize(
                      layer.text,
                      tw,
                      th,
                      layer.fontFamily,
                      layer.fontWeight,
                      layer.textTransform || 'uppercase',
                      false // Text box is rectangular
                    );
                  } else {
                    computedFontSize = Number(layer.fontSize) || 14;
                  }

                  const maskInset = Math.max(2, Math.round(Math.min(bw, bh) * 0.035));

                  return (
                    <React.Fragment key={layer.id}>
                      {/* === VÙNG BONG BÓNG THOẠI (SPEECH BUBBLE HIT AREA & MASK) === */}
                      <div
                        onMouseDown={(e) => handleMouseDownOnLayer(e, layer, 'bubble')}
                        style={{
                          position: 'absolute',
                          left: `${bx * scale}px`,
                          top: `${by * scale}px`,
                          width: `${bw * scale}px`,
                          height: `${bh * scale}px`,
                          zIndex: isSelected ? 15 : 5,
                          borderRadius: `${bubbleRadius}px`,
                          pointerEvents: (activeTool === 'hand' || isSpacePressed) ? 'none' : 'auto',
                        }}
                        className="cursor-move select-none"
                      >
                        {/* Speech Bubble Mask (CHỈ hiển thị khi user bật fillBackground tường minh cho layer này) */}
                        {layer.fillBackground === true && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: `${maskInset * scale}px`,
                              backgroundColor: layer.backgroundColor || '#ffffff',
                              opacity: layer.backgroundOpacity ?? 0.98,
                              borderRadius: `${Math.max(2, bubbleRadius - Math.round(maskInset * scale))}px`,
                              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                      </div>

                      {/* === KHUNG CHAT TEXT (TEXT BOX) CHUẨN KOHARU: DUY NHẤT VIỀN HỒNG + CHỐT PIN + 8 NÚT RESIZE === */}
                      <div
                        onMouseDown={(e) => handleMouseDownOnLayer(e, layer, 'textBox')}
                        onDoubleClick={(e) => handleDoubleClickOnLayer(e, layer)}
                        style={{
                          position: 'absolute',
                          left: `${tx * scale}px`,
                          top: `${ty * scale}px`,
                          width: `${tw * scale}px`,
                          height: `${th * scale}px`,
                          zIndex: isSelected ? 35 : 15,
                          pointerEvents: (activeTool === 'hand' || isSpacePressed) ? 'none' : 'auto',
                        }}
                        className={`group/text cursor-move select-none transition-all ${isSelected
                          ? 'border-2 border-pink-500 bg-pink-500/[0.04]'
                          : isLayerResidual(layer)
                            ? 'border border-dashed border-amber-500/70 bg-amber-500/5'
                            : 'border border-transparent hover:border-pink-400/40'
                          }`}
                      >
                        {/* Badge chỉ số khung thoại trên UI */}
                        <div
                          className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold pointer-events-none transition-opacity flex items-center gap-1 shadow-xs whitespace-nowrap ${isLayerResidual(layer)
                            ? 'bg-amber-600 text-white opacity-100 z-50 ring-1 ring-amber-400/50'
                            : isSelected
                              ? 'bg-pink-600 text-white opacity-100 z-50'
                              : 'bg-zinc-800/85 text-zinc-100 opacity-0 group-hover/text:opacity-100'
                            }`}
                        >
                          <span>#{layerIdx + 1}</span>
                          {isLayerResidual(layer) && (
                            <span className="text-[8px] font-sans font-bold">{t('translate.studio.residualWarningTag')}</span>
                          )}
                          {isSelected && !isLayerResidual(layer) && (
                            <span className="text-[8px] opacity-80">({tw}×{th})</span>
                          )}
                        </div>

                        {/* Chốt tay nắm (Top Handle Pin) chuẩn Koharu vươn lên ở đỉnh */}
                        {isSelected && (
                          <div className="absolute -top-5.5 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-50">
                            {/* Núm vuông tay nắm chốt */}
                            <div
                              onMouseDown={(e) => handleMouseDownOnLayer(e, layer, 'top-pin')}
                              className="w-2.5 h-2.5 bg-pink-500 border border-white rounded-[1px] shadow-xs cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
                              title={t('translate.studio.bubbleHandleDragTitle')}
                            />
                            {/* Thanh dọc kết nối từ chốt xuống khung */}
                            <div className="w-0.5 h-3 bg-pink-500 pointer-events-none" />
                          </div>
                        )}

                        {/* Text Typography Content */}
                        <div
                          style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            opacity: layer.opacity ?? 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent:
                              layer.align === 'left'
                                ? 'flex-start'
                                : layer.align === 'right'
                                  ? 'flex-end'
                                  : 'center',
                            textAlign: layer.align || 'center',
                            fontFamily: layer.fontFamily,
                            fontSize: `${computedFontSize * scale}px`,
                            fontWeight: layer.fontWeight || '700',
                            fontStyle: layer.fontStyle || 'normal',
                            color: layer.color || '#000000',
                            lineHeight: 1.2,
                            letterSpacing: '0.02em',
                            textTransform: layer.textTransform || 'uppercase',
                            padding: `${Math.max(1, Math.round(th * 0.03 * scale))}px ${Math.max(1, Math.round(tw * 0.03 * scale))}px`,
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                            whiteSpace: 'pre-wrap',
                            overflow: 'hidden',
                            pointerEvents: 'none',
                            userSelect: 'none',
                            textShadow:
                              layer.strokeWidth > 0
                                ? `-${layer.strokeWidth * scale}px -${layer.strokeWidth * scale}px 0 ${layer.strokeColor || '#ffffff'}, ` +
                                `${layer.strokeWidth * scale}px -${layer.strokeWidth * scale}px 0 ${layer.strokeColor || '#ffffff'}, ` +
                                `-${layer.strokeWidth * scale}px ${layer.strokeWidth * scale}px 0 ${layer.strokeColor || '#ffffff'}, ` +
                                `${layer.strokeWidth * scale}px ${layer.strokeWidth * scale}px 0 ${layer.strokeColor || '#ffffff'}`
                                : 'none',
                          }}
                        >
                          {layer.text ? (
                            layer.text
                          ) : isTranslating ? (
                            <span className="text-[10px] text-pink-500 font-mono animate-pulse flex items-center justify-center gap-1.5 opacity-85 select-none">
                              <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-ping shrink-0" />
                              <span>{t('translate.studio.scanningStatus')}</span>
                            </span>
                          ) : (
                            <span className="opacity-30 italic text-xs">{t('translate.studio.emptyStatus')}</span>
                          )}
                        </div>

                        {/* 8 Resize Handles viền hồng quanh Khung chat text chuẩn Koharu */}
                        {isSelected && (
                          <>
                            {/* 4 Handles ở 4 góc */}
                            <div
                              onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'nw', 'textBox')}
                              className="absolute -left-1.5 -top-1.5 w-2.5 h-2.5 bg-white border-2 border-pink-500 rounded-[1px] cursor-nwse-resize z-40 shadow-xs hover:scale-125 transition-transform"
                              title={t('translate.studio.handleNw')}
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'ne', 'textBox')}
                              className="absolute -right-1.5 -top-1.5 w-2.5 h-2.5 bg-white border-2 border-pink-500 rounded-[1px] cursor-nesw-resize z-40 shadow-xs hover:scale-125 transition-transform"
                              title={t('translate.studio.handleNe')}
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'se', 'textBox')}
                              className="absolute -right-1.5 -bottom-1.5 w-2.5 h-2.5 bg-white border-2 border-pink-500 rounded-[1px] cursor-nwse-resize z-40 shadow-xs hover:scale-125 transition-transform"
                              title={t('translate.studio.handleSe')}
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'sw', 'textBox')}
                              className="absolute -left-1.5 -bottom-1.5 w-2.5 h-2.5 bg-white border-2 border-pink-500 rounded-[1px] cursor-nesw-resize z-40 shadow-xs hover:scale-125 transition-transform"
                              title={t('translate.studio.handleSw')}
                            />

                            {/* 4 Handles ở giữa các cạnh */}
                            <div
                              onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'n', 'textBox')}
                              className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-2.5 h-2 bg-white border border-pink-500 rounded-[1px] cursor-ns-resize z-40 shadow-xs hover:scale-125 transition-transform"
                              title={t('translate.studio.handleN')}
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 's', 'textBox')}
                              className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-2.5 h-2 bg-white border border-pink-500 rounded-[1px] cursor-ns-resize z-40 shadow-xs hover:scale-125 transition-transform"
                              title={t('translate.studio.handleS')}
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'w', 'textBox')}
                              className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2 h-2.5 bg-white border border-pink-500 rounded-[1px] cursor-ew-resize z-40 shadow-xs hover:scale-125 transition-transform"
                              title={t('translate.studio.handleW')}
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'e', 'textBox')}
                              className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2 h-2.5 bg-white border border-pink-500 rounded-[1px] cursor-ew-resize z-40 shadow-xs hover:scale-125 transition-transform"
                              title={t('translate.studio.handleE')}
                            />
                          </>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            ) : pages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto select-none animate-fadeIn">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center mb-3.5 text-primary shadow-2xs">
                  <span className="material-symbols-outlined text-[24px] text-primary">translate</span>
                </div>
                <h3 className="text-base font-bold text-on-surface mb-1">
                  {t('translate.studio.emptyTitle')}
                </h3>
                <p className="text-xs text-on-surface-variant mb-6 leading-relaxed">
                  {t('translate.studio.emptyDesc')}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleImportFiles}
                    className="px-4 py-2 rounded-xl bg-primary hover:brightness-110 text-on-primary font-semibold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer hover:scale-105 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[17px]">add_photo_alternate</span>
                    <span>{t('translate.studio.importFilesBtn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleImportFolder}
                    className="px-4 py-2 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs flex items-center gap-2 shadow-2xs transition-all cursor-pointer hover:scale-105 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[17px] text-primary">folder_open</span>
                    <span>{t('translate.studio.importFolderBtn')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-on-surface-variant gap-3">
                <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
                <p className="text-xs font-medium">{t('translate.studio.loadingPage', { filename: activePage?.filename || '' })}</p>
              </div>
            )}
          </div>

          {/* Bottom Zoom & Dimension Bar (Koharu Style) */}
          <div className="px-4 py-2 border-t border-outline-variant/20 bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-between text-xs text-on-surface-variant select-none">
            {/* Left: Zoom Slider */}
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px] cursor-pointer hover:text-on-surface" onClick={() => handleZoomChange(zoom - 10)}>
                remove
              </span>
              <input
                type="range"
                min="25"
                max="300"
                step="5"
                value={zoom}
                onChange={(e) => handleZoomChange(Number(e.target.value))}
                className="w-24 sm:w-28 accent-rose-500 cursor-pointer h-1 bg-surface-container-high rounded-lg"
              />
              <span className="material-symbols-outlined text-[15px] cursor-pointer hover:text-on-surface" onClick={() => handleZoomChange(zoom + 10)}>
                add
              </span>
              <span className="font-mono font-semibold text-on-surface w-11 text-left">
                {zoom}%
              </span>
            </div>

            {/* Canvas Dimensions & Fit */}
            <div className="flex items-center gap-2 font-mono">
              <span className="text-on-surface-variant/70 mr-1">{containerW} × {containerH} px</span>
              <button
                type="button"
                onClick={handleResetZoom}
                className="px-2.5 py-1 rounded-lg border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high hover:border-primary text-xs font-sans font-medium text-on-surface hover:text-primary transition-colors cursor-pointer shadow-2xs"
                title={t('translate.studio.resetZoom100')}
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => handleFitToScreen()}
                className="px-2.5 py-1 rounded-lg border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high hover:border-primary text-xs font-sans font-medium text-on-surface hover:text-primary transition-colors cursor-pointer shadow-2xs"
                title={t('translate.studio.fitScreen')}
              >
                Fit
              </button>
            </div>
          </div>
        </div>

        {/* ── 4. Right Sidebar: Workflow / Settings ── */}
        {showRightSidebar && (
          <div
            style={{ width: `${rightSidebarWidth}px` }}
            className="shrink-0 border-l border-outline-variant/20 bg-surface-container-low text-on-surface flex flex-col relative select-text min-h-0"
          >
            {/* Draggable Resize Handle on the left border */}
            <ResizeSplitter
              variant="overlay"
              side="left"
              onPointerDown={handleRightSidebarResizeStart}
              title={t('translate.studio.resizeSidebar')}
            />

            {/* Scrollable Container */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {activeRightTab === 'properties' ? (
                <div className="divide-y divide-outline-variant/15">
                {/* ── Section A: Type Inspector (Koharu Style) ── */}
                <div className="p-3.5 space-y-2.5">
                  {/* Header: T Type */}
                  <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/15">
                    <span className="text-[#db6177] font-serif font-bold text-sm select-none">T</span>
                    <span className="text-xs font-semibold text-on-surface select-none">Type</span>
                  </div>

                  {/* Row 1: FONT & COLOR */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-on-surface-variant mb-1 select-none">
                      <span>FONT</span>
                      <span>COLOR</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Font Select */}
                      <SearchableSelect
                        value={resolveFontOptionValue(selectedLayer?.fontFamily)}
                        onChange={handleFontChange}
                        options={fontOptions}
                        placeholder={t('translate.studio.fontWildWords') || 'CC Wild Words'}
                        className="flex-1 min-w-0"
                        size="sm"
                      />

                      {/* Color Swatch Square */}
                      <div className="relative">
                        <button
                          type="button"
                          disabled={!selectedLayer}
                          onClick={() => setShowColorPicker(!showColorPicker)}
                          className="w-8 h-8 rounded-lg border border-outline-variant/30 bg-surface-container-lowest flex items-center justify-center cursor-pointer hover:border-[#db6177] active:scale-95 transition-all disabled:opacity-50"
                          data-tooltip={t('translate.studio.chooseTextColor')}
                          aria-label={t('translate.studio.chooseTextColor')}
                        >
                          <span
                            className="w-4.5 h-4.5 rounded-full border border-black/15 shadow-inner"
                            style={{ backgroundColor: selectedLayer?.color || '#000000' }}
                          />
                        </button>
                        {showColorPicker && (
                          <div className="absolute right-0 top-full mt-2 p-2 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-xl z-50 flex flex-col gap-2 min-w-[140px]">
                            <div className="flex items-center gap-1 justify-center">
                              {QUICK_COLORS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => {
                                    updateSelectedLayer({ color: c });
                                    setShowColorPicker(false);
                                  }}
                                  style={{ backgroundColor: c }}
                                  className="w-4 h-4 rounded-full border border-outline-variant/30 hover:scale-110 transition-transform cursor-pointer"
                                />
                              ))}
                            </div>
                            <input
                              type="color"
                              value={selectedLayer?.color || '#000000'}
                              onChange={(e) => updateSelectedLayer({ color: e.target.value })}
                              className="w-full h-7 cursor-pointer rounded"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: SIZE, WEIGHT, STYLE (Equal 3 columns) */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">SIZE</label>
                      <SearchableSelect
                        value={String(selectedLayer?.fontSize || 'auto')}
                        disabled={!selectedLayer}
                        onChange={(val) => updateSelectedLayer({ fontSize: val })}
                        options={fontSizeOptions}
                        className="w-full min-w-0"
                        size="sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">WEIGHT</label>
                      <SearchableSelect
                        value={String(selectedLayer?.fontWeight || '400')}
                        disabled={!selectedLayer}
                        onChange={(val) => updateSelectedLayer({ fontWeight: val })}
                        options={fontWeightOptions}
                        className="w-full min-w-0"
                        size="sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">STYLE</label>
                      <SearchableSelect
                        value={selectedLayer?.fontStyle || 'normal'}
                        disabled={!selectedLayer}
                        onChange={(val) => updateSelectedLayer({ fontStyle: val })}
                        options={FONT_STYLE_OPTIONS}
                        className="w-full min-w-0"
                        size="sm"
                      />
                    </div>
                  </div>

                  {/* Row 3: ALIGNMENT & DIRECTION (Equal 2 columns 50/50) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">ALIGNMENT</label>
                      <div className="h-8 flex items-center rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-0.5">
                        {[
                          { id: 'left', icon: 'format_align_left' },
                          { id: 'center', icon: 'format_align_center' },
                          { id: 'right', icon: 'format_align_right' },
                        ].map((btn) => {
                          const isActive = (selectedLayer?.align || 'center') === btn.id;
                          return (
                            <button
                              key={btn.id}
                              type="button"
                              disabled={!selectedLayer}
                              onClick={() => updateSelectedLayer({ align: btn.id })}
                              className={`flex-1 h-full rounded-md flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 ${isActive
                                ? 'bg-[#db6177] text-white shadow-xs font-bold'
                                : 'text-on-surface-variant hover:text-on-surface'
                                }`}
                            >
                              <span className="material-symbols-outlined text-[16px]">{btn.icon}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">DIRECTION</label>
                      <SearchableSelect
                        value={selectedLayer?.direction || 'auto'}
                        disabled={!selectedLayer}
                        onChange={(val) => updateSelectedLayer({ direction: val })}
                        options={TEXT_DIRECTION_OPTIONS}
                        className="w-full min-w-0"
                        size="sm"
                      />
                    </div>
                  </div>

                  {/* Row 4: BORDER & WIDTH (Equal 2 columns 50/50 matching Row 3) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">BORDER</label>
                      <div className="h-8 flex items-center justify-between rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2 transition-colors">
                        <button
                          type="button"
                          disabled={!selectedLayer}
                          onClick={() => {
                            if (!selectedLayer) return;
                            const cur = selectedLayer.strokeWidth || 0;
                            updateSelectedLayer({ strokeWidth: cur > 0 ? 0 : 1.5 });
                          }}
                          className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors ${(selectedLayer?.strokeWidth || 0) > 0 ? 'text-[#db6177]' : 'text-on-surface-variant hover:text-on-surface'}`}
                          title={t('translate.studio.toggleStroke')}
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="8.5" y1="15.5" x2="15.5" y2="8.5" />
                          </svg>
                          <span className="text-[11px] select-none font-medium">
                            {(selectedLayer?.strokeWidth || 0) > 0 ? t('translate.studio.strokeOn', 'Bật') : t('translate.studio.strokeOff', 'Tắt')}
                          </span>
                        </button>

                        {/* Stroke Color Swatch */}
                        <div className="relative shrink-0 flex items-center">
                          <button
                            type="button"
                            disabled={!selectedLayer || (selectedLayer?.strokeWidth || 0) <= 0}
                            onClick={() => setShowStrokeColorPicker(!showStrokeColorPicker)}
                            className="w-5 h-5 rounded-full border border-outline-variant/40 flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none shadow-2xs"
                            title={t('translate.studio.chooseStrokeColor', 'Chọn màu viền chữ')}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-xs"
                              style={{ backgroundColor: selectedLayer?.strokeColor || '#ffffff' }}
                            />
                          </button>
                          {showStrokeColorPicker && (
                            <div className="absolute right-0 top-full mt-2 p-2 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-xl z-50 flex flex-col gap-2 min-w-[140px]">
                              <div className="flex items-center gap-1 justify-center">
                                {['#ffffff', '#000000', '#facc15', '#ef4444', '#3b82f6'].map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => {
                                      updateSelectedLayer({ strokeColor: c });
                                      setShowStrokeColorPicker(false);
                                    }}
                                    style={{ backgroundColor: c }}
                                    className="w-4 h-4 rounded-full border border-outline-variant/30 hover:scale-110 transition-transform cursor-pointer"
                                  />
                                ))}
                              </div>
                              <input
                                type="color"
                                value={selectedLayer?.strokeColor || '#ffffff'}
                                onChange={(e) => updateSelectedLayer({ strokeColor: e.target.value })}
                                className="w-full h-7 cursor-pointer rounded"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">WIDTH</label>
                      <div className="h-8 flex items-center rounded-lg border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
                        <button
                          type="button"
                          disabled={!selectedLayer || (selectedLayer?.strokeWidth || 0) <= 0}
                          onClick={() => {
                            const cur = Number(selectedLayer?.strokeWidth ?? 1.5);
                            updateSelectedLayer({ strokeWidth: Math.max(0, +(cur - 0.5).toFixed(1)) });
                          }}
                          className="w-7 h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container text-xs font-semibold cursor-pointer border-r border-outline-variant/20 disabled:opacity-40 select-none shrink-0"
                          title="-0.5px"
                        >
                          —
                        </button>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="20"
                          value={selectedLayer?.strokeWidth ?? 1.5}
                          disabled={!selectedLayer || (selectedLayer?.strokeWidth || 0) <= 0}
                          onChange={(e) => updateSelectedLayer({ strokeWidth: parseFloat(e.target.value) || 0 })}
                          className="flex-1 h-full text-center text-xs font-mono text-on-surface bg-transparent focus:outline-none min-w-0 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={!selectedLayer || (selectedLayer?.strokeWidth || 0) <= 0}
                          onClick={() => {
                            const cur = Number(selectedLayer?.strokeWidth ?? 1.5);
                            updateSelectedLayer({ strokeWidth: +(cur + 0.5).toFixed(1) });
                          }}
                          className="w-7 h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container text-xs font-semibold cursor-pointer border-l border-outline-variant/20 disabled:opacity-40 select-none shrink-0"
                          title="+0.5px"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Section B: Layers List (Koharu Architecture) ── */}
                <div className="p-3.5 space-y-2.5">
                  {/* Group Folder Row: Text Group (Unified card matching System Layers) */}
                  <div
                    onClick={() => setIsTextGroupCollapsed((prev) => !prev)}
                    className="flex items-center justify-between p-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/60 text-on-surface hover:bg-surface-container-high/60 cursor-pointer select-none transition-all group/text-group"
                    title={isTextGroupCollapsed ? 'Expand' : 'Collapse'}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`material-symbols-outlined text-[16px] text-on-surface-variant transition-transform duration-200 shrink-0 ${isTextGroupCollapsed ? '-rotate-90' : 'rotate-0'
                          }`}
                      >
                        expand_more
                      </span>
                      <span className="material-symbols-outlined text-[16px] text-[#db6177] shrink-0">
                        {isTextGroupCollapsed ? 'folder' : 'folder_open'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-tight text-on-surface flex items-center gap-1.5">
                          <span>Text</span>
                          <span className="text-[10px] text-on-surface-variant font-normal">
                            ({layers.length})
                          </span>
                        </p>
                        <p className="text-[10px] text-on-surface-variant leading-tight">{t('translate.type.textGroup')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-on-surface-variant font-mono">100%</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAllTextLayersVisibility();
                        }}
                        className="text-on-surface-variant hover:text-on-surface p-1 rounded-md hover:bg-surface-variant/50 cursor-pointer transition-colors"
                        title={layers.length > 0 && layers.every((l) => l.visible !== false) ? 'Hide' : 'Show'}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {layers.length > 0 && layers.some((l) => l.visible !== false) ? 'visibility' : 'visibility_off'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Residual Japanese Alert & 1-Click Quick Retry Button in Layer List */}
                  {residualLayers.length > 0 && (
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 min-w-0">
                        <span className="material-symbols-outlined text-[16px] shrink-0">warning</span>
                        <span className="truncate font-semibold text-[11px]">{t('translate.type.residualWarning', { count: residualLayers.length })}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRetryResidualBubbles}
                        disabled={isTranslating || isRetryingResidual}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold shadow-xs cursor-pointer flex items-center gap-1 shrink-0 disabled:opacity-50"
                        title={t('translate.type.retryResidualTitle')}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {isRetryingResidual ? 'sync' : 'bolt'}
                        </span>
                        <span>{isRetryingResidual ? t('translate.type.retryingResidual') : t('translate.type.retryResidual')}</span>
                      </button>
                    </div>
                  )}

                  {/* List of text layers (Expanded inline card for selectedLayer, collapsed rows for others) */}
                  {!isTextGroupCollapsed && (
                    <div className="space-y-2 pl-3.5">
                      {layers.length === 0 ? (
                        <p className="text-xs text-on-surface-variant italic py-3 text-center">
                          {t('translate.type.noBubbles')}
                        </p>
                      ) : (
                        layers.map((l, i) => {
                          const isSelected = l.id === selectedLayerId;
                          const isExpanded = l.id === expandedLayerId;
                          const hasRes = isLayerResidual(l);

                          if (isExpanded) {
                            return (
                              /* Expanded Selected Layer Card */
                              <div
                                key={l.id}
                                onClick={() => setSelectedLayerId(l.id)}
                                className={`rounded-2xl border p-3 space-y-2.5 shadow-xs transition-all ${isSelected
                                  ? 'bg-[#fff0f3] dark:bg-[#2a171c] border-[#f8d7da] dark:border-[#522b35] ring-1 ring-[#db6177]/30'
                                  : 'bg-surface-container-lowest border-outline-variant/30 hover:border-outline-variant/60'
                                  }`}
                              >
                                {/* Card Header: Clickable to toggle collapse */}
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleLayerCollapse(l.id);
                                  }}
                                  className="flex items-center justify-between gap-2 cursor-pointer select-none group/card-header hover:opacity-80 transition-opacity"
                                  title="Collapse"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-serif font-bold text-xs text-[#db6177]">T</span>
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-on-surface truncate">
                                        {l.text || `Bubble #${i + 1}`}
                                      </p>
                                      <p className="text-[10px] text-on-surface-variant">Dialogue</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      disabled={retryingSingleLayerId === l.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRetrySingleLayerInComparison(activePageIndex, l, i);
                                      }}
                                      className="text-on-surface-variant hover:text-[#db6177] p-1 rounded-md hover:bg-surface-variant/50 cursor-pointer transition-colors disabled:opacity-50"
                                      title={t('translate.type.retranslateLayerTitle')}
                                    >
                                      <span className={`material-symbols-outlined text-[16px] ${retryingSingleLayerId === l.id ? 'animate-spin text-[#db6177]' : ''}`}>
                                        {retryingSingleLayerId === l.id ? 'sync' : 'restart_alt'}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleLayerVisibility(l.id);
                                      }}
                                      className="text-on-surface-variant hover:text-on-surface cursor-pointer shrink-0"
                                      title="Toggle visibility"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">
                                        {l.visible !== false ? 'visibility' : 'visibility_off'}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {/* OPACITY Slider & Delete Button */}
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase select-none">
                                    {t('translate.type.opacity')}
                                  </span>
                                  <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={l.opacity ?? 1}
                                    onChange={(e) => updateSelectedLayer({ opacity: parseFloat(e.target.value) })}
                                    className="flex-1 h-1.5 accent-[#db6177] cursor-pointer"
                                  />
                                  <span className="text-[10px] font-mono text-on-surface-variant w-8 text-right select-none">
                                    {Math.round((l.opacity ?? 1) * 100)}%
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteLayer(l.id);
                                    }}
                                    className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-error/10 cursor-pointer transition-colors"
                                    title={t('translate.type.deleteBubble')}
                                  >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                  </button>
                                </div>

                                {/* PLACEMENT Row */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase select-none">
                                      {t('translate.type.placement')}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateSelectedLayer({ fontSize: 'auto' });
                                      }}
                                      className="px-2 py-0.5 rounded-full bg-neutral-200/80 dark:bg-neutral-700/80 text-[10px] font-medium text-on-surface cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                                      title={t('translate.type.autoFit')}
                                    >
                                      {t('translate.type.autoFit')}
                                    </button>
                                  </div>
                                  <label className="flex items-center gap-1 text-[10px] text-on-surface-variant cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={l.fillBackground === true}
                                      onChange={(e) => updateSelectedLayer({ fillBackground: e.target.checked })}
                                      className="accent-[#db6177] w-3.5 h-3.5 rounded"
                                    />
                                    <span>Background</span>
                                  </label>
                                </div>

                                {/* SOURCE TEXT */}
                                <div>
                                  <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase block mb-1 select-none">
                                    {t('translate.type.sourceText')}
                                  </span>
                                  <textarea
                                    rows={2}
                                    value={l.sourceText || l.originalText || l.rawText || ''}
                                    onChange={(e) => updateSelectedLayer({ sourceText: e.target.value })}
                                    placeholder={t('translate.type.sourceText')}
                                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-2 text-xs text-on-surface leading-relaxed resize-y focus:outline-none focus:border-outline-variant/60 min-h-[44px]"
                                  />
                                </div>

                                {/* TRANSLATION */}
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase select-none">
                                      {t('translate.type.translatedText')}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={retryingSingleLayerId === l.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRetrySingleLayerInComparison(activePageIndex, l, i);
                                      }}
                                      className="p-1 rounded-md text-on-surface-variant hover:text-[#db6177] hover:bg-[#db6177]/10 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                      title={t('translate.type.retranslateLayerTitle')}
                                    >
                                      <span className={`material-symbols-outlined text-[14px] ${retryingSingleLayerId === l.id ? 'animate-spin text-[#db6177]' : ''}`}>
                                        {retryingSingleLayerId === l.id ? 'sync' : 'restart_alt'}
                                      </span>
                                      <span className="text-[10px] font-semibold">{t('translate.type.retryResidual')}</span>
                                    </button>
                                  </div>
                                  <textarea
                                    ref={isSelected ? layerTextareaRef : undefined}
                                    rows={2}
                                    value={l.text || ''}
                                    onChange={(e) => updateSelectedLayer({ text: e.target.value })}
                                    placeholder={t('translate.type.translatedPlaceholder')}
                                    className="w-full rounded-xl border-2 border-[#db6177] bg-surface-container-lowest p-2 text-xs text-on-surface leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-[#db6177] min-h-[48px]"
                                  />
                                </div>
                              </div>
                            );
                          }

                          /* Collapsed Inactive Row */
                          return (
                            <div
                              key={l.id}
                              onClick={() => toggleLayerCollapse(l.id)}
                              className={`cursor-pointer flex items-center justify-between p-2 rounded-xl border transition-all ${isSelected
                                ? 'border-[#db6177]/40 bg-[#fff0f3]/70 dark:bg-[#2a171c]/70 ring-1 ring-[#db6177]/30'
                                : hasRes
                                  ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 text-on-surface'
                                  : 'border-transparent hover:bg-surface-container text-on-surface'
                                }`}
                              title={t('translate.studio.expandHeader')}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`font-semibold text-xs ${hasRes ? 'text-amber-500' : 'text-on-surface-variant'}`}>
                                  {hasRes ? '⚠️' : 'T'}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs truncate font-medium text-on-surface">
                                    {l.text || `Dialogue #${i + 1}`}
                                  </p>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <p className="text-[10px] text-on-surface-variant">
                                      Dialogue
                                    </p>
                                    {hasRes && (
                                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30">
                                        {t('translate.studio.residualJapanese')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 text-xs">
                                <span className="text-[10px] text-on-surface-variant font-mono mr-0.5">
                                  {Math.round((l.opacity ?? 1) * 100)}%
                                </span>
                                <button
                                  type="button"
                                  disabled={retryingSingleLayerId === l.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRetrySingleLayerInComparison(activePageIndex, l, i);
                                  }}
                                  className="text-on-surface-variant hover:text-[#db6177] p-1 rounded-md hover:bg-surface-variant/50 cursor-pointer transition-colors disabled:opacity-50"
                                  title={t('translate.type.retranslateLayerTitle')}
                                >
                                  <span className={`material-symbols-outlined text-[16px] ${retryingSingleLayerId === l.id ? 'animate-spin text-[#db6177]' : ''}`}>
                                    {retryingSingleLayerId === l.id ? 'sync' : 'restart_alt'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleLayerVisibility(l.id);
                                  }}
                                  className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                                  title={t('translate.studio.toggleVisibility')}
                                >
                                  <span className="material-symbols-outlined text-[16px]">
                                    {l.visible !== false ? 'visibility' : 'visibility_off'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}


                  {/* Fixed System Layers (Cleanup & Original artwork) */}
                  <div className="pt-2 border-t border-outline-variant/20 space-y-1.5">
                    {/* Cleanup Layer */}
                    <div className="flex items-center justify-between p-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/60 text-on-surface hover:bg-surface-container-high/60 transition-colors">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-4 shrink-0" />
                        <span className="material-symbols-outlined text-[16px] text-primary shrink-0">brush</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-tight">Cleanup</p>
                          <p className="text-[10px] text-on-surface-variant leading-tight">Cleanup</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-on-surface-variant font-mono">100%</span>
                        <button
                          type="button"
                          onClick={() => setShowCleanupLayer(!showCleanupLayer)}
                          className="text-on-surface-variant hover:text-on-surface p-1 rounded-md hover:bg-surface-variant/50 cursor-pointer transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {showCleanupLayer ? 'visibility' : 'visibility_off'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Original artwork */}
                    <div className="flex items-center justify-between p-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/60 text-on-surface hover:bg-surface-container-high/60 transition-colors">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-4 shrink-0" />
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">image</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-tight">Original artwork</p>
                          <p className="text-[10px] text-on-surface-variant leading-tight">Image</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-on-surface-variant font-mono">100%</span>
                        <span className="material-symbols-outlined text-[15px] text-on-surface-variant p-1">lock</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Section B: Settings Tab (Cài đặt Translation Pipeline) ── */
              <div className="p-4 space-y-4">
                <TranslateSettingsPanel
                  settings={settings}
                  onUpdateSetting={handleUpdateSetting}
                  localEngines={detectedEngines || localEngines}
                />
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Translate Guide Modal (Hướng dẫn & Quy trình 4 Bước) */}
      <TranslateGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        initialTab={guideInitialTab}
      />

      {/* Custom React Modal for Errors & Offline Warnings */}
      {errorModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setErrorModal(null);
          }}
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 text-on-surface">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-error/15 border border-error/30 flex items-center justify-center text-error shrink-0">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-on-surface">{errorModal.title}</h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{errorModal.message}</p>
                {errorModal.suggestion && (
                  <p className="text-xs text-on-surface mt-2.5 bg-surface-container p-2.5 rounded-xl border border-outline-variant/25 leading-relaxed">
                    💡 {errorModal.suggestion}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setErrorModal(null)}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
              >
                {t('translate.studio.closeModal')}
              </button>
              {errorModal.openSettings && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveRightTab('settings');
                    setErrorModal(null);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-xs font-semibold text-primary transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">tune</span>
                  <span>{t('translate.studio.openSettings')}</span>
                </button>
              )}
              {errorModal.canSwitchToCloud && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateSetting?.({ translationProvider: 'gemini' });
                    setErrorModal(null);
                    setTimeout(() => handleRunTranslateCurrent(), 100);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-primary hover:brightness-110 text-xs font-semibold text-on-primary shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">cloud_sync</span>
                  <span>{t('translate.studio.switchToGeminiCloud')}</span>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom React Modal: Smart Resume - Dịch tiếp hay Dịch lại toàn bộ */}
      {resumePromptModal && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setResumePromptModal(null);
          }}
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 text-on-surface">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-2xl">history</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-on-surface">{t('translate.studio.resumePromptTitle')}</h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  {t('translate.studio.resumePromptDesc', { translated: resumePromptModal.translatedCount, untranslated: resumePromptModal.untranslatedCount, total: resumePromptModal.totalCount })}
                </p>
                <p className="text-xs text-on-surface-variant/80 mt-2 bg-surface-container p-2.5 rounded-xl border border-outline-variant/20 leading-relaxed">
                  {t('translate.studio.resumePromptTip')}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setResumePromptModal(null)}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const cb = resumePromptModal.onReTranslateAll;
                  setResumePromptModal(null);
                  cb?.();
                }}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-high hover:bg-surface-container-highest text-xs font-semibold text-on-surface transition-colors cursor-pointer"
              >
                {t('translate.studio.resumePromptReAll')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const cb = resumePromptModal.onResume;
                  setResumePromptModal(null);
                  cb?.();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-primary hover:brightness-110 text-xs font-semibold text-on-primary shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">fast_forward</span>
                <span>{t('translate.studio.resumePromptContinue', { count: resumePromptModal.untranslatedCount })}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom React Modal: Xác nhận xóa trang khỏi Studio */}
      {pageToDelete && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPageToDelete(null);
          }}
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 text-on-surface">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-error/15 border border-error/30 flex items-center justify-center text-error shrink-0">
                <span className="material-symbols-outlined text-2xl">
                  {pageToDelete === 'all' ? 'delete_sweep' : 'delete_forever'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-on-surface">
                  {pageToDelete === 'all' ? t('translate.studio.deleteConfirmAllTitle') : t('translate.studio.deleteConfirmSingleTitle')}
                </h3>
                {pageToDelete === 'all' ? (
                  <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                    {t('translate.studio.deleteConfirmAllDesc', { count: pages.length })}
                  </p>
                ) : (
                  <div className="space-y-2 mt-1.5">
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      {t('translate.studio.deleteConfirmSingleDesc', { filename: pageToDelete.filename })}
                    </p>
                    {pageToDelete.layers?.length > 0 && (
                      <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/25 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] shrink-0 text-amber-500">warning</span>
                        <span>{t('translate.studio.deleteConfirmLayersWarning', { count: pageToDelete.layers.length })}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setPageToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pageToDelete === 'all') {
                    handleRemoveAllPages();
                  } else {
                    handleRemovePage(pageToDelete);
                  }
                  setPageToDelete(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-error hover:brightness-110 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>{pageToDelete === 'all' ? t('translate.studio.deleteAllBtn') : t('translate.studio.deletePageBtn')}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Custom React Modal: Quản Lý & Chuyển Đổi Dự Án Đang Làm ── */}
      {showProjectModal && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 sm:p-6 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowProjectModal(false);
              setIsCreatingProject(false);
              setEditingProjectId(null);
            }
          }}
        >
          <div className="max-w-2xl w-full max-h-[85vh] rounded-3xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-6 flex flex-col text-on-surface overflow-hidden">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-4 border-b border-outline-variant/20 shrink-0 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-2xl">folder_open</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-on-surface">{t('translate.studio.projectsTitle')}</h3>
                  <p className="text-xs text-on-surface-variant truncate">
                    {t('translate.studio.projectsDesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!isCreatingProject && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingProject(true);
                      setNewProjectNameInput(`Project ${(projectsList?.length || 0) + 1}`);
                    }}
                    className="h-8 px-3 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span>{t('translate.studio.projectNew')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowProjectModal(false);
                    setIsCreatingProject(false);
                    setEditingProjectId(null);
                  }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>

            {/* Inline Form: Tạo Dự Án Mới */}
            {isCreatingProject && (
              <div className="mt-4 p-4 rounded-2xl border border-primary/30 bg-primary/5 flex flex-col gap-3 shrink-0 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
                    {t('translate.studio.projectNewTitle')}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    {t('translate.studio.projectAutoSaveNotice', { count: pages.length })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newProjectNameInput}
                    onChange={(e) => setNewProjectNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateProject();
                      if (e.key === 'Escape') setIsCreatingProject(false);
                    }}
                    autoFocus
                    placeholder={t('translate.studio.projectPlaceholder')}
                    className="flex-1 px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => handleCreateProject()}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold cursor-pointer transition-all shadow-xs"
                  >
                    {t('translate.studio.projectCreateOpen')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreatingProject(false)}
                    className="px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface-container text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}

            {/* Project List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-2.5 min-h-[220px]">
              {projectsList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-on-surface-variant/60">
                  <span className="material-symbols-outlined text-4xl mb-2">folder_off</span>
                  <p className="text-xs">{t('translate.studio.projectEmptyList')}</p>
                </div>
              ) : (
                projectsList.map((proj) => {
                  const isActive = proj.id === currentProject?.id;
                  const isEditing = editingProjectId === proj.id;
                  return (
                    <div
                      key={proj.id}
                      onClick={() => !isActive && !isEditing && handleSwitchProject(proj.id)}
                      className={`group p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${isActive
                        ? 'border-primary/50 bg-primary/5 shadow-xs'
                        : 'border-outline-variant/25 bg-surface-container hover:bg-surface-container-high hover:border-outline-variant/50 cursor-pointer'
                        }`}
                    >
                      {/* Left: Thumbnail & Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Cover Thumbnail */}
                        <div className="w-12 h-14 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                          {proj.coverThumb ? (
                            <img src={proj.coverThumb} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/50">
                              auto_stories
                            </span>
                          )}
                        </div>

                        {/* Title & Metadata */}
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editingProjectName}
                                onChange={(e) => setEditingProjectName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameProject(proj.id, editingProjectName);
                                  if (e.key === 'Escape') setEditingProjectId(null);
                                }}
                                autoFocus
                                className="px-2 py-1 rounded-lg border border-primary bg-surface-container-lowest text-xs text-on-surface focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleRenameProject(proj.id, editingProjectName)}
                                className="w-6 h-6 rounded-lg bg-primary text-on-primary flex items-center justify-center text-xs cursor-pointer"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingProjectId(null)}
                                className="w-6 h-6 rounded-lg bg-surface-container-high text-on-surface-variant flex items-center justify-center text-xs cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <h4 className="font-bold text-xs text-on-surface truncate">{proj.name}</h4>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingProjectId(proj.id);
                                  setEditingProjectName(proj.name);
                                }}
                                className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-primary transition-opacity p-0.5 cursor-pointer"
                                title={t('translate.studio.projectRename')}
                              >
                                <span className="material-symbols-outlined text-[13px]">edit</span>
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-2 mt-1 text-[11px] text-on-surface-variant flex-wrap">
                            <span className="font-medium bg-surface-container-lowest px-2 py-0.5 rounded-md border border-outline-variant/15">
                              {t('translate.studio.pagesCount', { count: proj.pageCount || 0 })}
                            </span>
                            <span>•</span>
                            <span className="truncate">
                              {t('translate.studio.projectUpdated')} {proj.updatedAt ? new Date(proj.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : t('translate.studio.projectJustCreated')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {isActive ? (
                          <span className="px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-[11px] font-bold flex items-center gap-1 select-none">
                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                            {t('translate.studio.projectOpening')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSwitchProject(proj.id)}
                            className="px-3 py-1.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary hover:text-on-primary text-primary text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          >
                            <span className="material-symbols-outlined text-[14px]">folder_open</span>
                            {t('translate.studio.projectOpen')}
                          </button>
                        )}

                        {/* Nút xóa dự án (nếu còn > 1 dự án) */}
                        {projectsList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setProjectToDelete(proj)}
                            className="w-8 h-8 rounded-xl border border-transparent hover:border-error/30 hover:bg-error/10 text-on-surface-variant/50 hover:text-error flex items-center justify-center transition-all cursor-pointer"
                            title={t('translate.studio.projectDelete')}
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Xác nhận xóa dự án */}
            {projectToDelete && (
              <div className="p-3.5 mt-2 rounded-2xl border border-error/30 bg-error/5 flex items-center justify-between gap-3 animate-fadeIn shrink-0">
                <div className="flex items-center gap-2 text-xs text-error">
                  <span className="material-symbols-outlined text-[18px]">warning</span>
                  <span>{t('translate.studio.projectDeleteConfirm', { name: projectToDelete.name })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProjectToDelete(null)}
                    className="px-3 py-1 rounded-xl border border-outline-variant/30 bg-surface-container text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(projectToDelete.id)}
                    className="px-3 py-1 rounded-xl bg-error hover:brightness-110 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    {t('translate.studio.projectDeleteBtn')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── Custom React Modal: Chế Độ Dịch Tự Động (Auto-Processing Mode) ── */}
      {showAutoModal && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 sm:p-6 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isAutoProcessing) setShowAutoModal(false);
          }}
        >
          <div className="max-w-2xl w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-6 flex flex-col text-on-surface space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">auto_mode</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-on-surface flex items-center gap-2">
                    <span>{t('translate.auto.title')}</span>
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAutoModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                title={t('translate.auto.closeTitle')}
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Folder Selection Section */}
            <div className="space-y-3">
              {/* Input Folder */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-on-surface">
                    {t('translate.auto.inputFolder')}
                  </label>
                  {autoInputDir && autoInputDir !== detectedProjectDir && detectedProjectDir && (
                    <button
                      type="button"
                      onClick={() => setAutoInputDir('')}
                      className="text-[11px] text-primary hover:opacity-80 cursor-pointer transition-opacity"
                    >
                      {t('translate.auto.restoreProjectFolder')}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={activeInputDir}
                    placeholder={t('translate.auto.placeholderInput')}
                    className="flex-1 px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/25 text-xs text-on-surface font-mono truncate focus:outline-hidden"
                  />
                  <button
                    type="button"
                    disabled={isAutoProcessing}
                    onClick={handleSelectAutoInputDir}
                    className="px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shrink-0 min-w-[115px]"
                  >
                    <span className="material-symbols-outlined text-[16px]">folder_open</span>
                    <span>{t('translate.auto.changeFolder')}</span>
                  </button>
                  {activeInputDir && (
                    <button
                      type="button"
                      onClick={() => window.electronAPI?.openPath(activeInputDir)}
                      className="px-2.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface text-xs font-semibold flex items-center justify-center cursor-pointer transition-colors shrink-0"
                      title={t('translate.auto.openFolder')}
                    >
                      <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                    </button>
                  )}
                </div>
                {isScanningAuto ? (
                  <p className="text-[11px] text-primary mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
                    <span>{t('translate.auto.scanningImages')}</span>
                  </p>
                ) : isFolderSyncedToStudio ? (
                  <div className="flex items-center justify-between mt-1 px-0.5">
                    <p className="text-[11px] text-primary flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-[13px]">check_circle</span>
                      <span>{t('translate.auto.syncedToStudio', { count: pages.length })}</span>
                    </p>
                  </div>
                ) : autoScannedCount !== null && autoScannedCount > 0 ? (
                  <div className="flex items-center justify-between mt-1 px-0.5">
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">folder</span>
                      <span>{t('translate.auto.foundImages', { count: autoScannedCount })}</span>
                    </p>
                    <button
                      type="button"
                      disabled={isAutoProcessing}
                      onClick={handleTriggerSyncFromAuto}
                      className="text-[11px] text-primary hover:opacity-80 font-semibold flex items-center gap-1 cursor-pointer transition-opacity"
                    >
                      <span className="material-symbols-outlined text-[13px]">sync</span>
                      <span>{t('translate.auto.syncToStudio')}</span>
                    </button>
                  </div>
                ) : activeInputDir === detectedProjectDir && pages.length > 0 ? (
                  <p className="text-[11px] text-primary mt-1 flex items-center gap-1 font-medium">
                    <span className="material-symbols-outlined text-[13px]">check_circle</span>
                    <span>{t('translate.auto.detectedProjectDir', { count: pages.length })}</span>
                  </p>
                ) : null}
              </div>

              {/* Output Folder */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-on-surface">
                    {t('translate.auto.outputFolder')}
                  </label>
                  {autoOutputDir && autoOutputDir !== defaultOutputDir && defaultOutputDir && (
                    <button
                      type="button"
                      onClick={() => setAutoOutputDir('')}
                      className="text-[11px] text-emerald-600 hover:opacity-80 cursor-pointer transition-opacity"
                    >
                      {t('translate.auto.useDefault')}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={activeOutputDir}
                    placeholder={t('translate.auto.placeholderOutput')}
                    className="flex-1 px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/25 text-xs text-on-surface font-mono truncate focus:outline-hidden"
                  />
                  <button
                    type="button"
                    disabled={isAutoProcessing}
                    onClick={handleSelectAutoOutputDir}
                    className="px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shrink-0 min-w-[115px]"
                  >
                    <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
                    <span>{t('translate.auto.changeFolder')}</span>
                  </button>
                  {activeOutputDir && (
                    <button
                      type="button"
                      onClick={() => window.electronAPI?.openPath(activeOutputDir)}
                      className="px-2.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface text-xs font-semibold flex items-center justify-center cursor-pointer transition-colors shrink-0"
                      title={t('translate.auto.openFolder')}
                    >
                      <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                    </button>
                  )}
                </div>
                {!autoOutputDir && defaultOutputDir && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">auto_fix_high</span>
                    <span>{t('translate.auto.defaultOutputNote')}</span>
                  </p>
                )}
              </div>

              {/* Options Section */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2.5 text-xs font-semibold text-on-surface cursor-pointer select-none p-2.5 rounded-xl bg-surface-container border border-outline-variant/25 hover:bg-surface-container-high transition-colors">
                  <input
                    type="checkbox"
                    checked={isAutoModeEnabled}
                    onChange={(e) => toggleAutoMode(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-bold">
                      <span className="material-symbols-outlined text-[16px]">auto_mode</span>
                      <span>{t('translate.auto.autoModeCheckbox')}</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant font-normal mt-0.5">
                      {t('translate.auto.autoModeDesc')}
                    </p>
                  </div>
                </label>

                {/* Option: Skip existing */}
                <label className="flex items-start gap-2.5 text-xs font-medium text-on-surface cursor-pointer select-none px-1 pt-2.5">
                  <input
                    type="checkbox"
                    disabled={isAutoProcessing}
                    checked={autoSkipExisting}
                    onChange={(e) => setAutoSkipExisting(e.target.checked)}
                    className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer mt-0.5 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-on-surface block">
                      {t('translate.auto.skipExistingTitle')}
                    </span>
                    <p className="text-[11px] text-on-surface-variant font-normal mt-0.5 leading-relaxed">
                      {t('translate.auto.skipExistingDesc')}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Live Progress HUD (if running or completed) */}
            {(isAutoProcessing || autoProgress) && (
              <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/25 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-on-surface truncate max-w-[360px]">
                    <span className={`material-symbols-outlined text-[16px] ${isAutoProcessing ? 'text-primary animate-spin' : 'text-emerald-500'}`}>
                      {isAutoProcessing ? 'progress_activity' : 'check_circle'}
                    </span>
                    <span className="truncate">
                      {autoProgress?.detail || (isAutoProcessing ? t('translate.auto.processingStatus') : t('translate.auto.readyStatus'))}
                    </span>
                  </span>
                  <span className="font-mono text-primary text-sm font-bold shrink-0">
                    {autoProgress?.percent ?? 0}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${autoProgress?.percent ?? 0}%` }}
                  />
                </div>

                {/* Stat pills */}
                <div className="flex items-center justify-between text-[11px] text-on-surface-variant flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                      {t('translate.auto.statDone', { count: autoProgress?.successCount ?? 0 })}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-semibold">
                      {t('translate.auto.statSkipped', { count: autoProgress?.skippedCount ?? 0 })}
                    </span>
                    {(autoProgress?.errorCount ?? 0) > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-error/10 text-error font-semibold border border-error/20">
                        {t('translate.auto.statError', { count: autoProgress?.errorCount })}
                      </span>
                    )}
                  </div>
                  {autoProgress?.etaSeconds > 0 && (
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      {t('translate.auto.statEta', { minutes: Math.ceil(autoProgress.etaSeconds / 60) })}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Modal Footer / Actions */}
            <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-outline-variant/20">
              <div>
                {activeOutputDir && (
                  <button
                    type="button"
                    onClick={() => window.electronAPI?.openPath(activeOutputDir)}
                    className="text-xs text-primary hover:opacity-80 flex items-center gap-1 font-medium cursor-pointer transition-opacity"
                  >
                    <span className="material-symbols-outlined text-[15px]">folder</span>
                    <span>{t('translate.auto.openOutputDir')}</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isAutoProcessing ? (
                  <button
                    type="button"
                    onClick={handleCancelAuto}
                    className="px-4 py-2 rounded-xl bg-error hover:brightness-110 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">stop_circle</span>
                    <span>{t('translate.auto.stopProgress')}</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowAutoModal(false)}
                      className="px-4 py-2 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
                    >
                      {t('translate.auto.close')}
                    </button>
                    {!isFolderSyncedToStudio && autoScannedCount > 0 && (
                      <button
                        type="button"
                        onClick={handleTriggerSyncFromAuto}
                        className="px-3.5 py-2 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">sync</span>
                        <span>{t('translate.auto.syncCountBtn', { count: autoScannedCount })}</span>
                      </button>
                    )}
                    {pages.length > 0 && (
                      <button
                        type="button"
                        disabled={!activeInputDir || !activeOutputDir || isTranslating}
                        onClick={() => {
                          setShowAutoModal(false);
                          handleRunTranslateAll(false);
                        }}
                        className="px-4 py-2 rounded-xl bg-primary hover:brightness-110 text-on-primary text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t('translate.auto.translateExportNowTitle')}
                      >
                        <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                        <span>{t('translate.auto.translateExportNowBtn', { count: pages.length })}</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom React Modal: Xác nhận đồng bộ thư mục vào Manga Studio */}
      {syncFolderModal && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSyncFolderModal(null);
          }}
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 text-on-surface">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <span className="material-symbols-outlined text-2xl">sync</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-on-surface">{t('translate.sync.title')}</h3>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  {t('translate.sync.desc', { name: syncFolderModal.folderBaseName, count: syncFolderModal.count })}
                </p>
                <div className="text-xs text-on-surface-variant/90 mt-2.5 bg-surface-container p-3 rounded-xl border border-outline-variant/20 space-y-1.5 leading-relaxed">
                  <p className="font-semibold text-on-surface">{t('translate.sync.currentStudio')}</p>
                  <p className="text-[11px] text-on-surface-variant">
                    {t('translate.sync.currentProject', { name: syncFolderModal.currentProjectName, count: syncFolderModal.currentPageCount })}
                  </p>
                  <p className="text-[11px] text-on-surface-variant">
                    {t('translate.sync.askAction')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20 flex-wrap">
              <button
                type="button"
                onClick={() => setSyncFolderModal(null)}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
              >
                {t('translate.sync.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { files, folderPath, fileDetails } = syncFolderModal;
                  setSyncFolderModal(null);
                  await processImportedFiles(files, true, folderPath, fileDetails, false);
                }}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-high hover:bg-surface-container-highest text-xs font-semibold text-on-surface transition-colors cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[15px]">add_photo_alternate</span>
                <span>{t('translate.sync.appendToCurrent')}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { files, folderPath, fileDetails } = syncFolderModal;
                  setSyncFolderModal(null);
                  await processImportedFiles(files, true, folderPath, fileDetails, true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-primary hover:brightness-110 text-xs font-semibold text-on-primary shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">folder_open</span>
                <span>{t('translate.sync.openAsNew')}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Custom React Modal: Bảng Đối Chiếu Dịch Thuật & Soát Lỗi Toàn Diện ── */}
      {showComparisonModal && typeof document !== 'undefined' && createPortal(
        (() => {
          const isAllScope = comparisonScope === 'all';
          const totalScopeCount = isAllScope ? allChapterLayersWithMeta.length : layers.length;
          const residualScopeCount = isAllScope ? allChapterResidualLayers.length : residualLayers.length;
          const cleanScopeCount = Math.max(0, totalScopeCount - residualScopeCount);

          const sourceItems = isAllScope
            ? allChapterLayersWithMeta.map((item, idx) => ({
              layer: item.layer,
              globalIdx: idx,
              originalIdx: item.layerIndexOnPage,
              pageIndex: item.pageIndex,
              pageFilename: item.pageFilename,
              pageDataUrl: item.pageDataUrl,
            }))
            : layers.map((layer, idx) => ({
              layer,
              globalIdx: idx,
              originalIdx: idx,
              pageIndex: activePageIndex,
              pageFilename: activePage?.filename || t('translate.compare.pageBtn', { page: activePageIndex + 1 }),
              pageDataUrl: activePage?.dataUrl || activePage?.originalDataUrl,
            }));

          const filteredComparisonItems = sourceItems.filter(({ layer, pageFilename }) => {
            if (comparisonFilter === 'clean' && isLayerResidual(layer)) return false;
            if (comparisonFilter === 'residual' && !isLayerResidual(layer)) return false;
            if (comparisonSearchQuery.trim()) {
              const q = comparisonSearchQuery.toLowerCase();
              const orig = (layer.sourceText || '').toLowerCase();
              const trans = (layer.text || '').toLowerCase();
              const pageInfo = (pageFilename || '').toLowerCase();
              return orig.includes(q) || trans.includes(q) || pageInfo.includes(q);
            }
            return true;
          });

          // Ảnh hiển thị trong Preview panel
          const previewPage = pages[activePageIndex] || pages[0] || null;
          const previewImageUrl = previewPage?.dataUrl || previewPage?.originalDataUrl || '';
          const previewWidth = previewPage?.width || 800;
          const previewHeight = previewPage?.height || 1200;
          const previewLayers = previewPage?.layers || [];

          return (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-5 animate-fadeIn"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowComparisonModal(false);
              }}
            >
              <div className="max-w-6xl w-full max-h-[92vh] rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-4 sm:p-5 flex flex-col text-on-surface overflow-hidden my-auto">
                {/* Modal Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-outline-variant/20 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-2xl">table_chart</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-on-surface truncate">
                          {t('translate.compare.title')}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/25">
                          {isAllScope
                            ? t('translate.compare.allPagesBadge', { count: pages.length })
                            : t('translate.compare.pageBadge', { current: activePageIndex + 1, total: pages.length })}
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant truncate">
                        {isAllScope ? (
                          t('translate.compare.allSummary', { total: totalScopeCount, residual: residualScopeCount })
                        ) : (
                          t('translate.compare.pageSummary', {
                            name: activePage?.filename || t('translate.compare.pageBtn', { page: activePageIndex + 1 }),
                            total: totalScopeCount,
                            residual: residualScopeCount,
                          })
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Top Right: Scope Switcher + Preview Toggle + Close */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Scope Switcher: [ 📄 Trang hiện tại ] [ 📚 Toàn bộ Chapter ] */}
                    <div className="flex items-center p-0.5 rounded-xl bg-surface-container border border-outline-variant/20 shrink-0">
                      <button
                        type="button"
                        onClick={() => setComparisonScope('current')}
                        className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${!isAllScope
                          ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                          : 'text-on-surface-variant hover:text-on-surface'
                          }`}
                        title={t('translate.compare.scopeCurrentTitle')}
                      >
                        <span className="material-symbols-outlined text-[14px]">description</span>
                        <span>{t('translate.compare.scopeCurrent')}</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-container-high text-on-surface-variant font-mono">
                          {layers.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setComparisonScope('all')}
                        className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${isAllScope
                          ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                          : 'text-on-surface-variant hover:text-on-surface'
                          }`}
                        title={t('translate.compare.scopeAllTitle')}
                      >
                        <span className="material-symbols-outlined text-[14px]">library_books</span>
                        <span>{t('translate.compare.scopeAll')}</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-container-high text-on-surface-variant font-mono">
                          {allChapterLayersWithMeta.length}
                        </span>
                      </button>
                    </div>

                    {/* Preview Page Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setShowComparisonPreview((prev) => !prev)}
                      className={`h-7 px-2.5 rounded-lg border flex items-center gap-1 text-xs font-semibold transition-all cursor-pointer ${showComparisonPreview
                        ? 'border-primary/30 bg-primary/10 text-primary shadow-2xs'
                        : 'border-outline-variant/25 bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                        }`}
                      title={showComparisonPreview ? t('translate.compare.previewHideTitle') : t('translate.compare.previewShowTitle')}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {showComparisonPreview ? 'visibility' : 'preview'}
                      </span>
                      <span className="hidden sm:inline">{t('translate.compare.previewToggle')}</span>
                    </button>

                    {/* Close Button */}
                    <button
                      type="button"
                      onClick={() => setShowComparisonModal(false)}
                      className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      title={t('translate.compare.closeTitle')}
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                </div>

                {/* Subheader: Filter tabs + Page Navigation (Next/Prev) + Search */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 py-2.5 shrink-0 border-b border-outline-variant/15">
                  {/* Filter tabs */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {[
                      { id: 'all', label: t('translate.compare.filterAll', { count: totalScopeCount }) },
                      { id: 'clean', label: t('translate.compare.filterClean', { count: cleanScopeCount }) },
                      { id: 'residual', label: t('translate.compare.filterResidual', { count: residualScopeCount }) },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setComparisonFilter(tab.id)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${comparisonFilter === tab.id
                          ? 'bg-primary text-on-primary shadow-xs'
                          : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                          }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Page Navigation Controls: [ ◀ Trước ] [ Trang X/Y — name (N câu) ] [ Sau ▶ ] */}
                  {pages.length > 1 && (
                    <div className="flex items-center gap-1 bg-surface-container/70 p-0.5 rounded-xl border border-outline-variant/20 shrink-0">
                      <button
                        type="button"
                        disabled={activePageIndex === 0}
                        onClick={() => setActivePageIndex((prev) => Math.max(0, prev - 1))}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                        data-tooltip={t('translate.compare.prevPageTitle')}
                        aria-label={t('translate.compare.prevPageTitle')}
                      >
                        <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                      </button>

                      <SearchableSelect
                        value={activePageIndex}
                        onChange={(val) => setActivePageIndex(Number(val))}
                        options={pages.map((p, pIdx) => ({
                          value: pIdx,
                          label: t('translate.compare.pageOption', {
                            page: pIdx + 1,
                            total: pages.length,
                            name: p.filename || t('translate.compare.pageBtn', { page: pIdx + 1 }),
                            count: (p.layers || []).length,
                          }),
                          icon: 'description',
                        }))}
                        placeholder={t('translate.compare.selectPageTitle')}
                        className="min-w-[14rem]"
                        size="sm"
                      />

                      <button
                        type="button"
                        disabled={activePageIndex === pages.length - 1}
                        onClick={() => setActivePageIndex((prev) => Math.min(pages.length - 1, prev + 1))}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                        data-tooltip={t('translate.compare.nextPageTitle')}
                        aria-label={t('translate.compare.nextPageTitle')}
                      >
                        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                      </button>
                    </div>
                  )}

                  {/* Search Query Input */}
                  <div className="relative w-56 sm:w-64 max-w-full">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-on-surface-variant/60">
                      search
                    </span>
                    <input
                      type="text"
                      value={comparisonSearchQuery}
                      onChange={(e) => setComparisonSearchQuery(e.target.value)}
                      placeholder={t('translate.compare.searchPlaceholder')}
                      className="w-full pl-8 pr-3 py-1 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {/* Main Content Area: Table + Optional Image Preview side-by-side */}
                <div className="flex-1 min-h-0 flex gap-3 overflow-hidden py-1">
                  {/* Table View */}
                  <div className="flex-1 min-w-0 overflow-y-auto rounded-xl border border-outline-variant/20 bg-surface-container/20 select-text">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 z-10 bg-surface-container-high text-on-surface-variant text-[11px] uppercase tracking-wider font-semibold border-b border-outline-variant/20">
                        <tr>
                          {isAllScope && <th className="py-2.5 px-3 w-28 text-center">{t('translate.compare.colPage')}</th>}
                          <th className="py-2.5 px-3 w-16 text-center">{t('translate.compare.colBubble')}</th>
                          <th className="py-2.5 px-3 w-32">{t('translate.compare.colCoords')}</th>
                          <th className="py-2.5 px-3 w-1/3">{t('translate.compare.colOcr')}</th>
                          <th className="py-2.5 px-3 w-1/3">{t('translate.compare.colTranslation')}</th>
                          <th className="py-2.5 px-3 w-28 text-center">{t('translate.compare.colStatus')}</th>
                          <th className="py-2.5 px-3 w-24 text-center">{t('translate.compare.colActions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/15 text-on-surface">
                        {filteredComparisonItems.length === 0 ? (
                          <tr>
                            <td colSpan={isAllScope ? 7 : 6} className="py-12 text-center text-on-surface-variant text-xs italic">
                              {comparisonSearchQuery || comparisonFilter !== 'all'
                                ? t('translate.compare.noResultsFilter')
                                : t('translate.compare.noResultsEmpty')}
                            </td>
                          </tr>
                        ) : (
                          filteredComparisonItems.map(({ layer, originalIdx, globalIdx, pageIndex, pageFilename }) => {
                            const hasRes = isLayerResidual(layer);
                            const [x, y, w, h] = (layer.bbox || [0, 0, 0, 0]).map(Math.round);
                            const isHovered = comparisonHoveredLayerId === layer.id;

                            return (
                              <tr
                                key={`${pageIndex}-${layer.id || originalIdx}`}
                                onMouseEnter={() => setComparisonHoveredLayerId(layer.id)}
                                onMouseLeave={() => setComparisonHoveredLayerId(null)}
                                className={`transition-colors ${isHovered
                                  ? 'bg-primary/10 dark:bg-primary/15'
                                  : hasRes
                                    ? 'bg-amber-500/5 dark:bg-amber-500/10 hover:bg-amber-500/15'
                                    : 'hover:bg-surface-container-high/60'
                                  }`}
                              >
                                {/* Cột Tên Trang (Chỉ hiện khi xem Toàn bộ Chapter) */}
                                {isAllScope && (
                                  <td className="py-2 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setActivePageIndex(pageIndex)}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${activePageIndex === pageIndex
                                        ? 'bg-primary/20 text-primary border border-primary/30'
                                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                                        }`}
                                      title={t('translate.compare.pageBtnTitle', { page: pageIndex + 1 })}
                                    >
                                      <span>{t('translate.compare.pageBtn', { page: pageIndex + 1 })}</span>
                                    </button>
                                  </td>
                                )}

                                {/* STT Khung */}
                                <td className="py-2 px-3 font-mono font-bold text-center text-on-surface-variant">
                                  #{originalIdx + 1}
                                </td>

                                {/* BBox */}
                                <td className="py-2 px-3 text-[11px] font-mono text-on-surface-variant">
                                  <div>X:{x}, Y:{y}</div>
                                  <div className="text-[10px] text-on-surface-variant/70">{w}×{h}px</div>
                                </td>

                                {/* Chữ Gốc (Japanese) */}
                                <td className="py-2 px-3 font-sans text-xs text-on-surface leading-relaxed whitespace-pre-wrap">
                                  {layer.sourceText ? (
                                    <span className="bg-surface-container/60 px-1.5 py-0.5 rounded border border-outline-variant/20 inline-block max-w-full">
                                      {layer.sourceText}
                                    </span>
                                  ) : (
                                    <span className="italic text-on-surface-variant/50">{t('translate.compare.ocrEmpty')}</span>
                                  )}
                                </td>

                                {/* Bản Dịch Tiếng Việt - Inline Editable */}
                                <td className="py-2 px-3">
                                  <textarea
                                    rows={2}
                                    value={layer.text || ''}
                                    onChange={(e) => handleUpdateComparisonText(pageIndex, layer.id, e.target.value)}
                                    placeholder={t('translate.compare.transPlaceholder')}
                                    className="w-full p-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-xs text-on-surface focus:outline-none focus:border-primary font-sans leading-relaxed resize-y"
                                  />
                                </td>

                                {/* Trạng thái soát */}
                                <td className="py-2 px-3 text-center">
                                  {hasRes ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold shrink-0">
                                      <span className="material-symbols-outlined text-[13px]">warning</span>
                                      <span>{t('translate.compare.statusResidual')}</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-bold shrink-0">
                                      <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                      <span>{t('translate.compare.statusClean')}</span>
                                    </span>
                                  )}
                                </td>

                                {/* Thao tác */}
                                <td className="py-2 px-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {/* Nút Xem trên canvas: tự chuyển sang đúng trang và chọn layer */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActivePageIndex(pageIndex);
                                        setSelectedLayerId(layer.id);
                                        setShowComparisonModal(false);
                                        setActiveRightTab('properties');
                                        setShowRightSidebar(true);
                                      }}
                                      className="p-1 rounded-lg hover:bg-primary/15 text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                                      title={t('translate.compare.actionCanvasTitle', { page: pageIndex + 1 })}
                                    >
                                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                                    </button>

                                    {/* Nút Dịch lại AI câu này - Luôn hiển thị cho mọi khung thoại */}
                                    <button
                                      type="button"
                                      disabled={retryingSingleLayerId === layer.id}
                                      onClick={() => handleRetrySingleLayerInComparison(pageIndex, layer, originalIdx)}
                                      className={`p-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${hasRes
                                        ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400'
                                        : 'hover:bg-primary/15 text-on-surface-variant hover:text-primary'
                                      }`}
                                      title={t('translate.compare.actionRetryTitle')}
                                    >
                                      <span className={`material-symbols-outlined text-[16px] ${retryingSingleLayerId === layer.id ? 'animate-spin text-primary' : ''}`}>
                                        {retryingSingleLayerId === layer.id ? 'sync' : 'restart_alt'}
                                      </span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Panel Xem Trước Ảnh (Preview Drawer / Split View) */}
                  {showComparisonPreview && (
                    <div className="w-72 sm:w-80 shrink-0 rounded-xl border border-outline-variant/20 bg-surface-container/60 p-2.5 flex flex-col gap-2 select-none overflow-hidden">
                      <div className="flex items-center justify-between gap-1 pb-1 border-b border-outline-variant/20">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-on-surface truncate">
                            {t('translate.compare.previewTitle', { page: activePageIndex + 1, name: previewPage?.filename || 'Preview' })}
                          </p>
                          <p className="text-[10px] text-on-surface-variant font-mono">
                            {t('translate.compare.previewDims', { width: previewWidth, height: previewHeight, count: previewLayers.length })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowComparisonPreview(false)}
                          className="w-6 h-6 rounded-md hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center cursor-pointer"
                          title={t('translate.compare.previewHideTitle')}
                        >
                          <span className="material-symbols-outlined text-[15px]">close</span>
                        </button>
                      </div>

                      {/* Image with Interactive SVG Bounding Box Overlays */}
                      <div className="flex-1 min-h-0 relative bg-surface-container-lowest rounded-lg border border-outline-variant/20 flex items-center justify-center overflow-hidden">
                        {previewImageUrl ? (
                          <div className="relative max-w-full max-h-full flex items-center justify-center">
                            <img
                              src={previewImageUrl}
                              alt={previewPage?.filename || 'Preview'}
                              className="max-w-full max-h-[60vh] object-contain rounded select-none pointer-events-none"
                            />
                            {/* SVG Overlay cho các khung thoại trên trang này */}
                            <svg
                              className="absolute inset-0 w-full h-full pointer-events-none"
                              viewBox={`0 0 ${previewWidth} ${previewHeight}`}
                              preserveAspectRatio="xMidYMid meet"
                            >
                              {previewLayers.map((l, lIdx) => {
                                if (!Array.isArray(l.bbox) || l.bbox.length < 4) return null;
                                const [bx, by, bw, bh] = l.bbox;
                                const isLHovered = comparisonHoveredLayerId === l.id;
                                const lHasRes = isLayerResidual(l);

                                return (
                                  <g key={l.id || lIdx}>
                                    <rect
                                      x={bx}
                                      y={by}
                                      width={bw}
                                      height={bh}
                                      fill={
                                        isLHovered
                                          ? 'rgba(236, 72, 153, 0.35)'
                                          : lHasRes
                                            ? 'rgba(245, 158, 11, 0.15)'
                                            : 'rgba(59, 130, 246, 0.1)'
                                      }
                                      stroke={
                                        isLHovered
                                          ? '#ec4899'
                                          : lHasRes
                                            ? '#f59e0b'
                                            : '#3b82f6'
                                      }
                                      strokeWidth={isLHovered ? 4 : 2}
                                      rx={4}
                                      className="transition-all"
                                    />
                                    <text
                                      x={bx + 6}
                                      y={by + 16}
                                      fill="#ffffff"
                                      fontSize="14"
                                      fontWeight="bold"
                                      filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.9))"
                                    >
                                      #{lIdx + 1}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
                        ) : (
                          <div className="text-center p-4 text-xs text-on-surface-variant italic">
                            {t('translate.compare.previewNoImage')}
                          </div>
                        )}
                      </div>

                      {/* Mini Caption */}
                      <p className="text-[10px] text-on-surface-variant/80 text-center italic">
                        {t('translate.compare.previewHint')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-outline-variant/20 shrink-0">
                  <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                    <span>
                      {t('translate.compare.footerTotal', {
                        scope: isAllScope ? t('translate.compare.footerScopeAll') : t('translate.compare.footerScopeCurrent'),
                        count: totalScopeCount,
                      })}
                    </span>
                    <span>•</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">verified</span>
                      <span>{t('translate.compare.footerClean', { count: cleanScopeCount })}</span>
                    </span>
                    {residualScopeCount > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">warning</span>
                          <span>{t('translate.compare.footerResidual', { count: residualScopeCount })}</span>
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {residualScopeCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRetryResidualBubbles(comparisonScope)}
                        disabled={isRetryingResidual}
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:brightness-110 text-white dark:text-amber-950 text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
                        <span>
                          {t('translate.compare.retryResidualBtn', {
                            count: residualScopeCount,
                            scope: isAllScope ? t('translate.compare.footerScopeAll') : t('translate.compare.footerScopeCurrent'),
                          })}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowComparisonModal(false)}
                      className="px-4 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
                    >
                      {t('translate.compare.close')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* Hidden inputs for web file/folder selection fallback */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/jpg"
        style={{ display: 'none' }}
        onChange={handleHtmlFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        style={{ display: 'none' }}
        onChange={handleHtmlFolderInputChange}
      />

      {/* ── Custom React Modal: Xác nhận xuất trang chưa dịch (Smart Verification Gate) ── */}
      {exportConfirmModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"
          onClick={() => setExportConfirmModal(null)}
        >
          <div
            className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 animate-scaleUp text-on-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <span className="material-symbols-outlined text-[24px]">
                  {exportConfirmModal.type === 'partial_chapter' ? 'fact_check' : 'warning'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-on-surface truncate">
                  {exportConfirmModal.title || t('translate.studio.exportConfirmDefaultTitle')}
                </h3>
                <p className="text-xs text-on-surface-variant">
                  {exportConfirmModal.isCbz ? t('translate.studio.exportConfirmCbzSub') : t('translate.studio.exportConfirmImgSub')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportConfirmModal(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            {exportConfirmModal.type === 'partial_chapter' ? (
              <div className="space-y-3 text-xs">
                <p className="text-on-surface leading-relaxed">
                  {t('translate.studio.exportTotalPagesDesc', { count: exportConfirmModal.totalCount })}
                </p>
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-surface-container border border-outline-variant/20">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-500 text-[18px]">check_circle</span>
                    <div>
                      <div className="font-bold text-on-surface">{exportConfirmModal.translatedCount} trang</div>
                      <div className="text-[10px] text-on-surface-variant">{t('translate.studio.exportTranslatedBadge')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-500 text-[18px]">help_outline</span>
                    <div>
                      <div className="font-bold text-on-surface">{exportConfirmModal.untranslatedCount} trang</div>
                      <div className="text-[10px] text-on-surface-variant">{t('translate.studio.exportUntranslatedBadge')}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <p className="font-semibold text-on-surface">{t('translate.studio.exportUntranslatedQuestion')}</p>
                  <label className="flex items-start gap-2.5 p-2 rounded-xl border border-outline-variant/30 hover:bg-surface-container-high transition-colors cursor-pointer">
                    <input
                      type="radio"
                      name="export_untranslated_mode"
                      checked={includeUntranslatedPages}
                      onChange={() => setIncludeUntranslatedPages(true)}
                      className="accent-primary mt-0.5 cursor-pointer"
                    />
                    <div>
                      <p className="font-semibold text-on-surface">{t('translate.studio.exportAllOptionTitle', { count: exportConfirmModal.totalCount })}</p>
                      <p className="text-[11px] text-on-surface-variant">{t('translate.studio.exportAllOptionDesc')}</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-2 rounded-xl border border-outline-variant/30 hover:bg-surface-container-high transition-colors cursor-pointer">
                    <input
                      type="radio"
                      name="export_untranslated_mode"
                      checked={!includeUntranslatedPages}
                      onChange={() => setIncludeUntranslatedPages(false)}
                      className="accent-primary mt-0.5 cursor-pointer"
                    />
                    <div>
                      <p className="font-semibold text-on-surface">{t('translate.studio.exportOnlyTranslatedTitle', { count: exportConfirmModal.translatedCount })}</p>
                      <p className="text-[11px] text-on-surface-variant">{t('translate.studio.exportOnlyTranslatedDesc')}</p>
                    </div>
                  </label>
                </div>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {exportConfirmModal.message}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setExportConfirmModal(null)}
                className="px-3.5 py-1.5 rounded-xl border border-outline-variant/30 text-on-surface hover:bg-surface-container font-semibold text-xs transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const onConfirm = exportConfirmModal.onConfirm;
                  const isPartial = exportConfirmModal.type === 'partial_chapter';
                  setExportConfirmModal(null);
                  if (isPartial) {
                    onConfirm?.(includeUntranslatedPages);
                  } else {
                    onConfirm?.();
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">file_download</span>
                <span>{exportConfirmModal.confirmText || t('translate.studio.exportProceedBtn')}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Floating Toast Notification (với Action Button nếu có) ── */}
      {statusMessage?.text && typeof document !== 'undefined' && createPortal(
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[11000] flex items-center gap-2.5 px-4 py-2 rounded-2xl border shadow-xl backdrop-blur-md bg-surface-container-lowest/95 border-outline-variant/30 text-on-surface text-xs font-semibold animate-fadeIn max-w-xl pointer-events-auto select-none"
        >
          <span className={`material-symbols-outlined text-[18px] shrink-0 ${statusMessage.type === 'success'
            ? 'text-emerald-500'
            : statusMessage.type === 'error'
              ? 'text-error'
              : statusMessage.type === 'warn'
                ? 'text-amber-500'
                : 'text-primary'
            }`}>
            {statusMessage.type === 'success'
              ? 'check_circle'
              : statusMessage.type === 'error'
                ? 'error'
                : statusMessage.type === 'warn'
                  ? 'warning'
                  : 'info'}
          </span>
          <span className="truncate max-w-[340px]">{statusMessage.text}</span>
          {statusMessage.action && (
            <button
              type="button"
              onClick={() => {
                statusMessage.action.onClick?.();
                setStatusMessage({ text: '', type: 'info' });
              }}
              className="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-[11px] font-bold cursor-pointer transition-colors shrink-0 shadow-sm flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[13px]">folder_open</span>
              <span>{statusMessage.action.label || t('translate.studio.toastOpenAction')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setStatusMessage({ text: '', type: 'info' })}
            className="w-5 h-5 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer shrink-0 ml-1"
            title={t('translate.studio.toastCloseTitle')}
          >
            <span className="material-symbols-outlined text-[13px]">close</span>
          </button>
        </div>,
        document.body
      )}

      {/* Completion Modal */}
      {completionModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <span className="material-symbols-outlined text-2xl">task_alt</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-on-surface leading-snug break-words">{completionModal.title}</h3>
                  <p className="text-xs text-on-surface-variant line-clamp-1">Manga Studio Translation Engine</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCompletionModal(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer shrink-0 -mr-1 -mt-1"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <p className="text-xs text-on-surface leading-relaxed">
              {completionModal.message}
            </p>

            {completionModal.stats && (
              <div className="grid grid-cols-2 gap-2 bg-surface-container/60 p-3 rounded-xl border border-outline-variant/20 text-xs">
                {completionModal.stats.success !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">{t('translate.studio.completionExported')}</span>
                    <span className="font-bold text-emerald-500">{t('translate.studio.pagesCount', { count: completionModal.stats.success })}</span>
                  </div>
                )}
                {completionModal.stats.total !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">{t('translate.studio.completionTotal')}</span>
                    <span className="font-bold text-on-surface">{t('translate.studio.pagesCount', { count: completionModal.stats.total })}</span>
                  </div>
                )}
                {completionModal.stats.skipped !== undefined && completionModal.stats.skipped > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">{t('translate.studio.completionSkipped')}</span>
                    <span className="font-semibold text-amber-500">{t('translate.studio.pagesCount', { count: completionModal.stats.skipped })}</span>
                  </div>
                )}
                {completionModal.stats.error !== undefined && completionModal.stats.error > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">{t('translate.studio.completionError')}</span>
                    <span className="font-semibold text-error">{completionModal.stats.error}</span>
                  </div>
                )}
              </div>
            )}

            {completionModal.folderPath && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">folder</span>
                  <span>{t('translate.studio.completionFolderLabel')}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface-container font-mono text-[11px] text-on-surface truncate select-all border border-outline-variant/15" title={completionModal.folderPath}>
                  {completionModal.folderPath}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCompletionModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                {t('translate.studio.closeModal')}
              </button>
              {completionModal.folderPath && (
                <button
                  type="button"
                  onClick={() => {
                    if (api?.translateOpenFolder) api.translateOpenFolder(completionModal.folderPath);
                    else if (window.electronAPI?.openPath) window.electronAPI.openPath(completionModal.folderPath);
                    setCompletionModal(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">folder_open</span>
                  <span>{t('translate.studio.completionOpenFolderBtn')}</span>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

class StudioErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[MangaStudioEditor] Studio render error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const t = this.props.t || ((k) => k);
      return (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/70 backdrop-blur-md p-6 text-on-surface">
          <div className="max-w-md w-full p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl space-y-4 text-center text-on-surface">
            <span className="material-symbols-outlined text-4xl text-error">warning</span>
            <h3 className="text-base font-bold text-on-surface">{t('translate.studio.errorBoundaryTitle')}</h3>
            <p className="text-xs text-on-surface-variant">
              {t('translate.studio.errorBoundaryDesc')}
            </p>
            <p className="text-xs text-error font-mono bg-surface-container p-3 rounded-xl text-left overflow-auto max-h-32 border border-outline-variant/20">
              {this.state.error?.message || String(this.state.error)}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="cursor-pointer px-4 py-2 rounded-xl bg-primary text-xs font-bold text-on-primary hover:brightness-110 transition-all shadow-xs"
              >
                {t('translate.studio.errorBoundaryRetry')}
              </button>
              {this.props.onClose && (
                <button
                  type="button"
                  onClick={this.props.onClose}
                  className="cursor-pointer px-4 py-2 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors"
                >
                  {t('translate.studio.errorBoundaryBack')}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MangaStudioEditorWithBoundary(props) {
  const { t } = useI18n();
  if (typeof document === 'undefined') return null;
  if (props.isStandaloneView) {
    return (
      <StudioErrorBoundary onClose={props.onClose} t={t}>
        <MangaStudioEditor {...props} />
      </StudioErrorBoundary>
    );
  }
  return createPortal(
    <StudioErrorBoundary onClose={props.onClose} t={t}>
      <MangaStudioEditor {...props} />
    </StudioErrorBoundary>,
    document.body
  );
}
