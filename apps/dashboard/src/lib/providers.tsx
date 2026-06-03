'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Client providers for theme (light/dark via `:root[data-theme]`, persisted) and the Test/Live env
 * (persisted in a cookie). Server components stay the default; only these leaves are client (D31).
 */
export type Theme = 'light' | 'dark';
export type Env = 'live' | 'test';

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
});
const EnvContext = createContext<{ env: Env; setEnv: (e: Env) => void }>({
  env: 'live',
  setEnv: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
export function useEnv() {
  return useContext(EnvContext);
}

export function Providers({ children, initialEnv = 'live' }: { children: ReactNode; initialEnv?: Env }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('lumina-theme')) as
      | Theme
      | null;
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const next = saved ?? system;
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  const toggle = () =>
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem('lumina-theme', next);
      } catch {
        /* private mode */
      }
      return next;
    });

  const [env, setEnvState] = useState<Env>(initialEnv);
  const setEnv = (e: Env) => {
    setEnvState(e);
    document.cookie = `lumina-env=${e};path=/;max-age=31536000;samesite=lax`;
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <EnvContext.Provider value={{ env, setEnv }}>{children}</EnvContext.Provider>
    </ThemeContext.Provider>
  );
}
