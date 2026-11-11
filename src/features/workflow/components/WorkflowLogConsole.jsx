import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { NODE_DEFINITIONS } from '../engine/nodeDefinitions';
import { getTopologicallyOrderedNodes } from '../engine/workflowGraph';

const STEP_BADGE_MAP = {
  manual_trigger: 'TRIGGER',
  trigger: 'TRIGGER',
  chapter_selector: 'FILTER',
  filter: 'FILTER',
  downloader: 'DOWNLOAD',
  download: 'DOWNLOAD',
  export_cbz: 'CBZ',
  cbz: 'CBZ',
  export_pdf: 'PDF',
  pdf: 'PDF',
  trash_cleanup: 'CLEANUP',
  cleanup: 'CLEANUP',
  split_double_page: 'SPLIT',
  deskew: 'DESKEW',
  rename_folder: 'RENAME',
  image_convert: 'CONVERT',
  translate: 'TRANSLATE',
  send_to_kindle: 'KINDLE',
  upload_google_drive: 'GDRIVE',
  gdrive: 'GDRIVE',
  system: 'SYSTEM',
};

export default function WorkflowLogConsole({
  workflowName = 'Workflow',
  nodes = [],
  edges = [],
  nodeStates = {},
  logs = [],
  isRunning = false,
  isCompleted = false,
  isError = false,
  errorMessage = '',
  lastOutputDir = null,
  onClearLogs,
  onStop,
  onClose,
}) {
  const { t } = useI18n();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showTerminalLogs, setShowTerminalLogs] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const logConsoleRef = useRef(null);

  // Auto-scroll terminal log
  useEffect(() => {
    if (showTerminalLogs && autoScroll && logConsoleRef.current && !isCollapsed) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [logs, showTerminalLogs, autoScroll, isCollapsed]);

  // Copy logs handler
  const handleCopyLogs = useCallback(() => {
    if (!logs || logs.length === 0) return;
    const text = logs
      .map((l) => `[${l.time}] [${(l.step || 'INFO').toUpperCase()}] ${l.message}`)
      .join('\n');
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [logs]);

  // Open output folder or file
  const handleOpenOutputDir = () => {
    const api = window.electronAPI || window.electron;
    if (lastOutputDir && api) {
      if (
        api.showItemInFolder &&
        (lastOutputDir.endsWith('.cbz') ||
          lastOutputDir.endsWith('.pdf') ||
          lastOutputDir.endsWith('.epub') ||
          lastOutputDir.endsWith('.zip'))
      ) {
        api.showItemInFolder(lastOutputDir);
      } else if (api.openPath) {
        api.openPath(lastOutputDir);
      }
    }
  };

  // Topologically sort nodes according to execution graph order
  const orderedNodes = useMemo(() => {
    return getTopologicallyOrderedNodes(nodes, edges);
  }, [nodes, edges]);

  // Build steps list from nodes in execution DAG order
  const steps = useMemo(() => {
    return (orderedNodes || []).map((n, idx) => {
      const def = NODE_DEFINITIONS[n.type] || { title: n.type, icon: 'settings' };
      const state = nodeStates[n.id] || { status: 'idle' };
      const isDone = state.status === 'completed';
      const isCurrent = state.status === 'running';
      const isErr = state.status === 'failed';
      return {
        id: n.id,
        stepNum: idx + 1,
        type: n.type,
        label: n.data?.mangaTitle || t(`workflow.nodeDef.${n.type}.title`, def.title) || n.type,
        icon: def.icon || 'settings',
        status: state.status,
        isDone,
        isCurrent,
        isErr,
      };
    });
  }, [orderedNodes, nodeStates, t]);

  // Calculate percentage
  const percent = useMemo(() => {
    if (isCompleted) return 100;
    if (!steps.length) return 0;
    const completedCount = steps.filter((s) => s.isDone).length;
    const activeStep = steps.find((s) => s.isCurrent);
    let subPercent = 0;
    if (activeStep && nodeStates[activeStep.id]?.progressData?.percent) {
      subPercent = Number(nodeStates[activeStep.id].progressData.percent) / 100;
    }
    return Math.min(99, Math.round(((completedCount + subPercent) / steps.length) * 100));
  }, [isCompleted, steps, nodeStates]);

  // Current active step & detail message
  const activeStep = steps.find((s) => s.isCurrent);
  const activeMessage = isError
    ? errorMessage || t('workflow.console.stoppedError')
    : activeStep
    ? nodeStates[activeStep.id]?.progressData?.message || t('workflow.console.processingStep', { name: activeStep.label })
    : isCompleted
    ? t('workflow.console.completedAll')
    : logs[logs.length - 1]?.message || t('workflow.console.ready');

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-40 animate-slideDown select-none pointer-events-auto w-full px-4 transition-all duration-300 ${
        isCollapsed ? 'top-2.5 max-w-xl' : 'top-3.5 max-w-2xl'
      }`}
    >
      <div
        className={`rounded-2xl bg-surface-container-lowest/95 text-on-surface backdrop-blur-xl shadow-2xl border transition-all duration-300 flex flex-col ${
          isCollapsed
            ? 'border-primary/40 px-3.5 py-2 gap-1.5 shadow-xl'
            : isError
            ? 'border-rose-500/40 p-3.5 gap-2.5'
            : isCompleted
            ? 'border-emerald-500/40 p-3.5 gap-2.5'
            : 'border-primary/30 p-3.5 gap-2.5'
        }`}
      >
        {/* ─── Top Header Row (Click anywhere to Collapse/Expand) ─── */}
        <div
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex items-center justify-between gap-2.5 cursor-pointer select-none group"
          data-tooltip={isCollapsed ? t('workflow.console.expandTooltip') : t('workflow.console.collapseTooltip')}
        >
          {/* Left: Status Icon & Title */}
          <div className="flex items-center gap-2 min-w-0">
            {isRunning ? (
              <span className="material-symbols-outlined text-[19px] text-primary animate-spin shrink-0">
                progress_activity
              </span>
            ) : isError ? (
              <span className="material-symbols-outlined text-[19px] text-rose-500 shrink-0">
                error
              </span>
            ) : isCompleted ? (
              <span className="material-symbols-outlined text-[19px] text-emerald-500 shrink-0">
                check_circle
              </span>
            ) : (
              <span className="material-symbols-outlined text-[19px] text-primary shrink-0">
                terminal
              </span>
            )}

            <span className="font-bold text-xs text-on-surface truncate max-w-xs sm:max-w-sm group-hover:text-primary transition-colors">
              {isRunning
                ? activeStep
                  ? `${workflowName} • ${activeStep.label}`
                  : t('workflow.console.runningWorkflow', { name: workflowName })
                : isError
                ? t('workflow.console.errorWorkflow', { name: workflowName })
                : isCompleted
                ? t('workflow.console.completedWorkflow', { name: workflowName })
                : workflowName}
            </span>

            {!isCollapsed && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
                  isRunning
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 animate-pulse'
                    : isError
                    ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                    : isCompleted
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-primary/10 text-primary border-primary/20'
                }`}
              >
                {isRunning
                  ? t('workflow.console.statusRunning')
                  : isError
                  ? t('workflow.console.statusError')
                  : isCompleted
                  ? t('workflow.console.statusCompleted')
                  : t('workflow.console.statusReady')}
              </span>
            )}
          </div>

          {/* Right: Percent & Action Buttons (Stop propagation so button clicks don't toggle collapse) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 shrink-0 cursor-default"
          >
            <span className="text-xs font-mono font-bold text-primary mr-0.5">
              {percent}%
            </span>

            {/* Toggle Terminal Log Console */}
            {!isCollapsed && (
              <button
                type="button"
                onClick={() => setShowTerminalLogs((prev) => !prev)}
                className={`text-[11px] px-2 py-1 rounded-lg border transition-colors cursor-pointer flex items-center gap-1 font-medium ${
                  showTerminalLogs
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                }`}
                data-tooltip={showTerminalLogs ? t('workflow.console.hideLogs') : t('workflow.console.showLogs')}
                aria-label={showTerminalLogs ? t('workflow.console.hideLogs') : t('workflow.console.showLogs')}
              >
                <span className="material-symbols-outlined text-[13px]">terminal</span>
                <span>{t('workflow.console.logs')} {logs.length > 0 ? `(${logs.length})` : ''}</span>
              </button>
            )}

            {/* Open Output Directory Button */}
            {lastOutputDir && (
              <button
                type="button"
                onClick={handleOpenOutputDir}
                className="text-[11px] px-2 py-1 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary transition-colors cursor-pointer flex items-center gap-1 font-medium shadow-2xs"
                data-tooltip={t('workflow.console.openDirTooltip', { path: lastOutputDir })}
                aria-label={t('workflow.console.openDirTooltip', { path: lastOutputDir })}
              >
                <span className="material-symbols-outlined text-[13px]">folder_open</span>
                <span className={isCollapsed ? 'hidden sm:inline' : ''}>{t('workflow.console.openDir')}</span>
              </button>
            )}

            {/* Stop or Close Button */}
            {isRunning ? (
              <button
                type="button"
                onClick={onStop}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1 font-medium"
                data-tooltip={t('workflow.console.stopTooltip')}
                aria-label={t('workflow.console.stopTooltip')}
              >
                <span className="material-symbols-outlined text-[14px]">stop_circle</span>
                <span>{t('workflow.console.stop')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="text-[11px] px-2 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer flex items-center gap-1 font-medium"
                data-tooltip={t('workflow.console.closeTooltip')}
                aria-label={t('workflow.console.closeTooltip')}
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* ─── Mini Progress Bar when Collapsed ─── */}
        {isCollapsed && (
          <div className="w-full h-1 rounded-full bg-surface-container overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isCompleted
                  ? 'bg-emerald-500'
                  : isError
                  ? 'bg-rose-500'
                  : 'bg-gradient-to-r from-primary via-primary to-emerald-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}

        {/* ─── Full Details when Expanded ─── */}
        {!isCollapsed && (
          <>
            {/* Visual Stepper (Giống Dịch Manga) */}
            {steps.length > 0 && (
              <div
                className={`grid gap-1.5 ${
                  steps.length <= 4
                    ? `grid-cols-${steps.length}`
                    : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'
                }`}
              >
                {steps.map((s) => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-1.5 p-1.5 rounded-xl border text-[11px] transition-all ${
                      s.isDone
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold'
                        : s.isCurrent
                        ? 'bg-primary/15 border-primary/50 text-primary font-bold shadow-2xs'
                        : s.isErr
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 font-semibold'
                        : 'border-outline-variant/15 bg-surface-container/50 text-on-surface-variant/70'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] shrink-0">
                      {s.isDone
                        ? 'check_circle'
                        : s.isCurrent
                        ? 'progress_activity'
                        : s.isErr
                        ? 'error'
                        : s.icon}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Smooth Gradient Progress Bar */}
            <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  isCompleted
                    ? 'bg-emerald-500'
                    : isError
                    ? 'bg-rose-500'
                    : 'bg-gradient-to-r from-primary via-primary to-emerald-500'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>

            {/* Detail Summary Line */}
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
              <span
                className={`truncate max-w-lg font-medium ${
                  isError ? 'text-rose-400 font-semibold' : 'text-on-surface'
                }`}
                data-tooltip={activeMessage}
              >
                {activeMessage}
              </span>

              {isCompleted ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5 shrink-0">
                  <span className="material-symbols-outlined text-[13px]">verified</span>
                  <span>{t('workflow.console.allCompleted')}</span>
                </span>
              ) : isError ? (
                <span className="text-rose-400 font-semibold flex items-center gap-0.5 shrink-0">
                  <span className="material-symbols-outlined text-[13px]">error</span>
                  <span>{t('workflow.console.stopped')}</span>
                </span>
              ) : null}
            </div>

            {/* Live Streaming Terminal Log Console (Giống Dịch Manga) */}
            {showTerminalLogs && (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-outline-variant/20">
                <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                  <span className="flex items-center gap-1 font-semibold text-on-surface">
                    <span className="material-symbols-outlined text-[14px] text-primary">terminal</span>
                    <span>{t('workflow.console.detailedLogs', { count: logs.length })}</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-[10px] text-on-surface-variant cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="accent-primary rounded w-3 h-3"
                      />
                      <span>{t('workflow.console.autoScroll')}</span>
                    </label>

                    <button
                      type="button"
                      onClick={handleCopyLogs}
                      disabled={logs.length === 0}
                      className="text-[10px] text-on-surface-variant hover:text-primary transition-colors cursor-pointer flex items-center gap-0.5 disabled:opacity-40"
                      data-tooltip={t('workflow.console.copyLogsTooltip')}
                      aria-label={t('workflow.console.copyLogsTooltip')}
                    >
                      <span className="material-symbols-outlined text-[12px]">
                        {copied ? 'check' : 'content_copy'}
                      </span>
                      <span>{copied ? t('workflow.console.copied') : t('workflow.console.copyLogs')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={onClearLogs}
                      disabled={logs.length === 0}
                      className="text-[10px] text-on-surface-variant hover:text-error transition-colors cursor-pointer flex items-center gap-0.5 disabled:opacity-40"
                      data-tooltip={t('workflow.console.clearLogsTooltip')}
                      aria-label={t('workflow.console.clearLogsTooltip')}
                    >
                      <span className="material-symbols-outlined text-[12px]">delete_sweep</span>
                      <span>{t('workflow.console.clear')}</span>
                    </button>
                  </div>
                </div>

                <div
                  ref={logConsoleRef}
                  className="max-h-48 overflow-y-auto rounded-xl bg-surface-container-lowest border border-outline-variant/20 p-2.5 font-mono text-[11px] leading-relaxed space-y-1 shadow-inner select-text"
                >
                  {logs.length === 0 ? (
                    <div className="text-on-surface-variant/50 text-center py-3 italic text-[11px]">
                      {t('workflow.console.noEvents')}
                    </div>
                  ) : (
                    logs.map((log) => {
                      const isWarn = log.type === 'warn';
                      const isErr = log.type === 'error';
                      const isSuccess = log.type === 'success';

                      const rawStep = String(log.step || 'system').toLowerCase();
                      const stepBadge = STEP_BADGE_MAP[rawStep] || rawStep.toUpperCase();

                      let stepColor = 'text-primary';
                      if (isErr) stepColor = 'text-error';
                      else if (isWarn) stepColor = 'text-amber-500 dark:text-amber-400';
                      else if (isSuccess) stepColor = 'text-emerald-500 dark:text-emerald-400 font-bold';
                      else if (['DOWNLOAD', 'DOWNLOADER'].includes(stepBadge)) stepColor = 'text-cyan-500 dark:text-cyan-400';
                      else if (['CBZ', 'PDF'].includes(stepBadge)) stepColor = 'text-amber-500 dark:text-amber-400';
                      else if (['FILTER'].includes(stepBadge)) stepColor = 'text-indigo-500 dark:text-indigo-400';
                      else if (['TRIGGER'].includes(stepBadge)) stepColor = 'text-sky-500 dark:text-sky-400';
                      else if (['CLEANUP'].includes(stepBadge)) stepColor = 'text-rose-500 dark:text-rose-400';

                      return (
                        <div
                          key={log.id}
                          className={`flex items-start gap-1.5 py-0.5 transition-colors ${
                            isErr
                              ? 'text-error font-medium'
                              : isWarn
                              ? 'text-amber-600 dark:text-amber-300 font-medium'
                              : isSuccess
                              ? 'text-emerald-500 dark:text-emerald-400'
                              : 'text-on-surface'
                          }`}
                        >
                          <span className="text-[10px] text-on-surface-variant/60 shrink-0 select-none">
                            [{log.time}]
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 select-none bg-surface-container ${stepColor}`}
                          >
                            {stepBadge}
                          </span>
                          <span className="break-all whitespace-pre-wrap flex-1">{log.message}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
