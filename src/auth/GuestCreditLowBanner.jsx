import { useI18n } from '../context/I18nContext';

export default function GuestCreditLowBanner({ remaining, onSignIn }) {
  const { t } = useI18n();
  if (remaining > 10) return null;

  const urgent = remaining <= 5;

  return (
    <div
      role="status"
      className={`shrink-0 px-4 py-2 text-sm flex flex-wrap items-center justify-between gap-2 z-30 border-b ${
        urgent
          ? 'bg-orange-500/15 border-orange-500/35 text-on-surface'
          : 'bg-amber-500/10 border-amber-500/25 text-on-surface'
      }`}
    >
      <span>
        {urgent
          ? t('guestCredit.bannerUrgent', { n: remaining })
          : t('guestCredit.bannerLow', { n: remaining })}
      </span>
      {typeof onSignIn === 'function' ? (
        <button
          type="button"
          onClick={onSignIn}
          className="shrink-0 text-sm font-semibold text-primary hover:opacity-80 transition-opacity cursor-pointer"
        >
          {t('guestCredit.bannerCta')}
        </button>
      ) : null}
    </div>
  );
}
