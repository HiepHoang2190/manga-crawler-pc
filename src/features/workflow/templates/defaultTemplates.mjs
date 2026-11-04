/**
 * Pre-built Workflow Templates for common manga automation pipelines.
 */
export const DEFAULT_TEMPLATES = [
  {
    id: 'template_cbz_google_drive',
    name: 'Đóng gói CBZ ➔ Tải lên Google Drive',
    description: 'Tự động quét thư mục truyện trên máy, chuẩn hoá tên, lọc ảnh trùng/rác, nén thành tệp truyện CBZ và tự động đồng bộ lên Google Drive.',
    nodes: [
      {
        id: 'node_trigger',
        type: 'folder_trigger',
        x: 60,
        y: 100,
        data: { folderPath: '' },
      },
      {
        id: 'node_rename',
        type: 'rename_folder',
        x: 360,
        y: 260,
        data: {
          mode: 'autoNormalize',
          find: '',
          replace: '',
          pattern: '{manga} - Chap {chap_padded}',
          paddingLength: 3,
          removeSpecialChars: true,
        },
      },
      {
        id: 'node_cleaner',
        type: 'duplicate_cleaner',
        x: 660,
        y: 100,
        data: {
          minDuplicateCount: 3,
          similarityThreshold: 92,
          action: 'trash',
          recursive: true,
          folderPath: '',
        },
      },
      {
        id: 'node_cbz',
        type: 'export_cbz',
        x: 960,
        y: 260,
        data: {
          compressionLevel: 6,
          trashSourceAfterExport: true,
        },
      },
      {
        id: 'node_gdrive',
        type: 'upload_google_drive',
        x: 1260,
        y: 100,
        data: {
          uploadMode: 'desktop_sync',
          syncFolderPath: '',
          targetFolderId: '',
          deleteAfterUpload: true,
        },
      },
    ],
    edges: [
      {
        id: 'edge_1',
        source: 'node_trigger',
        sourceHandle: 'images_dir',
        target: 'node_rename',
        targetHandle: 'images_dir',
      },
      {
        id: 'edge_2',
        source: 'node_rename',
        sourceHandle: 'images_dir',
        target: 'node_cleaner',
        targetHandle: 'images_dir',
      },
      {
        id: 'edge_3',
        source: 'node_cleaner',
        sourceHandle: 'images_dir',
        target: 'node_cbz',
        targetHandle: 'images_dir',
      },
      {
        id: 'edge_4',
        source: 'node_cbz',
        sourceHandle: 'book_file',
        target: 'node_gdrive',
        targetHandle: 'book_file',
      },
    ],
  },
];
