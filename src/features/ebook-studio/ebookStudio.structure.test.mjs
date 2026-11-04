import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/ebook-studio/index.js exports EbookStudio', () => {
  const indexSrc = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(indexSrc).toMatch(/export \{ default as EbookStudio \} from '\.\/EbookStudio';/);
});

test('EbookStudio.jsx mounts all 4 Sub-tabs', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'EbookStudio.jsx'), 'utf8');
  expect(studioSrc).toMatch(/import MangaPackagingSubTab from '\.\/components\/MangaPackagingSubTab';/);
  expect(studioSrc).toMatch(/import FormatConverterSubTab from '\.\/components\/FormatConverterSubTab';/);
  expect(studioSrc).toMatch(/import EbookToolsSubTab from '\.\/components\/EbookToolsSubTab';/);
  expect(studioSrc).toMatch(/import SendToKindleTab from '\.\.\/export\/kindle\/SendToKindleTab';/);
});

test('MangaPackagingSubTab connects DualSourcePicker and all 4 config forms', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  expect(pkgSrc).toMatch(/import DualSourcePicker from '\.\/DualSourcePicker';/);
  expect(pkgSrc).toMatch(/import CbzConfigForm from '\.\/forms\/CbzConfigForm';/);
  expect(pkgSrc).toMatch(/import PdfConfigForm from '\.\/forms\/PdfConfigForm';/);
  expect(pkgSrc).toMatch(/import EpubConfigForm from '\.\/forms\/EpubConfigForm';/);
  expect(pkgSrc).toMatch(/import MobiConfigForm from '\.\/forms\/MobiConfigForm';/);
});

test('FormatConverterSubTab uses DualSourcePicker and batch convert APIs', () => {
  const convSrc = fs.readFileSync(path.join(dirname, 'components/FormatConverterSubTab.jsx'), 'utf8');
  expect(convSrc).toMatch(/import DualSourcePicker from '\.\/DualSourcePicker';/);
  expect(convSrc).toMatch(/ebookBatchConvert/);
  expect(convSrc).toMatch(/ResizeSplitter/);
  expect(convSrc).toMatch(/grid-cols-2/);
  expect(convSrc).toMatch(/ebookStudio\.converter\.formatTitle/);
  expect(convSrc).toMatch(/ebookStudio\.converter\.configTitle/);
  expect(convSrc).toMatch(/rotateDoublePage/);
});

test('MangaPackagingSubTab renders diagnostic card for invalid structure', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  expect(pkgSrc).toMatch(/ebookStudio\.packaging\.invalidStructureTitle/);
  expect(pkgSrc).toMatch(/ebookStudio\.packaging\.supportedStructuresTitle/);
  expect(pkgSrc).toMatch(/folder_off/);
});

test('i18n locales vi.js and en.js contain packaging diagnostic keys', () => {
  const rootDir = path.resolve(dirname, '../../..');
  const viSrc = fs.readFileSync(path.join(rootDir, 'src/i18n/locales/vi.js'), 'utf8');
  const enSrc = fs.readFileSync(path.join(rootDir, 'src/i18n/locales/en.js'), 'utf8');
  const requiredKeys = [
    'ebookStudio.packaging.invalidStructureTitle',
    'ebookStudio.packaging.supportedStructuresTitle',
    'ebookStudio.packaging.structure1',
    'ebookStudio.packaging.structure2',
    'ebookStudio.packaging.structure3',
    'ebookStudio.packaging.rotateDoublePage',
    'ebookStudio.packaging.rotateDoublePageDesc',
    'ebookStudio.packaging.pickerHint',
    'ebookStudio.packaging.promptSelectFolderSub',
    'ebookStudio.converter.queueEmptySub',
  ];
  for (const key of requiredKeys) {
    expect(viSrc).toContain(key);
    expect(enSrc).toContain(key);
  }
});
test('EbookStudio subtabs render cleanly without hover tooltips', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'EbookStudio.jsx'), 'utf8');
  expect(studioSrc).not.toMatch(/data-testid=\{`subtab-\$\{tab\.id\}`\}\s+data-tooltip/);
});
test('EbookToolsSubTab implements 2-panel Studio Layout with ResizeSplitter', () => {
  const toolsSrc = fs.readFileSync(path.join(dirname, 'components/EbookToolsSubTab.jsx'), 'utf8');
  expect(toolsSrc).toMatch(/ResizeSplitter/);
  expect(toolsSrc).toMatch(/grid-cols-2/);
  expect(toolsSrc).toMatch(/combineCbz/);
  expect(toolsSrc).toMatch(/splitCbz/);
  expect(toolsSrc).toMatch(/ebookStudio\.tools\.toolTitle/);
});

