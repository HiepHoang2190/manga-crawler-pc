/**
 * Pure state machine & step catalog for the Auto-Generator Diagnostic Analysis Matrix.
 * Shared between React UI components and Node/Jest unit tests.
 */

export const ANALYSIS_STEPS = [
  { id: 'fetch_manga', icon: 'cloud_download', labelKey: 'plugins.autoGen.matrix.stepFetchManga' },
  { id: 'cms_metadata', icon: 'fingerprint', labelKey: 'plugins.autoGen.matrix.stepCmsMetadata' },
  { id: 'tier1_chapters', icon: 'code', labelKey: 'plugins.autoGen.matrix.stepTier1Chapters' },
  { id: 'tier2_ssr_json', icon: 'data_object', labelKey: 'plugins.autoGen.matrix.stepTier2SsrJson' },
  { id: 'tier3_spa_sniffer', icon: 'hub', labelKey: 'plugins.autoGen.matrix.stepTier3SpaSniffer' },
  { id: 'latest_updates', icon: 'home', labelKey: 'plugins.autoGen.matrix.stepLatestUpdates' },
  { id: 'chapter_images', icon: 'photo_library', labelKey: 'plugins.autoGen.matrix.stepChapterImages' },
  { id: 'build_preview', icon: 'build', labelKey: 'plugins.autoGen.matrix.stepBuildPreview' },
];

const MANGA_ONLY_STEP_IDS = new Set([
  'fetch_manga',
  'cms_metadata',
  'tier1_chapters',
  'tier2_ssr_json',
  'tier3_spa_sniffer',
  'latest_updates',
]);

export function createInitialAnalysisMatrix(targetUrl = '', mode = 'manga', runId = '') {
  const isChapterOnly = mode === 'chapter';
  const now = Date.now();
  return {
    runId: String(runId || ''),
    targetUrl: String(targetUrl || ''),
    mode: isChapterOnly ? 'chapter' : 'manga',
    startedAt: now,
    finishedAt: null,
    percent: isChapterOnly ? 78 : 4,
    activeStep: isChapterOnly ? 'chapter_images' : 'fetch_manga',
    steps: ANALYSIS_STEPS.map((def) => ({
      ...def,
      status: isChapterOnly && MANGA_ONLY_STEP_IDS.has(def.id) ? 'skipped' : 'pending',
      detail: null,
      meta: null,
    })),
    logs: [],
  };
}

export function applyAnalysisProgressEvent(state, event) {
  if (!state || !event || typeof event.step !== 'string') return state;
  const idx = state.steps.findIndex((s) => s.id === event.step);
  if (idx === -1) return state;

  const incomingStatus = event.status || 'running';
  const nextSteps = state.steps.map((step, i) => {
    if (i !== idx) return step;
    return {
      ...step,
      status: incomingStatus,
      detail: event.detail !== undefined ? event.detail : step.detail,
      meta: event.meta ? { ...(step.meta || {}), ...event.meta } : step.meta,
    };
  });

  const nextPercent = Number.isFinite(Number(event.progress))
    ? Math.min(100, Math.max(state.percent, Number(event.progress)))
    : state.percent;

  const nextActiveStep = incomingStatus === 'running' ? event.step : state.activeStep;

  const logEntry = {
    step: event.step,
    status: incomingStatus,
    progress: nextPercent,
    detail: event.detail || null,
    meta: event.meta || null,
    timestamp: event.timestamp || Date.now(),
  };

  const nextLogs = [...(state.logs || []), logEntry].slice(-6);

  return {
    ...state,
    percent: nextPercent,
    activeStep: nextActiveStep,
    steps: nextSteps,
    logs: nextLogs,
  };
}

export function sanitizePluginId(id) {
  return (
    String(id || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}

export function extractPluginIdFromSource(source) {
  const match = /^\s*id\s*:\s*['"]([^'"]+)['"]/m.exec(String(source || ''));
  return match ? sanitizePluginId(match[1]) : '';
}

export function prepareChapterRetryMatrix(state, chapterUrl = '', runId = '') {
  if (!state) {
    return createInitialAnalysisMatrix(chapterUrl, 'chapter', runId);
  }
  const resetIds = new Set(['chapter_images', 'build_preview']);
  return {
    ...state,
    runId: String(runId || state.runId || ''),
    targetUrl: String(chapterUrl || state.targetUrl || ''),
    mode: 'chapter',
    startedAt: Date.now(),
    finishedAt: null,
    activeStep: 'chapter_images',
    percent: Math.min(state.percent || 78, 78),
    steps: state.steps.map((step) =>
      resetIds.has(step.id) ? { ...step, status: 'pending', detail: null, meta: null } : step,
    ),
  };
}

export function completeAnalysisMatrix(state, { status = 'done', detail = null, percent = 100, stepId = null } = {}) {
  if (!state) return state;
  const targetStepId =
    stepId ||
    (status === 'error'
      ? state.activeStep || 'build_preview'
      : 'build_preview');

  const nextSteps = state.steps.map((step) => {
    if (step.id === targetStepId) {
      return {
        ...step,
        status,
        detail: detail !== null ? detail : step.detail,
      };
    }
    if (status === 'done' && step.status === 'pending') {
      return { ...step, status: 'skipped' };
    }
    return step;
  });

  return {
    ...state,
    percent: status === 'done' ? Math.max(state.percent, percent) : state.percent,
    finishedAt: Date.now(),
    steps: nextSteps,
  };
}
