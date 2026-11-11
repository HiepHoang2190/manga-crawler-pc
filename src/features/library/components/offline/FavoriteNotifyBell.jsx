import React from 'react';

const FAV_MS_ICON_20 =
  "material-symbols-outlined leading-none shrink-0 block text-[20px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";
const FAV_MS_ICON_18 =
  "material-symbols-outlined leading-none shrink-0 block text-[18px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";

export function FavoriteNotifyBell({ active, onToggle, titleOn, titleOff, compact = false }) {
  const iconClass = compact ? FAV_MS_ICON_18 : FAV_MS_ICON_20;
  const box = compact ? 'h-9 w-9' : 'w-10 h-10';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`inline-flex items-center justify-center ${box} shrink-0 rounded-full border shadow-lg transition-[filter] cursor-pointer ${
        active
          ? 'bg-primary/25 text-primary border-primary/40 ring-1 ring-primary/30'
          : 'bg-surface-container-high/95 text-on-surface-variant border-outline-variant/30'
      } hover:brightness-110`}
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

