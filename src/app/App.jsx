import React, { Component } from 'react';
import { AuthProvider } from '../auth';
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
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#0e0e0e] text-white p-6 z-[9999]">
          <div className="max-w-md w-full p-6 rounded-2xl border border-red-500/30 bg-[#161616] shadow-2xl text-center space-y-4">
            <div className="flex justify-center">
              <span className="material-symbols-outlined text-5xl text-red-500">error</span>
            </div>
            <h2 className="text-lg font-bold">Ứng dụng đã gặp sự cố</h2>
            <p className="text-xs text-neutral-400">
              Giao diện đã được bảo vệ khỏi việc đóng đột ngột. Bạn có thể nhấn tải lại để tiếp tục sử dụng:
            </p>
            <p className="text-xs text-red-400 font-mono bg-black/40 p-3 rounded-xl text-left overflow-auto max-h-32 border border-neutral-800">
              {this.state.error?.message || String(this.state.error)}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="cursor-pointer w-full py-2.5 rounded-xl bg-primary text-xs font-bold text-on-primary hover:brightness-110 transition-all shadow-lg"
            >
              Tải lại ứng dụng
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
      <AuthProvider>
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
      </AuthProvider>
    </GlobalErrorBoundary>
  );
}
