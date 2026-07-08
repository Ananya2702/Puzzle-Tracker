'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

type Kind = 'ok' | 'error';
interface ToastItem { id: number; msg: string; kind: Kind }

const ToastContext = createContext<{ toast: (msg: string, kind?: Kind) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((msg: string, kind: Kind = 'ok') => {
    const id = nextId.current++;
    setItems((cur) => [...cur, { id, msg, kind }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div aria-live="polite" style={{ position: 'fixed', bottom: 80, right: 16, zIndex: 90, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              background: 'var(--bg-raised)', color: t.kind === 'error' ? 'var(--danger)' : 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px',
              boxShadow: 'var(--shadow)', maxWidth: 340, fontSize: '0.9rem',
            }}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
