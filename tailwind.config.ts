import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-base)',
        surface: {
          DEFAULT: 'var(--bg-surface)',
          subtle: 'var(--bg-subtle)',
          input: 'var(--bg-input)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent-primary)',
          hover: 'var(--accent-hover)',
        },
        apple: {
          blue: '#0A84FF',
          violet: '#5E5CE6',
          indigo: '#5856D6',
          cyan: '#32ADE6',
          mint: '#63E6E2',
          green: '#30D158',
          orange: '#FF9F0A',
          red: '#FF453A',
        },
        glass: {
          border: 'var(--glass-border)',
          'border-subtle': 'var(--glass-border-subtle)',
          highlight: 'var(--glass-inner-highlight)',
          shadow: 'var(--glass-shadow)',
        },
      },
      borderRadius: {
        '28': '28px',
        '20': '20px',
        '14': '14px',
        pill: '9999px',
      },
      boxShadow: {
        glass: 'var(--glass-shadow), var(--glass-inner-highlight)',
        'glass-thin': 'var(--glass-shadow-thin), var(--glass-inner-highlight)',
        'glass-thick': 'var(--glass-shadow-thick), var(--glass-inner-highlight)',
        'apple-btn': '0 4px 14px 0 rgba(10, 132, 255, 0.35)',
      },
      backdropBlur: {
        xs: '2px',
        glass: '28px',
        thick: '36px',
      },
      animation: {
        'drift-slow': 'drift 35s ease-in-out infinite alternate',
        'drift-reverse': 'driftReverse 40s ease-in-out infinite alternate',
        'sheen-slide': 'sheen 2.5s ease-in-out infinite',
        'pulse-subtle': 'pulseSubtle 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        drift: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '50%': { transform: 'translate(45px, -35px) scale(1.08)' },
          '100%': { transform: 'translate(-30px, 40px) scale(0.95)' },
        },
        driftReverse: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '50%': { transform: 'translate(-40px, 45px) scale(0.94)' },
          '100%': { transform: 'translate(35px, -25px) scale(1.06)' },
        },
        sheen: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
