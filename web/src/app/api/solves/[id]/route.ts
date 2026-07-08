import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { updateSolve, deleteSolve } from '@/lib/solves';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const id = parseId((await ctx.params).id);
  if (id == null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  try {
    const updated = await updateSolve(getDb(), userId, id, body ?? {});
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const id = parseId((await ctx.params).id);
  if (id == null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ok = await deleteSolve(getDb(), userId, id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ status: 'ok' });
}
