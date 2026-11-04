// e2e/helpers/dialogMock.js

/**
 * Mock Electron's dialog.showOpenDialog in the main process to return a specific directory.
 * @param {import('@playwright/test').ElectronApplication} electronApp
 * @param {string} targetDir - Absolute path to return
 */
async function mockSelectDirectory(electronApp, targetDir) {
  await electronApp.evaluate(({ dialog }, mockPath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [mockPath],
    });
  }, targetDir);
}

/**
 * Mock Electron's dialog.showOpenDialog to return specific files.
 * @param {import('@playwright/test').ElectronApplication} electronApp
 * @param {string|string[]} targetFiles - File path or array of file paths
 */
async function mockSelectFiles(electronApp, targetFiles) {
  await electronApp.evaluate(({ dialog }, mockFiles) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: Array.isArray(mockFiles) ? mockFiles : [mockFiles],
    });
  }, targetFiles);
}

module.exports = { mockSelectDirectory, mockSelectFiles };
