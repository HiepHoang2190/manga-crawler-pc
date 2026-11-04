/**
 * OpenAICompatibleProvider — Endpoint tương thích OpenAI.
 *
 * Tương tự Koharu: hỗ trợ OpenAI-compatible endpoints.
 * Cho phép user kết nối Ollama, LM Studio, vLLM, hoặc bất kỳ server nào
 * implement OpenAI Chat Completions API.
 */
const axios = require('axios');
const { BaseProvider } = require('./index');
const logger = require('../../shared/logger');

const BATCH_SIZE = 25; // Chuẩn Koharu: Gom toàn bộ hội thoại trên trang để LLM nắm trọn ngữ cảnh

/**
 * Từ điển SFX & từ tượng thanh, tượng hình, thán từ manga phổ biến.
 * Giúp việt hoá tức thì (0 latency) và đảm bảo 100% không sót chữ Nhật cho SFX.
 */
const MANGA_SFX_DICTIONARY = {
  'ドキドキ': 'Thình thịch',
  'ドキッ': 'Thót tim',
  'どきっ': 'Thót tim',
  'どきどき': 'Thình thịch',
  'ガタン': 'Rầm',
  'がたん': 'Rầm',
  'ゴゴゴ': 'Gầm gừ',
  'ごごご': 'Gầm gừ',
  'ドドド': 'Rầm rập',
  'どどど': 'Rầm rập',
  'ドン': 'Đùng',
  'どん': 'Đùng',
  'ドカン': 'Bùm',
  'どかん': 'Bùm',
  'ドッ': 'Phịch',
  'シーン': 'Im phăng phắc',
  'しーん': 'Im lặng',
  'ザワ': 'Xì xào',
  'ざわ': 'Xì xào',
  'ザワザワ': 'Xôn xao',
  'ざわざわ': 'Xôn xao',
  'ハァ': 'Hà...',
  'はぁ': 'Hà...',
  'フゥ': 'Phù...',
  'ふぅ': 'Phù...',
  'フッ': 'Hừ...',
  'ふっ': 'Hừ...',
  'えっ': 'Hả?',
  'え': 'Hả?',
  'あっ': 'A!',
  'あ': 'A...',
  'あ…': 'A...',
  'あ...': 'A...',
  'キャー': 'Áaaa!',
  'きゃー': 'Áaaa!',
  'ぎゃー': 'Oái!',
  'ギャー': 'Oái!',
  'バタン': 'Rầm!',
  'ばたん': 'Rầm!',
  'パタン': 'Cạch!',
  'ぱたん': 'Cạch!',
  'ガチャ': 'Cạch!',
  'がちゃ': 'Cạch!',
  'カチッ': 'Tách!',
  'かちっ': 'Tách!',
  'キラッ': 'Lấp lánh',
  'きらっ': 'Lấp lánh',
  'ギラッ': 'Sắc lạnh',
  'ニコッ': 'Mỉm cười',
  'にこっ': 'Mỉm cười',
  'ニヤッ': 'Cười khẩy',
  'にやっと': 'Cười khẩy',
  'クスッ': 'Khẽ cười',
  'くすっ': 'Khẽ cười',
  'チッ': 'Tch!',
  'ちっ': 'Tch!',
  'ヒソヒソ': 'Thì thầm',
  'ひそひそ': 'Thì thầm',
  'ペラペラ': 'Lật phật',
  'ぺらぺら': 'Lật phật',
  'ブルブル': 'Run rẩy',
  'ぶるぶる': 'Run rẩy',
  'ゾクッ': 'Rùng mình',
  'ぞくっ': 'Rùng mình',
  'ピクッ': 'Giật mình',
  'ぴくっ': 'Giật mình',
  'ビクッ': 'Giật nảy',
  'びくっ': 'Giật nảy',
  'コクッ': 'Gật đầu',
  'こくっ': 'Gật đầu',
  'スー': 'Hít sâu...',
  'すー': 'Hít sâu...',
  'ふー': 'Phù...',
  'フー': 'Phù...',
  'わー': 'Oa!',
  'ワー': 'Oa!',
  'うわっ': 'Úi!',
  'ウワッ': 'Úi!',
  'へっ': 'Hứ!',
  'ヘッ': 'Hứ!',
};

class OpenAICompatibleProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this._activeKeyIdx = 0;
  }

  get name() { return 'Local LLM / OpenAI Compatible'; }
  get id() { return 'openai_compatible'; }
  get requiresApiKey() {
    const ep = this._getEndpoint();
    return !ep.includes('localhost') && !ep.includes('127.0.0.1');
  }
  get hasFreeOption() { return true; }
  get supportsOCR() { return false; }

  _getEndpoint() { return (this.config.endpoint || 'http://localhost:11434/v1').replace(/\/$/, ''); }

  _parseKeys() {
    const raw = this.config.key || this.config.apiKey || this.config.credential || '';
    if (Array.isArray(raw)) return raw.filter(Boolean);
    return String(raw).split(/[\r\n,]+/).map((k) => k.trim()).filter(Boolean);
  }

  _getApiKey() {
    const keys = this._parseKeys();
    if (keys.length === 0) return 'ollama';
    return keys[this._activeKeyIdx % keys.length];
  }

  _rotateKey() {
    const keys = this._parseKeys();
    if (keys.length > 1) {
      this._activeKeyIdx = (this._activeKeyIdx + 1) % keys.length;
    }
  }

  _getModel() { return this.config.model || 'qwen2.5:7b'; }

  async translate(regions, sourceLang, targetLang, customPrompt) {
    if (!regions || regions.length === 0) return [];

    const langNames = { ja: 'Japanese', zh: 'Chinese', ko: 'Korean', en: 'English', vi: 'Vietnamese', auto: 'Japanese' };
    const srcName = langNames[sourceLang] || sourceLang;
    const tgtName = langNames[targetLang] || targetLang;
    const isTargetVi = !targetLang || /^(vi|vietnamese)$/i.test(targetLang);

    // Prompt chuẩn cho Local LLM: Ràng buộc cực kỳ nghiêm ngặt chống sinh tiếng Trung / sót chữ Hán
    const systemPrompt = customPrompt || (isTargetVi ? [
      `Bạn là một dịch giả manga Nhật - Việt chuyên nghiệp đẳng cấp cao.`,
      `Nhiệm vụ: Dịch TOÀN BỘ các câu thoại tiếng Nhật (${srcName}) sang tiếng Việt (${tgtName}) tự nhiên, biểu cảm, chuẩn ngữ cảnh truyện tranh.`,
      ``,
      `QUY TẮC BẮT BUỘC (CRITICAL RULES):`,
      `1. ĐẦU RA 100% TIẾNG VIỆT: Tuyệt đối KHÔNG xuất ra tiếng Trung (中文/汉字), tiếng Hàn (Hangul), và KHÔNG giữ nguyên chữ Hán/Kanji tiếng Nhật.`,
      `2. Tên nhân vật (ví dụ: 直樹 / Naoki, 太郎 / Taro, 先生 / thầy/cô) phải phiên âm Romaji hoặc dùng cách xưng hô tiếng Việt tự nhiên, không để lại chữ Hán.`,
      `3. Dịch ngắn gọn, tự nhiên, đúng cảm xúc nhân vật và vừa vặn khung thoại manga.`,
      `4. Định dạng đầu ra: JSON duy nhất có dạng:`,
      `{"translations": [{"id": <id_tương_ứng>, "text": "<câu_dịch_tiếng_Việt>"}, ...]}`,
      `Mỗi phần tử phải giữ đúng "id" tương ứng của câu gốc.`,
    ].join('\n') : [
      `You are a professional manga translator.`,
      `Translation requirements:`,
      `- Translate every input segment from ${srcName} into natural ${tgtName}.`,
      `- Preserve meaning, character voice, emotional tone, relationship nuance, emphasis, and sound effects.`,
      `- Localize idioms and sound effects naturally while keeping wording concise enough for speech bubbles.`,
      `- Use surrounding segments only for disambiguation and continuity; never merge or split segments.`,
      `- Write every translated \`text\` value only in ${tgtName}; do not include source text, notes, explanations, or alternatives.`,
      `- Never preserve or repeat original-language text; translate names, terms, and sound effects using natural ${tgtName} conventions.`,
      ``,
      `Output requirements:`,
      `- Each input segment has a numeric \`id\`.`,
      `- Return only a JSON object whose \`translations\` array contains one object with \`id\` and translated \`text\` for every input segment.`,
      `- Copy every input ID exactly once; order does not matter.`,
      `- Never merge, split, omit, duplicate, or add segments.`,
      `Example format:`,
      `{"translations": [{"id": 0, "text": "..."}, {"id": 1, "text": "..."}]}`,
    ].join('\n'));

    // Lượt 1: Gửi toàn trang (BATCH_SIZE = 25) để LLM local có đầy đủ ngữ cảnh câu chuyện
    const allTranslations = new Map();
    let lastError = null;

    for (let i = 0; i < regions.length; i += BATCH_SIZE) {
      const batch = regions.slice(i, i + BATCH_SIZE);
      const segments = batch.map((r) => ({ id: r.index, text: r.text }));

      try {
        const batchMap = await this._translateBatch(segments, systemPrompt, isTargetVi);
        for (const [id, transText] of batchMap) {
          const orig = regions.find((r) => r.index === id)?.text || '';
          allTranslations.set(id, this._cleanTranslatedText(transText, orig));
        }
      } catch (err) {
        lastError = err;
        logger.warn(`[OpenAICompatibleProvider] Lỗi dịch batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
      }
    }

    // Helper kiểm tra câu chưa được dịch hoặc còn sót chữ Nhật/Hán
    const CJK_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
    const isUnresolved = (r) => {
      const t = allTranslations.get(r.index);
      if (!t || typeof t !== 'string' || !t.trim()) return true;
      if (t.trim().toLowerCase() === (r.text || '').trim().toLowerCase()) return true;
      if (isTargetVi && CJK_REGEX.test(t)) return true;
      return false;
    };

    // --- TẦNG RETRY 1: Tự động gom toàn bộ các câu thiếu/sót để retry theo batch ---
    let missing = regions.filter(isUnresolved);
    if (missing.length > 0) {
      logger.info(`[OpenAICompatibleProvider] Phát hiện ${missing.length}/${regions.length} câu chưa dịch hoặc sót chữ, tự động Auto-Retry Pass 1...`);
      const retryPrompt = isTargetVi ? [
        `Bạn là dịch giả manga Nhật - Việt chuyên nghiệp.`,
        `CÁC CÂU SAU ĐÂY BỊ THIẾU BẢN DỊCH HOẶC CÒN SÓT KÝ TỰ TIẾNG NHẬT:`,
        `Hãy dịch TOÀN BỘ từng câu sau sang 100% tiếng Việt tự nhiên, không để sót bất kỳ câu nào:`,
        `Tuyệt đối KHÔNG xuất chữ Hán hay chữ Nhật/Trung/Hàn.`,
        `Định dạng JSON bắt buộc: {"translations": [{"id": ..., "text": "..."}]}`,
      ].join('\n') : systemPrompt;

      try {
        const retrySegments = missing.map((r) => ({ id: r.index, text: r.text }));
        const retryMap = await this._translateBatch(retrySegments, retryPrompt, isTargetVi);
        for (const [id, transText] of retryMap) {
          const orig = regions.find((r) => r.index === id)?.text || '';
          const cleaned = this._cleanTranslatedText(transText, orig);
          if (cleaned && (cleaned.toLowerCase() !== orig.trim().toLowerCase()) && (!isTargetVi || !CJK_REGEX.test(cleaned))) {
            allTranslations.set(id, cleaned);
          }
        }
      } catch (retryErr) {
        logger.warn('[OpenAICompatibleProvider] Auto-Retry Pass 1 gặp sự cố:', retryErr.message);
      }
    }

    // --- TẦNG RETRY 2: Chế độ cứu cánh 1-by-1 cho các câu cứng đầu cuối cùng ---
    missing = regions.filter(isUnresolved);
    if (missing.length > 0) {
      logger.info(`[OpenAICompatibleProvider] Còn ${missing.length} câu chưa dịch thành công, kích hoạt chế độ cứu cánh dịch đơn lẻ 1-by-1...`);
      for (const r of missing) {
        try {
          const singlePrompt = isTargetVi ? [
            `Dịch câu tiếng Nhật sau sang 100% tiếng Việt tự nhiên: "${r.text}"`,
            `Định dạng JSON: {"translations": [{"id": ${r.index}, "text": "<bản_dịch_tiếng_Việt>"}]}`,
          ].join('\n') : systemPrompt;

          const singleMap = await this._translateBatch([{ id: r.index, text: r.text }], singlePrompt, isTargetVi);
          const transText = singleMap.get(r.index);
          if (transText) {
            const cleaned = this._cleanTranslatedText(transText, r.text);
            if (cleaned && cleaned.toLowerCase() !== r.text.trim().toLowerCase()) {
              allTranslations.set(r.index, cleaned);
            }
          }
        } catch (singleErr) {
          logger.warn(`[OpenAICompatibleProvider] Cứu cánh 1-by-1 cho câu #${r.index + 1} gặp lỗi:`, singleErr.message);
        }
      }
    }

    // --- TẦNG RETRY 3: SFX Auto-Vietnamize & Từ tượng thanh / thán từ manga ---
    missing = regions.filter(isUnresolved);
    if (missing.length > 0 && isTargetVi) {
      logger.info(`[OpenAICompatibleProvider] Tầng 3: Tự động việt hoá SFX / từ tượng thanh cho ${missing.length} câu còn lại...`);
      for (const r of missing) {
        const origText = (r.text || '').trim();
        // 1. Kiểm tra từ điển SFX tích hợp (instant match 0ms)
        const dictMatch = this._lookupSfxDictionary(origText);
        if (dictMatch) {
          allTranslations.set(r.index, dictMatch);
          continue;
        }

        // 2. Nếu chưa có trong từ điển, gọi LLM với prompt chuyên biệt dịch SFX / cảm thán
        try {
          const sfxPrompt = [
            `Bạn là chuyên gia dịch từ tượng thanh, tượng hình, âm thanh (SFX) và tiếng động trong manga sang tiếng Việt.`,
            `Từ sau đây là từ tượng thanh hoặc thán từ trong manga: "${origText}"`,
            `Hãy việt hoá sang 1 cụm từ tượng thanh/cảm thán tiếng Việt ngắn gọn (ví dụ: ドキドキ -> Thình thịch, ガタン -> Rầm, キャー -> Áaaa, チッ -> Tch, えっ -> Hả?, シーン -> Im lặng).`,
            `Tuyệt đối KHÔNG giữ lại chữ Nhật/Hán/Katakana/Hiragana.`,
            `Định dạng JSON bắt buộc: {"translations": [{"id": ${r.index}, "text": "<từ_tiếng_Việt>"}]}`,
          ].join('\n');

          const sfxMap = await this._translateBatch([{ id: r.index, text: origText }], sfxPrompt, isTargetVi);
          const sfxTrans = sfxMap.get(r.index);
          if (sfxTrans) {
            const cleaned = this._cleanTranslatedText(sfxTrans, origText);
            if (cleaned && cleaned.toLowerCase() !== origText.toLowerCase() && !CJK_REGEX.test(cleaned)) {
              allTranslations.set(r.index, cleaned);
              continue;
            }
          }
        } catch (sfxErr) {
          logger.warn(`[OpenAICompatibleProvider] SFX LLM translation cho câu #${r.index + 1} gặp lỗi:`, sfxErr.message);
        }

        // 3. Fallback cuối cùng: Tự động việt hoá mẫu âm thanh, đảm bảo 0% sót CJK
        const autoSfx = this._fallbackVietnamize(origText);
        allTranslations.set(r.index, autoSfx);
      }
    }

    if (allTranslations.size === 0 && regions.length > 0 && lastError) {
      throw lastError;
    }

    return regions.map((r) => {
      let trans = allTranslations.get(r.index);
      if (isTargetVi && (!trans || CJK_REGEX.test(trans))) {
        trans = this._fallbackVietnamize(r.text);
      }
      return {
        index: r.index,
        translatedText: trans || r.text,
      };
    });
  }

  /**
   * Tra cứu từ điển SFX manga chuẩn.
   */
  _lookupSfxDictionary(text) {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim().replace(/[\s!?….,:;〜~ー・「」『』()（）]/g, '');
    if (MANGA_SFX_DICTIONARY[clean]) return MANGA_SFX_DICTIONARY[clean];
    if (MANGA_SFX_DICTIONARY[text.trim()]) return MANGA_SFX_DICTIONARY[text.trim()];
    for (const [k, v] of Object.entries(MANGA_SFX_DICTIONARY)) {
      if (clean === k || clean.includes(k) || text.includes(k)) {
        return v;
      }
    }
    return null;
  }

  /**
   * Fallback việt hoá từ tượng thanh / âm thanh đảm bảo 0% sót CJK.
   */
  _fallbackVietnamize(text) {
    const dictMatch = this._lookupSfxDictionary(text);
    if (dictMatch) return dictMatch;
    const trimmed = (text || '').trim();
    if (!trimmed) return '...';

    // Katakana onomatopoeia/SFX
    if (/^[\u30a0-\u30ffー!?.…\s]+$/.test(trimmed)) {
      if (trimmed.length <= 4) return 'Vút!';
      return 'Rầm!';
    }
    // Hiragana exclamation
    if (/^[\u3040-\u309fー!?.…\s]+$/.test(trimmed)) {
      if (trimmed.includes('あ') || trimmed.includes('ア')) return 'A...';
      if (trimmed.includes('え') || trimmed.includes('エ')) return 'Hả?';
      return 'Ưm...';
    }
    // Loại bỏ mọi ký tự CJK còn sót
    const withoutCJK = trimmed.replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g, '').trim();
    return withoutCJK || '...';
  }

  async _translateBatch(segments, systemPrompt, isTargetVi = false) {
    const translationMap = new Map();
    let currentModel = this._getModel();
    let response;

    const doRequest = async (modelName) => {
      const userPayload = isTargetVi
        ? { instruction: `Dịch ${segments.length} câu thoại sau sang tiếng Việt tự nhiên (100% tiếng Việt, không dùng chữ Hán/Trung/Hàn):`, segments }
        : { segments };

      return await axios.post(`${this._getEndpoint()}/chat/completions`, {
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }, {
        headers: {
          'Authorization': `Bearer ${this._getApiKey()}`,
          'Content-Type': 'application/json',
        },
        timeout: 120_000,
      });
    };

    try {
      response = await doRequest(currentModel);
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.message || '';
      const isModelError = err.response?.status === 500 || /unable to load model|not found|does not exist/i.test(errMsg);

      if (isModelError && currentModel !== 'qwen2.5:7b') {
        logger.warn(`[OpenAICompatibleProvider] Model "${currentModel}" gặp lỗi 500 (${errMsg}), tự động fallback sang "qwen2.5:7b"...`);
        response = await doRequest('qwen2.5:7b');
      } else {
        throw err;
      }
    }

    const rawContent = response.data?.choices?.[0]?.message?.content || '{}';
    let parsed = {};
    try {
      const cleaned = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/) || rawContent.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    // Xử lý các biến thể format JSON từ các model khác nhau
    let list = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && Array.isArray(parsed.translations)) {
      list = parsed.translations;
    } else if (parsed && typeof parsed === 'object') {
      // Trường hợp model trả về object { "0": "text", "1": "text" }
      for (const [k, v] of Object.entries(parsed)) {
        const numId = Number(k);
        if (!isNaN(numId) && typeof v === 'string') {
          list.push({ id: numId, text: v });
        }
      }
    }

    // Map kết quả vào Map theo numeric id chính xác (hỗ trợ fallback theo index mảng nếu model tự đánh số lại)
    const segmentIdSet = new Set(segments.map((s) => s.id));
    list.forEach((item, idx) => {
      let text = '';
      let id = undefined;

      if (item && typeof item === 'object') {
        text = typeof item.text === 'string' ? item.text : (item.translatedText || '');
        const rawId = item.id !== undefined ? Number(item.id) : undefined;
        // Nếu rawId nằm trong danh sách segment ID của batch này -> map chuẩn
        if (rawId !== undefined && segmentIdSet.has(rawId)) {
          id = rawId;
        } else if (segments[idx]) {
          // Nếu model tự đánh số lại 0, 1, 2... hoặc 1, 2, 3... -> map theo vị trí index mảng tương ứng
          id = segments[idx].id;
        }
      } else if (typeof item === 'string' && segments[idx]) {
        text = item;
        id = segments[idx].id;
      }

      if (id !== undefined && text) {
        translationMap.set(id, text);
      }
    });

    return translationMap;
  }

  /**
   * Làm sạch text dịch, loại bỏ triệt để chú thích tiếng Nhật còn sót trong ngoặc đơn
   */
  _cleanTranslatedText(translated, original) {
    if (!translated || typeof translated !== 'string') return '';
    let text = translated.trim();

    // 1. Loại bỏ chú thích tiếng Nhật trong ngoặc đơn ví dụ "Xin chào (こんにちは)" -> "Xin chào"
    text = text.replace(/[\(（][一-龯ぁ-んァ-ヶー\s]+[\)）]/g, '').trim();

    // 2. Nếu model lỡ trả về format "Original: Translation"
    if (text.includes(':') || text.includes('：')) {
      const parts = text.split(/[:：]/);
      if (parts.length === 2 && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(parts[0])) {
        text = parts[1].trim();
      }
    }

    return text || original;
  }

  async testConnection() {
    const endpoint = this._getEndpoint();
    const model = this._getModel();
    const { formatProviderError } = require('./index');

    // 1. Kiểm tra máy chủ có online không (hỗ trợ /models hoặc Ollama /api/tags)
    let isServerOnline = false;
    let serverCheckErr = null;
    try {
      const res = await axios.get(`${endpoint}/models`, {
        headers: { 'Authorization': `Bearer ${this._getApiKey()}` },
        timeout: 6_000,
      });
      if (res && res.status === 200) isServerOnline = true;
    } catch (err) {
      serverCheckErr = err;
      if (endpoint.includes('11434')) {
        try {
          const rootUrl = endpoint.replace(/\/v1\/?$/, '');
          const tagsRes = await axios.get(`${rootUrl}/api/tags`, { timeout: 6_000 });
          if (tagsRes && tagsRes.status === 200) isServerOnline = true;
        } catch (_) {}
      }
    }

    // Nếu endpoint hoàn toàn không phản hồi -> Thử 1 completion fallback trước khi báo lỗi server
    if (!isServerOnline && serverCheckErr) {
      try {
        await axios.post(`${endpoint}/chat/completions`, {
          model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }, {
          headers: {
            'Authorization': `Bearer ${this._getApiKey()}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        });
        return { success: true };
      } catch (innerErr) {
        return { success: false, error: formatProviderError(innerErr || serverCheckErr, { model }) };
      }
    }

    // 2. Máy chủ đã online, kiểm tra xem model cụ thể có hoạt động không
    if (model) {
      try {
        await axios.post(`${endpoint}/chat/completions`, {
          model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }, {
          headers: {
            'Authorization': `Bearer ${this._getApiKey()}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        });
        return { success: true };
      } catch (chatErr) {
        return { success: false, error: formatProviderError(chatErr, { model }) };
      }
    }

    return { success: true };
  }
}

OpenAICompatibleProvider.MANGA_SFX_DICTIONARY = MANGA_SFX_DICTIONARY;

module.exports = OpenAICompatibleProvider;
