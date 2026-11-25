import React, { Component } from 'react';
import { AppLogProvider } from '../shared';
import { SettingsProvider } from '../features/settings';
import { ConnectorsProvider } from '../platform/connectors';
import { ShellNavProvider, ShellLayout } from '../features/shell';
import { DownloadProvider } from '../features/download';
import { ReaderProvider } from '../features/reader';
import { LibraryProvider } from '../features/library';
import { ExportProvider } from '../features/export';

class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[GlobalErrorBoundary] Unhandled error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      let isEnglish = false;
      try {
        isEnglish = typeof window !== 'undefined' && window.localStorage?.getItem('manga-crawler-locale') === 'en';
      } catch {
        isEnglish = false;
      }
      const titleText = isEnglish ? 'Something went wrong' : 'Ứng dụng đã gặp sự cố';
      const descText = isEnglish
        ? 'The interface was protected from closing unexpectedly. You can reload to continue:'
        : 'Giao diện đã được bảo vệ khỏi việc đóng đột ngột. Bạn có thể nhấn tải lại để tiếp tục sử dụng:';
      const reloadText = isEnglish ? 'Reload application' : 'Tải lại ứng dụng';

      return (
        <div className="fixed inset-0 flex items-center justify-center bg-surface text-on-surface p-6 z-[9999]">
          <div className="max-w-md w-full p-6 rounded-2xl border border-error/30 bg-surface-container-high shadow-2xl text-center space-y-4">
            <div className="flex justify-center">
              <span className="material-symbols-outlined text-5xl text-error">error</span>
            </div>
            <h2 className="text-lg font-bold text-on-surface">{titleText}</h2>
            <p className="text-xs text-on-surface-variant">
              {descText}
            </p>
            <p className="text-xs text-error font-mono bg-surface-container-highest p-3 rounded-xl text-left overflow-auto max-h-32 border border-outline-variant/20">
              {this.state.error?.message || String(this.state.error)}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="cursor-pointer w-full py-2.5 rounded-xl bg-primary text-xs font-bold text-on-primary hover:opacity-90 transition-all shadow-lg"
            >
              {reloadText}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <AppLogProvider>
        <SettingsProvider>
          <ConnectorsProvider>
            <ShellNavProvider>
              <DownloadProvider>
                <ReaderProvider>
                  <LibraryProvider>
                    <ExportProvider>
                      <ShellLayout />
                    </ExportProvider>
                  </LibraryProvider>
                </ReaderProvider>
              </DownloadProvider>
            </ShellNavProvider>
          </ConnectorsProvider>
        </SettingsProvider>
      </AppLogProvider>
    </GlobalErrorBoundary>
  );
}
