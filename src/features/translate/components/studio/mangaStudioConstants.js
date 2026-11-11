/**
 * mangaStudioConstants.js
 * Các hằng số cấu hình font, kích thước, bảng màu và typography chuẩn Koharu cho MangaStudioEditor.
 */

export const DEFAULT_STUDIO_FONT = '"CC Wild Words", CCWILDWORDS, CCwildwords, "Adobe 黑体 Std", "Adobe Heiti Std", "SVN-CCWildWords", "HL Comic", "Patrick Hand SC", "Shantell Sans", "Playpen Sans", "Comic Neue", cursive, sans-serif';

export const FONT_OPTIONS = [
  { value: DEFAULT_STUDIO_FONT, label: 'CC Wild Words (Standard Comic)', i18nKey: 'translate.studio.fontWildWords', matches: (f) => !f || f === 'Manga' || f === 'default' || /CC\s*Wild\s*Words|CCWILDWORDS|SVN-CCWildWords/i.test(f) },
  { value: '"Adobe 黑体 Std", "Adobe Heiti Std", "SimHei", sans-serif', label: 'Adobe 黑体 Std (Heiti Manga)', matches: (f) => /Adobe\s*黑体|Adobe\s*Heiti/i.test(f) },
  { value: '"Patrick Hand SC", "SVN-CCWildWords", cursive, sans-serif', label: 'Patrick Hand SC (Small Caps Manga)', matches: (f) => /Patrick\s*Hand\s*SC/i.test(f) },
  { value: '"Shantell Sans", cursive, sans-serif', label: 'Shantell Sans (Arrow Comic Bubble)', matches: (f) => /Shantell\s*Sans/i.test(f) },
  { value: '"Playpen Sans", cursive, sans-serif', label: 'Playpen Sans (Natural Dialogue)', i18nKey: 'translate.studio.fontPlaypen', matches: (f) => /Playpen\s*Sans/i.test(f) },
  { value: '"SVN-Anime Ace 2.0 BB", "Anime Ace", Bangers, "Comic Sans MS", cursive, sans-serif', label: 'Anime Ace (Traditional / Manga)', i18nKey: 'translate.studio.fontAnimeAce', matches: (f) => /Anime\s*Ace/i.test(f) },
  { value: '"Patrick Hand", "SVN-Ames", cursive, sans-serif', label: 'Patrick Hand (Handwriting / Thoughts)', i18nKey: 'translate.studio.fontPatrickHand', matches: (f) => /Patrick\s*Hand(?!.*SC)/i.test(f) },
  { value: '"SVN-Digital Strip", "Digital Strip", "Be Vietnam Pro", sans-serif', label: 'Digital Strip (Narration)', i18nKey: 'translate.studio.fontDigitalStrip', matches: (f) => /Digital\s*Strip/i.test(f) },
  { value: '"Be Vietnam Pro", "Segoe UI", Roboto, sans-serif', label: 'Be Vietnam Pro (Modern Text)', i18nKey: 'translate.studio.fontBeVietnam', matches: (f) => /Be\s*Vietnam\s*Pro/i.test(f) },
  { value: 'Bangers, Impact, cursive, sans-serif', label: 'Bangers / SFX (Shaking Sound Effect)', i18nKey: 'translate.studio.fontBangers', matches: (f) => /Bangers/i.test(f) },
  { value: 'Arial, "Segoe UI", "Noto Sans", sans-serif', label: 'Arial / System', i18nKey: 'translate.studio.fontArial', matches: (f) => /Arial/i.test(f) },
];

export const FONT_SIZE_NUMBERS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48];

export const BASE_FONT_SIZE_OPTIONS = [
  { value: 'auto', label: 'Auto', icon: 'magic_button' },
  ...FONT_SIZE_NUMBERS.map((s) => ({ value: String(s), label: `${s}px` })),
];

export const FONT_WEIGHT_OPTIONS = [
  { value: '300', label: '300 (Light)' },
  { value: '400', label: '400 (Regular)' },
  { value: '600', label: '600 (SemiBold)' },
  { value: '700', label: '700 (Bold)' },
  { value: '900', label: '900 (Black)' },
];

export const FONT_STYLE_OPTIONS = [
  { value: 'normal', label: 'Regular', icon: 'format_clear' },
  { value: 'italic', label: 'Italic', icon: 'format_italic' },
];

export const TEXT_DIRECTION_OPTIONS = [
  { value: 'auto', label: 'Auto', icon: 'magic_button' },
  { value: 'horizontal', label: 'Horizontal', icon: 'arrow_right_alt' },
  { value: 'vertical', label: 'Vertical', icon: 'arrow_downward' },
];

export function resolveFontOptionValue(fontFamily) {
  if (!fontFamily || fontFamily === 'Manga' || fontFamily === 'default') {
    return DEFAULT_STUDIO_FONT;
  }
  const exact = FONT_OPTIONS.find((f) => f.value === fontFamily);
  if (exact) return exact.value;
  const matched = FONT_OPTIONS.find((opt) => opt.matches?.(fontFamily));
  if (matched) return matched.value;
  return DEFAULT_STUDIO_FONT;
}

export const QUICK_COLORS = [
  '#000000',
  '#ffffff',
  '#b3261e',
  '#1976d2',
  '#388e3c',
  '#f57c00',
  '#7b1fa2',
];

export const EMPTY_INITIAL_PAGES = [];

