import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useI18n } from '../../context/I18nContext';
import { countLogsByLevel, filterConsoleLogs, formatLogsForClipboard } from './consoleLogUtils.mjs';

const levelColors = {
  info: 'text-primary',
  success: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-error',
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
  const [levelFilter, setLevelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const scrollContainerRef = useRef(null);
  const logEndRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const copyTimerRef = useRef(null);

  const counts = useMemo(() => countLogsByLevel(logs), [logs]);
  const visibleLogs = useMemo(
    () => filterConsoleLogs(logs, { level: levelFilter, query: searchQuery }),
    [logs, levelFilter, searchQuery]
  );

  const lastVisibleLog = visibleLogs[visibleLogs.length - 1];

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visibleLogs.length, lastVisibleLog?.t, lastVisibleLog?.msg]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleLogScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceToBottom <= 36;
  };

  const handleCopyLogs = async () => {
    const text = formatLogsForClipboard(visibleLogs);
    if (!text) return;
    try {
      await navigator.clipboard?.writeText?.(text);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore clipboard error */
    }
  };

  const filterChips = [
    { id: 'all', label: t('console.filter.all'), count: counts.all, activeCls: 'bg-primary/15 text-primary border-primary/30' },
    { id: 'error', label: t('console.filter.error'), count: counts.error, activeCls: 'bg-error/15 text-error border-error/30' },
    { id: 'warn', label: t('console.filter.warn'), count: counts.warn, activeCls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    { id: 'success', label: t('console.filter.success'), count: counts.success, activeCls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  ];

  return (
    <section
      className="grid min-h-0 shrink-0 grid-cols-4 grid-rows-1 gap-4 bg-surface-container-low px-6 py-3 [grid-template-rows:minmax(0,1fr)]"
      style={{ height: heightPx }}
    >
      <div className="col-span-3 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined !text-xs text-on-surface-variant shrink-0">terminal</span>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter truncate">
                {t('console.title')}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {filterChips.map((chip) => {
                const isActive = levelFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setLevelFilter(chip.id)}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold transition-colors cursor-pointer ${
                      isActive
                        ? chip.activeCls
                        : 'border-outline-variant/20 bg-surface-container-high/50 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <span>{chip.label}</span>
                    <span className="font-mono opacity-80">{chip.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative flex items-center">
              <span className="material-symbols-outlined !text-[13px] text-on-surface-variant/60 absolute left-2 pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('console.searchPlaceholder')}
                className="h-6 w-32 sm:w-40 rounded-md border border-outline-variant/20 bg-surface-container-high/70 pl-6 pr-5 text-[10px] text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary/60"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  data-tooltip={t('console.searchClear')}
                  aria-label={t('console.searchClear')}
                  className="absolute right-1 flex h-4 w-4 items-center justify-center rounded border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[11px] leading-none">close</span>
                </button>
              ) : null}
            </div>

            <button
              type="button"
              disabled={visibleLogs.length === 0}
              onClick={() => void handleCopyLogs()}
              data-tooltip={copied ? t('console.copied') : t('console.copyLog')}
              aria-label={copied ? t('console.copied') : t('console.copyLog')}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-outline-variant/20 bg-surface-container-highest/60 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[13px] leading-none">
                {copied ? 'check' : 'content_copy'}
              </span>
            </button>

            {typeof onClearLogs === 'function' ? (
              <button
                type="button"
                onClick={onClearLogs}
                data-tooltip={t('console.clearLog')}
                aria-label={t('console.clearLog')}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-outline-variant/20 bg-surface-container-highest/60 text-on-surface-variant hover:border-error/30 hover:bg-error/10 hover:text-error transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[13px] leading-none">delete</span>
              </button>
            ) : null}
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          onScroll={handleLogScroll}
          className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 font-mono text-[11px] text-on-surface-variant space-y-0.5"
        >
          {logs.length === 0 ? (
            <p className="text-on-surface-variant/60">{t('console.placeholder')}</p>
          ) : visibleLogs.length === 0 ? (
            <p className="text-on-surface-variant/60">{t('console.noMatch')}</p>
          ) : (
            visibleLogs.map((log, i) => (
              <p key={`${log.t}-${i}`} className="break-words">
                <span className={levelColors[log.level] || levelColors.info}>[{log.time}]</span> {log.msg}
              </p>
            ))
          )}
          <div ref={logEndRef} aria-hidden="true" className="h-px w-full shrink-0" />
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col gap-3 rounded-lg border border-outline-variant/10 bg-surface p-3 h-full overflow-y-auto custom-scrollbar">
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
