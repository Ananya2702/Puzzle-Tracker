'use client';

import { useRef, useState } from 'react';
import { postJSON, ApiError } from '@/lib/api-client';
import { parseCsvSolves, type CsvEntry } from '@/lib/parse-csv';
import { useToast } from '@/components/Toast';

interface ImportCounts { imported: number; duplicates: number; skipped_type: number; invalid: number; total: number }

const todayLocal = () => new Date().toISOString().slice(0, 10);

export function ImportPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState<Record<string, boolean>>({ solo: true, duo: false, team: false });
  const [csvPreview, setCsvPreview] = useState<{ entries: CsvEntry[]; errors: number } | null>(null);

  async function handleFile(file: File) {
    const text = await file.text();
    if (file.name.endsWith('.json')) {
      let records: unknown;
      try { records = JSON.parse(text); } catch { return toast('That .json file could not be parsed', 'error'); }
      setBusy(true);
      try {
        const includeTypes = Object.entries(types).filter(([, on]) => on).map(([t]) => t);
        const res = await postJSON<ImportCounts>('/api/import/speedpuzzling', { records, include_types: includeTypes });
        toast(`Imported ${res.imported} (duplicates ${res.duplicates}, skipped ${res.skipped_type}, invalid ${res.invalid})`);
        onDone();
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Import failed', 'error');
      } finally {
        setBusy(false);
      }
    } else if (file.name.endsWith('.csv')) {
      setCsvPreview(parseCsvSolves(text, todayLocal()));
    } else {
      toast('Please choose a .json or .csv file', 'error');
    }
  }

  async function importCsv() {
    if (!csvPreview) return;
    setBusy(true);
    let ok = 0, failed = 0;
    for (const entry of csvPreview.entries.filter((e) => e.valid)) {
      try {
        const { valid, ...payload } = entry;
        void valid;
        await postJSON('/api/solves', payload);
        ok++;
      } catch {
        failed++;
      }
    }
    setBusy(false);
    setCsvPreview(null);
    toast(`Imported ${ok} solves${failed ? `, ${failed} failed` : ''}${csvPreview.errors ? `, ${csvPreview.errors} invalid rows skipped` : ''}`);
    onDone();
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 10 }}>Import sessions</h3>
      <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: '0.85rem' }}>
        {(['solo', 'duo', 'team'] as const).map((t) => (
          <label key={t} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={types[t]} onChange={(e) => setTypes({ ...types, [t]: e.target.checked })} />
            {t} <span style={{ color: 'var(--text-muted)' }}>(myspeedpuzzling)</span>
          </label>
        ))}
      </div>
      <div
        className={`drop-area${dragover ? ' dragover' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragover(false);
          if (e.dataTransfer.files[0]) void handleFile(e.dataTransfer.files[0]);
        }}
      >
        {busy ? 'Importing…' : 'Drop a myspeedpuzzling .json export or a .csv here — or click to browse'}
      </div>
      <input
        ref={fileRef} type="file" accept=".json,.csv" hidden
        onChange={(e) => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); e.target.value = ''; }}
      />
      {csvPreview ? (
        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>
            {csvPreview.entries.filter((e) => e.valid).length} rows ready
            {csvPreview.errors ? `, ${csvPreview.errors} invalid` : ''}
          </span>
          <button className="btn btn-primary" onClick={importCsv} disabled={busy}>Import CSV rows</button>
          <button className="btn" onClick={() => setCsvPreview(null)}>Cancel</button>
        </div>
      ) : null}
    </div>
  );
}
