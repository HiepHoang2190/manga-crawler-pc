import React from 'react';

/**
 * EmptyState — Component hiển thị trạng thái rỗng chuẩn toàn ứng dụng (chuẩn RenameTab)
 * @param {string} icon - Tên icon Material Symbols
 * @param {string} title - Tiêu đề thông báo (text-sm)
 * @param {string} [description] - Mô tả chi tiết hoặc gợi ý hành động (text-xs)
 * @param {React.ReactNode} [action] - Nút bấm hoặc action phụ
 * @param {string} [className] - Class bổ sung cho wrapper
 */
export default function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
  className = '',
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-3 text-center select-none p-6 text-on-surface-variant/40 w-full h-full min-h-[220px] animate-in fade-in-50 duration-200 ${className}`}
    >
      <span className="material-symbols-outlined text-[48px] leading-none">
        {icon}
      </span>
      {title && (
        <p className="text-sm max-w-md leading-relaxed">
          {title}
        </p>
      )}
      {description && (
        <p className="text-xs max-w-sm leading-relaxed -mt-1">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
