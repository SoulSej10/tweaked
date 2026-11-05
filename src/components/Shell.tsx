import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

const ICONS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  book: <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
}

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  )
}

const TABS = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/recipes', label: 'Recipes', icon: 'book' },
  { to: '/new', label: 'Add', icon: 'plus', add: true },
  { to: '/discover', label: 'Discover', icon: 'compass' },
  { to: '/settings', label: 'Me', icon: 'user' },
] as const

/** Page frame with the bottom tab bar (thumb-reachable on phones, floating pill on desktop). */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <main className="page" id="main" tabIndex={-1}>{children}</main>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => `tab ${'add' in t ? 'add' : ''} ${isActive ? 'on' : ''}`}
            aria-label={t.label}
          >
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
