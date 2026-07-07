import { describe, it, expect } from 'vitest';
import { isProtectedPath } from '@/auth.config';

describe('isProtectedPath', () => {
  it('protects app pages and their subpaths', () => {
    for (const p of ['/dashboard', '/timer', '/log', '/history', '/analytics', '/goals', '/awards', '/settings', '/settings/profile']) {
      expect(isProtectedPath(p)).toBe(true);
    }
  });
  it('does not protect the public pages or lookalike prefixes', () => {
    for (const p of ['/', '/login', '/register', '/dashboards-export', '/settingsx', '/logout-info']) {
      expect(isProtectedPath(p)).toBe(false);
    }
  });
});
