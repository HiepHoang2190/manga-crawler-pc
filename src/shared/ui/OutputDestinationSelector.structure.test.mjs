import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('OutputDestinationSelector obeys UI rules: no native title= on interactive elements', () => {
  const src = fs.readFileSync(path.join(dirname, 'OutputDestinationSelector.jsx'), 'utf8');
  // Unified Tooltip Standards: CẤM DÙNG thuộc tính title="..." native của HTML
  expect(src).not.toMatch(/<(button|a|span|div|input)\b[^>]*\stitle=/);
});

test('OutputDestinationSelector clear button retains aria-label and has no tooltip', () => {
  const src = fs.readFileSync(path.join(dirname, 'OutputDestinationSelector.jsx'), 'utf8');
  expect(src).toContain("aria-label={t('outputDestination.clear') || 'Xóa thư mục đã chọn'}");
  expect(src).not.toContain("data-tooltip={t('outputDestination.clear')");
  expect(src).not.toContain("title={t('outputDestination.clear')");
});

test('OutputDestinationSelector checks directory existence like Crawler tab with warning ring and icon', () => {
  const src = fs.readFileSync(path.join(dirname, 'OutputDestinationSelector.jsx'), 'utf8');
  // Must use validateSaveDir
  expect(src).toContain('validateSaveDir');
  // Must show warning ring like Crawler tab
  expect(src).toContain('ring-amber-500');
  // Must show warning icon with tooltip
  expect(src).toContain('data-tooltip={activeWarningMsg}');
  // 0 native title
  expect(src).not.toMatch(/<(button|a|span|div|input)\b[^>]*\stitle=/);
});

