import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('QueuePanel defines isPaused in renderRow', () => {
  const filePath = path.join(dirname, 'components/QueuePanel.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify isPaused is defined inside renderRow
  expect(content).toMatch(/renderRow=\{[\s\S]*?const isPaused = Boolean\(item\.paused\);[\s\S]*?isPaused\s*\?\s*'text-amber-600/);
});

test('QueuePanel checkboxes (header and rows) do not have data-tooltip', () => {
  const filePath = path.join(dirname, 'components/QueuePanel.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify renderRow checkbox has aria-label and no data-tooltip
  expect(content).toMatch(/renderRow=\{[\s\S]*?<input[\s\S]*?type="checkbox"[\s\S]*?aria-label=\{t\('queue\.checkboxTitle'\)\}/);
  expect(content).not.toMatch(/renderRow=\{[\s\S]*?<input[\s\S]*?type="checkbox"[\s\S]*?data-tooltip=\{t\('queue\.checkboxTitle'\)\}/);

  // Verify header checkbox has aria-label and no data-tooltip
  expect(content).toMatch(/key:\s*'checkbox'[\s\S]*?<input[\s\S]*?type="checkbox"[\s\S]*?aria-label=\{t\('queue\.checkboxTitle'\)\}/);
  expect(content).not.toMatch(/key:\s*'checkbox'[\s\S]*?<input[\s\S]*?type="checkbox"[\s\S]*?data-tooltip=\{t\('queue\.checkboxTitle'\)\}/);
});

test('QueuePanel uses distinct A-Z and Z-A DownloadOrderIcon for download order toggle', () => {
  const filePath = path.join(dirname, 'components/QueuePanel.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify DownloadOrderIcon is defined and used
  expect(content).toMatch(/function DownloadOrderIcon/);
  expect(content).toMatch(/<DownloadOrderIcon order=\{item\.downloadOrder\}/);
  expect(content).not.toMatch(/onToggleGroupDownloadOrder[\s\S]*?arrow_upward/);
});

test('QueuePanel imports and renders QueueWorkflowSelector', () => {
  const filePath = path.join(dirname, 'components/QueuePanel.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  expect(content).toMatch(/import\s+QueueWorkflowSelector\s+from\s+['"]\.\/QueueWorkflowSelector(?:\.jsx)?['"]/);
  expect(content).toMatch(/<QueueWorkflowSelector/);
});

test('QueuePanel has zero occurrences of hover:underline or underline', () => {
  const filePath = path.join(dirname, 'components/QueuePanel.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  expect(content).not.toMatch(/hover:underline/);
  expect(content).not.toMatch(/\bunderline\b/);
});

test('QueueWorkflowSelector exists and has zero occurrences of hover:underline or underline', () => {
  const filePath = path.join(dirname, 'components/QueueWorkflowSelector.jsx');
  expect(fs.existsSync(filePath)).toBe(true);
  const content = fs.readFileSync(filePath, 'utf8');

  expect(content).not.toMatch(/hover:underline/);
  expect(content).not.toMatch(/\bunderline\b/);
});

test('QueuePanel supports workflow state rendering (running, completed, failed) and retry button', () => {
  const filePath = path.join(dirname, 'components/QueuePanel.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  expect(content).toMatch(/workflowState\s*===\s*['"]running['"]/);
  expect(content).toMatch(/workflowState\s*===\s*['"]completed['"]/);
  expect(content).toMatch(/workflowState\s*===\s*['"]failed['"]/);
  expect(content).toMatch(/retryGroupWorkflow/);
});

test('QueueWorkflowSelector prevents clipping with dynamic placement and viewport bounds', () => {
  const filePath = path.join(dirname, 'components/QueueWorkflowSelector.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  expect(content).toMatch(/placement/);
  expect(content).toMatch(/max-w-\[calc\(100vw-32px\)\]/);
  expect(content).toMatch(/right-0/);
});

