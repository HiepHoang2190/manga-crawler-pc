import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../context/I18nContext";

/**
 * Chuông góc app: badge +N = số mục chưa đọc; bấm dòng = fetch + đánh dấu đã đọc.
 * Xóa = ẩn khỏi panel (đến khi có chương mới); đã đọc có nút đánh dấu unread.
 */
export default function FavoriteUpdateBell({
  items = [],
  onSelectFavorite,
  onMarkUnreadItem,
  onMarkAllRead,
  onRemoveItem,
  onRemoveAll,
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const unreadCount = useMemo(
    () => items.filter((x) => x._bellUnread).length,
    [items]
  );
  const hasAny = items.length > 0;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative flex items-center" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-tooltip={t("favorites.updateBell.title")}
        aria-label={t("favorites.updateBell.title")}
        aria-expanded={open}
        className={[
          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 cursor-pointer",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          unreadCount > 0
            ? "bg-primary-container/90 text-primary shadow-md shadow-primary/15 ring-2 ring-primary/35 hover:bg-primary-container hover:ring-primary/50"
            : "text-on-surface-variant/85 hover:bg-surface-container-high hover:text-on-surface",
        ].join(" ")}
      >
        <span
          className={[
            "material-symbols-outlined text-[22px] leading-none transition-transform duration-200",
            unreadCount > 0 ? "scale-105" : "",
            open ? "rotate-12" : "",
          ].join(" ")}
          style={
            unreadCount > 0
              ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }
              : undefined
          }
        >
          {unreadCount > 0 ? "notifications_active" : "notifications"}
        </span>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold leading-none text-on-error shadow-sm tabular-nums ring-2 ring-surface-container-high">
            +{unreadCount > 99 ? "99" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-[200] w-[min(22rem,calc(100vw-3rem))] max-h-[min(24rem,52vh)] overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-high/95 shadow-2xl backdrop-blur-sm"
          role="menu"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-outline-variant/20 px-3 py-2.5">
            <div className="min-w-0 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              {t("favorites.updateBell.heading")}
            </div>
            {hasAny ? (
              <div className="flex flex-wrap items-center justify-end gap-1">
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 cursor-pointer"
                    onClick={() => onMarkAllRead?.()}
                  >
                    {t("favorites.updateBell.markAllRead")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container-low hover:text-error cursor-pointer"
                  onClick={() => onRemoveAll?.()}
                >
                  {t("favorites.updateBell.removeAll")}
                </button>
              </div>
            ) : null}
          </div>
          <ul className="max-h-[min(19rem,42vh)] overflow-y-auto custom-scrollbar py-1">
            {!hasAny ? (
              <li className="px-3 py-6 text-center text-sm text-on-surface-variant">
                {t("favorites.updateBell.empty")}
              </li>
            ) : (
              items.map((item) => {
                const sync = item._sync;
                const unread = item._bellUnread;
                const pending =
                  sync?.hasNew && typeof sync.remoteCount === "number" ? sync.remoteCount : 0;
                return (
                  <li
                    key={item.id}
                    className={[
                      "group flex items-stretch border-b border-outline-variant/10 last:border-b-0",
                      unread ? "bg-primary/5" : "opacity-75",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className={[
                        "flex min-w-0 flex-1 flex-col gap-0.5 border-l-[3px] px-3 py-2.5 text-left text-sm transition-colors cursor-pointer",
                        unread
                          ? "border-primary text-on-surface hover:bg-surface-container-low"
                          : "border-transparent text-on-surface-variant hover:bg-surface-container-low/80",
                      ].join(" ")}
                      onClick={() => {
                        onSelectFavorite?.(item);
                      }}
                    >
                      <span
                        className={[
                          "leading-snug line-clamp-2",
                          unread ? "font-semibold text-on-surface" : "font-medium",
                        ].join(" ")}
                      >
                        {item.title}
                      </span>
                      {pending > 0 ? (
                        <span
                          className={[
                            "text-xs tabular-nums",
                            unread
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-on-surface-variant/90",
                          ].join(" ")}
                        >
                          {t("favorites.newChaptersPending", { n: pending })}
                        </span>
                      ) : null}
                    </button>
                    <div className="flex shrink-0 items-stretch">
                      {!unread ? (
                        <button
                          type="button"
                          className="flex w-9 items-center justify-center text-on-surface-variant opacity-80 transition-opacity hover:bg-surface-container-low hover:text-primary hover:opacity-100 cursor-pointer"
                          data-tooltip={t("favorites.updateBell.markUnreadAria")}
                          aria-label={t("favorites.updateBell.markUnreadAria")}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onMarkUnreadItem?.(item);
                          }}
                        >
                          <span className="material-symbols-outlined text-[20px] leading-none">mark_chat_unread</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="flex w-9 items-center justify-center text-on-surface-variant opacity-75 transition-opacity hover:bg-surface-container-low hover:text-error hover:opacity-100 cursor-pointer"
                        data-tooltip={t("favorites.updateBell.removeOneAria")}
                        aria-label={t("favorites.updateBell.removeOneAria")}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRemoveItem?.(item);
                        }}
                      >
                        <span className="material-symbols-outlined text-[20px] leading-none">close</span>
                      </button>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
