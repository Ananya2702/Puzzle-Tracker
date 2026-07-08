'use client';

import { useState } from 'react';
import { parseDuration, formatDuration } from '@/lib/time';

export interface SolveFormValues {
  pieces: number; time_seconds: number; date: string; puzzle_name: string; brand: string;
  difficulty_rating: number; notes: string; tags: string;
  puzzle_type: 'solo' | 'duo' | 'team'; first_attempt: boolean;
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function SolveForm({ initial, submitLabel, onSubmit, busy }: {
  initial?: Partial<SolveFormValues>;
  submitLabel: string;
  onSubmit: (values: SolveFormValues) => Promise<void> | void;
  busy?: boolean;
}) {
  const [timeText, setTimeText] = useState(initial?.time_seconds ? formatDuration(initial.time_seconds) : '');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const f = new FormData(e.currentTarget);
    const time = parseDuration(timeText);
    const pieces = Number(f.get('pieces'));
    if (time == null || time <= 0) return setError('Time must look like 1:42:07, 42:07, or minutes (90).');
    if (!Number.isInteger(pieces) || pieces <= 0) return setError('Pieces must be a positive number.');
    await onSubmit({
      pieces,
      time_seconds: time,
      date: String(f.get('date') || todayLocal()),
      puzzle_name: String(f.get('puzzle_name') ?? ''),
      brand: String(f.get('brand') ?? ''),
      difficulty_rating: Number(f.get('difficulty_rating') ?? 3),
      notes: String(f.get('notes') ?? ''),
      tags: String(f.get('tags') ?? ''),
      puzzle_type: (f.get('puzzle_type') as SolveFormValues['puzzle_type']) ?? 'solo',
      first_attempt: f.get('first_attempt') === 'on',
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="sf-pieces">Pieces *</label>
          <input id="sf-pieces" name="pieces" type="number" min={1} required defaultValue={initial?.pieces ?? 500} />
        </div>
        <div className="field">
          <label htmlFor="sf-time">Time *</label>
          <input id="sf-time" value={timeText} onChange={(e) => setTimeText(e.target.value)} placeholder="1:42:07" required />
          <div className="hint">h:mm:ss, m:ss, or minutes</div>
        </div>
        <div className="field">
          <label htmlFor="sf-date">Date</label>
          <input id="sf-date" name="date" type="date" defaultValue={initial?.date ?? todayLocal()} />
        </div>
        <div className="field">
          <label htmlFor="sf-name">Puzzle name</label>
          <input id="sf-name" name="puzzle_name" defaultValue={initial?.puzzle_name ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="sf-brand">Brand</label>
          <input id="sf-brand" name="brand" defaultValue={initial?.brand ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="sf-diff">Difficulty</label>
          <select id="sf-diff" name="difficulty_rating" defaultValue={initial?.difficulty_rating ?? 3}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sf-type">Session type</label>
          <select id="sf-type" name="puzzle_type" defaultValue={initial?.puzzle_type ?? 'solo'}>
            <option value="solo">Solo</option>
            <option value="duo">Duo</option>
            <option value="team">Team</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sf-tags">Tags</label>
          <input id="sf-tags" name="tags" defaultValue={initial?.tags ?? ''} placeholder="gradient, disney" />
        </div>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="sf-notes">Notes</label>
        <textarea id="sf-notes" name="notes" rows={2} defaultValue={initial?.notes ?? ''} />
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '14px 0', fontSize: '0.9rem' }}>
        <input type="checkbox" name="first_attempt" defaultChecked={initial?.first_attempt ?? false} />
        First attempt at this puzzle
      </label>
      {error ? <p role="alert" style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p> : null}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
