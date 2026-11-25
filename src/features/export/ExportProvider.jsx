import { createContext, useContext, useMemo, useState } from 'react';
import { useSettings } from '../settings';
import { useDownload } from '../download';
import CbzExportDrawer from './cbz/CbzExportDrawer.jsx';
import PdfExportDrawer from './pdf/PdfExportDrawer.jsx';

const ExportContext = createContext(null);

export function ExportProvider({ children }) {
  const { savePath } = useSettings();
  const { manga, chapters, sourceUrl } = useDownload();
  const [cbzExportDrawerOpen, setCbzExportDrawerOpen] = useState(false);
  const [pdfExportOpen, setpdfExportOpen] = useState(false);

  const value = useMemo(
    () => ({
      cbzExportDrawerOpen,
      setCbzExportDrawerOpen,
      pdfExportOpen,
      setpdfExportOpen,
    }),
    [cbzExportDrawerOpen, pdfExportOpen]
  );

  return (
    <ExportContext.Provider value={value}>
      {children}
      {cbzExportDrawerOpen && manga ? (
        <CbzExportDrawer
          open={cbzExportDrawerOpen}
          onClose={() => setCbzExportDrawerOpen(false)}
          savePath={savePath}
          mangaTitle={manga.title}
          mangaUrl={String(manga?.mangaUrl || sourceUrl || '').trim()}
          chapters={chapters}
          offlineMangaDirAbsolute={String(manga?.offlineMangaDirAbsolute || '').trim()}
        />
      ) : null}
      {pdfExportOpen && manga ? (
        <PdfExportDrawer
          open={pdfExportOpen}
          onClose={() => setpdfExportOpen(false)}
          savePath={savePath}
          mangaTitle={manga.title}
          mangaUrl={String(manga?.mangaUrl || sourceUrl || '').trim()}
          chapters={chapters}
          offlineMangaDirAbsolute={String(manga?.offlineMangaDirAbsolute || '').trim()}
        />
      ) : null}
    </ExportContext.Provider>
  );
}

export function useExport() {
  const ctx = useContext(ExportContext);
  if (!ctx) throw new Error('useExport must be used within ExportProvider');
  return ctx;
}
