import { useI18n } from '../../context/I18nContext';
import { SearchableSelect } from '../../shared';
import { formatChapterFolderName, formatChapterPageFileName } from '../../utils/chapterFolderFormat';

/**
 * Định dạng thư mục chương & cách lưu ảnh — dùng trong Cài đặt (Settings).
 */
export default function ChapterFolderControls({
  chapterFolder,
  setChapterFolder,
  persistChapterFolder,
  mangadexVolumeFolderGrouping,
  setMangadexVolumeFolderGrouping,
}) {
  const { t } = useI18n();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  if (!api?.getChapterFolderSettings) return null;
  if (!chapterFolder || typeof setChapterFolder !== 'function' || typeof persistChapterFolder !== 'function') {
    return null;
  }

  const prefix = chapterFolder.prefix?.trim() || 'Chap';
  const padDigits = chapterFolder.padDigits || 3;
  const pad1 = String(1).padStart(padDigits, '0');
  const pad2 = String(2).padStart(padDigits, '0');
  const pad10 = String(10).padStart(padDigits, '0');

  const example1 = `${prefix} ${pad1}`;
  const example2 = `${prefix} ${pad2}`;
  const example10 = `${prefix} ${pad10}`;

  const mangaPlaceholder = t('settings.chapterFolderMangaPlaceholder') || '[Tên truyện]';
  const subfolderName1 = formatChapterFolderName('Chapter 1', chapterFolder) || `${prefix} ${pad1}`;
  const subfolderName2 = formatChapterFolderName('Chapter 2', chapterFolder) || `${prefix} ${pad2}`;

  const flatFile1 = formatChapterPageFileName('Chapter 1', 1, 'jpg', chapterFolder);
  const flatFile2 = formatChapterPageFileName('Chapter 1', 2, 'jpg', chapterFolder);
  const flatFile3 = formatChapterPageFileName('Chapter 2', 1, 'jpg', chapterFolder);

  const numberedControls =
    chapterFolder.mode === 'numbered' ? (
      <div className="space-y-2.5 pt-1">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem] sm:items-end max-w-2xl">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              {t('settings.chapterFolderPrefix')}
            </label>
            <input
              type="text"
              value={chapterFolder.prefix}
              placeholder={t('settings.chapterFolderPrefixPlaceholder')}
              onChange={(e) => setChapterFolder((p) => ({ ...p, prefix: e.target.value }))}
              onBlur={(e) => void persistChapterFolder({ prefix: e.target.value })}
              className="w-full h-10 bg-surface-container-highest border border-outline-variant/25 rounded-xl text-xs px-3 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-hidden transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              {t('settings.chapterFolderPadDigits')}
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={chapterFolder.padDigits}
              onChange={(e) => {
                const n = Number(e.target.value);
                const digits = Number.isFinite(n) ? Math.max(1, Math.min(Math.floor(n), 5)) : 3;
                void persistChapterFolder({ padDigits: digits });
              }}
              className="w-full h-10 bg-surface-container-highest border border-outline-variant/25 rounded-xl text-xs px-3 text-on-surface tabular-nums focus:border-primary focus:ring-1 focus:ring-primary outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors"
            />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/15 space-y-1.5 text-xs">
          <p className="text-on-surface-variant leading-relaxed">
            {t('settings.chapterFolderMode.numberedDesc')}
          </p>
          <div className="font-mono text-[11px] text-primary font-medium bg-primary/5 px-2.5 py-1.5 rounded-lg border border-primary/10">
            📁 {example1} &nbsp;•&nbsp; 📁 {example2} &nbsp;•&nbsp; 📁 {example10}...
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* 1. Tên thư mục chương */}
      <div className="space-y-2.5 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10">
        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
          {t('settings.chapterFolderMode')}
        </label>
        <SearchableSelect
          value={chapterFolder.mode}
          onChange={(mode) => {
            const m = mode === 'original' ? 'original' : 'numbered';
            void persistChapterFolder({ mode: m });
          }}
          options={[
            { value: 'numbered', label: t('settings.chapterFolderMode.numbered') },
            { value: 'original', label: t('settings.chapterFolderMode.original') },
          ]}
          placeholder=""
        />

        {numberedControls}

        {chapterFolder.mode === 'original' && (
          <div className="p-3 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/15 space-y-1.5 text-xs pt-1">
            <p className="text-on-surface-variant leading-relaxed">
              {t('settings.chapterFolderMode.originalDesc')}
            </p>
            <div className="font-mono text-[11px] text-primary font-medium bg-primary/5 px-2.5 py-1.5 rounded-lg border border-primary/10">
              {t('settings.chapterFolderMode.originalExample')}
            </div>
          </div>
        )}
      </div>

      {/* 2. Cách lưu ảnh */}
      <div className="space-y-2.5 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10">
        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
          {t('settings.chapterFolderLayout')}
        </label>
        <SearchableSelect
          value={chapterFolder.layout === 'flat' ? 'flat' : 'subfolder'}
          onChange={(layout) => {
            const next = layout === 'flat' ? 'flat' : 'subfolder';
            void persistChapterFolder({ layout: next });
          }}
          options={[
            { value: 'subfolder', label: t('settings.chapterFolderLayout.subfolder') },
            { value: 'flat', label: t('settings.chapterFolderLayout.flat') },
          ]}
          placeholder=""
        />

        <div className="p-3 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/15 space-y-2 text-xs">
          <p className="text-on-surface-variant leading-relaxed">
            {chapterFolder.layout === 'flat'
              ? t('settings.chapterFolderLayout.flatDesc')
              : t('settings.chapterFolderLayout.subfolderDesc')}
          </p>

          <div className="rounded-lg bg-surface-container-high/50 p-2.5 border border-outline-variant/10">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
              {chapterFolder.layout === 'flat'
                ? t('settings.chapterFolderFlatExample')
                : t('settings.chapterFolderSubfolderExample')}
            </span>
            {chapterFolder.layout === 'flat' ? (
              <pre className="font-mono text-[11px] text-on-surface/90 leading-relaxed overflow-x-auto select-all">
{`📁 ${mangaPlaceholder}/
├── 📄 ${flatFile1}
├── 📄 ${flatFile2}
└── 📄 ${flatFile3}`}
              </pre>
            ) : (
              <pre className="font-mono text-[11px] text-on-surface/90 leading-relaxed overflow-x-auto select-all">
{`📁 ${mangaPlaceholder}/
├── 📁 ${subfolderName1}/
│   ├── 📄 001.jpg
│   └── 📄 002.jpg
└── 📁 ${subfolderName2}/
    └── 📄 001.jpg`}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* 3. Phân loại theo tập cho MangaDex */}
      {typeof setMangadexVolumeFolderGrouping === 'function' && (
        <div className="space-y-2.5 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10">
          <label className="flex items-start gap-3 cursor-pointer select-none max-w-full">
            <input
              type="checkbox"
              checked={mangadexVolumeFolderGrouping !== false}
              onChange={(e) => setMangadexVolumeFolderGrouping(e.target.checked)}
              className="mt-0.5 size-4 rounded border-outline-variant accent-primary shrink-0"
            />
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-on-surface block leading-snug">
                {t('settings.mangadexVolumeGrouping.label')}
              </span>
              <span className="text-[11px] text-on-surface-variant block leading-snug">
                {t('settings.mangadexVolumeGrouping.desc')}
              </span>
            </div>
          </label>

          {mangadexVolumeFolderGrouping !== false && (
            <div className="p-3 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/15 space-y-2 text-xs">
              <p className="text-on-surface-variant leading-relaxed">
                {t('settings.mangadexVolumeGrouping.exampleHint')}
              </p>
              <div className="rounded-lg bg-surface-container-high/50 p-2.5 border border-outline-variant/10">
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
                  {t('settings.mangadexVolumeGrouping.exampleTitle')}
                </span>
                <pre className="font-mono text-[11px] text-on-surface/90 leading-relaxed overflow-x-auto select-all">
{`📁 ${mangaPlaceholder}/
├── 📁 Vol. 1/
│   ├── 🖼️ cover.jpg
│   └── 📁 ${subfolderName1}/
└── 📁 ${subfolderName2}/`}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
