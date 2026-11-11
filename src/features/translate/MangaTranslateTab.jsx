import React, { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../context/I18nContext';
import { StudioLayout } from '../../shared';
import MangaStudioEditor from './components/MangaStudioEditor';

/**
 * MangaTranslateTab — Khung hiển thị Manga Translation Studio độc lập tại Top-level MenuBar.
 * Giao diện làm việc tập trung 100% tại Studio, tích hợp Quy trình & Cài đặt trong thanh công cụ bên phải.
 */
export default function MangaTranslateTab({ savePath = '', onRunningChange }) {
  const { t } = useI18n();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  const [settings, setSettings] = useState(null);
  const [localEngines, setLocalEngines] = useState(null);
  const [studioPages, setStudioPages] = useState([]);

  useEffect(() => {
    if (!api) return;
    api.translateGetSettings?.()?.then((s) => {
      if (s) setSettings(s);
    });
    api.translateDetectLocalEngines?.()?.then((eng) => {
      if (eng) setLocalEngines(eng);
    });
  }, [api]);

  const updateSetting = useCallback((partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      api?.translateSaveSettings?.(next);
      return next;
    });
  }, [api]);

  const isLocalEngineOnline = Boolean(localEngines?.ollama?.online);
  const activeEngineLabel = localEngines?.ollama?.online
    ? 'Ollama (port 11434)'
    : t('translate.studio.disconnected');

  return (
    <StudioLayout className="w-full h-full overflow-hidden bg-surface">
      <MangaStudioEditor
        isStandaloneView={true}
        chapterTitle="Manga Translation Studio"
        initialPages={studioPages}
        onUpdatePages={setStudioPages}
        settings={settings}
        onUpdateSetting={updateSetting}
        localEngines={localEngines}
        isLocalEngineOnline={isLocalEngineOnline}
        activeEngineLabel={activeEngineLabel}
        onRunningChange={onRunningChange}
      />
    </StudioLayout>
  );
}
