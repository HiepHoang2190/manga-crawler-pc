import { useEffect, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';

export default function SplitTab({ savePath = '' }) {
  const { t } = useI18n();

  const [sourceFile, setSourceFile] = useState(null);
  const [outputDir, setOutputDir] = useState(savePath);
  const [outputBaseName, setOutputBaseName] = useState('');
  const [maxMb, setMaxMb] = useState(200);
  const [openFolderAfter, setOpenFolderAfter] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  const hasElectron = Boolean(api?.selectCbzFiles);

  useEffect(() => {
    setOutputDir((prev) => (prev === '' || prev === savePath) ? savePath : prev);
  }, [savePath]);

  useEffect(() => {
    if (!running || !api?.subscribeSplitCbzProgress) return undefined;
    const unsub = api.subscribeSplitCbzProgress((p) => {
      if (p && typeof p.done === 'number' && typeof p.total === 'number') setProgress(p);
    });
    return unsub;
  }, [running, api]);

  const handleSelectFile = async () => {
    if (!api?.selectCbzFiles) return;
    const paths = await api.selectCbzFiles();
    if (!Array.isArray(paths) || !paths.length) return;
    const filePath = paths[0];
    if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.cbz')) return;
    const sep = filePath.includes('/') ? '/' : '\\';
    const parts = filePath.split(sep);
    const name = parts[parts.length - 1];
    let sizeMb = null;
    if (api?.getFileSize) {
      try { const r = await api.getFileSize(filePath); if (r?.ok && typeof r.size === 'number') sizeMb = Math.round((r.size / (1024 * 1024)) * 10) / 10; } catch { /* ignore */ }
    }
    setSourceFile({ path: filePath, name, sizeMb });
    setOutputBaseName('');
    setResult(null);
  };

  const handleBrowseOutputDir = async () => {
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (dir) setOutputDir(dir);
  };

  const handleMaxMbBlur = () => {
    setMaxMb((v) => Math.min(4096, Math.max(1, Number.isFinite(v) ? v : 200)));
  };

  const handleSplit = async () => {
    if (!api?.splitCbz || !sourceFile) return;
    setResult(null); setProgress(null); setRunning(true);
    try {
      const r = await api.splitCbz({
        inputFile: sourceFile.path,
        maxMbPerFile: Math.min(4096, Math.max(1, maxMb)),
        ...(outputDir.trim() ? { outputDir: outputDir.trim() } : {}),
        ...(outputBaseName.trim() ? { outputBaseName: outputBaseName.trim() } : {}),
      });
      setResult(r);
      if (r?.ok && openFolderAfter && api.openPath) {
        const targetDir = outputDir.trim() || (() => { const p = sourceFile.path; const sep = p.includes('/') ? '/' : '\\'; const parts = p.split(sep); parts.pop(); return parts.join(sep) || sep; })();
        if (targetDir) await api.openPath(targetDir);
      }
    } catch (e) {
      setResult({ ok: false, error: String(e?.message || e) || t('app.log.fetchErrorUnknown') });
    } finally { setRunning(false); setProgress(null); }
  };

  const progressPct = progress && progress.total > 0 ? Math.min(100, Math.round((100 * progress.done) / progress.total)) : null;
  const splitDisabled = running || !sourceFile;

  if (!hasElectron) {
    return <div className="flex-1 flex flex-col p-8"><p className="text-sm text-amber-700 dark:text-amber-300">{t('splitTab.desktopOnly')}</p></div>;
  }

  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden min-h-0">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 shrink-0 px-8 pt-6 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={running}
            onClick={handleSelectFile}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-surface-container-highest text-on-surface font-medium border border-outline-variant/20 hover:bg-surface-bright disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">file_open</span>
            {t('splitTab.selectFile')}
          </button>
          <button
            type="button"
            disabled={splitDisabled}
            onClick={handleSplit}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-tertiary-container text-on-tertiary-container font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">call_split</span>
            {running ? t('splitTab.splitting') : t('splitTab.split')}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Max MB inline */}
          <span className="flex items-center gap-1.5 text-sm text-on-surface-variant">
            <span className="text-xs font-medium">{t('splitTab.maxMb')}:</span>
            <input
              type="number"
              min={1}
              max={4096}
              step={1}
              value={maxMb}
              onChange={(e) => setMaxMb(Number(e.target.value))}
              onBlur={handleMaxMbBlur}
              disabled={running}
              className="w-20 rounded-lg border border-outline-variant/30 bg-surface-container-high px-2 py-1 text-on-surface tabular-nums text-sm disabled:opacity-50"
            />
            <span>{t('splitTab.unitMb')}</span>
          </span>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-on-surface-variant">
            <input type="checkbox" checked={openFolderAfter} onChange={(e) => setOpenFolderAfter(e.target.checked)} disabled={running} className="rounded accent-primary" />
            {t('splitTab.openFolderAfter')}
          </label>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 flex flex-col px-8 pb-6 gap-5 overflow-y-auto custom-scrollbar min-h-0">

        {/* Selected file info */}
        <div className="shrink-0">
          {sourceFile ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-outline-variant/15 bg-surface-container-highest/40">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">folder_zip</span>
              <span className="flex-1 min-w-0 text-sm text-on-surface truncate font-mono">{sourceFile.name}</span>
              {sourceFile.sizeMb !== null && (
                <span className="shrink-0 text-xs text-on-surface-variant tabular-nums">{t('splitTab.fileSizeMb', { n: sourceFile.sizeMb })}</span>
              )}
            </div>
          ) : null}
        </div>

        {/* Output base name */}
        <div className="shrink-0 space-y-1.5">
          <label className="text-xs font-bold text-on-surface-variant tracking-widest uppercase">{t('splitTab.outputBaseName')}</label>
          <input type="text" value={outputBaseName} onChange={(e) => setOutputBaseName(e.target.value)} placeholder={sourceFile ? sourceFile.name.replace(/\.cbz$/i, '') : t('splitTab.outputBaseNamePlaceholder')} disabled={running} className="w-full bg-surface-container-highest border-none rounded-md text-sm h-10 px-3 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50" />
        </div>

        {/* Output dir */}
        <div className="shrink-0 space-y-1.5">
          <label className="text-xs font-bold text-on-surface-variant tracking-widest uppercase">{t('sidebar.saveTo')}</label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
            <input type="text" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} placeholder={savePath || t('sidebar.placeholder.savePath')} disabled={running} className="min-w-0 bg-surface-container-highest border-none rounded-md text-sm h-10 px-3 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50" />
            <button type="button" onClick={handleBrowseOutputDir} disabled={running} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md bg-surface-container-high text-on-surface text-sm font-medium hover:bg-surface-bright transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
              {t('sidebar.browse')}
            </button>
          </div>
        </div>

        {/* Progress */}
        {running ? (
          <div className="shrink-0 space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
              <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${progressPct != null ? progressPct : 0}%` }} />
            </div>
            <p className="text-xs text-on-surface-variant">
              {progress?.total ? `${progress.label ? `${progress.label} — ` : ''}${progress.done} / ${progress.total}` : t('splitTab.splitting')}
            </p>
          </div>
        ) : null}

        {/* Result */}
        {result && !running ? (
          result.ok ? (
            <p className="shrink-0 text-sm text-on-surface border border-outline-variant/20 rounded-lg p-3 bg-surface-container-highest/50">
              {t('splitTab.successMsg', { count: Array.isArray(result.outputFiles) ? result.outputFiles.length : 0 })}
            </p>
          ) : (
            <p className="shrink-0 text-sm text-error whitespace-pre-wrap" role="alert">{result.error}</p>
          )
        ) : null}

      </div>
    </div>
  );
}
