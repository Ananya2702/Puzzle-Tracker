# Puzzle Geeks Revamp — Plan 3 of 3: Cockpit Timer, PWA, Migration & Cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the last Phase-1 pieces: the live cockpit timer (splits, PB deltas, projected finish, wake lock, crash-proof resume), PWA installability with an offline solve queue, the one-time legacy-data migration into a fresh database, and the Vercel cutover runbook.

**Architecture:** The timer is a pure, serializable state machine (`timer-engine.ts`, fully unit-tested with injected clocks) driven by a client page; persistence is a localStorage snapshot every tick. Splits ride along on the existing `POST /api/solves` (schema already has the `splits` table). Offline resilience is a localStorage queue flushed on reconnect — no background-sync complexity. The migration targets a **separate database in the same Neon project** because the legacy Flask tables (`users`, `puzzles`, `goals`, `achievements`, `settings`) collide by name with the new schema; the script is a transaction-wrapped, dry-runnable node program rehearsed by a dual-PGlite integration test.

**Tech Stack:** Existing stack + devDeps `tsx` (run the migration script) and `sharp` (render PWA icons once, committed). Hand-written service worker (no workbox).

## Global Constraints

- All work under `web/` except the runbook + README edits named in Task 7. npm; TS strict; NO Tailwind/CSS-in-JS.
- Durations integer seconds; dates `YYYY-MM-DD`; client-side "today" is ALWAYS `todayLocal()` from `@/lib/time`; `todayISO()` (UTC) stays server-side.
- Timer localStorage key exactly `pg-timer`; offline queue key exactly `pg-solve-queue`; default phases exactly `['edge', 'sort', 'assembly']`.
- Splits are stored per-phase (`seconds` = duration of that phase, `position` = 0-based order); the engine tracks cumulative `atSeconds` and converts at submit time.
- Service worker NEVER caches `/api/*`; registration only in production builds.
- Every task: full `npm test` + `npm run lint` (no NEW warnings; 6 accepted `_req` warnings exist) + `npx tsc --noEmit` clean before commit; tasks touching pages/config also run `npm run build`.
- Commits conventional, ending: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure (end state)

```
web/src/lib/
  timer-engine.ts          # pure state machine + PB delta/projection math
  offline-queue.ts         # enqueueSolve/flushSolveQueue (localStorage)
  __tests__/timer-engine.test.ts  __tests__/offline-queue.test.ts
web/src/app/api/solves/pb/route.ts   # GET ?pieces=N → PB solve + splits
web/src/app/(app)/timer/
  page.tsx                 # cockpit UI (replaces placeholder)
  timer.css
  FinishDialog.tsx
web/src/components/
  ServiceWorkerRegister.tsx  OfflineSync.tsx
web/public/
  manifest.webmanifest  sw.js  icons/icon.svg  icons/icon-192.png  icons/icon-512.png  icons/apple-touch-icon.png
web/scripts/
  gen-icons.mjs            # one-shot sharp render (icons committed)
  migrate-legacy.ts        # legacy Neon DB → new DB
web/src/lib/migrate-legacy-core.ts   # the testable migration core
web/src/lib/__tests__/migrate-legacy.test.ts  # dual-PGlite rehearsal
web/MIGRATION.md           # cutover runbook
web/e2e/timer.spec.ts
```

---

### Task 1: Timer engine (pure, TDD)

**Files:**
- Create: `web/src/lib/timer-engine.ts`
- Test: `web/src/lib/__tests__/timer-engine.test.ts`

**Interfaces:**
- Produces (all from `@/lib/timer-engine`):
  - `DEFAULT_PHASES = ['edge', 'sort', 'assembly'] as const`
  - `interface TimerSplit { phase: string; atSeconds: number }` (cumulative)
  - `interface TimerState { status: 'idle' | 'running' | 'paused' | 'finished'; startedAt: number | null; accumMs: number; splits: TimerSplit[]; phases: string[]; pieces: number | null; puzzleName: string; brand: string }`
  - `idleState(): TimerState`
  - `start(s: TimerState, now: number): TimerState` (idle/finished → fresh running)
  - `pause(s, now)`, `resume(s, now)`, `finish(s, now): TimerState` (running|paused → finished with accumMs frozen)
  - `elapsedMs(s, now): number`; `elapsedSeconds(s, now): number` (floor)
  - `split(s, now): TimerState` — running only; phase name = `s.phases[s.splits.length]` or `phase ${n+1}` beyond the plan; cumulative `atSeconds = elapsedSeconds`
  - `payloadSplits(s, finalSeconds: number): Array<{ phase: string; seconds: number; position: number }>` — per-phase durations from cumulative marks; the FINAL phase (after the last split, or the whole solve if no splits) is included as the next planned phase name with `seconds = finalSeconds - lastAt` (skipped if ≤ 0)
  - `pbComparison(s, now, pbCumulative: number[], pbTotalSeconds: number): { splitDeltas: (number | null)[]; currentDelta: number | null; projectedFinish: number | null }` — `splitDeltas[i] = splits[i].atSeconds - pbCumulative[i]` (null when PB lacks that split); `currentDelta` = delta at the LAST recorded split (null before first split); `projectedFinish = pbTotalSeconds + currentDelta` (null when currentDelta null)
  - `serialize(s): string`; `deserialize(raw: string | null): TimerState | null` (null on parse/shape failure — validates status is one of the four values and numbers are finite)

- [ ] **Step 1: Write the failing test**

