const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '../../../../..');

test('preload exposes the image pipeline API', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'electron/preload.js'), 'utf8');
  for (const name of ['pipelineScan', 'pipelineAnalyze', 'pipelinePreview', 'pipelineRun', 'pipelineCancel', 'pipelineExportTemplate', 'pipelineImportTemplate', 'subscribePipelineProgress']) {
    expect(src).toMatch(new RegExp(`\\b${name}:`));
  }
  expect(src).toMatch(/'imagePipeline:progress'/);
});

test('ipc index registers the image pipeline module', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'electron/ipc/index.js'), 'utf8');
  expect(src).toMatch(/require\('\.\/imagePipeline'\)/);
  expect(src).toMatch(/registerImagePipelineIpc\(ipc_context\)/);
});
