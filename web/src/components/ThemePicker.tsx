'use client';

import { useTheme, type Theme } from './ThemeProvider';

const THEMES: { id: Theme; label: string; blurb: string }[] = [
  { id: 'midnight', label: 'Midnight Speedrun', blurb: 'Dark, sharp, built for racing the clock.' },
  { id: 'cozy', label: 'Cozy Table', blurb: 'Warm and calm, like a rainy-day puzzle.' },
];

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {THEMES.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={theme === t.id}
          onClick={() => setTheme(t.id)}
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius)',
            border: theme === t.id ? '2px solid var(--accent)' : '1px solid var(--border)',
            background: 'var(--bg-raised)',
            color: 'var(--text)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <strong style={{ display: 'block' }}>{t.label}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t.blurb}</span>
        </button>
      ))}
    </div>
  );
}
