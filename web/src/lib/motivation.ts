type Msg = { emoji: string; msg: string };

export const MOTIVATIONS: Record<string, Msg[]> = {
  new_user: [
    { emoji: '🏆', msg: 'Welcome to Puzzle Geeks! Log your first puzzle to start tracking.' },
    { emoji: '🚀', msg: 'Ready to track your puzzling journey? Start by logging a session!' },
  ],
  streak_active: [
    { emoji: '🔥', msg: "You're on fire! {streak}-day streak going strong. Keep it alive!" },
    { emoji: '⚡', msg: "{streak} days straight! You're becoming a puzzle machine!" },
    { emoji: '🌟', msg: 'Day {streak} of your streak! Consistency is the secret sauce.' },
  ],
  improving: [
    { emoji: '📈', msg: "You've improved {imp}% from your early sessions. The grind pays off!" },
    { emoji: '🎉', msg: 'Getting faster! {imp}% improvement since you started. Keep pushing!' },
  ],
  lots_of_puzzles: [
    { emoji: '🧩', msg: "{total} puzzles completed! That's {pieces} pieces you've conquered." },
    { emoji: '💪', msg: "You've spent {hours}h puzzling. That's dedication!" },
  ],
  general: [
    { emoji: '🤔', msg: 'Tip: Consistent practice matters more than marathon sessions.' },
    { emoji: '💡', msg: 'Pro tip: Sort edge pieces first, then group by color/pattern.' },
    { emoji: '🎨', msg: 'Challenge yourself: Try a puzzle with an unusual color palette!' },
    { emoji: '⏰', msg: 'Speed puzzling secret: Look at the box less, trust your pattern recognition.' },
    { emoji: '🚀', msg: "The best puzzlers aren't fast at first. They're fast because they don't stop." },
  ],
};

interface MotivationStats {
  total_puzzles?: number;
  current_streak?: number;
  improvement_pct?: number;
  total_pieces?: number;
  total_time_hours?: number;
}

export function getMotivation(stats: MotivationStats, rand: () => number = Math.random): Msg {
  const pick = (arr: Msg[]) => arr[Math.floor(rand() * arr.length)];
  if (!stats.total_puzzles) return pick(MOTIVATIONS.new_user);
  if ((stats.current_streak ?? 0) >= 3) {
    const m = pick(MOTIVATIONS.streak_active);
    return { emoji: m.emoji, msg: m.msg.replace('{streak}', String(stats.current_streak)) };
  }
  if ((stats.improvement_pct ?? 0) > 5) {
    const m = pick(MOTIVATIONS.improving);
    return { emoji: m.emoji, msg: m.msg.replace('{imp}', String(Math.round(stats.improvement_pct!))) };
  }
  if ((stats.total_puzzles ?? 0) >= 5) {
    const m = pick(MOTIVATIONS.lots_of_puzzles);
    return {
      emoji: m.emoji,
      msg: m.msg
        .replace('{total}', String(stats.total_puzzles))
        .replace('{pieces}', (stats.total_pieces ?? 0).toLocaleString('en-US'))
        .replace('{hours}', String(stats.total_time_hours ?? 0)),
    };
  }
  return pick(MOTIVATIONS.general);
}
