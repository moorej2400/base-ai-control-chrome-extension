import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';
import {
  buildThemeVars,
  DEFAULT_DARK,
  DEFAULT_HUE,
  type ThemeVars,
} from './tokens';

const THEME_KEY = 'settings.theme';

interface StoredTheme {
  dark: boolean;
  accentHue: number;
}

interface ThemeContextValue {
  dark: boolean;
  accentHue: number;
  vars: ThemeVars;
  toggleDark: () => void;
  setAccentHue: (hue: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Owns the live theme (mode + accent hue), persists it across sessions, and
 * pushes the resolved CSS variables onto <html> so the whole panel — including
 * the body backdrop behind the rounded panel — themes in one place.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(DEFAULT_DARK);
  const [accentHue, setHue] = useState(DEFAULT_HUE);

  // Hydrate from storage once. We start from the mock defaults so first paint is
  // never a flash of the wrong theme; the stored value (if any) applies a frame
  // later via the layout effect below.
  useEffect(() => {
    void storageGet<StoredTheme>(THEME_KEY).then((saved) => {
      if (!saved) return;
      if (typeof saved.dark === 'boolean') setDark(saved.dark);
      if (typeof saved.accentHue === 'number') setHue(saved.accentHue);
    });
  }, []);

  const vars = buildThemeVars(dark, accentHue);

  // Apply variables to the document root so `body` background + any portal
  // content inherit them. useLayoutEffect avoids a flash between paint frames.
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    root.dataset.theme = dark ? 'dark' : 'light';
  }, [vars, dark]);

  const persist = (next: StoredTheme) => void storageSet(THEME_KEY, next);

  const value: ThemeContextValue = {
    dark,
    accentHue,
    vars,
    toggleDark: () => {
      setDark((prev) => {
        const next = !prev;
        persist({ dark: next, accentHue });
        return next;
      });
    },
    setAccentHue: (hue: number) => {
      setHue(hue);
      persist({ dark, accentHue: hue });
    },
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
