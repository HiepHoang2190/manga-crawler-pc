/**
 * Bảng thông tin hướng dẫn và gợi ý model chi tiết cho từng AI Provider.
 * Giúp người dùng hiểu rõ:
 * - Nên chọn model nào cho từng nhà cung cấp?
 * - Ưu thế: tốc độ, chất lượng văn phong dịch manga, chi phí / quota.
 * - Yêu cầu RAM / VRAM cho model Local (Ollama & LM Studio).
 */

export const PROVIDER_MODEL_GUIDES = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    badge: 'Cloud API',
    recommended: 'gemini-3.5-flash',
    note: 'Tối ưu vượt trội cho dịch truyện tranh manga nhờ cửa sổ ngữ cảnh cực lớn (1M tokens), xử lý tốt hội thoại nhiều nhân vật.',
    models: [
      {
        id: 'gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        badge: 'Khuyên dùng',
        highlight: true,
        tagType: 'primary',
        desc: 'Tốc độ cực nhanh, miễn phí (Free Tier). Lời thoại tiếng Việt mượt mà, phù hợp nhất cho dịch truyện tranh hàng ngày.',
      },
      {
        id: 'gemini-3.5-flash-lite',
        name: 'Gemini 3.5 Flash Lite',
        badge: 'Siêu nhẹ',
        tagType: 'cyan',
        desc: 'Bản siêu nhẹ, phản hồi nhanh nhất, tiết kiệm quota tối đa.',
      },
      {
        id: 'gemini-3.6-flash',
        name: 'Gemini 3.6 Flash',
        badge: 'Chất lượng cao',
        tagType: 'emerald',
        desc: 'Bản nâng cao chất lượng dịch ngữ cảnh phức tạp và lời thoại manga.',
      },
      {
        id: 'gemini-flash-lite-latest',
        name: 'Gemini Flash-Lite Latest',
        badge: 'Tự động cập nhật',
        tagType: 'amber',
        desc: 'Luôn tự động trỏ đến phiên bản Flash Lite mới nhất của Google.',
      },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    badge: 'Cloud API',
    recommended: 'gpt-4o',
    note: 'Chuẩn mực AI toàn cầu về khả năng nắm bắt giọng điệu nhân vật, sắc thái cảm xúc và bối cảnh truyện tranh.',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o (Omni)',
        badge: 'Khuyên dùng',
        highlight: true,
        tagType: 'primary',
        desc: 'Model thông minh và toàn diện nhất của OpenAI. Dịch lời thoại tiếng Á sang tiếng Việt cực kỳ tự nhiên và chuẩn xác.',
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        badge: 'Nhanh & Tiết kiệm',
        tagType: 'emerald',
        desc: 'Chi phí cực rẻ (bằng 1/15 so với GPT-4o) nhưng vẫn giữ chất lượng dịch rất tốt, lý tưởng để dịch hàng loạt chương.',
      },
      {
        id: 'o3-mini',
        name: 'o3-mini (Reasoning)',
        badge: 'Suy luận cao',
        tagType: 'amber',
        desc: 'Tập trung suy luận logic từng bước, xử lý hoàn hảo các bộ truyện có cốt truyện lắt léo hoặc nhiều thuật ngữ khó.',
      },
    ],
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    badge: 'Cloud API',
    recommended: 'claude-3-7-sonnet',
    note: 'Nổi tiếng nhất thế giới về chất văn học, câu từ chau chuốt, mượt mà và tự nhiên như người dịch bản địa.',
    models: [
      {
        id: 'claude-3-7-sonnet',
        name: 'Claude 3.7 Sonnet',
        badge: 'Khuyên dùng',
        highlight: true,
        tagType: 'primary',
        desc: 'Model kết hợp suy luận Hybrid Reasoning thế hệ mới nhất của Anthropic. Văn phong dịch thuật đỉnh cao nhất, tự nhiên như người bản xứ.',
      },
      {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        badge: 'Chất lượng cao',
        tagType: 'emerald',
        desc: 'Văn phong dịch thuật xuất sắc, diễn đạt sắc thái nhân vật sống động, chau chuốt và mượt mà.',
      },
      {
        id: 'claude-3-5-haiku',
        name: 'Claude 3.5 Haiku',
        badge: 'Siêu tốc độ',
        tagType: 'cyan',
        desc: 'Tốc độ phản hồi cực nhanh, chi phí thấp, rất thích hợp cho nhu cầu dịch truyện tốc độ cao.',
      },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    badge: 'Cloud API',
    recommended: 'deepseek-chat',
    note: 'Hiểu rất sâu sắc văn hóa phương Đông (Trung/Nhật/Hàn) với chi phí token rẻ nhất thị trường hiện nay.',
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek-V3 (Chat)',
        badge: 'Khuyên dùng',
        highlight: true,
        tagType: 'primary',
        desc: 'Chi phí siêu rẻ (~$0.14/1M token), dịch các bộ truyện Manhua/Manga/Manhwa sang tiếng Việt rất trôi chảy và chuẩn xác.',
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek-R1 (Reasoner)',
        badge: 'Suy luận sâu',
        tagType: 'amber',
        desc: 'Mô hình tư duy chuyên sâu, giải mã chuẩn xác các điển tích, thành ngữ, văn phong kiếm hiệp, cổ trang tối nghĩa.',
      },
    ],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    badge: 'Router',
    recommended: 'google/gemini-2.5-flash',
    note: 'Cổng định tuyến đa nền tảng kết nối hàng trăm mô hình AI khác nhau, hỗ trợ nhiều model hoàn toàn miễn phí (:free).',
    models: [
      {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        badge: 'Khuyên dùng',
        highlight: true,
        tagType: 'primary',
        desc: 'Model thế hệ 2.5 tốc độ cao của Google qua OpenRouter, dịch tiếng Việt tự nhiên và hỗ trợ context lớn.',
      },
      {
        id: 'deepseek/deepseek-chat',
        name: 'DeepSeek V3',
        badge: 'Chất lượng cao',
        tagType: 'emerald',
        desc: 'Model DeepSeek V3 chính thức với chi phí rẻ và chất lượng bản dịch tuyệt vời.',
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct:free',
        name: 'Llama 3.3 70B (Free)',
        badge: 'Miễn phí',
        tagType: 'cyan',
        desc: 'Model mã nguồn mở 70B đỉnh cao của Meta, hoàn toàn miễn phí trên OpenRouter.',
      },
    ],
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local AI)',
    badge: 'Local Offline',
    recommended: 'qwen2.5:7b',
    note: 'Chạy 100% offline trên GPU/CPU máy tính của bạn. Hoàn toàn miễn phí, riêng tư và không cần kết nối Internet.',
    models: [
      {
        id: 'qwen2.5:7b',
        name: 'Qwen 2.5 7B Instruct',
        badge: 'Tốt nhất cho Manga',
        highlight: true,
        tagType: 'primary',
        desc: 'Model tốt nhất cho truyện tranh ở tầm 7B (~5GB RAM/VRAM). Đào tạo chuyên sâu trên lượng lớn dữ liệu tiếng Nhật, Trung, Hàn.',
      },
      {
        id: 'qwen2.5:1.5b',
        name: 'Qwen 2.5 1.5B',
        badge: 'Siêu nhẹ (~1.5GB)',
        tagType: 'cyan',
        desc: 'Dành cho máy tính yếu hoặc chỉ có CPU/RAM văn phòng, tốc độ dịch nhanh.',
      },
      {
        id: 'gemma4:12b',
        name: 'Gemma 4 12B Instruct',
        badge: 'Gemma 4 (~8GB)',
        tagType: 'emerald',
        desc: 'Model thế hệ mới từ Google, câu từ gãy gọn và dịch tốt các bộ manga tiếng Nhật & Anh.',
      },
      {
        id: 'gemma2:9b',
        name: 'Gemma 2 9B Instruct',
        badge: 'Google AI (~6GB)',
        tagType: 'amber',
        desc: 'Model mã nguồn mở hiện đại từ Google, câu từ gãy gọn, dịch tốt các bộ manga tiếng Nhật & Anh.',
      },
    ],
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    badge: 'Local Offline',
    recommended: 'qwen2.5-7b-instruct',
    note: 'Kết nối qua Local Server LM Studio (cổng 1234). Bạn có thể tải bất kỳ file mô hình GGUF nào từ giao diện LM Studio.',
    models: [
      {
        id: 'qwen2.5-7b-instruct',
        name: 'Qwen 2.5 7B GGUF',
        badge: 'Khuyên dùng',
        highlight: true,
        tagType: 'primary',
        desc: 'Model khuyên dùng để tải trong LM Studio. Hiểu Kanji và dịch ngữ cảnh manga rất tốt.',
      },
      {
        id: 'local-model',
        name: 'Model hiện hành (LM Studio)',
        badge: 'Đang nạp',
        tagType: 'cyan',
        desc: 'Tự động sử dụng mô hình đang được load sẵn trong LM Studio Server.',
      },
    ],
  },
  deepl: {
    id: 'deepl',
    name: 'DeepL Translate',
    badge: 'Dịch thuật chuyên dụng',
    isSpecial: true,
    note: 'DeepL Translate sử dụng mạng nơ-ron dịch thuật chuyên biệt độc quyền của DeepL (không cần chọn Model LLM). Hệ thống tự động tối ưu văn phong trơn tru và ngữ pháp tự nhiên. Bạn chỉ cần nhập API Key là sẵn sàng dịch.',
    models: [],
  },
};

/**
 * Metadata chuẩn hóa cho các mô hình Local LLM phổ biến khi cài đặt trong máy.
 * Dùng chung giữa Quick Switcher (Studio), Settings Panel và Providers Modal.
 */
export const PREDEFINED_LOCAL_MODEL_META = {
  'qwen2.5:7b': { name: 'Qwen 2.5 7B Instruct', badge: 'SOTA Manga' },
  'qwen2.5:1.5b': { name: 'Qwen 2.5 1.5B', badge: 'Siêu nhẹ' },
  'gemma4:12b': { name: 'Gemma 4 12B Instruct', badge: 'Gemma 4' },
  'gemma2:9b': { name: 'Gemma 2 9B Instruct', badge: 'Gemma 2' },
};
