import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { getScalingExponent } from '@/lib/settings-service';
import { scalingInfo } from '@/lib/scaling';

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const info = scalingInfo(await getScalingExponent(getDb(), userId));
  return NextResponse.json({
    exponent: info.exponent,
    baseline_pieces: info.baselinePieces,
    scaling_table: Object.fromEntries(
      Object.entries(info.scalingTable).map(([pc, v]) => [
        pc,
        { scaling_factor: v.scalingFactor, example_30min: v.example30min },
      ]),
    ),
  });
}
