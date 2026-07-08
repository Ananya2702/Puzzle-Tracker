export const DEFAULT_SCALING_EXPONENT = 0.4;

const COMMON_PIECES = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];

/** Legacy formula: normalize any solve to a 500-piece-equivalent time. */
export function calculateScaledTime(
  timeSeconds: number,
  pieces: number,
  exponent: number = DEFAULT_SCALING_EXPONENT,
): number {
  if (pieces <= 0) return 0;
  return timeSeconds * (500 / pieces) ** exponent;
}

export function scalingInfo(exponent: number): {
  exponent: number;
  baselinePieces: 500;
  scalingTable: Record<number, { scalingFactor: number; example30min: number }>;
} {
  const scalingTable: Record<number, { scalingFactor: number; example30min: number }> = {};
  for (const pc of COMMON_PIECES) {
    const factor = (500 / pc) ** exponent;
    scalingTable[pc] = {
      scalingFactor: Math.round(factor * 1000) / 1000,
      example30min: Math.round(1800 * factor),
    };
  }
  return { exponent, baselinePieces: 500, scalingTable };
}
