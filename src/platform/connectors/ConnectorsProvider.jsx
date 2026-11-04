import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { FALLBACK_CONNECTORS } from './fallbackConnectors.js';
import { fetchConnectorList } from './connectorList.js';

const ConnectorsContext = createContext(null);

export function ConnectorsProvider({ children }) {
  const [connectorList, setConnectorList] = useState(FALLBACK_CONNECTORS);

  const refreshConnectorList = useCallback(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    return fetchConnectorList(api, FALLBACK_CONNECTORS)
      .then(setConnectorList)
      .catch(() => {});
  }, []);

  useEffect(() => {
    void refreshConnectorList();
  }, [refreshConnectorList]);

  const value = useMemo(
    () => ({ connectorList, refreshConnectorList }),
    [connectorList, refreshConnectorList]
  );

  return <ConnectorsContext.Provider value={value}>{children}</ConnectorsContext.Provider>;
}

export function useConnectorList() {
  const ctx = useContext(ConnectorsContext);
  if (!ctx) throw new Error('useConnectorList must be used within ConnectorsProvider');
  return ctx;
}
