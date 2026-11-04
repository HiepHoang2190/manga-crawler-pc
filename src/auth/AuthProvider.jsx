import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { hasAppSession } from '../utils/authSession';

const AuthContext = createContext(null);

export function AuthProvider({ children, onEnteredApp }) {
  const [authInvalidReason, setAuthInvalidReason] = useState(null);
  /** Chờ lần đọc phiên đầu tiên (Electron). */
  const [authBootstrapped, setAuthBootstrapped] = useState(() =>
    typeof window === 'undefined' || !window.electronAPI?.getAuthSession
  );
  /** Phiên OAuth — null = guest (dùng thử). */
  const [authSession, setAuthSession] = useState(null);
  const [freeUserRemainingTokens, setFreeUserRemainingTokens] = useState(null);
  const [freeUserTokenExhaustedOpen, setFreeUserTokenExhaustedOpen] = useState(false);

  const isSignedIn = Boolean(authSession?.refreshToken);
  const shouldConsumeFreeUserToken = isSignedIn && !hasAppSession(authSession);

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.getAuthSession) {
      setAuthSession(null);
      setAuthBootstrapped(true);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getAuthSession();
        if (!cancelled) setAuthSession(s?.refreshToken ? s : null);
      } catch {
        if (!cancelled) setAuthSession(null);
      } finally {
        if (!cancelled) setAuthBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!authBootstrapped || !api?.ensureFreeUserCreditsByEmail) return;
    if (!shouldConsumeFreeUserToken) {
      setFreeUserRemainingTokens(null);
      return;
    }
    const email = String(authSession?.email || '').trim();
    if (!email) {
      setFreeUserRemainingTokens(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api.ensureFreeUserCreditsByEmail({
          email,
          userType: authSession?.userType,
          impliedSupabaseFree: authSession?.impliedSupabaseFree,
        });
        if (cancelled) return;
        if (r?.ok) {
          setFreeUserRemainingTokens(
            Number.isFinite(Number(r.remainingTokens)) ? Math.max(0, Math.floor(Number(r.remainingTokens))) : 0
          );
        } else {
          setFreeUserRemainingTokens(null);
        }
      } catch {
        if (!cancelled) setFreeUserRemainingTokens(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authBootstrapped, authSession, shouldConsumeFreeUserToken]);

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.subscribeAuthSessionInvalidated) return undefined;
    const unsub = api.subscribeAuthSessionInvalidated((payload) => {
      setAuthInvalidReason(payload?.reason || 'UNKNOWN');
      setAuthSession(null);
    });
    return () => unsub?.();
  }, []);

  const handleAuthGateLoggedIn = useCallback(async () => {
    setAuthInvalidReason(null);
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.getAuthSession) {
      onEnteredApp?.();
      return;
    }
    try {
      const s = await api.getAuthSession();
      setAuthSession(s?.refreshToken ? s : null);
    } catch {
      setAuthSession(null);
    }
    onEnteredApp?.();
  }, [onEnteredApp]);

  const value = useMemo(
    () => ({
      authBootstrapped,
      authSession,
      setAuthSession,
      authInvalidReason,
      setAuthInvalidReason,
      isSignedIn,
      freeUserRemainingTokens,
      setFreeUserRemainingTokens,
      freeUserTokenExhaustedOpen,
      setFreeUserTokenExhaustedOpen,
      shouldConsumeFreeUserToken,
      handleAuthGateLoggedIn,
    }),
    [
      authBootstrapped,
      authSession,
      authInvalidReason,
      isSignedIn,
      freeUserRemainingTokens,
      freeUserTokenExhaustedOpen,
      shouldConsumeFreeUserToken,
      handleAuthGateLoggedIn,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