test('SendToKindleTab implements 2-panel Studio Layout with ResizeSplitter', () => {
  const kindleSrc = fs.readFileSync(path.resolve(dirname, '../export/kindle/SendToKindleTab.jsx'), 'utf8');
  expect(kindleSrc).toMatch(/ResizeSplitter/);
  expect(kindleSrc).toMatch(/sendToKindle\.accountTitle/);
  expect(kindleSrc).toMatch(/sendToKindleTab\.sendPending/);
  expect(kindleSrc).toMatch(/<SearchableSelect/);
  expect(kindleSrc).toMatch(/filterOptions/);
  expect(kindleSrc).not.toMatch(/data-tooltip=\{account/);
  expect(kindleSrc).not.toMatch(/hover:underline/);
});

test('EbookToolsSubTab includes live split naming preview and expected parts list', () => {
  const toolsSrc = fs.readFileSync(path.join(dirname, 'components/EbookToolsSubTab.jsx'), 'utf8');
  expect(toolsSrc).toMatch(/splitLiveResult/);
  expect(toolsSrc).toMatch(/splitDefaultResult/);
  expect(toolsSrc).toMatch(/splitPartsListTitle/);
  expect(toolsSrc).toMatch(/splitPartList/);
});

test('EbookStudio.jsx passes sidebar resize props to all 4 subtabs', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'EbookStudio.jsx'), 'utf8');
  expect(studioSrc).toMatch(/showLeftSidebar=\{showLeftSidebar\}/);
  expect(studioSrc).toMatch(/<EbookToolsSubTab[\s\S]*sidebarWidth=\{sidebarWidth\}/);
  expect(studioSrc).toMatch(/<SendToKindleTab[\s\S]*sidebarWidth=\{sidebarWidth\}/);
});

