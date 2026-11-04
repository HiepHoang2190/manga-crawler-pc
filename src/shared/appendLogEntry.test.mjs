import { appendLogEntry } from './appendLogEntry.js';

test('appends entry and caps at 201 items (slice -200 then one new)', () => {
  const prev = Array.from({ length: 200 }, (_, i) => ({ msg: String(i) }));
  const next = appendLogEntry(prev, 'hello', 'warn', () => '12:00:00', () => 42);
  expect(next).toHaveLength(201);
  expect(next[0].msg).toBe('0');
  expect(next[200]).toMatchObject({ msg: 'hello', level: 'warn', t: 42, time: '12:00:00' });
});

test('default level is info', () => {
  const next = appendLogEntry([], 'x', undefined, () => 't', () => 1);
  expect(next[0].level).toBe('info');
});
