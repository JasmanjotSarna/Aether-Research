'use client';

import React, { useRef } from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { triggerCircularThemeTransition } from '@/config/animation';

/**
 * Quick Sun / Moon toggle button for top bar and landing nav with circular reveal.
 */
export const QuickThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { resolvedTheme, toggleTheme, mounted } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className={`w-8 h-8 rounded-full flex items-center justify-center glass-thin text-[var(--text-secondary)] opacity-0 ${className}`}
      >
        <Moon size={15} />
      </button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  const handleClick = () => {
    triggerCircularThemeTransition(btnRef.current, () => {
      toggleTheme();
    });
  };

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={handleClick}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className={`w-8 h-8 rounded-full flex items-center justify-center glass-thin text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/10 active:scale-95 transition-all glass-sheen ${className}`}
    >
      {isDark ? (
        <Sun size={15} className="text-[#FF9F0A] animate-in fade-in zoom-in duration-200" />
      ) : (
        <Moon size={15} className="text-[#5E5CE6] animate-in fade-in zoom-in duration-200" />
      )}
    </button>
  );
};

/**
 * Segmented 3-option control (System / Light / Dark) for Settings Modal.
 */
export const ThemeSegmentedControl: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, setTheme, mounted } = useTheme();

  const options: { id: Theme; label: string; icon: React.ReactNode }[] = [
    { id: 'system', label: 'System', icon: <Laptop size={13} /> },
    { id: 'light', label: 'Light', icon: <Sun size={13} /> },
    { id: 'dark', label: 'Dark', icon: <Moon size={13} /> },
  ];

  if (!mounted) {
    return <div className="h-9 w-full rounded-full glass-thin animate-pulse" />;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme selection"
      className={`inline-flex items-center p-1 rounded-full glass border border-[var(--glass-border)] ${className}`}
    >
      {options.map((opt) => {
        const isActive = theme === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(opt.id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              isActive
                ? 'bg-[var(--accent-primary)] text-white shadow-apple-btn'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};

