import fs from 'node:fs';
import path from 'node:path';

const read = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

const TARGET_FILES = [
  // Shared UI
  'src/shared/ui/SourcePicker.jsx',
  'src/shared/ui/OutputFormatSelector.jsx',
  'src/shared/ui/OutputDestinationSelector.jsx',
  'src/shared/ui/CaesiumCompressControl.jsx',
  // Explore
  'src/features/explore/components/ExploreSourceSelect.jsx',
  'src/features/latest-updates/LatestUpdatesPanel.jsx',
  'src/features/explore/components/FollowedMangaPanel.jsx',
  'src/features/bulk-scan/BulkScanPanel.jsx',
  // Home
  'src/features/download/components/Sidebar.jsx',
  'src/features/download/components/ProgressPanel.jsx',
  'src/features/home/HomeToolsDropdown.jsx',
  // Tools Studio & Export
  'src/features/tools-studio/image-pipeline/formControls.jsx',
  'src/features/tools-studio/image-pipeline/ImagePipelineTab.jsx',
  'src/features/tools-studio/image-pipeline/ActionStackPanel.jsx',
  'src/features/export/cbz/CbzExportTab.jsx',
  'src/features/export/pdf/PdfExportTab.jsx',
  'src/features/export/upscale/UpscaleTab.jsx',
  'src/features/export/rename/RenameTab.jsx',
  'src/features/export/kindle/SendToKindleTab.jsx',
  'src/features/export/kindle/SendToKindleModal.jsx',
  'src/features/export/cbz/CombineTab.jsx',
  'src/features/export/cbz/SplitTab.jsx',
  // Ebook Studio
  'src/features/ebook-studio/components/FormatConverterSubTab.jsx',
  'src/features/ebook-studio/components/MangaPackagingSubTab.jsx',
  'src/features/ebook-studio/components/EbookToolsSubTab.jsx',
  // Plugins & Site Checker
  'src/features/plugins/PluginManagementPanel.jsx',
  'src/features/site-checker/SiteCheckerPanel.jsx',
  // Workflow, Translate, Dashboard, Settings
  'src/features/workflow/components/WorkflowPalette.jsx',
  'src/features/translate/components/studio/MangaStudioRightSidebar.jsx',
  'src/features/translate/components/settings/TranslateGeneralSettingsSection.jsx',
  'src/features/dashboard/dashboard/SectionHeader.jsx',
  'src/features/settings/SettingsPanel.jsx',
  'src/features/settings/ChapterFolderControls.jsx',
  'src/features/settings/BrandingSettingsSection.jsx',
  'src/features/settings/ThemeCardPicker.jsx',
  'src/features/settings/UserDataBackupSection.jsx',
];

const LEGACY_FRAGMENTED_CLASSES = [
  'text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50',
  'text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60',
  'text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60',
  'text-[10px] font-bold uppercase tracking-widest text-on-surface-variant',
  'text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70',
  'text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70',
  'text-[10px] uppercase tracking-wide text-on-surface-variant/60 font-semibold',
  'text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide',
  'text-xs font-bold text-on-surface-variant tracking-widest uppercase',
  'text-xs font-bold text-on-surface-variant uppercase tracking-widest',
  'text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70',
];

describe('Unified Section & Field Title Typography (SectionTitle)', () => {
  test('SectionTitle.jsx exists with canonical SECTION_TITLE_CLASS and is exported from src/shared/index.js', () => {
    const compPath = path.resolve(process.cwd(), 'src/shared/ui/SectionTitle.jsx');
    expect(fs.existsSync(compPath)).toBe(true);
    const code = read('src/shared/ui/SectionTitle.jsx');
    expect(code).toContain(
      "text-[11px] font-bold uppercase tracking-wider text-on-surface-variant select-none",
    );
    expect(code).toContain('export const SECTION_TITLE_CLASS');
    expect(code).toContain('export default function SectionTitle');

    const barrel = read('src/shared/index.js');
    expect(barrel).toContain("from './ui/SectionTitle.jsx'");
    expect(barrel).toContain('SectionTitle');
    expect(barrel).toContain('SECTION_TITLE_CLASS');
  });

  test('AGENTS.md and .agent/AGENTS.md document SectionTitle standard', () => {
    for (const docPath of ['AGENTS.md', '.agent/AGENTS.md']) {
      const doc = read(docPath);
      expect(doc).toContain('SectionTitle');
      expect(doc).toContain('SECTION_TITLE_CLASS');
      expect(doc).toContain(
        'text-[11px] font-bold uppercase tracking-wider text-on-surface-variant select-none',
      );
    }
  });

  test.each(TARGET_FILES)(
    '%s uses SectionTitle / SECTION_TITLE_CLASS and has zero legacy fragmented section-title classes',
    (relPath) => {
      const code = read(relPath);
      expect(code).toMatch(/\b(?:SectionTitle|SECTION_TITLE_CLASS)\b/);
      for (const legacyCls of LEGACY_FRAGMENTED_CLASSES) {
        expect(code).not.toContain(legacyCls);
      }
    },
  );
});
