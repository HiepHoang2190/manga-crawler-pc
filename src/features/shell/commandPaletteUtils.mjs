/**
 * Pure utilities for the global Command Palette and keyboard shortcuts.
 */
import { sortViewsByOrder } from '../../utils/menuOrderPrefs.mjs';

export function getVisibleOrderedViews(views, hiddenMenuIds = [], menuOrder = []) {
  const list = Array.isArray(views) ? views : [];
  const hidden = new Set(Array.isArray(hiddenMenuIds) ? hiddenMenuIds : []);
  let visible = list.filter((tab) => !hidden.has(tab.id));
  if (visible.length === 0 && list.length > 0) {
    const fallbackTab = list.find((tab) => tab.id === 'explore') || list[0];
    visible = [fallbackTab];
  }
  return sortViewsByOrder(visible, menuOrder);
}

export function normalizeSearchText(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function filterPaletteItems(items, query) {
  const list = Array.isArray(items) ? items : [];
  const needle = normalizeSearchText(query);
  if (!needle) return list;

  const scored = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const labelNorm = normalizeSearchText(item?.label);
    const keywordsNorm = normalizeSearchText(item?.keywords);
    const groupNorm = normalizeSearchText(item?.group);
    const haystack = `${labelNorm} ${keywordsNorm} ${groupNorm}`;
    if (!haystack.includes(needle)) continue;

    let score = 2;
    if (labelNorm.startsWith(needle)) score = 0;
    else if (labelNorm.includes(needle)) score = 1;
    scored.push({ item, score, index: i });
  }

  scored.sort((a, b) => (a.score !== b.score ? a.score - b.score : a.index - b.index));
  return scored.map((entry) => entry.item);
}

export function isMacPlatform(navigatorObj = typeof navigator !== 'undefined' ? navigator : null) {
  const platform = String(
    navigatorObj?.userAgentData?.platform ||
      navigatorObj?.platform ||
      navigatorObj?.userAgent ||
      ''
  ).toLowerCase();
  return platform.includes('mac');
}

export function formatShortcutHint(keyChar, navigatorObj) {
  const prefix = isMacPlatform(navigatorObj) ? '⌘' : 'Ctrl+';
  return `${prefix}${String(keyChar || '').toUpperCase()}`;
}

export function isEditableEventTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = String(target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  if (typeof target.closest === 'function') {
    if (target.closest('[contenteditable="true"]')) return true;
  }
  return false;
}
