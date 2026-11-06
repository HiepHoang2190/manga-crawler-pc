/**
 * Node Type Definitions & Port Configurations
 */

export const PORT_COLORS = {
  url: '#38bdf8', // Sky blue
  chapter_list: '#c084fc', // Purple
  images_dir: '#facc15', // Yellow
  book_file: '#fb923c', // Orange
  signal: '#4ade80', // Emerald green
  any: '#94a3b8', // Slate grey
};

export const PORT_TYPE_LABELS = {
  url: 'URL Truyện',
  chapter_list: 'Danh Sách Chapter',
  images_dir: 'Thư Mục Ảnh',
  book_file: 'Tệp Sách (CBZ/PDF)',
  signal: 'Tín Hiệu Kích Hoạt',
  any: 'Bất Kỳ',
};

export const NODE_DEFINITIONS = {
  manga_crawler: {
    type: 'manga_crawler',
    category: 'trigger',
    title: 'Tải Truyện Từ Web',
    icon: 'cloud_download',
    color: 'from-sky-500/20 to-blue-600/10 border-sky-500/40',
    description: 'Tự động nạp truyện từ URL, lọc chapter và tải hình ảnh về máy.',
    inputs: [],
    outputs: [{ id: 'images_dir', type: 'images_dir', label: 'Thư Mục Ảnh' }],
    defaultData: {
      defaultUrl: '',
      strategy: 'all',
      latestCount: 1,
      rangeValue: '',
      selectedChapterIds: [],
      outputBaseDir: '',
      concurrency: 3,
      retryLimit: 3,
    },
  },

  folder_trigger: {
    type: 'folder_trigger',
    category: 'trigger',
    title: 'Thư Mục Trên Máy',
    icon: 'folder_open',
    color: 'from-amber-500/20 to-amber-600/10 border-amber-500/40',
    description: 'Bắt đầu quy trình từ một thư mục truyện/ảnh có sẵn trên máy tính.',
    inputs: [],
    outputs: [
      { id: 'images_dir', type: 'images_dir', label: 'Thư Mục Ảnh' },
    ],
    defaultData: { folderPath: '' },
  },

  manual_trigger: {
    type: 'manual_trigger',
    category: 'trigger',
    title: 'Nhập URL Truyện',
    icon: 'link',
    color: 'from-blue-500/20 to-blue-600/10 border-blue-500/40',
    description: 'Bắt đầu quy trình bằng liên kết truyện tranh dán thủ công.',
    inputs: [],
    outputs: [{ id: 'url', type: 'url', label: 'URL Truyện' }],
    defaultData: { defaultUrl: '' },
    hidden: true,
  },

  chapter_selector: {
    type: 'chapter_selector',
    category: 'crawler',
    title: 'Bộ Lọc Chapter',
    icon: 'filter_list',
    color: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/40',
    description: 'Lọc danh sách chapter cần tải (tất cả, tự chọn thủ công, mới nhất, khoảng).',
    inputs: [{ id: 'url', type: 'url', label: 'URL' }],
    outputs: [{ id: 'chapter_list', type: 'chapter_list', label: 'Danh Sách Chapter' }],
    defaultData: { strategy: 'all', latestCount: 1, rangeValue: '', selectedChapterIds: [] },
    hidden: true,
  },

  downloader: {
    type: 'downloader',
    category: 'crawler',
    title: 'Tải Truyện Về Máy',
    icon: 'download',
    color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/40',
    description: 'Tải toàn bộ hình ảnh của các chapter vào thư mục cục bộ.',
    inputs: [{ id: 'chapter_list', type: 'chapter_list', label: 'Chapter List' }],
    outputs: [{ id: 'images_dir', type: 'images_dir', label: 'Thư Mục Ảnh' }],
    defaultData: { concurrency: 3, retryLimit: 3, outputBaseDir: '' },
    hidden: true,
  },

  duplicate_cleaner: {
    type: 'duplicate_cleaner',
    category: 'image',
    title: 'Lọc & Xoá Ảnh Trùng',
    icon: 'content_copy',
    color: 'from-amber-500/20 to-amber-600/10 border-amber-500/40',
    description: 'Tự động phát hiện ảnh bìa lặp, credit hoặc ảnh trùng và dọn vào Thùng rác.',
    inputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh' }],
    outputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Sạch' }],
    defaultData: { minDuplicateCount: 3, similarityThreshold: 92, action: 'trash', recursive: true, folderPath: '' },
  },

  split_double_page: {
    type: 'split_double_page',
    category: 'image',
    title: 'Cắt Đôi Trang Quét',
    icon: 'vertical_split',
    color: 'from-orange-500/20 to-orange-600/10 border-orange-500/40',
    description: 'Tự động chia trang đôi thành 2 trang đơn theo chiều đọc RTL/LTR.',
    inputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh' }],
    outputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Đã Cắt' }],
    defaultData: { readingDirection: 'rtl', aspectRatioThreshold: 1.25, backupOriginals: false },
  },

  deskew: {
    type: 'deskew',
    category: 'image',
    title: 'Làm Thẳng Trang Nghiêng',
    icon: 'straighten',
    color: 'from-teal-500/20 to-teal-600/10 border-teal-500/40',
    description: 'Phát hiện góc lệch khi scan và tự xoay thẳng lại từng trang.',
    inputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh' }],
    outputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Đã Nắn' }],
    defaultData: { maxAngle: 10, sensitivity: 'normal' },
  },

  rename_folder: {
    type: 'rename_folder',
    category: 'image',
    title: 'Đổi Tên Chuẩn Hóa',
    icon: 'drive_file_rename_outline',
    color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/40',
    description: 'Tự động chuẩn hoá tên thư mục chapter (padding số 001, 010, format chuẩn app).',
    inputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Cũ' }],
    outputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Mới' }],
    defaultData: { mode: 'autoNormalize', find: '', replace: '', pattern: '{manga} - Chap {chap_padded}', paddingLength: 3, removeSpecialChars: true },
  },

  image_upscale: {
    type: 'image_upscale',
    category: 'image',
    title: 'Phóng To Ảnh AI (Upscale)',
    icon: 'auto_fix_high',
    color: 'from-violet-500/20 to-purple-600/10 border-violet-500/40',
    description: 'Tự động nâng cao độ phân giải ảnh bằng các mô hình AI (MangaJaNai, waifu2x, Real-ESRGAN...).',
    inputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh' }],
    outputs: [
      { id: 'images_dir', type: 'images_dir', label: 'Folder Phóng To' },
    ],
    defaultData: {
      engine: 'mangajanai',
      model: 'mangajanai-2x-1600p',
      scale: 2,
      denoise: 3,
      inPlace: true,
      outputDir: '',
    },
  },

  image_compress: {
    type: 'image_compress',
    category: 'image',
    title: 'Tối Ưu & Nén Ảnh',
    icon: 'tune',
    color: 'from-sky-500/20 to-blue-600/10 border-sky-500/40',
    description: 'Đổi định dạng (JPG, WebP, PNG), nén chất lượng MozJPEG và thu nhỏ kích thước ảnh.',
    inputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh' }],
    outputs: [
      { id: 'images_dir', type: 'images_dir', label: 'Folder Đã Tối Ưu' },
    ],
    defaultData: {
      format: 'original',
      quality: 90,
      resizeEnabled: false,
      resizePercent: 80,
      inPlace: true,
      outputDir: '',
    },
  },

  translate: {
    type: 'translate',
    category: 'ai',
    title: 'Dịch AI Tiếng Việt',
    icon: 'translate',
    color: 'from-pink-500/20 to-pink-600/10 border-pink-500/40',
    description: 'Tự động nhận diện chữ, dịch thuật bằng AI và in đè chữ tiếng Việt.',
    inputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh' }],
    outputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Đã Dịch' }],
    defaultData: { sourceLang: 'ja', targetLang: 'vi', provider: 'gemini' },
  },

  export_cbz: {
    type: 'export_cbz',
    category: 'export',
    title: 'Đóng Gói CBZ',
    icon: 'archive',
    color: 'from-amber-600/20 to-amber-700/10 border-amber-600/40',
    description: 'Nén toàn bộ trang chapter thành tệp truyện nén chuẩn Comic Book .cbz.',
    inputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh' }],
    outputs: [
      { id: 'book_file', type: 'book_file', label: 'File CBZ' },
    ],
    defaultData: { packMode: 'singleVolume', maxMbPerFile: 200, rotateDoublePage: false, trashSourceAfterExport: false },
  },

  export_pdf: {
    type: 'export_pdf',
    category: 'export',
    title: 'Đóng Gói PDF',
    icon: 'picture_as_pdf',
    color: 'from-red-500/20 to-red-600/10 border-red-500/40',
    description: 'Xuất toàn bộ trang thành tệp sách PDF chất lượng cao.',
    inputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh' }],
    outputs: [
      { id: 'book_file', type: 'book_file', label: 'File PDF' },
    ],
    defaultData: { packMode: 'singleVolume', maxMbPerFile: 200, rotateDoublePage: false, pdfSeamless: false, trashSourceAfterExport: false },
  },

  export_epub: {
    type: 'export_epub',
    category: 'export',
    title: 'Đóng Gói EPUB',
    icon: 'menu_book',
    color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/40',
    description: 'Nén toàn bộ trang thành tệp sách điện tử chuẩn mở EPUB 3 (tương thích Kindle/e-reader).',
    inputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh' }],
    outputs: [
      { id: 'book_file', type: 'book_file', label: 'File EPUB' },
    ],
    defaultData: { packMode: 'singleVolume', maxMbPerFile: 200, quality: 95, rotateDoublePage: false, trashSourceAfterExport: false },
  },

  export_mobi: {
    type: 'export_mobi',
    category: 'export',
    title: 'Đóng Gói MOBI',
    icon: 'tablet_android',
    color: 'from-orange-500/20 to-orange-600/10 border-orange-500/40',
    description: 'Biên dịch toàn bộ trang thành tệp sách điện tử MOBI cho máy đọc sách Kindle.',
    inputs: [{ id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh' }],
    outputs: [
      { id: 'book_file', type: 'book_file', label: 'File MOBI' },
    ],
    defaultData: { packMode: 'singleVolume', maxMbPerFile: 200, rotateDoublePage: false, trashSourceAfterExport: false },
  },

  convert_book: {
    type: 'convert_book',
    category: 'export',
    title: 'Chuyển Đổi Sách',
    icon: 'sync_alt',
    color: 'from-teal-500/20 to-teal-600/10 border-teal-500/40',
    description: 'Chuyển đổi tệp sách qua lại giữa CBZ, PDF, EPUB, MOBI hoặc Trích xuất thư mục ảnh.',
    inputs: [{ id: 'book_file', type: 'book_file', label: 'File Sách' }],
    outputs: [
      { id: 'book_file', type: 'book_file', label: 'File Sách Mới' },
      { id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh' },
    ],
    defaultData: {
      targetFormat: 'epub',
      outputDir: '',
      rotateDoublePage: false,
    },
  },

  trash_cleanup: {
    type: 'trash_cleanup',
    category: 'delivery',
    title: 'Đưa Vào Thùng Rác',
    icon: 'delete_sweep',
    color: 'from-rose-500/20 to-rose-600/10 border-rose-500/40',
    description: 'Chuyển toàn bộ ảnh và thư mục đã tải vào Thùng rác (Recycle Bin) sau khi hoàn tất để giải phóng ổ cứng.',
    inputs: [
      { id: 'images_dir', type: 'images_dir', label: 'Folder Ảnh Tải' },
      { id: 'signal', type: 'signal', label: 'Tín Hiệu' },
    ],
    outputs: [
      { id: 'signal', type: 'signal', label: 'Đã Dọn Dẹp' },
      { id: 'book_file', type: 'book_file', label: 'File Sách' },
    ],
    defaultData: { preserveBookFiles: true, targetDir: '' },
  },

  send_to_kindle: {
    type: 'send_to_kindle',
    category: 'delivery',
    title: 'Gửi Đến Kindle',
    icon: 'tablet_android',
    color: 'from-violet-500/20 to-violet-600/10 border-violet-500/40',
    description: 'Tự động gửi tệp sách lên thiết bị Kindle qua tài khoản Amazon Send to Kindle.',
    inputs: [{ id: 'book_file', type: 'book_file', label: 'File Sách' }],
    outputs: [{ id: 'signal', type: 'signal', label: 'Đã Gửi' }],
    defaultData: { deleteAfterSend: false },
  },

  upload_google_drive: {
    type: 'upload_google_drive',
    category: 'delivery',
    title: 'Tải Lên Google Drive',
    icon: 'cloud_upload',
    color: 'from-blue-600/20 to-sky-600/10 border-blue-500/40',
    description: 'Tự động tải tệp sách (CBZ/PDF/EPUB) hoặc thư mục ảnh lên Google Drive (qua thư mục Google Drive Desktop hoặc qua REST API).',
    inputs: [
      { id: 'book_file', type: 'book_file', label: 'File Sách' },
      { id: 'images_dir', type: 'images_dir', label: 'Thư Mục' },
    ],
    outputs: [
      { id: 'signal', type: 'signal', label: 'Đã Tải Lên' },
      { id: 'book_file', type: 'book_file', label: 'File Sách' },
    ],
    defaultData: {
      uploadMode: 'desktop_sync', // 'desktop_sync' | 'api_token'
      syncFolderPath: '',
      targetFolderId: '',
      accessToken: '',
      deleteAfterUpload: false,
    },
  },
};
