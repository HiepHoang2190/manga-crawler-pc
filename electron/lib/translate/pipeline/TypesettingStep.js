/**
 * TypesettingStep — Đặt text đã dịch vào ảnh và render các Layers.
 *
 * Hỗ trợ:
 * - Giữ nguyên 100% độ sắc nét ảnh gốc, không làm mờ nhoè.
 * - Xuất đúng định dạng file gốc (JPEG 92% giữ dung lượng nhẹ ~800KB, PNG, WebP).
 * - Phủ nền trắng bo góc mềm mại (Bubble Cleanup) để xóa sạch chữ Nhật 100%.
 * - Tùy biến từng Text Layer: font, size, color, stroke, align, bold, italic.
 */
const sharp = require('sharp');
const logger = require('../../shared/logger');

/** Default font settings hỗ trợ Unicode Tiếng Việt 100% chuẩn Manga Scanlation. */
const DEFAULT_FONT = '"CC Wild Words", "Adobe 黑体 Std", "Adobe Heiti Std", "SVN-CCWildWords", CCWILDWORDS, CCwildwords, "HL Comic", "Patrick Hand SC", "Shantell Sans", "Playpen Sans", "Comic Neue", "Segoe UI", Arial, sans-serif';
const DEFAULT_TEXT_COLOR = '#000000';
const DEFAULT_OUTLINE_COLOR = '#FFFFFF';
const DEFAULT_OUTLINE_WIDTH = 3;
const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 64;

/**
 * Tự động tính toán khung chat text (textBbox) nội tiếp bên trong bong bóng thoại (bbox) chuẩn Koharu.
 */
function computeOptimalTextBox(bbox, explicitTextBbox, hasBubble = true, isCustom = false) {
  const [bx, by, bw, bh] = Array.isArray(bbox) && bbox.length === 4 ? bbox : [0, 0, 100, 100];
  if (!hasBubble) {
    if (Array.isArray(explicitTextBbox) && explicitTextBbox.length === 4) {
      return [...explicitTextBbox];
    }
    return [bx, by, bw, bh];
  }

  if (
    Array.isArray(explicitTextBbox) &&
    explicitTextBbox.length === 4 &&
    explicitTextBbox[2] > 10 &&
    explicitTextBbox[3] > 10 &&
    (isCustom || (Math.abs(explicitTextBbox[2] - bw) > 4 || Math.abs(explicitTextBbox[3] - bh) > 4))
  ) {
    return [...explicitTextBbox];
  }

  const tw = Math.max(20, Math.round(bw * 0.58));
  const th = Math.max(24, Math.round(bh * 0.76));
  const tx = Math.round(bx + (bw - tw) / 2);
  const ty = Math.round(by + (bh - th) / 2);
  return [tx, ty, tw, th];
}

