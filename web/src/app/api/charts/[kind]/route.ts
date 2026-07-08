import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { listSolvesChrono } from '@/lib/solves';
import { trendData, pieceBreakdown, paceData, weeklyData } from '@/lib/charts';

const VALID_KINDS = ['trend', 'piece-breakdown', 'pace', 'weekly'] as const;

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { kind } = await ctx.params;
  if (!(VALID_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: 'Unknown chart' }, { status: 404 });
  }
  const rows = await listSolvesChrono(getDb(), userId);
  switch (kind) {
    case 'trend': return NextResponse.json(trendData(rows));
    case 'piece-breakdown': return NextResponse.json(pieceBreakdown(rows));
    case 'pace': return NextResponse.json(paceData(rows));
    case 'weekly': return NextResponse.json(weeklyData(rows));
    default: return NextResponse.json({ error: 'Unknown chart' }, { status: 404 });
  }
}
