'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ redirectTo: '/' })}
      style={{
        padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)',
        background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontWeight: 600,
      }}
    >
      Sign out
    </button>
  );
}
