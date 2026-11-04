import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const BrandingContext = createContext({
  appName: 'Sưu Tầm Ebook Truyện Tranh',
  defaultAppName: 'Sưu Tầm Ebook Truyện Tranh',
  iconType: 'app',
  showTitleBarIcon: true,
  customIconDataUrl: null,
  defaultAppDataUrl: null,
  defaultElectronDataUrl: null,
  currentIconUrl: '/data/icon.png',
  isLoaded: false,
  setBranding: async () => {},
  resetBranding: async () => {},
  pickIconFile: async () => null,
});

export function BrandingProvider({ children }) {
  const [appName, setAppName] = useState(() => {
    const cached = localStorage.getItem('manga_branding_app_name');
    return cached !== null ? cached : 'Sưu Tầm Ebook Truyện Tranh';
  });
  const [defaultAppName, setDefaultAppName] = useState('Sưu Tầm Ebook Truyện Tranh');
  const [iconType, setIconType] = useState(() => {
    return localStorage.getItem('manga_branding_icon_type') || 'app';
  });
  const [showTitleBarIcon, setShowTitleBarIcon] = useState(() => {
    const cached = localStorage.getItem('manga_branding_show_titlebar_icon');
    return cached !== 'false';
  });
  const [customIconDataUrl, setCustomIconDataUrl] = useState(null);
  const [defaultAppDataUrl, setDefaultAppDataUrl] = useState(null);
  const [defaultElectronDataUrl, setDefaultElectronDataUrl] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const applyConfig = useCallback((config) => {
    if (!config) return;
    if (typeof config.appName === 'string') {
      setAppName(config.appName);
      localStorage.setItem('manga_branding_app_name', config.appName);
    }
    if (config.defaultAppName) {
      setDefaultAppName(config.defaultAppName);
    }
    if (config.iconType) {
      setIconType(config.iconType);
      localStorage.setItem('manga_branding_icon_type', config.iconType);
    }
    if (config.showTitleBarIcon !== undefined) {
      const val = Boolean(config.showTitleBarIcon);
      setShowTitleBarIcon(val);
      localStorage.setItem('manga_branding_show_titlebar_icon', String(val));
    }
    if (config.customIconDataUrl !== undefined) {
      setCustomIconDataUrl(config.customIconDataUrl);
    }
    if (config.defaultAppDataUrl !== undefined) {
      setDefaultAppDataUrl(config.defaultAppDataUrl);
    }
    if (config.defaultElectronDataUrl !== undefined) {
      setDefaultElectronDataUrl(config.defaultElectronDataUrl);
    }
  }, []);

  useEffect(() => {
    let unsub = null;
    const api = window.electronAPI;

    if (api?.getBranding) {
      api.getBranding().then((res) => {
        if (res?.ok && res?.config) {
          applyConfig(res.config);
        }
        setIsLoaded(true);
      }).catch((err) => {
        console.error('[BrandingContext] Failed to load branding:', err);
        setIsLoaded(true);
      });
    } else {
      setIsLoaded(true);
    }

    if (api?.subscribeBrandingChanged) {
      unsub = api.subscribeBrandingChanged((config) => {
        applyConfig(config);
      });
    }

    return () => {
      unsub?.();
    };
  }, [applyConfig]);

  const setBranding = useCallback(async (payload) => {
    const api = window.electronAPI;
    const finalPayload = {
      ...payload,
      iconBase64: payload?.iconBase64 || payload?.customIconDataUrl,
    };
    if (api?.setBranding) {
      const res = await api.setBranding(finalPayload);
      if (res?.ok && res?.config) {
        applyConfig(res.config);
      }
      return res;
    }
    // Fallback nếu chạy web browser
    applyConfig(finalPayload);
    return { ok: true };
  }, [applyConfig]);

  const resetBranding = useCallback(async () => {
    const api = window.electronAPI;
    if (api?.resetBranding) {
      const res = await api.resetBranding();
      if (res?.ok && res?.config) {
        applyConfig(res.config);
      }
      return res;
    }
    applyConfig({
      appName: defaultAppName,
      iconType: 'app',
      customIconDataUrl: null,
      showTitleBarIcon: true,
    });
    return { ok: true };
  }, [applyConfig, defaultAppName]);

  const pickIconFile = useCallback(async () => {
    const api = window.electronAPI;
    if (api?.pickBrandingIconFile) {
      return api.pickBrandingIconFile();
    }
    return null;
  }, []);

  const currentIconUrl = useMemo(() => {
    if (iconType === 'custom' && customIconDataUrl) {
      return customIconDataUrl;
    }
    if (iconType === 'electron') {
      return defaultElectronDataUrl || '/data/electron-icon.png';
    }
    return defaultAppDataUrl || '/data/icon.png';
  }, [iconType, customIconDataUrl, defaultElectronDataUrl, defaultAppDataUrl]);

  const value = useMemo(() => ({
    appName,
    defaultAppName,
    iconType,
    showTitleBarIcon,
    customIconDataUrl,
    defaultAppDataUrl,
    defaultElectronDataUrl,
    currentIconUrl,
    isLoaded,
    setBranding,
    resetBranding,
    pickIconFile,
  }), [
    appName,
    defaultAppName,
    iconType,
    showTitleBarIcon,
    customIconDataUrl,
    defaultAppDataUrl,
    defaultElectronDataUrl,
    currentIconUrl,
    isLoaded,
    setBranding,
    resetBranding,
    pickIconFile,
  ]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
