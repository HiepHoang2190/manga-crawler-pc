/**
 * Pools worker_threads workers for DRM image transforms so the main process event loop stays free.
 */

'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const os = require('os');

const WORKER_SCRIPT = path.join(__dirname, '..', 'reader', 'workers', 'drmHeavyWorker.js');
/** Keep modest: each worker pulls full images into RAM. */
const POOL_SIZE = Math.min(
  Math.max((os.cpus && os.cpus().length) || 4, 2),
  6
);

let workersInitialized = false;
/** @type {Worker[]} */
let workers = [];

let rr = 0;
let taskSeq = 1;
/** @type {Map<number, {resolve: (b: Buffer) => void, reject: (e: Error) => void}>} */
const pending = new Map();

function onWorkerMessage(msg) {
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  if (msg.ok) {
    entry.resolve(Buffer.from(msg.jpeg));
  } else {
    entry.reject(new Error(msg.error || 'DRM worker failure'));
  }
}

function spawnWorker(index) {
  const w = new Worker(WORKER_SCRIPT);
  w.on('message', onWorkerMessage);
  w.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error(`[drmHeavyWorkerPool] worker ${index} error`, err);
  });
  return w;
}

function ensureWorkers() {
  if (workersInitialized) return;
  workersInitialized = true;
  workers = Array.from({ length: POOL_SIZE }, (_, i) => spawnWorker(i));
}

function pickWorker() {
  ensureWorkers();
  const w = workers[rr++ % POOL_SIZE];
  return w;
}

/**
 * @param {number} id
 * @param {Worker} worker
 * @param {Record<string, unknown>} payload cloned to worker — include id
 */
function postTask(id, worker, payload) {
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...payload });
  });
}

/**
 * XOR-strip DRM (Cuu Truyện / Minotruyen). `drmPlain` is already decrypted.
 * @param {Buffer} imageBuffer
 * @param {string} drmPlain
 * @returns {Promise<Buffer>}
 */
function runStripDescramble(imageBuffer, drmPlain) {
  ensureWorkers();
  const id = taskSeq++;
  const worker = pickWorker();
  return postTask(id, worker, {
    kind: 'strip',
    image: imageBuffer,
    drmPlain,
  });
}

/**
 * ComicDays grid scramble.
 * @param {Buffer} scrambledBuf
 * @returns {Promise<Buffer>}
 */
function runComicDaysGrid(scrambledBuf) {
  ensureWorkers();
  const id = taskSeq++;
  const worker = pickWorker();
  return postTask(id, worker, {
    kind: 'comicDaysGrid',
    image: scrambledBuf,
  });
}

module.exports = {
  WORKER_SCRIPT,
  POOL_SIZE,
  ensureWorkers,
  runStripDescramble,
  runComicDaysGrid,
};
