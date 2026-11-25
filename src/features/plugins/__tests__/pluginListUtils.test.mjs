import {
  PLUGINS_VIEW_MODE_KEY,
  PLUGINS_SORT_PREF_KEY,
  loadPluginViewMode,
  savePluginViewMode,
  loadPluginSortPref,
  savePluginSortPref,
  filterAndSortPlugins,
} from '../pluginListUtils.mjs';

const SAMPLE_PLUGINS = [
  {
    isEnabled: false,
    sourceUrl: 'https://gist.github.com/a/b.js',
    metadata: {
      id: 'zeta',
      name: 'Zeta Manga',
      author: 'Dev A',
      description: 'French source',
      allowedDomains: ['zeta.example'],
    },
  },
  {
    isEnabled: true,
    sourceUrl: null,
    metadata: {
      id: 'alpha',
      name: 'Alpha Scans',
      author: 'Dev B',
      description: 'Vietnamese comics',
      allowedDomains: ['alpha.example', 'cdn.alpha.example'],
    },
  },
  {
    isEnabled: true,
    sourceUrl: 'https://example.com/beta.js',
    metadata: {
      id: 'beta',
      name: 'Beta Reader',
      author: 'Studio X',
      description: 'Action series',
      allowedDomains: ['beta.org'],
    },
  },
];

describe('pluginListUtils — filtering, sorting, and persisted preferences', () => {
  afterEach(() => {
    delete global.localStorage;
  });

  test('load/save viewMode and sortPref fall back cleanly without or with invalid localStorage', () => {
    expect(loadPluginViewMode('grid')).toBe('grid');
    expect(loadPluginSortPref('enabled_first')).toBe('enabled_first');

    const store = new Map([[PLUGINS_VIEW_MODE_KEY, 'invalid'], [PLUGINS_SORT_PREF_KEY, 'bad']]);
    global.localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
    };

    expect(loadPluginViewMode('grid')).toBe('grid');
    expect(loadPluginSortPref('enabled_first')).toBe('enabled_first');

    savePluginViewMode('list');
    savePluginSortPref('name_desc');
    expect(loadPluginViewMode('grid')).toBe('list');
    expect(loadPluginSortPref('enabled_first')).toBe('name_desc');
  });

  test('filterAndSortPlugins filters across name, id, author, description, domains and status', () => {
    expect(filterAndSortPlugins(SAMPLE_PLUGINS, { statusFilter: 'enabled' }).map((p) => p.metadata.id)).toEqual([
      'alpha',
      'beta',
    ]);
    expect(filterAndSortPlugins(SAMPLE_PLUGINS, { statusFilter: 'disabled' }).map((p) => p.metadata.id)).toEqual([
      'zeta',
    ]);
    expect(filterAndSortPlugins(SAMPLE_PLUGINS, { statusFilter: 'url' }).map((p) => p.metadata.id)).toEqual([
      'beta',
      'zeta',
    ]);

    const metaUrlPlugins = [
      ...SAMPLE_PLUGINS,
      { isEnabled: true, metadata: { id: 'gamma', name: 'Gamma', sourceUrl: 'https://example.com/gamma.js' } },
    ];
    expect(filterAndSortPlugins(metaUrlPlugins, { statusFilter: 'url' }).map((p) => p.metadata.id)).toEqual([
      'beta',
      'gamma',
      'zeta',
    ]);

    // Domain match
    expect(filterAndSortPlugins(SAMPLE_PLUGINS, { searchTerm: 'cdn.alpha' }).map((p) => p.metadata.id)).toEqual([
      'alpha',
    ]);
    // Description match
    expect(filterAndSortPlugins(SAMPLE_PLUGINS, { searchTerm: 'french' }).map((p) => p.metadata.id)).toEqual([
      'zeta',
    ]);
  });

  test('filterAndSortPlugins sorts accurately across all 4 modes', () => {
    expect(filterAndSortPlugins(SAMPLE_PLUGINS, { sortBy: 'enabled_first' }).map((p) => p.metadata.id)).toEqual([
      'alpha',
      'beta',
      'zeta',
    ]);
    expect(filterAndSortPlugins(SAMPLE_PLUGINS, { sortBy: 'disabled_first' }).map((p) => p.metadata.id)).toEqual([
      'zeta',
      'alpha',
      'beta',
    ]);
    expect(filterAndSortPlugins(SAMPLE_PLUGINS, { sortBy: 'name_asc' }).map((p) => p.metadata.id)).toEqual([
      'alpha',
      'beta',
      'zeta',
    ]);
    expect(filterAndSortPlugins(SAMPLE_PLUGINS, { sortBy: 'name_desc' }).map((p) => p.metadata.id)).toEqual([
      'zeta',
      'beta',
      'alpha',
    ]);
  });
});
