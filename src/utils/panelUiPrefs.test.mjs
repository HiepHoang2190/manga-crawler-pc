/**
 * Property tests for panelUiPrefs tab persistence.
 * Feature: cbz-export-tab
 *
 * Run with: node --experimental-vm-modules src/utils/panelUiPrefs.test.mjs
 * Or via jest: NODE_OPTIONS=--experimental-vm-modules npx jest --testPathPattern=panelUiPrefs
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

// Minimal localStorage mock
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

global.localStorage = localStorageMock;

// Import after setting up localStorage mock
const { savePanelUi, loadPanelUi } = await import('./panelUiPrefs.js');

// Feature: cbz-export-tab, Property 1: tab persistence round-trip
test('Property 1: tab persistence round-trip — all valid tabs survive save/load', () => {
  // Validates: Requirements 1.3
  fc.assert(
    fc.property(
      fc.constantFrom('queue', 'history', 'favorites', 'offlineRead', 'duplicates', 'cbzExport'),
      (tabId) => {
        localStorageMock.clear();
        savePanelUi({ queueTab: tabId });
        const loaded = loadPanelUi();
        return loaded.queueTab === tabId;
      }
    ),
    { numRuns: 100 }
  );
});
