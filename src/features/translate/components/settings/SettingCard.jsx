import React, { useState } from 'react';
import { useI18n } from '../../../../context/I18nContext';

/**
 * SettingCard — Component khung chứa tùy chọn cài đặt có thể thu gọn/mở rộng
 * Tuân thủ quy chuẩn thiết kế bo góc 2xl, header collapsible, theme-driven.
 */
export function SettingCard({
  icon,
  title,
  subtitle,
  badge,
  children,
  className = '',
  isOpen: propIsOpen,
  onToggle,
  defaultOpen = true,
  collapsible = true,
  extraHeaderActions,
}) {
  const { t } = useI18n();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = propIsOpen !== undefined ? propIsOpen : internalOpen;

  const handleToggle = () => {
    if (!collapsible) return;
    if (onToggle) {
      onToggle();
    } else {
      setInternalOpen((prev) => !prev);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-outline-variant/25 bg-surface-container-lowest transition-all duration-200 shadow-2xs ${className} ${isOpen ? 'p-3.5 sm:p-4 space-y-3' : 'p-3 sm:p-3.5'
        }`}
    >
      {(title || icon || badge || subtitle || extraHeaderActions || collapsible) && (
        <div
          onClick={handleToggle}
          role={collapsible ? 'button' : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={
            collapsible
              ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggle();
                }
              }
              : undefined
          }
          className={`flex flex-col gap-1 transition-colors ${isOpen ? 'pb-2.5 border-b border-outline-variant/15' : ''
            } ${collapsible ? 'cursor-pointer select-none group/header' : ''}`}
        >
          {/* Dòng 1: Icon + Title bên trái; Badge + Actions + Mũi tên thu gọn bên phải */}
          <div className="flex items-center justify-between gap-2 w-full min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {icon && (
                <span className="material-symbols-outlined text-primary text-[18px] shrink-0 transition-transform duration-200 group-hover/header:scale-110">
                  {icon}
                </span>
              )}
              {title && (
                <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider group-hover/header:text-primary transition-colors truncate">
                  {title}
                </h4>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {badge && (
                <div onClick={(e) => e.stopPropagation()} className="flex items-center shrink-0">
                  {badge}
                </div>
              )}
              {extraHeaderActions && (
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
                  {extraHeaderActions}
                </div>
              )}
              {collapsible && (
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-on-surface-variant group-hover/header:text-primary group-hover/header:bg-surface-container transition-all"
                  data-tooltip={isOpen ? (t('translate.settings.collapse') || 'Thu gọn') : (t('translate.settings.expand') || 'Mở rộng')}
                  aria-label={isOpen ? (t('translate.settings.collapse') || 'Thu gọn') : (t('translate.settings.expand') || 'Mở rộng')}
                >
                  <span
                    className="material-symbols-outlined text-[18px] transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  >
                    keyboard_arrow_down
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Dòng 2: Subtitle mô tả chi tiết */}
          {subtitle && (
            <p className={`text-[11px] text-on-surface-variant font-medium leading-relaxed ${icon ? 'pl-[26px]' : ''}`}>
              {subtitle}
            </p>
          )}
        </div>
      )}
      {isOpen && children}
    </div>
  );
}

export default SettingCard;

