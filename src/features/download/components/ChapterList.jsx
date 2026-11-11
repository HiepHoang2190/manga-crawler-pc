import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { compareChaptersForTitleSort, dedupeChaptersByUrl } from '../../../utils/chapterSort';
import { hasVolumeData, groupChaptersByVolume } from '../utils/chapterVolumeGrouping.js';
import { parseChapterTitleMetadata } from '../utils/chapterTitleParser.js';

function StatusBadge({ variant, label }) {
  const styles = {
    pending: 'bg-surface-container-highest text-on-surface-variant',
    queued: 'bg-secondary-container text-on-secondary-container',
    inProgress: 'bg-primary-container text-on-primary-container font-bold',
    completed: 'bg-green-900/40 text-green-300',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] ${styles[variant] || styles.pending}`}>
      {label}
    </span>
  );
}

/** `pick`: chỉ chọn chương (đọc trong app) — cùng bảng / sort / viền với drawer. */
export default function ChapterList({
  mode = 'default',
  chapters,
  queue = [],
  currentMangaUrl = '',
  selectedUrls,
  setSelectedUrls,
  onToggleChapter,
  onSelectAll,
  onUnselectAll,
  onAddSelectedToQueue,
  onReadChapter,
  /** Chương chưa có trên đĩa: đọc trong lúc tải (cần thư mục lưu). */
  onReadChapterOnline,
  /** false khi chưa đặt thư mục tải — ẩn nút đọc online. */
  readOnlineEnabled = true,
  /** null = đang tải danh sách chương đã tải (ẩn cột Đọc); Set = chỉ hiện icon Đọc khi URL ∈ Set; undefined = không lọc (mọi dòng có icon). */
  readChapterAllowedUrls = undefined,
  activeChapterUrl = '',
  onPickChapter,
  /** Reader: nút dọc cạnh «Chương có sẵn» để ẩn panel (chỉ khi mode pick). */
  onToggleReaderChapterPanel,
  /** Thay tiêu đề cột (vd. reader chỉ hiện chương đã tải). */
  titleOverride,
  /** Thông báo khi không có dòng nào (vd. chưa tải chương nào). */
  emptyListMessage,
  /** Ghi đè badge trạng thái (vd. export CBZ: mọi dòng đều là chương đã tải). */
  chapterStatusKeyOverride,
  /** Ẩn vùng gợi ý + nút «Thêm vào hàng đợi» (dùng footer tùy chỉnh bên ngoài). */
  hideQueueFooter = false,
  /** false khi drawer đã có tiêu đề riêng — tránh lặp «Chương có sẵn». */
  showSectionTitle = true,
}) {
  const { t } = useI18n();
  const isPick = mode === 'pick';
  /** null = giữ thứ tự từ API / nguồn; asc|desc = sort theo tiêu đề */
  const [titleSort, setTitleSort] = useState(null);
  const lastClickedIndexRef = useRef(null);
  const dragAnchorRef = useRef(null);
  const dragActiveRef = useRef(false);
  const lastDragIndexRef = useRef(null);
  const suppressNextRowClickRef = useRef(false);
  const dragJustEndedRef = useRef(false);

  const hasChapterSelection =
    selectedUrls instanceof Set ? selectedUrls.size > 0 : Boolean(selectedUrls?.size);

  /** Bỏ trùng URL (lỗi API); giữ nguyên thứ tự lần xuất hiện đầu.
   * Không dedup nếu các chapter có cùng URL nhưng title khác nhau (multi-source như dtvebook). */
  const chaptersForList = useMemo(() => {
    if (!Array.isArray(chapters)) return chapters;
    // Nếu có entries trùng URL nhưng title khác → giữ tất cả (multi-source)
    const urlCounts = new Map();
    for (const ch of chapters) {
      const u = String(ch?.url ?? '').trim();
      if (u) urlCounts.set(u, (urlCounts.get(u) || 0) + 1);
    }
    const hasDuplicateUrlWithDiffTitle = chapters.some((ch) => {
      const u = String(ch?.url ?? '').trim();
      return urlCounts.get(u) > 1;
    });
    if (hasDuplicateUrlWithDiffTitle) return chapters;
    return dedupeChaptersByUrl(chapters);
  }, [chapters]);

  /** Chỉ theo URL — đổi tiêu đề không reset sort; đổi truyện / fetch lại thì reset. */
  const chapterIdentityKey = useMemo(
    () => chaptersForList.map((c) => String(c.url ?? '')).join('\n'),
    [chaptersForList]
  );

  const sortedChapters = useMemo(() => {
    if (titleSort == null) return [...chaptersForList];
    const indexed = chaptersForList.map((ch, i) => ({ ch, i }));
    indexed.sort((a, b) => {
      const cmp = compareChaptersForTitleSort(a.ch, b.ch, a.i, b.i);
      return titleSort === 'asc' ? cmp : -cmp;
    });
    return indexed.map(({ ch }) => ch);
  }, [chaptersForList, titleSort]);

  /** Trạng thái từ hàng đợi (cùng mangaUrl với truyện đang fetch). */
  const statusByChapterUrl = useMemo(() => {
    const map = new Map();
    const mu = String(currentMangaUrl || '').trim();
    if (!mu) return map;
    const g = queue.find((x) => x.mangaUrl === mu);
    if (!g) return map;
    for (const ch of g.chapters) {
      map.set(ch.chapterUrl, ch.status);
    }
    return map;
  }, [queue, currentMangaUrl]);

  const rowStatusKey = (ch) => {
    if (chapterStatusKeyOverride) return chapterStatusKeyOverride;
    const st = statusByChapterUrl.get(ch.url);
    if (st === 'downloading') return 'inProgress';
    if (st === 'done') return 'completed';
    if (st === 'waiting') return 'queued';
    return 'pending';
  };

  useEffect(() => {
    lastClickedIndexRef.current = null;
  }, [chaptersForList]);

  useEffect(() => {
    setTitleSort(null);
  }, [chapterIdentityKey]);

  useEffect(() => {
    const onUp = () => {
      if (dragActiveRef.current) {
        suppressNextRowClickRef.current = true;
        dragJustEndedRef.current = true;
        if (lastDragIndexRef.current !== null) {
          lastClickedIndexRef.current = lastDragIndexRef.current;
        }
        setTimeout(() => {
          suppressNextRowClickRef.current = false;
          dragJustEndedRef.current = false;
        }, 0);
      }
      dragAnchorRef.current = null;
      dragActiveRef.current = false;
      lastDragIndexRef.current = null;
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  const rows = sortedChapters.map((ch, i) => ({
    ...ch,
    rowIndex: i,
    statusKey: rowStatusKey(ch),
  }));

  const hasVolumes = useMemo(() => hasVolumeData(sortedChapters), [sortedChapters]);
  const [collapsedVolumeKeys, setCollapsedVolumeKeys] = useState(() => new Set());

  const volumeGroups = useMemo(() => {
    if (!hasVolumes) return [];
    return groupChaptersByVolume(rows, { sortDirection: titleSort === 'desc' ? 'desc' : 'asc' });
  }, [hasVolumes, rows, titleSort]);

  const toggleVolumeCollapse = (key) => {
    setCollapsedVolumeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allVolumesCollapsed =
    volumeGroups.length > 0 && volumeGroups.every((g) => collapsedVolumeKeys.has(g.key));

  const toggleAllVolumes = () => {
    if (allVolumesCollapsed) {
      setCollapsedVolumeKeys(new Set());
    } else {
      setCollapsedVolumeKeys(new Set(volumeGroups.map((g) => g.key)));
    }
  };

  const toggleSelectVolume = (e, group) => {
    e.stopPropagation();
    if (typeof setSelectedUrls !== 'function') return;
    const urlsInGroup = group.chapters.map((c) => c.url);
    const allSelected = urlsInGroup.length > 0 && urlsInGroup.every((u) => selectedUrls?.has(u));
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const u of urlsInGroup) next.delete(u);
      } else {
        for (const u of urlsInGroup) next.add(u);
      }
      return next;
    });
  };

  const allInListSelected =
    chaptersForList.length > 0 && chaptersForList.every((c) => selectedUrls.has(c.url));

  const handleTitleHeaderClick = () => {
    setTitleSort((prev) => {
      if (prev == null) return 'asc';
      if (prev === 'asc') return 'desc';
      return null;
    });
  };

  const applyChapterSelection = (e, ch, displayIndex, { fromCheckbox }) => {
    if (isPick) return;
    if (suppressNextRowClickRef.current) {
      suppressNextRowClickRef.current = false;
      dragJustEndedRef.current = false;
      return;
    }
    if (fromCheckbox) e.preventDefault();
    if (e.shiftKey && lastClickedIndexRef.current !== null) {
      const from = Math.min(lastClickedIndexRef.current, displayIndex);
      const to = Math.max(lastClickedIndexRef.current, displayIndex);
      const urls = sortedChapters.slice(from, to + 1).map((c) => c.url);
      setSelectedUrls(new Set(urls));
    } else {
      onToggleChapter(ch.url);
    }
    lastClickedIndexRef.current = displayIndex;
  };

  const handleRowMouseDown = (e, i) => {
    if (isPick) return;
    if (e.button !== 0) return;
    dragAnchorRef.current = i;
    dragActiveRef.current = false;
    lastDragIndexRef.current = i;
  };

  const handleRowMouseEnter = (e, i) => {
    if (isPick) return;
    if (e.buttons !== 1 || dragAnchorRef.current === null) return;
    if (i !== dragAnchorRef.current) dragActiveRef.current = true;
    lastDragIndexRef.current = i;
    const from = Math.min(dragAnchorRef.current, i);
    const to = Math.max(dragAnchorRef.current, i);
    const urls = sortedChapters.slice(from, to + 1).map((c) => c.url);
    setSelectedUrls(new Set(urls));
  };

  const showChapterListHeader =
    showSectionTitle || (isPick && onToggleReaderChapterPanel);

  const colSpanPick = 1;
  /** Giống mobile: luôn có cột Đọc khi có callback (không ẩn vì Set rỗng / chưa xong filter). */
  const readColumnActive = typeof onReadChapter === 'function' && !isPick;
  const colSpanDefault = readColumnActive ? 4 : 3;

  /**
   * Giống mobile chapter_picker_sheet:
   * - chương đã có ảnh trên đĩa → đọc offline
   * - chương chưa có → stream (vừa tải vừa đọc)
   */
  const applyUnifiedReadChapter = useCallback(
    (ch) => {
      const url_string = String(ch?.url ?? '');
      const allowed_set = readChapterAllowedUrls;
      const has_online = typeof onReadChapterOnline === 'function';

      const has_local =
        allowed_set instanceof Set && allowed_set.has(url_string);

      if (has_local) {
        onReadChapter(ch);
        return;
      }

      if (has_online) {
        onReadChapterOnline(ch);
        return;
      }

      onReadChapter(ch);
    },
    [readChapterAllowedUrls, readOnlineEnabled, onReadChapter, onReadChapterOnline]
  );

  const renderChapterRow = (ch, i) => {
    const meta = parseChapterTitleMetadata(ch.title, ch.volume);
    const displayTitle = meta.cleanTitle || ch.title;
    const shortLabel = meta.chapterLabel
      ? meta.chapterLabel.replace(/^Chapter\s+/i, 'Ch. ')
      : '';
    const hasSeparateLabel = Boolean(
      shortLabel &&
      displayTitle &&
      displayTitle.toLowerCase().trim() !== meta.chapterLabel.toLowerCase().trim()
    );

    if (isPick) {
      const active = String(ch.url) === String(activeChapterUrl || '');
      return (
        <tr
          key={`${ch.url}__${i}`}
          onClick={() => onPickChapter?.(ch)}
          className={`cursor-pointer select-none transition-colors hover:bg-surface-container-high ${
            active
              ? 'bg-primary/10 font-semibold text-primary'
              : i % 2 !== 0
                ? 'bg-surface-container-low/50'
                : ''
          }`}
        >
          <td className="p-2 min-w-0 max-w-[min(100vw,24rem)]">
            <div className="flex min-w-0 items-center gap-1.5">
              {hasSeparateLabel ? (
                <>
                  <span className="shrink-0 text-xs font-bold text-primary">
                    {shortLabel}
                  </span>
                  <span
                    className="truncate text-xs font-medium text-on-surface"
                    data-tooltip={meta.groupName ? `${displayTitle} • ${meta.groupName}` : displayTitle}
                  >
                    {displayTitle}
                  </span>
                </>
              ) : (
                <span
                  className="truncate text-xs font-medium text-on-surface"
                  data-tooltip={meta.groupName ? `${displayTitle} • ${meta.groupName}` : displayTitle}
                >
                  {shortLabel || displayTitle}
                </span>
              )}
              {ch.url && currentMangaUrl.includes('dtv-ebook.com.vn') ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronAPI.openExternal(ch.url);
                  }}
                  className="flex shrink-0 items-center justify-center text-on-surface-variant/40 transition-colors hover:text-primary"
                  data-tooltip={t('chapterList.openExternal')}
                  aria-label={t('chapterList.openExternal')}
                >
                  <span className="material-symbols-outlined text-[14px] leading-none">open_in_new</span>
                </button>
              ) : null}
            </div>
          </td>
        </tr>
      );
    }

    return (
      <tr
        key={`${ch.url}__${i}`}
        onMouseDown={(e) => handleRowMouseDown(e, i)}
        onMouseEnter={(e) => handleRowMouseEnter(e, i)}
        onClick={(e) => applyChapterSelection(e, ch, i, { fromCheckbox: false })}
        className={`cursor-pointer select-none transition-colors hover:bg-surface-container-high ${
          i % 2 !== 0 ? 'bg-surface-container-low/50' : ''
        }`}
      >
        <td className="p-2">
          <input
            type="checkbox"
            data-testid="chapter-checkbox"
            checked={selectedUrls.has(ch.url)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              if (dragJustEndedRef.current) {
                dragJustEndedRef.current = false;
                e.preventDefault();
                return;
              }
              applyChapterSelection(e, ch, i, { fromCheckbox: true });
            }}
            className="rounded border-none bg-surface-container-highest"
          />
        </td>
        <td className="p-2 min-w-0 max-w-[340px]">
          <div className="flex min-w-0 items-center gap-1.5">
            {hasSeparateLabel ? (
              <>
                <span className="shrink-0 text-xs font-bold text-primary">
                  {shortLabel}
                </span>
                <span
                  className="truncate text-xs font-medium text-on-surface"
                  data-tooltip={meta.groupName ? `${displayTitle} • ${meta.groupName}` : displayTitle}
                >
                  {displayTitle}
                </span>
              </>
            ) : (
              <span
                className="truncate text-xs font-medium text-on-surface"
                data-tooltip={meta.groupName ? `${displayTitle} • ${meta.groupName}` : displayTitle}
              >
                {shortLabel || displayTitle}
              </span>
            )}
            {meta.groupName ? (
              <span
                className="hidden xl:inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-container-high text-on-surface-variant/80 border border-outline-variant/15"
                data-tooltip={meta.groupName}
              >
                <span className="material-symbols-outlined text-[12px] leading-none text-primary">group</span>
                <span className="max-w-[100px] truncate">{meta.groupName}</span>
              </span>
            ) : null}
            {ch.url && currentMangaUrl.includes('dtv-ebook.com.vn') ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.electronAPI.openExternal(ch.url);
                }}
                className="flex shrink-0 items-center justify-center text-on-surface-variant/40 transition-colors hover:text-primary"
                data-tooltip={t('chapterList.openExternal')}
                aria-label={t('chapterList.openExternal')}
              >
                <span className="material-symbols-outlined text-[14px] leading-none">open_in_new</span>
              </button>
            ) : null}
          </div>
        </td>
        <td className="p-2 text-right">
          <StatusBadge variant={ch.statusKey} label={t(`chapter.status.${ch.statusKey}`)} />
        </td>
        {readColumnActive ? (() => {
          const url_string = String(ch?.url ?? '');
          const has_local_file =
            readChapterAllowedUrls instanceof Set && readChapterAllowedUrls.has(url_string);
          const has_online = typeof onReadChapterOnline === 'function';
          const read_chapter_blocked = !has_local_file && !has_online;
          return (
            <td className="p-2 text-center pr-3 w-12">
              <button
                type="button"
                disabled={read_chapter_blocked}
                data-tooltip={
                  read_chapter_blocked
                    ? t('chapterList.readBlockedNeedSaveTo')
                    : t('chapterList.readChapter')
                }
                aria-label={t('chapterList.readChapter')}
                onClick={(e) => {
                  e.stopPropagation();
                  if (read_chapter_blocked) return;
                  applyUnifiedReadChapter(ch);
                }}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  read_chapter_blocked
                    ? 'border border-outline-variant/25 bg-surface-container-highest text-on-surface-variant'
                    : 'border border-primary/30 bg-primary/15 text-primary hover:bg-primary hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">auto_stories</span>
              </button>
            </td>
          );
        })() : null}
      </tr>
    );
  };

  /** Render item trong thẻ nhóm Volume (Phương án 2: Card Accordion thụt lề) */
  const renderCardChapterItem = (ch, i) => {
    const meta = parseChapterTitleMetadata(ch.title, ch.volume);
    const displayTitle = meta.cleanTitle || ch.title;
    const shortLabel = meta.chapterLabel
      ? meta.chapterLabel.replace(/^Chapter\s+/i, 'Ch. ')
      : '';
    const hasSeparateLabel = Boolean(
      shortLabel &&
      displayTitle &&
      displayTitle.toLowerCase().trim() !== meta.chapterLabel.toLowerCase().trim()
    );

    if (isPick) {
      const active = String(ch.url) === String(activeChapterUrl || '');
      return (
        <div
          key={`${ch.url}__${i}`}
          onClick={() => onPickChapter?.(ch)}
          className={`p-2.5 pl-6 flex items-center justify-between gap-2.5 cursor-pointer select-none transition-colors hover:bg-surface-container-high ${
            active
              ? 'bg-primary/10 font-semibold text-primary'
              : i % 2 !== 0
                ? 'bg-surface-container-low/40'
                : ''
          }`}
        >
          <div className="flex min-w-0 items-center gap-2 flex-1">
            {hasSeparateLabel ? (
              <>
                <span className="shrink-0 text-xs font-bold text-primary">
                  {shortLabel}
                </span>
                <span
                  className="truncate text-xs font-medium text-on-surface"
                  data-tooltip={meta.groupName ? `${displayTitle} • ${meta.groupName}` : displayTitle}
                >
                  {displayTitle}
                </span>
              </>
            ) : (
              <span
                className="truncate text-xs font-medium text-on-surface"
                data-tooltip={meta.groupName ? `${displayTitle} • ${meta.groupName}` : displayTitle}
              >
                {shortLabel || displayTitle}
              </span>
            )}
            {ch.url && currentMangaUrl.includes('dtv-ebook.com.vn') ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.electronAPI.openExternal(ch.url);
                }}
                className="flex shrink-0 items-center justify-center text-on-surface-variant/40 transition-colors hover:text-primary"
                data-tooltip={t('chapterList.openExternal')}
                aria-label={t('chapterList.openExternal')}
              >
                <span className="material-symbols-outlined text-[14px] leading-none">open_in_new</span>
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    const url_string = String(ch?.url ?? '');
    const has_local_file =
      readChapterAllowedUrls instanceof Set && readChapterAllowedUrls.has(url_string);
    const has_online = typeof onReadChapterOnline === 'function';
    const read_chapter_blocked = !has_local_file && !has_online;

    return (
      <div
        key={`${ch.url}__${i}`}
        onMouseDown={(e) => handleRowMouseDown(e, i)}
        onMouseEnter={(e) => handleRowMouseEnter(e, i)}
        onClick={(e) => applyChapterSelection(e, ch, i, { fromCheckbox: false })}
        className={`p-2.5 pl-6 flex items-center justify-between gap-2.5 cursor-pointer select-none transition-colors hover:bg-surface-container-high ${
          selectedUrls.has(ch.url) ? 'bg-primary/5' : i % 2 !== 0 ? 'bg-surface-container-low/40' : ''
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5 flex-1">
          <input
            type="checkbox"
            data-testid="chapter-checkbox"
            checked={selectedUrls.has(ch.url)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              if (dragJustEndedRef.current) {
                dragJustEndedRef.current = false;
                e.preventDefault();
                return;
              }
              applyChapterSelection(e, ch, i, { fromCheckbox: true });
            }}
            className="rounded border-none bg-surface-container-highest shrink-0"
          />
          {hasSeparateLabel ? (
            <>
              <span className="shrink-0 text-xs font-bold text-primary">
                {shortLabel}
              </span>
              <span
                className="truncate text-xs font-medium text-on-surface"
                data-tooltip={meta.groupName ? `${displayTitle} • ${meta.groupName}` : displayTitle}
              >
                {displayTitle}
              </span>
            </>
          ) : (
            <span
              className="truncate text-xs font-medium text-on-surface"
              data-tooltip={meta.groupName ? `${displayTitle} • ${meta.groupName}` : displayTitle}
            >
              {shortLabel || displayTitle}
            </span>
          )}
          {meta.groupName ? (
            <span
              className="hidden lg:inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-container-high text-on-surface-variant/80 border border-outline-variant/15"
              data-tooltip={meta.groupName}
            >
              <span className="material-symbols-outlined text-[12px] leading-none text-primary">group</span>
              <span className="max-w-[100px] truncate">{meta.groupName}</span>
            </span>
          ) : null}
          {ch.url && currentMangaUrl.includes('dtv-ebook.com.vn') ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.electronAPI.openExternal(ch.url);
              }}
              className="flex shrink-0 items-center justify-center text-on-surface-variant/40 transition-colors hover:text-primary"
              data-tooltip={t('chapterList.openExternal')}
              aria-label={t('chapterList.openExternal')}
            >
              <span className="material-symbols-outlined text-[14px] leading-none">open_in_new</span>
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge variant={ch.statusKey} label={t(`chapter.status.${ch.statusKey}`)} />
          {readColumnActive ? (
            <button
              type="button"
              disabled={read_chapter_blocked}
              data-tooltip={
                read_chapter_blocked
                  ? t('chapterList.readBlockedNeedSaveTo')
                  : t('chapterList.readChapter')
              }
              aria-label={t('chapterList.readChapter')}
              onClick={(e) => {
                e.stopPropagation();
                if (read_chapter_blocked) return;
                applyUnifiedReadChapter(ch);
              }}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                read_chapter_blocked
                  ? 'border border-outline-variant/25 bg-surface-container-highest text-on-surface-variant'
                  : 'border border-primary/30 bg-primary/15 text-primary hover:bg-primary hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] leading-none">auto_stories</span>
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
      {showChapterListHeader || hasVolumes ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {hasVolumes && !isPick ? (
              <input
                type="checkbox"
                data-testid="select-all-chapters-chk"
                checked={allInListSelected}
                onChange={() => (allInListSelected ? onUnselectAll() : onSelectAll())}
                className="rounded border-none bg-surface-container-highest cursor-pointer shrink-0"
                data-tooltip={allInListSelected ? t('chapterList.unselectAll') : t('chapterList.selectAll')}
                aria-label={allInListSelected ? t('chapterList.unselectAll') : t('chapterList.selectAll')}
              />
            ) : null}
            {showSectionTitle ? (
              <h3
                className={`text-sm font-bold text-on-surface ${
                  isPick && onToggleReaderChapterPanel ? 'min-w-0 flex-1 truncate' : ''
                }`}
              >
                {titleOverride ?? t('chapterList.title')}
              </h3>
            ) : (
              <div />
            )}
            {hasVolumes ? (
              <button
                type="button"
                onClick={handleTitleHeaderClick}
                className="inline-flex cursor-pointer select-none items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors ml-1"
                data-tooltip={
                  titleSort == null
                    ? t('chapterList.titleSortSource')
                    : titleSort === 'asc'
                      ? t('chapterList.titleSortAsc')
                      : t('chapterList.titleSortDesc')
                }
                aria-label={t('chapterList.column.title')}
              >
                <span className="material-symbols-outlined text-[16px] leading-none text-primary">
                  {titleSort == null ? 'swap_vert' : titleSort === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                </span>
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasVolumes ? (
              <button
                type="button"
                onClick={toggleAllVolumes}
                className="inline-flex cursor-pointer select-none items-center gap-1.5 px-2.5 py-1 rounded-lg border border-outline-variant/20 bg-surface-container-high/80 text-xs font-medium text-on-surface hover:text-primary hover:border-primary/40 hover:bg-surface-container-highest transition-colors shadow-xs"
                data-tooltip={
                  allVolumesCollapsed
                    ? t('chapterList.expandAllVolumes')
                    : t('chapterList.collapseAllVolumes')
                }
                aria-label={
                  allVolumesCollapsed
                    ? t('chapterList.expandAllVolumes')
                    : t('chapterList.collapseAllVolumes')
                }
              >
                <span className="material-symbols-outlined text-[16px] leading-none text-primary">
                  {allVolumesCollapsed ? 'unfold_more' : 'unfold_less'}
                </span>
                <span>
                  {allVolumesCollapsed
                    ? t('chapterList.expandAllVolumes')
                    : t('chapterList.collapseAllVolumes')}
                </span>
              </button>
            ) : null}

            {isPick && onToggleReaderChapterPanel ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleReaderChapterPanel(e);
                }}
                data-tooltip={t('reader.hideChapters')}
                aria-label={t('reader.hideChapters')}
                className="relative z-20 flex h-10 w-9 shrink-0 flex-col items-center justify-center rounded-lg border border-outline-variant/25 bg-surface-container-high text-primary shadow-sm hover:bg-surface-container-highest"
              >
                <span className="material-symbols-outlined pointer-events-none text-[22px] leading-none">
                  menu_open
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasVolumes ? (
        <div
          className={`min-h-0 flex-1 overflow-auto rounded-lg border border-outline-variant/10 bg-surface-container-low p-2.5 space-y-3 custom-scrollbar ${isPick ? 'min-h-[8rem]' : 'min-h-[12rem]'}`}
        >
          {volumeGroups.length === 0 ? (
            <div className="p-4 text-center text-xs text-on-surface-variant">
              {emptyListMessage ?? t('chapterList.fetchEmpty')}
            </div>
          ) : (
            volumeGroups.map((group) => {
              const isCollapsed = collapsedVolumeKeys.has(group.key);
              const groupChapterUrls = group.chapters.map((c) => c.url);
              const selectedCountInGroup =
                !isPick && selectedUrls instanceof Set
                  ? groupChapterUrls.filter((u) => selectedUrls.has(u)).length
                  : 0;
              const downloadedCountInGroup =
                readChapterAllowedUrls instanceof Set
                  ? groupChapterUrls.filter((u) => readChapterAllowedUrls.has(u)).length
                  : 0;
              const allInGroupSelected =
                groupChapterUrls.length > 0 && selectedCountInGroup === groupChapterUrls.length;
              const isGroupIndeterminate =
                selectedCountInGroup > 0 && !allInGroupSelected;
              const volumeTitle =
                group.volume === null
                  ? t('chapterList.noVolumeHeader')
                  : t('chapterList.volumeHeader', { volume: group.volume });

              return (
                <div
                  key={group.key}
                  className="border border-outline-variant/20 rounded-xl overflow-hidden bg-surface-container-low/40 shadow-xs"
                >
                  {/* Volume Card Header */}
                  <div
                    onClick={() => toggleVolumeCollapse(group.key)}
                    className="p-2.5 bg-surface-container-high/90 hover:bg-surface-container-highest cursor-pointer select-none flex items-center justify-between border-b border-outline-variant/15 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {!isPick ? (
                        <input
                          type="checkbox"
                          data-testid={`volume-checkbox-${group.key}`}
                          checked={allInGroupSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = isGroupIndeterminate;
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => toggleSelectVolume(e, group)}
                          data-tooltip={t('chapterList.selectVolumeAll')}
                          aria-label={t('chapterList.selectVolumeAll')}
                          className="rounded border-none bg-surface-container-highest shrink-0"
                        />
                      ) : null}
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      <span className="truncate font-bold text-xs text-on-surface">
                        {volumeTitle}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary shrink-0">
                        {t('chapterList.volumeCount', { count: group.chapters.length })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {downloadedCountInGroup > 0 ? (
                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {t('chapterList.volumeDownloadedCount', {
                            downloaded: downloadedCountInGroup,
                            total: group.chapters.length,
                          }) ?? `Đã tải ${downloadedCountInGroup}/${group.chapters.length}`}
                        </span>
                      ) : null}
                      {!isPick && selectedCountInGroup > 0 ? (
                        <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-primary text-on-primary shrink-0 shadow-xs">
                          {t('chapterList.volumeSelectedCount', {
                            selected: selectedCountInGroup,
                            total: group.chapters.length,
                          })}
                        </span>
                      ) : null}
                      <span
                        className={`material-symbols-outlined text-[18px] leading-none text-on-surface-variant transition-transform duration-150 ${
                          isCollapsed ? '-rotate-90' : 'rotate-0'
                        }`}
                      >
                        expand_more
                      </span>
                    </div>
                  </div>

                  {/* Nested Chapter Rows (Indented with pl-6) */}
                  {!isCollapsed && (
                    <div className="divide-y divide-outline-variant/10 bg-surface">
                      {group.chapters.map((ch) => renderCardChapterItem(ch, ch.rowIndex))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div
          className={`min-h-0 flex-1 overflow-auto rounded-lg border border-outline-variant/10 bg-surface-container-low ${isPick ? 'min-h-[8rem]' : 'min-h-[12rem]'}`}
        >
          <table className="w-full min-w-[min(100%,360px)] border-separate border-spacing-0 text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface-container-high">
              <tr>
                {!isPick ? (
                  <th className="w-8 border-b border-outline-variant/20 p-2">
                    <input
                      type="checkbox"
                      data-testid="select-all-chapters-chk"
                      checked={allInListSelected}
                      onChange={() => (allInListSelected ? onUnselectAll() : onSelectAll())}
                      className="rounded border-none bg-surface-container-highest"
                    />
                  </th>
                ) : null}
                <th className="border-b border-outline-variant/20 p-2 text-xs font-bold uppercase text-on-surface-variant">
                  <button
                    type="button"
                    onClick={handleTitleHeaderClick}
                    className="inline-flex cursor-pointer select-none items-center gap-1 hover:text-primary"
                    data-tooltip={
                      titleSort == null
                        ? t('chapterList.titleSortSource')
                        : titleSort === 'asc'
                          ? t('chapterList.titleSortAsc')
                          : t('chapterList.titleSortDesc')
                    }
                  >
                    {t('chapterList.column.title')}
                    <span className="material-symbols-outlined text-[16px] leading-none text-primary">
                      {titleSort == null ? 'swap_vert' : titleSort === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  </button>
                </th>
                {!isPick ? (
                  <>
                    <th className="w-24 min-w-[5rem] border-b border-outline-variant/20 p-2 text-right text-xs font-bold uppercase text-on-surface-variant">
                      {t('chapterList.column.status')}
                    </th>
                    {readColumnActive ? (
                      <th className="w-12 border-b border-outline-variant/20 p-2 text-center text-[10px] font-bold uppercase leading-tight text-on-surface-variant pr-3">
                        {t('chapterList.column.read')}
                      </th>
                    ) : null}
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={isPick ? colSpanPick : colSpanDefault}
                    className="p-4 text-center text-xs text-on-surface-variant"
                  >
                    {emptyListMessage ?? t('chapterList.fetchEmpty')}
                  </td>
                </tr>
              ) : (
                rows.map((ch, i) => renderChapterRow(ch, i))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isPick && !hideQueueFooter ? (
        <>
          <p className="mt-2 text-[10px] text-on-surface-variant/80">
            {t('chapterList.hint1')}
            <kbd className="rounded bg-surface-container-high px-1 py-0.5 text-[9px]">Shift</kbd>
            {t('chapterList.hint2')}
          </p>

          <div className="mt-2">
            <button
              type="button"
              data-testid="add-selected-to-queue-btn"
              disabled={!chaptersForList.length || !hasChapterSelection}
              data-tooltip={
                !chaptersForList.length
                  ? undefined
                  : !hasChapterSelection
                    ? t('chapterList.addToQueueNeedSelection')
                    : undefined
              }
              onClick={onAddSelectedToQueue}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary-container py-3 text-sm font-bold text-on-primary-container transition-all hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
            >
              <span className="material-symbols-outlined">playlist_add</span>
              {t('chapterList.addToQueue')}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
