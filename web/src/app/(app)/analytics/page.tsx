'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { TooltipValueType, TooltipPayloadEntry } from 'recharts';
import { getJSON } from '@/lib/api-client';
import { distributionBins, improvementSeries, foldPieSlices } from '@/lib/chart-transforms';
import { fmtDate } from '@/lib/format';
import { ChartCard, AXIS, GRID, TOOLTIP_STYLE } from '@/components/charts/ChartCard';

interface Solve { id: number; date: string; pieces: number; timeSeconds: number; scaledTimeSeconds: number }
interface Trend { solves: Solve[]; moving_avg_5: number[]; moving_avg_10: number[] }
type Breakdown = Record<string, { count: number; average: number; best: number; worst: number }>;
interface PacePoint { date: string; pace: number; pieces: number; id: number }
interface Week { week: string; count: number; total_time: number; avg_scaled: number; best_scaled: number; total_pieces: number }

const SLOTS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
const min = (s: number) => Math.round(s / 60);

export default function AnalyticsPage() {
  const [trend, setTrend] = useState<Trend | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [pace, setPace] = useState<PacePoint[]>([]);
  const [weekly, setWeekly] = useState<Week[]>([]);

  useEffect(() => {
    void getJSON<Trend>('/api/charts/trend').then(setTrend);
    void getJSON<Breakdown>('/api/charts/piece-breakdown').then(setBreakdown);
    void getJSON<PacePoint[]>('/api/charts/pace').then(setPace);
    void getJSON<Week[]>('/api/charts/weekly').then(setWeekly);
  }, []);

  if (!trend || !breakdown) return <div className="card">Loading…</div>;
  if (trend.solves.length === 0) {
    return (
      <>
        <div className="page-head"><h1>Analytics</h1><p className="desc">Performance deep-dive</p></div>
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          Charts unlock after your first logged solve.
        </div>
      </>
    );
  }

  const trendRows = trend.solves.map((s, i) => ({
    name: fmtDate(s.date),
    scaled: min(s.scaledTimeSeconds),
    ma5: min(trend.moving_avg_5[i]),
    ma10: min(trend.moving_avg_10[i]),
  }));
  const breakdownRows = Object.entries(breakdown).map(([pc, d]) => ({
    name: `${pc}pc`, best: min(d.best), average: min(d.average),
  }));
  const paceRows = pace.map((p) => ({ name: fmtDate(p.date), pace: p.pace }));
  const distRows = distributionBins(trend.solves.map((s) => s.scaledTimeSeconds));
  const pieRows = foldPieSlices(Object.entries(breakdown).map(([pc, d]) => ({ label: `${pc}pc`, value: d.count })));
  const impRows = improvementSeries(trend.solves.map((s) => s.scaledTimeSeconds)).map((v, i) => ({ name: `#${i + 1}`, imp: v }));
  const weekRows = weekly.map((w) => ({
    name: fmtDate(w.week), count: w.count, hours: Math.round((w.total_time / 3600) * 10) / 10, avgScaled: min(w.avg_scaled),
  }));

  const cols: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 };

  return (
    <>
      <div className="page-head"><h1>Analytics</h1><p className="desc">Performance deep-dive</p></div>

      <div style={{ marginBottom: 16 }}>
        <ChartCard title="Scaled time with moving averages" tag="minutes, 500pc equivalent" height={300}>
          <LineChart data={trendRows}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={36} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line name="Scaled" dataKey="scaled" stroke="var(--chart-2)" strokeWidth={0} dot={{ r: 3, fill: 'var(--chart-2)', strokeWidth: 0 }} isAnimationActive={false} />
            <Line name="5-solve avg" dataKey="ma5" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line name="10-solve avg" dataKey="ma10" stroke="var(--chart-4)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      </div>

      <div style={cols}>
        <ChartCard title="Best & average by piece count" tag="minutes">
          <BarChart data={breakdownRows} barGap={2}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={36} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar name="Best" dataKey="best" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar name="Average" dataKey="average" fill="var(--chart-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Pace" tag="seconds per piece">
          <LineChart data={paceRows}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={36} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Line dataKey="pace" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2, fill: 'var(--chart-1)', strokeWidth: 0 }} isAnimationActive={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Time distribution" tag="scaled minutes">
          <BarChart data={distRows}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} width={30} allowDecimals={false} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Bar dataKey="count" fill="var(--chart-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Sessions by piece count">
          <PieChart>
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} />
            <Pie data={pieRows} dataKey="value" nameKey="label" innerRadius="55%" paddingAngle={2} isAnimationActive={false}>
              {pieRows.map((entry, i) => (
                <Cell key={entry.label} fill={entry.label === 'Other' ? 'var(--text-muted)' : SLOTS[i % SLOTS.length]} stroke="var(--bg-raised)" strokeWidth={2} />
              ))}
            </Pie>
          </PieChart>
        </ChartCard>
      </div>

      <div style={{ marginBottom: 16 }}>
        <ChartCard title="Improvement over time" tag="% vs first solve" height={260}>
          <LineChart data={impRows}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={44} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: TooltipValueType | undefined) => [`${Number(v) > 0 ? '+' : ''}${v}%`, 'vs first']} />
            <Line dataKey="imp" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2, fill: 'var(--chart-1)', strokeWidth: 0 }} isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      </div>

      <ChartCard title="Weekly summary" tag="sessions per week" height={260}>
        <BarChart data={weekRows}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="name" {...AXIS} />
          <YAxis {...AXIS} width={30} allowDecimals={false} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v: TooltipValueType | undefined, _name, item: TooltipPayloadEntry) => {
              const p = item.payload as { hours: number; avgScaled: number };
              return [`${v} sessions · ${p.hours}h · avg ${p.avgScaled}m scaled`, ''];
            }}
          />
          <Bar dataKey="count" fill="var(--chart-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartCard>
    </>
  );
}
