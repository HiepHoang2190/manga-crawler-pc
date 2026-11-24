import { useI18n } from '../../../../context/I18nContext';
import { PackagingModeSelector, MaxMbLimitInput, RotateDoublePageOption } from './ConfigFormFields';

export default function PdfConfigForm({ options, onChange, disabled }) {
  const { t } = useI18n();
  const update = (patch) => onChange({ ...options, ...patch });

  const packMode = options.packMode || 'singleVolume';

  const modes = [
    {
      id: 'singleVolume',
      title: t('ebookStudio.packaging.modeSingleVolume'),
      tooltip: t('ebookStudio.packaging.modeSinglePdfDesc'),
    },
    {
      id: 'sizeSplit',
      title: t('ebookStudio.packaging.modeSizeSplit'),
      tooltip: t('ebookStudio.packaging.modeSizeSplitPdfDesc'),
    },
    {
      id: 'chapterSplit',
      title: t('ebookStudio.packaging.modeChapterSplit'),
      tooltip: t('ebookStudio.packaging.modeChapterSplitPdfDesc'),
    },
  ];

  const activeMode = modes.find((m) => m.id === packMode) || modes[0];

  return (
    <div className="space-y-3">
      <PackagingModeSelector
        modes={modes}
        value={packMode}
        onChange={(id) => update({ packMode: id })}
        disabled={disabled}
        description={activeMode?.tooltip}
      />

      {packMode === 'sizeSplit' && (
        <MaxMbLimitInput
          id="pdf-max-mb"
          label={t('ebookStudio.packaging.maxSizeLimit')}
          value={options.maxMbPerFile || 200}
          onChange={(maxMbPerFile) => update({ maxMbPerFile })}
          disabled={disabled}
        />
      )}

      <RotateDoublePageOption
        checked={Boolean(options.rotateDoublePage)}
        onChange={(rotateDoublePage) => update({ rotateDoublePage })}
        disabled={disabled}
      />

      <div className="space-y-0.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-on-surface hover:text-primary transition-colors select-none">
          <input
            type="checkbox"
            checked={Boolean(options.pdfSeamless)}
            onChange={(e) => update({ pdfSeamless: e.target.checked })}
            disabled={disabled}
            className="rounded accent-primary"
          />
          <span className="font-medium">{t('ebookStudio.packaging.pdfSeamless')}</span>
        </label>
        <p className="text-[11px] text-on-surface-variant/65 pl-5 leading-normal">
          {t('ebookStudio.packaging.pdfSeamlessDesc')}
        </p>
      </div>
    </div>
  );
}
