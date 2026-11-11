const fs = require('fs');
const path = require('path');

const editorPath = path.join(__dirname, '../MangaStudioEditor.jsx');
const rightSidebarPath = path.join(__dirname, '../studio/MangaStudioRightSidebar.jsx');

describe('MangaStudioEditor — Tab Thuộc Tính (Properties Inspector) Unified Dropdowns', () => {
  test('MangaStudioEditor adheres to unified dropdown standards: no native <select> tags', () => {
    expect(fs.existsSync(editorPath)).toBe(true);
    const code = fs.readFileSync(editorPath, 'utf8');

    // Rule: CẤM dùng thẻ <select> native của HTML
    expect(code).not.toMatch(/<select/);

    // Rule: BẮT BUỘC sử dụng component dùng chung SearchableSelect
    if (fs.existsSync(rightSidebarPath)) {
      const sidebarCode = fs.readFileSync(rightSidebarPath, 'utf8');
      expect(sidebarCode).not.toMatch(/<select/);
      expect(sidebarCode).toMatch(/import \{[^}]*SearchableSelect[^}]*\} from/);
      expect(sidebarCode).toMatch(/<SearchableSelect/);
    } else {
      expect(code).toMatch(/import \{[^}]*SearchableSelect[^}]*\} from/);
      expect(code).toMatch(/<SearchableSelect/);
    }
  });

  test('Tab Thuộc tính (Type Inspector) integrates SearchableSelect for all typography options', () => {
    const code = fs.existsSync(rightSidebarPath)
      ? fs.readFileSync(rightSidebarPath, 'utf8')
      : fs.readFileSync(editorPath, 'utf8');

    // Font selection
    expect(code).toMatch(/options=\{fontOptions\}/);

    // Font size selection
    expect(code).toMatch(/options=\{fontSizeOptions\}/);

    // Font weight selection
    expect(code).toMatch(/options=\{fontWeightOptions\}/);

    // Font style selection
    expect(code).toMatch(/options=\{FONT_STYLE_OPTIONS\}/);

    // Text direction selection
    expect(code).toMatch(/options=\{TEXT_DIRECTION_OPTIONS\}/);
  });

  test('MangaStudioEditor top toolbar pill and quick switcher support all cloud providers (claude, deepseek, openrouter)', () => {
    const code = fs.readFileSync(editorPath, 'utf8');

    // activeProviderInfo must support claude, deepseek, openrouter
    expect(code).toMatch(/case 'claude':/);
    expect(code).toMatch(/case 'deepseek':/);
    expect(code).toMatch(/case 'openrouter':/);

    // cloudProviders list must include claude, deepseek, openrouter
    expect(code).toMatch(/id:\s*'claude'/);
    expect(code).toMatch(/id:\s*'deepseek'/);
    expect(code).toMatch(/id:\s*'openrouter'/);
  });

  test('Layers section unifies Layers header and Text Group folder row and indents text layer items', () => {
    const code = fs.existsSync(rightSidebarPath)
      ? fs.readFileSync(rightSidebarPath, 'utf8')
      : fs.readFileSync(editorPath, 'utf8');

    // Layers Header and Text Group merged into single row
    expect(code).not.toMatch(/<span className="font-semibold text-xs">Layers<\/span>/);
    expect(code).toMatch(/translate\.type\.textGroup/);

    // Text layers list is indented with pl-3.5
    expect(code).toMatch(/<div className="space-y-2 pl-3\.5">/);
  });
});

