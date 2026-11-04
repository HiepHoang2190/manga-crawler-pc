const { describe, it, expect, afterAll } = require('@jest/globals');
const path = require('path');

jest.mock('worker_threads', () => {
  const { EventEmitter } = require('events');
  class FakeWorker extends EventEmitter {
    postMessage(msg) {
      setImmediate(() => {
        this.emit('message', {
          id: msg.id,
          ok: true,
          jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        });
      });
    }
    terminate() {}
  }
  return { Worker: FakeWorker };
});

const pool = require('../../download/drmHeavyWorkerPool');

describe('drmHeavyWorkerPool', () => {
  it('runStripDescramble round-robins across workers without ReferenceError', async () => {
    const results = await Promise.all([
      pool.runStripDescramble(Buffer.from([0xff, 0xd8]), '#v4|0-10'),
      pool.runStripDescramble(Buffer.from([0xff, 0xd8]), '#v4|0-10'),
      pool.runStripDescramble(Buffer.from([0xff, 0xd8]), '#v4|0-10'),
    ]);
    for (const r of results) {
      expect(Buffer.isBuffer(r)).toBe(true);
      expect(r.length).toBeGreaterThan(0);
    }
  });

  it('runComicDaysGrid completes without ReferenceError', async () => {
    const r = await pool.runComicDaysGrid(Buffer.from([0xff, 0xd8]));
    expect(Buffer.isBuffer(r)).toBe(true);
    expect(r.length).toBeGreaterThan(0);
  });
});
