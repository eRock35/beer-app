import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './lib/api.js';

const AppContext = createContext(null);

const THEME_KEY = 'hopscotch:theme';

const THEME_COLOURS = { light: '#f5f3ee', dark: '#121211' };

function applyTheme(theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  // The two media-scoped <meta name="theme-color"> tags follow the OS; a manual
  // override needs both to agree with the forced theme, or the iOS status bar
  // and the page disagree.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = meta.media?.includes('dark') ? 'dark' : 'light';
    meta.content = THEME_COLOURS[theme === 'system' ? scheme : theme];
  }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [reference, setReference] = useState(null);
  const [booting, setBooting] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'system');

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, ref] = await Promise.all([
          api.me().catch(() => ({ user: null })),
          api.reference(),
        ]);
        if (cancelled) return;
        setUser(me.user);
        setReference(ref);
      } catch {
        // A failed boot still renders the app; individual views surface errors.
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (body) => {
    const { user: u } = await api.login(body);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (body) => {
    const { user: u } = await api.register(body);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const saveProfile = useCallback(async (changes) => {
    const { user: u } = await api.updateProfile(changes);
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({
      user,
      reference,
      booting,
      theme,
      setTheme,
      login,
      register,
      logout,
      saveProfile,
      aiEnabled: Boolean(reference?.aiEnabled),
    }),
    [user, reference, booting, theme, login, register, logout, saveProfile]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** Small async-data hook: load on mount, expose a manual reload. */
export function useAsync(loader, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error) => !cancelled && setState({ data: null, error: error.message, loading: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  return { ...state, reload: () => setNonce((n) => n + 1), setData: (data) => setState((s) => ({ ...s, data })) };
}