`web/src/lib/__tests__/timer-engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  idleState, start, pause, resume, finish, split,
  elapsedSeconds, payloadSplits, pbComparison, serialize, deserialize,
  DEFAULT_PHASES,
} from '@/lib/timer-engine';

const T0 = 1_000_000; // arbitrary epoch ms

describe('timer lifecycle', () => {
  it('starts, runs, pauses, resumes, finishes with correct elapsed', () => {
    let s = start(idleState(), T0);
    expect(s.status).toBe('running');
    expect(elapsedSeconds(s, T0 + 5_000)).toBe(5);
    s = pause(s, T0 + 5_000);
    expect(elapsedSeconds(s, T0 + 60_000)).toBe(5); // frozen while paused
    s = resume(s, T0 + 60_000);
    expect(elapsedSeconds(s, T0 + 62_000)).toBe(7);
    s = finish(s, T0 + 62_000);
    expect(s.status).toBe('finished');
    expect(elapsedSeconds(s, T0 + 999_000)).toBe(7);
  });

  it('start from finished begins a fresh solve', () => {
    let s = finish(start(idleState(), T0), T0 + 10_000);
    s = start(s, T0 + 20_000);
    expect(s.splits).toEqual([]);
    expect(elapsedSeconds(s, T0 + 21_000)).toBe(1);
  });

  it('pause/resume/split are no-ops in wrong states', () => {
    const idle = idleState();
    expect(pause(idle, T0)).toBe(idle);
    expect(resume(idle, T0)).toBe(idle);
    expect(split(idle, T0)).toBe(idle);
  });
});

describe('splits', () => {
  it('names splits from the phase plan, then generic', () => {
    let s = start(idleState(), T0);
    s = split(s, T0 + 60_000);
    s = split(s, T0 + 120_000);
    s = split(s, T0 + 180_000);
    s = split(s, T0 + 240_000);
    expect(s.splits.map((x) => x.phase)).toEqual(['edge', 'sort', 'assembly', 'phase 4']);
    expect(s.splits.map((x) => x.atSeconds)).toEqual([60, 120, 180, 240]);
  });

  it('payloadSplits converts cumulative to per-phase durations incl. the tail', () => {
    let s = start(idleState(), T0);
    s = split(s, T0 + 60_000);   // edge at 60
    s = split(s, T0 + 150_000);  // sort at 150
    expect(payloadSplits(s, 400)).toEqual([
      { phase: 'edge', seconds: 60, position: 0 },
      { phase: 'sort', seconds: 90, position: 1 },
      { phase: 'assembly', seconds: 250, position: 2 }, // tail: 400-150
    ]);
  });

  it('payloadSplits with no splits yields a single full-solve phase', () => {
    const s = start(idleState(), T0);
    expect(payloadSplits(s, 300)).toEqual([{ phase: 'edge', seconds: 300, position: 0 }]);
  });

  it('payloadSplits drops a zero-length tail', () => {
    let s = start(idleState(), T0);
    s = split(s, T0 + 60_000);
    expect(payloadSplits(s, 60)).toEqual([{ phase: 'edge', seconds: 60, position: 0 }]);
  });
});

describe('pbComparison', () => {
  it('deltas per split, current delta, projected finish', () => {
    let s = start(idleState(), T0);
    s = split(s, T0 + 50_000);  // 50 vs PB 60 → -10
    s = split(s, T0 + 130_000); // 130 vs PB 120 → +10
    const c = pbComparison(s, T0 + 140_000, [60, 120, 300], 400);
    expect(c.splitDeltas).toEqual([-10, 10]);
    expect(c.currentDelta).toBe(10);
    expect(c.projectedFinish).toBe(410);
  });

  it('null before first split and when PB lacks the split', () => {
    let s = start(idleState(), T0);
    expect(pbComparison(s, T0 + 10_000, [60], 400).currentDelta).toBeNull();
    s = split(s, T0 + 50_000);
    s = split(s, T0 + 90_000);
    const c = pbComparison(s, T0 + 91_000, [60], 400);
    expect(c.splitDeltas).toEqual([-10, null]);
    expect(c.currentDelta).toBe(-10); // falls back to the last split BOTH sides have
    expect(c.projectedFinish).toBe(390);
  });
});

describe('serialize/deserialize', () => {
  it('round-trips a running state', () => {
    let s = start(idleState(), T0);
    s = split(s, T0 + 60_000);
    const back = deserialize(serialize(s));
    expect(back).toEqual(s);
  });
  it('rejects garbage', () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{"status":"warp"}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `web/`): `npx vitest run src/lib/__tests__/timer-engine.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `web/src/lib/timer-engine.ts`**

```ts
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
  const phase = s.phases[s.splits.length] ?? `phase ${s.splits.length + 1}`;
  return { ...s, splits: [...s.splits, { phase, atSeconds: elapsedSeconds(s, now) }] };
}

/** Per-phase durations (schema shape) from cumulative marks; includes the tail phase, drops it when empty. */
export function payloadSplits(s: TimerState, finalSeconds: number): Array<{ phase: string; seconds: number; position: number }> {
  const out: Array<{ phase: string; seconds: number; position: number }> = [];
  let prev = 0;
  for (const [i, sp] of s.splits.entries()) {
    out.push({ phase: sp.phase, seconds: sp.atSeconds - prev, position: i });
    prev = sp.atSeconds;
  }
  const tail = finalSeconds - prev;
  if (tail > 0) {
    const phase = s.phases[s.splits.length] ?? `phase ${s.splits.length + 1}`;
    out.push({ phase, seconds: tail, position: s.splits.length });
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
  for (let i = Math.min(s.splits.length, pbCumulative.length) - 1; i >= 0; i--) {
    currentDelta = s.splits[i].atSeconds - pbCumulative[i];
    break;
  }
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
```

Note the unused-loop shape in `pbComparison` (`for … { …; break; }`) — write it as a simple `if` instead if lint complains:
`const n = Math.min(s.splits.length, pbCumulative.length); if (n > 0) currentDelta = s.splits[n - 1].atSeconds - pbCumulative[n - 1];`
(Use this `if` form — it is the intended implementation; the test expectations above define the behavior.)

- [ ] **Step 4: Run to verify pass**, then full gate:

```bash
npx vitest run src/lib/__tests__/timer-engine.test.ts
npm test && npm run lint && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd .. && git add web && git commit -m "feat: pure timer engine with splits, PB deltas, serialization

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Splits through the API + PB endpoint (TDD)

**Files:**
- Modify: `web/src/lib/solves.ts` (solveInputSchema + addSolve insert splits)
- Create: `web/src/app/api/solves/pb/route.ts`
- Test: modify `web/src/lib/__tests__/solves.test.ts` (add cases), create `web/src/app/api/__tests__/pb.test.ts`

**Interfaces:**
- Consumes: `splits` table from `@/db/schema` (solveId FK cascade, phase text, seconds int, position int default 0).
- Produces:
  - `solveInputSchema` gains optional `splits: z.array(z.object({ phase: z.string().min(1).max(40), seconds: z.number().int().positive(), position: z.number().int().min(0) })).max(20).optional()`.
  - `addSolve` inserts them (solveId = new solve id) when present.
  - `GET /api/solves/pb?pieces=N` → 200 `{ pb: null }` when no PB at that size, else `{ pb: { solve: SolveRow, splits: [{phase, seconds, position}...ordered], cumulative: number[], totalSeconds: number } }`. Non-integer/absent pieces → 400.

- [ ] **Step 1: Add failing service tests** (append to `web/src/lib/__tests__/solves.test.ts`)

```ts
import { splits as splitsTable } from '@/db/schema';

