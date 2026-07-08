const DAY_MS = 86_400_000;
const toUTC = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Consecutive-day streaks over YYYY-MM-DD dates (dupes/disorder ok). Current counts only if the last date is today or yesterday relative to `today`. */
export function streakInfo(dates: string[], today: string): { current: number; longest: number } {
  const uniq = [...new Set(dates)].sort();
  if (uniq.length === 0) return { current: 0, longest: 0 };
  let longest = 1;
  let run = 1;
  for (let i = 1; i < uniq.length; i++) {
    if (toUTC(uniq[i]) - toUTC(uniq[i - 1]) === DAY_MS) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }
  const daysSinceLast = Math.round((toUTC(today) - toUTC(uniq[uniq.length - 1])) / DAY_MS);
  return { current: daysSinceLast <= 1 ? run : 0, longest };
}
