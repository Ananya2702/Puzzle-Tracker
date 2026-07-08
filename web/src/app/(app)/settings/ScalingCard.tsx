'use client';

import { useEffect, useState } from 'react';
import { getJSON, putJSON } from '@/lib/api-client';
import { scalingInfo, DEFAULT_SCALING_EXPONENT } from '@/lib/scaling';
import { formatDuration } from '@/lib/time';
import { useToast } from '@/components/Toast';

export function ScalingCard() {
  const { toast } = useToast();
  const [value, setValue] = useState(DEFAULT_SCALING_EXPONENT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getJSON<Record<string, string>>('/api/settings').then((s) => {
      const v = Number(s.scaling_exponent);
      if (Number.isFinite(v)) setValue(v);
    });
  }, []);

  const info = scalingInfo(value);

  async function save() {
    setBusy(true);
    try {
      await putJSON('/api/settings', { scaling_exponent: value });
      toast('Scaling updated — history rescaled');
    } catch {
      toast('Failed to save scaling', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 6 }}>Scaled time</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 14 }}>
        Normalizes every solve to a 500-piece equivalent so different sizes compare fairly. 0 = raw times.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <input
          type="range" min={0} max={1} step={0.05} value={value}
          aria-label="Scaling exponent"
          onChange={(e) => setValue(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--accent)' }}
        />
        <span className="mono" style={{ width: 44, textAlign: 'right' }}>{value.toFixed(2)}</span>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <div className="table-scroll">
        <table className="history-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Pieces</th><th>Factor</th><th>30 min becomes</th></tr></thead>
          <tbody>
            {Object.entries(info.scalingTable).map(([pc, v]) => (
              <tr key={pc}>
                <td>{pc}</td>
                <td className="mono">×{v.scalingFactor}</td>
                <td className="mono">{formatDuration(v.example30min)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
