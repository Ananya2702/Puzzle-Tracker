import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getDb } from '@/db';
import { requireUserId, todayISO } from '@/lib/api-auth';
import { addSolve, listSolves } from '@/lib/solves';
import { checkAchievements } from '@/lib/achievements-service';

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const url = new URL(req.url);
  const piecesRaw = url.searchParams.get('pieces');
  const sortRaw = url.searchParams.get('sort');
  const orderRaw = url.searchParams.get('order');
  const sort = (['date', 'time', 'scaled', 'pieces'] as const).find((s) => s === sortRaw);
  const rows = await listSolves(getDb(), userId, {
    pieces: piecesRaw ? Number(piecesRaw) : undefined,
    sort,
    order: orderRaw === 'asc' ? 'asc' : 'desc',
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const body = await req.json().catch(() => null);
  try {
    const today = todayISO();
    const { solve, achievedGoalIds } = await addSolve(getDb(), userId, body, today);
    const newAchievements = await checkAchievements(getDb(), userId, today);
    return NextResponse.json(
      { solve, achievedGoalIds, newAchievements, isPersonalBest: solve.isPersonalBest },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    throw e;
  }
}
