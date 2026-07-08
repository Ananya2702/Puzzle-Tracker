import { describe, it, expect } from 'vitest';
import { parseCSVRow, parseCsvSolves } from '@/lib/parse-csv';

const TODAY = '2026-07-08';

describe('parseCSVRow', () => {
  it('splits simple rows and quoted fields', () => {
    expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(parseCSVRow('a,"b, with comma","say ""hi"""')).toEqual(['a', 'b, with comma', 'say "hi"']);
  });
});

describe('parseCsvSolves', () => {
  it('parses our own export format (bare numbers are seconds when header says seconds)', () => {
    const text = [
      'Date,Puzzle Name,Brand,Pieces,Time (seconds),Time (formatted),Scaled Time (500pc),Difficulty,Notes,Tags',
      '2026-07-01,Magic Garden,Ravensburger,500,3000,0:50:00,3000,4,fun,floral',
    ].join('\n');
    const { entries, errors } = parseCsvSolves(text, TODAY);
    expect(errors).toBe(0);
    expect(entries[0]).toMatchObject({
      date: '2026-07-01', pieces: 500, time_seconds: 3000, puzzle_name: 'Magic Garden',
      brand: 'Ravensburger', difficulty_rating: 4, notes: 'fun', tags: 'floral', valid: true,
    });
  });
  it('parses generic CSVs: h:mm:ss times, US dates, missing columns', () => {
    const text = ['date,pieces,time', '07/02/2026,1000,1:30:00'].join('\n');
    const { entries } = parseCsvSolves(text, TODAY);
    expect(entries[0]).toMatchObject({ date: '2026-07-02', pieces: 1000, time_seconds: 5400, difficulty_rating: 3, valid: true });
  });
  it('bare-number time without seconds header is minutes', () => {
    const { entries } = parseCsvSolves(['date,pieces,time', '2026-07-01,500,45'].join('\n'), TODAY);
    expect(entries[0].time_seconds).toBe(2700);
  });
  it('flags invalid rows and counts errors; unparseable dates fall back to today', () => {
    const { entries, errors } = parseCsvSolves(['date,pieces,time', 'not-a-date,zero,abc'].join('\n'), TODAY);
    expect(errors).toBe(1);
    expect(entries[0].valid).toBe(false);
    expect(entries[0].date).toBe(TODAY);
  });
});
