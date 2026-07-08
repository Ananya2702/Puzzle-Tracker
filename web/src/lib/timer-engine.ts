export const DEFAULT_PHASES = ['edge', 'sort', 'assembly'] as const;

export interface TimerSplit { phase: string; atSeconds: number }

export interface TimerState {
  status: 'idle' | 'running' | 'paused' | 'finished';
  startedAt: number | null; // epoch ms of the current running segment
  accumMs: number;          // ms accumulated across previous segments
  splits: TimerSplit[];
  phases: string[];
  pieces: number | null;
  puzzleName: string;
  brand: string;
}

export function idleState(): TimerState {
  return {
    status: 'idle', startedAt: null, accumMs: 0, splits: [],
    phases: [...DEFAULT_PHASES], pieces: null, puzzleName: '', brand: '',
  };
}

export function start(s: TimerState, now: number): TimerState {
  if (s.status === 'running' || s.status === 'paused') return s;
  return { ...idleState(), phases: s.phases.length ? [...s.phases] : [...DEFAULT_PHASES], pieces: s.pieces, puzzleName: s.puzzleName, brand: s.brand, status: 'running', startedAt: now };
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' || s.startedAt == null) return s;
  return { ...s, status: 'paused', startedAt: null, accumMs: s.accumMs + (now - s.startedAt) };
}

export function resume(s: TimerState, now: number): TimerState {
  if (s.status !== 'paused') return s;
  return { ...s, status: 'running', startedAt: now };
}

export function finish(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' && s.status !== 'paused') return s;
  return { ...pause(s, now), status: 'finished' };
}

export function elapsedMs(s: TimerState, now: number): number {
  return s.accumMs + (s.status === 'running' && s.startedAt != null ? now - s.startedAt : 0);
}

export const elapsedSeconds = (s: TimerState, now: number): number => Math.floor(elapsedMs(s, now) / 1000);

export function split(s: TimerState, now: number): TimerState {
  if (s.status !== 'running') return s;
  const atSeconds = elapsedSeconds(s, now);
  const last = s.splits[s.splits.length - 1];
  if (last && last.atSeconds === atSeconds) return s; // zero-second split — ignore
  const phase = s.phases[s.splits.length] ?? `phase ${s.splits.length + 1}`;
  return { ...s, splits: [...s.splits, { phase, atSeconds }] };
}

/** Per-phase durations (schema shape) from cumulative marks; includes the tail phase, drops it when empty. */
export function payloadSplits(s: TimerState, finalSeconds: number): Array<{ phase: string; seconds: number; position: number }> {
  const out: Array<{ phase: string; seconds: number; position: number }> = [];
  let prev = 0;
  for (const sp of s.splits) {
    const seconds = sp.atSeconds - prev;
    if (seconds <= 0) continue; // zero-duration mark (e.g. duplicate cumulative value) — skip, leave prev at the last emitted mark
    out.push({ phase: sp.phase, seconds, position: out.length });
    prev = sp.atSeconds;
  }
  const tail = finalSeconds - prev;
  if (tail > 0) {
    const phase = s.phases[s.splits.length] ?? `phase ${s.splits.length + 1}`;
    out.push({ phase, seconds: tail, position: out.length });
  }
  return out;
}

/** Compare against a PB's cumulative split seconds + total. */
export function pbComparison(
  s: TimerState,
  now: number,
  pbCumulative: number[],
  pbTotalSeconds: number,
): { splitDeltas: (number | null)[]; currentDelta: number | null; projectedFinish: number | null } {
  const splitDeltas = s.splits.map((sp, i) =>
    i < pbCumulative.length ? sp.atSeconds - pbCumulative[i] : null,
  );
  let currentDelta: number | null = null;
  const n = Math.min(s.splits.length, pbCumulative.length);
  if (n > 0) currentDelta = s.splits[n - 1].atSeconds - pbCumulative[n - 1];
  return {
    splitDeltas,
    currentDelta,
    projectedFinish: currentDelta == null ? null : pbTotalSeconds + currentDelta,
  };
}

export const serialize = (s: TimerState): string => JSON.stringify(s);

export function deserialize(raw: string | null): TimerState | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as TimerState;
    if (!['idle', 'running', 'paused', 'finished'].includes(p?.status)) return null;
    if (typeof p.accumMs !== 'number' || !Number.isFinite(p.accumMs)) return null;
    if (p.startedAt !== null && (typeof p.startedAt !== 'number' || !Number.isFinite(p.startedAt))) return null;
    if (!Array.isArray(p.splits) || !Array.isArray(p.phases)) return null;
    return {
      status: p.status, startedAt: p.startedAt, accumMs: p.accumMs,
      splits: p.splits, phases: p.phases,
      pieces: typeof p.pieces === 'number' ? p.pieces : null,
      puzzleName: typeof p.puzzleName === 'string' ? p.puzzleName : '',
      brand: typeof p.brand === 'string' ? p.brand : '',
    };
  } catch {
    return null;
  }
}
