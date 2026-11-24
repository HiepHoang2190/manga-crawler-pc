import { useMemo } from 'react';
import { useI18n } from '../../../../context/I18nContext';
import { SearchableSelect } from '../../../../shared';
import { PackagingModeSelector, MaxMbLimitInput, RotateDoublePageOption } from './ConfigFormFields';

export default function EpubConfigForm({ options, onChange, disabled }) {
  const { t } = useI18n();
  const update = (patch) => onChange({ ...options, ...patch });

  const packMode = options.packMode || 'singleVolume';

  const modes = [
    {
      id: 'singleVolume',
      title: t('ebookStudio.packaging.modeSingleVolume'),
      tooltip: t('ebookStudio.packaging.modeSingleEpubDesc'),
    },
    {
      id: 'sizeSplit',
      title: t('ebookStudio.packaging.modeSizeSplit'),
      tooltip: t('ebookStudio.packaging.modeSizeSplitEpubDesc'),
    },
  ];

  const activeMode = modes.find((m) => m.id === packMode) || modes[0];

  const qualityOptions = useMemo(
    () => [
      { value: 95, label: t('ebookStudio.packaging.epubQualityHigh') },
      { value: 85, label: t('ebookStudio.packaging.epubQualityStandard') },
      { value: 100, label: t('ebookStudio.packaging.epubQualityOriginal') },
    ],
    [t]
  );

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
          id="epub-max-mb"
          label={t('ebookStudio.packaging.maxSizeLimit')}
          value={options.maxMbPerFile || 200}
          onChange={(maxMbPerFile) => update({ maxMbPerFile })}
          disabled={disabled}
        />
      )}

      <div className="space-y-2.5 pt-2.5 border-t border-outline-variant/15">
        <div className="space-y-1">
          <label htmlFor="epub-author-input" className="block text-xs font-medium text-on-surface-variant">
            {t('ebookStudio.packaging.epubAuthor')}
          </label>
          <input
            id="epub-author-input"
            type="text"
            value={options.author || ''}
            placeholder="Manga Crawler"
            onChange={(e) => update({ author: e.target.value })}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3.5 text-xs sm:text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 placeholder:text-on-surface-variant/45"
          />
        </div>
        <div className="space-y-1">
          <span className="block text-xs font-medium text-on-surface-variant">
            {t('ebookStudio.packaging.epubQuality')}
          </span>
          <SearchableSelect
            value={options.imageQuality || 95}
            onChange={(val) => update({ imageQuality: Number(val) })}
            options={qualityOptions}
            showPlaceholderOption={false}
            ariaLabel={t('ebookStudio.packaging.epubQuality')}
            disabled={disabled}
            className="w-full"
          />
        </div>
      </div>

      <RotateDoublePageOption
        checked={Boolean(options.rotateDoublePage)}
        onChange={(rotateDoublePage) => update({ rotateDoublePage })}
        disabled={disabled}
      />
    </div>
  );
}
