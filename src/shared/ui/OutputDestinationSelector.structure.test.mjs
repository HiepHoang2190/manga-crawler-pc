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
