import { useRegisterSW } from 'virtual:pwa-register/react'
import { useOnline } from '../lib/hooks'
import { ArrowsClockwise, WifiSlash } from '@phosphor-icons/react'

/** Small notices pinned to the top: "you're offline" and "a new version is ready". */
export function Banners() {
  const online = useOnline()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Look for a new version now and then, so people on a long-open app still get fixes.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
    },
  })

  return (
    <div className="pillbar" aria-live="polite">
      {!online && <div className="pill-msg offline"><WifiSlash size={16} aria-hidden /> You're offline. Saved recipes still open.</div>}
      {needRefresh && (
        <div className="pill-msg update">
          <ArrowsClockwise size={16} aria-hidden /> A new version is ready.
          <button onClick={() => void updateServiceWorker(true)}>Reload</button>
        </div>
      )}
    </div>
  )
}