class TypesettingStep {
  /**
   * Đặt text đã dịch vào ảnh.
   * @param {Buffer} imageBuffer — ảnh gốc hoặc ảnh đã cleanup
   * @param {Array<object>} translations — danh sách text layers
   * @param {object} [options]
   * @param {string} [options.fontFamily]
   * @param {string} [options.textColor]
   * @param {string} [options.outlineColor]
   * @param {number} [options.outlineWidth]
   * @param {boolean} [options.fillBackground] — mặc định true để che sạch chữ gốc
   * @param {string} [options.format] — 'jpeg' | 'png' | 'webp'
   * @param {number} [options.quality] — 1-100 (mặc định 92)
   * @returns {Promise<Buffer>} — ảnh final chất lượng cao
   */
  async typeset(imageBuffer, translations, options = {}) {
    if (!translations || translations.length === 0) return imageBuffer;

    const metadata = await sharp(imageBuffer).metadata();
    const origW = metadata.width;
    const origH = metadata.height;

    const defaultFillBg = options.fillBackground === true; // Mặc định false: không tô đè hộp trắng lên nét vẽ gốc, giữ nguyên 100% bóng thoại manga

    // Tạo SVG overlay chứa tất cả các text layers
    const elements = translations.map((layer, idx) => {
      if (layer.visible === false) return '';

      const rawBbox = Array.isArray(layer.bbox) && layer.bbox.length === 4 ? layer.bbox : [0, 0, 100, 100];
      const bubbleX = Math.max(0, Math.round(Number(rawBbox[0]) || 0));
      const bubbleY = Math.max(0, Math.round(Number(rawBbox[1]) || 0));
      const bubbleW = Math.max(10, Math.round(Number(rawBbox[2]) || 100));
      const bubbleH = Math.max(10, Math.round(Number(rawBbox[3]) || 100));

      // Dùng textBbox (vùng text thực sự bên trong bubble) để text nằm trọn trong khung gốc
      const useBbox = computeOptimalTextBox(rawBbox, layer.textBbox, layer.hasBubble !== false, layer.isCustomTextBox);
      const x = Math.max(0, Math.round(Number(useBbox[0]) || 0));
      const y = Math.max(0, Math.round(Number(useBbox[1]) || 0));
      const w = Math.max(10, Math.round(Number(useBbox[2]) || 100));
      const h = Math.max(10, Math.round(Number(useBbox[3]) || 100));

      const rawText = String(layer.text || layer.translatedText || '');
      if (!rawText.trim()) return '';

      // Mặc định kiểu chữ Manga Scanlation là UPPERCASE (in hoa) giúp chữ đều đặn, không bị nhảy dòng
      const shouldUppercase = layer.textTransform !== 'none';
      const text = shouldUppercase ? rawText.toUpperCase() : rawText;

      const fontFamily = layer.fontFamily || options.fontFamily || DEFAULT_FONT;
      const textColor = layer.color || layer.textColor || options.textColor || DEFAULT_TEXT_COLOR;
      const outlineColor = layer.strokeColor || layer.outlineColor || options.outlineColor || DEFAULT_OUTLINE_COLOR;
      const rawOutlineWidth = Number(layer.strokeWidth ?? layer.outlineWidth ?? options.outlineWidth ?? DEFAULT_OUTLINE_WIDTH);
      const outlineWidth = Math.max(0, Math.min(20, isNaN(rawOutlineWidth) ? DEFAULT_OUTLINE_WIDTH : rawOutlineWidth));
      const align = layer.align || 'center';
      const isBold = layer.bold !== undefined
        ? Boolean(layer.bold)
        : (layer.fontWeight ? String(layer.fontWeight) >= '600' || layer.fontWeight === 'bold' : true);
      const isItalic = layer.italic !== undefined
        ? Boolean(layer.italic)
        : (layer.fontStyle === 'italic');

      const isOval = layer.hasBubble !== false && (layer.type === 'dialogue' || !layer.type);

      // Font size: nếu user set thủ công (number hoặc chuỗi số) thì dùng, nếu không thì auto-fit
      const numFontSize = typeof layer.fontSize === 'number'
        ? layer.fontSize
        : (layer.fontSize && layer.fontSize !== 'auto' ? Number(layer.fontSize) : null);
      const rawFs = (numFontSize && !isNaN(numFontSize) && numFontSize > 0)
        ? numFontSize
        : this._calculateFontSize(text, w, h, false);
      const fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(rawFs) || 14));

      // Padding an toàn bên trong khung text
      const padX = Math.max(2, Math.round(w * 0.04));
      const padY = Math.max(2, Math.round(h * 0.04));
      const textX = Math.round(x + padX);
      const textY = Math.round(y + padY);
      const textW = Math.max(10, Math.round(w - 2 * padX));
      const textH = Math.max(10, Math.round(h - 2 * padY));

      // Wrap text vào các dòng
      const lines = this._wrapText(text, textW, fontSize);
      const lineHeight = Math.max(10, Math.round(fontSize * 1.25));
      const totalTextHeight = lines.length * lineHeight;

      // Canh giữa theo chiều dọc
      const startY = Math.round(textY + Math.max(0, (textH - totalTextHeight) / 2) + fontSize * 0.85);

      // 1. Lớp Bubble Cleanup (CHỈ vẽ khi user cố ý bật fillBackground: true trên layer này)
      let bgSvg = '';
      const shouldFillBg = layer.fillBackground === true || (layer.fillBackground === undefined && defaultFillBg);
      if (shouldFillBg) {
        const bgCol = layer.backgroundColor || '#FFFFFF';
        const rawBgOpacity = Number(layer.backgroundOpacity ?? 0.98);
        const bgOpacity = Math.max(0, Math.min(1, isNaN(rawBgOpacity) ? 0.98 : rawBgOpacity));
        const inset = Math.max(2, Math.round(Math.min(bubbleW, bubbleH) * 0.035));
        const rx = isOval ? Math.round(Math.min(bubbleW, bubbleH) * 0.40) : Math.round(Math.min(bubbleW, bubbleH) * 0.12);
        const ry = isOval ? Math.round(Math.min(bubbleW, bubbleH) * 0.40) : Math.round(Math.min(bubbleW, bubbleH) * 0.12);

        // Thụt lề inset để KHÔNG đè lên viền đen nét vẽ của bóng thoại gốc
        bgSvg = `<rect x="${bubbleX + inset}" y="${bubbleY + inset}" width="${Math.max(4, bubbleW - 2 * inset)}" height="${Math.max(4, bubbleH - 2 * inset)}" rx="${Math.max(2, rx - inset)}" ry="${Math.max(2, ry - inset)}" fill="${bgCol}" fill-opacity="${bgOpacity}"/>\n`;
      }

      // 2. Lớp Typography
      const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
      const anchorX = Math.round(align === 'left' ? textX : align === 'right' ? textX + textW : textX + textW / 2);

      const textSvg = lines.map((line, i) => {
        const lineY = Math.round(startY + i * lineHeight);
        return `<text x="${anchorX}" y="${lineY}" 
          text-anchor="${textAnchor}" 
          font-family="${this._escapeXml(fontFamily)}" 
          font-size="${fontSize}" 
          font-weight="${isBold ? 'bold' : 'normal'}"
          font-style="${isItalic ? 'italic' : 'normal'}"
          fill="${this._escapeXml(textColor)}"
          stroke="${this._escapeXml(outlineColor)}" 
          stroke-width="${outlineWidth}" 
          stroke-linejoin="round"
          paint-order="stroke fill">${this._escapeXml(line)}</text>`;
      }).join('\n');

      return `<g id="layer-${idx}">\n${bgSvg}${textSvg}\n</g>`;
    }).filter(Boolean).join('\n');

    if (!elements) return imageBuffer;

    const svgOverlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${origW}" height="${origH}">
        ${elements}
      </svg>`
    );

    // Composite overlay lên ảnh gốc với độ sắc nét 100%
    let pipeline = sharp(imageBuffer).composite([{ input: svgOverlay, top: 0, left: 0 }]);

    // Xác định định dạng xuất file: ưu tiên giữ đúng định dạng ảnh gốc
    const targetFormat = options.format || metadata.format || 'jpeg';
    const quality = options.quality || 92;

    if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
      pipeline = pipeline.jpeg({ quality, chromaSubsampling: '4:4:4' });
    } else if (targetFormat === 'webp') {
      pipeline = pipeline.webp({ quality });
    } else if (targetFormat === 'png') {
      pipeline = pipeline.png({ compressionLevel: 8 });
    }

    const result = await pipeline.toBuffer();
    logger.info(`[TypesettingStep] Placed ${translations.length} text layers. Exported format=${targetFormat}, size=${(result.length / 1024).toFixed(0)}KB.`);
    return result;
  }

  /**
   * Tính font size phù hợp với bounding box.
   */
  _calculateFontSize(text, boxWidth, boxHeight, isOval = true) {
    if (!text) return MIN_FONT_SIZE;
    const padRatioX = isOval ? 0.15 : 0.08;
    const padRatioY = isOval ? 0.14 : 0.08;
    const padX = Math.max(4, Math.round(boxWidth * padRatioX));
    const padY = Math.max(4, Math.round(boxHeight * padRatioY));
    const textW = Math.max(10, Math.round(boxWidth - 2 * padX));
    const textH = Math.max(10, Math.round(boxHeight - 2 * padY));

    for (let fs = MAX_FONT_SIZE; fs >= MIN_FONT_SIZE; fs -= 1) {
      const lines = this._wrapText(text, textW, fs);
      const lineHeight = Math.max(10, Math.round(fs * 1.25));
      const totalTextHeight = lines.length * lineHeight;

      if (totalTextHeight <= textH) {
        return fs;
      }
    }

    return MIN_FONT_SIZE;
  }

  /**
   * Wrap text vào nhiều dòng dựa trên width.
   */
  _wrapText(text, maxWidth, fontSize) {
    const charWidth = fontSize * 0.55;
    const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / charWidth));

    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      } else {
        if (currentLine) lines.push(currentLine);
        if (word.length > maxCharsPerLine) {
          let remaining = word;
          while (remaining.length > maxCharsPerLine) {
            lines.push(remaining.slice(0, maxCharsPerLine));
            remaining = remaining.slice(maxCharsPerLine);
          }
          currentLine = remaining;
        } else {
          currentLine = word;
        }
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines.length > 0 ? lines : [text];
  }

  /** Escape XML special characters. */
  _escapeXml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

module.exports = TypesettingStep;
