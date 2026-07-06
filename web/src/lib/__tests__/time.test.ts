import { describe, it, expect } from 'vitest';
import { formatDuration, parseDuration } from '@/lib/time';

describe('formatDuration', () => {
  it('formats hours, minutes, seconds', () => {
    expect(formatDuration(6127)).toBe('1:42:07');
  });
  it('formats minutes and seconds without hours', () => {
    expect(formatDuration(754)).toBe('12:34');
  });
  it('formats sub-minute times', () => {
    expect(formatDuration(59)).toBe('0:59');
  });
  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });
  it('floors fractional seconds', () => {
    expect(formatDuration(61.9)).toBe('1:01');
  });
});

describe('parseDuration', () => {
  it('parses h:mm:ss', () => {
    expect(parseDuration('1:42:07')).toBe(6127);
  });
  it('parses m:ss', () => {
    expect(parseDuration('12:34')).toBe(754);
  });
  it('parses bare minutes', () => {
    expect(parseDuration('42')).toBe(2520);
  });
  it('trims whitespace', () => {
    expect(parseDuration(' 1:00:00 ')).toBe(3600);
  });
  it('rejects garbage', () => {
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('1:99')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });
  it('accepts m:ss with minutes over 59', () => {
    expect(parseDuration('75:00')).toBe(4500);
  });
  it('rejects h:mm:ss with minutes over 59', () => {
    expect(parseDuration('1:75:00')).toBeNull();
  });
});
