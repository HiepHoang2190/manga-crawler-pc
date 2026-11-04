/**
 * InpaintingStep — Xóa text gốc và phục hồi artwork chuẩn Koharu.
 *
 * Dùng LaMa (Large Mask Inpainting) ONNX model.
 * Sử dụng Text-Stroke Segmentation Mask và Local Patch Inpainting (Tiling):
 * - Bảo toàn 100% viền cong oval của bóng thoại (không bị cắt lẹm bởi hình chữ nhật).
 * - Bảo toàn 100% screentone và nét vẽ nghệ thuật bên ngoài.
 * - Chỉ tẩy sạch đúng các nét mực của con chữ.
 */
const sharp = require('sharp');
const logger = require('../../shared/logger');

/** LaMa model input size. */
const INPAINT_SIZE = 512;

class InpaintingStep {
  /**
   * @param {import('onnxruntime-node')} ort
   * @param {string} modelPath — đường dẫn tới lama_fp32.onnx
   */
  constructor(ort, modelPath) {
    this._ort = ort;
    this._modelPath = modelPath;
    this._session = null;
  }

  async _ensureSession() {
    if (!this._session) {
      logger.info('[InpaintingStep] Loading LaMa inpainting model...');
      this._session = await this._ort.InferenceSession.create(this._modelPath, {
        executionProviders: ['cpu'],
      });
      logger.info('[InpaintingStep] Model loaded.');
    }
    return this._session;
  }

  /**
   * Xóa text từ ảnh dựa trên detected regions.
   * @param {Buffer} imageBuffer — ảnh gốc
   * @param {Array<{bbox: number[], textBbox?: number[], hasBubble?: boolean}>} detections — vùng text cần xóa
   * @returns {Promise<Buffer>} — ảnh đã clean (PNG buffer)
   */
  async inpaint(imageBuffer, detections) {
    if (!detections || detections.length === 0) return imageBuffer;

    const session = await this._ensureSession();
    const metadata = await sharp(imageBuffer).metadata();
    const origW = metadata.width;
    const origH = metadata.height;

    // 1. Tạo Text-Stroke mask chuẩn pixel (chỉ bao phủ nét chữ, giữ nguyên viền bóng thoại & tranh nền)
    const maskBuffer = await this._createSmartMask(imageBuffer, origW, origH, detections);

    // Kiểm tra mask có bất kỳ pixel nào cần inpaint không
    let hasWhite = false;
    for (let i = 0; i < maskBuffer.length; i++) {
      if (maskBuffer[i] > 128) {
        hasWhite = true;
        break;
      }
    }
    if (!hasWhite) {
      logger.info('[InpaintingStep] Không tìm thấy pixel chữ nào trong mask, giữ nguyên ảnh gốc.');
      return imageBuffer;
    }

    // 2. Process bằng Local Patch Inpainting (Tiling cục bộ chuẩn Koharu)
    try {
      const result = await this._processLocalPatches(imageBuffer, maskBuffer, origW, origH, detections, session);
      logger.info(`[InpaintingStep] Đã tẩy sạch ${detections.length} vùng text với Text-Stroke Mask chuẩn Koharu.`);
      return result;
    } catch (err) {
      logger.warn('[InpaintingStep] Inpainting gặp lỗi, fallback an toàn:', err.message);
      return imageBuffer;
    }
  }