describe('splits in addSolve', () => {
  it('persists provided splits against the new solve', async () => {
    const { db, uid } = await seed();
    const { solve } = await addSolve(db, uid, {
      pieces: 500, time_seconds: 400,
      splits: [
        { phase: 'edge', seconds: 60, position: 0 },
        { phase: 'sort', seconds: 90, position: 1 },
        { phase: 'assembly', seconds: 250, position: 2 },
      ],
    }, TODAY);
    const rows = await db.select().from(splitsTable).where(eq(splitsTable.solveId, solve.id));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.phase).sort()).toEqual(['assembly', 'edge', 'sort']);
  });

  it('rejects malformed splits', async () => {
    const { db, uid } = await seed();
    await expect(addSolve(db, uid, {
      pieces: 500, time_seconds: 400, splits: [{ phase: '', seconds: 0, position: 0 }],
    }, TODAY)).rejects.toThrow();
  });
});
```

(The existing test file already imports `eq`; the `seed`/`TODAY` helpers exist there.)

- [ ] **Step 2: Run → FAIL**, then modify `web/src/lib/solves.ts`:

Add to the schema object (after `first_attempt`):

```ts
  splits: z.array(z.object({
    phase: z.string().min(1).max(40),
    seconds: z.number().int().positive(),
    position: z.number().int().min(0),
  })).max(20).optional(),
```

In `addSolve`, import `splits as splitsTable` from `@/db/schema`, and after the solve insert (before `updatePersonalBests`):

```ts
  if (input.splits?.length) {
    await db.insert(splitsTable).values(
      input.splits.map((sp) => ({ solveId: inserted.id, phase: sp.phase, seconds: sp.seconds, position: sp.position })),
    );
  }
```

Also: the hand-written `solveUpdateSchema` must NOT accept splits (edits don't touch splits in Phase 1) — leave it unchanged, and if it was derived field-by-field just don't add the key.

Run the service tests → pass.

- [ ] **Step 3: Write failing PB route test**

`web/src/app/api/__tests__/pb.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { addSolve } from '@/lib/solves';

const state: {
  db: Awaited<ReturnType<typeof makeTestDb>> | null;
  session: { user: { id: string } } | null;
} = { db: null, session: null };

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => state.db!,
}));
vi.mock('@/auth', () => ({ auth: async () => state.session }));

import { GET } from '@/app/api/solves/pb/route';

const get = (qs: string) => GET(new Request(`http://t/api/solves/pb${qs}`));

describe('GET /api/solves/pb', () => {
  beforeEach(async () => {
    state.db = await makeTestDb();
    const u = await createUser(state.db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
  });

  it('400 without a valid pieces param', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?pieces=abc')).status).toBe(400);
  });

  it('pb: null when no solve at that size', async () => {
    expect(await (await get('?pieces=500')).json()).toEqual({ pb: null });
  });

  it('returns the PB solve with ordered splits, cumulative, total', async () => {
    const uid = Number(state.session!.user.id);
    await addSolve(state.db!, uid, { pieces: 500, time_seconds: 500 }, '2026-07-01');
    await addSolve(state.db!, uid, {
      pieces: 500, time_seconds: 400,
      splits: [
        { phase: 'edge', seconds: 60, position: 0 },
        { phase: 'sort', seconds: 90, position: 1 },
        { phase: 'assembly', seconds: 250, position: 2 },
      ],
    }, '2026-07-02');
    const body = await (await get('?pieces=500')).json();
    expect(body.pb.solve.timeSeconds).toBe(400);
    expect(body.pb.splits.map((s: { phase: string }) => s.phase)).toEqual(['edge', 'sort', 'assembly']);
    expect(body.pb.cumulative).toEqual([60, 150, 400]);
    expect(body.pb.totalSeconds).toBe(400);
  });
});
```

- [ ] **Step 4: Run → FAIL**, then create `web/src/app/api/solves/pb/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { solves, splits } from '@/db/schema';

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const pieces = Number(new URL(req.url).searchParams.get('pieces'));
  if (!Number.isInteger(pieces) || pieces <= 0) {
    return NextResponse.json({ error: 'pieces must be a positive integer' }, { status: 400 });
  }
  const db = getDb();
  const [pb] = await db
    .select()
    .from(solves)
    .where(and(eq(solves.userId, userId), eq(solves.pieces, pieces), eq(solves.isPersonalBest, true)));
  if (!pb) return NextResponse.json({ pb: null });
  const rows = await db
    .select({ phase: splits.phase, seconds: splits.seconds, position: splits.position })
    .from(splits)
    .where(eq(splits.solveId, pb.id))
    .orderBy(asc(splits.position));
  const cumulative: number[] = [];
  let acc = 0;
  for (const r of rows) {
    acc += r.seconds;
    cumulative.push(acc);
  }
  return NextResponse.json({ pb: { solve: pb, splits: rows, cumulative, totalSeconds: pb.timeSeconds } });
}
```

- [ ] **Step 5: Full gate + build, commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: splits persisted with solves; PB-with-splits endpoint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: PWA foundation — manifest, icons, service worker, offline queue (TDD for the queue)

**Files:**
- Create: `web/public/manifest.webmanifest`, `web/public/sw.js`, `web/public/icons/icon.svg`, `web/scripts/gen-icons.mjs` (+ the three generated PNGs, committed), `web/src/components/ServiceWorkerRegister.tsx`, `web/src/components/OfflineSync.tsx`, `web/src/lib/offline-queue.ts`
- Modify: `web/src/app/layout.tsx` (metadata + mount ServiceWorkerRegister), `web/src/app/(app)/layout.tsx` (mount OfflineSync), `web/package.json` (devDep sharp + `icons` script)
- Test: `web/src/lib/__tests__/offline-queue.test.ts`

**Interfaces:**
- Produces:
  - `enqueueSolve(body: unknown): void`; `queuedSolveCount(): number`; `flushSolveQueue(post?: (url: string, body: unknown) => Promise<unknown>): Promise<{ sent: number; remaining: number }>` from `@/lib/offline-queue` — localStorage key `pg-solve-queue`; flush POSTs each to `/api/solves`, keeps failures in order, is safe to call with no queue and outside the browser (no-ops).
  - `<ServiceWorkerRegister />` (root layout; registers `/sw.js` only when `process.env.NODE_ENV === 'production'`).
  - `<OfflineSync />` ((app) layout; flushes on mount and on `online` events; toasts "Synced N offline solve(s)" via useToast).

- [ ] **Step 1: Write failing queue tests**

`web/src/lib/__tests__/offline-queue.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueueSolve, flushSolveQueue, queuedSolveCount } from '@/lib/offline-queue';

// vitest node env has no localStorage — install a minimal shim
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
});

