import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { getSettings, putSettings } from '@/lib/settings-service';

const putSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  return NextResponse.json(await getSettings(getDb(), userId));
}

export async function PUT(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings payload' }, { status: 400 });
  try {
    await putSettings(getDb(), userId, Object.fromEntries(
      Object.entries(parsed.data).map(([k, v]) => [k, String(v)]),
    ));
  } catch (e) {
    if (e instanceof Error && e.message === 'INVALID_SCALING_EXPONENT') {
      return NextResponse.json({ error: 'scaling_exponent must be a number between 0 and 2' }, { status: 400 });
    }
    throw e;
  }
  return NextResponse.json({ status: 'ok' });
}
