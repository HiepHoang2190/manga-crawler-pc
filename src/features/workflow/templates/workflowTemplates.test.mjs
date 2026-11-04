import { DEFAULT_TEMPLATES } from './defaultTemplates.mjs';
import {
  exportWorkflowJson,
  importWorkflowJson,
  loadSavedWorkflows,
  saveWorkflow,
  getOrInitWorkflows,
  createWorkflow,
  duplicateWorkflow,
  renameWorkflow,
  deleteWorkflow,
  getActiveWorkflowId,
  setActiveWorkflowId,
} from '../utils/workflowStorage.mjs';

describe('workflowTemplates & storage', () => {
  beforeEach(() => {
    globalThis.localStorage = {
      _m: new Map(),
      getItem(k) {
        return this._m.has(k) ? this._m.get(k) : null;
      },
      setItem(k, v) {
        this._m.set(k, String(v));
      },
      removeItem(k) {
        this._m.delete(k);
      },
      clear() {
        this._m.clear();
      },
    };
  });

  test('has built-in templates list exported as array', () => {
    expect(Array.isArray(DEFAULT_TEMPLATES)).toBe(true);
  });

  test('contains template_cbz_google_drive in DEFAULT_TEMPLATES with valid pipeline', () => {
    const tpl = DEFAULT_TEMPLATES.find((t) => t.id === 'template_cbz_google_drive');
    expect(tpl).toBeDefined();
    expect(tpl.nodes.map((n) => n.type)).toEqual([
      'folder_trigger',
      'rename_folder',
      'duplicate_cleaner',
      'export_cbz',
      'upload_google_drive',
    ]);
    expect(tpl.edges).toHaveLength(4);
  });

  test('exportWorkflowJson serializes cleanly', () => {
    const wf = { id: 'test_wf', name: 'Test Workflow', nodes: [{ id: 'n1', type: 'manga_crawler', x: 0, y: 0 }], edges: [] };
    const jsonStr = exportWorkflowJson(wf);
    expect(typeof jsonStr).toBe('string');
    const parsed = JSON.parse(jsonStr);
    expect(parsed.id).toBe(wf.id);
  });

  test('importWorkflowJson validates structure', () => {
    const wf = { id: 'test_wf_2', name: 'Test Workflow 2', nodes: [{ id: 'n1', type: 'folder_trigger', x: 0, y: 0 }], edges: [] };
    const jsonStr = exportWorkflowJson(wf);
    const imported = importWorkflowJson(jsonStr);
    expect(imported.id).toBe(wf.id);
    expect(imported.nodes).toHaveLength(wf.nodes.length);

    expect(() => importWorkflowJson('invalid json')).toThrow();
    expect(() => importWorkflowJson(JSON.stringify({ notAWorkflow: true }))).toThrow('Dữ liệu Workflow không đúng định dạng');
  });

  test('saveWorkflow and loadSavedWorkflows persist to storage', () => {
    expect(loadSavedWorkflows()).toEqual([]);
    const testWf = { id: 'custom_1', name: 'My Custom Workflow', nodes: [], edges: [] };
    saveWorkflow(testWf);

    const loaded = loadSavedWorkflows();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('My Custom Workflow');

    // Update existing
    saveWorkflow({ ...testWf, name: 'Updated Name' });
    const reloaded = loadSavedWorkflows();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].name).toBe('Updated Name');
  });

  test('getOrInitWorkflows seeds an initial workflow when empty', () => {
    const seeded = getOrInitWorkflows();
    expect(seeded.length).toBeGreaterThanOrEqual(1);
    expect(seeded[0].id).toBeDefined();
    expect(getActiveWorkflowId()).toBe(seeded[0].id);
  });

  test('createWorkflow, duplicateWorkflow, renameWorkflow, deleteWorkflow flow', () => {
    const created = createWorkflow({ name: 'Alpha Flow' });
    expect(created.name).toBe('Alpha Flow');
    expect(getActiveWorkflowId()).toBe(created.id);

    const renamed = renameWorkflow(created.id, 'Alpha Flow Renamed');
    expect(renamed.name).toBe('Alpha Flow Renamed');

    const duplicated = duplicateWorkflow(created.id);
    expect(duplicated.name).toBe('Alpha Flow Renamed (Bản sao)');
    expect(duplicated.id).not.toBe(created.id);
    expect(getActiveWorkflowId()).toBe(duplicated.id);

    const remaining = deleteWorkflow(created.id);
    expect(remaining.find((w) => w.id === created.id)).toBeUndefined();
    expect(remaining.find((w) => w.id === duplicated.id)).toBeDefined();
  });
});
