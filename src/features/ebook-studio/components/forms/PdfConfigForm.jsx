import { useI18n } from '../../../../context/I18nContext';

export default function PdfConfigForm({ options, onChange, disabled }) {
  const { t } = useI18n();
  const update = (patch) => onChange({ ...options, ...patch });

  const packMode = options.packMode || 'singleVolume';

  const modes = [
    {
      id: 'singleVolume',
      title: '1 tệp duy nhất',
      desc: 'Tất cả chương',
      tooltip: 'Gộp toàn bộ chương vào 1 tệp PDF duy nhất.',
    },
    {
      id: 'sizeSplit',
      title: 'Theo dung lượng',
      desc: 'Giới hạn MB',
      tooltip: 'Chia nhỏ tệp theo giới hạn dung lượng MB/file.',
    },
    {
      id: 'chapterSplit',
      title: 'Mỗi chương',
      desc: '1 file / chap',
      tooltip: 'Tách lẻ từng chương thành 1 tệp PDF riêng biệt.',
    },
  ];

  const activeMode = modes.find((m) => m.id === packMode) || modes[0];

  return (
    <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/60 p-3">
      {/* 1. Chế độ xuất PDF */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-3 gap-1.5">
          {modes.map((mode) => {
            const isSelected = packMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                disabled={disabled}
                onClick={() => update({ packMode: mode.id })}
                aria-label={mode.title}
                className={`flex flex-col items-center justify-center rounded-lg border py-2 px-1 text-center transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs ring-1 ring-primary/20'
                    : 'border-outline-variant/25 bg-surface-container-low/40 font-medium text-on-surface-variant hover:border-outline-variant/40 hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <span className="text-xs font-semibold leading-tight">{mode.title}</span>
                <span
                  className={`text-[10px] leading-tight mt-0.5 ${
                    isSelected ? 'text-primary/75 font-medium' : 'text-on-surface-variant/60'
                  }`}
                >
                  {mode.desc}
                </span>
              </button>
            );
          })}
        </div>
        {activeMode?.tooltip && (
          <p className="text-[11px] text-on-surface-variant/75 leading-relaxed pt-0.5">
            {activeMode.tooltip}
          </p>
        )}
      </div>

      {/* 2. Cấu hình dung lượng khi chọn sizeSplit */}
      {packMode === 'sizeSplit' && (
        <div className="flex items-center justify-between rounded-lg bg-surface-container-high/40 px-3 py-2 border border-outline-variant/15">
          <span className="text-xs text-on-surface-variant">Giới hạn dung lượng:</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="10"
              max="2048"
              value={options.maxMbPerFile || 200}
              onChange={(e) => update({ maxMbPerFile: Number(e.target.value) })}
              disabled={disabled}
              className="w-20 rounded-md border border-outline-variant/30 bg-surface px-2 py-1 text-xs text-right font-mono text-on-surface focus:border-primary focus:outline-none"
            />
            <span className="text-xs font-medium text-on-surface-variant">MB / file</span>
          </div>
        </div>
      )}

      {/* 3. Tùy chọn xoay trang & Webtoon */}
      <div className="space-y-2 pt-2 border-t border-outline-variant/15">
        <div className="space-y-0.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-on-surface hover:text-primary transition-colors select-none">
            <input
              type="checkbox"
              checked={Boolean(options.rotateDoublePage)}
              onChange={(e) => update({ rotateDoublePage: e.target.checked })}
              disabled={disabled}
              className="rounded accent-primary"
            />
            <span className="font-medium">
              {t('ebookStudio.packaging.rotateDoublePage', 'Tự động xoay trang đôi theo chiều ngang')}
            </span>
          </label>
          <p className="text-[11px] text-on-surface-variant/60 pl-5 leading-normal">
            {t(
              'ebookStudio.packaging.rotateDoublePageDesc',
              'Tự động nhận diện trang đôi (tỷ lệ rộng/cao ≥ 1.2) và xoay ngang 90° tối ưu khi đọc truyện.'
            )}
          </p>
        </div>

        <div className="space-y-0.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-on-surface hover:text-primary transition-colors select-none">
            <input
              type="checkbox"
              checked={Boolean(options.pdfSeamless)}
              onChange={(e) => update({ pdfSeamless: e.target.checked })}
              disabled={disabled}
              className="rounded accent-primary"
            />
            <span className="font-medium">PDF Liền mạch (Seamless Webtoon)</span>
          </label>
          <p className="text-[11px] text-on-surface-variant/60 pl-5 leading-normal">
            Ghép các trang thành một dải cuộn liền mạch không khe hở, tối ưu cho truyện Webtoon / Manhwa.
          </p>
        </div>
      </div>
    </div>
  );
}
