import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { createUser, registerSchema } from '@/lib/users';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  try {
    const user = await createUser(getDb(), parsed.data);
    return NextResponse.json({ id: user.id, username: user.username }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'USERNAME_TAKEN' || msg === 'EMAIL_TAKEN') {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    throw e;
  }
}