describe('offline solve queue', () => {
  it('enqueues and counts', () => {
    expect(queuedSolveCount()).toBe(0);
    enqueueSolve({ pieces: 500, time_seconds: 100 });
    enqueueSolve({ pieces: 300, time_seconds: 200 });
    expect(queuedSolveCount()).toBe(2);
  });

  it('flush posts each in order and clears', async () => {
    enqueueSolve({ n: 1 });
    enqueueSolve({ n: 2 });
    const post = vi.fn().mockResolvedValue({});
    const res = await flushSolveQueue(post);
    expect(res).toEqual({ sent: 2, remaining: 0 });
    expect(post.mock.calls.map((c) => c[1])).toEqual([{ n: 1 }, { n: 2 }]);
    expect(post.mock.calls.every((c) => c[0] === '/api/solves')).toBe(true);
    expect(queuedSolveCount()).toBe(0);
  });

  it('keeps failures (and everything after the first failure order-preserved)', async () => {
    enqueueSolve({ n: 1 });
    enqueueSolve({ n: 2 });
    enqueueSolve({ n: 3 });
    const post = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('offline again'))
      .mockResolvedValueOnce({});
    const res = await flushSolveQueue(post);
    expect(res.sent).toBe(2);
    expect(res.remaining).toBe(1);
    expect(queuedSolveCount()).toBe(1);
  });

  it('no-ops safely with an empty queue', async () => {
    expect(await flushSolveQueue(vi.fn())).toEqual({ sent: 0, remaining: 0 });
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement `web/src/lib/offline-queue.ts`:

```ts
import { postJSON } from './api-client';

const KEY = 'pg-solve-queue';

function read(): unknown[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(items: unknown[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueueSolve(body: unknown): void {
  write([...read(), body]);
}

export function queuedSolveCount(): number {
  return read().length;
}

/** POST queued solves in order; failures stay queued (order preserved). */
export async function flushSolveQueue(
  post: (url: string, body: unknown) => Promise<unknown> = postJSON,
): Promise<{ sent: number; remaining: number }> {
  const items = read();
  if (items.length === 0) return { sent: 0, remaining: 0 };
  const failed: unknown[] = [];
  let sent = 0;
  for (const item of items) {
    try {
      await post('/api/solves', item);
      sent++;
    } catch {
      failed.push(item);
    }
  }
  write(failed);
  return { sent, remaining: failed.length };
}
```

Run queue tests → pass.

- [ ] **Step 3: Manifest, icon source, icon script**

`web/public/manifest.webmanifest`:

```json
{
  "name": "Puzzle Geeks",
  "short_name": "PuzzleGeeks",
  "description": "Track your speed puzzling. Beat your times.",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#0b0e14",
  "theme_color": "#0b0e14",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

`web/public/icons/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0b0e14"/>
  <path d="M176 128h64v32a24 24 0 0 0 48 0v-32h64a16 16 0 0 1 16 16v64h32a24 24 0 0 1 0 48h-32v64a16 16 0 0 1-16 16h-64v-32a24 24 0 0 0-48 0v32h-64a16 16 0 0 1-16-16v-64h-32a24 24 0 0 1 0-48h32v-64a16 16 0 0 1 16-16z" fill="#7ee787"/>
</svg>
```

`web/scripts/gen-icons.mjs`:

```js
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url));
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  await sharp(svg).resize(size, size).png().toFile(new URL(`../public/icons/${name}`, import.meta.url).pathname);
  console.log('wrote', name);
}
```

```bash
cd web && npm i -D sharp && node scripts/gen-icons.mjs
```

Add script `"icons": "node scripts/gen-icons.mjs"` to package.json. Commit the generated PNGs.

- [ ] **Step 4: Service worker + registration + sync components**

`web/public/sw.js`:

```js
/* Puzzle Geeks service worker: app shell offline, network-first pages, API never cached. */
const VERSION = 'pg-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // network-first pages with cache fallback (keeps the timer usable offline)
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request, { cacheName: PAGE_CACHE })),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      caches.match(request, { cacheName: STATIC_CACHE }).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
  }
});
```

`web/src/components/ServiceWorkerRegister.tsx`:

```tsx
'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
```

`web/src/components/OfflineSync.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { flushSolveQueue, queuedSolveCount } from '@/lib/offline-queue';
import { useToast } from './Toast';

export function OfflineSync() {
  const { toast } = useToast();
  useEffect(() => {
    async function sync() {
      if (queuedSolveCount() === 0) return;
      const { sent } = await flushSolveQueue();
      if (sent > 0) toast(`Synced ${sent} offline solve${sent > 1 ? 's' : ''}`);
    }
    void sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [toast]);
  return null;
}
```

Wire up:
- Root layout `web/src/app/layout.tsx`: extend metadata — add to the existing `metadata` object: `manifest: '/manifest.webmanifest'`, `appleWebApp: { capable: true, title: 'Puzzle Geeks', statusBarStyle: 'black-translucent' }`, `icons: { apple: '/icons/apple-touch-icon.png' }`; add `export const viewport = { themeColor: '#0b0e14' }` (Next 15 wants themeColor in viewport). Render `<ServiceWorkerRegister />` just inside `<body>` (before ThemeProvider is fine).
- `(app)` layout: render `<OfflineSync />` inside ToastProvider (next to ConfettiCanvas).

- [ ] **Step 5: Gate + commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: PWA manifest, icons, service worker, offline solve queue

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Cockpit timer page

**Files:**
- Create: `web/src/app/(app)/timer/timer.css`, `web/src/app/(app)/timer/FinishDialog.tsx`
- Modify: `web/src/app/(app)/timer/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: the entire Task-1 engine; `GET /api/solves/pb?pieces=N` (Task 2 shape); `postJSON`/`ApiError`; `enqueueSolve`; `fireConfetti`; `useToast`; `formatDuration`, `todayLocal`; forms.css classes.
- Produces: the working /timer cockpit. Behavior contract:
  - Setup card (idle/finished): pieces (number input, default 500, drives PB fetch on change), optional puzzle name/brand, phase plan display (read-only chips of DEFAULT_PHASES), big START button.
  - Running/paused: giant mono clock (ticks via 500ms interval reading `elapsedSeconds`); phase chips — done splits show their cumulative time + delta vs PB (green negative / red positive via `.delta-ahead`/`.delta-behind`); current phase highlighted; stat row: current split count, projected finish (`formatDuration` or '—'), delta vs PB (`±m:ss` or '—'); buttons SPLIT (primary, running only), PAUSE/RESUME, FINISH (danger).
  - Wake lock: request `navigator.wakeLock?.request('screen')` while running; release on pause/finish/unmount; re-request on `visibilitychange` when visible && running. All guarded — wakeLock is optional.
  - Persistence: every tick AND on every state transition, `localStorage.setItem('pg-timer', serialize(state))`; on mount, `deserialize(localStorage.getItem('pg-timer'))` — if it's a running/paused state, restore it directly (elapsed keeps counting from epoch math — that's the crash-proof property).
  - FINISH opens FinishDialog: shows final time; requires pieces (prefilled); optional name/brand/difficulty/notes; on save → POST `/api/solves` with `{ pieces, time_seconds, date: todayLocal(), puzzle_name, brand, difficulty_rating, notes, puzzle_type: 'solo', first_attempt: false, splits: payloadSplits(state, finalSeconds) }`; success → toast + confetti on PB/achievements (same contract as Log page) + clear `pg-timer` + reset to idle; network failure (ApiError with status 0/undefined is NOT how fetch fails — a thrown TypeError from fetch means offline) → `enqueueSolve(body)` + toast 'Saved offline — will sync when you reconnect' + clear + reset; ApiError (server rejected) → error toast, keep dialog open.
  - Discard button in the dialog (confirm()) clears storage and resets without posting.

