const {
  listCatalogEntries,
  getCatalogEntry,
  runConnectorTest,
  assertConnectorTestResult,
} = require('../../../platform/connectors/tester');

const DELAY_MS = 1500;
const FILTER_ID = process.env.CONNECTOR_ID;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('connector catalog live', () => {
  const catalog_entries = listCatalogEntries().filter(
    (catalog_entry) => !FILTER_ID || catalog_entry.siteId === FILTER_ID,
  );

  if (FILTER_ID && catalog_entries.length === 0) {
    throw new Error(`CONNECTOR_ID=${FILTER_ID} is not in the catalog`);
  }

  catalog_entries.forEach((catalog_entry, entry_index) => {
    test(
      `${catalog_entry.siteId} live connector test`,
      async () => {
        if (entry_index > 0) await sleep(DELAY_MS);
        const test_result = await runConnectorTest(catalog_entry.siteId);
        assertConnectorTestResult(test_result, getCatalogEntry(catalog_entry.siteId));
      },
      120000,
    );
  });
});
