import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const THEME_STORAGE_KEY = 'manga-crawler-theme';
export const PRESET_STORAGE_KEY = 'manga-crawler-theme-preset';

export const AVAILABLE_THEMES = [
  {
    id: 'violet',
    nameKey: 'settings.theme.preset.violet',
    descKey: 'settings.theme.preset.violet.desc',
    swatches: {
      light: ['#fafafa', '#ece7f0', '#5a3799'],
      dark: ['#131313', '#202020', '#cdbdff'],
    },
  },
  {
    id: 'catppuccin',
    nameKey: 'settings.theme.preset.catppuccin',
    descKey: 'settings.theme.preset.catppuccin.desc',
    swatches: {
      light: ['#eff1f5', '#ccd0da', '#8839ef'],
      dark: ['#1e1e2e', '#313244', '#cba6f7'],
    },
  },
  {
    id: 'tokyonight',
    nameKey: 'settings.theme.preset.tokyonight',
    descKey: 'settings.theme.preset.tokyonight.desc',
    swatches: {
      light: ['#e1e2e7', '#bcbdc4', '#2e7de9'],
      dark: ['#1a1b26', '#24283b', '#7aa2f7'],
    },
  },
  {
    id: 'nord',
    nameKey: 'settings.theme.preset.nord',
    descKey: 'settings.theme.preset.nord.desc',
    swatches: {
      light: ['#eceff4', '#d8dee9', '#5e81ac'],
      dark: ['#242933', '#3b4252', '#88c0d0'],
    },
  },
  {
    id: 'sepia',
    nameKey: 'settings.theme.preset.sepia',
    descKey: 'settings.theme.preset.sepia.desc',
    swatches: {
      light: ['#fbf5eb', '#e4d7c5', '#8d5b4c'],
      dark: ['#1f1916', '#332a25', '#e0a98b'],
    },
  },
  {
    id: 'oled',
    nameKey: 'settings.theme.preset.oled',
    descKey: 'settings.theme.preset.oled.desc',
    swatches: {
      light: ['#ffffff', '#d1d5db', '#0f172a'],
      dark: ['#000000', '#1c1c1c', '#38bdf8'],
    },
  },
  {
    id: 'dracula',
    nameKey: 'settings.theme.preset.dracula',
    descKey: 'settings.theme.preset.dracula.desc',
    swatches: {
      light: ['#f8f8f2', '#deded6', '#7b52b9'],
      dark: ['#282a36', '#44475a', '#ff79c6'],
    },
  },
  {
    id: 'github',
    nameKey: 'settings.theme.preset.github',
    descKey: 'settings.theme.preset.github.desc',
    swatches: {
      light: ['#ffffff', '#f6f8fa', '#0969da'],
      dark: ['#0d1117', '#161b22', '#2f81f7'],
    },
  },
  {
    id: 'onedark',
    nameKey: 'settings.theme.preset.onedark',
    descKey: 'settings.theme.preset.onedark.desc',
    swatches: {
      light: ['#fafafa', '#f0f0f0', '#4078f2'],
      dark: ['#282c34', '#21252b', '#61afef'],
    },
  },
  {
    id: 'rosepine',
    nameKey: 'settings.theme.preset.rosepine',
    descKey: 'settings.theme.preset.rosepine.desc',
    swatches: {
      light: ['#faf4ed', '#f2e9de', '#b4637a'],
      dark: ['#191724', '#1f1d2e', '#ebbcba'],
    },
  },
  {
    id: 'emerald',
    nameKey: 'settings.theme.preset.emerald',
    descKey: 'settings.theme.preset.emerald.desc',
    swatches: {
      light: ['#f4f9f6', '#e6f3eb', '#059669'],
      dark: ['#111915', '#17231d', '#34d399'],
    },
  },
  {
    id: 'cyberpunk',
    nameKey: 'settings.theme.preset.cyberpunk',
    descKey: 'settings.theme.preset.cyberpunk.desc',
    swatches: {
      light: ['#fef8ee', '#f8ebd4', '#ff007f'],
      dark: ['#1a102f', '#261b40', '#00f0ff'],
    },
  },
];

const ThemeContext = createContext(null);

function applyDarkClass(isDark) {
  document.documentElement.classList.toggle('dark', isDark);
}

function applyThemeAttribute(preset) {
  if (typeof document === 'undefined') return;
  if (preset && preset !== 'violet') {
    document.documentElement.setAttribute('data-theme', preset);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function readStoredPreference() {
  if (typeof window === 'undefined') return 'light';
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'light';
}

function readStoredPreset() {
  if (typeof window === 'undefined') return 'violet';
  const v = localStorage.getItem(PRESET_STORAGE_KEY);
  if (AVAILABLE_THEMES.some((t) => t.id === v)) return v;
  return 'violet';
}

function prefersDarkScheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }) {
  const [themePreference, setThemePreferenceState] = useState(readStoredPreference);
  const [presetTheme, setPresetThemeState] = useState(readStoredPreset);
  const [systemDark, setSystemDark] = useState(prefersDarkScheme);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    setSystemDark(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedDark =
    themePreference === 'system' ? systemDark : themePreference === 'dark';

  useEffect(() => {
    applyDarkClass(resolvedDark);
  }, [resolvedDark]);

  useEffect(() => {
    applyThemeAttribute(presetTheme);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, presetTheme);
    } catch {
      /* quota */
    }
  }, [presetTheme]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      /* quota */
    }
  }, [themePreference]);

  const setThemePreference = useCallback((mode) => {
    if (mode === 'light' || mode === 'dark' || mode === 'system') {
      setThemePreferenceState(mode);
    }
  }, []);

  const setPresetTheme = useCallback((preset) => {
    if (AVAILABLE_THEMES.some((t) => t.id === preset)) {
      setPresetThemeState(preset);
    }
  }, []);

  /** Tương thích ConsolePanel: bật/tắt sáng–tối tường minh (thoát chế độ system). */
  const toggleDarkMode = useCallback(() => {
    setThemePreferenceState((prev) => {
      const darkNow = prev === 'system' ? prefersDarkScheme() : prev === 'dark';
      return darkNow ? 'light' : 'dark';
    });
  }, []);

  const darkMode = resolvedDark;
  const setDarkMode = useCallback((updater) => {
    setThemePreferenceState((prev) => {
      const darkNow = prev === 'system' ? prefersDarkScheme() : prev === 'dark';
      const nextBool = typeof updater === 'function' ? updater(darkNow) : updater;
      return nextBool ? 'dark' : 'light';
    });
  }, []);

  const value = useMemo(
    () => ({
      darkMode,
      resolvedDark,
      themePreference,
      setThemePreference,
      setDarkMode,
      toggleDarkMode,
      presetTheme,
      setPresetTheme,
      availableThemes: AVAILABLE_THEMES,
    }),
    [
      darkMode,
      resolvedDark,
      themePreference,
      setThemePreference,
      setDarkMode,
      toggleDarkMode,
      presetTheme,
      setPresetTheme,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

