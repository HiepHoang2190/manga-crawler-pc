/**
 * Helper chuẩn bị đồ thị Workflow cho các bộ truyện trong Hàng Đợi (Queue).
 * Tự động nhân bản đồ thị và nạp folderPath (thư mục truyện trên đĩa) cùng mangaTitle
 * vào node folder_trigger hoặc entry node tương thích.
 */

/**
 * Kiểm tra xem một Workflow có tương thích với luồng xử lý tự động sau khi tải truyện hay không.
 * Tương thích nếu workflow có node tiếp nhận thư mục ảnh cục bộ (folder_trigger hoặc entry node).
 *
 * @param {Object} workflow - Đối tượng workflow cần kiểm tra
 * @returns {boolean} true nếu tương thích, false nếu không
 */
export function isWorkflowCompatibleWithQueue(workflow) {
  if (!workflow || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    return false;
  }

  // 1. Có node folder_trigger tường minh
  if (workflow.nodes.some((n) => n?.type === 'folder_trigger')) {
    return true;
  }

  // 2. Có node với folderPath sẵn trong data
  if (workflow.nodes.some((n) => n?.data && typeof n.data === 'object' && 'folderPath' in n.data)) {
    return true;
  }

  // 3. Có trigger node khác (loại trừ manual_trigger chỉ nhận URL thủ công)
  if (
    workflow.nodes.some(
      (n) =>
        (n?.category === 'trigger' || (typeof n?.type === 'string' && n.type.endsWith('_trigger'))) &&
        n?.type !== 'manual_trigger'
    )
  ) {
    return true;
  }

  // 4. Có entry node (không có cạnh trỏ vào) tiếp nhận images_dir
  const targets = new Set(
    Array.isArray(workflow.edges) ? workflow.edges.map((e) => e?.target).filter(Boolean) : []
  );
  const entryNodes = workflow.nodes.filter((n) => n && !targets.has(n.id));
  const entryAcceptsImages = entryNodes.some((n) => {
    const type = n?.type || '';
    return (
      type.startsWith('export_') ||
      type === 'duplicate_cleaner' ||
      type === 'rename_folder' ||
      type === 'image_upscale' ||
      type === 'image_compress' ||
      type === 'deskew' ||
      type === 'split_double_page'
    );
  });

  return entryAcceptsImages;
}

/**
 * Chuẩn bị đồ thị Workflow để thực thi cho một bộ truyện trong Hàng đợi.
 * Deep clone đồ thị để không làm thay đổi workflow gốc trong bộ nhớ, sau đó
 * inject folderPath, mangaTitle và baseSaveDir vào node folder_trigger hoặc trigger/entry node.
 *
 * @param {Object} workflow - Định nghĩa workflow gốc
 * @param {Object} params - Tham số nạp vào workflow
 * @param {string} params.mangaDir - Đường dẫn thư mục truyện trên đĩa
 * @param {string} [params.mangaTitle] - Tên bộ truyện
 * @param {string} [params.baseSaveDir] - Thư mục gốc lưu trữ tải về
 * @returns {Object} Đồ thị workflow mới đã nạp tham số
 * @throws {Error} Nếu workflow không hợp lệ hoặc thiếu mảng nodes
 */
export function prepareQueueWorkflowGraph(workflow, { mangaDir, mangaTitle, baseSaveDir } = {}) {
  if (!workflow || !Array.isArray(workflow.nodes)) {
    throw new Error('Định nghĩa Workflow không hợp lệ');
  }

  // Deep clone đồ thị để tránh sửa đổi workflow gốc trong state
  const cloned = JSON.parse(JSON.stringify(workflow));

  const cleanMangaDir = String(mangaDir || '').trim();
  const cleanMangaTitle = String(mangaTitle || '').trim();
  const cleanBaseSaveDir =
    baseSaveDir !== undefined && baseSaveDir !== null ? String(baseSaveDir).trim() : null;

  let triggerFound = false;

  // Quét và cập nhật tất cả node folder_trigger nếu có
  cloned.nodes = cloned.nodes.map((node) => {
    if (node && node.type === 'folder_trigger') {
      triggerFound = true;
      const data = {
        ...(node.data || {}),
        folderPath: cleanMangaDir,
      };

      const resolvedTitle = cleanMangaTitle || node.data?.mangaTitle;
      if (resolvedTitle !== undefined) {
        data.mangaTitle = resolvedTitle;
      }

      if (cleanBaseSaveDir !== null) {
        data.baseSaveDir = cleanBaseSaveDir;
      }

      return {
        ...node,
        data,
      };
    }
    return node;
  });

  // Nếu không có folder_trigger, fallback tới trigger node đầu tiên hoặc entry node
  if (!triggerFound && cloned.nodes.length > 0) {
    const triggerIndex = cloned.nodes.findIndex(
      (n) => n && (n.category === 'trigger' || (typeof n.type === 'string' && n.type.endsWith('_trigger')))
    );

    let targetIndex = triggerIndex;
    if (targetIndex === -1) {
      // Fallback về entry node (node không có incoming edges)
      const targets = new Set(
        Array.isArray(cloned.edges) ? cloned.edges.map((e) => e && e.target).filter(Boolean) : []
      );
      const entryIndex = cloned.nodes.findIndex((n) => n && !targets.has(n.id));
      targetIndex = entryIndex !== -1 ? entryIndex : 0;
    }

    if (targetIndex !== -1 && cloned.nodes[targetIndex]) {
      const targetNode = cloned.nodes[targetIndex];
      const data = {
        ...(targetNode.data || {}),
        folderPath: cleanMangaDir,
      };

      const resolvedTitle = cleanMangaTitle || targetNode.data?.mangaTitle;
      if (resolvedTitle !== undefined) {
        data.mangaTitle = resolvedTitle;
      }

      if (cleanBaseSaveDir !== null) {
        data.baseSaveDir = cleanBaseSaveDir;
      }

      cloned.nodes[targetIndex] = {
        ...targetNode,
        data,
      };
    }
  }

  return cloned;
}
