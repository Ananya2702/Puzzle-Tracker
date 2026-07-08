import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { deleteGoal } from '@/lib/goals-service';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ok = await deleteGoal(getDb(), userId, id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ status: 'ok' });
}
