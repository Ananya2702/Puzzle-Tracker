'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJSON, putJSON, deleteJSON, ApiError } from '@/lib/api-client';
import { formatDuration } from '@/lib/time';
import { fmtDateFull } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { SolveForm, type SolveFormValues } from '@/components/SolveForm';
import { ImportPanel } from './ImportPanel';
import './history.css';

interface Solve {
  id: number; date: string; pieces: number; timeSeconds: number; scaledTimeSeconds: number;
  puzzleName: string; brand: string; difficultyRating: number; notes: string; tags: string;
  isPersonalBest: boolean; puzzleType: string; firstAttempt: boolean;
}

export default function HistoryPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Solve[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pieces, setPieces] = useState('all');
  const [sort, setSort] = useState<'date' | 'time' | 'scaled' | 'pieces'>('date');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [editing, setEditing] = useState<Solve | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const qs = new URLSearchParams({ sort, order });
    if (pieces !== 'all') qs.set('pieces', pieces);
    setRows(await getJSON<Solve[]>(`/api/solves?${qs}`));
    setLoaded(true);
  }, [pieces, sort, order]);

  useEffect(() => { void refresh(); }, [refresh]);

  const pieceOptions = [...new Set(rows.map((r) => r.pieces))].sort((a, b) => a - b);

  async function saveEdit(values: SolveFormValues) {
    if (!editing) return;
    setBusy(true);
    try {
      await putJSON(`/api/solves/${editing.id}`, values);
      toast('Session updated');
      setEditing(null);
      await refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Update failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Solve) {
    if (!window.confirm(`Delete the ${row.pieces}pc session from ${fmtDateFull(row.date)}?`)) return;
    try {
      await deleteJSON(`/api/solves/${row.id}`);
      toast('Session deleted');
      await refresh();
    } catch {
      toast('Delete failed', 'error');
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>History</h1>
        <p className="desc">All sessions</p>
      </div>

      <div className="history-controls">
        <select aria-label="Filter by pieces" value={pieces} onChange={(e) => setPieces(e.target.value)}>
          <option value="all">All sizes</option>
          {pieceOptions.map((pc) => <option key={pc} value={pc}>{pc}pc</option>)}
        </select>
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="date">Date</option>
          <option value="time">Time</option>
          <option value="scaled">Scaled</option>
          <option value="pieces">Pieces</option>
        </select>
        <button className="btn" onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')} aria-label="Toggle sort order">
          {order === 'desc' ? '↓' : '↑'}
        </button>
        <span style={{ flex: 1 }} />
        <a className="btn" href="/api/export/csv" download>Export CSV</a>
        <button className="btn" onClick={() => setShowImport(!showImport)}>{showImport ? 'Close import' : 'Import'}</button>
      </div>

      {showImport ? <ImportPanel onDone={refresh} /> : null}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table className="history-table">
            <thead>
              <tr><th>Date</th><th>Puzzle</th><th>Pieces</th><th>Time</th><th>Scaled</th><th>★</th><th></th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateFull(r.date)}</td>
                  <td>
                    {r.puzzleName || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    {r.brand ? <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · {r.brand}</span> : null}
                  </td>
                  <td>{r.pieces}</td>
                  <td className="mono">{formatDuration(r.timeSeconds)}</td>
                  <td className="mono">{formatDuration(Math.round(r.scaledTimeSeconds))}</td>
                  <td>{r.difficultyRating}</td>
                  <td>
                    {r.isPersonalBest ? <span className="chip">PB</span> : null}{' '}
                    {r.puzzleType !== 'solo' ? <span className="chip chip-muted">{r.puzzleType}</span> : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn" style={{ padding: '4px 10px', marginRight: 6 }} onClick={() => setEditing(r)}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: '4px 10px' }} onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
              {loaded && rows.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  No sessions yet — log your first puzzle!
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {editing ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Edit session" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="card modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3>Edit session</h3>
              <button className="btn" style={{ padding: '4px 10px' }} onClick={() => setEditing(null)}>✕</button>
            </div>
            <SolveForm
              submitLabel="Save changes"
              busy={busy}
              initial={{
                pieces: editing.pieces, time_seconds: editing.timeSeconds, date: editing.date,
                puzzle_name: editing.puzzleName, brand: editing.brand,
                difficulty_rating: editing.difficultyRating, notes: editing.notes, tags: editing.tags,
                puzzle_type: editing.puzzleType as SolveFormValues['puzzle_type'], first_attempt: editing.firstAttempt,
              }}
              onSubmit={saveEdit}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
