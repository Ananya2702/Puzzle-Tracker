'use client';

import { useEffect } from 'react';
import { flushSolveQueue, queuedSolveCount } from '@/lib/offline-queue';
import { useToast } from './Toast';

export function OfflineSync() {
  const { toast } = useToast();
  useEffect(() => {
    async function sync() {
      if (queuedSolveCount() === 0) return;
      const { sent, dropped } = await flushSolveQueue();
      if (sent > 0) toast(`Synced ${sent} offline solve${sent > 1 ? 's' : ''}`);
      if (dropped > 0) toast(`${dropped} offline solve(s) couldn't be saved and were discarded`, 'error');
    }
    void sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [toast]);
  return null;
}
