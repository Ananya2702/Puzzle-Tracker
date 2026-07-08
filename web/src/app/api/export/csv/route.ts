import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { listSolvesChrono, csvRows } from '@/lib/solves';

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const rows = csvRows(await listSolvesChrono(getDb(), userId));
  const body = rows.map((r) => r.map(cell).join(',')).join('\n');
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename=puzzle_times.csv',
    },
  });
}
