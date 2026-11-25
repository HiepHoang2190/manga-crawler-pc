import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { StudioLayout, useStudioLayout } from '../../shared';
import ContinueReadingCard from './dashboard/ContinueReadingCard';
import QueueStatusCard from './dashboard/QueueStatusCard';
import NewChaptersCard from './dashboard/NewChaptersCard';
import RecentDownloadsCarousel from './dashboard/RecentDownloadsCarousel';
import KpiTile from './dashboard/KpiTile';
import KpiTilesRow from './dashboard/KpiTilesRow';
import KpiDetailDialog from './dashboard/KpiDetailDialog';
import DownloadsBarChart from './dashboard/DownloadsBarChart';
import ConnectorDonutChart from './dashboard/ConnectorDonutChart';
import SectionHeader from './dashboard/SectionHeader';
import { formatDurationSeconds } from '../../utils/usageLog';
import {
  loadDashboardTrendDays,
  saveDashboardTrendDays,
  extractPathBasename,
} from './dashboardPrefs.mjs';

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

const TOOLBAR_SECONDARY_BTN =
  'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-outline-variant/20 bg-surface-container-high text-on-surface hover:bg-surface-bright text-xs font-semibold transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0';

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
  onOpenQueue,
  onOpenExplore,
  onSelectNewChapterFavorite,
}) {
  const { t, locale } = useI18n();
  const { leftWidth, handleLeftResizeStart } = useStudioLayout({
    storagePrefix: 'dashboard',
    defaultLeftWidth: 320,
    minLeftWidth: 260,
    maxLeftWidth: 520,
  });
  const [trendDays, setTrendDays] = useState(() => loadDashboardTrendDays());
  const [kpiDetailId, setKpiDetailId] = useState(null);
  const [openingReader, setOpeningReader] = useState(false);
  const isMountedRef = useRef(true);
  const openingBusyRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleTrendDaysChange = useCallback((nextDays) => {
    setTrendDays(nextDays);
    saveDashboardTrendDays(nextDays);
  }, []);

  const safeData = data || {};
  const continueReadingData = safeData.continueReading || null;
  const queueSummary = safeData.queue || {
    runningCount: 0,
    waitingCount: 0,
    currentJob: null,
  };
  const newChapters = safeData.favorites || { items: [], totalCount: 0 };

  const handleOpenContinueReading = useCallback(async () => {
    if (openingBusyRef.current || !onOpenReader || !continueReadingData) return;
    openingBusyRef.current = true;
    setOpeningReader(true);
    try {
      await onOpenReader(continueReadingData);
    } finally {
      openingBusyRef.current = false;
      if (isMountedRef.current) setOpeningReader(false);
    }
  }, [onOpenReader, continueReadingData]);

  const handleSelectRecentChapter = useCallback(
    async (item) => {
      if (!item || !onSelectRecentChapter || openingBusyRef.current) return;
      openingBusyRef.current = true;
      try {
        await onSelectRecentChapter(item);
      } finally {
        openingBusyRef.current = false;
      }
    },
    [onSelectRecentChapter]
  );
  const kpi = safeData.kpi || {
    mangaCount: 0,
    chapterCount: 0,
    storageBytes: null,
    downloadsToday: 0,
    usageSecondsToday: 0,
  };
  const recent = safeData.recent || {
    items: [],
    totalMangas: 0,
    totalChapters: 0,
  };
  const downloadsPerDay =
    trendDays === 7 ? safeData.downloadsPerDay7 || [] : safeData.downloadsPerDay30 || [];
  const usagePerDay =
    trendDays === 7 ? safeData.usagePerDay7 || [] : safeData.usagePerDay30 || [];
  const connectorBreakdown = safeData.connectorBreakdown || {
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

  const downloads7 = safeData.downloadsPerDay7 || [];
  const usage7 = safeData.usagePerDay7 || [];
  const downloads7Total = sumBucketCounts(downloads7);
  const usage7Total = sumBucketCounts(usage7);
  const downloadsPeriodTotal = sumBucketCounts(downloadsPerDay);
  const usagePeriodTotal = sumBucketCounts(usagePerDay);
  const downloadsPeriodMax = downloadsPerDay.reduce(
    (m, d) => Math.max(m, Number(d.count) || 0),
    0
  );
  const usagePeriodMax = usagePerDay.reduce((m, d) => Math.max(m, Number(d.count) || 0), 0);

  const connectorSourceCount = connectorBreakdown.items?.length || 0;

  const topConnector = connectorBreakdown.items?.[0];
  const topConnectorLabel = topConnector
    ? t('dashboard.kpi.detail.library.topSourceValue', {
        name: connectorName?.(topConnector.siteId) || topConnector.name || topConnector.siteId,
        count: topConnector.mangas,
      })
    : t('dashboard.kpi.detail.library.noSource');

  const trimmedSavePath = String(savePath || '').trim();
  const savePathFolder = extractPathBasename(trimmedSavePath);

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
          listItems: (mangaRankings?.byChapters || []).map((x) => ({
            title: x.title,
            value: formatCount(x.chapterCount),
          })),
          listLoading: Boolean(mangaRankings?.chaptersLoading),
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
              value: trimmedSavePath || t('dashboard.kpi.detail.storage.noPath'),
            },
          ],
          actions: trimmedSavePath ? (
            <button
              type="button"
              onClick={() => window.electronAPI?.openPath?.(trimmedSavePath)}
              className="cursor-pointer rounded-xl bg-primary h-9 px-4 text-xs font-semibold text-on-primary hover:opacity-95 transition-all inline-flex items-center gap-1.5 shadow-2xs"
            >
              <span className="material-symbols-outlined text-[16px]">folder_open</span>
              <span>{t('dashboard.kpi.detail.storage.openFolder')}</span>
            </button>
          ) : null,
          listTitle: t('dashboard.kpi.detail.listTitle.storage'),
          listItems: (mangaRankings?.byStorage || []).map((x) => ({
            title: x.title,
            value: formatBytes(x.bytes),
          })),
          listLoading: Boolean(mangaRankings?.storageLoading),
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
            { label: t('dashboard.kpi.detail.today.last7'), value: chaptersFmt(downloads7Total) },
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
              value: formatDurationSeconds(usage7Total),
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
              className="cursor-pointer rounded-xl bg-primary h-9 px-4 text-xs font-semibold text-on-primary hover:opacity-95 transition-all disabled:opacity-50 shadow-2xs"
            >
              {cacheClearing ? t('dashboard.cache.clearing') : t('dashboard.cache.clearConfirm')}
            </button>
          ),
        };
      default:
        return null;
    }
  })();

  const trendOptions = [
    { days: 7, label: t('dashboard.trends.days7') },
    { days: 30, label: t('dashboard.trends.days30') },
  ];

  return (
    <StudioLayout className="w-full h-full">
      <StudioLayout.Toolbar
        leftSlot={
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
            <div
              role="tablist"
              aria-label={t('dashboard.toolbar.rangeLabel')}
              className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-surface-container-high/70 border border-outline-variant/25 overflow-x-auto no-scrollbar shrink-0"
            >
              {trendOptions.map((opt) => {
                const isActive = trendDays === opt.days;
                return (
                  <button
                    key={opt.days}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleTrendDaysChange(opt.days)}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-primary text-on-primary font-semibold shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/60'
                    }`}
                  >
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        }
        rightSlot={
          cacheBytes > 0 ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setKpiDetailId('cache')}
                data-tooltip={t('dashboard.toolbar.manageCache')}
                aria-label={t('dashboard.toolbar.manageCache')}
                className={TOOLBAR_SECONDARY_BTN}
              >
                <span className="material-symbols-outlined text-[16px] leading-none text-rose-500">
                  delete_sweep
                </span>
                <span className="tabular-nums">{formatBytes(cacheBytes)}</span>
              </button>
            </div>
          ) : null
        }
      />

      <StudioLayout.Body>
        <StudioLayout.LeftSidebar
          open={true}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
        >
          <div className="p-3.5 flex flex-col gap-4">
            <div>
              <SectionHeader label={t('dashboard.section.quickAccess')} />
              <ContinueReadingCard
                compact
                data={continueReadingData}
                loading={openingReader}
                onOpen={handleOpenContinueReading}
                onEmptyAction={onOpenLibrary}
              />
            </div>

            <div className="pt-3 border-t border-outline-variant/15">
              <QueueStatusCard
                runningCount={queueSummary.runningCount}
                waitingCount={queueSummary.waitingCount}
                currentJob={queueSummary.currentJob}
                onOpenQueue={onOpenQueue || onOpenLibrary}
                onEmptyAction={onOpenLibrary}
              />
            </div>

            <div className="pt-3 border-t border-outline-variant/15">
              <NewChaptersCard
                items={newChapters.items}
                totalCount={newChapters.totalCount}
                onSelect={onSelectNewChapterFavorite || onOpenExplore || onOpenLibrary}
                onViewAll={onOpenExplore || onOpenLibrary}
                onEmptyAction={onOpenExplore || onOpenLibrary}
              />
            </div>
          </div>
        </StudioLayout.LeftSidebar>

        <StudioLayout.Content className="overflow-y-auto custom-scrollbar p-4 sm:p-6 bg-surface">
          <div className="w-full space-y-6">
            {safeData.error ? (
              <section
                role="alert"
                className="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-xs font-medium text-error flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px] leading-none shrink-0">
                  error
                </span>
                <span>{safeData.error}</span>
              </section>
            ) : null}

            {/* Recent Activity Row (Top of main workspace) */}
            <section>
              <SectionHeader label={t('dashboard.section.activity')} />
              <RecentDownloadsCarousel
                items={recent.items}
                totalMangas={recent.totalMangas}
                totalChapters={recent.totalChapters}
                onSelectChapter={handleSelectRecentChapter}
                onEmptyAction={onOpenLibrary}
              />
            </section>

            {/* Overview KPI Bento Row */}
            <section>
              <SectionHeader label={t('dashboard.section.overview')} />
              <KpiTilesRow>
                <KpiTile
                  icon="collections_bookmark"
                  tone="primary"
                  label={t('dashboard.kpi.library')}
                  value={formatCount(kpi.mangaCount)}
                  subtext={topConnectorLabel}
                  onClick={() => setKpiDetailId('library')}
                />
                <KpiTile
                  icon="menu_book"
                  tone="violet"
                  label={t('dashboard.kpi.chapters')}
                  value={formatCount(kpi.chapterCount)}
                  subtext={
                    kpi.mangaCount > 0
                      ? t('dashboard.kpi.chapters.avgPerManga', {
                          avg: Math.round((Number(kpi.chapterCount) || 0) / kpi.mangaCount),
                        })
                      : t('dashboard.kpi.detail.listEmpty')
                  }
                  onClick={() => setKpiDetailId('chapters')}
                />
                <KpiTile
                  icon="hard_drive"
                  tone="amber"
                  label={t('dashboard.kpi.storage')}
                  value={kpi.storageBytes == null ? '—' : formatBytes(kpi.storageBytes)}
                  loading={storageLoading && kpi.storageBytes == null}
                  subtext={savePathFolder || t('dashboard.kpi.detail.storage.noPath')}
                  onClick={() => {
                    setKpiDetailId('storage');
                    onLoadStorageRanking?.();
                  }}
                />
                <KpiTile
                  icon="download"
                  tone="emerald"
                  label={t('dashboard.kpi.today')}
                  value={formatCount(kpi.downloadsToday)}
                  subtext={t('dashboard.kpi.today.last7Short', {
                    count: formatCount(downloads7Total),
                  })}
                  onClick={() => setKpiDetailId('today')}
                />
                <KpiTile
                  icon="schedule"
                  tone="primary"
                  label={t('dashboard.kpi.usage')}
                  value={formatDurationSeconds(kpi.usageSecondsToday || 0)}
                  subtext={t('dashboard.kpi.usage.last7Short', {
                    duration: formatDurationSeconds(usage7Total),
                  })}
                  accent
                  onClick={() => setKpiDetailId('usage')}
                />
                <KpiTile
                  icon="delete_sweep"
                  tone="rose"
                  label={t('dashboard.kpi.cache')}
                  value={cacheBytes == null ? '—' : formatBytes(cacheBytes)}
                  loading={cacheLoading && cacheBytes == null}
                  subtext={
                    cacheBytes > 0
                      ? t('dashboard.kpi.cache.manage')
                      : t('dashboard.kpi.cache.empty')
                  }
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

            {/* Trends Bento Grid */}
            <section>
              <SectionHeader label={t('dashboard.section.trends')} />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7 rounded-2xl border border-outline-variant/20 bg-surface-container-low/50 dark:bg-surface-container-low/25 p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                        trending_up
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-on-surface truncate">
                        {t('dashboard.chart.downloads.title', { days: trendDays })}
                      </span>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-outline-variant/25 bg-surface-container-high px-2.5 py-0.5 text-[11px] font-semibold text-on-surface-variant tabular-nums shrink-0">
                      {t('dashboard.chart.totalDownloads', {
                        count: formatCount(downloadsPeriodTotal),
                      })}
                    </span>
                  </div>
                  <DownloadsBarChart
                    data={downloadsPerDay}
                    emptyLabel={downloadsEmptyLabel}
                    height={148}
                    locale={locale}
                    chartAriaLabel={t('dashboard.chart.downloads.title', { days: trendDays })}
                    peakLabel={t('dashboard.chart.maxLabel', {
                      value: formatCount(downloadsPeriodMax),
                    })}
                    weekPagesAria={t('dashboard.chart.weekPagesAria')}
                    weekPageLabel={(idx) => t('dashboard.chart.weekPage', { index: idx })}
                  />
                </div>

                <div className="lg:col-span-5 rounded-2xl border border-outline-variant/20 bg-surface-container-low/50 dark:bg-surface-container-low/25 p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                        donut_large
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-on-surface truncate">
                        {t('dashboard.chart.connectors.title')}
                      </span>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-outline-variant/25 bg-surface-container-high px-2.5 py-0.5 text-[11px] font-semibold text-on-surface-variant tabular-nums shrink-0">
                      {t('dashboard.chart.connectors.sourceCount', { count: connectorSourceCount })}
                    </span>
                  </div>
                  <ConnectorDonutChart
                    data={connectorBreakdown}
                    centerLabel={t('dashboard.chart.connectors.centerLabel')}
                    emptyLabel={t('dashboard.chart.connectors.empty')}
                    othersLabel={t('dashboard.chart.connectors.others')}
                  />
                </div>

                <div className="lg:col-span-12 rounded-2xl border border-outline-variant/20 bg-surface-container-low/50 dark:bg-surface-container-low/25 p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                        schedule
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-on-surface truncate">
                        {t('dashboard.chart.usage.title', { days: trendDays })}
                      </span>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-outline-variant/25 bg-surface-container-high px-2.5 py-0.5 text-[11px] font-semibold text-on-surface-variant tabular-nums shrink-0">
                      {t('dashboard.chart.totalUsage', {
                        duration: formatDurationSeconds(usagePeriodTotal),
                      })}
                    </span>
                  </div>
                  <DownloadsBarChart
                    data={usagePerDay}
                    emptyLabel={usageEmptyLabel}
                    height={148}
                    formatValue={formatDurationSeconds}
                    locale={locale}
                    chartAriaLabel={t('dashboard.chart.usage.title', { days: trendDays })}
                    peakLabel={t('dashboard.chart.maxLabel', {
                      value: formatDurationSeconds(usagePeriodMax),
                    })}
                    weekPagesAria={t('dashboard.chart.weekPagesAria')}
                    weekPageLabel={(idx) => t('dashboard.chart.weekPage', { index: idx })}
                  />
                </div>
              </div>
            </section>
          </div>
        </StudioLayout.Content>
      </StudioLayout.Body>
    </StudioLayout>
  );
}
