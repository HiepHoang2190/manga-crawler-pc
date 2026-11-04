/**
 * Kindle send job store — sequential queue so Send to Kindle can run in the
 * background (Offline Library modal + hub tab). Survives tab unmount.
 */

const AMAZON_PDOCS_URL =
  'https://www.amazon.com/hz/mycd/digital-console/contentlist/pdocs/dateDsc/';

let state = {
  status: 'idle',
  row: null,
  progress: null,
  results: null,
  error: '',
  amazonLibraryUrl: AMAZON_PDOCS_URL,
  deletedLocal: false,
  openModalRequested: false,
  queue: [],
  activeId: null,
};

const listeners = new Set();
let progressUnsub = null;
let inFlight = false;
let pumpApi = null;
let seq = 0;

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      /* ignore listener errors */
    }
  }
}

function setState(partial) {
  state = { ...state, ...partial };
  emit();
}

function nextId() {
  seq += 1;
  return `kindle-job-${Date.now()}-${seq}`;
}

function getKindleJob() {
  return state;
}

function subscribeKindleJob(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function requestOpenKindleModal() {
  setState({ openModalRequested: true });
}

function consumeOpenKindleModalRequest() {
  if (!state.openModalRequested) return false;
  setState({ openModalRequested: false });
  return true;
}

function ensureProgressSub(api) {
  if (!progressUnsub && api?.subscribeSendToKindleProgress) {
    progressUnsub = api.subscribeSendToKindleProgress((p) => {
      if (getKindleJob().status === 'running') {
        setState({ progress: p });
        const id = state.activeId;
        if (id) {
          setState({
            queue: state.queue.map((item) =>
              item.id === id ? { ...item, progress: p } : item
            ),
          });
        }
      }
    });
  }
}

function syncCompatFromItem(item) {
  if (!item) {
    return {
      status: state.queue.some((q) => q.status === 'pending') ? 'idle' : 'idle',
      row: null,
      progress: null,
      results: null,
      error: '',
      deletedLocal: false,
      activeId: null,
    };
  }
  return {
    status: item.status === 'pending' ? 'idle' : item.status,
    row: item.row || (item.label ? { mangaTitle: item.label } : null),
    progress: item.progress || null,
    results: item.results || null,
    error: item.error || '',
    amazonLibraryUrl: item.amazonLibraryUrl || AMAZON_PDOCS_URL,
    deletedLocal: Boolean(item.deletedLocal),
    activeId: item.status === 'running' ? item.id : state.activeId,
  };
}

function clearKindleJob() {
  setState({
    status: 'idle',
    row: null,
    progress: null,
    results: null,
    error: '',
    amazonLibraryUrl: AMAZON_PDOCS_URL,
    deletedLocal: false,
    openModalRequested: false,
    queue: [],
    activeId: null,
  });
  inFlight = false;
}

function clearFinishedKindleJobs() {
  const queue = state.queue.filter(
    (q) => q.status === 'pending' || q.status === 'running'
  );
  setState({ queue });
}

function removeKindleQueueItem(id) {
  const target = state.queue.find((q) => q.id === id);
  if (!target || target.status === 'running') return false;
  setState({ queue: state.queue.filter((q) => q.id !== id) });
  return true;
}

function updateKindleQueueItem(id, patch) {
  let found = false;
  const queue = state.queue.map((item) => {
    if (item.id !== id) return item;
    if (item.status !== 'pending') return item;
    found = true;
    return {
      ...item,
      ...patch,
      title:
        patch.title !== undefined ? String(patch.title || '').trim() : item.title,
      author:
        patch.author !== undefined
          ? String(patch.author || '').trim()
          : item.author,
    };
  });
  if (found) setState({ queue });
  return found;
}

function titleFromPath(filePath) {
  const base = String(filePath || '')
    .split(/[/\\]/)
    .pop() || 'Document';
  return base.replace(/\.[^.]+$/, '') || base;
}

/**
 * Add ready EPUB/PDF files as pending queue items (hub tab).
 * @returns {{ ok: boolean, added: number }}
 */
function addKindleFileItems(files) {
  const list = Array.isArray(files) ? files : [];
  const added = [];
  for (const f of list) {
    const filePath = String(f?.filePath || '').trim();
    if (!filePath) continue;
    const name = String(f?.name || '').trim() || titleFromPath(filePath);
    added.push({
      id: nextId(),
      kind: 'files',
      status: 'pending',
      label: name,
      title: String(f?.title || '').trim() || name.replace(/\.[^.]+$/, '') || name,
      author: String(f?.author || '').trim(),
      filePath,
      sizeBytes: Number(f?.sizeBytes) || 0,
      progress: null,
      results: null,
      error: '',
      amazonLibraryUrl: AMAZON_PDOCS_URL,
      deletedLocal: false,
      row: { mangaTitle: name, absolutePath: filePath },
    });
  }
  if (!added.length) return { ok: false, added: 0 };
  setState({ queue: [...state.queue, ...added] });
  return { ok: true, added: added.length };
}

async function runQueueItem(api, item) {
  ensureProgressSub(api);

  const runningItem = { ...item, status: 'running', progress: { phase: 'prepare', pct: 0 }, error: '' };
  setState({
    queue: state.queue.map((q) => (q.id === item.id ? runningItem : q)),
    ...syncCompatFromItem(runningItem),
    status: 'running',
    activeId: item.id,
    progress: runningItem.progress,
    error: '',
    results: null,
  });

  let r;
  try {
    if (item.kind === 'files') {
      r = await api.sendToKindleSendFile({
        filePath: item.filePath,
        title: item.title,
        author: item.author || undefined,
      });
    } else {
      r = await api.sendToKindleSend(item.payload);
    }
  } catch (e) {
    r = { ok: false, error: String(e?.message || e) };
  }

  const amazonLibraryUrl = r?.amazonLibraryUrl || AMAZON_PDOCS_URL;
  const results = Array.isArray(r?.results) ? r.results : null;
  const deletedLocal = Boolean(r?.deletedLocal);

  let nextStatus = 'done';
  let error = '';
  if (r?.needLogin) {
    nextStatus = 'error';
    error = 'loginRequired';
  } else if (!r?.ok && r?.error) {
    nextStatus = 'error';
    error = r.error;
  } else if (r && r.ok === false) {
    nextStatus = 'error';
    error = r.error || 'error';
  }

  const finished = {
    ...item,
    status: nextStatus,
    progress: null,
    results,
    error,
    amazonLibraryUrl,
    deletedLocal,
  };

  setState({
    queue: state.queue.map((q) => (q.id === item.id ? finished : q)),
    ...syncCompatFromItem(finished),
    status: nextStatus,
    activeId: item.id,
    progress: null,
    results,
    error,
    amazonLibraryUrl,
    deletedLocal,
  });

  return r;
}

async function pumpKindleQueue() {
  if (inFlight) return;
  const api = pumpApi;
  if (!api) return;

  const next = state.queue.find((q) => q.status === 'pending');
  if (!next) return;

  inFlight = true;
  try {
    await runQueueItem(api, next);
  } finally {
    inFlight = false;
  }
  // Continue with next pending.
  await pumpKindleQueue();
}

/**
 * Enqueue a manga convert+send job (Offline Library modal). Starts pump.
 */
async function startKindleSend({ api, row, payload }) {
  if (!api?.sendToKindleSend) {
    setState({ status: 'error', error: 'Send to Kindle API unavailable.', row });
    return { ok: false, error: 'Send to Kindle API unavailable.' };
  }

  pumpApi = api;
  ensureProgressSub(api);

  const label = row?.mangaTitle || payload?.title || 'Manga';
  const item = {
    id: nextId(),
    kind: 'manga',
    status: 'pending',
    label,
    title: payload?.title || label,
    author: payload?.author || '',
    payload: payload || {},
    row: row
      ? { mangaTitle: row.mangaTitle, absolutePath: row.absolutePath }
      : { mangaTitle: label },
    sizeBytes: 0,
    progress: null,
    results: null,
    error: '',
    amazonLibraryUrl: AMAZON_PDOCS_URL,
    deletedLocal: false,
  };

  setState({ queue: [...state.queue, item] });
  const queuedBehind = inFlight || state.status === 'running';
  pumpKindleQueue();
  return { ok: true, queued: queuedBehind, id: item.id };
}

/**
 * Start sending all pending file items (hub tab).
 */
async function startPendingKindleFiles(api) {
  if (!api?.sendToKindleSendFile) {
    return { ok: false, error: 'Send to Kindle API unavailable.' };
  }
  pumpApi = api;
  ensureProgressSub(api);
  const pending = state.queue.filter((q) => q.status === 'pending' && q.kind === 'files');
  if (!pending.length) return { ok: false, error: 'empty' };
  pumpKindleQueue();
  return { ok: true, count: pending.length };
}

/**
 * Enqueue + immediately pump a single ready file (optional helper).
 */
async function enqueueKindleFileSend({ api, filePath, title, author, sizeBytes, name }) {
  if (!api?.sendToKindleSendFile) {
    return { ok: false, error: 'Send to Kindle API unavailable.' };
  }
  pumpApi = api;
  const add = addKindleFileItems([
    { filePath, title, author, sizeBytes, name },
  ]);
  if (!add.ok) return { ok: false, error: 'empty' };
  pumpKindleQueue();
  return { ok: true, queued: inFlight || state.status === 'running' };
}

export {
  AMAZON_PDOCS_URL,
  getKindleJob,
  subscribeKindleJob,
  requestOpenKindleModal,
  consumeOpenKindleModalRequest,
  clearKindleJob,
  clearFinishedKindleJobs,
  removeKindleQueueItem,
  updateKindleQueueItem,
  addKindleFileItems,
  startKindleSend,
  startPendingKindleFiles,
  enqueueKindleFileSend,
};
