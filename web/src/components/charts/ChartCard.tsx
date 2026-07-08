'use client';

import { ResponsiveContainer } from 'recharts';

export function ChartCard({ title, tag, height = 260, children }: {
  title: string; tag?: string; height?: number; children: React.ReactElement;
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ fontSize: '1rem' }}>{title}</h3>
        {tag ? <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tag}</span> : null}
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

/** Shared recessive axis/grid/tooltip props (dataviz: grid/axes recessive, labels wear text tokens). */
export const AXIS = { stroke: 'var(--chart-grid)', tick: { fill: 'var(--text-muted)', fontSize: 11 }, tickLine: false } as const;
export const GRID = { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false } as const;
export const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text)', fontSize: 12,
  },
  labelStyle: { color: 'var(--text-muted)' },
  cursor: { stroke: 'var(--chart-grid)' },
} as const;
