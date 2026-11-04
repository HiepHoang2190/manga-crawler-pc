// src/features/tools-studio/image-pipeline/ActionParamsForm.jsx
import { useI18n } from '../../../context/I18nContext';
import { SearchableSelect } from '../../../shared';
import { DEFAULT_CROP_DPI, mmToPx, pxToMm } from '../../export/crop/cropGeometry';
import { ModeButtons, NumberField, SectionLabel } from './formControls';

const EDGES = ['top', 'bottom', 'left', 'right'];
const CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

const BOX_FIELDS = [
  ['left', 'imagePipeline.crop.boxLeft'],
  ['top', 'imagePipeline.crop.boxTop'],
  ['width', 'imagePipeline.crop.boxWidth'],
  ['height', 'imagePipeline.crop.boxHeight'],
];

function scaleLengths(values, factor) {
  const next = {};
  for (const [key, value] of Object.entries(values || {})) {
    next[key] = Math.max(0, Math.round(Number(value) * factor));
  }
  return next;
}

function CropForm({ params, onChange, disabled }) {
  const { t } = useI18n();
  const unit = params.marginUnit === 'mm' ? 'mm' : 'px';
  const dpi = params.dpi || DEFAULT_CROP_DPI;
  const shown = (px) => (unit === 'mm' ? pxToMm(px, dpi) : px);
  const stored = (value) => (unit === 'mm' ? mmToPx(value, dpi) : value);
  const setDpi = (nextDpi) => {
    if (unit !== 'mm' || nextDpi === dpi) {
      onChange({ dpi: nextDpi });
      return;
    }
    const factor = nextDpi / dpi;
    onChange({
      dpi: nextDpi,
      margins: scaleLengths(params.margins, factor),
      box: scaleLengths(params.box, factor),
    });
  };
  return (
    <div className="space-y-3">
      <ModeButtons
        value={params.cropMode}
        disabled={disabled}
        cols={3}
        onChange={(cropMode) => onChange({ cropMode })}
        options={[
          { value: 'autoTrim', label: t('imagePipeline.crop.autoTrim'), tooltip: t('imagePipeline.crop.modeHint.autoTrim') },
          { value: 'margin', label: t('imagePipeline.crop.margin'), tooltip: t('imagePipeline.crop.modeHint.margin') },
          { value: 'box', label: t('imagePipeline.crop.box'), tooltip: t('imagePipeline.crop.modeHint.box') },
        ]}
      />
      <p className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant">
        {params.cropMode === 'margin'
          ? t('imagePipeline.crop.modeHint.margin')
          : params.cropMode === 'box'
            ? t('imagePipeline.crop.modeHint.box')
            : t('imagePipeline.crop.modeHint.autoTrim')}
      </p>
      <SectionLabel>{t('imagePipeline.crop.pageScope')}</SectionLabel>
      <ModeButtons
        value={params.pageScope || 'all'}
        disabled={disabled}
        cols={3}
        onChange={(pageScope) => onChange({ pageScope })}
        options={[
          { value: 'all', label: t('imagePipeline.crop.pageScopeAll'), tooltip: t('imagePipeline.crop.pageScopeAllHint') },
          { value: 'odd', label: t('imagePipeline.crop.pageScopeOdd'), tooltip: t('imagePipeline.crop.pageScopeOddHint') },
          { value: 'even', label: t('imagePipeline.crop.pageScopeEven'), tooltip: t('imagePipeline.crop.pageScopeEvenHint') },
        ]}
      />
      {params.cropMode === 'autoTrim' ? (
        <>
          <SectionLabel>{t('imagePipeline.crop.sampleColor')}</SectionLabel>
          <ModeButtons
            value={params.sampleMode}
            disabled={disabled}
            onChange={(sampleMode) => onChange({ sampleMode })}
            options={[
              { value: 'corner', label: t('imagePipeline.crop.sampleCorner') },
              { value: 'specific', label: t('imagePipeline.crop.sampleSpecific') },
            ]}
          />
          {params.sampleMode === 'corner' ? (
            <SearchableSelect
              value={params.sampleCorner}
              onChange={(sampleCorner) => onChange({ sampleCorner })}
              disabled={disabled}
              showPlaceholderOption={false}
              className="w-full min-w-0"
              options={CORNERS.map((c) => ({ value: c, label: t(`imagePipeline.crop.corner.${c}`), icon: 'colorize' }))}
            />
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <ModeButtons
                  cols={3}
                  value={params.specificColorType}
                  disabled={disabled}
                  onChange={(specificColorType) => onChange({ specificColorType })}
                  options={[
                    { value: 'black', label: t('imagePipeline.crop.color.black') },
                    { value: 'white', label: t('imagePipeline.crop.color.white') },
                    { value: 'custom', label: t('imagePipeline.crop.color.custom') },
                  ]}
                />
              </div>
              {params.specificColorType === 'custom' && (
                <input
                  type="color"
                  value={params.customColorHex}
                  disabled={disabled}
                  onChange={(e) => onChange({ customColorHex: e.target.value })}
                  aria-label={t('imagePipeline.crop.color.custom')}
                  data-tooltip={t('imagePipeline.crop.color.custom')}
                  className="h-8 w-10 cursor-pointer rounded-lg border border-outline-variant/25 bg-transparent"
                />
              )}
            </div>
          )}
          <label className="block space-y-1 text-xs text-on-surface-variant">
            <span>{t('imagePipeline.crop.tolerance', { value: params.tolerance })}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={params.tolerance}
              disabled={disabled}
              onChange={(e) => onChange({ tolerance: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </label>
          <SectionLabel>{t('imagePipeline.crop.edges')}</SectionLabel>
          <div className="grid grid-cols-4 gap-1.5">
            {EDGES.map((edge) => (
              <label key={edge} className="flex items-center gap-1.5 text-xs text-on-surface-variant cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded accent-primary"
                  checked={params.edges[edge]}
                  disabled={disabled}
                  onChange={(e) => onChange({ edges: { ...params.edges, [edge]: e.target.checked } })}
                />
                {t(`imagePipeline.crop.edge.${edge}`)}
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <SectionLabel>{t('imagePipeline.crop.unit')}</SectionLabel>
          <ModeButtons
            value={unit}
            disabled={disabled}
            onChange={(marginUnit) => onChange({ marginUnit })}
            options={[
              { value: 'px', label: t('imagePipeline.crop.unitPx') },
              { value: 'mm', label: t('imagePipeline.crop.unitMm') },
            ]}
          />
          {unit === 'mm' && (
            <NumberField label={t('imagePipeline.crop.dpi')} value={dpi} min={36} max={2400} disabled={disabled} onChange={setDpi} />
          )}
          <SectionLabel>{params.cropMode === 'box' ? t('imagePipeline.crop.box') : (unit === 'mm' ? t('imagePipeline.crop.marginsMm') : t('imagePipeline.crop.marginsPx'))}</SectionLabel>
          {params.cropMode === 'box'
            ? BOX_FIELDS.map(([key, labelKey]) => (
              <NumberField
                key={key}
                label={t(labelKey)}
                value={shown((params.box || {})[key] || 0)}
                min={unit === 'mm' ? 0 : (key === 'width' || key === 'height' ? 1 : 0)}
                max={unit === 'mm' ? 2000 : 100000}
                step={unit === 'mm' ? 0.1 : 1}
                disabled={disabled}
                onChange={(v) => onChange({ box: { ...(params.box || {}), [key]: stored(v) } })}
              />
            ))
            : EDGES.map((edge) => (
              <NumberField
                key={edge}
                label={t(`imagePipeline.crop.edge.${edge}`)}
                value={shown(params.margins[edge])}
                min={0}
                max={unit === 'mm' ? 2000 : 100000}
                step={unit === 'mm' ? 0.1 : 1}
                disabled={disabled}
                onChange={(v) => onChange({ margins: { ...params.margins, [edge]: stored(v) } })}
              />
            ))}
        </>
      )}
    </div>
  );
}

function DeskewForm({ params, onChange, disabled }) {
  const { t } = useI18n();
  const cropMode = params.cropMode || 'autoCrop';
  const minAngle = params.minAngle ?? 0.1;

  return (
    <div className="space-y-3">
      <SectionLabel>{t('imagePipeline.deskew.fillMode')}</SectionLabel>
      <ModeButtons
        value={cropMode}
        disabled={disabled}
        onChange={(cropMode) => onChange({ cropMode })}
        options={[
          { value: 'autoCrop', label: t('imagePipeline.deskew.autoCrop'), tooltip: t('imagePipeline.deskew.autoCropTooltip') },
          { value: 'fillWhite', label: t('imagePipeline.deskew.fillWhite'), tooltip: t('imagePipeline.deskew.fillWhiteTooltip') },
          { value: 'fillBlack', label: t('imagePipeline.deskew.fillBlack'), tooltip: t('imagePipeline.deskew.fillBlackTooltip') },
          { value: 'none', label: t('imagePipeline.deskew.none'), tooltip: t('imagePipeline.deskew.noneTooltip') },
        ]}
      />

      <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant space-y-1">
        <div className="flex items-center gap-1.5 font-medium text-on-surface">
          <span className="material-symbols-outlined text-[15px] text-primary">
            {cropMode === 'fillWhite' ? 'format_color_fill' : cropMode === 'fillBlack' ? 'contrast' : cropMode === 'none' ? 'fullscreen' : 'crop'}
          </span>
          <span>{t(`imagePipeline.deskew.${cropMode}Title`)}</span>
        </div>
        <p className="text-[10.5px] text-on-surface-variant/90 leading-relaxed pl-5">
          {t(`imagePipeline.deskew.${cropMode}Desc`)}
        </p>
      </div>

      <SectionLabel>{t('imagePipeline.deskew.angleSettings')}</SectionLabel>
      <NumberField
        label={t('imagePipeline.deskew.minAngle')}
        tooltip={t('imagePipeline.deskew.minAngleTooltip')}
        value={params.minAngle}
        min={0}
        max={5}
        step={0.1}
        disabled={disabled}
        onChange={(minAngle) => onChange({ minAngle })}
      />

      <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant space-y-2">
        <div className="flex items-center gap-1.5 font-medium text-on-surface">
          <span className="material-symbols-outlined text-[15px] text-primary">straighten</span>
          <span>{t('imagePipeline.deskew.thresholdTitle')}</span>
        </div>
        <div className="rounded bg-surface-container-lowest/70 border border-outline-variant/15 px-2 py-1 font-mono text-[10.5px] text-primary font-semibold">
          {t('imagePipeline.deskew.thresholdFormula', { minAngle })}
        </div>
        <div className="space-y-1.5 pt-0.5 text-[10.5px]">
          <div className="flex items-start gap-1.5">
            <span className="text-emerald-500 font-bold shrink-0 mt-0.5">✓</span>
            <span className="text-on-surface">{t('imagePipeline.deskew.exampleSkewed', { minAngle })}</span>
          </div>
          <div className="flex items-start gap-1.5 text-on-surface-variant/80">
            <span className="text-on-surface-variant/50 font-bold shrink-0 mt-0.5">✕</span>
            <span>{t('imagePipeline.deskew.exampleStraight', { minAngle })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SplitForm({ params, onChange, disabled }) {
  const { t } = useI18n();
  const direction = params.readingDirection || 'ltr';
  const minWidth = params.minWidth ?? 1200;
  const ratioThreshold = params.ratioThreshold ?? 1.15;

  return (
    <div className="space-y-3">
      <SectionLabel>{t('imagePipeline.split.readingDirection')}</SectionLabel>
      <ModeButtons
        value={direction}
        disabled={disabled}
        onChange={(readingDirection) => onChange({ readingDirection })}
        options={[
          { value: 'ltr', label: t('imagePipeline.split.ltr'), tooltip: t('imagePipeline.split.hintLtr') },
          { value: 'rtl', label: t('imagePipeline.split.rtl'), tooltip: t('imagePipeline.split.hintRtl') },
        ]}
      />
      <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant space-y-1.5">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">
            {direction === 'rtl' ? 'format_textdirection_r_to_l' : 'format_textdirection_l_to_r'}
          </span>
          <p className="flex-1 min-w-0">
            {direction === 'rtl'
              ? t('imagePipeline.split.hintRtl')
              : t('imagePipeline.split.hintLtr')}
          </p>
        </div>
        <div className="border-t border-outline-variant/15 pt-1.5 pl-6 text-[10.5px] text-on-surface-variant/80 font-mono">
          <span className="font-semibold text-primary">005.jpg</span> → <span className="font-semibold text-on-surface">005-a.jpg</span> ({t('imagePipeline.split.page1')}) + <span className="font-semibold text-on-surface">005-b.jpg</span> ({t('imagePipeline.split.page2')})
        </div>
      </div>

      <SectionLabel>{t('imagePipeline.split.detectionSettings')}</SectionLabel>
      <NumberField
        label={t('imagePipeline.split.minWidth')}
        tooltip={t('imagePipeline.split.minWidthTooltip')}
        value={params.minWidth}
        min={100}
        max={20000}
        disabled={disabled}
        onChange={(minWidth) => onChange({ minWidth })}
      />
      <NumberField
        label={t('imagePipeline.split.ratioThreshold')}
        tooltip={t('imagePipeline.split.ratioThresholdTooltip')}
        value={params.ratioThreshold}
        min={1}
        max={4}
        step={0.01}
        disabled={disabled}
        onChange={(ratioThreshold) => onChange({ ratioThreshold })}
      />

      <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant space-y-2">
        <div className="flex items-center gap-1.5 font-medium text-on-surface">
          <span className="material-symbols-outlined text-[15px] text-primary">filter_alt</span>
          <span>{t('imagePipeline.split.conditionTitle')}</span>
        </div>
        <div className="rounded bg-surface-container-lowest/70 border border-outline-variant/15 px-2 py-1 font-mono text-[10.5px] text-primary font-semibold">
          {t('imagePipeline.split.conditionFormula', { minWidth, ratio: ratioThreshold })}
        </div>
        <div className="space-y-1.5 pt-0.5 text-[10.5px]">
          <div className="flex items-start gap-1.5">
            <span className="text-emerald-500 font-bold shrink-0 mt-0.5">✓</span>
            <span className="text-on-surface">{t('imagePipeline.split.exampleSpread')}</span>
          </div>
          <div className="flex items-start gap-1.5 text-on-surface-variant/80">
            <span className="text-on-surface-variant/50 font-bold shrink-0 mt-0.5">✕</span>
            <span>{t('imagePipeline.split.exampleSingle')}</span>
          </div>
          <div className="flex items-start gap-1.5 text-on-surface-variant/80">
            <span className="text-on-surface-variant/50 font-bold shrink-0 mt-0.5">✕</span>
            <span>{t('imagePipeline.split.exampleThumb', { minWidth })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DesaturateForm({ params, onChange, disabled }) {
  const { t } = useI18n();
  const method = params.method || 'luminosity';
  const intensity = params.intensity ?? 100;

  return (
    <div className="space-y-3">
      <SectionLabel>{t('imagePipeline.desaturate.method')}</SectionLabel>
      <ModeButtons
        value={method}
        disabled={disabled}
        onChange={(method) => onChange({ method })}
        options={[
          { value: 'luminosity', label: t('imagePipeline.desaturate.luminosity'), tooltip: t('imagePipeline.desaturate.luminosityTooltip') },
          { value: 'lightness', label: t('imagePipeline.desaturate.lightness'), tooltip: t('imagePipeline.desaturate.lightnessTooltip') },
          { value: 'average', label: t('imagePipeline.desaturate.average'), tooltip: t('imagePipeline.desaturate.averageTooltip') },
        ]}
      />

      <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant space-y-1.5">
        <div className="flex items-center gap-1.5 font-medium text-on-surface">
          <span className="material-symbols-outlined text-[15px] text-primary">
            {method === 'luminosity' ? 'visibility' : method === 'lightness' ? 'brightness_medium' : 'calculate'}
          </span>
          <span>{t(`imagePipeline.desaturate.${method}Title`)}</span>
        </div>
        <div className="rounded bg-surface-container-lowest/70 border border-outline-variant/15 px-2 py-0.5 font-mono text-[10px] text-primary font-semibold">
          {t(`imagePipeline.desaturate.${method}Formula`)}
        </div>
        <p className="text-[10.5px] text-on-surface-variant/90 leading-relaxed">
          {t(`imagePipeline.desaturate.${method}Desc`)}
        </p>
      </div>

      <SectionLabel>{t('imagePipeline.desaturate.intensitySection')}</SectionLabel>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-on-surface-variant">
          <span className="flex items-center gap-1">
            <span>{t('imagePipeline.desaturate.intensity')}</span>
            <span
              className="material-symbols-outlined text-[14px] text-on-surface-variant/50 hover:text-primary transition-colors cursor-help"
              data-tooltip={t('imagePipeline.desaturate.intensityTooltip')}
            >
              help
            </span>
          </span>
          <span className="font-mono font-semibold text-primary">{intensity}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={intensity}
          disabled={disabled}
          onChange={(e) => onChange({ intensity: Number(e.target.value) })}
          className="w-full accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant space-y-1.5">
        <div className="flex items-center gap-1.5 font-medium text-on-surface">
          <span className="material-symbols-outlined text-[15px] text-primary">info</span>
          <span>{t('imagePipeline.desaturate.effectTitle')}</span>
        </div>
        <div className="space-y-1 pt-0.5 text-[10.5px]">
          <div className="flex items-start gap-1.5">
            <span className="text-emerald-500 font-bold shrink-0 mt-0.5">✓</span>
            <span className="text-on-surface">{t('imagePipeline.desaturate.exampleFull')}</span>
          </div>
          <div className="flex items-start gap-1.5 text-on-surface-variant/80">
            <span className="text-on-surface-variant/50 font-bold shrink-0 mt-0.5">◐</span>
            <span>{t('imagePipeline.desaturate.examplePartial')}</span>
          </div>
          <div className="flex items-start gap-1.5 text-on-surface-variant/80">
            <span className="text-on-surface-variant/50 font-bold shrink-0 mt-0.5">✕</span>
            <span>{t('imagePipeline.desaturate.exampleNone')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ActionParamsForm({ action, onChange, disabled = false }) {
  if (action.type === 'crop') return <CropForm params={action.params} onChange={onChange} disabled={disabled} />;
  if (action.type === 'deskew') return <DeskewForm params={action.params} onChange={onChange} disabled={disabled} />;
  if (action.type === 'splitPage') return <SplitForm params={action.params} onChange={onChange} disabled={disabled} />;
  if (action.type === 'desaturate') return <DesaturateForm params={action.params} onChange={onChange} disabled={disabled} />;
  return null;
}
