import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId, todayISO } from '@/lib/api-auth';
import { importSpeedpuzzling } from '@/lib/import-speedpuzzling';

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const payload = await req.json().catch(() => null);
  if (payload == null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  return NextResponse.json(await importSpeedpuzzling(getDb(), userId, payload, todayISO()));
}