- [ ] **Step 1: timer.css**

```css
.cockpit { max-width: 720px; margin: 0 auto; }
.clock {
  font-family: var(--font-mono); font-variant-numeric: tabular-nums;
  font-size: clamp(3rem, 14vw, 6rem); font-weight: 800; letter-spacing: 0.04em;
  text-align: center; margin: 12px 0 4px; color: var(--text);
}
.clock-sub { text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px; min-height: 1.2em; }
.phase-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-bottom: 20px; }
.phase-chip {
  padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--bg-raised); font-size: 0.85rem; color: var(--text-muted); text-align: center;
}
.phase-chip.done { color: var(--text); }
.phase-chip.current { border-color: var(--accent); color: var(--accent); }
.phase-chip .t { display: block; font-family: var(--font-mono); font-size: 0.95rem; }
.delta-ahead { color: var(--accent); }
.delta-behind { color: var(--danger); }
.cockpit-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 24px; }
.cockpit-stats .cell { background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; text-align: center; }
.cockpit-stats .cell .v { font-family: var(--font-mono); font-size: 1.15rem; font-weight: 700; }
.cockpit-stats .cell .l { color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
.cockpit-controls { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.btn-big { padding: 16px 32px; font-size: 1.05rem; border-radius: 12px; }
```

- [ ] **Step 2: FinishDialog**

`web/src/app/(app)/timer/FinishDialog.tsx`:

```tsx
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
```

- [ ] **Step 3: Timer page**

Replace `web/src/app/(app)/timer/page.tsx`:

```tsx
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
    transition(start({ ...idleState(), pieces }, Date.now()));
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
```

- [ ] **Step 4: Gate + commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: cockpit timer with splits, PB deltas, wake lock, crash-proof resume

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Timer e2e + regression gate

**Files:**
- Create: `web/e2e/timer.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test';

const uniq = `e2e3_${Date.now()}`;

test('timer: start → splits → finish → saved with splits visible in history', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Username').fill(uniq);
  await page.getByLabel('Email').fill(`${uniq}@example.com`);
  await page.getByLabel(/Password/).fill('longenough123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: /Timer/ }).click();
  await expect(page.getByRole('heading', { name: 'Stopwatch' })).toBeVisible();

  await page.getByRole('button', { name: /Start solve/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Split/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Finish/ }).click();

  await expect(page.getByRole('dialog', { name: 'Save solve' })).toBeVisible();
  await page.getByLabel('Pieces *').fill('500');
  await page.getByRole('button', { name: 'Save solve' }).click();
  await expect(page.getByText(/Solve saved/)).toBeVisible();

  await page.getByRole('link', { name: /History/ }).click();
  await expect(page.getByRole('cell', { name: /0:0[1-9]/ }).first()).toBeVisible();
});

test('timer survives a reload mid-solve', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(uniq);
  await page.getByLabel('Password').fill('longenough123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: /Timer/ }).click();
  await page.getByRole('button', { name: /Start solve/ }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByText('Resumed your solve in progress')).toBeVisible();
  await expect(page.getByRole('button', { name: /Finish/ })).toBeVisible();
  // clock is at least 1 second and still counting
  await expect(page.locator('.clock')).not.toHaveText('0:00');
});
```

- [ ] **Step 2: Full gate incl. e2e**

```bash
cd web && npm test && npm run lint && npx tsc --noEmit && npm run build
docker rm -f pg-e2e 2>/dev/null; docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=puzzlegeeks --name pg-e2e postgres:16
sleep 6
DATABASE_URL=postgres://postgres:pg@localhost:5433/puzzlegeeks npx drizzle-kit migrate
npm run e2e
docker stop pg-e2e
```

Expected: 5/5 e2e (2 auth + 1 core-flows + 2 timer). If a timer selector conflicts, prefer accessible-name fixes on the page; list changes in the report.

- [ ] **Step 3: Commit**

