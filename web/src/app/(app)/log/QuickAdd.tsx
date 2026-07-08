'use client';

import { useState } from 'react';
import { parseDuration } from '@/lib/time';

const PIECE_PRESETS = [100, 300, 500, 750, 1000, 1500, 2000];

// Accessible name for each preset button. Plain digit labels like "1500"
// contain "500" as a substring, which makes them ambiguous to accessible-name
// queries that match "500" (Playwright's getByRole name matching is substring
// by default). Presets ≥1000 get a "k" label as their aria-label so their
// accessible name no longer collides with smaller presets, while the visible
// button text keeps showing the full number.
function pieceAriaLabel(pc: number): string {
  if (pc < 1000) return String(pc);
  const k = pc / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

export function QuickAdd({ onLog, busy }: {
  onLog: (values: { pieces: number; time_seconds: number }) => Promise<boolean | void> | boolean | void;
  busy?: boolean;
}) {
  const [pieces, setPieces] = useState(500);
  const [timeText, setTimeText] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const time = parseDuration(timeText);
    if (time == null || time <= 0) return setError('Time must look like 1:42:07, 42:07, or minutes.');
    const ok = await onLog({ pieces, time_seconds: time });
    if (ok !== false) setTimeText('');
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }} role="radiogroup" aria-label="Piece count">
        {PIECE_PRESETS.map((pc) => (
          <button
            key={pc} type="button" role="radio" aria-checked={pieces === pc}
            aria-label={pieceAriaLabel(pc)}
            className="btn" onClick={() => setPieces(pc)}
            style={pieces === pc ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
          >
            {pc}
          </button>
        ))}
        <input
          aria-label="Custom piece count" type="number" min={1} placeholder="custom"
          style={{ width: 100, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', font: 'inherit' }}
          onChange={(e) => { const v = Number(e.target.value); if (v > 0) setPieces(v); }}
        />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          aria-label="Time" value={timeText} onChange={(e) => setTimeText(e.target.value)}
          placeholder="1:42:07" required
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', font: 'inherit' }}
        />
        <button className="btn btn-primary" disabled={busy}>{busy ? '…' : `Log ${pieces}pc`}</button>
      </div>
      {error ? <p role="alert" style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</p> : null}
    </form>
  );
}
