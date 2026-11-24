import React from 'react';

const FAV_MS_ICON_20 =
  "material-symbols-outlined leading-none shrink-0 block text-[20px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";
const FAV_MS_ICON_18 =
  "material-symbols-outlined leading-none shrink-0 block text-[18px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";

export function FavoriteNotifyBell({ active, onToggle, titleOn, titleOff, compact = false }) {
  const iconClass = compact ? FAV_MS_ICON_18 : FAV_MS_ICON_20;
  const box = compact ? 'h-8 w-8 rounded-lg border' : 'h-9 w-9 rounded-xl border shadow-md';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`inline-flex items-center justify-center ${box} shrink-0 transition-colors cursor-pointer ${
        active
          ? 'bg-primary/15 text-primary border-primary/35 hover:bg-primary/25'
          : 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20 hover:border-primary/40 hover:text-primary'
      }`}
      data-tooltip={active ? titleOn : titleOff}
      aria-label={active ? titleOn : titleOff}
      aria-pressed={active}
    >
      <span
        className={iconClass}
        style={
          active
            ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
            : undefined
        }
      >
        notifications
      </span>
    </button>
  );
}

export default FavoriteNotifyBell;
