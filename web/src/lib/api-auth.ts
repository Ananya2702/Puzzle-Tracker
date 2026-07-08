import { NextResponse } from 'next/server';
import { auth } from '@/auth';

/** Session gate for API routes: returns the numeric user id, or the 401 response to return as-is. */
export async function requireUserId(): Promise<number | NextResponse> {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!session?.user?.id || !Number.isInteger(userId)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return userId;
}

export const todayISO = (): string => new Date().toISOString().slice(0, 10);
