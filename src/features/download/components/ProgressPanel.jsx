import { useI18n } from '../../../context/I18nContext';
import { overallQueueProgress } from '../../../utils/queueProgress';

/**
 * Tiến trình tổng toàn hàng đợi (thanh %, chương, trang đang tải).
 */
export default function ProgressPanel({
  queue = [],
  downloadProgress = null,
  queueProcessing = false,
  activeChapterLabel = '',
}) {
  const { t } = useI18n();
  const dp = downloadProgress;
  const o = overallQueueProgress(queue, dp);
  const hasQueue = queue.some((g) => g.chapters.length > 0);

  if (!hasQueue) return null;

  let detailLine = t('progress.ready');
  if (queueProcessing && dp && dp.total > 0) {
    detailLine = activeChapterLabel
      ? t('progress.detailWithChapter', {
          label: activeChapterLabel,
          current: dp.current,
          total: dp.total,
        })
      : t('progress.pagesOnly', { current: dp.current, total: dp.total });
  } else if (queueProcessing) {
    detailLine = t('progress.processingQueue');
  } else if (o.totalChapters > 0 && o.doneChapters >= o.totalChapters) {
    detailLine = t('progress.queueComplete');
  }

  return (
    <div className="p-4 bg-surface-container-high rounded-xl border border-outline-variant/20 shadow-sm shrink-0">
      <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">{t('progress.title')}</h4>

      <div className="flex items-center gap-3 mb-2">
        <div className="h-2 flex-1 min-w-0 bg-surface-container-lowest rounded-full overflow-hidden border border-outline-variant/10">
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${o.percent}%` }}
          />
        </div>
        <span className="text-sm font-semibold tabular-nums text-on-surface shrink-0 w-[2.75rem] text-right">
          {o.percent}%
        </span>
      </div>

      <p className="text-xs text-on-surface mb-2 tabular-nums">
        {t('progress.chaptersDone', { done: o.doneChapters, total: o.totalChapters })}
      </p>

      <p className="text-xs text-on-surface-variant normal-case truncate" data-tooltip={detailLine !== t('progress.ready') ? detailLine : undefined}>
        {detailLine}
      </p>
    </div>
  );
}
