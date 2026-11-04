import { useEffect, useState, useRef } from 'react';
import { useI18n } from '../../../context/I18nContext';
import MangaInfo from './MangaInfo.jsx';
import { SearchableSelect } from '../../../shared';
import {
  buildCookieExtractFeedback,
  resolveCookieExtractTargetUrl,
} from '../../../utils/cookieExtractFeedback';

function connectorHost(domain) {
  try {
    return new URL(domain).hostname;
  } catch {
    return domain;
  }
}

function connectorHomepageUrl(domain) {
  const raw_domain = String(domain || '').trim();
  if (!raw_domain) return '';
  if (/^https?:\/\//i.test(raw_domain)) return raw_domain;
  return `https://${raw_domain}`;
}

/** Cùng độ rộng cột nút để input Source URL / Save To thẳng hàng (5.5rem = 88px = 2 icon w-10 + gap-2). */
const SIDEBAR_ACTION_BTN =
  'shrink-0 w-full h-10 px-2 rounded-xl text-sm inline-flex items-center justify-center gap-1.5 box-border';

export default function Sidebar({
  widthPx = 450,
  onCollapse,
  connectors,
  sourceUrl = '',
  setSourceUrl,
  site,
  setSite,
  mangadexLanguage = 'vi',
  setMangadexLanguage,
  comickLanguage = 'en',
  setComickLanguage,
  mangaballLanguage = 'en',
  setMangaballLanguage,
  savePath,
  setSavePath,
  loading,
  fetchError,
  onFetch,
  onBrowse,
  onOpenDownloadSettings,
  manga,
  chapters,
  isMangaFavorite = false,
  onToggleFavorite,
  coverFetchSuccessTick = 0,
  coverFetchDurationMs = 0,
  onOpenChaptersPanel,
  onEnqueueAllToQueue,
  onOpenCbzExport,
  onOpenpdfExport,
  onOpenReader,
  onOpenEbookStudio,
  /** Số chương đã tải xong trên đĩa (hoặc list offline) — disable Đọc / CBZ khi 0. */
  downloadedChapterCount = 0,
  threads,
  setThreads,
  showCbzExport = true,
  guestFavoriteLocked = false,
  onGuestFavoriteBlocked,
}) {
  const { t } = useI18n();
  const [extractBusy, setExtractBusy] = useState(false);
  const [messageDialog, setMessageDialog] = useState(null);

  const selectedConnector = (connectors || []).find((c) => c.id === site);
  const selectedConnectorHomepage = connectorHomepageUrl(selectedConnector?.domain);

  const handleAutoExtractCookie = async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.extractCloudflareCookie) return;
    if (!selectedConnectorHomepage) return;

    const targetUrl = resolveCookieExtractTargetUrl(
      sourceUrl,
      selectedConnectorHomepage,
      selectedConnector?.hostIncludes,
    );
    if (!targetUrl) return;

    setExtractBusy(true);
    try {
      const result = await api.extractCloudflareCookie(targetUrl);
      if (result && result.ok && Array.isArray(result.cookies)) {
        if (result.cookies.length > 0) {
          const cookieStr = result.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
          await api.setCookie(site, cookieStr);
        }
        const fb = buildCookieExtractFeedback(
          {
            cookieCount: result.cookies.length,
            loginDetected: result.loginDetected,
          },
          t,
        );
        if (fb) setMessageDialog(fb);
      } else if (result?.error) {
        const fb = buildCookieExtractFeedback({ error: result.error, cookieCount: 0 }, t);
        if (fb) setMessageDialog(fb);
      }
    } catch (err) {
      const fb = buildCookieExtractFeedback(
        { error: err.message || t('sidebar.cookie.extractErrorTitle'), cookieCount: 0 },
        t,
      );
      if (fb) setMessageDialog(fb);
    } finally {
      setExtractBusy(false);
    }
  };

  const mangaInfoRef = useRef(null);

  const urlLooksLikePage = sourceUrl.trim().length >= 8 && sourceUrl.trim().includes('.');

  useEffect(() => {
    if (!coverFetchSuccessTick || !manga) return undefined;
    const id = window.requestAnimationFrame(() => {
      mangaInfoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [coverFetchSuccessTick, manga]);

  const fetchDisabled = loading || !sourceUrl?.trim();

  const handlePasteUrl = async () => {
    try {
      let text = '';
      if (typeof window !== 'undefined' && window.electronAPI?.readClipboardText) {
        text = await window.electronAPI.readClipboardText();
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      }
      if (text && typeof text === 'string') {
        const trimmed = text.trim();
        if (trimmed) {
          setSourceUrl(trimmed);
        }
      }
    } catch {
      /* ignore clipboard read error */
    }
  };

  const bumpThreads = (delta) => {
    setThreads((t) => {
      const cur = Math.floor(Number(t) || 1);
      return Math.max(1, Math.min(5, cur + delta));
    });
  };

  return (
    <>
      <div className="p-4 space-y-4">
        <div data-testid="sidebar-controls" className="space-y-4">
          <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2 items-center">
            <div className="relative flex items-center min-w-0 w-full">
              <input
                type="text"
                data-testid="url-input"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !fetchDisabled) {
                    onFetch?.();
                  }
                }}
                placeholder={t('sidebar.placeholder.sourceUrl')}
                aria-label={t('sidebar.sourceUrl')}
                className="w-full min-w-0 min-h-0 bg-surface-container-highest border-none rounded-xl text-sm h-10 pl-3 pr-9 box-border focus:ring-1 focus:ring-primary outline-none text-on-surface"
              />
              {sourceUrl ? (
                <button
                  type="button"
                  onClick={() => setSourceUrl('')}
                  data-tooltip={t('sidebar.clearUrl')}
                  aria-label={t('sidebar.clearUrl')}
                  className="absolute right-1.5 p-1 text-on-surface-variant hover:text-on-surface rounded-md hover:bg-surface-container-high transition-colors cursor-pointer select-none flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">close</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePasteUrl}
                  data-tooltip={t('sidebar.pasteUrl')}
                  aria-label={t('sidebar.pasteUrl')}
                  className="absolute right-1.5 p-1 text-on-surface-variant hover:text-primary rounded-md hover:bg-surface-container-high transition-colors cursor-pointer select-none flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">content_paste</span>
                </button>
              )}
            </div>
            <button
              type="button"
              disabled={fetchDisabled}
              data-testid="fetch-button"
              onClick={onFetch}
              className={`${SIDEBAR_ACTION_BTN} bg-primary-container text-on-primary-container font-bold hover:opacity-90 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none`}
            >
              <span
                className={`material-symbols-outlined text-[18px] leading-none${loading ? ' animate-spin' : ''}`}
                style={loading ? { animationDuration: '0.9s' } : undefined}
              >
                sync
              </span>
              {loading ? '…' : t('sidebar.fetch')}
            </button>
          </div>
          {selectedConnector?.requiresVpn && !fetchError ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-100 leading-snug">
              {t('sidebar.vpnRequiredHint')}
            </div>
          ) : null}
          {selectedConnector?.suggestsVpn && !fetchError ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-100 leading-snug">
              {t('sidebar.vpnSuggestedHint')}
            </div>
          ) : null}
          {selectedConnector?.hasLockedChapters && !fetchError ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-100 leading-snug">
              {t('sidebar.lockedChaptersHint')}
            </div>
          ) : null}
          {selectedConnector?.requiresCookie &&
          !selectedConnector?.hasLockedChapters &&
          !fetchError ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-100 leading-snug">
              {t('sidebar.cookie.needOpenHint')}
            </div>
          ) : null}
          {fetchError ? <p className="text-xs text-red-500 dark:text-red-400">{fetchError}</p> : null}
        </div>

        {urlLooksLikePage && !site ? (
          <p className="text-xs text-on-surface-variant">{t('sidebar.cookie.detectingSite')}</p>
        ) : null}

        <div className="space-y-2">
          <label className="text-xs font-bold text-on-surface-variant tracking-widest uppercase">{t('sidebar.saveTo')}</label>
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2 items-center">
            <input
              type="text"
              data-testid="save-path-input"
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              placeholder={t('sidebar.placeholder.savePath')}
              className="w-full min-w-0 min-h-0 bg-surface-container-highest border-none rounded-xl text-sm h-10 px-3 box-border focus:ring-1 focus:ring-primary outline-none text-on-surface"
            />
            <div className="flex items-center gap-2 w-full justify-between">
              <button
                type="button"
                onClick={onBrowse}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-high text-on-surface hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all active:scale-95 cursor-pointer shadow-2xs"
                aria-label={t('sidebar.browse')}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
              </button>
              {onOpenDownloadSettings && (
                <button
                  type="button"
                  onClick={onOpenDownloadSettings}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-high text-on-surface hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all active:scale-95 cursor-pointer shadow-2xs"
                  aria-label={t('queue.openDownloadSettings')}
                  data-tooltip={t('queue.openDownloadSettings')}
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">tune</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-on-surface-variant tracking-widest uppercase">
            {t('sidebar.site')} ({(connectors || []).length})
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2 items-center">
            <SearchableSelect
              value={site}
              onChange={setSite}
              options={(connectors || []).map((c) => ({
                value: c.id,
                label: `${c.label} (${connectorHost(c.domain)})`,
                icon: c.icon,
              }))}
              placeholder={t('sidebar.siteSelectPlaceholder')}
            />
            <div className="relative flex">
              <button
                type="button"
                onClick={handleAutoExtractCookie}
                disabled={extractBusy || !selectedConnectorHomepage}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary hover:opacity-90 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                aria-label={t('sidebar.extractCookie') || 'Trích xuất Cookie tự động'}
                data-tooltip={t('sidebar.extractCookie') || 'Trích xuất Cookie tự động'}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">cookie</span>
              </button>
            </div>
          </div>
        </div>

          {site === 'mangadex' && typeof setMangadexLanguage === 'function' ? (
            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-variant tracking-widest uppercase">
                {t('sidebar.mangadexTranslationLang')}
              </label>
              <SearchableSelect
                value={mangadexLanguage}
                onChange={(v) => setMangadexLanguage(v)}
                options={[
                  { value: 'vi', label: t('sidebar.mangadexLangVi') },
                  { value: 'en', label: t('sidebar.mangadexLangEn') },
                  { value: 'ja', label: t('sidebar.mangadexLangJa') },
                ]}
                placeholder=""
              />
            </div>
          ) : null}

          {site === 'comick' && typeof setComickLanguage === 'function' ? (
            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-variant tracking-widest uppercase">
                {t('sidebar.comickTranslationLang')}
              </label>
              <SearchableSelect
                value={comickLanguage}
                onChange={(v) => setComickLanguage(v)}
                options={[
                  { value: 'en', label: t('sidebar.mangadexLangEn') },
                  { value: 'vi', label: t('sidebar.mangadexLangVi') },
                  { value: 'ja', label: t('sidebar.mangadexLangJa') },
                ]}
                placeholder=""
              />
            </div>
          ) : null}

          {site === 'mangaball' && typeof setMangaballLanguage === 'function' ? (
            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-variant tracking-widest uppercase">
                {t('sidebar.mangaballTranslationLang')}
              </label>
              <SearchableSelect
                value={mangaballLanguage}
                onChange={(v) => setMangaballLanguage(v)}
                options={[
                  { value: 'en', label: t('sidebar.mangaballLangEn') },
                  { value: 'vi', label: t('sidebar.mangaballLangVi') },
                  { value: 'ja', label: t('sidebar.mangaballLangJa') },
                ]}
                placeholder=""
              />
            </div>
          ) : null}
        </div>

        {manga ? (
          <>
            <div className="h-px bg-outline-variant/20 mx-4" />
            <div ref={mangaInfoRef}>
            <MangaInfo
              manga={manga}
              chapterCount={chapters.length}
              downloadedChapterCount={downloadedChapterCount}
              isFavorite={isMangaFavorite}
              onToggleFavorite={onToggleFavorite}
              fetchSuccessTick={coverFetchSuccessTick}
              fetchSuccessDurationMs={coverFetchDurationMs}
              onOpenChaptersPanel={onOpenChaptersPanel}
              onEnqueueAllToQueue={onEnqueueAllToQueue}
              onOpenCbzExport={onOpenCbzExport}
              onOpenpdfExport={onOpenpdfExport}
              onOpenReader={onOpenReader}
              onOpenEbookStudio={onOpenEbookStudio}
              showCbzExport={showCbzExport}
              guestFavoriteLocked={guestFavoriteLocked}
              onGuestFavoriteBlocked={onGuestFavoriteBlocked}
            />
            </div>
          </>
        ) : null}
      </div>

      {messageDialog && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-xl">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-on-surface tracking-tight">
                  {messageDialog.title}
                </h2>
                <button
                  type="button"
                  onClick={() => setMessageDialog(null)}
                  className="shrink-0 rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
                  aria-label="Đóng"
                >
                  <span className="material-symbols-outlined text-[22px] leading-none">close</span>
                </button>
              </div>
              <p
                className={`text-sm leading-relaxed ${
                  messageDialog.type === 'error'
                    ? 'text-error'
                    : messageDialog.type === 'warning'
                      ? 'text-amber-800 dark:text-amber-200'
                      : 'text-on-surface-variant'
                }`}
              >
                {messageDialog.message}
              </p>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setMessageDialog(null)}
                  className="h-10 px-4 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98]"
                >
                  {t('guestCredit.modalClose')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}