```bash
cd .. && git add web && git commit -m "test: timer e2e — full solve flow and mid-solve reload resume

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Legacy migration (testable core + CLI + dual-PGlite rehearsal)

**Files:**
- Create: `web/src/lib/migrate-legacy-core.ts`, `web/scripts/migrate-legacy.ts`
- Test: `web/src/lib/__tests__/migrate-legacy.test.ts`
- Modify: `web/package.json` (devDep `tsx`, script `"migrate:legacy": "tsx scripts/migrate-legacy.ts"`)

**Why a separate database:** the legacy Flask schema and the new Drizzle schema BOTH define tables named `users`, `puzzles`, `goals`, `achievements`, `settings` with different shapes. The new app therefore runs against a **new database** (e.g. `puzzlegeeks`) created alongside the legacy one in the same Neon project; the migration copies legacy → new. Never point drizzle-kit at the legacy database.

**Interfaces:**
- Produces:
  - `migrateLegacy(legacy: MinimalClient, target: MinimalClient, opts?: { dryRun?: boolean }): Promise<MigrationReport>` from `@/lib/migrate-legacy-core`, where `MinimalClient = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }` (satisfied by both `pg.Pool/Client` and PGlite).
  - `interface MigrationReport { users: number; solves: number; settings: number; goals: number; achievements: number; skippedThemeSettings: number; warnings: string[] }`
  - CLI `npm run migrate:legacy` reading env `LEGACY_DATABASE_URL` + `DATABASE_URL`, flag `--dry-run`.

**Migration semantics (exact):**
1. All target writes inside ONE transaction (`BEGIN` … `COMMIT`; `ROLLBACK` on any error or when dryRun).
2. Abort (throw, listing offenders) if the target already has any rows in `users` (non-empty target = refuse; idempotence via clean-target requirement).
3. Users: read legacy `users` ordered by id. Lowercase emails. If two legacy users collide on lowercased email OR on username → throw with the colliding pairs listed (no writes). Insert preserving `id`, `username`, `email` (lowercased), `password_hash → password_hash`, `created_at`. Theme: read legacy `settings` for key `'theme'` per user — value `'light'` maps to `'cozy'`, anything else (incl. `'dark'`, missing) → `'midnight'`.
4. Solves: legacy `puzzles` rows ordered by id → target `solves` (fresh serial ids): `date, pieces, time_seconds, scaled_time_seconds, puzzle_name, brand, difficulty_rating, notes, tags` (nulls → '' for the text fields, difficulty null → 3), `is_personal_best` int→bool, `puzzle_type` (null → 'solo'), `first_attempt` int→bool, `source` (null → ''), `source_id`, `community_avg_time, community_best_time, player_rank, community_solvers`, `created_at, updated_at` (nulls → now()).
5. Settings: all legacy `settings` rows EXCEPT key `'theme'` (that became users.theme; count skipped ones in `skippedThemeSettings`).
6. Goals: `pieces, target_time_seconds, description ('' for null), achieved int→bool, achieved_date, created_at`.
7. Achievements: `code, name, description, icon, unlocked int→bool, unlocked_date`.
8. Sequence fix: `SELECT setval(pg_get_serial_sequence('users','id'), (SELECT COALESCE(MAX(id), 1) FROM users))`.
9. Verification (inside the same run, before COMMIT): target counts equal legacy counts (users; puzzles→solves; settings minus skipped; goals; achievements) — mismatch → throw. Push a warning (not an error) for any legacy puzzles row with non-positive pieces/time (copied as-is; the legacy app allowed nothing below 1 via UI so this is belt-and-braces).

- [ ] **Step 1: Write the failing rehearsal test**

`web/src/lib/__tests__/migrate-legacy.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { migrateLegacy } from '@/lib/migrate-legacy-core';

const LEGACY_DDL = `
CREATE TABLE users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW());
CREATE TABLE puzzles (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, date TEXT NOT NULL, pieces INTEGER NOT NULL,
  time_seconds INTEGER NOT NULL, scaled_time_seconds REAL NOT NULL, puzzle_name TEXT DEFAULT '', brand TEXT DEFAULT '',
  difficulty_rating INTEGER DEFAULT 3, notes TEXT DEFAULT '', tags TEXT DEFAULT '', is_personal_best INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  source_id TEXT, source TEXT DEFAULT '', puzzle_type TEXT DEFAULT 'solo', community_avg_time INTEGER,
  community_best_time INTEGER, player_rank INTEGER, community_solvers INTEGER, first_attempt INTEGER DEFAULT 0);
CREATE TABLE settings (user_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (user_id, key));
CREATE TABLE goals (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, pieces INTEGER NOT NULL,
  target_time_seconds INTEGER NOT NULL, description TEXT DEFAULT '', achieved INTEGER DEFAULT 0, achieved_date TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW());
CREATE TABLE achievements (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
  description TEXT NOT NULL, icon TEXT NOT NULL, unlocked INTEGER DEFAULT 0, unlocked_date TEXT, UNIQUE(user_id, code));
`;

async function makeLegacy(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(LEGACY_DDL);
  return db;
}

async function makeTarget(): Promise<PGlite> {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../../drizzle') });
  return client;
}

