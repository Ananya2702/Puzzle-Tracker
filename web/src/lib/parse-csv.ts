import { parseDuration } from './time';

export interface CsvEntry {
  date: string; pieces: number; time_seconds: number; puzzle_name: string;
  brand: string; difficulty_rating: number; notes: string; tags: string; valid: boolean;
}

/** One CSV row → cells; supports quoted fields with embedded commas and doubled quotes. */
export function parseCSVRow(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out;
}

/** Port of legacy handleCSVFile() header sniffing + row mapping. */
export function parseCsvSolves(text: string, today: string): { entries: CsvEntry[]; errors: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { entries: [], errors: 0 };

  const header = parseCSVRow(lines[0]).map((h) => h.trim().toLowerCase());
  const dateIdx = header.findIndex((h) => h.includes('date'));
  const piecesIdx = header.findIndex((h) => h.includes('piece') || h === 'pcs');
  const timeIdx = header.findIndex((h) => h.includes('time') && !h.includes('scaled'));
  const nameIdx = header.findIndex((h) => h.includes('name') || h.includes('puzzle'));
  const brandIdx = header.findIndex((h) => h.includes('brand'));
  const diffIdx = header.findIndex((h) => h.includes('diff') || h.includes('rating'));
  const notesIdx = header.findIndex((h) => h.includes('note'));
  const tagsIdx = header.findIndex((h) => h.includes('tag'));
  const timeIsSeconds = timeIdx >= 0 && header[timeIdx].includes('second');

  const col = (row: string[], idx: number, fallbackIdx: number, dflt = '') => {
    const i = idx >= 0 ? idx : fallbackIdx;
    return i < row.length ? row[i].trim() : dflt;
  };

  // Format a Date using its local components, not UTC (avoids toISOString()
  // shifting the date under positive UTC offsets, e.g. `new Date('07/02/2026')`
  // parsed at local midnight in IST becomes 2026-07-01T18:30:00Z).
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const toLocalISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const entries: CsvEntry[] = [];
  let errors = 0;
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (row.length < 2) continue;

    const rawDate = col(row, dateIdx, 0);
    let date = rawDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      const d = new Date(rawDate);
      date = !Number.isNaN(d.getTime()) ? toLocalISODate(d) : today;
    }

    const pieces = parseInt(col(row, piecesIdx, 1), 10);
    const rawTime = col(row, timeIdx, 2);
    const timeSeconds = timeIsSeconds && /^\d+$/.test(rawTime)
      ? parseInt(rawTime, 10)
      : parseDuration(rawTime) ?? NaN;

    const entry: CsvEntry = {
      date,
      pieces,
      time_seconds: timeSeconds,
      puzzle_name: col(row, nameIdx, 3),
      brand: col(row, brandIdx, 4),
      difficulty_rating: parseInt(col(row, diffIdx, 5, '3'), 10) || 3,
      notes: col(row, notesIdx, 6),
      tags: col(row, tagsIdx, 7),
      valid: Number.isFinite(pieces) && pieces > 0 && Number.isFinite(timeSeconds) && timeSeconds > 0,
    };
    if (!entry.valid) errors++;
    entries.push(entry);
  }
  return { entries, errors };
}
