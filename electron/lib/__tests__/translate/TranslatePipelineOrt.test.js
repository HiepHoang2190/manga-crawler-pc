const path = require('path');
const fs = require('fs');
const os = require('os');
const TranslatePipeline = require('../../translate/TranslatePipeline');
const { defaultExtrasManager } = require('../../extras/ExtrasManager');

describe('TranslatePipeline ONNX Runtime loading (getOrt)', () => {
  beforeEach(() => {
    if (typeof TranslatePipeline._resetOrt === 'function') {
      TranslatePipeline._resetOrt();
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (typeof TranslatePipeline._resetOrt === 'function') {
      TranslatePipeline._resetOrt();
    }
  });

  test('TranslatePipeline exports getOrt method', () => {
    expect(typeof TranslatePipeline.getOrt).toBe('function');
  });

  test('getOrt successfully returns an ONNX Runtime instance with InferenceSession', () => {
    const ort = TranslatePipeline.getOrt();
    expect(ort).toBeDefined();
    expect(typeof ort.InferenceSession).toBe('function');
    expect(typeof ort.InferenceSession.create).toBe('function');
  });

  test('getOrt can resolve onnxruntime-common even if extras onnxruntime folder lacks onnxruntime-common', () => {
    // Tạo thư mục extras giả lập chỉ có dist/index.js mà không có node_modules/onnxruntime-common
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ort-test-'));
    try {
      const realOnnxDir = path.join(process.cwd(), 'node_modules', 'onnxruntime-node');
      const tempOnnxDir = path.join(tempDir, 'onnxruntime');
      fs.mkdirSync(tempOnnxDir, { recursive: true });

      // Copy package.json và dist
      fs.cpSync(path.join(realOnnxDir, 'package.json'), path.join(tempOnnxDir, 'package.json'));
      fs.cpSync(path.join(realOnnxDir, 'dist'), path.join(tempOnnxDir, 'dist'), { recursive: true });
      // Copy bin
      fs.cpSync(path.join(realOnnxDir, 'bin'), path.join(tempOnnxDir, 'bin'), { recursive: true });
      // Chú ý: Cố tình KHÔNG copy node_modules chứa onnxruntime-common vào tempOnnxDir

      jest.spyOn(defaultExtrasManager, 'getOnnxRuntimePath').mockReturnValue(tempOnnxDir);

      const ort = TranslatePipeline.getOrt();
      expect(ort).toBeDefined();
      expect(typeof ort.InferenceSession).toBe('function');
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('getOrt throws user-friendly error when neither extras nor onnxruntime-node is available', () => {
    jest.isolateModules(() => {
      jest.doMock('onnxruntime-node', () => {
        const err = new Error("Cannot find module 'onnxruntime-node'");
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      });

      const { defaultExtrasManager: isolatedExtras } = require('../../extras/ExtrasManager');
      jest.spyOn(isolatedExtras, 'getOnnxRuntimePath').mockReturnValue('/non/existent/path');

      const IsolatedPipeline = require('../../translate/TranslatePipeline');
      if (typeof IsolatedPipeline._resetOrt === 'function') {
        IsolatedPipeline._resetOrt();
      }

      expect(() => {
        IsolatedPipeline.getOrt();
      }).toThrow('Gói tài nguyên Extras (AI Models / ONNX Runtime) chưa được cài đặt hoặc không tìm thấy');
    });
  });
});
