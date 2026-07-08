'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJSON, postJSON, deleteJSON, ApiError } from '@/lib/api-client';
import { parseDuration, formatDuration } from '@/lib/time';
import { fmtDateFull } from '@/lib/format';
import type { Statistics } from '@/lib/stats';
import { useToast } from '@/components/Toast';

interface Goal {
  id: number; pieces: number; targetTimeSeconds: number; description: string;
  achieved: boolean; achievedDate: string | null;
}

export default function GoalsPage() {
  const { toast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [pbs, setPbs] = useState<Record<number, number>>({});
  const [timeText, setTimeText] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setGoals(await getJSON<Goal[]>('/api/goals'));
    setPbs((await getJSON<Statistics>('/api/statistics')).personal_bests);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const target = parseDuration(timeText);
    if (target == null || target <= 0) return toast('Target time must look like 1:00:00 or minutes', 'error');
    setBusy(true);
    try {
      await postJSON('/api/goals', {
        pieces: Number(f.get('pieces')),
        target_time_seconds: target,
        description: String(f.get('description') ?? ''),
      });
      toast('Goal added');
      setTimeText('');
      (e.target as HTMLFormElement).reset();
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to add goal', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: Goal) {
    await deleteJSON(`/api/goals/${g.id}`).catch(() => toast('Delete failed', 'error'));
    await refresh();
  }

  return (
    <>
      <div className="page-head"><h1>Goals</h1><p className="desc">Set targets, track progress</p></div>

      <form className="card" onSubmit={add} style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="g-pieces">Pieces</label>
            <input id="g-pieces" name="pieces" type="number" min={1} required defaultValue={500} />
          </div>
          <div className="field">
            <label htmlFor="g-time">Target time</label>
            <input id="g-time" value={timeText} onChange={(e) => setTimeText(e.target.value)} placeholder="1:00:00" required />
          </div>
          <div className="field">
            <label htmlFor="g-desc">Description</label>
            <input id="g-desc" name="description" placeholder="sub-hour 500" />
          </div>
        </div>
        <button className="btn btn-primary" disabled={busy} style={{ marginTop: 14 }}>Add goal</button>
      </form>

      {goals.map((g) => (
        <div className="card" key={g.id} style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <strong>{g.pieces}pc under {formatDuration(g.targetTimeSeconds)}</strong>
            {g.description ? <span style={{ color: 'var(--text-muted)' }}> — {g.description}</span> : null}
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {g.achieved
                ? <span className="chip">Achieved {g.achievedDate ? fmtDateFull(g.achievedDate) : ''}</span>
                : pbs[g.pieces]
                  ? `Current PB ${formatDuration(pbs[g.pieces])} — ${pbs[g.pieces] - g.targetTimeSeconds > 0 ? formatDuration(pbs[g.pieces] - g.targetTimeSeconds) + ' to shave' : 'within reach!'}`
                  : 'No solves at this size yet'}
            </div>
          </div>
          <button className="btn btn-danger" onClick={() => remove(g)}>Delete</button>
        </div>
      ))}
      {goals.length === 0 ? <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No goals yet — aim at something!</div> : null}
    </>
  );
}
