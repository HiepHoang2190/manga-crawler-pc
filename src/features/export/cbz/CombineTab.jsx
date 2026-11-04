import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';

export default function CombineTab({ savePath = '' }) {
  const { t } = useI18n();

  const [fileList, setFileList] = useState([]);
  const [outputDir, setOutputDir] = useState(savePath);
  const [outputFileName, setOutputFileName] = useState('');
  const [openFolderAfter, setOpenFolderAfter] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const dragIndexRef = useRef(null);
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  const hasElectron = Boolean(api?.selectDirectory);

  useEffect(() => {
    setOutputDir((prev) => (prev === '' || prev === savePath) ? savePath : prev);
  }, [savePath]);

  useEffect(() => {
    if (!running || !api?.subscribeCombineCbzProgress) return undefined;
    const unsub = api.subscribeCombineCbzProgress((p) => {
      if (p && typeof p.done === 'number' && typeof p.total === 'number') setProgress(p);
    });
    return unsub;
  }, [running, api]);

  const handleAddFiles = async () => {
    if (!api?.selectCbzFiles) return;
    const paths = await api.selectCbzFiles();
    if (!Array.isArray(paths) || !paths.length) return;
    const newEntries = paths
      .filter((p) => typeof p === 'string' && p.toLowerCase().endsWith('.cbz'))
      .map((p) => { const sep = p.includes('/') ? '/' : '\\'; const parts = p.split(sep); return { path: p, name: parts[parts.length - 1] }; });
    if (!newEntries.length) return;
    setFileList((prev) => { const existing = new Set(prev.map((f) => f.path)); return [...prev, ...newEntries.filter((e) => !existing.has(e.path))]; });
    setResult(null);
  };

  const handleRemove = (index) => { setFileList((prev) => prev.filter((_, i) => i !== index)); setResult(null); };

  const handleDragStart = (e, index) => { dragIndexRef.current = index; e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, index) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    setFileList((prev) => { const next = [...prev]; const [item] = next.splice(from, 1); next.splice(index, 0, item); dragIndexRef.current = index; return next; });
  };
  const handleDrop = (e) => { e.preventDefault(); dragIndexRef.current = null; };
  const handleDragEnd = () => { dragIndexRef.current = null; };

  const handleBrowseOutputDir = async () => {
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (dir) setOutputDir(dir);
  };

  const handleCombine = async () => {
    if (!api?.combineCbz || fileList.length < 2) return;
    setResult(null); setProgress(null); setRunning(true);
    try {
      const payload = {
        inputFiles: fileList.map((f) => f.path),
        ...(outputDir.trim() ? { outputDir: outputDir.trim() } : {}),
        ...(outputFileName.trim() ? { outputFileName: outputFileName.trim() } : {}),
      };
      const r = await api.combineCbz(payload);
      setResult(r);
      if (r?.ok && openFolderAfter && api.openPath) {
        const targetDir = outputDir.trim() || (r.outputFile ? (() => { const sep = r.outputFile.includes('/') ? '/' : '\\'; const parts = r.outputFile.split(sep); parts.pop(); return parts.join(sep) || sep; })() : null);
        if (targetDir) await api.openPath(targetDir);
      }
    } catch (e) {
      setResult({ ok: false, error: String(e?.message || e) || t('app.log.fetchErrorUnknown') });
    } finally { setRunning(false); setProgress(null); }
  };

  const progressPct = progress && progress.total > 0 ? Math.min(100, Math.round((100 * progress.done) / progress.total)) : null;
  const combineDisabled = running || fileList.length < 2;

  if (!hasElectron) {
    return <div className="flex-1 flex flex-col p-8"><p className="text-sm text-amber-700 dark:text-amber-300">{t('combineTab.desktopOnly')}</p></div>;
  }

  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden min-h-0">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 shrink-0 px-8 pt-6 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={running}
            onClick={handleAddFiles}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-surface-container-highest text-on-surface font-medium border border-outline-variant/20 hover:bg-surface-bright disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {t('combineTab.addFiles')}
          </button>
          <button
            type="button"
            disabled={combineDisabled}
            onClick={handleCombine}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-tertiary-container text-on-tertiary-container font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">merge</span>
            {running ? t('combineTab.combining') : t('combineTab.combine')}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-on-surface-variant">
            <input type="checkbox" checked={openFolderAfter} onChange={(e) => setOpenFolderAfter(e.target.checked)} disabled={running} className="rounded accent-primary" />
            {t('combineTab.openFolderAfter')}
          </label>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 flex flex-col px-8 pb-6 gap-5 overflow-y-auto custom-scrollbar min-h-0">

        {/* File list */}
        <div className="shrink-0">
          {fileList.length > 0 ? (
            <ul className="rounded-xl border border-outline-variant/15 overflow-hidden bg-surface-container-lowest/50 shadow-sm divide-y divide-outline-variant/10">
              {fileList.map((file, i) => (
                <li
                  key={file.path}
                  draggable={!running}
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  className="flex items-center gap-2 px-3 py-2.5 bg-surface-container-highest/40 hover:bg-surface-container-high transition-colors select-none"
                  data-tooltip={t('combineTab.dragHint')}
                >
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0 cursor-grab active:cursor-grabbing">drag_indicator</span>
                  <span className="flex-1 min-w-0 text-sm text-on-surface truncate font-mono">{file.name}</span>
                  <button type="button" disabled={running} onClick={() => handleRemove(i)} aria-label={t('combineTab.removeFile')} className="shrink-0 inline-flex items-center justify-center rounded p-1 text-error hover:bg-surface-container-high cursor-pointer disabled:opacity-40">
                    <span className="material-symbols-outlined text-[18px] leading-none">close</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {fileList.length > 0 && fileList.length < 2 ? (
            <p className="mt-1.5 text-xs text-on-surface-variant">{t('combineTab.needTwoFiles')}</p>
          ) : null}
        </div>

        {/* Output file name */}
        <div className="shrink-0 space-y-1.5">
          <label className="text-xs font-bold text-on-surface-variant tracking-widest uppercase">{t('combineTab.outputFileName')}</label>
          <input type="text" value={outputFileName} onChange={(e) => setOutputFileName(e.target.value)} placeholder={t('combineTab.outputFileNamePlaceholder')} disabled={running} className="w-full bg-surface-container-highest border-none rounded-md text-sm h-10 px-3 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50" />
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
              {progress?.total ? `${progress.label ? `${progress.label} — ` : ''}${progress.done} / ${progress.total}` : t('combineTab.combining')}
            </p>
          </div>
        ) : null}

        {/* Result */}
        {result && !running ? (
          result.ok ? (
            <p className="shrink-0 text-sm text-on-surface border border-outline-variant/20 rounded-lg p-3 bg-surface-container-highest/50">
              {t('combineTab.successMsg', { file: result.outputFile || '' })}
            </p>
          ) : (
            <p className="shrink-0 text-sm text-error whitespace-pre-wrap" role="alert">{result.error}</p>
          )
        ) : null}

      </div>
    </div>
  );
}
