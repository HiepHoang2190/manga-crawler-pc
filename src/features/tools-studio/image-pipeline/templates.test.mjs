// src/features/tools-studio/image-pipeline/templates.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  TEMPLATES_KEY, ACTIVE_TEMPLATE_KEY, DESTINATION_KEY, SYSTEM_TEMPLATE_ID,
  normalizeOutput, ensureTemplates, saveTemplates, loadTemplates, serializeTemplate,
  parseImportedTemplate, templateSignature, loadDestination, saveDestination, buildSystemTemplate,
} from './templates.js';
import { createAction } from './actionTypes.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
}

describe('templates', () => {
  test('normalizeOutput clamps values', () => {
    expect(normalizeOutput({ format: 'bmp', quality: 500, resizePercent: 100 })).toEqual({ format: 'original', quality: 100, resizePercent: null, concurrency: 'auto' });
    expect(normalizeOutput({ format: 'webp', quality: 0, resizePercent: 5 })).toEqual({ format: 'webp', quality: 1, resizePercent: 10, concurrency: 'auto' });
    expect(normalizeOutput({ concurrency: 'max' }).concurrency).toBe('max');
  });

  test('ensureTemplates returns system template with empty actions by default', () => {
    const storage = memoryStorage();
    const list = ensureTemplates(storage);
    expect(list.map((t) => t.id)).toEqual([SYSTEM_TEMPLATE_ID]);
    expect(list[0].actions).toEqual([]);
  });

  test('saveTemplates never persists the system template; loadTemplates round-trips', () => {
    const storage = memoryStorage();
    const user = { id: 'tpl_u', name: 'Mine', version: 1, actions: [createAction('crop')], output: normalizeOutput({}) };
    saveTemplates(storage, [buildSystemTemplate(), user]);
    const loaded = loadTemplates(storage);
    expect(loaded.map((t) => t.id)).toEqual(['tpl_u']);
    expect(loaded[0].actions[0].type).toBe('crop');
  });

  test('parseImportedTemplate drops unknown actions, override-only params and duplicate ids', () => {
    const text = JSON.stringify({
      id: 'tpl_u', name: '  Imported  ', version: 1,
      actions: [
        { id: 'a', type: 'crop', params: { tolerance: 20, boxRatio: { left: 0 } } },
        { id: 'a', type: 'deskew', params: { angle: 3 } },
        { id: 'w', type: 'watermark' },
      ],
      output: { format: 'jpg', quality: 90 },
    });
    const { template, dropped } = parseImportedTemplate(text, ['tpl_u']);
    expect(dropped).toBe(1);
    expect(template.id).not.toBe('tpl_u');
    expect(template.name).toBe('Imported');
    expect(template.actions[0].params.boxRatio).toBeUndefined();
    expect(template.actions[1].params.angle).toBeUndefined();
    expect(template.actions[0].id).not.toBe(template.actions[1].id);
    expect(template.output).toEqual({ format: 'jpg', quality: 90, resizePercent: null, concurrency: 'auto' });
  });

  test('parseImportedTemplate rejects bad input', () => {
    expect(() => parseImportedTemplate('{', [])).toThrow('INVALID_JSON');
    expect(() => parseImportedTemplate('{"name":"x"}', [])).toThrow('INVALID_TEMPLATE');
    expect(() => parseImportedTemplate('{"version":99,"actions":[]}', [])).toThrow('UNSUPPORTED_VERSION');
  });

  test('serializeTemplate strips UI-only fields', () => {
    const t = { ...buildSystemTemplate(), actions: [{ id: '1', type: 'crop', enabled: true, collapsed: false, params: {} }] };
    const out = serializeTemplate(t);
    expect(out.system).toBeUndefined();
    expect(out.nameKey).toBeUndefined();
    expect(out.actions[0].collapsed).toBeUndefined();
  });

  test('templateSignature ignores ids, collapse state and key order', () => {
    const a = createAction('crop');
    const b = { ...createAction('crop'), collapsed: true, params: Object.fromEntries(Object.entries(a.params).reverse()) };
    expect(templateSignature({ actions: [a], output: {} })).toBe(templateSignature({ actions: [b], output: {} }));
    expect(templateSignature({ actions: [a], output: {} })).not.toBe(templateSignature({ actions: [{ ...a, enabled: false }], output: {} }));
  });

  test('destination falls back to legacy compress keys then persists', () => {
    const storage = memoryStorage({ manga_compress_output_dir: '/out', manga_compress_in_place: 'true', manga_compress_open_folder: 'false' });
    expect(loadDestination(storage)).toEqual({ inPlace: true, outputDir: '/out', openFolderAfter: false });
    saveDestination(storage, { inPlace: false, outputDir: '/x', openFolderAfter: true });
    expect(loadDestination(storage)).toEqual({ inPlace: false, outputDir: '/x', openFolderAfter: true });
    expect(loadDestination(null)).toEqual({ inPlace: false, outputDir: '', openFolderAfter: true });
  });

  test('backup whitelist contains the pipeline keys', () => {
    const src = fs.readFileSync(path.join(dirname, '../../../utils/userDataBackup.js'), 'utf8');
    for (const key of [TEMPLATES_KEY, ACTIVE_TEMPLATE_KEY, DESTINATION_KEY]) expect(src).toContain(`'${key}'`);
  });
});
