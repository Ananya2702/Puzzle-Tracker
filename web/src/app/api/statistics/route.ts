import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId, todayISO } from '@/lib/api-auth';
import { listSolvesChrono } from '@/lib/solves';
import { computeStatistics } from '@/lib/stats';

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const rows = await listSolvesChrono(getDb(), userId);
  return NextResponse.json(computeStatistics(rows, todayISO()));
}
