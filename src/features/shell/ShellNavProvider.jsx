import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth';
import { migrateHiddenMenuIds } from '../bulk-scan';
import {
  loadMenuOrder,
  saveMenuOrder,
  moveMenuItem,
  reorderMenuItems,
  resetMenuOrder,
} from '../../utils/menuOrderPrefs.mjs';

const ShellNavContext = createContext(null);

const MENU_HIDDEN_IDS_KEY = 'mangaMenuHiddenIds';
export const MENU_VIEW_STORAGE_KEY = 'mangaMenuViewPref_v1';
/** All 10 menu tabs can be hidden, as long as at least 1 tab remains visible. */
const HIDABLE_MENU_IDS = [
  'explore',
  'home',
  'toolsStudio',
  'ebookStudio',
  'translate',
  'workflow',
  'plugins',
  'siteChecker',
  'settings',
  'dashboard',
];

function loadInitialMenuView(hiddenIds = []) {
  if (typeof window === 'undefined') return 'home';
  try {
    const saved = localStorage.getItem(MENU_VIEW_STORAGE_KEY);
    if (saved && (HIDABLE_MENU_IDS.includes(saved) || saved === 'latestUpdates' || saved === 'bulkScan')) {
      const normalized = saved === 'latestUpdates' || saved === 'bulkScan' ? 'explore' : saved;
      if (!hiddenIds.includes(normalized)) {
        return normalized;
      }
    }
  } catch {
    /* ignore */
  }
  return 'home';
}

function loadMenuHiddenIds() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MENU_HIDDEN_IDS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const migrated = migrateHiddenMenuIds(arr).map((id) =>
      id === 'latestUpdates' || id === 'bulkScan' ? 'explore' : id
    );
    if (JSON.stringify(migrated) !== JSON.stringify(arr)) {
      try {
        localStorage.setItem(MENU_HIDDEN_IDS_KEY, JSON.stringify(migrated));
      } catch {
        /* ignore quota / private mode */
      }
    }
    const filtered = [...new Set(migrated.filter((id) => HIDABLE_MENU_IDS.includes(id)))];
    // Always guarantee that at least 1 tab remains visible
    if (filtered.length >= HIDABLE_MENU_IDS.length) {
      return filtered.filter((id) => id !== 'explore');
    }
    return filtered;
  } catch {
    return [];
  }
}

export function ShellNavProvider({ children }) {
  const { authBootstrapped, authSession } = useAuth();
  /** Hidden menu tabs (latestUpdates, help, ...) — persisted in localStorage. */
  const [hiddenMenuIds, setHiddenMenuIds] = useState(() => loadMenuHiddenIds());
  const [menuView, setMenuView] = useState(() => loadInitialMenuView(hiddenMenuIds));
  const [menuOrder, setMenuOrder] = useState(() => loadMenuOrder());

  useEffect(() => {
    try {
      if (menuView && (HIDABLE_MENU_IDS.includes(menuView) || menuView === 'latestUpdates' || menuView === 'bulkScan')) {
        const normalized = menuView === 'latestUpdates' || menuView === 'bulkScan' ? 'explore' : menuView;
        localStorage.setItem(MENU_VIEW_STORAGE_KEY, normalized);
      }
    } catch {
      /* ignore */
    }
  }, [menuView]);

  useEffect(() => {
    try {
      saveMenuOrder(menuOrder);
    } catch {
      /* ignore */
    }
  }, [menuOrder]);

  const handleMoveMenu = useCallback((id, direction) => {
    setMenuOrder((prev) => moveMenuItem(prev, id, direction));
  }, []);

  const handleReorderMenu = useCallback((fromId, toId) => {
    setMenuOrder((prev) => reorderMenuItems(prev, fromId, toId));
  }, []);

  const handleResetMenuOrder = useCallback(() => {
    const defaultOrder = resetMenuOrder();
    setMenuOrder(defaultOrder);
  }, []);

  const handleResetMenuPrefs = useCallback(() => {
    const defaultOrder = resetMenuOrder();
    setMenuOrder(defaultOrder);
    setHiddenMenuIds([]);
    try {
      localStorage.removeItem(MENU_HIDDEN_IDS_KEY);
      localStorage.removeItem(MENU_VIEW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleHiddenMenu = useCallback((id) => {
    if (!HIDABLE_MENU_IDS.includes(id)) return;
    setHiddenMenuIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) {
        s.delete(id);
      } else {
        // Enforce: at least 1 tab must remain visible
        const visibleCount = HIDABLE_MENU_IDS.filter((tabId) => !s.has(tabId)).length;
        if (visibleCount <= 1) {
          return prev;
        }
        s.add(id);
      }
      return [...s].sort();
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(MENU_HIDDEN_IDS_KEY, JSON.stringify(hiddenMenuIds));
    } catch {
      /* ignore */
    }
  }, [hiddenMenuIds]);

  useLayoutEffect(() => {
    if (hiddenMenuIds.includes(menuView)) {
      const firstVisible =
        menuOrder.find((id) => !hiddenMenuIds.includes(id)) ||
        HIDABLE_MENU_IDS.find((id) => !hiddenMenuIds.includes(id)) ||
        'explore';
      setMenuView(firstVisible);
    }
  }, [hiddenMenuIds, menuView, menuOrder]);

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.subscribeAuthSessionInvalidated) return undefined;
    const unsub = api.subscribeAuthSessionInvalidated(() => {
      setMenuView('home');
    });
    return () => unsub?.();
  }, []);

  const value = useMemo(
    () => ({
      menuView,
      setMenuView,
      hiddenMenuIds,
      toggleHiddenMenu,
      menuOrder,
      handleMoveMenu,
      handleReorderMenu,
      handleResetMenuOrder,
      handleResetMenuPrefs,
    }),
    [
      menuView,
      hiddenMenuIds,
      toggleHiddenMenu,
      menuOrder,
      handleMoveMenu,
      handleReorderMenu,
      handleResetMenuOrder,
      handleResetMenuPrefs,
    ]
  );

  return <ShellNavContext.Provider value={value}>{children}</ShellNavContext.Provider>;
}

export function useShellNav() {
  const ctx = useContext(ShellNavContext);
  if (!ctx) throw new Error('useShellNav must be used within ShellNavProvider');
  return ctx;
}
