'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './shell.css';

const LINKS = [
  { href: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { href: '/timer', icon: '⏱️', label: 'Timer' },
  { href: '/log', icon: '➕', label: 'Log' },
  { href: '/history', icon: '📜', label: 'History' },
  { href: '/analytics', icon: '📈', label: 'Analytics' },
  { href: '/goals', icon: '🎯', label: 'Goals' },
  { href: '/awards', icon: '🏆', label: 'Awards' },
  { href: '/settings', icon: '⚙️', label: 'Settings' },
];

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">◆ Puzzle Geeks</div>
      <nav aria-label="Main">
        {LINKS.map((l) => {
          const active = pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="icon" aria-hidden>{l.icon}</span>
              <span className="label-text">{l.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">@{username}</div>
    </aside>
  );
}
