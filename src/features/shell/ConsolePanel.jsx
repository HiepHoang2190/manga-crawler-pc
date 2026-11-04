import { useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useI18n } from '../../context/I18nContext';

const levelColors = {
  info: 'text-primary',
  success: 'text-green-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

function Toggle({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={`w-8 h-4 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${
        checked ? 'bg-primary-container justify-end' : 'bg-surface-variant justify-start'
      }`}
    >
      <span className="w-3 h-3 bg-white rounded-full shadow-sm shrink-0" />
    </button>
  );
}

/** Hai vị trí EN | VI — cùng hàng, chiều cao gọn như Toggle dark mode. */
function LocaleToggle({ locale, onLocaleChange, ariaLabel }) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex h-4 shrink-0 rounded-full bg-surface-variant p-0.5 w-[4.25rem]">
      <button
        type="button"
        aria-pressed={locale === 'en'}
        onClick={() => onLocaleChange('en')}
        className={`flex-1 min-w-0 rounded-full text-[9px] font-bold leading-none transition-colors cursor-pointer ${
          locale === 'en'
            ? 'bg-primary-container text-on-primary-container'
            : 'text-on-surface-variant hover:text-on-surface'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        aria-pressed={locale === 'vi'}
        onClick={() => onLocaleChange('vi')}
        className={`flex-1 min-w-0 rounded-full text-[9px] font-bold leading-none transition-colors cursor-pointer ${
          locale === 'vi'
            ? 'bg-primary-container text-on-primary-container'
            : 'text-on-surface-variant hover:text-on-surface'
        }`}
      >
        VI
      </button>
    </div>
  );
}

export default function ConsolePanel({ logs = [], onClearLogs, heightPx = 128 }) {
  const { darkMode, toggleDarkMode } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs]);

  return (
    <section
      className="grid min-h-0 shrink-0 grid-cols-4 grid-rows-1 gap-4 bg-surface-container-low px-6 py-3 [grid-template-rows:minmax(0,1fr)]"
      style={{ height: heightPx }}
    >
      <div className="col-span-3 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-2">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined !text-xs text-on-surface-variant shrink-0">terminal</span>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter truncate">
              {t('console.title')}
            </span>
          </div>
          {typeof onClearLogs === 'function' ? (
            <button
              type="button"
              onClick={onClearLogs}
              data-tooltip={t('console.clearLog')}
              aria-label={t('console.clearLog')}
              className="shrink-0 p-0.5 rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined !text-sm">delete</span>
            </button>
          ) : null}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto font-mono text-[11px] text-on-surface-variant space-y-0.5">
          {logs.length === 0 ? (
            <p className="text-on-surface-variant/60">{t('console.placeholder')}</p>
          ) : (
            logs.map((log, i) => (
              <p key={`${log.t}-${i}`}>
                <span className={levelColors[log.level] || levelColors.info}>[{log.time}]</span> {log.msg}
              </p>
            ))
          )}
          <div ref={logEndRef} aria-hidden="true" className="h-px w-full shrink-0" />
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col gap-3 rounded-lg border border-outline-variant/10 bg-surface p-3 h-full overflow-y-auto">
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] shrink-0">{t('console.darkMode')}</span>
            <Toggle checked={darkMode} ariaLabel={t('console.darkMode')} onChange={toggleDarkMode} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] shrink-0">{t('settings.language')}</span>
            <LocaleToggle
              locale={locale}
              onLocaleChange={setLocale}
              ariaLabel={t('settings.language')}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
