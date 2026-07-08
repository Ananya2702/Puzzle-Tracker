export function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
      {sub ? <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{sub}</div> : null}
    </div>
  );
}