describe('migrateLegacy', () => {
  let legacy: PGlite;
  let target: PGlite;

  beforeEach(async () => {
    legacy = await makeLegacy();
    target = await makeTarget();
  });

  it('migrates users (lowercased emails, theme mapping), solves, settings, goals, achievements', async () => {
    await legacy.query(`INSERT INTO users (id, username, email, password_hash) VALUES
      (1, 'maya', 'Maya@X.com', '$2b$12$legacyhash'), (7, 'sam', 'sam@x.com', '$2b$12$other')`);
    await legacy.query(`INSERT INTO settings VALUES (1, 'theme', 'light'), (1, 'scaling_exponent', '0.5'), (7, 'theme', 'dark')`);
    await legacy.query(`INSERT INTO puzzles (user_id, date, pieces, time_seconds, scaled_time_seconds, puzzle_name, is_personal_best, first_attempt, source_id, source, community_avg_time)
      VALUES (1, '2026-06-01', 500, 3000, 3000, 'Magic Garden', 1, 1, 'msp-1', 'speedpuzzling', 4000)`);
    await legacy.query(`INSERT INTO goals (user_id, pieces, target_time_seconds, achieved, achieved_date) VALUES (1, 500, 2500, 1, '2026-06-02')`);
    await legacy.query(`INSERT INTO achievements (user_id, code, name, description, icon, unlocked, unlocked_date)
      VALUES (1, 'first_puzzle', 'First Piece', 'Complete your first puzzle', 'puzzle-piece', 1, '2026-06-01')`);

    const report = await migrateLegacy(legacy, target);
    expect(report).toMatchObject({ users: 2, solves: 1, settings: 1, goals: 1, achievements: 1, skippedThemeSettings: 2 });

    const users = (await target.query(`SELECT * FROM users ORDER BY id`)).rows as Record<string, unknown>[];
    expect(users[0]).toMatchObject({ id: 1, email: 'maya@x.com', theme: 'cozy', password_hash: '$2b$12$legacyhash' });
    expect(users[1]).toMatchObject({ id: 7, theme: 'midnight' });

    const solves = (await target.query(`SELECT * FROM solves`)).rows as Record<string, unknown>[];
    expect(solves[0]).toMatchObject({
      user_id: 1, pieces: 500, time_seconds: 3000, puzzle_name: 'Magic Garden',
      is_personal_best: true, first_attempt: true, source_id: 'msp-1', community_avg_time: 4000, puzzle_type: 'solo',
    });

    // sequence fixed: next user insert gets id > 7
    const next = (await target.query(`INSERT INTO users (username, email, password_hash) VALUES ('new', 'n@x.com', 'h') RETURNING id`)).rows[0] as { id: number };
    expect(next.id).toBeGreaterThan(7);
  });

  it('aborts on lowercased-email collision with no writes', async () => {
    await legacy.query(`INSERT INTO users (id, username, email, password_hash) VALUES
      (1, 'a', 'Foo@X.com', 'h'), (2, 'b', 'foo@x.com', 'h')`);
    await expect(migrateLegacy(legacy, target)).rejects.toThrow(/collision/i);
    expect((await target.query(`SELECT count(*)::int AS n FROM users`)).rows[0]).toMatchObject({ n: 0 });
  });

  it('refuses a non-empty target', async () => {
    await target.query(`INSERT INTO users (username, email, password_hash) VALUES ('x', 'x@x.com', 'h')`);
    await expect(migrateLegacy(legacy, target)).rejects.toThrow(/not empty/i);
  });

  it('dry run rolls back everything but reports counts', async () => {
    await legacy.query(`INSERT INTO users (id, username, email, password_hash) VALUES (1, 'maya', 'm@x.com', 'h')`);
    const report = await migrateLegacy(legacy, target, { dryRun: true });
    expect(report.users).toBe(1);
    expect((await target.query(`SELECT count(*)::int AS n FROM users`)).rows[0]).toMatchObject({ n: 0 });
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement `web/src/lib/migrate-legacy-core.ts`:

```ts
export interface MinimalClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export interface MigrationReport {
  users: number; solves: number; settings: number; goals: number; achievements: number;
  skippedThemeSettings: number; warnings: string[];
}

const s = (v: unknown): string => (v == null ? '' : String(v));
const b = (v: unknown): boolean => v === true || v === 1 || v === '1';

/** Copy the legacy Flask database into the (empty) new-schema database. One transaction; dryRun rolls back. */
export async function migrateLegacy(
  legacy: MinimalClient,
  target: MinimalClient,
  opts: { dryRun?: boolean } = {},
): Promise<MigrationReport> {
  const existing = await target.query('SELECT count(*)::int AS n FROM users');
  if ((existing.rows[0].n as number) > 0) {
    throw new Error('Target database is not empty — refusing to migrate. Point DATABASE_URL at a fresh database.');
  }

  const users = (await legacy.query('SELECT * FROM users ORDER BY id')).rows;
  const seenEmail = new Map<string, string>();
  const seenName = new Map<string, string>();
  const collisions: string[] = [];
  for (const u of users) {
    const email = s(u.email).toLowerCase();
    const name = s(u.username);
    if (seenEmail.has(email)) collisions.push(`email '${email}': users ${seenEmail.get(email)} and ${name}`);
    if (seenName.has(name)) collisions.push(`username '${name}'`);
    seenEmail.set(email, name);
    seenName.set(name, email);
  }
  if (collisions.length) {
    throw new Error(`Lowercased-email/username collision(s), resolve in the legacy DB first: ${collisions.join('; ')}`);
  }

  const themes = new Map<number, string>();
  const legacySettings = (await legacy.query('SELECT * FROM settings')).rows;
  let skippedThemeSettings = 0;
  for (const row of legacySettings) {
    if (s(row.key) === 'theme') {
      themes.set(Number(row.user_id), s(row.value) === 'light' ? 'cozy' : 'midnight');
      skippedThemeSettings++;
    }
  }

  const warnings: string[] = [];
  const report: MigrationReport = { users: 0, solves: 0, settings: 0, goals: 0, achievements: 0, skippedThemeSettings, warnings };

  await target.query('BEGIN');
  try {
    for (const u of users) {
      await target.query(
        `INSERT INTO users (id, username, email, password_hash, theme, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [u.id, s(u.username), s(u.email).toLowerCase(), s(u.password_hash), themes.get(Number(u.id)) ?? 'midnight', u.created_at ?? new Date()],
      );
      report.users++;
    }

    const puzzles = (await legacy.query('SELECT * FROM puzzles ORDER BY id')).rows;
    for (const p of puzzles) {
      if (Number(p.pieces) <= 0 || Number(p.time_seconds) <= 0) {
        warnings.push(`legacy puzzles row id=${p.id} has non-positive pieces/time — copied as-is`);
      }
      await target.query(
        `INSERT INTO solves (user_id, date, pieces, time_seconds, scaled_time_seconds, puzzle_name, brand,
           difficulty_rating, notes, tags, is_personal_best, puzzle_type, first_attempt, source, source_id,
           community_avg_time, community_best_time, player_rank, community_solvers, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [p.user_id, s(p.date), p.pieces, p.time_seconds, p.scaled_time_seconds, s(p.puzzle_name), s(p.brand),
          p.difficulty_rating ?? 3, s(p.notes), s(p.tags), b(p.is_personal_best), s(p.puzzle_type) || 'solo',
          b(p.first_attempt), s(p.source), p.source_id ?? null,
          p.community_avg_time ?? null, p.community_best_time ?? null, p.player_rank ?? null, p.community_solvers ?? null,
          p.created_at ?? new Date(), p.updated_at ?? new Date()],
      );
      report.solves++;
    }

    for (const row of legacySettings) {
      if (s(row.key) === 'theme') continue;
      await target.query(`INSERT INTO settings (user_id, key, value) VALUES ($1, $2, $3)`, [row.user_id, s(row.key), s(row.value)]);
      report.settings++;
    }

    for (const g of (await legacy.query('SELECT * FROM goals ORDER BY id')).rows) {
      await target.query(
        `INSERT INTO goals (user_id, pieces, target_time_seconds, description, achieved, achieved_date, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [g.user_id, g.pieces, g.target_time_seconds, s(g.description), b(g.achieved), g.achieved_date ?? null, g.created_at ?? new Date()],
      );
      report.goals++;
    }

    for (const a of (await legacy.query('SELECT * FROM achievements ORDER BY id')).rows) {
      await target.query(
        `INSERT INTO achievements (user_id, code, name, description, icon, unlocked, unlocked_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [a.user_id, s(a.code), s(a.name), s(a.description), s(a.icon), b(a.unlocked), a.unlocked_date ?? null],
      );
      report.achievements++;
    }

    await target.query(`SELECT setval(pg_get_serial_sequence('users','id'), (SELECT COALESCE(MAX(id), 1) FROM users))`);

    // Verification before commit.
    const counts = async (table: string) => (await target.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number;
    const checks: Array<[string, number, number]> = [
      ['users', users.length, await counts('users')],
      ['solves', report.solves, await counts('solves')],
      ['settings', report.settings, await counts('settings')],
      ['goals', report.goals, await counts('goals')],
      ['achievements', report.achievements, await counts('achievements')],
    ];
    for (const [name, expected, actual] of checks) {
      if (expected !== actual) throw new Error(`Verification failed for ${name}: expected ${expected}, found ${actual}`);
    }

    await target.query(opts.dryRun ? 'ROLLBACK' : 'COMMIT');
    return report;
  } catch (e) {
    await target.query('ROLLBACK').catch(() => {});
    throw e;
  }
}
```

Run the rehearsal test → pass.

- [ ] **Step 3: CLI wrapper**

```bash
cd web && npm i -D tsx
```

`web/scripts/migrate-legacy.ts`:

```ts
import { Pool } from 'pg';
import { migrateLegacy } from '../src/lib/migrate-legacy-core';

const legacyUrl = process.env.LEGACY_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;
const dryRun = process.argv.includes('--dry-run');

if (!legacyUrl || !targetUrl) {
  console.error('Set LEGACY_DATABASE_URL (old Flask DB) and DATABASE_URL (new, empty DB). Add --dry-run to rehearse.');
  process.exit(1);
}
if (legacyUrl === targetUrl) {
  console.error('LEGACY_DATABASE_URL and DATABASE_URL must be different databases.');
  process.exit(1);
}

const legacy = new Pool({ connectionString: legacyUrl, max: 1 });
const target = new Pool({ connectionString: targetUrl, max: 1 });

try {
  const report = await migrateLegacy(legacy, target, { dryRun });
  console.log(`${dryRun ? '[DRY RUN — rolled back] ' : ''}Migrated:`, report);
  if (report.warnings.length) console.warn('Warnings:\n- ' + report.warnings.join('\n- '));
} catch (e) {
  console.error('Migration failed (no changes committed):', e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await legacy.end();
  await target.end();
}
```

Add to package.json scripts: `"migrate:legacy": "tsx scripts/migrate-legacy.ts"`.

Note: `migrate-legacy-core.ts` uses `pg.Pool.query` and `PGlite.query` interchangeably — both match `MinimalClient`. One caveat: `BEGIN`/`COMMIT` on a `Pool` is only safe with `max: 1` (single connection), which the CLI sets explicitly.

- [ ] **Step 4: Full gate + commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: legacy-data migration with dual-PGlite rehearsal and dry-run CLI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Cutover runbook + README + final regression gate

**Files:**
- Create: `web/MIGRATION.md`
- Modify: `web/README.md` (link the runbook; note the separate-database requirement)

- [ ] **Step 1: Write `web/MIGRATION.md`**

```markdown
# Going live: migration & cutover runbook

Goal: the new app live on Vercel with your real data, then Render retired.
Total hands-on time ≈ 30-45 minutes. Nothing here touches the legacy app
until the very last step, and every data step is rehearsed first.

## Why a separate database

The legacy Flask app and the new app both use tables named `users`,
`puzzles`, `goals`, `achievements`, `settings` — with different shapes.
The new app gets its own database in the SAME Neon project; the legacy
database stays untouched until you delete it.

## 0. Prerequisites

- The Vercel project exists (see README "Deploy") but its DATABASE_URL will
  be set in step 2.
- Legacy connection string at hand (Render dashboard → env → DATABASE_URL).

## 1. Create the new database

Neon console → your project → Databases → New database → name `puzzlegeeks`.
Copy its **pooled** connection string (this is the new app's DATABASE_URL).

## 2. Create the schema

From `web/` on your machine:

    DATABASE_URL='<new puzzlegeeks url>' npx drizzle-kit migrate

## 3. Rehearse the migration (no writes committed)

    LEGACY_DATABASE_URL='<legacy url>' DATABASE_URL='<new url>' npm run migrate:legacy -- --dry-run

Read the report: user/solve/goal/achievement counts should match what you
expect from the live site. Collisions or verification failures abort with
an explanation and nothing written.

## 4. Run it for real

    LEGACY_DATABASE_URL='<legacy url>' DATABASE_URL='<new url>' npm run migrate:legacy

## 5. Point Vercel at the new database and verify

Vercel → project → Settings → Environment Variables → set
`DATABASE_URL` = the new pooled url (plus `AUTH_SECRET` if not set).
Redeploy. Then on the production URL:

- [ ] Log in with your EXISTING username + password (bcrypt hashes carried over)
- [ ] Dashboard totals match the old site
- [ ] History shows your sessions; PB chips look right
- [ ] Theme preference sensible (legacy dark → Midnight, light → Cozy)

## 6. Cut over

- Update any bookmarks/links to the Vercel URL (or attach your custom
  domain in Vercel → Domains).
- Keep Render running for a safety window (suggest 1-2 weeks), then:
  Render dashboard → the puzzle-tracker service → Suspend (or Delete).
- The legacy Neon database can be deleted after the same window.

## Rollback

Nothing in this flow modifies the legacy database. Rolling back = keep
using the Render URL. You can re-run the migration into a fresh database
at any time (the script refuses non-empty targets).
```

- [ ] **Step 2: README pointer**

In `web/README.md`, under Deploy, append:

```markdown
### Going live with existing data

The legacy Flask database and this app cannot share one database (table
name collisions). Follow [MIGRATION.md](./MIGRATION.md) to create the new
database, rehearse and run the data migration, and retire Render.
```

- [ ] **Step 3: Final regression gate (whole Plan 3)**

```bash
cd web && npm test && npm run lint && npx tsc --noEmit && npm run build
docker rm -f pg-e2e 2>/dev/null; docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=puzzlegeeks --name pg-e2e postgres:16
sleep 6
DATABASE_URL=postgres://postgres:pg@localhost:5433/puzzlegeeks npx drizzle-kit migrate
npm run e2e
docker stop pg-e2e
```

- [ ] **Step 4: Commit**

```bash
cd .. && git add web && git commit -m "docs: migration and cutover runbook

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage (Plan-3 slice):** cockpit timer with live splits/pace-delta/projection ✅ (T1, T2, T4); keeps screen awake ✅ (T4 wake lock); survives reload ✅ (T1 serialize + T4 restore + T5 e2e); PWA installable + offline timer + queued sync ✅ (T3); one-time migration with Neon-branch-style rehearsal ✅ (T6 — rehearsal is dual-PGlite locally plus the dry-run flag against real DBs); Flask keeps running until verified, then cutover ✅ (T7 runbook). Spec's "customizable phases" ships as the fixed default plan (edge/sort/assembly) with generic overflow names — the settings UI for editing the plan is deferred to Phase 2 (noted here deliberately; the engine already supports arbitrary `phases`).
- **Type consistency:** `payloadSplits` output shape === `solveInputSchema.splits` element shape === `splits` table columns; `pbComparison(pbCumulative, pbTotalSeconds)` matches the PB route's `cumulative`/`totalSeconds`; `MinimalClient` satisfied by both pg.Pool and PGlite.
- **No placeholders:** every step has complete code and exact commands.
