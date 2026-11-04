import { useI18n } from '../../../context/I18nContext';

/** @type {Record<string, { bg: string, fg: string }>} */
const THEME_COLORS = {
  light: { bg: '#ffffff', fg: '#1a1a1a' },
  dark:  { bg: '#1a1a1a', fg: '#e8e8e8' },
  sepia: { bg: '#f4ecd8', fg: '#3b2a1a' },
};

/**
 * Build the full srcdoc string injecting prefs-based styles.
 * @param {string} html
 * @param {import('../utils/ebookPrefs').ReaderPreferences} prefs
 * @returns {string}
 */
function buildSrcdoc(html, prefs) {
  const { bg, fg } = THEME_COLORS[prefs.theme] ?? THEME_COLORS.light;
  const style = `
    html, body {
      margin: 0;
      padding: 0;
      background: ${bg};
      color: ${fg};
    }
    body {
      font-size: ${prefs.fontSize}px;
      font-family: ${prefs.fontFamily};
      line-height: ${prefs.lineHeight};
      padding: 1.5rem ${prefs.marginPercent}%;
      max-width: 800px;
      margin: 0 auto;
      word-wrap: break-word;
    }
    img { max-width: 100%; height: auto; }
    a { color: inherit; }
  `.trim();

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${style}</style></head><body>${html ?? ''}</body></html>`;
}

/**
 * @param {{
 *   html: string | null,
 *   prefs: import('../utils/ebookPrefs').ReaderPreferences,
 *   loading: boolean,
 *   error: string | null,
 *   onRetry: () => void,
 * }} props
 */
export default function EbookContent({ html, prefs, loading, error, onRetry }) {
  const { t } = useI18n();

  return (
    <div className="relative flex-1 w-full overflow-hidden">
      {/* Iframe — always rendered so layout doesn't shift */}
      <iframe
        sandbox="allow-same-origin"
        data-tooltip={t('ebook.contentIframeTitle')}
        className="w-full h-full border-0"
        srcDoc={buildSrcdoc(html ?? '', prefs)}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/80 z-10">
          <span className="material-symbols-outlined animate-spin text-4xl text-primary">
            progress_activity
          </span>
        </div>
      )}

      {/* Error overlay */}
      {!loading && error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface/95 z-10 px-6 text-center">
          <span className="material-symbols-outlined text-4xl text-error">error</span>
          <p className="text-sm text-on-surface-variant max-w-sm">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {t('ebook.retry')}
          </button>
        </div>
      )}
    </div>
  );
}
