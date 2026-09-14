import React, { createContext, useContext, useEffect, useState } from 'react';

const THEME_KEY = 'tt-league:darkMode';
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored !== null) return stored === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_KEY, String(dark));
    } catch (e) {
      // ignore
    }
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const toggle = () => setDark((v) => !v);

  return (
    <ThemeContext.Provider value={{ dark, toggle, setDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
