const fs = require('fs');
const path = require('path');
const fc = require('fast-check');

const WORKFLOW_FILES = [
  'src/features/workflow/components/WorkflowToolbar.jsx',
  'src/features/workflow/components/WorkflowPalette.jsx',
  'src/features/workflow/components/WorkflowCanvas.jsx',
  'src/features/workflow/components/WorkflowNodeCard.jsx',
  'src/features/workflow/components/WorkflowPort.jsx',
  'src/features/workflow/components/WorkflowEdge.jsx',
  'src/features/workflow/components/WorkflowInspector.jsx',
  'src/features/workflow/components/WorkflowLogConsole.jsx',
  'src/features/workflow/components/WorkflowStudio.jsx',
  'src/features/workflow/components/WorkflowTemplateModal.jsx',
  'src/features/workflow/components/WorkflowManagerModal.jsx',
];

const TRANSLATE_FILES = [
  'src/features/translate/components/MangaStudioEditor.jsx',
];

const ROOT = path.resolve(__dirname, '../../');

function extractKeys(source, prefix) {
  const keys = new Set();
  const escapedPrefix = prefix.replace('.', '\\.');
  const re = new RegExp(`\\bt\\(\\s*['"](${escapedPrefix}\\.[^'"]+)['"]`, 'g');
  let m;
  while ((m = re.exec(source)) !== null) {
    keys.add(m[1]);
  }
  return [...keys];
}

function collectWorkflowKeys() {
  const allKeys = new Set();
  for (const relPath of WORKFLOW_FILES) {
    const absPath = path.join(ROOT, relPath);
    const source = fs.readFileSync(absPath, 'utf8');
    for (const key of extractKeys(source, 'workflow')) {
      allKeys.add(key);
    }
  }
  const templateIds = [
    'template_crawl_split_rename_cbz',
    'template_crawl_kindle',
    'template_crawl_translate_cbz',
    'template_crawl_cbz_cleanup',
    'template_crawl_cbz_gdrive',
  ];
  for (const id of templateIds) {
    allKeys.add(`workflow.templates.builtin.${id}.name`);
    allKeys.add(`workflow.templates.builtin.${id}.desc`);
  }
  return [...allKeys].sort();
}

function collectTranslateStudioKeys() {
  const allKeys = new Set();
  for (const relPath of TRANSLATE_FILES) {
    const absPath = path.join(ROOT, relPath);
    const source = fs.readFileSync(absPath, 'utf8');
    for (const key of extractKeys(source, 'translate.studio')) {
      allKeys.add(key);
    }
  }
  return [...allKeys].sort();
}

function loadLocale(relPath) {
  const absPath = path.join(ROOT, relPath);
  const source = fs.readFileSync(absPath, 'utf8');
  const match = source.match(/export\s+const\s+\w+\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) throw new Error(`Could not parse locale file: ${relPath}`);
  const obj = new Function(`return ${match[1]}`)();
  return obj;
}

describe('Workflow & Translate Studio i18n Key Completeness', () => {
  let workflowKeys;
  let translateStudioKeys;
  let en;
  let vi;

  beforeAll(() => {
    workflowKeys = collectWorkflowKeys();
    translateStudioKeys = collectTranslateStudioKeys();
    en = loadLocale('src/i18n/locales/en.js');
    vi = loadLocale('src/i18n/locales/vi.js');
  });

  test('found workflow.* keys in components', () => {
    expect(workflowKeys.length).toBeGreaterThan(0);
  });

  test('every workflow.* key used in components exists in en locale', () => {
    const missing = workflowKeys.filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  test('every workflow.* key used in components exists in vi locale', () => {
    const missing = workflowKeys.filter((k) => !(k in vi));
    expect(missing).toEqual([]);
  });

  test('every translate.studio.* key used in MangaStudioEditor exists in en locale', () => {
    const missing = translateStudioKeys.filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  test('every translate.studio.* key used in MangaStudioEditor exists in vi locale', () => {
    const missing = translateStudioKeys.filter((k) => !(k in vi));
    expect(missing).toEqual([]);
  });

  test('property: for every extracted workflow.* key, both locales contain it', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...workflowKeys),
        (key) => {
          return key in en && key in vi;
        }
      )
    );
  });
});
