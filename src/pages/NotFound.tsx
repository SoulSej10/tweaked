import { Link } from 'react-router-dom'
import { useTitle } from '../lib/hooks'

export default function NotFound() {
  useTitle('Page not found')
  return (
    <main className="splash">
      <p className="splash-emoji" aria-hidden>🍽️</p>
      <h1>Nothing on this plate</h1>
      <p className="muted">That page doesn't exist, or the link is out of date.</p>
      <div className="row center wrap" style={{ marginTop: 12 }}>
        <Link className="btn primary" to="/">Go home</Link>
        <Link className="btn" to="/discover">Find a dish</Link>
      </div>
    </main>
  )
}
