'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import '../auth-forms.css';

export function RegisterForm({ googleSlot }: { googleSlot?: ReactNode }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const payload = {
      username: String(form.get('username') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    };
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const friendly: Record<string, string> = {
        USERNAME_TAKEN: 'That username is taken.',
        EMAIL_TAKEN: 'An account with that email already exists.',
      };
      setError(friendly[body.error] ?? body.error ?? 'Registration failed.');
      setBusy(false);
      return;
    }
    const login = await signIn('credentials', {
      identifier: payload.username,
      password: payload.password,
      redirect: false,
    });
    if (login?.error) {
      // Account exists but auto-login failed (rare, e.g. transient error): send them to sign in manually.
      router.push('/login');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <form onSubmit={onSubmit}>
          <h1>Join Puzzle Geeks</h1>
          <p className="sub">Track solves. Beat your times.</p>
          <label htmlFor="username">Username</label>
          <input id="username" name="username" required pattern="[a-zA-Z0-9_]{3,30}"
            title="3-30 letters, numbers, underscores" autoComplete="username" />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
          <label htmlFor="password">Password (8+ characters)</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          <p className="auth-error" role="alert">{error}</p>
          <button className="auth-submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
        {googleSlot}
        <p className="auth-alt">Have an account? <Link href="/login">Sign in</Link></p>
      </div>
    </main>
  );
}
