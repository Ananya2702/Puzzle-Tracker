/** The user's local calendar date as YYYY-MM-DD (client-side "today"). */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 6127 -> "1:42:07"; 754 -> "12:34"; 59 -> "0:59" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** Accepts "h:mm:ss", "m:ss", or bare minutes "42". Returns total seconds or null. */
export function parseDuration(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10) * 60;
  const parts = t.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  const [a, b, c] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  // For 3-part (h:mm:ss): minutes and seconds must be ≤ 59
  // For 2-part (m:ss): only seconds must be ≤ 59
  if (nums.length === 3) {
    if (b > 59 || c > 59) return null;
  } else {
    if (c > 59) return null;
  }
  return a * 3600 + b * 60 + c;
}
