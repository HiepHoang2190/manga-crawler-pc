import { useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import ContinueReadingCard from './dashboard/ContinueReadingCard';
import RecentDownloadsCarousel from './dashboard/RecentDownloadsCarousel';
import KpiTile from './dashboard/KpiTile';
import KpiTilesRow from './dashboard/KpiTilesRow';
import KpiDetailDialog from './dashboard/KpiDetailDialog';
import DownloadsBarChart from './dashboard/DownloadsBarChart';
import ConnectorDonutChart from './dashboard/ConnectorDonutChart';
import SectionHeader from './dashboard/SectionHeader';
import TrendDaysFilter from './dashboard/TrendDaysFilter';
import { formatDurationSeconds } from '../../utils/usageLog';

function formatBytes(n) {
  const bytes = Number(n);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function formatCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return String(Math.round(v));
}

function sumBucketCounts(buckets) {
  return (buckets || []).reduce((s, d) => s + (Number(d.count) || 0), 0);
}

export default function DashboardPanel({
  data,
  storageLoading = false,
  cacheBytes = null,
  cacheLoading = false,
  cacheClearing = false,
  savePath = '',
  mangaRankings = {
    chaptersLoading: false,
    byChapters: [],
    storageLoading: false,
    byStorage: [],
  },
  onLoadStorageRanking,
  onClearCache,
  connectorName,
  onOpenReader,
  onOpenLibrary,
  onSelectRecentChapter,
}) {
  const { t, locale } = useI18n();
  const [trendDays, setTrendDays] = useState(30);
  const [kpiDetailId, setKpiDetailId] = useState(null);
  const kpi = data.kpi || {
    mangaCount: 0,
    chapterCount: 0,
    storageBytes: null,
    downloadsToday: 0,
    usageSecondsToday: 0,
  };
  const downloadsPerDay =
    trendDays === 7 ? data.downloadsPerDay7 || [] : data.downloadsPerDay30 || [];
  const usagePerDay =
    trendDays === 7 ? data.usagePerDay7 || [] : data.usagePerDay30 || [];
  const connectorBreakdown = data.connectorBreakdown || {
    items: [],
    others: null,
    total: 0,
  };
  const downloadsEmptyLabel =
    trendDays === 7
      ? t('dashboard.chart.downloads.empty7')
      : t('dashboard.chart.downloads.empty30');
  const usageEmptyLabel =
    trendDays === 7
      ? t('dashboard.chart.usage.empty7')
      : t('dashboard.chart.usage.empty30');

  const downloads7 = data.downloadsPerDay7 || [];
  const usage7 = data.usagePerDay7 || [];
  const topConnector = connectorBreakdown.items?.[0];
  const topConnectorLabel = topConnector
    ? t('dashboard.kpi.detail.library.topSourceValue', {
        name: connectorName?.(topConnector.siteId) || topConnector.name || topConnector.siteId,
        count: topConnector.mangas,
      })
    : t('dashboard.kpi.detail.library.noSource');

  const kpiDetailConfig = (() => {
    if (!kpiDetailId) return null;
    const chaptersFmt = (n) =>
      t('dashboard.kpi.detail.today.chapters', { n: formatCount(n) });
    switch (kpiDetailId) {
      case 'library':
        return {
          title: t('dashboard.kpi.library'),
          value: formatCount(kpi.mangaCount),
          icon: 'collections_bookmark',
          rows: [
            { label: t('dashboard.kpi.detail.library.count'), value: formatCount(kpi.mangaCount) },
            { label: t('dashboard.kpi.detail.library.topSource'), value: topConnectorLabel },
          ],
        };
      case 'chapters':
        return {
          title: t('dashboard.kpi.chapters'),
          value: formatCount(kpi.chapterCount),
          icon: 'menu_book',
          rows: [
            { label: t('dashboard.kpi.detail.chapters.total'), value: formatCount(kpi.chapterCount) },
          ],
          listTitle: t('dashboard.kpi.detail.listTitle.chapters'),
          listItems: (mangaRankings.byChapters || []).map((x) => ({
            title: x.title,
            value: formatCount(x.chapterCount),
          })),
          listLoading: mangaRankings.chaptersLoading,
          listEmptyLabel: t('dashboard.kpi.detail.listEmpty'),
          listLoadingLabel: t('dashboard.kpi.detail.listLoading'),
          listHint: t('dashboard.kpi.detail.listHiddenHint'),
        };
      case 'storage':
        return {
          title: t('dashboard.kpi.storage'),
          value: kpi.storageBytes == null ? '—' : formatBytes(kpi.storageBytes),
          icon: 'hard_drive',
          rows: [
            {
              label: t('dashboard.kpi.detail.storage.size'),
              value: kpi.storageBytes == null ? '—' : formatBytes(kpi.storageBytes),
            },
            {
              label: t('dashboard.kpi.detail.storage.path'),
              value: String(savePath || '').trim() || t('dashboard.kpi.detail.storage.noPath'),
            },
          ],
          listTitle: t('dashboard.kpi.detail.listTitle.storage'),
          listItems: (mangaRankings.byStorage || []).map((x) => ({
            title: x.title,
            value: formatBytes(x.bytes),
          })),
          listLoading: mangaRankings.storageLoading,
          listEmptyLabel: t('dashboard.kpi.detail.listEmpty'),
          listLoadingLabel: t('dashboard.kpi.detail.listLoading'),
          listHint: t('dashboard.kpi.detail.listHiddenHint'),
        };
      case 'today': {
        const yesterday = downloads7.length >= 2 ? downloads7[downloads7.length - 2].count : 0;
        return {
          title: t('dashboard.kpi.today'),
          value: formatCount(kpi.downloadsToday),
          icon: 'download',
          rows: [
            { label: t('dashboard.kpi.detail.today.today'), value: chaptersFmt(kpi.downloadsToday) },
            { label: t('dashboard.kpi.detail.today.yesterday'), value: chaptersFmt(yesterday) },
            { label: t('dashboard.kpi.detail.today.last7'), value: chaptersFmt(sumBucketCounts(downloads7)) },
          ],
        };
      }
      case 'usage':
        return {
          title: t('dashboard.kpi.usage'),
          value: formatDurationSeconds(kpi.usageSecondsToday || 0),
          icon: 'schedule',
          rows: [
            {
              label: t('dashboard.kpi.detail.usage.today'),
              value: formatDurationSeconds(kpi.usageSecondsToday || 0),
            },
            {
              label: t('dashboard.kpi.detail.usage.last7'),
              value: formatDurationSeconds(sumBucketCounts(usage7)),
            },
          ],
        };
      case 'cache':
        return {
          title: t('dashboard.kpi.cache'),
          value: cacheBytes == null ? '—' : formatBytes(cacheBytes),
          icon: 'delete_sweep',
          rows: [
            {
              label: t('dashboard.kpi.detail.cache.size'),
              value: cacheBytes == null ? '—' : formatBytes(cacheBytes),
            },
            { label: t('dashboard.kpi.detail.cache.desc'), value: t('dashboard.cache.clearMessage') },
          ],
          actions: (
            <button
              type="button"
              disabled={cacheClearing}
              onClick={async () => {
                if (!onClearCache) return;
                await onClearCache();
                setKpiDetailId(null);
              }}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {cacheClearing ? t('dashboard.cache.clearing') : t('dashboard.cache.clearConfirm')}
            </button>
          ),
        };
      default:
        return null;
    }
  })();

  return (
    <main className="flex-1 min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-6">
      {data.error ? (
        <section
          role="alert"
          className="rounded-md border border-error/40 bg-error/10 p-2 text-xs text-error"
        >
          Dashboard error: {data.error}
        </section>
      ) : null}

      <section>
        <SectionHeader label={t('dashboard.section.overview')} />
        <KpiTilesRow>
          <KpiTile
            label={t('dashboard.kpi.library')}
            value={formatCount(kpi.mangaCount)}
            hint={t('dashboard.kpi.library.hint')}
            onClick={() => setKpiDetailId('library')}
          />
          <KpiTile
            label={t('dashboard.kpi.chapters')}
            value={formatCount(kpi.chapterCount)}
            hint={t('dashboard.kpi.chapters.hint')}
            onClick={() => setKpiDetailId('chapters')}
          />
          <KpiTile
            label={t('dashboard.kpi.storage')}
            value={kpi.storageBytes == null ? '—' : formatBytes(kpi.storageBytes)}
            loading={storageLoading && kpi.storageBytes == null}
            hint={t('dashboard.kpi.storage.hint')}
            onClick={() => {
              setKpiDetailId('storage');
              onLoadStorageRanking?.();
            }}
          />
          <KpiTile
            label={t('dashboard.kpi.today')}
            value={formatCount(kpi.downloadsToday)}
            hint={t('dashboard.kpi.today.hint')}
            onClick={() => setKpiDetailId('today')}
          />
          <KpiTile
            label={t('dashboard.kpi.usage')}
            value={formatDurationSeconds(kpi.usageSecondsToday || 0)}
            hint={t('dashboard.kpi.usage.hint')}
            accent
            onClick={() => setKpiDetailId('usage')}
          />
          <KpiTile
            label={t('dashboard.kpi.cache')}
            value={cacheBytes == null ? '—' : formatBytes(cacheBytes)}
            loading={cacheLoading && cacheBytes == null}
            hint={t('dashboard.kpi.cache.hint')}
            onClick={() => setKpiDetailId('cache')}
          />
        </KpiTilesRow>
      </section>

      {kpiDetailConfig ? (
        <KpiDetailDialog
          open
          title={kpiDetailConfig.title}
          value={kpiDetailConfig.value}
          rows={kpiDetailConfig.rows}
          icon={kpiDetailConfig.icon}
          onClose={() => setKpiDetailId(null)}
          closeLabel={t('dashboard.kpi.detail.close')}
          listTitle={kpiDetailConfig.listTitle}
          listItems={kpiDetailConfig.listItems}
          listLoading={kpiDetailConfig.listLoading}
          listEmptyLabel={kpiDetailConfig.listEmptyLabel}
          listLoadingLabel={kpiDetailConfig.listLoadingLabel}
          listHint={kpiDetailConfig.listHint}
          actions={kpiDetailConfig.actions}
        />
      ) : null}

      <section>
        <SectionHeader
          label={t('dashboard.section.trends')}
          action={
            <TrendDaysFilter
              value={trendDays}
              onChange={setTrendDays}
              label7={t('dashboard.trends.days7')}
              label30={t('dashboard.trends.days30')}
            />
          }
        />
        <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-4">
          <div className="order-1 min-[900px]:order-2 min-[900px]:col-start-2 min-[900px]:row-start-1 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
            <div className="mb-2 text-xs font-medium text-on-surface-variant">
              {t('dashboard.chart.connectors.title')}
            </div>
            <ConnectorDonutChart
              data={connectorBreakdown}
              centerLabel={t('dashboard.chart.connectors.centerLabel')}
              emptyLabel={t('dashboard.chart.connectors.empty')}
              othersLabel={t('dashboard.chart.connectors.others')}
            />
          </div>
          <div className="order-2 min-[900px]:order-1 min-[900px]:col-start-1 min-[900px]:row-start-1 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
            <div className="mb-2 text-xs font-medium text-on-surface-variant">
              {t('dashboard.chart.downloads.title', { days: trendDays })}
            </div>
            <DownloadsBarChart
              data={downloadsPerDay}
              emptyLabel={downloadsEmptyLabel}
              locale={locale}
            />
          </div>
          <div className="order-3 min-[900px]:col-span-2 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
            <div className="mb-2 text-xs font-medium text-on-surface-variant">
              {t('dashboard.chart.usage.title', { days: trendDays })}
            </div>
            <DownloadsBarChart
              data={usagePerDay}
              emptyLabel={usageEmptyLabel}
              formatValue={formatDurationSeconds}
              locale={locale}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionHeader label={t('dashboard.section.quickAccess')} />
        <ContinueReadingCard
          data={data.continueReading}
          onOpen={() => onOpenReader(data.continueReading)}
          onEmptyAction={onOpenLibrary}
        />
      </section>

      <section>
        <SectionHeader label={t('dashboard.section.activity')} />
        <RecentDownloadsCarousel
          items={data.recent.items}
          totalMangas={data.recent.totalMangas}
          totalChapters={data.recent.totalChapters}
          onSelectChapter={onSelectRecentChapter || (() => {})}
        />
      </section>
    </main>
  );
}