test('EbookStudio.jsx passes onRunningChange to all 4 subtabs and renders progress icon when busy', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'EbookStudio.jsx'), 'utf8');
  expect(studioSrc).toMatch(/tabBusyMap/);
  expect(studioSrc).toMatch(/handleTabRunningChange/);
  expect(studioSrc).toMatch(/progress_activity/);
  expect(studioSrc).toMatch(/<MangaPackagingSubTab[\s\S]*onRunningChange=\{/);
  expect(studioSrc).toMatch(/<FormatConverterSubTab[\s\S]*onRunningChange=\{/);
  expect(studioSrc).toMatch(/<EbookToolsSubTab[\s\S]*onRunningChange=\{/);
  expect(studioSrc).toMatch(/<SendToKindleTab[\s\S]*onRunningChange=\{/);
});

test('MangaPackagingSubTab.jsx and FormatConverterSubTab.jsx accept and trigger onRunningChange', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  const convSrc = fs.readFileSync(path.join(dirname, 'components/FormatConverterSubTab.jsx'), 'utf8');
  expect(pkgSrc).toMatch(/onRunningChange/);
  expect(pkgSrc).toMatch(/onRunningChange\?\.(\(processing\)|\(Boolean\(processing\)\))/);
  expect(convSrc).toMatch(/onRunningChange/);
  expect(convSrc).toMatch(/onRunningChange\?\.(\(converting\)|\(Boolean\(converting\)\))/);
});

test('EbookStudio mounts action and center slots on toolbar and subtabs render slots outside sidebar', () => {
  const indexSrc = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(indexSrc).toMatch(/export \{[\s\S]*EbookStudioActionSlot[\s\S]*\} from '\.\/EbookStudioActionSlot';/);
  expect(indexSrc).toMatch(/export \{[\s\S]*EbookStudioActionContext[\s\S]*\} from '\.\/EbookStudioActionSlot';/);
  expect(indexSrc).toMatch(/export \{[\s\S]*EbookStudioCenterSlot[\s\S]*\} from '\.\/EbookStudioActionSlot';/);
  expect(indexSrc).toMatch(/export \{[\s\S]*EbookStudioCenterContext[\s\S]*\} from '\.\/EbookStudioActionSlot';/);

  const studioSrc = fs.readFileSync(path.join(dirname, 'EbookStudio.jsx'), 'utf8');
  expect(studioSrc).toMatch(/data-testid="ebook-studio-center-slot"/);
  expect(studioSrc).toMatch(/rightSlot=\{[\s\S]*data-testid="ebook-studio-actions-slot"/);
  expect(studioSrc).toMatch(/<EbookStudioActionContext\.Provider value=\{actionSlotEl\}>/);
  expect(studioSrc).toMatch(/<EbookStudioCenterContext\.Provider value=\{centerSlotEl\}>/);

  const subtabFiles = [
    'components/MangaPackagingSubTab.jsx',
    'components/FormatConverterSubTab.jsx',
    'components/EbookToolsSubTab.jsx',
    '../export/kindle/SendToKindleTab.jsx',
  ];

  for (const relativePath of subtabFiles) {
    const filePath = path.resolve(dirname, relativePath);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/<EbookStudioActionSlot active=\{isActive\}>/);
    expect(content).toMatch(/<EbookStudioCenterSlot active=\{isActive\}>/);

    const actionSlotIndex = content.indexOf('<EbookStudioActionSlot');
    const centerSlotIndex = content.indexOf('<EbookStudioCenterSlot');
    const sidebarIndex = content.search(/\{(isSidebarVisible|showSidebar)\s*&&\s*\(/);
    expect(actionSlotIndex).toBeGreaterThan(-1);
    expect(centerSlotIndex).toBeGreaterThan(-1);
    expect(sidebarIndex).toBeGreaterThan(-1);
    expect(centerSlotIndex).toBeLessThan(sidebarIndex);
  }
});

test('Convert subtabs (Packaging, Converter, Tools) use unified output destination picker layout', () => {
  const subtabs = [
    'components/MangaPackagingSubTab.jsx',
    'components/FormatConverterSubTab.jsx',
    'components/EbookToolsSubTab.jsx',
  ];

  for (const relPath of subtabs) {
    const content = fs.readFileSync(path.join(dirname, relPath), 'utf8');
    // Must have folder_open icon button
    expect(content).toContain('folder_open');
    // Must have close icon button for resetting/clearing custom output destination
    expect(content).toContain('>close<');
    // Must NOT have legacy text button 'Đổi...'
    expect(content).not.toContain("t('ebookStudio.packaging.change')");
    expect(content).not.toContain("t('ebookStudio.packaging.change', 'Đổi...')");
    // Input must NOT be readOnly (allows direct typing or pasting)
    expect(content).not.toMatch(/value=\{outputDir[^}]*\}\s+className="[^"]*"\s+readOnly/);
  }
});

test('All 4 config forms (CBZ, PDF, EPUB, MOBI) omit redundant "Chế độ ..." labels and render inline explanations instead of mode tooltips', () => {
  const formFiles = [
    'components/forms/CbzConfigForm.jsx',
    'components/forms/PdfConfigForm.jsx',
    'components/forms/EpubConfigForm.jsx',
    'components/forms/MobiConfigForm.jsx',
  ];

  for (const relPath of formFiles) {
    const content = fs.readFileSync(path.join(dirname, relPath), 'utf8');
    // Must NOT contain redundant 'Chế độ ...' label
    expect(content).not.toMatch(/<label[^>]*>Chế độ (đóng gói|xuất) [^<]+<\/label>/);
    // Mode buttons must NOT have data-tooltip
    expect(content).not.toMatch(/<button[\s\S]*?data-tooltip=\{mode\.tooltip\}/);
    // Must compute activeMode AFTER modes declaration to avoid TDZ ReferenceError
    const modesIndex = content.indexOf('const modes =');
    const activeModeIndex = content.indexOf('const activeMode =');
    expect(modesIndex).toBeGreaterThan(-1);
    expect(activeModeIndex).toBeGreaterThan(modesIndex);
    expect(content).toMatch(/activeMode\?\.tooltip/);
  }
});

test('All 4 config forms and FormatConverterSubTab share unified rotateDoublePage title and description', () => {
  const formFiles = [
    'components/forms/CbzConfigForm.jsx',
    'components/forms/PdfConfigForm.jsx',
    'components/forms/EpubConfigForm.jsx',
    'components/forms/MobiConfigForm.jsx',
    'components/FormatConverterSubTab.jsx',
  ];

  for (const relPath of formFiles) {
    const content = fs.readFileSync(path.join(dirname, relPath), 'utf8');
    // Must import useI18n and define t
    expect(content).toMatch(/import\s+\{[^}]*useI18n[^}]*\}\s+from/);
    expect(content).toMatch(/const\s+\{\s*t\s*\}\s*=\s*useI18n\(\)/);
    // rotateDoublePage section must NOT have info icon with tooltip
    expect(content).not.toMatch(/rotateDoublePage[\s\S]*?<span[^>]*>info<\/span>/);
    // Must use unified title and description i18n keys
    expect(content).toContain('ebookStudio.packaging.rotateDoublePage');
    expect(content).toContain('ebookStudio.packaging.rotateDoublePageDesc');
    expect(content).toMatch(/Tự động xoay trang đôi theo chiều ngang/);
    expect(content).toMatch(/Tự động nhận diện trang đôi/);
  }
});

