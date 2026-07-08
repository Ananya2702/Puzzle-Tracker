'use client';

import { useEffect, useState } from 'react';
import { getJSON } from '@/lib/api-client';
import { fmtDateFull } from '@/lib/format';
import './awards.css';

interface Achievement {
  id: number; code: string; name: string; description: string; icon: string;
  unlocked: boolean; unlockedDate: string | null;
}

const ICONS: Record<string, string> = {
  'puzzle-piece': '🧩', star: '⭐', fire: '🔥', trophy: '🏆', crown: '👑', gem: '💎',
  bolt: '⚡', mountain: '🏔️', calendar: '📅', flame: '🔥', rocket: '🚀',
  'chart-up': '📈', 'trending-up': '📊', grid: '🔢', globe: '🌍', moon: '🌙',
  medal: '🥇', clock: '⏰', sun: '☀️',
};

export default function AwardsPage() {
  const [items, setItems] = useState<Achievement[]>([]);
  useEffect(() => { void getJSON<Achievement[]>('/api/achievements').then(setItems); }, []);
  const unlocked = items.filter((a) => a.unlocked).length;

  return (
    <>
      <div className="page-head">
        <h1>Achievements</h1>
        <p className="desc">{items.length ? `${unlocked} of ${items.length} unlocked` : 'Your milestones'}</p>
      </div>
      <div className="awards-grid">
        {items.map((a) => (
          <div key={a.code} className={`card award ${a.unlocked ? 'unlocked' : 'locked'}`}>
            <div className="icon" aria-hidden>{ICONS[a.icon] ?? '🏅'}</div>
            <h4>{a.name}</h4>
            <p>{a.description}</p>
            {a.unlocked && a.unlockedDate ? <div className="date">Unlocked {fmtDateFull(a.unlockedDate)}</div> : null}
          </div>
        ))}
      </div>
    </>
  );
}
