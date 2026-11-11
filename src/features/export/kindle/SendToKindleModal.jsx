import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import {
  getKindleJob,
  subscribeKindleJob,
  startKindleSend,
  clearKindleJob,
  AMAZON_PDOCS_URL,
} from './kindleJobStore.mjs';

const MS_ICON = 'material-symbols-outlined text-[20px] leading-none';
const FORMAT_STORAGE_KEY = 'sendToKindle.format';
const DELETE_LOCAL_KEY = 'sendToKindle.deleteLocalAfterUpload';

function readStoredFormat() {
  try {
    const v = String(localStorage.getItem(FORMAT_STORAGE_KEY) || '')
      .trim()
      .toLowerCase();
    if (v === 'epub') return 'epub';
    if (v === 'pdf') return 'pdf';
    // Default PDF: better manga image quality through Amazon Send to Kindle.
    return 'pdf';
  } catch {
    return 'pdf';
  }
}

function writeStoredFormat(format) {
  try {
    localStorage.setItem(FORMAT_STORAGE_KEY, format === 'pdf' ? 'pdf' : 'epub');
  } catch {
    /* ignore */
  }
}

function readStoredDeleteLocal() {
  try {
    const v = localStorage.getItem(DELETE_LOCAL_KEY);
    if (v === null || v === undefined) return true;
    return v !== '0' && v !== 'false';
  } catch {
    return true;
  }
}

