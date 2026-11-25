import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(dirname, '../..');

test('package.json and package-lock.json do not depend on @supabase/supabase-js', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  expect(pkg.dependencies?.['@supabase/supabase-js']).toBeUndefined();
  expect(pkg.devDependencies?.['@supabase/supabase-js']).toBeUndefined();

  const lockPath = path.join(REPO_ROOT, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    expect(lock.packages?.['']?.dependencies?.['@supabase/supabase-js']).toBeUndefined();
    expect(lock.packages?.['node_modules/@supabase/supabase-js']).toBeUndefined();
  }
});

test('Supabase and app login files/directories have been completely removed', () => {
  const removedPaths = [
    'src/auth',
    'src/utils/authSession.js',
    'src/utils/freeUserCreditGate.mjs',
    'src/utils/guestCredits.js',
    'src/utils/packageEntitlements.js',
    'src/utils/packageEntitlementView.mjs',
    'electron/ipc/auth.js',
    'electron/lib/auth',
    'electron/lib/platform/connectors/api-clients/supabaseEmbeddedConfig.js',
    'supabase',
    '.env.example',
  ];

  for (const rel of removedPaths) {
    expect(fs.existsSync(path.join(REPO_ROOT, rel))).toBe(false);
  }
});

test('core entrypoints and feature providers contain no Supabase, login gate, credit, or entitlement references', () => {
  const checkedFiles = [
    'electron/main.js',
    'electron/preload.js',
    'electron/ipc/index.js',
    'src/app/App.jsx',
    'src/features/shell/ShellLayout.jsx',
    'src/features/shell/ShellNavProvider.jsx',
    'src/features/download/DownloadProvider.jsx',
    'src/features/download/components/Sidebar.jsx',
    'src/features/download/components/MangaInfo.jsx',
    'src/features/reader/ReaderProvider.jsx',
    'src/features/reader/components/EbookReader.jsx',
    'src/features/export/ExportProvider.jsx',
    'src/features/home/HomeWorkspace.jsx',
    'src/features/settings/SettingsPanel.jsx',
    'src/features/site-checker/SiteCheckerPanel.jsx',
    'src/shared/ui/AdminContactLinks.jsx',
  ];

  const forbidden =
    /supabase|useAuth|AuthProvider|AuthRequiredView|guestCredit|freeUserToken|packageEntitlement|loginGoogle|auth:getSession|consumeFreeUserDownloadCredit|ensureFreeUserCreditsByEmail/i;

  for (const rel of checkedFiles) {
    const content = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    expect(content).not.toMatch(forbidden);
  }
});

test('vi.js and en.js include open-source keys and zero auth/credit/entitlement keys', () => {
  for (const rel of ['src/i18n/locales/vi.js', 'src/i18n/locales/en.js']) {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    expect(src).toMatch(/'common\.close':/);
    expect(src).toMatch(/'settings\.openSourceBadge':/);
    expect(src).toMatch(/'settings\.openSourceHint':/);

    expect(src).not.toMatch(/'(auth\.gate\.|guestCredit\.|freeUserToken\.|settings\.account\.)/);
    expect(src).not.toMatch(/'settings\.tab\.account':/);
    expect(src).not.toMatch(/'settings\.guestAccountHint':/);
    expect(src).not.toMatch(/Phiên đăng nhập Google|Google sign-in session/);
  }
});

test('helpArticles.js does not instruct users to register for Member access', () => {
  const helpSrc = fs.readFileSync(path.join(REPO_ROOT, 'src/features/help/helpArticles.js'), 'utf8');
  expect(helpSrc).not.toMatch(/suutamebooktruyentranhdangky|Đăng ký Member|Member Registration/i);
});
