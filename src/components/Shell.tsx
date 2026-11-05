import { BookOpen, Compass, House, Plus, UserCircle, type Icon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

const TABS: { to: string; label: string; icon: Icon; add?: boolean }[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/new', label: 'Add', icon: Plus, add: true },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/settings', label: 'Me', icon: UserCircle },
]

/** Page frame with the bottom tab bar (thumb-reachable on phones, floating pill on desktop). */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <main className="page" id="main" tabIndex={-1}>{children}</main>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `tab ${t.add ? 'add' : ''} ${isActive ? 'on' : ''}`} aria-label={t.label}>
            {({ isActive }) => (
              <>
                <t.icon size={t.add ? 22 : 24} weight={t.add ? 'bold' : isActive ? 'fill' : 'regular'} aria-hidden />
                <span>{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
