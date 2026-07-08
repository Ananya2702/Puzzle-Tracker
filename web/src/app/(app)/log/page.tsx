'use client';

import { useState } from 'react';
import { postJSON, ApiError } from '@/lib/api-client';
import { formatDuration } from '@/lib/time';
import { fireConfetti } from '@/components/Confetti';
import { useToast } from '@/components/Toast';
import { SolveForm, type SolveFormValues } from '@/components/SolveForm';
import { QuickAdd } from './QuickAdd';

interface LogResponse {
  solve: { id: number; pieces: number; timeSeconds: number };
  newAchievements: string[];
  isPersonalBest: boolean;
}

export default function LogPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<'quick' | 'full'>('quick');
  const [busy, setBusy] = useState(false);

  async function log(values: Partial<SolveFormValues> & { pieces: number; time_seconds: number }) {
    setBusy(true);
    try {
      const res = await postJSON<LogResponse>('/api/solves', values);
      toast(`Logged ${res.solve.pieces}pc in ${formatDuration(res.solve.timeSeconds)}`);
      if (res.isPersonalBest) toast('New personal best! 🎉');
      if (res.newAchievements.length > 0) toast(`Achievement unlocked: ${res.newAchievements.length}`);
      if (res.isPersonalBest || res.newAchievements.length > 0) fireConfetti();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to log solve', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Log Puzzle</h1>
          <p className="desc">Record a completed session</p>
        </div>
        <button className="btn" onClick={() => setMode(mode === 'quick' ? 'full' : 'quick')}>
          {mode === 'quick' ? 'Full form' : 'Quick add'}
        </button>
      </div>
      <div className="card">
        {mode === 'quick'
          ? <QuickAdd onLog={log} busy={busy} />
          : <SolveForm submitLabel="Log puzzle" onSubmit={log} busy={busy} />}
      </div>
    </>
  );
}
