import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { solves } from '@/db/schema';
import { calculateScaledTime } from './scaling';
import { getScalingExponent } from './settings-service';
import { updatePersonalBests } from './solves';
import { checkAchievements } from './achievements-service';

type Rec = Record<string, unknown>;

const toInt = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

export interface ImportResult {
  imported: number;
  duplicates: number;
  skipped_type: number;
  invalid: number;
  total: number;
}

/** Bulk-import a myspeedpuzzling JSON export. Dedupe by result_id, falling back to (date, pieces, seconds). */
export async function importSpeedpuzzling(db: Db, userId: number, payload: unknown, today: string): Promise<ImportResult> {
  let records: Rec[];
  let includeTypes: Set<string>;
  if (Array.isArray(payload)) {
    records = payload as Rec[];
    includeTypes = new Set(['solo']);
  } else if (payload && typeof payload === 'object') {
    const p = payload as { records?: Rec[]; include_types?: string[] };
    records = p.records ?? [];
    includeTypes = new Set(p.include_types?.length ? p.include_types : ['solo']);
  } else {
    records = [];
    includeTypes = new Set(['solo']);
  }

  const exponent = await getScalingExponent(db, userId);
  const existing = await db
    .select({ sourceId: solves.sourceId, date: solves.date, pieces: solves.pieces, timeSeconds: solves.timeSeconds })
    .from(solves)
    .where(eq(solves.userId, userId));
  const existingSource = new Set(existing.map((r) => r.sourceId).filter(Boolean) as string[]);
  const existingKey = new Set(existing.map((r) => `${r.date}|${r.pieces}|${r.timeSeconds}`));

  let imported = 0, duplicates = 0, skippedType = 0, invalid = 0;

  for (const rec of records) {
    try {
      const ptype = String(rec.type ?? 'solo').toLowerCase();
      if (!includeTypes.has(ptype)) { skippedType++; continue; }
      const pieces = toInt(rec.pieces_count);
      const secs = toInt(rec.seconds_to_solve);
      if (!pieces || pieces <= 0 || !secs || secs <= 0) { invalid++; continue; }

      const rawDate = String(rec.finished_at ?? rec.tracked_at ?? '').slice(0, 10);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
      const sid = rec.result_id != null ? String(rec.result_id) : null;
      const key = `${date}|${pieces}|${secs}`;

      if ((sid && existingSource.has(sid)) || existingKey.has(key)) { duplicates++; continue; }

      await db.insert(solves).values({
        userId,
        date,
        pieces,
        timeSeconds: secs,
        scaledTimeSeconds: calculateScaledTime(secs, pieces, exponent),
        puzzleName: String(rec.puzzle_name ?? ''),
        brand: String(rec.brand_name ?? ''),
        sourceId: sid,
        source: 'speedpuzzling',
        puzzleType: ptype,
        communityAvgTime: toInt(rec.puzzle_average_time),
        communityBestTime: toInt(rec.puzzle_fastest_time),
        playerRank: toInt(rec.player_rank),
        communitySolvers: toInt(rec.puzzle_total_solved),
        firstAttempt: Boolean(rec.first_attempt),
      });
      if (sid) existingSource.add(sid);
      existingKey.add(key);
      imported++;
    } catch {
      invalid++;
    }
  }

  if (imported > 0) {
    await updatePersonalBests(db, userId);
    await checkAchievements(db, userId, today);
  }
  return { imported, duplicates, skipped_type: skippedType, invalid, total: records.length };
}
