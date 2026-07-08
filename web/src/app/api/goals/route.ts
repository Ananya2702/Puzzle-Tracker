import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { listGoals, addGoal } from '@/lib/goals-service';

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  return NextResponse.json(await listGoals(getDb(), userId));
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  try {
    const goal = await addGoal(getDb(), userId, await req.json().catch(() => null));
    return NextResponse.json(goal, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    throw e;
  }
}
