import { fetchConnectorList } from './connectorList.js';

const fallback = [{ id: 'x' }];

test('returns fallback when api missing', async () => {
  expect(await fetchConnectorList(null, fallback)).toBe(fallback);
});

test('returns list when non-empty array', async () => {
  const api = { listConnectors: async () => [{ id: 'a' }] };
  expect(await fetchConnectorList(api, fallback)).toEqual([{ id: 'a' }]);
});

test('returns fallback when list empty', async () => {
  const api = { listConnectors: async () => [] };
  expect(await fetchConnectorList(api, fallback)).toBe(fallback);
});
