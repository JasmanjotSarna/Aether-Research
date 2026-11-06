'use client';

import { useState, useEffect, useCallback } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const THEME_KEY = 'aether_theme';

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;

  const resolved = theme === 'system' ? getSystemTheme() : theme;
  const root = document.documentElement;

  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;

  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Notify listeners
  window.dispatchEvent(new CustomEvent('aether-theme-change', { detail: { theme, resolved } }));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let initialTheme: Theme = 'system';
    try {
      const urlParam = new URLSearchParams(window.location.search).get('theme') as Theme | null;
      if (urlParam === 'dark' || urlParam === 'light' || urlParam === 'system') {
        initialTheme = urlParam;
      } else {
        initialTheme = (localStorage.getItem(THEME_KEY) as Theme) || 'system';
      }
    } catch {
      initialTheme = 'system';
    }

    setThemeState(initialTheme);
    const resolved = initialTheme === 'system' ? getSystemTheme() : initialTheme;
    setResolvedTheme(resolved);
    applyTheme(initialTheme);

    // Media query listener for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      const currentStored = (localStorage.getItem(THEME_KEY) as Theme) || 'system';
      if (currentStored === 'system') {
        const newResolved = getSystemTheme();
        setResolvedTheme(newResolved);
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleMediaChange);

    const handleThemeChange = (e: Event) => {
      const custom = e as CustomEvent<{ theme: Theme; resolved: 'light' | 'dark' }>;
      if (custom.detail) {
        setThemeState(custom.detail.theme);
        setResolvedTheme(custom.detail.resolved);
      }
    };

    window.addEventListener('aether-theme-change', handleThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
      window.removeEventListener('aether-theme-change', handleThemeChange);
    };
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_KEY, newTheme);
    } catch {
      // Ignore localStorage errors (private browsing, etc.)
    }
    const resolved = newTheme === 'system' ? getSystemTheme() : newTheme;
    setResolvedTheme(resolved);
    applyTheme(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    // If currently dark (or system-resolved dark), switch to light. Otherwise dark.
    const currentResolved = theme === 'system' ? getSystemTheme() : theme;
    const nextTheme: Theme = currentResolved === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  }, [theme, setTheme]);

  return {
    theme,
    resolvedTheme: mounted ? resolvedTheme : 'light',
    setTheme,
    toggleTheme,
    mounted,
  };
}
