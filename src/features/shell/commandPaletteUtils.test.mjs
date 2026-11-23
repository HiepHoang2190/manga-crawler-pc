import {
  getVisibleOrderedViews,
  normalizeSearchText,
  filterPaletteItems,
  isMacPlatform,
  formatShortcutHint,
  isEditableEventTarget,
} from './commandPaletteUtils.mjs';

describe('commandPaletteUtils', () => {
  test('normalizeSearchText strips Vietnamese diacritics and lowercases', () => {
    expect(normalizeSearchText('Dịch Manga Studio')).toBe('dich manga studio');
    expect(normalizeSearchText('Cài đặt hệ thống')).toBe('cai dat he thong');
    expect(normalizeSearchText('Đang theo dõi')).toBe('dang theo doi');
  });

  test('filterPaletteItems matches diacritic-insensitive queries and ranks prefix matches first', () => {
    const items = [
      { id: 'tools', label: 'Công cụ ảnh', keywords: 'crop deskew', group: 'Tab' },
      { id: 'settings', label: 'Cài đặt', keywords: 'preferences', group: 'Tab' },
      { id: 'translate', label: 'Dịch Manga', keywords: 'ocr translate', group: 'Tab' },
      { id: 'action-console', label: 'Ẩn / Hiện bảng nhật ký', keywords: 'console log', group: 'Action' },
    ];

    expect(filterPaletteItems(items, '')).toHaveLength(4);
    expect(filterPaletteItems(items, 'cai dat').map((i) => i.id)).toEqual(['settings']);
    expect(filterPaletteItems(items, 'dich').map((i) => i.id)).toEqual(['translate']);
    expect(filterPaletteItems(items, 'console').map((i) => i.id)).toEqual(['action-console']);
  });

  test('ranks label prefix higher than substring matches', () => {
    const items = [
      { id: 'a', label: 'Mở cài đặt tải', keywords: '' },
      { id: 'b', label: 'Cài đặt', keywords: '' },
    ];
    expect(filterPaletteItems(items, 'cai dat').map((i) => i.id)).toEqual(['b', 'a']);
  });

  test('isMacPlatform and formatShortcutHint detect macOS vs Windows/Linux', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isMacPlatform({ platform: 'Win32' })).toBe(false);
    expect(formatShortcutHint('k', { platform: 'MacIntel' })).toBe('⌘K');
    expect(formatShortcutHint('k', { platform: 'Win32' })).toBe('Ctrl+K');
  });

  test('isEditableEventTarget detects inputs, textareas, selects, and contentEditable', () => {
    expect(isEditableEventTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableEventTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableEventTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableEventTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableEventTarget({ tagName: 'DIV', closest: () => ({}) })).toBe(true);
    expect(isEditableEventTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditableEventTarget(null)).toBe(false);
  });

  test('getVisibleOrderedViews filters hidden tabs, falls back when all hidden, and applies order', () => {
    const views = [{ id: 'explore' }, { id: 'home' }, { id: 'settings' }];
    expect(getVisibleOrderedViews(views, ['home'], ['settings', 'explore', 'home']).map((v) => v.id)).toEqual([
      'settings',
      'explore',
    ]);
    expect(getVisibleOrderedViews(views, ['explore', 'home', 'settings'], []).map((v) => v.id)).toEqual(['explore']);
  });
});
