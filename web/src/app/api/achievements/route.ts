import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { listAchievements } from '@/lib/achievements-service';

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  return NextResponse.json(await listAchievements(getDb(), userId));
}
