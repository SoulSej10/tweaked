import { ArrowLeft, CookingPot } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

/** The wordmark: the name over a highlighter stroke, the same marker used for tweaks across the app. */
export function Brand({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <div className={`brand ${size}`}>
      <span className="brand-mark" aria-hidden><CookingPot size={size === 'lg' ? 30 : 20} weight="duotone" /></span>
      <span className="brand-name">Tweaked</span>
    </div>
  )
}

export function BackLink({ to, label = 'Back' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="btn ghost back">
      <ArrowLeft size={18} aria-hidden /> {label}
    </Link>
  )
}
