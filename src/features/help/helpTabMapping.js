/**
 * Mapping từ tab/view ID → danh sách article ID trong helpArticles.
 * Dùng cho HelpGuideModal: khi user bấm icon ❓ trên tab, lookup ID ở đây
 * để biết render article nào.
 */
export const TAB_HELP_MAP = {
  /* ── Menu chính ── */
  home: [
    'overview',
    'sidebar',
    'mangaInfo',
    'chapters',
    'chapters-cover',
    'queue',
    'queue-management',
    'queue-progress',
    'history',
    'reader',
  ],
  toolsStudio: ['tools-studio', 'image-pipeline', 'rename-tab', 'duplicates', 'upscale'],
  ebookStudio: ['ebook-studio', 'cbz-export-tab', 'pdf-export', 'ebook-converter', 'ebook-tools', 'send-to-kindle'],
  dashboard: ['dashboard'],
  explore: ['explore', 'latest-updates', 'bulk-scan'],
  latestUpdates: ['latest-updates'],
  translate: ['translate-studio', 'translate-models'],
  workflow: ['workflow'],
  bulkScan: ['bulk-scan'],
  settings: ['settings', 'translate-models', 'site-cookie'],
  donate: ['donate'],
  plugins: ['plugins'],
  siteChecker: ['site-checker'],

  /* ── QueuePanel tabs ── */
  queue: ['queue', 'queue-management', 'queue-progress'],
  history: ['history'],
  favorites: ['favorites'],
  offlineRead: ['reader'],
  translate: ['translate-studio', 'translate-models'],
  cbzExport: ['cbz-export-tab'],
  pdfExport: ['pdf-export'],
  imageConvert: ['image-convert-tab'],
  imagePipeline: ['image-pipeline'],
  rename: ['rename-tab'],
  splitPage: ['split-page'],
  deskew: ['deskew'],
  cropImage: ['crop-image'],
  sendToKindle: ['send-to-kindle'],
  duplicates: ['duplicates'],
  upscale: ['upscale'],
};
