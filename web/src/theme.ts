// Light / dark theme for both pages. The choice lives on <html data-theme> (set before first paint by
// the inline script in index.html) and in localStorage. Dark is the default.
import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'bfc.theme';

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f2f3f7' : '#04050b');
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

/** The current theme, kept in sync with <html data-theme> (whoever changes it). */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>(getTheme);
  useEffect(() => {
    const mo = new MutationObserver(() => set(getTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return [theme, setTheme];
}
