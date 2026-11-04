import { useI18n } from '../../../context/I18nContext';

function formatMb(bytes) {
  const mb = Number(bytes) / (1024 * 1024);
  if (!Number.isFinite(mb)) return '0';
  return (Math.round(mb * 10) / 10).toFixed(1);
}

export default function CbzSizeSplitPreview({
  visible,
  loading,
  estimate,
  maxMbPerFile,
  i18nPrefix = 'cbzExportTab',
}) {
  const { t } = useI18n();
  if (!visible) return null;

  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 space-y-1.5 text-xs">
      <p className="text-sky-300/90">{t(`${i18nPrefix}.sizeSplitChapterBoundaryHint`)}</p>
      {loading && (
        <p className="text-on-surface-variant">{t(`${i18nPrefix}.sizeSplitEstimateLoading`)}</p>
      )}
      {!loading && estimate?.ok && (
        <>
          <p className="text-on-surface">
            {t(`${i18nPrefix}.sizeSplitEstimate`, {
              partCount: estimate.partCount,
              totalMb: formatMb(estimate.totalBytes),
              selectedCount: estimate.selectedChapterCount,
            })}
          </p>
          {estimate.oversizedChapterTitles?.length > 0 && (
            <p className="text-amber-400">
              {t(`${i18nPrefix}.sizeSplitOversizedWarning`, {
                count: estimate.oversizedChapterTitles.length,
                maxMb: maxMbPerFile,
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
