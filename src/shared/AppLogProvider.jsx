import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { appendLogEntry } from './appendLogEntry.js';

const AppLogContext = createContext(null);

export function AppLogProvider({ children }) {
  const [logs, setLogs] = useState([]);
  const appendLog = useCallback((msg, level = 'info') => {
    setLogs((prev) => appendLogEntry(prev, msg, level));
  }, []);
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);
  const value = useMemo(() => ({ logs, appendLog, clearLogs }), [logs, appendLog, clearLogs]);
  return <AppLogContext.Provider value={value}>{children}</AppLogContext.Provider>;
}

export function useAppLog() {
  const ctx = useContext(AppLogContext);
  if (!ctx) throw new Error('useAppLog must be used within AppLogProvider');
  return ctx;
}
