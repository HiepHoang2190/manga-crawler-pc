import { SourcePicker } from '../../../shared';

/**
 * DualSourcePicker adapter wrapping the unified SourcePicker component.
 * Provides backwards-compatible props for Ebook Studio while ensuring 100% UI consistency.
 */
export default function DualSourcePicker({
  selectedPath = '',
  selectedFiles = [],
  onSelectFolder,
  onSelectFiles,
  onClear,
  disabled = false,
  folderLabel,
  filesLabel,
  title,
  hint,
  ...rest
}) {
  return (
    <SourcePicker
      sourceDir={selectedPath}
      sourceFiles={selectedFiles}
      onSelectFolder={onSelectFolder}
      onSelectFiles={onSelectFiles}
      onClear={onClear}
      disabled={disabled}
      title={title}
      folderLabel={folderLabel}
      filesLabel={filesLabel}
      {...rest}
    />
  );
}