function writeStoredDeleteLocal(on) {
  try {
    localStorage.setItem(DELETE_LOCAL_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function sameRow(a, b) {
  if (!a || !b) return false;
  return String(a.absolutePath || '') === String(b.absolutePath || '');
}

function chapterKey(c, i) {
  const fb = String(c?.folderBasename || '').trim();
  if (fb) return `fb:${fb}`;
  return `i:${i}:${String(c?.title || '').trim()}`;
}

/** Compact MB label — matches electron getChapterSourceSizes.formatSourceSizeMb */
function formatSourceSizeMb(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '0';
  const mb = n / (1024 * 1024);
  if (mb < 0.1) return '<0.1';
  if (mb < 10) return mb.toFixed(1);
  return String(Math.round(mb));
}

/**
 * Send to Kindle modal. Job state lives in kindleJobStore so the user can
 * dismiss this dialog / switch tabs while upload continues in main process.
 */
export default function SendToKindleModal({ open, row, onClose }) {
  const { t } = useI18n();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  const [job, setJob] = useState(() => getKindleJob());
  const [checking, setChecking] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [account, setAccount] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [chaptersExpanded, setChaptersExpanded] = useState(false);
  const [sizing, setSizing] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('Manga Crawler');
  const [format, setFormat] = useState('pdf');
  const [deleteLocal, setDeleteLocal] = useState(true);
  const [localError, setLocalError] = useState('');

  useEffect(() => subscribeKindleJob(setJob), []);

  const sending = job.status === 'running';
  const jobForThisRow = sameRow(job.row, row);
  const progress = jobForThisRow || job.status === 'running' ? job.progress : null;
  const results = jobForThisRow ? job.results : null;
  const deletedLocal = jobForThisRow ? job.deletedLocal : false;
  const amazonLibraryUrl = job.amazonLibraryUrl || AMAZON_PDOCS_URL;
  const error =
    localError ||
    (jobForThisRow && job.error === 'loginRequired'
      ? t('sendToKindle.loginRequired')
      : jobForThisRow && job.error
        ? job.error
        : '');

  const refreshLogin = useCallback(async () => {
    if (!api?.sendToKindleIsLoggedIn) return;
    setChecking(true);
    try {
      const r = await api.sendToKindleIsLoggedIn();
      setLoggedIn(Boolean(r?.loggedIn));
      setAccount(String(r?.account || ''));
    } catch {
      setLoggedIn(false);
      setAccount('');
    } finally {
      setChecking(false);
    }
  }, [api]);

  const selectFormat = useCallback((next) => {
    const f = next === 'pdf' ? 'pdf' : 'epub';
    setFormat(f);
    writeStoredFormat(f);
  }, []);

  const toggleDeleteLocal = useCallback((on) => {
    setDeleteLocal(on);
    writeStoredDeleteLocal(on);
  }, []);

  useEffect(() => {
    if (!open || !row) return;
    let cancelled = false;
    setLocalError('');
    setTitle(String(row.mangaTitle || '').trim());
    setAuthor('Manga Crawler');
    setFormat(readStoredFormat());
    setDeleteLocal(readStoredDeleteLocal());
    setChapters([]);
    setSelectedKeys(new Set());
    setChaptersExpanded(false);
    setSizing(false);

    (async () => {
      if (!api?.loadMangaOfflineFromAbsolutePath) {
        setLocalError(t('sendToKindle.electronOnly'));
        return;
      }
      try {
        const r = await api.loadMangaOfflineFromAbsolutePath(row.absolutePath);
        if (cancelled) return;
        if (!r?.ok || !Array.isArray(r.chapters) || !r.chapters.length) {
          setChapters([]);
          setSelectedKeys(new Set());
          setLocalError(t('sendToKindle.loadChaptersFailed'));
          return;
        }

        const base = r.chapters.map((c) => ({
          title: String(c?.title || '').trim(),
          folderBasename: String(c?.folderBasename || '').trim(),
          sizeBytes: typeof c?.sizeBytes === 'number' ? c.sizeBytes : undefined,
        }));
        setChapters(base);
        setSelectedKeys(new Set(base.map((c, i) => chapterKey(c, i))));

        if (api.sendToKindleGetChapterSizes) {
          setSizing(true);
          try {
            const sized = await api.sendToKindleGetChapterSizes({
              absoluteMangaDir: row.absolutePath,
              chapters: base,
            });
            if (cancelled) return;
            if (sized?.ok && Array.isArray(sized.chapters)) {
              const byFb = new Map(
                sized.chapters.map((c) => [String(c.folderBasename || '').trim(), c])
              );
              setChapters((prev) =>
                prev.map((c) => {
                  const hit = byFb.get(c.folderBasename);
                  return hit
                    ? { ...c, sizeBytes: Number(hit.sizeBytes) || 0 }
                    : { ...c, sizeBytes: Number(c.sizeBytes) || 0 };
                })
              );
            }
          } catch {
            /* keep chapters without sizes */
          } finally {
            if (!cancelled) setSizing(false);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setChapters([]);
          setSelectedKeys(new Set());
          setLocalError(String(e?.message || e));
        }
      }
    })();

    refreshLogin();
    return () => {
      cancelled = true;
    };
  }, [open, row, api, t, refreshLogin]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const selectedChapters = useMemo(
    () => chapters.filter((c, i) => selectedKeys.has(chapterKey(c, i))),
    [chapters, selectedKeys]
  );

  const selectedBytes = useMemo(
    () => selectedChapters.reduce((sum, c) => sum + (Number(c.sizeBytes) || 0), 0),
    [selectedChapters]
  );

  const selectAll = useCallback(() => {
    setSelectedKeys(new Set(chapters.map((c, i) => chapterKey(c, i))));
  }, [chapters]);

  const unselectAll = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const toggleChapter = useCallback((key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleLogin = useCallback(async () => {
    if (!api?.sendToKindleLogin) return;
    setLoggingIn(true);
    setLocalError('');
    try {
      const r = await api.sendToKindleLogin();
      setLoggedIn(Boolean(r?.loggedIn));
      setAccount(String(r?.account || ''));
      if (!r?.loggedIn && r?.error) setLocalError(r.error);
    } catch (e) {
      setLocalError(String(e?.message || e));
    } finally {
      setLoggingIn(false);
    }
  }, [api]);

  const handleLogout = useCallback(async () => {
    if (!api?.sendToKindleLogout) return;
    try {
      await api.sendToKindleLogout();
    } catch {
      /* ignore */
    }
    setLoggedIn(false);
    setAccount('');
  }, [api]);

  const handleSend = useCallback(async () => {
    if (!api || !row) return;
    if (!selectedChapters.length) {
      setLocalError(t('sendToKindle.noneSelected'));
      return;
    }
    setLocalError('');
    const r = await startKindleSend({
      api,
      row,
      payload: {
        absoluteMangaDir: row.absolutePath,
        mangaTitle: row.mangaTitle,
        chapters: selectedChapters.map((c) => ({
          title: c.title,
          folderBasename: c.folderBasename,
        })),
        title: title.trim() || row.mangaTitle,
        author: author.trim() || 'Manga Crawler',
        format,
        deleteLocalAfterUpload: deleteLocal,
      },
    });
    if (r?.busy) {
      setLocalError(t('sendToKindle.busy'));
      return;
    }
    if (r?.queued) {
      // Sequential queue — job will run after the current one; no error.
    }
    if (r?.needLogin) setLoggedIn(false);
  }, [api, row, selectedChapters, title, author, format, deleteLocal, t]);

  const handleClearAndClose = useCallback(() => {
    if (getKindleJob().status !== 'running') clearKindleJob();
    onClose?.();
  }, [onClose]);

  const revealLocal = useCallback(
    (filePath) => {
      if (!filePath) return;
      if (api?.showItemInFolder) api.showItemInFolder(filePath);
      else if (api?.openPath) api.openPath(filePath);
    },
    [api]
  );

  const openAmazonLibrary = useCallback(() => {
    if (api?.openExternal) api.openExternal(amazonLibraryUrl || AMAZON_PDOCS_URL);
  }, [api, amazonLibraryUrl]);

  if (!open || !row) return null;

  const progressLabel = (() => {
    if (!progress) return '';
    if (progress.phase === 'prepare') {
      const prepKey =
        format === 'pdf' ? 'sendToKindle.preparingPdf' : 'sendToKindle.preparingEpub';
      return `${t(prepKey)} ${progress.pct ?? 0}%`;
    }
    const sizeBytes = Number(progress.sizeBytes) || 0;
    if (progress.label && sizeBytes > 0) {
      return `${t('sendToKindle.uploadingFile', {
        name: progress.label,
        mb: formatSourceSizeMb(sizeBytes),
        index: progress.partIndex ?? 1,
        total: progress.totalParts ?? 1,
      })} ${progress.pct ?? 0}%`;
    }
    return `${t('sendToKindle.uploadingPart', {
      index: progress.partIndex ?? 1,
      total: progress.totalParts ?? 1,
    })} ${progress.pct ?? 0}%`;
  })();

  const sendDisabled =
    sending || !loggedIn || chapters.length === 0 || selectedChapters.length === 0;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-to-kindle-title"
      onClick={() => onClose?.()}
    >
      <div
        className="w-full max-w-md max-h-[min(92vh,680px)] min-h-0 flex flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-high shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-outline-variant/15 shrink-0">
          <div className="min-w-0 pr-2">
            <h2 id="send-to-kindle-title" className="text-base font-bold text-on-surface flex items-center gap-2">
              <span className={`${MS_ICON} text-primary`}>send_to_mobile</span>
              {t('sendToKindle.title')}
            </h2>
            <p className="text-[11px] text-on-surface-variant mt-1 truncate" data-tooltip={row.mangaTitle}>
              {row.mangaTitle}
            </p>
            {sending ? (
              <p className="text-[10px] text-primary mt-1">{t('sendToKindle.backgroundHint')}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="shrink-0 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
            aria-label={t('sendToKindle.close')}
            data-tooltip={sending ? t('sendToKindle.runInBackground') : undefined}
          >
            <span className="material-symbols-outlined text-[22px] leading-none">close</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-highest/50 px-3.5 py-3">
            {checking ? (
              <p className="text-xs text-on-surface-variant flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                {t('sendToKindle.checking')}
              </p>
            ) : loggedIn ? (
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-xs font-semibold text-green-500 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] shrink-0">check_circle</span>
                  <span className="truncate" data-tooltip={account || undefined}>
                    {account
                      ? t('sendToKindle.loggedInAs', { name: account })
                      : t('sendToKindle.loggedIn')}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={sending}
                  className="shrink-0 text-[11px] font-medium text-on-surface-variant hover:text-error cursor-pointer disabled:opacity-50"
                  data-tooltip={t('sendToKindle.wrongAccount')}
                >
                  {t('sendToKindle.logout')}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {t('sendToKindle.loginHint')}
                </p>
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={loggingIn || sending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:brightness-110 transition-[filter] cursor-pointer disabled:opacity-50"
                >
                  {loggingIn ? (
                    <span className="material-symbols-outlined text-[16px] animate-spin">
                      progress_activity
                    </span>
                  ) : (
                    <span className="material-symbols-outlined text-[16px]">login</span>
                  )}
                  {loggingIn ? t('sendToKindle.loggingIn') : t('sendToKindle.loginButton')}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                {t('sendToKindle.docTitle')}
              </span>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] leading-none text-on-surface-variant/70">
                  edit
                </span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={sending}
                  placeholder={t('sendToKindle.docTitlePlaceholder')}
                  className="w-full h-10 rounded-lg bg-surface-container-highest border border-outline-variant/40 pl-9 pr-3 text-sm text-on-surface outline-none hover:border-outline-variant/60 focus:border-primary/60 disabled:opacity-50"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                {t('sendToKindle.docAuthor')}
              </span>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] leading-none text-on-surface-variant/70">
                  edit
                </span>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  disabled={sending}
                  placeholder={t('sendToKindle.docAuthorPlaceholder')}
                  className="w-full h-10 rounded-lg bg-surface-container-highest border border-outline-variant/40 pl-9 pr-3 text-sm text-on-surface outline-none hover:border-outline-variant/60 focus:border-primary/60 disabled:opacity-50"
                />
              </div>
            </label>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60 mb-1.5">
              {t('sendToKindle.formatLabel')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'pdf', label: t('sendToKindle.formatPdf'), hint: t('sendToKindle.formatHintPdf') },
                { value: 'epub', label: t('sendToKindle.formatEpub'), hint: t('sendToKindle.formatHintEpub') },
              ].map((opt) => {
                const selected = format === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={sending}
                    onClick={() => selectFormat(opt.value)}
                    className={[
                      'rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer disabled:opacity-50',
                      selected
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-outline-variant/25 bg-surface-container-highest/40 hover:border-outline-variant/40',
                    ].join(' ')}
                  >
                    <span className="block text-sm font-semibold text-on-surface">{opt.label}</span>
                    <span className="block text-[10px] text-on-surface-variant mt-0.5 leading-snug">
                      {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-on-surface-variant hover:text-on-surface">
            <input
              type="checkbox"
              checked={deleteLocal}
              onChange={(e) => toggleDeleteLocal(e.target.checked)}
              disabled={sending}
              className="mt-0.5 rounded accent-primary"
            />
            <span>
              {t('sendToKindle.deleteLocal')}
              <span className="block text-[10px] text-on-surface-variant/60 mt-0.5 leading-relaxed">
                {t('sendToKindle.deleteLocalHint')}
              </span>
            </span>
          </label>

          {chapters.length > 0 ? (
            <div className="rounded-xl border border-outline-variant/15 overflow-hidden bg-surface-container-lowest/40">
              <div
                className={[
                  'flex items-center justify-between gap-2 px-3 py-2 bg-surface-container-highest/60',
                  chaptersExpanded ? 'border-b border-outline-variant/10' : '',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => setChaptersExpanded((v) => !v)}
                  disabled={sending}
                  aria-expanded={chaptersExpanded}
                  data-tooltip={
                    chaptersExpanded
                      ? t('sendToKindle.collapseChapters')
                      : t('sendToKindle.expandChapters')
                  }
                  aria-label={
                    chaptersExpanded
                      ? t('sendToKindle.collapseChapters')
                      : t('sendToKindle.expandChapters')
                  }
                  className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer disabled:opacity-50 rounded-lg -ml-1 pl-1 py-0.5 hover:bg-surface-container-high/60 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none text-on-surface-variant shrink-0">
                    {chaptersExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
                      {t('sendToKindle.selectChapters')}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {t('sendToKindle.selectedCount', {
                        selected: selectedChapters.length,
                        total: chapters.length,
                      })}
                      {' · '}
                      {sizing
                        ? t('sendToKindle.sizingChapters')
                        : t('sendToKindle.selectedSize', {
                            mb: formatSourceSizeMb(selectedBytes),
                          })}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={sending}
                    data-tooltip={t('sendToKindle.selectAll')}
                    aria-label={t('sendToKindle.selectAll')}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[20px] leading-none">select_all</span>
                  </button>
                  <button
                    type="button"
                    onClick={unselectAll}
                    disabled={sending}
                    data-tooltip={t('sendToKindle.unselectAll')}
                    aria-label={t('sendToKindle.unselectAll')}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[20px] leading-none">clear_all</span>
                  </button>
                </div>
              </div>
              {chaptersExpanded ? (
                <>
                  <ul className="max-h-48 overflow-y-auto custom-scrollbar py-1">
                    {chapters.map((ch, i) => {
                      const key = chapterKey(ch, i);
                      const checked = selectedKeys.has(key);
                      const sizeLabel =
                        typeof ch.sizeBytes === 'number'
                          ? t('sendToKindle.chapterSize', {
                              mb: formatSourceSizeMb(ch.sizeBytes),
                            })
                          : sizing
                            ? '…'
                            : '';
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => toggleChapter(key)}
                            className={[
                              'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                              'hover:bg-surface-container-high disabled:cursor-default',
                              checked ? 'bg-primary/5' : '',
                            ].join(' ')}
                          >
                            <input
                              type="checkbox"
                              readOnly
                              checked={checked}
                              tabIndex={-1}
                              className="pointer-events-none shrink-0 rounded accent-primary"
                            />
                            <span className="min-w-0 flex-1 truncate text-on-surface">
                              {ch.title || ch.folderBasename || `Ch ${i + 1}`}
                            </span>
                            {sizeLabel ? (
                              <span className="shrink-0 text-[11px] tabular-nums text-on-surface-variant">
                                {sizeLabel}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="px-3 py-2 text-[10px] text-on-surface-variant/70 border-t border-outline-variant/10 leading-relaxed">
                    {t('sendToKindle.sizeHint')} · {t('sendToKindle.splitNote', { mb: 190 })}
                  </p>
                </>
              ) : (
                <p className="px-3 py-1.5 text-[10px] text-on-surface-variant/70 leading-relaxed">
                  {t('sendToKindle.sizeHint')} · {t('sendToKindle.splitNote', { mb: 190 })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant">
              {t('sendToKindle.chaptersCount', { count: 0 })} · {t('sendToKindle.splitNote', { mb: 190 })}
            </p>
          )}

          {sending && progress ? (
            <div className="space-y-1.5 min-w-0">
              <p
                className="text-xs text-on-surface-variant truncate"
                data-tooltip={progressLabel || undefined}
              >
                {progressLabel}
              </p>
              <div className="h-1.5 w-full rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-200"
                  style={{ width: `${progress.pct ?? 0}%` }}
                />
              </div>
            </div>
          ) : null}

          {results ? (
            <div className="rounded-xl border border-outline-variant/20 bg-surface-container-highest/50 px-3.5 py-3 space-y-1.5 min-w-0">
              <p className="text-xs font-semibold text-on-surface">
                {results.every((r) => r.ok)
                  ? t('sendToKindle.allDone')
                  : t('sendToKindle.someFailed')}
              </p>
              <ul className="space-y-2 min-w-0">
                {results.map((r) => {
                  const sizeBytes = Number(r.sizeBytes) || 0;
                  return (
                  <li key={r.name} className="text-[11px] space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                      <span
                        className={`material-symbols-outlined text-[14px] leading-none shrink-0 ${
                          r.ok ? 'text-green-500' : 'text-error'
                        }`}
                      >
                        {r.ok ? 'check_circle' : 'error'}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-on-surface-variant"
                        data-tooltip={r.name}
                      >
                        {r.name}
                      </span>
                      {sizeBytes > 0 ? (
                        <span className="shrink-0 tabular-nums text-on-surface-variant/80">
                          {t('sendToKindle.chapterSize', {
                            mb: formatSourceSizeMb(sizeBytes),
                          })}
                        </span>
                      ) : null}
                    </div>
                    {!r.ok && r.error ? (
                      <p className="pl-5 text-[10px] text-error truncate" data-tooltip={r.error}>
                        {r.error}
                      </p>
                    ) : null}
                    {r.localPath ? (
                      <div className="pl-5 space-y-0.5 min-w-0">
                        <p
                          className="text-[10px] text-on-surface-variant/80 font-mono leading-snug truncate"
                          data-tooltip={r.localPath}
                        >
                          {t('sendToKindle.localFile')}: {r.localPath}
                        </p>
                        {!deletedLocal ? (
                          <button
                            type="button"
                            onClick={() => revealLocal(r.localPath)}
                            className="text-[10px] font-semibold text-primary hover:opacity-80 transition-opacity cursor-pointer"
                          >
                            {t('sendToKindle.revealLocal')}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                  );
                })}
              </ul>

              {deletedLocal ? (
                <p className="text-[10px] text-on-surface-variant/70">{t('sendToKindle.localDeleted')}</p>
              ) : null}

              <button
                type="button"
                onClick={openAmazonLibrary}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px] leading-none">open_in_new</span>
                {t('sendToKindle.amazonLibrary')}
              </button>

              {results.some((r) => r.ok) ? (
                <div className="mt-2.5 pt-2.5 border-t border-outline-variant/15">
                  <p className="text-[11px] font-semibold text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px] leading-none text-primary">
                      tablet_android
                    </span>
                    {t('sendToKindle.nextTitle')}
                  </p>
                  <ol className="mt-1.5 space-y-1 list-decimal pl-4 text-[11px] text-on-surface-variant leading-relaxed">
                    <li>{t('sendToKindle.nextStep1')}</li>
                    <li>{t('sendToKindle.nextStep2')}</li>
                    <li>{t('sendToKindle.nextStep3')}</li>
                    <li>{t('sendToKindle.nextStep4')}</li>
                  </ol>
                  <p className="mt-1.5 text-[10px] text-on-surface-variant/70 leading-relaxed">
                    {t('sendToKindle.nextNote')}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="flex items-start gap-1.5 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
              <span className="material-symbols-outlined text-sm shrink-0 mt-px">error</span>
              <span className="min-w-0 break-words">{error}</span>
            </div>
          ) : null}

          <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
            {t('sendToKindle.riskNote')}
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-5 py-3.5 border-t border-outline-variant/15 shrink-0 bg-surface-container-high">
          {sending ? (
            <button
              type="button"
              onClick={() => onClose?.()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-container-highest text-on-surface hover:brightness-110 transition-[filter] cursor-pointer"
            >
              {t('sendToKindle.runInBackground')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClearAndClose}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-container-highest text-on-surface hover:brightness-110 transition-[filter] cursor-pointer"
            >
              {t('sendToKindle.close')}
            </button>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={sendDisabled}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-primary text-on-primary shadow-md hover:brightness-110 transition-[filter] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {sending ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">send</span>
            )}
            {sending ? t('sendToKindle.sending') : t('sendToKindle.sendButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
