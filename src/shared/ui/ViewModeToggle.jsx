import React from 'react';
import { useI18n } from '../../context/I18nContext';

/**
 * ViewModeToggle - Nút bấm Toggle đơn chuyển đổi qua lại giữa chế độ xem Lưới (grid) và Danh sách (list).
 *
 * @param {'grid' | 'list'} [viewMode='grid'] - Chế độ xem hiện tại
 * @param {(nextMode: 'grid' | 'list') => void} onChange - Callback khi người dùng bấm nút
 * @param {'sm' | 'md' | 'lg'} [size='md'] - Kích thước nút: sm (h-7 w-7), md (h-8 w-8), lg (h-11 w-11)
 * @param {boolean} [disabled=false] - Trạng thái vô hiệu hóa
 * @param {string} [className=''] - Class CSS bổ sung
 * @param {string} [tooltipGrid] - Tooltip tùy chỉnh khi chuyển sang dạng Lưới
 * @param {string} [tooltipList] - Tooltip tùy chỉnh khi chuyển sang dạng Danh sách
 */
export default function ViewModeToggle({
  viewMode = 'grid',
  onChange,
  size = 'md',
  disabled = false,
  className = '',
  tooltipGrid,
  tooltipList,
}) {
  const { t } = useI18n();

  const isGrid = viewMode === 'grid';
  const nextMode = isGrid ? 'list' : 'grid';

  const defaultTooltipList = t('common.viewList', t('favorites.viewList', 'Xem dạng danh sách'));
  const defaultTooltipGrid = t('common.viewGrid', t('favorites.viewGrid', 'Xem dạng lưới'));

  const tooltip = isGrid
    ? (tooltipList || defaultTooltipList)
    : (tooltipGrid || defaultTooltipGrid);

  const icon = isGrid ? 'view_list' : 'grid_view';

  const sizeClasses = {
    sm: 'h-7 w-7 rounded-lg',
    md: 'h-8 w-8 rounded-lg',
    lg: 'h-11 w-11 rounded-xl',
  }[size] || 'h-8 w-8 rounded-lg';

  const iconSizes = {
    sm: 'text-[16px]',
    md: 'text-[18px]',
    lg: 'text-[20px]',
  }[size] || 'text-[18px]';

  const handleClick = (e) => {
    e.preventDefault();
    if (disabled || !onChange) return;
    onChange(nextMode);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      data-tooltip={tooltip}
      aria-label={tooltip}
      aria-pressed={isGrid}
      className={`inline-flex shrink-0 items-center justify-center border border-outline-variant/20 bg-surface-container-highest/60 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-40 cursor-pointer ${sizeClasses} ${className}`}
    >
      <span className={`material-symbols-outlined leading-none ${iconSizes}`}>
        {icon}
      </span>
    </button>
  );
}

