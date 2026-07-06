import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import './landing.css';

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  return (
    <div className="landing">
      <nav className="landing-nav">
        <span className="logo">◆ Puzzle Geeks</span>
        <div className="actions">
          <Link className="btn-ghost" href="/login">Sign in</Link>
          <Link className="btn-primary" href="/register">Join free</Link>
        </div>
      </nav>
      <main className="hero">
        <div>
          <div className="demo-timer" aria-hidden>1:42:07</div>
          <h1>Every puzzle is a race.</h1>
          <p className="tagline">
            Time your solves, watch your pace sharpen, and chase personal bests —
            the home for speed puzzlers.
          </p>
          <Link className="btn-primary" href="/register">Start tracking — it&apos;s free</Link>
        </div>
      </main>
      <section className="features" aria-label="Features">
        <div className="feature"><h3>⏱️ Pro timer</h3><p>Live splits, pace, and projected finish while you solve.</p></div>
        <div className="feature"><h3>📈 Real analytics</h3><p>Trends, pace curves, and PBs across every piece count.</p></div>
        <div className="feature"><h3>🏆 Goals &amp; streaks</h3><p>Targets, achievements, and streaks that keep you coming back.</p></div>
      </section>
    </div>
  );
}
