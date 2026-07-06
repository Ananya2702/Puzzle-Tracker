'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Suspense } from 'react';
import '../auth-forms.css';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const res = await signIn('credentials', {
      identifier: String(form.get('identifier') ?? ''),
      password: String(form.get('password') ?? ''),
      redirect: false,
    });
    setBusy(false);
    if (res?.error) {
      setError('Wrong username/email or password.');
    } else {
      router.push(params.get('callbackUrl') ?? '/dashboard');
      router.refresh();
    }
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Welcome back</h1>
        <p className="sub">Sign in to Puzzle Geeks</p>
        <label htmlFor="identifier">Username or email</label>
        <input id="identifier" name="identifier" required autoComplete="username" />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" />
        <p className="auth-error" role="alert">{error}</p>
        <button className="auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="auth-alt">New here? <Link href="/register">Create an account</Link></p>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
