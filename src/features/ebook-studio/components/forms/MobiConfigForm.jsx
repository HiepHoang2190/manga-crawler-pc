import { useI18n } from '../../../../context/I18nContext';
import { PackagingModeSelector, MaxMbLimitInput, RotateDoublePageOption } from './ConfigFormFields';

export default function MobiConfigForm({ options, onChange, disabled }) {
  const { t } = useI18n();
  const update = (patch) => onChange({ ...options, ...patch });

  const packMode = options.packMode || 'singleVolume';

  const modes = [
    {
      id: 'singleVolume',
      title: t('ebookStudio.packaging.modeSingleVolume'),
      tooltip: t('ebookStudio.packaging.modeSingleMobiDesc'),
    },
    {
      id: 'sizeSplit',
      title: t('ebookStudio.packaging.modeSizeSplit'),
      tooltip: t('ebookStudio.packaging.modeSizeSplitMobiDesc'),
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
          id="mobi-max-mb"
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
    </div>
  );
}
