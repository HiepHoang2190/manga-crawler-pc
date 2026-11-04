/**
 * DetectionStep — Phát hiện vùng text trong ảnh manga.
 *
 * Dùng ONNX model (comic-text-detector) để tìm bounding boxes
 * của text regions và bong bóng hội thoại.
 *
 * Tương tự Koharu Detection & Segmentation step,
 * nhưng dùng model nhẹ hơn (YOLO-based thay vì RF-DETR).
 */
const sharp = require('sharp');
const logger = require('../../shared/logger');

/** Kích thước input model. */
const MODEL_INPUT_SIZE = 640;

/** Confidence threshold mặc định cho comic text detector. */
const DEFAULT_CONFIDENCE = 0.3;

/** Label names từ model. */
const LABELS = ['bubble', 'text_bubble', 'text_free'];

class DetectionStep {
  /**
   * @param {import('onnxruntime-node')} ort — ONNX Runtime module
   * @param {string} modelPath — đường dẫn tới model.onnx hoặc detector.onnx
   */
  constructor(ort, modelPath) {
    this._ort = ort;
    this._modelPath = modelPath;
    this._session = null;
  }

  /** Load model (lazy). */
  async _ensureSession() {
    if (!this._session) {
      logger.info('[DetectionStep] Loading detection model...');
      this._session = await this._ort.InferenceSession.create(this._modelPath, {
        executionProviders: ['cpu'],
      });
      logger.info('[DetectionStep] Model loaded.');
    }
    return this._session;
  }

  /**
   * Phát hiện vùng text trong ảnh.
   * @param {Buffer} imageBuffer — ảnh gốc (JPEG/PNG)
   * @param {object} [options]
   * @param {number} [options.confidenceThreshold=0.3]
   * @returns {Promise<Array<{bbox: [number,number,number,number], confidence: number, label: string}>>}
   *   bbox = [x, y, width, height] trong tọa độ ảnh gốc.
   */
  async detect(imageBuffer, options = {}) {
    const confidence = options.confidenceThreshold || DEFAULT_CONFIDENCE;
    const session = await this._ensureSession();

    // 1. Preprocess: resize + normalize
    const { tensor, originalWidth, originalHeight } = await this._preprocess(imageBuffer);

    // 2. Build feeds: handle both RT-DETR (requires orig_target_sizes) and standard YOLO (images only)
    const feeds = {};
    const inputName = session.inputNames[0];
    feeds[inputName] = tensor;

    if (session.inputNames.includes('orig_target_sizes')) {
      feeds['orig_target_sizes'] = new this._ort.Tensor(
        'int64',
        new BigInt64Array([BigInt(originalWidth), BigInt(originalHeight)]),
        [1, 2]
      );
    }

    const results = await session.run(feeds);

    // 3. Post-process
    let detections;
    if (results.boxes && results.scores && results.labels) {
      detections = this._postprocessRTDetr(results, originalWidth, originalHeight, confidence);
    } else {
      detections = this._postprocessYOLO(results, originalWidth, originalHeight, confidence);
    }

    logger.info(`[DetectionStep] Found ${detections.length} text regions.`);
    return detections;
  }

  /**
   * Post-process RT-DETR output:
   * boxes: [1, 300, 4] -> [x1, y1, x2, y2] trong tọa độ orig_target_sizes
   * scores: [1, 300]
   * labels: [1, 300] (0 = bubble, 1 = text_bubble, 2 = text_free)
   */
  _postprocessRTDetr(results, originalWidth, originalHeight, confidenceThreshold) {
    const boxes = results.boxes.data;
    const scores = results.scores.data;
    const labels = results.labels.data;
    const numQueries = results.scores.dims ? results.scores.dims[1] : 300;

    const rawDetections = [];
    const LABEL_NAMES = {
      0: 'bubble',
      1: 'text_bubble',
      2: 'text_free',
    };

    // Ngưỡng phát hiện: Cho phép bubble nhận diện nhạy hơn (>= 0.22) để không bỏ sót viền bóng thoại
    const bubbleThreshold = Math.min(0.24, confidenceThreshold);
    const textThreshold = confidenceThreshold;

    for (let i = 0; i < numQueries; i++) {
      const score = scores[i];
      const labelId = Number(labels[i]);
      const isBubble = labelId === 0;
      const isText = labelId === 1 || labelId === 2;

      const thresh = isBubble ? bubbleThreshold : textThreshold;
      if (score < thresh) continue;

      const x1 = Math.max(0, boxes[i * 4 + 0]);
      const y1 = Math.max(0, boxes[i * 4 + 1]);
      const x2 = Math.min(originalWidth, boxes[i * 4 + 2]);
      const y2 = Math.min(originalHeight, boxes[i * 4 + 3]);

      const w = Math.max(0, x2 - x1);
      const h = Math.max(0, y2 - y1);

      if (w < 8 || h < 8) continue;

      rawDetections.push({
        bbox: [Math.round(x1), Math.round(y1), Math.round(w), Math.round(h)],
        confidence: Math.round(score * 1000) / 1000,
        label: LABEL_NAMES[labelId] || 'text',
        isBubble,
        isText,
      });
    }

    return this._matchBubblesAndTexts(rawDetections, originalWidth, originalHeight);
  }

