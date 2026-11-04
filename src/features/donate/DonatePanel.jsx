import { useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { publicAsset } from '../../utils/publicAsset';
import { AdminContactLinks } from '../../shared';

export default function DonatePanel() {
  const { t } = useI18n();
  const [qrFailed, setQrFailed] = useState(false);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-surface-container-lowest">
      <div className="flex-1 flex flex-col items-stretch px-5 sm:px-8 py-8 pb-14">
        <div className="w-full max-w-lg mx-auto flex flex-col gap-8">
          <AdminContactLinks />

          <div className="rounded-2xl border border-outline-variant/30 bg-surface-bright shadow-sm overflow-hidden">
            <div className="px-5 pt-5 pb-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant/90 text-center">
                {t('donate.scanHint')}
              </p>
            </div>
            <div className="px-5 pb-5 pt-3">
              {!qrFailed ? (
                <div className="rounded-xl bg-surface-container-low overflow-hidden">
                  <img
                    src={publicAsset('data/QR.jpg')}
                    alt=""
                    className="w-full h-auto object-cover block"
                    onError={() => setQrFailed(true)}
                  />
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant text-center py-8 px-2 leading-relaxed">
                  {t('donate.noQrImage')}
                </p>
              )}
            </div>
            <p className="px-5 pb-5 text-sm text-on-surface-variant text-center leading-relaxed">
              {t('donate.thanksFooter')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
