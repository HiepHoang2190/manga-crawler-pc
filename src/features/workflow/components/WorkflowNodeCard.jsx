import React, { useRef } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { NODE_DEFINITIONS } from '../engine/nodeDefinitions';
import { isPortCompatible, getNodeOutputs } from '../engine/workflowGraph';
import { formatDurationMs } from '../engine/workflowEditingUtils';
import WorkflowPort from './WorkflowPort';

function getFolderDisplayName(fullPath) {
  if (!fullPath) return '';
  const parts = fullPath.split(/[/\\]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : fullPath;
}

const EXPORT_PREVIEW_META = {
  export_cbz: { icon: 'archive', label: 'CBZ' },
  export_pdf: { icon: 'picture_as_pdf', label: 'PDF' },
  export_epub: { icon: 'menu_book', label: 'EPUB' },
  export_mobi: { icon: 'tablet_android', label: 'MOBI' },
};

const KNOWN_PREVIEW_TYPES = new Set([
  'manga_crawler',
  'manual_trigger',
  'folder_trigger',
  'chapter_selector',
  'downloader',
  'export_cbz',
  'export_pdf',
  'export_epub',
  'export_mobi',
  'upload_google_drive',
  'duplicate_cleaner',
  'send_to_kindle',
  'image_upscale',
  'image_compress',
  'translate',
  'convert_book',
  'split_double_page',
  'rename_folder',
]);

export default function WorkflowNodeCard({
  node,
  isSelected = false,
  nodeState = null,
  edges = [],
  onSelect,
  onRemove,
  onDuplicate,
  onToggleDisabled,
  onDragStart,
  onStartConnect,
  onCompleteConnect,
  onCancelConnect,
  onDisconnectPort,
  onConnectError,
  onRetryNode,
  connecting = null,
  validationError = null,
}) {
  const { t } = useI18n();
  const def = NODE_DEFINITIONS[node.type] || {
    title: node.type,
    icon: 'extension',
    color: 'from-surface-container to-surface-container-high border-outline-variant/30',
    inputs: [],
    outputs: [],
  };

  const status = nodeState?.status || 'idle';
  const durationLabel = formatDurationMs(nodeState?.durationMs);
  const isDisabled = Boolean(node.data?.disabled);
  const cardRef = useRef(null);

  // Check relationship to active connecting wire
  const isOriginNode = Boolean(
    connecting &&
    (connecting.fromType === 'input' ? connecting.targetNodeId === node.id : connecting.sourceNodeId === node.id)
  );

  const activeOutputs = getNodeOutputs(node, def);

  const hasCompatiblePort = Boolean(
    connecting &&
    !isOriginNode &&
    (connecting.fromType === 'input'
      ? activeOutputs.some((p) => isPortCompatible(p.type, connecting.targetHandleType))
      : def.inputs.some((p) => isPortCompatible(connecting.sourceHandleType, p.type)))
  );

  const isDimmedWhenConnecting = Boolean(connecting && !isOriginNode && !hasCompatiblePort);

  const handleMouseDown = (e) => {
    // Ignore click on delete/action buttons or ports
    if (e.target.closest('button') || e.target.closest('[data-port-id]')) return;
    if (e.button !== 0) return;
    e.stopPropagation();

    // If currently dragging a wire, clicking node card cancels the wire
    if (connecting) {
      onCancelConnect && onCancelConnect();
      return;
    }

    e.preventDefault();
    onSelect && onSelect(node.id);
    onDragStart && onDragStart(node.id, e.clientX, e.clientY);
  };

  // Status visual configurations
  let statusBorder = 'border-outline-variant/30 hover:border-outline-variant/50';
  let statusGlow = '';
  if (isDisabled) {
    statusBorder = isSelected
      ? 'border-dashed border-primary ring-2 ring-primary/30'
      : 'border-dashed border-outline-variant/40';
  } else if (isSelected) {
    statusBorder = 'border-primary ring-2 ring-primary/30';
  }
  if (validationError && status === 'idle' && !isDisabled) {
    statusBorder = isSelected
      ? 'border-amber-500 ring-2 ring-amber-500/60'
      : 'border-amber-500/80 ring-2 ring-amber-500/30';
    statusGlow = 'shadow-[0_0_15px_rgba(245,158,11,0.25)]';
  }
  if (hasCompatiblePort) {
    statusBorder = 'border-primary/80 ring-2 ring-primary/40';
    statusGlow = 'shadow-[0_0_20px_rgba(56,189,248,0.25)]';
  } else if (isOriginNode) {
    statusBorder = 'border-primary ring-2 ring-primary/30';
  }
  if (status === 'running') {
    statusBorder = 'border-cyan-400 ring-4 ring-cyan-400/30';
    statusGlow = 'shadow-[0_0_25px_rgba(34,211,238,0.25)]';
  } else if (status === 'completed') {
    statusBorder = 'border-emerald-500/80';
  } else if (status === 'failed') {
    statusBorder = 'border-error ring-2 ring-error/30';
  } else if (status === 'skipped') {
    statusBorder = 'border-dashed border-outline-variant/50';
  }

  const nodeTitle = t(`workflow.nodeDef.${node.type}.title`, def.title);
  const exportMeta = EXPORT_PREVIEW_META[node.type];

  return (
    <div
      ref={cardRef}
      id={`wf-node-${node.id}`}
      data-canvas-node-type={node.type}
      style={{
        transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
        position: 'absolute',
        top: 0,
        left: 0,
      }}
      onMouseDown={handleMouseDown}
      className={`w-64 rounded-2xl bg-surface-container-lowest/95 backdrop-blur-md border ${statusBorder} ${statusGlow} shadow-md transition-all select-none group cursor-grab active:cursor-grabbing z-10 text-on-surface ${
        isDimmedWhenConnecting ? 'opacity-35' : isDisabled ? 'opacity-65 saturate-50' : ''
      }`}
    >
      {/* Node Header */}
      <div className={`px-3.5 py-2.5 rounded-t-2xl bg-gradient-to-r ${def.color} flex items-center justify-between gap-1.5 border-b border-outline-variant/20`}>
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <span className="material-symbols-outlined text-lg text-on-surface shrink-0">
            {def.icon}
          </span>
          <span className={`text-xs font-semibold text-on-surface truncate ${isDisabled ? 'line-through opacity-75' : ''}`}>
            {nodeTitle}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isDisabled && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-surface-container-highest/90 text-on-surface-variant border border-outline-variant/40 shrink-0">
              {t('workflow.node.bypassedBadge')}
            </span>
          )}
          {validationError && status === 'idle' && !isDisabled && (
            <span
              className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-0.5 shrink-0"
              data-tooltip={validationError}
            >
              <span className="material-symbols-outlined text-[11px]">warning</span>
              <span className="truncate max-w-[70px]">{validationError}</span>
            </span>
          )}
          {hasCompatiblePort && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-primary text-on-primary shadow-xs animate-pulse">
              {t('workflow.node.compatiblePort')}
            </span>
          )}
          {isOriginNode && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-primary/20 text-primary border border-primary/40">
              {t('workflow.node.connectingOrigin')}
            </span>
          )}

          {onToggleDisabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleDisabled(node.id);
              }}
              data-tooltip={isDisabled ? t('workflow.node.enableTooltip') : t('workflow.node.bypassTooltip')}
              aria-label={isDisabled ? t('workflow.node.enableTooltip') : t('workflow.node.bypassTooltip')}
              className={`cursor-pointer w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                isDisabled
                  ? 'text-amber-500 bg-amber-500/15 hover:bg-amber-500/25'
                  : `text-on-surface-variant/60 hover:text-amber-500 hover:bg-amber-500/10 ${
                      isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                    }`
              }`}
            >
              <span className="material-symbols-outlined text-xs">block</span>
            </button>
          )}

          {onDuplicate && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(node.id);
              }}
              data-tooltip={t('workflow.node.duplicateNode')}
              aria-label={t('workflow.node.duplicateNode')}
              className={`cursor-pointer w-5 h-5 rounded-md flex items-center justify-center text-on-surface-variant/60 hover:text-primary hover:bg-primary/15 transition-all ${
                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
              }`}
            >
              <span className="material-symbols-outlined text-xs">content_copy</span>
            </button>
          )}

          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(node.id);
              }}
              data-tooltip={t('workflow.node.deleteNode')}
              aria-label={t('workflow.node.deleteNode')}
              className="cursor-pointer w-5 h-5 rounded-md flex items-center justify-center text-on-surface-variant/70 hover:text-error hover:bg-error/15 transition-colors"
            >
              <span className="material-symbols-outlined text-xs">delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Ports Area */}
      <div className="px-3.5 py-3 space-y-2">
        {/* Render Inputs and Outputs side-by-side */}
        <div className="flex justify-between gap-4">
          {/* Inputs Column */}
          <div className="flex-1 space-y-1.5">
            {def.inputs.map((port) => {
              const isConnected = edges.some((e) => e.target === node.id && e.targetHandle === port.id);
              return (
                <WorkflowPort
                  key={port.id}
                  nodeId={node.id}
                  port={port}
                  isOutput={false}
                  connecting={connecting}
                  isConnected={isConnected}
                  onStartConnect={onStartConnect}
                  onCompleteConnect={onCompleteConnect}
                  onCancelConnect={onCancelConnect}
                  onDisconnectPort={onDisconnectPort}
                  onConnectError={onConnectError}
                />
              );
            })}
            {def.inputs.length === 0 && (
              <span className="text-[10px] text-on-surface-variant/50 italic">{t('workflow.node.noInputs')}</span>
            )}
          </div>

          {/* Outputs Column */}
          <div className="flex-1 space-y-1.5 text-right">
            {activeOutputs.map((port) => {
              const isConnected = edges.some((e) => e.source === node.id && e.sourceHandle === port.id);
              return (
                <WorkflowPort
                  key={port.id}
                  nodeId={node.id}
                  port={port}
                  isOutput={true}
                  connecting={connecting}
                  isConnected={isConnected}
                  onStartConnect={onStartConnect}
                  onCompleteConnect={onCompleteConnect}
                  onCancelConnect={onCancelConnect}
                  onDisconnectPort={onDisconnectPort}
                  onConnectError={onConnectError}
                />
              );
            })}
            {activeOutputs.length === 0 && (
              <span className="text-[10px] text-on-surface-variant/50 italic">{t('workflow.node.endPoint')}</span>
            )}
          </div>
        </div>

        {/* Node preview summary (URL, strategy, folder, format, AI settings, etc.) */}
        {node.type === 'manga_crawler' && (
          <div className="space-y-1">
            <div className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs shrink-0 text-sky-400">
                {node.data?.mangaTitle ? 'menu_book' : 'link'}
              </span>
              <span className="truncate font-medium">
                {node.data?.mangaTitle || node.data?.defaultUrl || t('workflow.node.noUrlSpecified')}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-on-surface-variant/80 px-1 font-mono">
              <span className="material-symbols-outlined text-[11px] text-primary shrink-0">filter_list</span>
              <span className="truncate">
                {node.data?.strategy === 'latest'
                  ? t('workflow.node.latestChapters', { count: node.data?.latestCount || 1 })
                  : node.data?.strategy === 'range'
                  ? t('workflow.node.rangeChapters', { range: node.data?.rangeValue || t('workflow.node.allChapters') })
                  : node.data?.strategy === 'custom'
                  ? `${node.data?.selectedChapterIds?.length || 0} chap`
                  : t('workflow.node.allChapters')}
              </span>
            </div>
          </div>
        )}

        {node.type === 'manual_trigger' && (
          <div className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs shrink-0 text-primary">
              {node.data?.mangaTitle ? 'menu_book' : 'link'}
            </span>
            <span className="truncate">
              {node.data?.mangaTitle || node.data?.defaultUrl || t('workflow.node.noUrlSpecified')}
            </span>
          </div>
        )}

        {node.type === 'folder_trigger' && (
          <div
            className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1"
            data-tooltip={node.data?.folderPath || t('workflow.node.noFolderSpecified')}
          >
            <span className="material-symbols-outlined text-xs shrink-0 text-amber-500">
              folder_open
            </span>
            <span className="truncate">
              {node.data?.folderPath
                ? getFolderDisplayName(node.data.folderPath)
                : t('workflow.node.noFolderSpecified')}
            </span>
          </div>
        )}

        {node.type === 'chapter_selector' && (
          <div className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs shrink-0 text-indigo-400">filter_alt</span>
            <span className="truncate">
              {node.data?.strategy === 'latest'
                ? t('workflow.node.latestChapters', { count: node.data?.latestCount || 1 })
                : node.data?.strategy === 'range'
                ? t('workflow.node.rangeChapters', { range: node.data?.rangeValue || t('workflow.node.allChapters') })
                : t('workflow.node.allChapters')}
            </span>
          </div>
        )}

        {node.type === 'downloader' && (
          <div
            className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1"
            data-tooltip={node.data?.outputBaseDir || t('workflow.node.defaultDownloadsDir')}
          >
            <span className="material-symbols-outlined text-xs shrink-0 text-cyan-400">folder</span>
            <span className="truncate">
              {node.data?.outputBaseDir ? getFolderDisplayName(node.data.outputBaseDir) : t('workflow.node.downloadsDir')}
            </span>
          </div>
        )}

        {exportMeta && (
          <div
            className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1"
            data-tooltip={node.data?.outputDir || t('workflow.node.sameAsMangaDir')}
          >
            <span className="material-symbols-outlined text-xs shrink-0 text-amber-500">
              {exportMeta.icon}
            </span>
            <span className="truncate">
              {node.data?.outputDir
                ? getFolderDisplayName(node.data.outputDir)
                : t('workflow.node.exportFormat', { format: exportMeta.label })}
            </span>
          </div>
        )}

        {node.type === 'image_upscale' && (
          <div className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1 font-mono">
            <span className="material-symbols-outlined text-xs shrink-0 text-violet-400">auto_fix_high</span>
            <span className="truncate">
              {(node.data?.engine || 'mangajanai')} • {node.data?.scale || 2}x
            </span>
          </div>
        )}

        {node.type === 'image_compress' && (
          <div className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1 font-mono">
            <span className="material-symbols-outlined text-xs shrink-0 text-sky-400">tune</span>
            <span className="truncate">
              {String(node.data?.format || 'original').toUpperCase()} • Q{node.data?.quality ?? 85}
            </span>
          </div>
        )}

        {node.type === 'translate' && (
          <div className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1 font-mono">
            <span className="material-symbols-outlined text-xs shrink-0 text-pink-400">translate</span>
            <span className="truncate">
              {String(node.data?.sourceLang || 'ja').toUpperCase()} ➔ {String(node.data?.targetLang || 'vi').toUpperCase()}
            </span>
          </div>
        )}

        {node.type === 'convert_book' && (
          <div className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1 font-mono">
            <span className="material-symbols-outlined text-xs shrink-0 text-teal-400">sync_alt</span>
            <span className="truncate">
              ➔ {String(node.data?.targetFormat || 'epub').toUpperCase()}
            </span>
          </div>
        )}

        {node.type === 'split_double_page' && (
          <div className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1 font-mono">
            <span className="material-symbols-outlined text-xs shrink-0 text-orange-400">vertical_split</span>
            <span className="truncate">
              {String(node.data?.readingDirection || 'rtl').toUpperCase()}
            </span>
          </div>
        )}

        {node.type === 'rename_folder' && (
          <div className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1 font-mono">
            <span className="material-symbols-outlined text-xs shrink-0 text-emerald-400">drive_file_rename_outline</span>
            <span className="truncate">
              {node.data?.mode === 'customPattern' && node.data?.pattern
                ? node.data.pattern
                : node.data?.mode === 'findReplace' && node.data?.find
                ? `${node.data.find} ➔ ${node.data.replace || ''}`
                : 'autoNormalize'}
            </span>
          </div>
        )}

        {node.type === 'upload_google_drive' && (
          <div
            className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1"
            data-tooltip={
              node.data?.uploadMode === 'api_token'
                ? 'Google Drive REST API'
                : node.data?.syncFolderPath || t('workflow.node.gdriveDesktop')
            }
          >
            <span className="material-symbols-outlined text-xs shrink-0 text-blue-400">cloud_upload</span>
            <span className="truncate">
              {node.data?.uploadMode === 'api_token'
                ? node.data?.accessToken
                  ? 'Google Drive API'
                  : t('workflow.node.gdriveNoToken')
                : node.data?.syncFolderPath
                ? getFolderDisplayName(node.data.syncFolderPath)
                : t('workflow.node.gdriveDesktop')}
            </span>
          </div>
        )}

        {node.type === 'duplicate_cleaner' && (
          <div className="space-y-1">
            {node.data?.smartMode !== false && (
              <div className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                <span className="material-symbols-outlined text-[12px] leading-none">auto_awesome</span>
                <span>{t('workflow.node.duplicateSmartBadge')}</span>
              </div>
            )}
            {node.data?.folderPath && (
              <div
                className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1"
                data-tooltip={node.data.folderPath}
              >
                <span className="material-symbols-outlined text-xs shrink-0 text-amber-500">folder</span>
                <span className="truncate">{getFolderDisplayName(node.data.folderPath)}</span>
              </div>
            )}
          </div>
        )}

        {node.type === 'send_to_kindle' && (
          <div
            className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20 flex items-center gap-1"
            data-tooltip="Amazon Send to Kindle"
          >
            <span className="material-symbols-outlined text-xs shrink-0 text-violet-400">tablet_android</span>
            <span className="truncate">Amazon Send to Kindle</span>
          </div>
        )}

        {!KNOWN_PREVIEW_TYPES.has(node.type) && node.data?.defaultUrl && (
          <div className="text-[10px] text-on-surface-variant truncate bg-surface-container px-2 py-1 rounded-md border border-outline-variant/20">
            {node.data.defaultUrl}
          </div>
        )}
      </div>

      {/* Node Status Footer (if running, completed, failed, or skipped) */}
      {status !== 'idle' && (
        <div className="px-3 py-1.5 rounded-b-2xl border-t border-outline-variant/20 bg-surface-container-low/60 flex items-center justify-between text-[11px] text-on-surface gap-2">
          {status === 'running' && (
            <div
              className="flex items-center gap-1.5 text-cyan-400 font-medium truncate min-w-0"
              data-tooltip={nodeState?.progressData?.message || t('workflow.node.statusRunning')}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
              <span className="truncate">{nodeState?.progressData?.message || t('workflow.node.statusRunning')}</span>
            </div>
          )}

          {status === 'completed' && (
            <>
              <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span>{t('workflow.node.statusCompleted')}</span>
              </div>
              {durationLabel && (
                <span className="text-[10px] font-mono text-on-surface-variant/80 shrink-0">
                  {durationLabel}
                </span>
              )}
            </>
          )}

          {status === 'skipped' && (
            <div className="flex items-center gap-1.5 text-on-surface-variant font-medium">
              <span className="material-symbols-outlined text-sm">skip_next</span>
              <span>{t('workflow.node.statusSkipped')}</span>
            </div>
          )}

          {status === 'failed' && (
            <div className="flex items-center justify-between w-full gap-1.5">
              <div
                className="flex items-center gap-1 text-error truncate max-w-[120px]"
                data-tooltip={nodeState?.error || t('workflow.node.statusFailed')}
              >
                <span className="material-symbols-outlined text-sm">error</span>
                <span className="truncate text-[10px]">{nodeState?.error || t('workflow.node.statusFailed')}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {durationLabel && (
                  <span className="text-[10px] font-mono text-on-surface-variant/80">
                    {durationLabel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetryNode && onRetryNode(node.id);
                  }}
                  className="cursor-pointer px-2 py-0.5 rounded bg-error/15 hover:bg-error/25 text-error text-[10px] font-medium transition-colors"
                >
                  {t('workflow.node.retry')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
