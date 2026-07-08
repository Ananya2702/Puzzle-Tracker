'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { getJSON } from '@/lib/api-client';
import type { Statistics } from '@/lib/stats';
import { calculateLevel } from '@/lib/levels';
import { getMotivation } from '@/lib/motivation';
import { funStatItems } from '@/lib/fun-stats';
import { formatDuration } from '@/lib/time';
import { fmtDate, pct } from '@/lib/format';
import { StatCard } from '@/components/StatCard';
import { ChartCard, AXIS, GRID, TOOLTIP_STYLE } from '@/components/charts/ChartCard';
import './dashboard.css';

interface Solve { id: number; date: string; pieces: number; timeSeconds: number; scaledTimeSeconds: number; isPersonalBest: boolean }
interface Trend { solves: Solve[]; moving_avg_5: number[] }

export default function DashboardPage() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [recent, setRecent] = useState<Solve[]>([]);

  useEffect(() => {
    void getJSON<Statistics>('/api/statistics').then(setStats);
    void getJSON<Trend>('/api/charts/trend').then(setTrend);
    void getJSON<Solve[]>('/api/solves?sort=date&order=desc').then((rows) => setRecent(rows.slice(0, 10)));
  }, []);

  if (!stats) return <div className="card">Loading…</div>;

  if (stats.total_puzzles === 0) {
    return (
      <>
        <div className="page-head"><h1>Dashboard</h1><p className="desc">Your speed puzzling overview</p></div>
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>🧩</p>
          <h3 style={{ marginBottom: 8 }}>Welcome to Puzzle Geeks!</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Log your first puzzle to unlock your dashboard.</p>
          <Link className="btn btn-primary" href="/log">Log a puzzle</Link>
        </div>
      </>
    );
  }

  const level = calculateLevel(stats);
  const motivation = getMotivation(stats);
  const fun = funStatItems(stats);
  const trendRows = trend?.solves.map((s, i) => ({
    name: fmtDate(s.date),
    scaled: Math.round(s.scaledTimeSeconds / 60),
    ma5: Math.round((trend.moving_avg_5[i] ?? 0) / 60),
  })) ?? [];

  return (
    <>
      <div className="page-head"><h1>Dashboard</h1><p className="desc">Your speed puzzling overview</p></div>

      <div className="motivation"><span className="emoji" aria-hidden>{motivation.emoji}</span><span>{motivation.msg}</span></div>

      <div className="xp-bar">
        <strong>Level {level.level}</strong>
        <div className="xp-track"><div className="xp-fill" style={{ width: `${level.progress}%` }} /></div>
        <span className="mono" style={{ color: 'var(--text-muted)' }}>{level.totalXP} XP</span>
      </div>

      <div className="dash-grid">
        <StatCard label="Puzzles" value={String(stats.total_puzzles)} sub={`${stats.this_week_count} this week`} />
        <StatCard label="Hours" value={String(stats.total_time_hours)} sub={`${stats.total_pieces.toLocaleString('en-US')} pieces`} />
        <StatCard label="Best scaled" value={formatDuration(stats.best_scaled_time)} sub="500pc equivalent" accent />
        <StatCard label="Median scaled" value={formatDuration(stats.median_scaled_time)} />
        <StatCard label="Streak" value={stats.current_streak > 0 ? `🔥 ${stats.current_streak}` : '0'} sub={`longest ${stats.longest_streak}`} accent={stats.current_streak > 0} />
        <StatCard label="Improvement" value={pct(stats.improvement_pct)} sub={stats.pace_trend} />
      </div>

      {stats.community.has_data ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10 }}>Community standing <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>myspeedpuzzling</span></h3>
          <div className="dash-grid" style={{ marginBottom: 0 }}>
            <StatCard label="Beat the average" value={`${stats.community.beat_avg_count}/${stats.community.compared_count}`} />
            <StatCard label="Vs community" value={pct(stats.community.avg_vs_community_pct ?? 0)} sub="faster is +" />
            <StatCard label="Best rank" value={stats.community.best_rank ? `#${stats.community.best_rank}` : '—'} />
            <StatCard label="Podiums" value={String(stats.community.podiums ?? 0)} sub={`top-10 ×${stats.community.top10 ?? 0}`} />
          </div>
        </div>
      ) : null}

      <div className="dash-cols">
        <ChartCard title="Progress trend" tag="scaled minutes" height={220}>
          <LineChart data={trendRows}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={36} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
            <Line name="Scaled" dataKey="scaled" stroke="var(--chart-2)" strokeWidth={0} dot={{ r: 3, fill: 'var(--chart-2)', strokeWidth: 0 }} isAnimationActive={false} />
            <Line name="5-solve average" dataKey="ma5" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ChartCard>

        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Recent sessions</h3>
          <div className="recent-list">
            {recent.map((s) => (
              <div className="row" key={s.id}>
                <span style={{ color: 'var(--text-muted)' }}>{fmtDate(s.date)}</span>
                <span>{s.pieces}pc</span>
                <span className="mono">{formatDuration(s.timeSeconds)}</span>
                <span>{s.isPersonalBest ? <span className="chip">PB</span> : null}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-cols">
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Personal bests</h3>
          <div className="dash-grid" style={{ marginBottom: 0 }}>
            {Object.entries(stats.personal_bests).map(([pc, t]) => (
              <StatCard key={pc} label={`${pc}pc PB`} value={formatDuration(t)} accent />
            ))}
          </div>
        </div>
        <div className="card fun-list">
          <h3 style={{ marginBottom: 10 }}>Fun stats</h3>
          {fun.map((f) => (
            <div className="row" key={f.text}>
              <span aria-hidden>{f.icon}</span>
              <span className="t">{f.text}</span>
              <strong>{f.val}</strong>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
