import {
  ANALYSIS_STEPS,
  createInitialAnalysisMatrix,
  prepareChapterRetryMatrix,
  applyAnalysisProgressEvent,
  completeAnalysisMatrix,
  sanitizePluginId,
  extractPluginIdFromSource,
} from '../analysisProgressState.mjs';

describe('analysisProgressState — Diagnostic Analysis Matrix state machine', () => {
  test('createInitialAnalysisMatrix creates 8 pending steps in manga mode and pre-skips manga steps in chapter mode', () => {
    const mangaMatrix = createInitialAnalysisMatrix('https://site.example/truyen/abc', 'manga', 'run-1');
    expect(mangaMatrix.runId).toBe('run-1');
    expect(mangaMatrix.percent).toBe(4);
    expect(mangaMatrix.activeStep).toBe('fetch_manga');
    expect(mangaMatrix.steps).toHaveLength(ANALYSIS_STEPS.length);
    expect(mangaMatrix.steps.every((s) => s.status === 'pending')).toBe(true);

    const chMatrix = createInitialAnalysisMatrix('https://site.example/truyen/abc/c1', 'chapter', 'run-2');
    expect(chMatrix.percent).toBe(78);
    expect(chMatrix.activeStep).toBe('chapter_images');
    expect(chMatrix.steps.find((s) => s.id === 'fetch_manga')?.status).toBe('skipped');
    expect(chMatrix.steps.find((s) => s.id === 'chapter_images')?.status).toBe('pending');
  });

  test('applyAnalysisProgressEvent enforces monotonic percentage, updates metadata, caps logs, and ignores unknown steps', () => {
    let state = createInitialAnalysisMatrix('https://site.example/truyen/abc', 'manga', 'run-1');
    state = applyAnalysisProgressEvent(state, { step: 'fetch_manga', status: 'running', progress: 12, detail: 'site.example' });
    expect(state.percent).toBe(12);
    expect(state.activeStep).toBe('fetch_manga');

    // Out-of-order lower progress must never move bar backward
    state = applyAnalysisProgressEvent(state, { step: 'fetch_manga', status: 'done', progress: 5, meta: { usedChromiumFallback: false } });
    expect(state.percent).toBe(12);
    expect(state.steps[0].status).toBe('done');
    expect(state.steps[0].meta.usedChromiumFallback).toBe(false);

    // Unknown step ignored cleanly
    const sameRef = applyAnalysisProgressEvent(state, { step: 'non_existent', status: 'done', progress: 99 });
    expect(sameRef).toBe(state);

    // Cap logs at 6 entries
    for (let i = 0; i < 8; i += 1) {
      state = applyAnalysisProgressEvent(state, { step: 'tier1_chapters', status: 'running', progress: 20 + i });
    }
    expect(state.logs).toHaveLength(6);
    expect(state.percent).toBe(27);
  });

  test('completeAnalysisMatrix finalizes build_preview to 100% or marks failing active step on error', () => {
    let state = createInitialAnalysisMatrix('https://site.example/truyen/abc', 'manga', 'run-1');
    state = applyAnalysisProgressEvent(state, { step: 'fetch_manga', status: 'done', progress: 18 });
    const doneState = completeAnalysisMatrix(state, { status: 'done', percent: 100 });
    expect(doneState.percent).toBe(100);
    expect(doneState.finishedAt).toBeGreaterThan(0);
    expect(doneState.steps.find((s) => s.id === 'build_preview')?.status).toBe('done');
    expect(doneState.steps.find((s) => s.id === 'cms_metadata')?.status).toBe('skipped');

    const errBase = applyAnalysisProgressEvent(state, { step: 'tier3_spa_sniffer', status: 'running', progress: 58 });
    const errState = completeAnalysisMatrix(errBase, { status: 'error', detail: 'Timeout' });
    expect(errState.percent).toBe(58);
    expect(errState.steps.find((s) => s.id === 'tier3_spa_sniffer')?.status).toBe('error');
    expect(errState.steps.find((s) => s.id === 'tier3_spa_sniffer')?.detail).toBe('Timeout');

    const chErrState = completeAnalysisMatrix(errBase, {
      status: 'error',
      stepId: 'chapter_images',
      detail: 'Invalid URL',
    });
    expect(chErrState.steps.find((s) => s.id === 'chapter_images')?.status).toBe('error');
    expect(chErrState.steps.find((s) => s.id === 'tier3_spa_sniffer')?.status).toBe('running');
  });

  test('prepareChapterRetryMatrix clears finishedAt and resets chapter/build cells while preserving manga steps', () => {
    let state = createInitialAnalysisMatrix('https://site.example/truyen/abc', 'manga', 'run-1');
    state = applyAnalysisProgressEvent(state, { step: 'fetch_manga', status: 'done', progress: 18 });
    state = applyAnalysisProgressEvent(state, { step: 'chapter_images', status: 'running', progress: 86 });
    state = completeAnalysisMatrix(state, { status: 'error', stepId: 'chapter_images', detail: 'HTTP 403' });
    expect(state.finishedAt).toBeTruthy();

    const retried = prepareChapterRetryMatrix(state, 'https://site.example/truyen/abc/chap-2', 'run-retry');
    expect(retried.runId).toBe('run-retry');
    expect(retried.targetUrl).toBe('https://site.example/truyen/abc/chap-2');
    expect(retried.finishedAt).toBeNull();
    expect(retried.activeStep).toBe('chapter_images');
    expect(retried.percent).toBe(78);
    expect(retried.steps.find((s) => s.id === 'fetch_manga')?.status).toBe('done');
    expect(retried.steps.find((s) => s.id === 'chapter_images')?.status).toBe('pending');
    expect(retried.steps.find((s) => s.id === 'chapter_images')?.detail).toBeNull();
    expect(retried.steps.find((s) => s.id === 'build_preview')?.status).toBe('pending');
  });

  test('sanitizePluginId and extractPluginIdFromSource mirror PluginCodeGenerator ID rules', () => {
    expect(sanitizePluginId(' My Site! ')).toBe('mysite');
    expect(sanitizePluginId('--nettruyen--')).toBe('nettruyen');
    expect(sanitizePluginId('')).toBe('unknown');
    expect(extractPluginIdFromSource("var plugin = {\n  id: 'Custom-Source_1',\n};")).toBe('custom-source_1');
    expect(extractPluginIdFromSource('var plugin = {};')).toBe('');
  });
});
