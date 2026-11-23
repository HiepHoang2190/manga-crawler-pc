import React, { Component } from 'react';

/**
 * Per-tab error boundary isolating studio crashes so active downloads and other tabs continue uninterrupted.
 */
export default class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.tabId !== this.props.tabId) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[TabErrorBoundary:${this.props.tabId || 'unknown'}]`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { t, tabLabel, tabId } = this.props;
      const translate = typeof t === 'function' ? t : (k) => k;
      const label = tabLabel || tabId || 'Tab';
      const errorText = this.state.error?.message || String(this.state.error || '');

      return (
        <div className="flex flex-1 min-h-0 items-center justify-center bg-surface text-on-surface p-6">
          <div className="w-full max-w-md rounded-2xl border border-error/30 bg-surface-container-high p-6 shadow-xl space-y-4 text-center">
            <div className="flex justify-center">
              <span className="material-symbols-outlined text-4xl text-error">error</span>
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-on-surface">
                {translate('errorBoundary.tabTitle', { tab: label })}
              </h2>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {translate('errorBoundary.tabDescription')}
              </p>
            </div>
            {errorText ? (
              <details className="text-left rounded-xl border border-outline-variant/20 bg-surface-container-highest/70 p-3">
                <summary className="text-xs font-semibold text-on-surface-variant cursor-pointer select-none">
                  {translate('errorBoundary.details')}
                </summary>
                <pre className="mt-2 text-[11px] font-mono text-error whitespace-pre-wrap break-words max-h-32 overflow-y-auto custom-scrollbar">
                  {errorText}
                </pre>
              </details>
            ) : null}
            <div className="pt-1">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-primary/30 bg-primary text-xs font-semibold text-on-primary shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] leading-none">refresh</span>
                <span>{translate('errorBoundary.retry')}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
