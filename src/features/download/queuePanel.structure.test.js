import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('QueuePanel defines isPaused in task card render', () => {
  const filePath = path.join(dirname, 'components/QueuePanel.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  expect(content).toMatch(/data-testid="queue-task-card"/);
  expect(content).toMatch(/const isPaused = Boolean\(item\.paused\);[\s\S]*?isPaused[\s\S]*?'text-amber-600/);
});

test('QueuePanel checkboxes (header and rows) do not have data-tooltip', () => {
  const filePath = path.join(dirname, 'components/QueuePanel.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // Verify card checkbox has aria-label and no data-tooltip
  expect(content).toMatch(/data-testid="queue-task-card"[\s\S]*?<input[\s\S]*?type="checkbox"[\s\S]*?aria-label=\{t\('queue\.checkboxTitle'\)\}/);
  expect(content).not.toMatch(/data-testid="queue-task-card"[\s\S]*?<input[\s\S]*?type="checkbox"[\s\S]*?data-tooltip=\{t\('queue\.checkboxTitle'\)\}/);

  // Verify selection-bar select-all checkbox has aria-label and no data-tooltip
  expect(content).toMatch(/data-testid="queue-selection-bar"[\s\S]*?<input[\s\S]*?type="checkbox"[\s\S]*?aria-label=\{t\('queue\.checkboxTitle'\)\}/);
  expect(content).not.toMatch(/data-testid="queue-selection-bar"[\s\S]*?<input[\s\S]*?type="checkbox"[\s\S]*?data-tooltip=\{t\('queue\.checkboxTitle'\)\}/);
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

test('QueueWorkflowSelector prevents clipping with createPortal, dynamic placement and viewport bounds', () => {
  const filePath = path.join(dirname, 'components/QueueWorkflowSelector.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  expect(content).toMatch(/createPortal/);
  expect(content).toMatch(/placement/);
  expect(content).toMatch(/max-w-\[calc\(100vw-32px\)\]/);
  expect(content).toMatch(/position:\s*['"]fixed['"]/);
});

test('QueuePanel supports Shift+click range selection on task cards and checkboxes', () => {
  const filePath = path.join(dirname, 'components/QueuePanel.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  expect(content).toMatch(/import\s+\{[^}]*\bapplyQueueRowSelection\b[^}]*\}\s+from\s+['"]\.\.\/queueMutations(?:\.js)?['"]/);
  expect(content).toMatch(/lastClickedIndexRef/);
  expect(content).toMatch(/checkboxShiftRef/);
  expect(content).toMatch(/data-testid="queue-task-card"[\s\S]*?onClick=\{\(e\)\s*=>\s*handleSelectRow\(i,\s*Boolean\(e\.shiftKey\)\)\}/);
  expect(content).toMatch(/type="checkbox"[\s\S]*?onMouseDown=\{\(e\)\s*=>\s*\{[\s\S]*?e\.shiftKey[\s\S]*?onKeyDown=\{\(e\)\s*=>\s*\{[\s\S]*?e\.shiftKey[\s\S]*?onBlur=\{\(\)\s*=>\s*\{[\s\S]*?checkboxShiftRef\.current\s*=\s*false[\s\S]*?onChange=\{\(\)\s*=>\s*\{[\s\S]*?handleSelectRow\(i,\s*shiftKey\)/);
});

