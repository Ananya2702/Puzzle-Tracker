import { describe, it, expect } from 'vitest';
import { calculateScaledTime, scalingInfo, DEFAULT_SCALING_EXPONENT } from '@/lib/scaling';

describe('calculateScaledTime', () => {
  it('is identity at 500 pieces', () => {
    expect(calculateScaledTime(1800, 500)).toBe(1800);
  });
  it('scales a 1000pc solve down (matches legacy formula)', () => {
    // 3600 * (500/1000)^0.4 = 3600 * 0.757858...
    expect(calculateScaledTime(3600, 1000)).toBeCloseTo(2728.29, 1);
  });
  it('scales a 300pc solve up', () => {
    // 1200 * (500/300)^0.4 = 1200 * 1.226780...
    expect(calculateScaledTime(1200, 300)).toBeCloseTo(1472.04, 1);
  });
  it('returns 0 for pieces <= 0', () => {
    expect(calculateScaledTime(1000, 0)).toBe(0);
    expect(calculateScaledTime(1000, -5)).toBe(0);
  });
  it('exponent 0 disables scaling', () => {
    expect(calculateScaledTime(999, 2000, 0)).toBe(999);
  });
  it('default exponent is 0.4', () => {
    expect(DEFAULT_SCALING_EXPONENT).toBe(0.4);
  });
});

describe('scalingInfo', () => {
  it('builds the legacy preview table', () => {
    const info = scalingInfo(0.4);
    expect(info.baselinePieces).toBe(500);
    expect(Object.keys(info.scalingTable).map(Number)).toEqual([100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000]);
    expect(info.scalingTable[500].scalingFactor).toBe(1);
    expect(info.scalingTable[500].example30min).toBe(1800);
    expect(info.scalingTable[1000].scalingFactor).toBeCloseTo(0.758, 3);
    expect(info.scalingTable[1000].example30min).toBe(1364); // round(1800 * 0.757858)
  });
});
