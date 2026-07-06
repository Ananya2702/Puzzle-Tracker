import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getDb } from '@/db';
import { setTheme } from '@/lib/users';

const schema = z.object({ theme: z.enum(['midnight', 'cozy']) });

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid theme' }, { status: 400 });
  await setTheme(getDb(), Number(session.user.id), parsed.data.theme);
  return new NextResponse(null, { status: 204 });
}
