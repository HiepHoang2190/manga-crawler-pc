// src/features/tools-studio/image-pipeline/templates.js
import { ACTION_TYPES, createAction, generateId } from './actionTypes.js';

export const TEMPLATES_KEY = 'manga_image_pipeline_templates_v1';
export const ACTIVE_TEMPLATE_KEY = 'manga_image_pipeline_active_template';
export const DESTINATION_KEY = 'manga_image_pipeline_destination';
export const TEMPLATE_VERSION = 1;
export const SYSTEM_TEMPLATE_ID = 'tpl_system_clean_scan';
export const DEFAULT_OUTPUT = { format: 'original', quality: 100, resizePercent: null, concurrency: 'auto' };

const OUTPUT_FORMATS = ['original', 'jpg', 'png', 'webp'];
const CONCURRENCY_OPTIONS = ['auto', '2', '4', '8', 'max'];
const OVERRIDE_ONLY_PARAMS = ['angle', 'boxRatio', 'customSplit', 'force'];
const DESKEW_MODES = ['autoCrop', 'fillWhite', 'fillBlack', 'none'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function readKey(storage, key) {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeKey(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    /* storage full or unavailable */
  }
}

export function normalizeOutput(output = {}) {
  const o = isObject(output) ? output : {};
  const format = OUTPUT_FORMATS.includes(o.format) ? o.format : 'original';
  const quality = Number(o.quality);
  const defaultQuality = format === 'original' ? 100 : 90;
  const resize = Number(o.resizePercent);
  const concurrency = CONCURRENCY_OPTIONS.includes(String(o.concurrency)) ? String(o.concurrency) : 'auto';
  return {
    format,
    quality: Number.isFinite(quality) ? Math.max(1, Math.min(100, Math.round(quality))) : defaultQuality,
    resizePercent: Number.isFinite(resize) && resize > 0 && resize < 100 ? Math.max(10, Math.round(resize)) : null,
    concurrency,
  };
}

export function sanitizeActions(list) {
  const seen = new Set();
  let dropped = 0;
  const actions = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (!isObject(raw) || !ACTION_TYPES[raw.type]) {
      dropped += 1;
      continue;
    }
    const params = { ...ACTION_TYPES[raw.type].defaults, ...(isObject(raw.params) ? raw.params : {}) };
    for (const key of OVERRIDE_ONLY_PARAMS) delete params[key];
    let id = typeof raw.id === 'string' && raw.id ? raw.id : generateId('act');
    if (seen.has(id)) id = generateId('act');
    seen.add(id);
    actions.push({ id, type: raw.type, enabled: raw.enabled !== false, collapsed: raw.collapsed !== undefined ? Boolean(raw.collapsed) : true, params: structuredClone(params) });
  }
  return { actions, dropped };
}

export function buildSystemTemplate() {
  return {
    id: SYSTEM_TEMPLATE_ID,
    name: 'Mặc định',
    nameKey: 'imagePipeline.template.default',
    system: true,
    version: TEMPLATE_VERSION,
    actions: [],
    output: { ...DEFAULT_OUTPUT },
  };
}

export function buildLegacyTemplate() {
  return null;
}

export function serializeTemplate(template) {
  return {
    id: template.id,
    name: template.name,
    version: TEMPLATE_VERSION,
    actions: template.actions.map(({ id, type, enabled, params }) => ({ id, type, enabled, params })),
    output: normalizeOutput(template.output),
  };
}

export function loadTemplates(storage) {
  const raw = readKey(storage, TEMPLATES_KEY);
  if (!raw) return null;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    return list
      .filter((t) => isObject(t) && typeof t.id === 'string' && t.id !== SYSTEM_TEMPLATE_ID)
      .map((t) => ({
        id: t.id,
        name: typeof t.name === 'string' ? t.name : 'Template',
        version: TEMPLATE_VERSION,
        actions: sanitizeActions(t.actions).actions,
        output: normalizeOutput(t.output),
      }));
  } catch {
    return null;
  }
}

export function saveTemplates(storage, list) {
  writeKey(storage, TEMPLATES_KEY, JSON.stringify(list.filter((t) => !t.system).map(serializeTemplate)));
}

export function ensureTemplates(storage) {
  const system = buildSystemTemplate();
  const stored = loadTemplates(storage);
  if (stored) {
    const user = stored.filter((t) => !(t.name === 'Mặc định' && t.actions?.length === 3));
    if (user.length !== stored.length) saveTemplates(storage, user);
    return [system, ...user];
  }
  return [system];
}

export function parseImportedTemplate(text, existingIds = []) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }
  if (!isObject(data) || !Array.isArray(data.actions)) throw new Error('INVALID_TEMPLATE');
  if (typeof data.version === 'number' && data.version > TEMPLATE_VERSION) throw new Error('UNSUPPORTED_VERSION');
  const { actions, dropped } = sanitizeActions(data.actions);
  const taken = new Set([...existingIds, SYSTEM_TEMPLATE_ID]);
  const id = typeof data.id === 'string' && data.id && !taken.has(data.id) ? data.id : generateId('tpl');
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 80) : 'Template';
  return { template: { id, name, version: TEMPLATE_VERSION, actions, output: normalizeOutput(data.output) }, dropped };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function templateSignature({ actions = [], output = {} }) {
  return stableStringify({
    actions: actions.map((a) => [a.type, a.enabled !== false, a.params || {}]),
    output: normalizeOutput(output),
  });
}

export function loadDestination(storage) {
  const raw = readKey(storage, DESTINATION_KEY);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      return { inPlace: Boolean(d.inPlace), outputDir: typeof d.outputDir === 'string' ? d.outputDir : '', openFolderAfter: d.openFolderAfter !== false };
    } catch {
      /* fall through to legacy keys */
    }
  }
  return {
    inPlace: readKey(storage, 'manga_compress_in_place') === 'true',
    outputDir: readKey(storage, 'manga_compress_output_dir') || '',
    openFolderAfter: readKey(storage, 'manga_compress_open_folder') !== 'false',
  };
}

export function saveDestination(storage, destination) {
  writeKey(storage, DESTINATION_KEY, JSON.stringify({
    inPlace: Boolean(destination.inPlace),
    outputDir: destination.outputDir || '',
    openFolderAfter: destination.openFolderAfter !== false,
  }));
}
