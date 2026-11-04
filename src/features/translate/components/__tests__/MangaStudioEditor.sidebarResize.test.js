const fs = require('fs');
const path = require('path');

test('MangaStudioEditor supports resizable left sidebar with localStorage persistence', () => {
  const code = fs.readFileSync(
    path.join(__dirname, '../MangaStudioEditor.jsx'),
    'utf8'
  );

  // Left sidebar storage key and clamping logic
  expect(code).toMatch(/LEFT_SIDEBAR_STORAGE_KEY = 'manga_studio_left_sidebar_width_v1'/);
  expect(code).toMatch(/clampLeftSidebarWidth/);
  expect(code).toMatch(/leftSidebarWidth/);
  expect(code).toMatch(/handleLeftSidebarResizeStart/);

  // Left sidebar container styling and handle mount
  expect(code).toMatch(/style=\{\{\s*width:\s*`\$\{leftSidebarWidth\}px`\s*\}\}/);
  expect(code).toMatch(/onPointerDown=\{handleLeftSidebarResizeStart\}/);

  // Right sidebar also continues to be resizable
  expect(code).toMatch(/RIGHT_SIDEBAR_STORAGE_KEY = 'manga_studio_sidebar_width_v1'/);
  expect(code).toMatch(/onPointerDown=\{handleRightSidebarResizeStart\}/);
});

test('MangaStudioEditor supports toggling show/hide left sidebar with persistence and shortcut', () => {
  const code = fs.readFileSync(
    path.join(__dirname, '../MangaStudioEditor.jsx'),
    'utf8'
  );

  // Left sidebar visibility storage key, state and toggle function
  expect(code).toMatch(/SHOW_LEFT_SIDEBAR_STORAGE_KEY = 'manga_studio_show_left_sidebar_v1'/);
  expect(code).toMatch(/const \[showLeftSidebar, setShowLeftSidebar\] = useState/);
  expect(code).toMatch(/const toggleLeftSidebar = useCallback/);

  // Header button to toggle left sidebar
  expect(code).toMatch(/onClick=\{\(\) => toggleLeftSidebar\(\)\}/);
  expect(code).toMatch(/showLeftSidebar\s*\?\s*'dock_to_left'\s*:\s*'view_sidebar'/);

  // Left rail conditional rendering
  expect(code).toMatch(/\{showLeftSidebar && \(/);

  // Keyboard shortcut Ctrl+Shift+B
  expect(code).toMatch(/e\.shiftKey\)\s*\{\s*toggleLeftSidebar\(\);/);
});
