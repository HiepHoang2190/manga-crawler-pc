import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/help/index.js named-exports HelpGuideModal', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/HelpGuideModal/);
  expect(src).not.toMatch(/helpArticles/);
  expect(src).not.toMatch(/helpTabMapping/);
  expect(src).not.toMatch(/HelpPanel/);
});

test('App imports HelpGuideModal from the help barrel', () => {
  const shell_src = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
  expect(shell_src).toMatch(/from '\.\.\/help'/);
  expect(shell_src).not.toMatch(/HelpPanel/);
  expect(shell_src).not.toMatch(/from '\.\.\/\.\.\/components\/HelpGuideModal'/);
});

test('HomeWorkspace imports HelpGuideModal from the help barrel', () => {
  const src = fs.readFileSync(path.join(dirname, '../home/HomeWorkspace.jsx'), 'utf8');
  expect(src).toMatch(/from '\.\.\/help'/);
  expect(src).not.toMatch(/from '\.\/HelpGuideModal'/);
});