  /**
   * Tạo binary mask (1-channel uint8 Buffer, kích thước origW x origH).
   * 255 = pixel nét chữ cần inpaint.
   * 0 = giữ nguyên 100% tranh gốc (viền bóng thoại, screentone, tranh nền).
   */
  async _createSmartMask(imageBuffer, origW, origH, detections) {
    const { data: rawImg, info } = await sharp(imageBuffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;

    const mask = Buffer.alloc(origW * origH, 0);

    for (const d of detections) {
      const hasExplicitTextBbox = Array.isArray(d.textBbox) && d.textBbox.length === 4;
      const box = hasExplicitTextBbox ? d.textBbox : d.bbox;
      if (!box || box.length !== 4) continue;

      const [bx, by, bw, bh] = box;
      if (bw <= 2 || bh <= 2) continue;

      const minX = Math.max(0, Math.min(origW - 1, bx));
      const minY = Math.max(0, Math.min(origH - 1, by));
      const maxX = Math.max(minX, Math.min(origW, bx + bw));
      const maxY = Math.max(minY, Math.min(origH, by + bh));

      // Phân tích độ sáng nền cục bộ quanh viền của box
      let borderLumaSum = 0;
      let borderPixelCount = 0;
      for (let x = minX; x < maxX; x++) {
        const idxTop = (minY * origW + x) * channels;
        borderLumaSum += 0.299 * rawImg[idxTop] + 0.587 * rawImg[idxTop + 1] + 0.114 * rawImg[idxTop + 2];
        const idxBot = ((maxY - 1) * origW + x) * channels;
        borderLumaSum += 0.299 * rawImg[idxBot] + 0.587 * rawImg[idxBot + 1] + 0.114 * rawImg[idxBot + 2];
        borderPixelCount += 2;
      }
      for (let y = minY; y < maxY; y++) {
        const idxLeft = (y * origW + minX) * channels;
        borderLumaSum += 0.299 * rawImg[idxLeft] + 0.587 * rawImg[idxLeft + 1] + 0.114 * rawImg[idxLeft + 2];
        const idxRight = (y * origW + (maxX - 1)) * channels;
        borderLumaSum += 0.299 * rawImg[idxRight] + 0.587 * rawImg[idxRight + 1] + 0.114 * rawImg[idxRight + 2];
        borderPixelCount += 2;
      }

      const avgBorderLuma = borderPixelCount > 0 ? borderLumaSum / borderPixelCount : 255;
      const isBrightBg = avgBorderLuma >= 140 || d.hasBubble !== false;

      // Nếu không có textBbox mà chỉ có bbox của bubble: chừa lề an toàn 15% để tránh viền cong
      const insetX = (!hasExplicitTextBbox && d.hasBubble !== false) ? Math.max(6, Math.round(bw * 0.16)) : 2;
      const insetY = (!hasExplicitTextBbox && d.hasBubble !== false) ? Math.max(6, Math.round(bh * 0.12)) : 2;

      const safeMinX = Math.min(maxX, minX + insetX);
      const safeMaxX = Math.max(safeMinX, maxX - insetX);
      const safeMinY = Math.min(maxY, minY + insetY);
      const safeMaxY = Math.max(safeMinY, maxY - insetY);

      if (isBrightBg) {
        // Chữ đen trên nền sáng (bóng thoại tiêu chuẩn manga)
        const textThreshold = Math.min(180, Math.round(avgBorderLuma * 0.78));
        for (let y = safeMinY; y < safeMaxY; y++) {
          for (let x = safeMinX; x < safeMaxX; x++) {
            const idx = (y * origW + x) * channels;
            const luma = 0.299 * rawImg[idx] + 0.587 * rawImg[idx + 1] + 0.114 * rawImg[idx + 2];
            if (luma <= textThreshold) {
              mask[y * origW + x] = 255;
            }
          }
        }
      } else {
        // Chữ sáng trên nền tối hoặc chữ trên nền screentone phức tạp
        for (let y = safeMinY; y < safeMaxY; y++) {
          for (let x = safeMinX; x < safeMaxX; x++) {
            const idx = (y * origW + x) * channels;
            const luma = 0.299 * rawImg[idx] + 0.587 * rawImg[idx + 1] + 0.114 * rawImg[idx + 2];
            if (Math.abs(luma - avgBorderLuma) > 35) {
              mask[y * origW + x] = 255;
            }
          }
        }
      }
    }

    // Áp dụng phép nở viền (Morphological Dilation) 2px để phủ kín viền anti-aliasing của chữ
    const dilated = Buffer.alloc(origW * origH, 0);
    const radius = 2;
    for (let y = 0; y < origH; y++) {
      for (let x = 0; x < origW; x++) {
        if (mask[y * origW + x] === 255) {
          for (let dy = -radius; dy <= radius; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= origH) continue;
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= origW) continue;
              if (dx * dx + dy * dy <= radius * radius + 1) {
                dilated[ny * origW + nx] = 255;
              }
            }
          }
        }
      }
    }

    return dilated;
  }

  /**
   * Gom cụm các bounding box gần nhau để xử lý cục bộ (Local Patch Tiling).
   */
  _buildClusters(detections, origW, origH) {
    const boxes = detections.map((d) => {
      const b = (Array.isArray(d.textBbox) && d.textBbox.length === 4) ? d.textBbox : d.bbox;
      return [b[0], b[1], b[2], b[3]];
    }).filter((b) => b && b[2] > 0 && b[3] > 0);

    if (boxes.length === 0) return [];

    const clusters = [];
    const used = new Set();

    for (let i = 0; i < boxes.length; i++) {
      if (used.has(i)) continue;
      let [minX, minY, w, h] = boxes[i];
      let maxX = minX + w;
      let maxY = minY + h;
      used.add(i);

      let merged = true;
      while (merged) {
        merged = false;
        for (let j = 0; j < boxes.length; j++) {
          if (used.has(j)) continue;
          const [bx, by, bw, bh] = boxes[j];
          const bRight = bx + bw;
          const bBottom = by + bh;

          // Merge nếu khoảng cách giữa 2 box <= 60px
          const distThreshold = 60;
          const isNearby = !(
            bx > maxX + distThreshold ||
            bRight < minX - distThreshold ||
            by > maxY + distThreshold ||
            bBottom < minY - distThreshold
          );

          if (isNearby) {
            minX = Math.min(minX, bx);
            minY = Math.min(minY, by);
            maxX = Math.max(maxX, bRight);
            maxY = Math.max(maxY, bBottom);
            used.add(j);
            merged = true;
          }
        }
      }

      // Context padding 32-48px để LaMa nhận diện được nền xung quanh
      const pad = Math.max(32, Math.round(Math.max(maxX - minX, maxY - minY) * 0.15));
      const cropX = Math.max(0, minX - pad);
      const cropY = Math.max(0, minY - pad);
      const cropW = Math.min(origW - cropX, (maxX - minX) + 2 * pad);
      const cropH = Math.min(origH - cropY, (maxY - minY) + 2 * pad);

      clusters.push({ cropX, cropY, cropW, cropH });
    }

    return clusters;
  }

  /**
   * Xử lý inpaint cục bộ từng cụm ở độ phân giải cao và dán ngược lại bằng Text-Stroke Mask.
   */
  async _processLocalPatches(imageBuffer, maskBuffer, origW, origH, detections, session) {
    const clusters = this._buildClusters(detections, origW, origH);
    if (clusters.length === 0) return imageBuffer;

    const { data: finalRaw, info } = await sharp(imageBuffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;

    const pixels = INPAINT_SIZE * INPAINT_SIZE;

    for (const cluster of clusters) {
      const { cropX, cropY, cropW, cropH } = cluster;

      // Extract mask crop trực tiếp bằng fast buffer copy (1 channel nguyên bản)
      const maskCrop = Buffer.alloc(cropW * cropH);
      for (let y = 0; y < cropH; y++) {
        const srcOffset = (cropY + y) * origW + cropX;
        const dstOffset = y * cropW;
        maskBuffer.copy(maskCrop, dstOffset, srcOffset, srcOffset + cropW);
      }

      let clusterHasWhite = false;
      for (let i = 0; i < maskCrop.length; i++) {
        if (maskCrop[i] > 128) {
          clusterHasWhite = true;
          break;
        }
      }
      if (!clusterHasWhite) continue;

      // Extract image crop
      const imgCrop = await sharp(imageBuffer)
        .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
        .removeAlpha()
        .raw()
        .toBuffer();

      // Resize crop to 512x512
      const resizedImg = await sharp(imgCrop, { raw: { width: cropW, height: cropH, channels: 3 } })
        .resize(INPAINT_SIZE, INPAINT_SIZE, { fit: 'fill' })
        .raw()
        .toBuffer();

      const resizedMsk = await sharp(maskCrop, { raw: { width: cropW, height: cropH, channels: 1 } })
        .resize(INPAINT_SIZE, INPAINT_SIZE, { fit: 'fill' })
        .toColourspace('b-w')
        .raw()
        .toBuffer();

      const imgData = new Float32Array(3 * pixels);
      const mskData = new Float32Array(1 * pixels);
      for (let i = 0; i < pixels; i++) {
        imgData[i] = resizedImg[i * 3] / 255.0;
        imgData[pixels + i] = resizedImg[i * 3 + 1] / 255.0;
        imgData[2 * pixels + i] = resizedImg[i * 3 + 2] / 255.0;
        mskData[i] = resizedMsk[i] > 128 ? 1.0 : 0.0;
      }

      const results = await session.run({
        image: new this._ort.Tensor('float32', imgData, [1, 3, INPAINT_SIZE, INPAINT_SIZE]),
        mask: new this._ort.Tensor('float32', mskData, [1, 1, INPAINT_SIZE, INPAINT_SIZE]),
      });

      const outData = results.output.data;

      // Auto-detect multiplier (0..255 hay 0..1)
      let isScale255 = false;
      for (let i = 0; i < Math.min(100, outData.length); i++) {
        if (outData[i] > 1.5) {
          isScale255 = true;
          break;
        }
      }
      const multiplier = isScale255 ? 1.0 : 255.0;

      const outBuf = Buffer.alloc(pixels * 3);
      for (let i = 0; i < pixels; i++) {
        outBuf[i * 3] = Math.min(255, Math.max(0, Math.round(outData[i] * multiplier)));
        outBuf[i * 3 + 1] = Math.min(255, Math.max(0, Math.round(outData[pixels + i] * multiplier)));
        outBuf[i * 3 + 2] = Math.min(255, Math.max(0, Math.round(outData[2 * pixels + i] * multiplier)));
      }

      // Resize LaMa output back to crop size
      const inpaintedCrop = await sharp(outBuf, { raw: { width: INPAINT_SIZE, height: INPAINT_SIZE, channels: 3 } })
        .resize(cropW, cropH, { fit: 'fill' })
        .raw()
        .toBuffer();

      // Composite CHỈ trên các pixel nét chữ (maskCrop > 128)
      // Viền bóng thoại & screentone ngoài có maskCrop == 0 -> Giữ nguyên vẹn 100%
      for (let ly = 0; ly < cropH; ly++) {
        for (let lx = 0; lx < cropW; lx++) {
          const mskIdx = ly * cropW + lx;
          if (maskCrop[mskIdx] > 128) {
            const gx = cropX + lx;
            const gy = cropY + ly;
            const gIdx = (gy * origW + gx) * channels;
            const cIdx = (ly * cropW + lx) * 3;
            finalRaw[gIdx] = inpaintedCrop[cIdx];
            finalRaw[gIdx + 1] = inpaintedCrop[cIdx + 1];
            finalRaw[gIdx + 2] = inpaintedCrop[cIdx + 2];
          }
        }
      }
    }

    return sharp(finalRaw, { raw: { width: origW, height: origH, channels } })
      .png()
      .toBuffer();
  }

  async dispose() {
    if (this._session) {
      await this._session.release();
      this._session = null;
    }
  }
}

module.exports = InpaintingStep;
