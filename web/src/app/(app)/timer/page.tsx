'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  idleState, start, pause, resume, finish, split as engineSplit,
  elapsedSeconds, payloadSplits, pbComparison, serialize, deserialize,
  type TimerState,
} from '@/lib/timer-engine';
import { getJSON, postJSON, ApiError } from '@/lib/api-client';
import { enqueueSolve } from '@/lib/offline-queue';
import { formatDuration, todayLocal } from '@/lib/time';
import { fireConfetti } from '@/components/Confetti';
import { useToast } from '@/components/Toast';
import { FinishDialog, type FinishValues } from './FinishDialog';
import './timer.css';

interface PbPayload {
  pb: { solve: { timeSeconds: number }; cumulative: number[]; totalSeconds: number } | null;
}
interface LogResponse { newAchievements: string[]; isPersonalBest: boolean }

const STORAGE_KEY = 'pg-timer';
const signed = (d: number) => `${d <= 0 ? '−' : '+'}${formatDuration(Math.abs(d))}`;

export default function TimerPage() {
  const { toast } = useToast();
  const [state, setState] = useState<TimerState>(idleState);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pieces, setPieces] = useState(500);
  const [puzzleName, setPuzzleName] = useState('');
  const [brand, setBrand] = useState('');
  const [pb, setPb] = useState<PbPayload['pb']>(null);
  const [finished, setFinished] = useState<TimerState | null>(null);
  const [busy, setBusy] = useState(false);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  // Restore a crashed/reloaded session.
  useEffect(() => {
    const saved = deserialize(localStorage.getItem(STORAGE_KEY));
    if (saved && (saved.status === 'running' || saved.status === 'paused')) {
      setState(saved);
      if (saved.pieces) setPieces(saved.pieces);
      toast('Resumed your solve in progress');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick + persist while active.
  useEffect(() => {
    if (state.status !== 'running' && state.status !== 'paused') return;
    const id = setInterval(() => {
      setNowMs(Date.now());
      localStorage.setItem(STORAGE_KEY, serialize(state));
    }, 500);
    return () => clearInterval(id);
  }, [state]);

  // Screen wake lock while running.
  useEffect(() => {
    async function acquire() {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        if (state.status === 'running' && nav.wakeLock) {
          wakeLock.current = await nav.wakeLock.request('screen');
        }
      } catch { /* wake lock is best-effort */ }
    }
    void acquire();
    const onVis = () => { if (document.visibilityState === 'visible' && state.status === 'running') void acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    };
  }, [state.status]);

  // PB for the chosen size.
  useEffect(() => {
    void getJSON<PbPayload>(`/api/solves/pb?pieces=${pieces}`).then((r) => setPb(r.pb)).catch(() => setPb(null));
  }, [pieces]);

  const transition = useCallback((next: TimerState) => {
    setState(next);
    localStorage.setItem(STORAGE_KEY, serialize(next));
  }, []);

  function onStart() {
    transition(start({ ...idleState(), pieces, puzzleName, brand }, Date.now()));
  }
  function onSplit() { transition(engineSplit(state, Date.now())); }
  function onPauseResume() {
    transition(state.status === 'running' ? pause(state, Date.now()) : resume(state, Date.now()));
  }
  function onFinish() {
    const f = finish(state, Date.now());
    transition(f);
    setFinished(f);
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    setFinished(null);
    setState(idleState());
    setPuzzleName('');
    setBrand('');
  }

  async function save(v: FinishValues) {
    if (!finished) return;
    const finalSeconds = Math.max(1, elapsedSeconds(finished, Date.now()));
    const body = {
      pieces: v.pieces, time_seconds: finalSeconds, date: todayLocal(),
      puzzle_name: v.puzzle_name, brand: v.brand, difficulty_rating: v.difficulty_rating,
      notes: v.notes, puzzle_type: 'solo' as const, first_attempt: false,
      splits: payloadSplits(finished, finalSeconds),
    };
    setBusy(true);
    try {
      const res = await postJSON<LogResponse>('/api/solves', body);
      toast(`Solve saved — ${formatDuration(finalSeconds)}`);
      if (res.isPersonalBest) toast('New personal best! 🎉');
      if (res.newAchievements.length > 0) toast(`Achievement unlocked: ${res.newAchievements.length}`);
      if (res.isPersonalBest || res.newAchievements.length > 0) fireConfetti();
      resetAll();
    } catch (e) {
      if (e instanceof ApiError) {
        toast(e.message, 'error'); // server rejected — keep dialog open for correction
      } else {
        enqueueSolve(body); // network failure (fetch TypeError) — queue for OfflineSync
        toast('Saved offline — will sync when you reconnect');
        resetAll();
      }
    } finally {
      setBusy(false);
    }
  }

  const active = state.status === 'running' || state.status === 'paused';
  const elapsed = elapsedSeconds(state, nowMs);
  const cmp = pb ? pbComparison(state, nowMs, pb.cumulative, pb.totalSeconds) : null;

  return (
    <div className="cockpit">
      <div className="page-head" style={{ textAlign: 'center' }}>
        <h1>Stopwatch</h1>
        <p className="desc">Time your session live</p>
      </div>

      {!active ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="tm-pieces">Pieces</label>
              <input id="tm-pieces" type="number" min={1} value={pieces}
                onChange={(e) => { const v = Number(e.target.value); if (v > 0) setPieces(v); }} />
            </div>
            <div className="field">
              <label>Personal best at this size</label>
              <div className="mono" style={{ padding: '10px 0' }}>
                {pb ? formatDuration(pb.totalSeconds) : '—'}
              </div>
            </div>
            <div className="field">
              <label htmlFor="tm-name">Puzzle name</label>
              <input id="tm-name" value={puzzleName} onChange={(e) => setPuzzleName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tm-brand">Brand</label>
              <input id="tm-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="clock" aria-live="off">{formatDuration(elapsed)}</div>
      <div className="clock-sub">
        {state.status === 'paused' ? 'Paused' :
          cmp?.currentDelta != null ? <span className={cmp.currentDelta <= 0 ? 'delta-ahead' : 'delta-behind'}>
            {signed(cmp.currentDelta)} vs PB at last split
          </span> : active ? `${pieces}pc solo` : 'Ready when you are'}
      </div>

      <div className="phase-row">
        {state.phases.map((phase, i) => {
          const done = state.splits[i];
          const isCurrent = active && i === state.splits.length;
          const delta = cmp?.splitDeltas[i];
          return (
            <div key={phase} className={`phase-chip${done ? ' done' : ''}${isCurrent ? ' current' : ''}`}>
              {done ? '✔ ' : ''}{phase}
              {done ? (
                <span className="t">
                  {formatDuration(done.atSeconds)}
                  {delta != null ? <span className={delta <= 0 ? 'delta-ahead' : 'delta-behind'}> {signed(delta)}</span> : null}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="cockpit-stats">
        <div className="cell"><span className="v">{state.splits.length}</span><span className="l">splits</span></div>
        <div className="cell">
          <span className="v">{cmp?.projectedFinish != null ? formatDuration(cmp.projectedFinish) : '—'}</span>
          <span className="l">proj. finish</span>
        </div>
        <div className="cell">
          <span className={`v ${cmp?.currentDelta != null ? (cmp.currentDelta <= 0 ? 'delta-ahead' : 'delta-behind') : ''}`}>
            {cmp?.currentDelta != null ? signed(cmp.currentDelta) : '—'}
          </span>
          <span className="l">vs PB</span>
        </div>
      </div>

      <div className="cockpit-controls">
        {!active ? (
          <button className="btn btn-primary btn-big" onClick={onStart}>▶ Start solve</button>
        ) : (
          <>
            <button className="btn btn-primary btn-big" onClick={onSplit} disabled={state.status !== 'running'}>✔ Split</button>
            <button className="btn btn-big" onClick={onPauseResume}>
              {state.status === 'running' ? '⏸ Pause' : '▶ Resume'}
            </button>
            <button className="btn btn-danger btn-big" onClick={onFinish}>■ Finish</button>
          </>
        )}
      </div>

      {finished ? (
        <FinishDialog
          finalSeconds={Math.max(1, elapsedSeconds(finished, nowMs))}
          initialPieces={finished.pieces ?? pieces}
          initialName={finished.puzzleName}
          initialBrand={finished.brand}
          busy={busy}
          onSave={save}
          onDiscard={resetAll}
        />
      ) : null}
    </div>
  );
}
