'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'midnight' | 'cozy';

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'midnight',
  setTheme: () => {},
});

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  // On mount, adopt the stored preference (the <head> boot script already
  // painted it); otherwise make the DOM reflect the server-derived theme.
  useEffect(() => {
    const stored = localStorage.getItem('pg-theme');
    if (stored === 'midnight' || stored === 'cozy') {
      setThemeState(stored);
      document.documentElement.dataset.theme = stored;
    } else {
      document.documentElement.dataset.theme = initialTheme;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem('pg-theme', t);
    document.documentElement.dataset.theme = t;
    // Best-effort server persistence; 401 for logged-out visitors is fine.
    fetch('/api/me/theme', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: t }),
    }).catch(() => {});
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
