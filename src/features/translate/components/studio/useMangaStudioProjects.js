import { useState, useEffect, useRef, useCallback } from 'react';
import { normalizePages } from './mangaStudioCanvasRender';

/**
 * useMangaStudioProjects — Hook quản lý toàn diện Vòng đời Dự án & Phiên làm việc (Session)
 * - Tự động nạp dự án đang active và phục hồi danh sách trang khi mở Studio
 * - Tự động lưu ngầm (Auto-Save debounced 3s) khi người dùng chỉnh sửa trang/layers
 * - Tạo dự án mới, chuyển đổi dự án, đổi tên và xóa dự án
 * - Serialization chuẩn tối ưu dữ liệu lưu trữ
 */
export function useMangaStudioProjects({
  api,
  pages = [],
  setPages,
  activePageIndex = 0,
  setActivePageIndex,
  isTranslating = false,
  initialPages = [],
  onUpdatePages,
  setSelectedLayerId,
  setExpandedLayerId,
  setLogs,
  setTranslateProgress,
  loadingPathsRef,
  setShowProjectModal,
  setStatusMessage,
  t,
}) {
  const [projectsList, setProjectsList] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const saveSessionTimerRef = useRef(null);

  const clearSaveSessionTimer = useCallback(() => {
    if (saveSessionTimerRef.current) {
      clearTimeout(saveSessionTimerRef.current);
      saveSessionTimerRef.current = null;
    }
  }, []);

  // Serialize pages — chỉ gửi fields cần thiết, bỏ qua DOM refs
  const serializePagesForSession = useCallback((pagesList) => {
    return (pagesList || []).map((p) => ({
      id: p.id,
      index: p.index,
      imagePath: p.imagePath,
      filename: p.filename,
      width: p.width,
      height: p.height,
      dataUrl: p.dataUrl || null,
      originalDataUrl: p.originalDataUrl || null,
      cleanDataUrl: p.cleanDataUrl || null,
      translatedImageDataUrl: p.translatedImageDataUrl || null,
      savedPath: p.savedPath || '',
      layers: (p.layers || []).map((l) => ({
        id: l.id,
        type: l.type,
        bbox: l.bbox,
        textBbox: l.textBbox,
        text: l.text,
        translatedText: l.translatedText,
        sourceText: l.sourceText,
        fontFamily: l.fontFamily,
        fontSize: l.fontSize,
        fontWeight: l.fontWeight,
        fontColor: l.fontColor,
        textAlign: l.textAlign,
        textTransform: l.textTransform,
        opacity: l.opacity,
        visible: l.visible,
        borderWidth: l.borderWidth,
        borderColor: l.borderColor,
        cleanDataUrl: l.cleanDataUrl || null,
      })),
    }));
  }, []);

  // Load danh sách projects
  const loadProjectsList = useCallback(async () => {
    if (!api?.translateListProjects) return null;
    try {
      const res = await api.translateListProjects();
      if (res?.projects) {
        setProjectsList(res.projects);
        const active = res.projects.find((p) => p.id === res.activeProjectId) || res.projects[0] || null;
        setCurrentProject(active);
        return { activeProjectId: res.activeProjectId, projects: res.projects, activeProject: active };
      }
    } catch (e) {
      console.warn('[Projects] Failed to load projects list:', e);
    }
    return null;
  }, [api]);

  // --- Auto-Save Session (Debounced 3s) ---
  useEffect(() => {
    if (!api?.translateSaveSession || isTranslating || !currentProject) return;
    clearSaveSessionTimer();

    // Nếu pages rỗng sau khi session đã được nạp -> dọn dẹp các trang của dự án hiện tại
    if (pages.length === 0) {
      if (sessionLoaded) {
        api.translateClearSession?.(currentProject.id).catch(() => { });
        setProjectsList((prev) =>
          prev.map((p) => (p.id === currentProject.id ? { ...p, pageCount: 0, coverThumb: null } : p))
        );
      }
      return;
    }

    saveSessionTimerRef.current = setTimeout(async () => {
      try {
        setIsSavingSession(true);
        const serializablePages = serializePagesForSession(pages);
        await api.translateSaveSession({
          projectId: currentProject.id,
          pages: serializablePages,
          activePageIndex,
          name: currentProject.name,
        });
        setProjectsList((prev) =>
          prev.map((p) => (p.id === currentProject.id ? { ...p, pageCount: pages.length } : p))
        );
      } catch (e) {
        console.warn('[AutoSave] Session save error:', e);
      } finally {
        setIsSavingSession(false);
      }
    }, 3000);

    return () => {
      clearSaveSessionTimer();
    };
  }, [pages, activePageIndex, api, isTranslating, sessionLoaded, currentProject, serializePagesForSession, clearSaveSessionTimer]);

  // --- Load Session & Projects on Mount ---
  useEffect(() => {
    if (sessionLoaded) return;
    if (initialPages && initialPages.length > 0) {
      setSessionLoaded(true);
      return;
    }

    (async () => {
      try {
        const projData = await loadProjectsList();
        const activeId = projData?.activeProjectId;
        if (api?.translateLoadSession) {
          const result = await api.translateLoadSession(activeId);
          if (result?.success) {
            if (result.project) setCurrentProject(result.project);
            if (Array.isArray(result.pages) && result.pages.length > 0) {
              const restored = normalizePages(result.pages);
              setPages(restored);
              setActivePageIndex?.(result.activePageIndex || 0);
              setStatusMessage?.({
                type: 'info',
                text: t('translate.studio.toastProjectOpened', {
                  name: result.project?.name || t('translate.studio.projectDefaultName'),
                  count: restored.length,
                }),
              });
            }
          }
        }
      } catch (e) {
        console.warn('[Session] Load error:', e);
      } finally {
        setSessionLoaded(true);
      }
    })();
  }, [api, sessionLoaded, initialPages, loadProjectsList, setPages, setActivePageIndex, setStatusMessage, t]);

  // --- Tạo Dự Án Mới ---
  const handleCreateProject = useCallback(async (customName) => {
    if (!api?.translateCreateProject) return;
    try {
      clearSaveSessionTimer();
      // 1. Lưu dự án hiện tại nếu có trang
      if (pages.length > 0 && currentProject) {
        const serializable = serializePagesForSession(pages);
        await api.translateSaveSession({
          projectId: currentProject.id,
          pages: serializable,
          activePageIndex,
          name: currentProject.name,
        });
      }

      // 2. Tạo dự án mới
      const finalName = (customName || '').trim();
      const res = await api.translateCreateProject({ name: finalName });
      if (res?.success) {
        setProjectsList(res.projects);
        setCurrentProject(res.project);
        setPages([]);
        setActivePageIndex?.(0);
        setSelectedLayerId?.(null);
        setExpandedLayerId?.(null);
        setLogs?.([]);
        setTranslateProgress?.(null);
        if (loadingPathsRef?.current) loadingPathsRef.current.clear();
        onUpdatePages?.([]);
        setShowProjectModal?.(false);
        setStatusMessage?.({
          type: 'success',
          text: t('translate.studio.toastProjectCreated', { name: res.project.name }),
        });
      }
    } catch (e) {
      console.error('[Projects] Create error:', e);
      setStatusMessage?.({
        type: 'error',
        text: t('translate.studio.toastProjectCreateError', { error: e.message }),
      });
    }
  }, [api, pages, currentProject, activePageIndex, serializePagesForSession, onUpdatePages, t, clearSaveSessionTimer, setPages, setActivePageIndex, setSelectedLayerId, setExpandedLayerId, setLogs, setTranslateProgress, loadingPathsRef, setShowProjectModal, setStatusMessage]);

  // --- Chuyển Đổi Qua Lại Giữa Các Dự Án ---
  const handleSwitchProject = useCallback(async (targetProjectId) => {
    if (!api?.translateSwitchProject || !targetProjectId) return;
    if (targetProjectId === currentProject?.id) {
      setShowProjectModal?.(false);
      return;
    }

    try {
      clearSaveSessionTimer();
      // 1. Lưu dự án hiện tại trước khi chuyển
      if (pages.length > 0 && currentProject) {
        const serializable = serializePagesForSession(pages);
        await api.translateSaveSession({
          projectId: currentProject.id,
          pages: serializable,
          activePageIndex,
          name: currentProject.name,
        });
      }

      // 2. Chuyển sang dự án đích
      const res = await api.translateSwitchProject({ projectId: targetProjectId });
      if (res?.success) {
        setProjectsList(res.projects);
        setCurrentProject(res.project);
        const restored = normalizePages(res.session?.pages || []);
        setPages(restored);
        setActivePageIndex?.(res.session?.activePageIndex || 0);
        setSelectedLayerId?.(null);
        setExpandedLayerId?.(null);
        setLogs?.([]);
        setTranslateProgress?.(null);
        if (loadingPathsRef?.current) loadingPathsRef.current.clear();
        onUpdatePages?.(restored);
        setShowProjectModal?.(false);
        setStatusMessage?.({
          type: 'info',
          text: t('translate.studio.toastProjectSwitched', {
            name: res.project?.name || targetProjectId,
            count: restored.length,
          }),
        });
      }
    } catch (e) {
      console.error('[Projects] Switch error:', e);
      setStatusMessage?.({
        type: 'error',
        text: t('translate.studio.toastProjectSwitchError', { error: e.message }),
      });
    }
  }, [api, currentProject, pages, activePageIndex, serializePagesForSession, onUpdatePages, t, clearSaveSessionTimer, setPages, setActivePageIndex, setSelectedLayerId, setExpandedLayerId, setLogs, setTranslateProgress, loadingPathsRef, setShowProjectModal, setStatusMessage]);

  // --- Đổi Tên Dự Án ---
  const handleRenameProject = useCallback(async (projectId, newName) => {
    if (!api?.translateRenameProject || !newName?.trim()) return;
    try {
      const res = await api.translateRenameProject({ projectId, name: newName.trim() });
      if (res?.success) {
        setProjectsList(res.projects);
        if (currentProject?.id === projectId) {
          setCurrentProject(res.project);
        }
        setStatusMessage?.({
          type: 'success',
          text: t('translate.studio.toastProjectRenamed', { name: res.project.name }),
        });
      }
    } catch (e) {
      console.error('[Projects] Rename error:', e);
    }
  }, [api, currentProject, t, setStatusMessage]);

  // --- Xóa Dự Án ---
  const handleDeleteProject = useCallback(async (projectId) => {
    if (!api?.translateDeleteProject || !projectId) return;
    try {
      clearSaveSessionTimer();
      const res = await api.translateDeleteProject({ projectId });
      if (res?.success) {
        setProjectsList(res.projects);
        if (currentProject?.id === projectId) {
          const newActive = res.projects.find((p) => p.id === res.activeProjectId) || res.projects[0];
          setCurrentProject(newActive);
          const restored = normalizePages(res.session?.pages || []);
          setPages(restored);
          setActivePageIndex?.(res.session?.activePageIndex || 0);
          onUpdatePages?.(restored);
        }
        setStatusMessage?.({
          type: 'info',
          text: t('translate.studio.toastProjectDeleted'),
        });
      }
    } catch (e) {
      console.error('[Projects] Delete error:', e);
      setStatusMessage?.({
        type: 'error',
        text: t('translate.studio.toastProjectDeleteError', { error: e.message }),
      });
    }
  }, [api, currentProject, onUpdatePages, clearSaveSessionTimer, setPages, setActivePageIndex, setStatusMessage, t]);

  return {
    projectsList,
    setProjectsList,
    currentProject,
    setCurrentProject,
    isSavingSession,
    sessionLoaded,
    loadProjectsList,
    handleCreateProject,
    handleSwitchProject,
    handleRenameProject,
    handleDeleteProject,
    serializePagesForSession,
    clearSaveSessionTimer,
  };
}

