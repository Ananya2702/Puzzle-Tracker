'use client';

import { useState } from 'react';
import { formatDuration } from '@/lib/time';

export interface FinishValues {
  pieces: number; puzzle_name: string; brand: string; difficulty_rating: number; notes: string;
}

export function FinishDialog({ finalSeconds, initialPieces, initialName, initialBrand, busy, onSave, onDiscard }: {
  finalSeconds: number;
  initialPieces: number | null;
  initialName: string;
  initialBrand: string;
  busy: boolean;
  onSave: (v: FinishValues) => void;
  onDiscard: () => void;
}) {
  const [error, setError] = useState('');

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const f = new FormData(e.currentTarget);
    const pieces = Number(f.get('pieces'));
    if (!Number.isInteger(pieces) || pieces <= 0) return setError('Pieces must be a positive number.');
    onSave({
      pieces,
      puzzle_name: String(f.get('puzzle_name') ?? ''),
      brand: String(f.get('brand') ?? ''),
      difficulty_rating: Number(f.get('difficulty_rating') ?? 3),
      notes: String(f.get('notes') ?? ''),
    });
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Save solve">
      <div className="card modal-card">
        <h3 style={{ marginBottom: 4 }}>Solve complete!</h3>
        <p className="mono" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 16 }}>
          {formatDuration(finalSeconds)}
        </p>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="fd-pieces">Pieces *</label>
              <input id="fd-pieces" name="pieces" type="number" min={1} required defaultValue={initialPieces ?? 500} />
            </div>
            <div className="field">
              <label htmlFor="fd-name">Puzzle name</label>
              <input id="fd-name" name="puzzle_name" defaultValue={initialName} />
            </div>
            <div className="field">
              <label htmlFor="fd-brand">Brand</label>
              <input id="fd-brand" name="brand" defaultValue={initialBrand} />
            </div>
            <div className="field">
              <label htmlFor="fd-diff">Difficulty</label>
              <select id="fd-diff" name="difficulty_rating" defaultValue={3}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
              </select>
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="fd-notes">Notes</label>
            <textarea id="fd-notes" name="notes" rows={2} />
          </div>
          {error ? <p role="alert" style={{ color: 'var(--danger)', margin: '10px 0' }}>{error}</p> : null}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save solve'}</button>
            <button type="button" className="btn btn-danger" onClick={() => { if (window.confirm('Discard this solve?')) onDiscard(); }}>
              Discard
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