test('KindleGenCompilerCard is used by MangaPackagingSubTab and FormatConverterSubTab for sleek compiler status', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  const convSrc = fs.readFileSync(path.join(dirname, 'components/FormatConverterSubTab.jsx'), 'utf8');
  const cardSrc = fs.readFileSync(path.join(dirname, 'components/KindleGenCompilerCard.jsx'), 'utf8');

  expect(pkgSrc).toMatch(/import KindleGenCompilerCard from '\.\/KindleGenCompilerCard';/);
  expect(convSrc).toMatch(/import KindleGenCompilerCard from '\.\/KindleGenCompilerCard';/);
  expect(pkgSrc).toMatch(/compilerSectionTitle[\s\S]*?<KindleGenCompilerCard/);
  expect(convSrc).toMatch(/compilerSectionTitle[\s\S]*?<KindleGenCompilerCard/);
  expect(cardSrc).toMatch(/compilerStatus\?\.available/);
  expect(cardSrc).toMatch(/swap_horiz/);
  expect(cardSrc).toMatch(/folder_open/);
});

test('MangaPackagingSubTab chapter list uses line-clamp-2 break-all for paths and omits folder button tooltip', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  const cardSrc = fs.readFileSync(path.join(dirname, 'components/KindleGenCompilerCard.jsx'), 'utf8');

  // Chapter path must use line-clamp-2 and break-all
  expect(pkgSrc).toMatch(/line-clamp-2\s+break-all[\s\S]*?ch\.path/);

  // Folder open button in chapter list must not have data-tooltip
  const chapterFolderBtn = pkgSrc.match(/<button[^>]*showItemInFolder\(ch\.path\)[\s\S]*?<\/button>/)?.[0] || '';
  expect(chapterFolderBtn).not.toContain('data-tooltip');

  // Folder open button in KindleGenCompilerCard must not have data-tooltip
  const cardFolderBtn = cardSrc.match(/<button[^>]*handleOpenLocation[\s\S]*?<\/button>/)?.[0] || '';
  expect(cardFolderBtn).not.toContain('data-tooltip');
});

test('All 4 Convert subtabs use unified EmptyState component', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  const convSrc = fs.readFileSync(path.join(dirname, 'components/FormatConverterSubTab.jsx'), 'utf8');
  const toolsSrc = fs.readFileSync(path.join(dirname, 'components/EbookToolsSubTab.jsx'), 'utf8');
  const kindleSrc = fs.readFileSync(path.resolve(dirname, '../export/kindle/SendToKindleTab.jsx'), 'utf8');

  expect(pkgSrc).toMatch(/<EmptyState/);
  expect(convSrc).toMatch(/<EmptyState/);
  expect(toolsSrc).toMatch(/<EmptyState/);
  expect(kindleSrc).toMatch(/<EmptyState/);
});

