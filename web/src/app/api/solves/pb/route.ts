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
