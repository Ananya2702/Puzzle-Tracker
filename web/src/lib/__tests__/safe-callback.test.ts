import { describe, it, expect } from 'vitest';
import { safeCallbackPath } from '@/lib/safe-callback';

describe('safeCallbackPath', () => {
  it('allows relative paths', () => {
    expect(safeCallbackPath('/timer')).toBe('/timer');
    expect(safeCallbackPath('/settings/profile')).toBe('/settings/profile');
  });
  it('rejects absolute/protocol-relative/empty', () => {
    expect(safeCallbackPath('https://evil.example')).toBe('/dashboard');
    expect(safeCallbackPath('//evil.example')).toBe('/dashboard');
    expect(safeCallbackPath('/\\evil.com')).toBe('/dashboard');
    expect(safeCallbackPath('')).toBe('/dashboard');
    expect(safeCallbackPath(null)).toBe('/dashboard');
  });
});
