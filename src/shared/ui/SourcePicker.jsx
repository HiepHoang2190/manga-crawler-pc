import { useI18n } from '../../context/I18nContext';

/**
 * Unified Source Picker Component for Manga/Image files and folders across the project.
 * Supports selecting a single directory, multiple directories, or selecting individual files with consistent styling.
 */
export default function SourcePicker({
  sourceDir = '',
  folders = [],
  sourceFiles = [],
  includeSubfolders = true,
  onIncludeSubfoldersChange,
  onSelectFolder,
  onAddFolder,
  onRemoveFolder,
  onSelectFiles,
  onClear,
  extraAction,
  disabled = false,
  title,
  folderLabel,
  filesLabel,
  folderIcon = 'folder',
  filesIcon = 'description',
  sourceModeFolderLabel,
  sourceModeFilesLabel,
  changeFolderLabel,
  changeFilesLabel,
  switchToFilesLabel,
  switchToFolderLabel,
  filesCountLabel,
  foldersMaxHeightClass = 'max-h-64 sm:max-h-72',
  className = '',
}) {
  const { t } = useI18n();

  // Determine folders list
  const folderList = Array.isArray(folders) && folders.length > 0 ? folders : sourceDir ? [sourceDir] : [];
  const hasFolders = folderList.length > 0;
  const isMultiFolder = folderList.length > 1;
  const hasFiles = Boolean(sourceFiles && sourceFiles.length > 0);

  // Resolved text with i18n fallbacks
  const resolvedHeading = title !== undefined ? title : (t('sourcePicker.selectSource') || t('crop.selectSource') || 'Nguồn dữ liệu');
  const resolvedFolderLabel = folderLabel || t('sourcePicker.selectFolder') || t('crop.selectFolder') || 'Chọn thư mục';
  const resolvedFilesLabel = filesLabel || t('sourcePicker.selectFiles') || t('crop.selectFiles') || 'Chọn file';
  const resolvedFolderModeText = sourceModeFolderLabel || t('sourcePicker.sourceModeFolder') || t('crop.sourceModeFolder') || 'Thư mục nguồn';
  const resolvedFilesModeText = sourceModeFilesLabel || t('sourcePicker.sourceModeFiles') || t('crop.sourceModeFiles') || 'Tệp đã chọn';
  const resolvedChangeFolder = changeFolderLabel || t('sourcePicker.changeFolder') || t('crop.changeFolder') || 'Đổi thư mục';
  const resolvedChangeFiles = changeFilesLabel || t('sourcePicker.changeFiles') || t('crop.changeFiles') || 'Chọn file khác';
  const resolvedSwitchToFiles = switchToFilesLabel || t('sourcePicker.switchToFiles') || t('crop.switchToFiles') || 'Chuyển sang chọn file';
  const resolvedSwitchToFolder = switchToFolderLabel || t('sourcePicker.switchToFolder') || t('crop.switchToFolder') || 'Chuyển sang chọn thư mục';
  const resolvedAddMoreFolders = t('duplicateTab.addMoreFolders') || 'Thêm thư mục khác';
  const resolvedClearAll = t('duplicateTab.clearAll') || t('sourcePicker.clearSource') || 'Xóa tất cả';

  return (
    <div className={`space-y-1.5 ${className}`}>
      {resolvedHeading && (
        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
          {resolvedHeading}
        </p>
      )}

      {hasFolders ? (
        <div className="space-y-1.5">
          {/* Danh sách các thư mục đã chọn (hỗ trợ cuộn nhẹ nếu nhiều thư mục) */}
          <div className={`space-y-1 ${foldersMaxHeightClass} overflow-y-auto custom-scrollbar pr-0.5`}>
            {folderList.map((folderPath) => {
              const folderName = folderPath.split(/[\\/]/).filter(Boolean).pop() || folderPath;
              return (
                <div
                  key={folderPath}
                  className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-2.5 py-1.5 group transition-colors"
                >
                  <span className="material-symbols-outlined shrink-0 text-[16px] text-primary">
                    {folderIcon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-on-surface">
                      {folderName}
                    </p>
                    <p className="truncate font-mono text-[10px] text-on-surface-variant/70">
                      {folderPath}
                    </p>
                  </div>
                  {(onRemoveFolder || onClear) && (
                    <button
                      type="button"
                      onClick={() => (onRemoveFolder ? onRemoveFolder(folderPath) : onClear?.())}
                      disabled={disabled}
                      data-tooltip={t('duplicateTab.removeFolder') || t('sourcePicker.clearSource') || 'Xóa thư mục'}
                      aria-label={t('duplicateTab.removeFolder') || t('sourcePicker.clearSource') || 'Xóa thư mục'}
                      className="flex h-6 w-6 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-error/10 hover:text-error transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Thanh công cụ phụ */}
          <div className="space-y-1.5 pt-0.5">
            {(onAddFolder || onSelectFolder) && (
              <button
                type="button"
                onClick={onAddFolder || onSelectFolder}
                disabled={disabled}
                className="w-full flex h-8 items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/35 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 text-xs font-semibold text-primary transition-all active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {onAddFolder ? 'create_new_folder' : 'sync'}
                </span>
                <span>{onAddFolder ? resolvedAddMoreFolders : resolvedChangeFolder}</span>
              </button>
            )}
            <div className="space-y-1 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                {onIncludeSubfoldersChange && (
                  <button
                    type="button"
                    onClick={() => onIncludeSubfoldersChange(!includeSubfolders)}
                    disabled={disabled}
                    aria-label={
                      includeSubfolders
                        ? (t('sourcePicker.subfoldersOn') || 'Cả thư mục con')
                        : (t('sourcePicker.subfoldersOff') || 'Chỉ thư mục này')
                    }
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all active:scale-95 cursor-pointer select-none border disabled:cursor-not-allowed disabled:opacity-40 ${
                      includeSubfolders
                        ? 'border-primary/30 bg-primary/15 text-primary font-semibold shadow-2xs'
                        : 'border-outline-variant/20 bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {includeSubfolders ? 'account_tree' : 'folder'}
                    </span>
                    <span>
                      {includeSubfolders
                        ? (t('sourcePicker.subfoldersOn') || 'Cả thư mục con')
                        : (t('sourcePicker.subfoldersOff') || 'Chỉ thư mục này')}
                    </span>
                  </button>
                )}
                {extraAction ? extraAction : null}
                {onClear && (
                  <button
                    type="button"
                    onClick={onClear}
                    disabled={disabled}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-on-surface-variant/70 hover:text-error hover:bg-error/10 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
                    <span>{resolvedClearAll}</span>
                  </button>
                )}
              </div>
              {onIncludeSubfoldersChange && (
                <p className="text-[10px] text-on-surface-variant/60 leading-tight pl-0.5">
                  {includeSubfolders
                    ? (t('sourcePicker.subfoldersOnHint') || 'Quét cả ảnh trong các thư mục con bên trong')
                    : (t('sourcePicker.subfoldersOffHint') || 'Chỉ quét các tệp ảnh ở thư mục gốc')}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : hasFiles ? (
        <div className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-2.5 py-1.5 transition-colors">
          <span className="material-symbols-outlined shrink-0 text-[18px] text-cyan-400">
            {filesIcon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-on-surface">
              {typeof filesCountLabel === 'function'
                ? filesCountLabel(sourceFiles.length)
                : filesCountLabel || `${sourceFiles.length} tệp đã chọn`}
            </p>
            <p className="truncate text-[10px] text-cyan-400/80 font-medium">
              {resolvedFilesModeText}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {onSelectFiles && (
              <button
                type="button"
                onClick={onSelectFiles}
                disabled={disabled}
                data-tooltip={resolvedChangeFiles}
                aria-label={resolvedChangeFiles}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-cyan-400 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[15px]">sync</span>
              </button>
            )}
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                disabled={disabled}
                data-tooltip={t('sourcePicker.clearSource')}
                aria-label={t('sourcePicker.clearSource')}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-error/10 hover:text-error transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={onSelectFiles ? 'grid grid-cols-2 gap-2' : 'flex'}>
          <button
            type="button"
            data-testid="source-select-folder"
            onClick={onSelectFolder}
            disabled={disabled}
            className={`flex items-center justify-center gap-2 rounded-xl border border-outline-variant/25 bg-surface-container-highest/60 hover:bg-surface-container-high hover:border-primary/50 py-2.5 px-3 text-xs text-on-surface-variant hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] transition-all cursor-pointer group ${onSelectFiles ? '' : 'w-full'}`}
          >
            <span className="material-symbols-outlined text-[18px] text-primary shrink-0 transition-transform group-hover:scale-110">
              {folderIcon}
            </span>
            <span className="font-semibold text-on-surface truncate">{resolvedFolderLabel}</span>
          </button>
          {onSelectFiles && (
            <button
              type="button"
              data-testid="source-select-files"
              onClick={onSelectFiles}
              disabled={disabled}
              className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant/25 bg-surface-container-highest/60 hover:bg-surface-container-high hover:border-cyan-500/50 py-2.5 px-3 text-xs text-on-surface-variant hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] transition-all cursor-pointer group"
            >
              <span className="material-symbols-outlined text-[18px] text-cyan-400 shrink-0 transition-transform group-hover:scale-110">
                {filesIcon}
              </span>
              <span className="font-semibold text-on-surface truncate">{resolvedFilesLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
