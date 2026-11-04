import { useEffect, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import {
  getKindleJob,
  subscribeKindleJob,
  requestOpenKindleModal,
  clearKindleJob,
} from './kindleJobStore.mjs';

/**
 * Non-blocking bar so Send to Kindle can continue while the user switches tabs.
 */
export default function KindleJobBanner({ onOpen }) {
  const { t } = useI18n();
  const [job, setJob] = useState(() => getKindleJob());

  useEffect(() => subscribeKindleJob(setJob), []);

  if (job.status === 'idle') return null;

  const pct = job.progress?.pct;
  const title = job.row?.mangaTitle || '';
  const isRunning = job.status === 'running';
  const isDone = job.status === 'done';
  const isError = job.status === 'error';

  const label = isRunning
    ? t('sendToKindle.bannerRunning', {
        title,
        pct: pct != null ? pct : '…',
      })
    : isDone
      ? t('sendToKindle.bannerDone', { title })
      : t('sendToKindle.bannerError', { title });

  const open = () => {
    requestOpenKindleModal();
    onOpen?.(job.row);
  };

  return (
    <div
      className={[
        'shrink-0 flex items-center gap-2 px-3 py-2 border-b text-xs',
        isError
          ? 'border-error/30 bg-error/10 text-error'
          : isDone
            ? 'border-green-500/25 bg-green-500/10 text-green-600 dark:text-green-400'
            : 'border-primary/25 bg-primary/10 text-on-surface',
      ].join(' ')}
    >
      <span
        className={`material-symbols-outlined text-[16px] shrink-0 ${
          isRunning ? 'animate-spin' : ''
        }`}
      >
        {isRunning ? 'progress_activity' : isDone ? 'check_circle' : 'error'}
      </span>
      <p className="min-w-0 flex-1 truncate font-medium" data-tooltip={label}>
        {label}
      </p>
      <button
        type="button"
        onClick={open}
        className="shrink-0 px-2 py-1 rounded-md font-semibold text-primary hover:bg-primary/10 cursor-pointer"
      >
        {t('sendToKindle.bannerOpen')}
      </button>
      {!isRunning ? (
        <button
          type="button"
          onClick={() => clearKindleJob()}
          className="shrink-0 px-2 py-1 rounded-md text-on-surface-variant hover:bg-surface-container-highest cursor-pointer"
          aria-label={t('sendToKindle.close')}
        >
          <span className="material-symbols-outlined text-[16px] leading-none">close</span>
        </button>
      ) : null}
    </div>
  );
}
