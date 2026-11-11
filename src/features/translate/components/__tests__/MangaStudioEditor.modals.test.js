const fs = require('fs');
const path = require('path');

describe('MangaStudioEditor — Modals & Subcomponents Separation Architecture', () => {
  const studioDir = path.join(__dirname, '../studio');
  const editorPath = path.join(__dirname, '../MangaStudioEditor.jsx');

  test('All extracted modal and sidebar component files exist in studio/ directory', () => {
    const requiredFiles = [
      'MangaStudioProjectsModal.jsx',
      'MangaStudioAutoModal.jsx',
      'MangaStudioComparisonModal.jsx',
      'MangaStudioExportConfirmModal.jsx',
      'MangaStudioCompletionModal.jsx',
      'MangaStudioPagesSidebar.jsx',
      'MangaStudioToolbar.jsx',
      'MangaStudioRightSidebar.jsx',
      'MangaStudioProgressHud.jsx',
      'MangaStudioCanvasControls.jsx',
      'MangaStudioCanvasLayers.jsx',
      'useMangaStudioProjects.js',
      'useMangaStudioAutoPipeline.js',
      'useMangaStudioExport.js',
      'useMangaStudioCanvasInteractions.js',
      'useMangaStudioPipelineRunner.js',
      'index.js',
    ];

    for (const file of requiredFiles) {
      const fullPath = path.join(studioDir, file);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  test('MangaStudioEditor imports and renders all extracted subcomponents', () => {
    const code = fs.readFileSync(editorPath, 'utf8');

    expect(code).toMatch(/MangaStudioProjectsModal/);
    expect(code).toMatch(/MangaStudioAutoModal/);
    expect(code).toMatch(/MangaStudioComparisonModal/);
    expect(code).toMatch(/MangaStudioExportConfirmModal/);
    expect(code).toMatch(/MangaStudioCompletionModal/);
    expect(code).toMatch(/MangaStudioPagesSidebar/);
    expect(code).toMatch(/MangaStudioToolbar/);
    expect(code).toMatch(/MangaStudioRightSidebar/);
    expect(code).toMatch(/MangaStudioProgressHud/);
    expect(code).toMatch(/MangaStudioToolPalette/);
    expect(code).toMatch(/MangaStudioZoomBar/);
    expect(code).toMatch(/MangaStudioCanvasLayers/);
    expect(code).toMatch(/useMangaStudioProjects/);
    expect(code).toMatch(/useMangaStudioAutoPipeline/);
    expect(code).toMatch(/useMangaStudioExport/);
    expect(code).toMatch(/useMangaStudioCanvasInteractions/);
    expect(code).toMatch(/useMangaStudioPipelineRunner/);

    expect(code).toMatch(/<MangaStudioProjectsModal/);
    expect(code).toMatch(/<MangaStudioAutoModal/);
    expect(code).toMatch(/<MangaStudioComparisonModal/);
    expect(code).toMatch(/<MangaStudioExportConfirmModal/);
    expect(code).toMatch(/<MangaStudioCompletionModal/);
    expect(code).toMatch(/<MangaStudioPagesSidebar/);
    expect(code).toMatch(/<MangaStudioToolbar/);
    expect(code).toMatch(/<MangaStudioRightSidebar/);
    expect(code).toMatch(/<MangaStudioProgressHud/);
    expect(code).toMatch(/<MangaStudioToolPalette/);
    expect(code).toMatch(/<MangaStudioZoomBar/);
    expect(code).toMatch(/<MangaStudioCanvasLayers/);
  });

  test('All extracted subcomponents adhere to no-native-select standard', () => {
    const componentFiles = [
      'MangaStudioProjectsModal.jsx',
      'MangaStudioAutoModal.jsx',
      'MangaStudioComparisonModal.jsx',
      'MangaStudioExportConfirmModal.jsx',
      'MangaStudioCompletionModal.jsx',
      'MangaStudioPagesSidebar.jsx',
      'MangaStudioToolbar.jsx',
      'MangaStudioRightSidebar.jsx',
      'MangaStudioProgressHud.jsx',
      'MangaStudioCanvasControls.jsx',
      'MangaStudioCanvasLayers.jsx',
    ];

    for (const file of componentFiles) {
      const fullPath = path.join(studioDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content).not.toMatch(/<select/);
    }
  });

  test('All extracted subcomponents use project useI18n and do not import react-i18next', () => {
    const componentFiles = [
      'MangaStudioProjectsModal.jsx',
      'MangaStudioAutoModal.jsx',
      'MangaStudioComparisonModal.jsx',
      'MangaStudioExportConfirmModal.jsx',
      'MangaStudioCompletionModal.jsx',
      'MangaStudioPagesSidebar.jsx',
      'MangaStudioToolbar.jsx',
      'MangaStudioRightSidebar.jsx',
      'MangaStudioProgressHud.jsx',
      'MangaStudioCanvasControls.jsx',
      'MangaStudioCanvasLayers.jsx',
    ];

    for (const file of componentFiles) {
      const fullPath = path.join(studioDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content).not.toMatch(/react-i18next/);
      expect(content).toMatch(/useI18n/);
    }
  });
});

