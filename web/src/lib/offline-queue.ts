import { postJSON } from './api-client';

const KEY = 'pg-solve-queue';

function read(): unknown[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(items: unknown[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueueSolve(body: unknown): void {
  write([...read(), body]);
}

export function queuedSolveCount(): number {
  return read().length;
}

/** POST queued solves in order; failures stay queued (order preserved). */
export async function flushSolveQueue(
  post: (url: string, body: unknown) => Promise<unknown> = postJSON,
): Promise<{ sent: number; remaining: number }> {
  const items = read();
  if (items.length === 0) return { sent: 0, remaining: 0 };
  const failed: unknown[] = [];
  let sent = 0;
  for (const item of items) {
    try {
      await post('/api/solves', item);
      sent++;
    } catch {
      failed.push(item);
    }
  }
  write(failed);
  return { sent, remaining: failed.length };
}
