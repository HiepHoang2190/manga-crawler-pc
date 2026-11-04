import { useI18n } from '../../../context/I18nContext';

function formatBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Math.max(0, Number(n) || 0);
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function LibraryStatsStrip({ stats, connectorName, onOpen }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 flex items-center justify-around gap-3 text-sm cursor-pointer hover:bg-surface-container"
      aria-label={t('dashboard.stats.aria')}
    >
      <span>📚 {t('dashboard.stats.mangas', { n: stats.mangaCount })}</span>
      {stats.totalChapterCount > 0 ? (
        <span>📖 {t('dashboard.stats.chapters', { n: stats.totalChapterCount })}</span>
      ) : null}
      {stats.totalStorageBytes > 0 ? (
        <span>💾 {formatBytes(stats.totalStorageBytes)}</span>
      ) : null}
      {stats.topConnectorId ? (
        <span>🏆 {connectorName(stats.topConnectorId)}</span>
      ) : null}
    </button>
  );
}