  /**
   * Preprocess ảnh cho model input.
   * YOLO models expect: [1, 3, 640, 640], float32, normalized [0,1].
   */
  async _preprocess(imageBuffer) {
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    // Resize to model input size (letterbox)
    const resized = await sharp(imageBuffer)
      .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    // Convert HWC → CHW, normalize [0, 1]
    const pixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    const float32 = new Float32Array(3 * pixels);
    for (let i = 0; i < pixels; i++) {
      float32[i] = resized[i * 3] / 255.0;                    // R
      float32[pixels + i] = resized[i * 3 + 1] / 255.0;       // G
      float32[2 * pixels + i] = resized[i * 3 + 2] / 255.0;   // B
    }

    const tensor = new this._ort.Tensor('float32', float32, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
    return { tensor, originalWidth, originalHeight };
  }

  /**
   * Post-process model output → bounding boxes cho YOLO models.
   */
  _postprocessYOLO(results, originalWidth, originalHeight, confidenceThreshold) {
    const outputName = Object.keys(results)[0];
    const output = results[outputName];
    const data = output.data;
    const dims = output.dims;

    const rawDetections = [];

    // Handle different output formats
    if (dims.length === 3 && dims[0] === 1) {
      const numDetections = dims[2];
      const numFields = dims[1];

      // Transposed format: [1, fields, detections]
      if (numFields <= 10 && numDetections > numFields) {
        for (let i = 0; i < numDetections; i++) {
          const cx = data[0 * numDetections + i];
          const cy = data[1 * numDetections + i];
          const w = data[2 * numDetections + i];
          const h = data[3 * numDetections + i];

          let bestScore = 0;
          let bestClass = 0;
          for (let c = 4; c < numFields; c++) {
            const score = data[c * numDetections + i];
            if (score > bestScore) {
              bestScore = score;
              bestClass = c - 4;
            }
          }

          if (bestScore < confidenceThreshold) continue;

          const scaleX = originalWidth / MODEL_INPUT_SIZE;
          const scaleY = originalHeight / MODEL_INPUT_SIZE;

          const x = Math.max(0, (cx - w / 2) * scaleX);
          const y = Math.max(0, (cy - h / 2) * scaleY);
          const bw = Math.min(w * scaleX, originalWidth - x);
          const bh = Math.min(h * scaleY, originalHeight - y);

          const classId = Math.round(bestClass);
          rawDetections.push({
            bbox: [Math.round(x), Math.round(y), Math.round(bw), Math.round(bh)],
            confidence: Math.round(bestScore * 1000) / 1000,
            label: LABELS[classId] || 'text',
            isBubble: classId === 0,
            isText: classId === 1 || classId === 2,
          });
        }
      } else {
        // Standard format: [1, detections, fields]
        for (let i = 0; i < dims[1]; i++) {
          const offset = i * dims[2];
          const cx = data[offset + 0];
          const cy = data[offset + 1];
          const w = data[offset + 2];
          const h = data[offset + 3];
          const conf = data[offset + 4];
          const classId = Math.round(data[offset + 5] || 0);

          if (conf < confidenceThreshold) continue;

          const scaleX = originalWidth / MODEL_INPUT_SIZE;
          const scaleY = originalHeight / MODEL_INPUT_SIZE;

          const x = Math.max(0, (cx - w / 2) * scaleX);
          const y = Math.max(0, (cy - h / 2) * scaleY);
          const bw = Math.min(w * scaleX, originalWidth - x);
          const bh = Math.min(h * scaleY, originalHeight - y);

          rawDetections.push({
            bbox: [Math.round(x), Math.round(y), Math.round(bw), Math.round(bh)],
            confidence: Math.round(conf * 1000) / 1000,
            label: LABELS[classId] || 'text',
            isBubble: classId === 0,
            isText: classId === 1 || classId === 2,
          });
        }
      }
    }

    return this._matchBubblesAndTexts(rawDetections, originalWidth, originalHeight);
  }

  /**
   * Ghép nối bong bóng thoại (bubble) và các vùng văn bản (text_bubble / text_free).
   * QUY TẮC: Lấy khung thoại gốc (bubble) làm chuẩn cho bbox của layer.
   * - Dấu viền nét đứt (UI Studio) bao quanh trọn vẹn khung thoại gốc.
   * - Text tiếng Việt căn chỉnh theo diện tích khung thoại gốc, không bị bó hẹp thành 1 cột dọc.
   * - Các cột text Nhật trong cùng 1 bóng thoại được gom vào 1 khung thoại duy nhất.
   */
  _matchBubblesAndTexts(rawDetections, originalWidth, originalHeight) {
    if (!rawDetections || rawDetections.length === 0) return [];

    const bubbles = rawDetections.filter((d) => d.isBubble);
    const texts = rawDetections.filter((d) => d.isText);

    // 1. NMS riêng cho bubbles và texts để loại bỏ duplicate boxes
    const cleanBubbles = this._nms(bubbles, 0.45);
    const cleanTexts = this._nms(texts, 0.45);

    const matchedTextIndices = new Set();
    const results = [];

    // 2. Với mỗi khung thoại gốc (bubble), tìm các đoạn text nằm bên trong
    for (const bubble of cleanBubbles) {
      const [bx, by, bw, bh] = bubble.bbox;
      const matchedTexts = [];

      for (let j = 0; j < cleanTexts.length; j++) {
        if (matchedTextIndices.has(j)) continue;
        const text = cleanTexts[j];
        const [tx, ty, tw, th] = text.bbox;

        // Tọa độ tâm của vùng text
        const tcx = tx + tw / 2;
        const tcy = ty + th / 2;

        // Kiểm tra tâm text có nằm trong bubble không
        const isCenterInside = tcx >= bx && tcx <= (bx + bw) && tcy >= by && tcy <= (by + bh);

        // Tính tỷ lệ diện tích giao nhau so với diện tích text
        const ix = Math.max(bx, tx);
        const iy = Math.max(by, ty);
        const iw = Math.max(0, Math.min(bx + bw, tx + tw) - ix);
        const ih = Math.max(0, Math.min(by + bh, ty + th) - iy);
        const overlapArea = iw * ih;
        const textArea = Math.max(1, tw * th);
        const overlapRatio = overlapArea / textArea;

        if (isCenterInside || overlapRatio >= 0.35) {
          matchedTexts.push(text);
          matchedTextIndices.add(j);
        }
      }

      if (matchedTexts.length > 0) {
        // Lấy khung thoại gốc làm chuẩn (mở rộng nhẹ nếu text hơi chớm mép)
        const minX = Math.min(bx, ...matchedTexts.map((t) => t.bbox[0]));
        const minY = Math.min(by, ...matchedTexts.map((t) => t.bbox[1]));
        const maxR = Math.max(bx + bw, ...matchedTexts.map((t) => t.bbox[0] + t.bbox[2]));
        const maxB = Math.max(by + bh, ...matchedTexts.map((t) => t.bbox[1] + t.bbox[3]));

        // Text bbox thuần túy bên trong (cho inpainting / OCR)
        const tMinX = Math.min(...matchedTexts.map((t) => t.bbox[0]));
        const tMinY = Math.min(...matchedTexts.map((t) => t.bbox[1]));
        const tMaxR = Math.max(...matchedTexts.map((t) => t.bbox[0] + t.bbox[2]));
        const tMaxB = Math.max(...matchedTexts.map((t) => t.bbox[1] + t.bbox[3]));

        results.push({
          bbox: [
            Math.max(0, minX),
            Math.max(0, minY),
            Math.min(originalWidth - minX, maxR - minX),
            Math.min(originalHeight - minY, maxB - minY),
          ],
          textBbox: [
            Math.max(0, tMinX),
            Math.max(0, tMinY),
            Math.min(originalWidth - tMinX, tMaxR - tMinX),
            Math.min(originalHeight - tMinY, tMaxB - tMinY),
          ],
          confidence: Math.max(bubble.confidence, ...matchedTexts.map((t) => t.confidence)),
          label: 'bubble',
          hasBubble: true,
        });
      } else if (bubble.confidence >= 0.45) {
        // Bong bóng thoại rõ nét nhưng text detector chưa bắt được text_bubble
        results.push({
          bbox: [...bubble.bbox],
          textBbox: [...bubble.bbox],
          confidence: bubble.confidence,
          label: 'bubble',
          hasBubble: true,
        });
      }
    }

    // 3. Các vùng text không thuộc bóng thoại nào (SFX, hộp thoại vuông, text nền tự do, hoặc bubble bị miss)
    for (let j = 0; j < cleanTexts.length; j++) {
      if (matchedTextIndices.has(j)) continue;
      const text = cleanTexts[j];
      const [tx, ty, tw, th] = text.bbox;

      // Nếu là text_bubble hoặc text dọc tiếng Nhật (th > tw * 1.5):
      // Text tiếng Nhật chạy dọc rất hẹp (vd: rộng 40px, cao 200px).
      // Khi dịch sang tiếng Việt chạy ngang, nếu giữ nguyên bề rộng hẹp này thì chữ sẽ bị dồn 1 từ / dòng.
      // Do đó mở rộng bề rộng đối xứng quanh tâm theo tỷ lệ khung thoại manga tự nhiên (aspect ratio ~0.72 - 0.8)
      let expandedW = tw;
      let expandedH = th;
      let px = tx;
      let py = ty;

      if (text.label === 'text_bubble' || th > tw * 1.5) {
        expandedW = Math.max(tw + 24, Math.round(th * 0.75));
        const centerX = tx + tw / 2;
        px = Math.max(0, Math.round(centerX - expandedW / 2));
        const rightEdge = Math.min(originalWidth, px + expandedW);
        expandedW = rightEdge - px;

        const padY = Math.max(8, Math.round(th * 0.08));
        py = Math.max(0, ty - padY);
        expandedH = Math.min(originalHeight - py, th + 2 * padY);
      } else {
        const padX = Math.max(8, Math.round(tw * 0.18));
        const padY = Math.max(6, Math.round(th * 0.10));
        px = Math.max(0, tx - padX);
        py = Math.max(0, ty - padY);
        expandedW = Math.min(originalWidth - px, tw + 2 * padX);
        expandedH = Math.min(originalHeight - py, th + 2 * padY);
      }

      results.push({
        bbox: [px, py, expandedW, expandedH],
        textBbox: [...text.bbox],
        confidence: text.confidence,
        label: text.label || 'text',
        hasBubble: text.label === 'text_bubble',
      });
    }

    // 4. Sắp xếp theo thứ tự đọc tự nhiên từ trên xuống dưới
    results.sort((a, b) => a.bbox[1] - b.bbox[1]);

    return results;
  }

  /** Non-Maximum Suppression. */
  _nms(detections, iouThreshold) {
    if (detections.length <= 1) return detections;

    // Sort by confidence descending
    detections.sort((a, b) => b.confidence - a.confidence);

    const keep = [];
    const suppressed = new Set();

    for (let i = 0; i < detections.length; i++) {
      if (suppressed.has(i)) continue;
      keep.push(detections[i]);

      for (let j = i + 1; j < detections.length; j++) {
        if (suppressed.has(j)) continue;
        if (this._iou(detections[i].bbox, detections[j].bbox) > iouThreshold) {
          suppressed.add(j);
        }
      }
    }

    return keep;
  }

  /** Intersection over Union. */
  _iou([x1, y1, w1, h1], [x2, y2, w2, h2]) {
    const ix = Math.max(x1, x2);
    const iy = Math.max(y1, y2);
    const iw = Math.max(0, Math.min(x1 + w1, x2 + w2) - ix);
    const ih = Math.max(0, Math.min(y1 + h1, y2 + h2) - iy);
    const intersection = iw * ih;
    const union = w1 * h1 + w2 * h2 - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /** Release model session. */
  async dispose() {
    if (this._session) {
      await this._session.release();
      this._session = null;
    }
  }
}

module.exports = DetectionStep;
