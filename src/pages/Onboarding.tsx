import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AVOID, CUISINES, EFFORTS, KINDS, toggle, type Effort, type Preferences } from '../lib/prefs'
import { usePrefs } from '../prefs'
import { Brand } from '../components/Brand'
import { CookingPot, Hourglass, Lightning } from '@phosphor-icons/react'

const STEPS = ['welcome', 'cuisines', 'kinds', 'effort', 'avoid'] as const

export default function Onboarding() {
  const { prefs, onboarded, save } = usePrefs()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Preferences>(prefs)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const last = step === STEPS.length - 1
  const name = STEPS[step]

  async function finish(p: Preferences) {
    setBusy(true)
    setErr(null)
    try {
      await save(p)
      nav('/', { replace: true })
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="quiz">
      <header className="quiz-top">
        <div className="dots" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="Progress">
          {STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}
        </div>
        <button className="link" onClick={() => finish(onboarded ? prefs : draft)} disabled={busy}>{onboarded ? 'Cancel' : 'Skip'}</button>
      </header>

      <section className="quiz-body rise" key={name}>
        {name === 'welcome' && (
          <>
            <Brand />
            <h1>Let's make this kitchen yours</h1>
            <p className="lead">Four quick taps and Tweaked will fill your home screen with easy dishes you will actually want to cook. You can change any of it later.</p>
          </>
        )}

        {name === 'cuisines' && (
          <>
            <h1>Whose cooking do you love?</h1>
            <p className="lead">Pick as many as you like.</p>
            <div className="tiles">
              {CUISINES.map((c) => (
                <button key={c.id} className={`tile ${draft.cuisines.includes(c.id) ? 'on' : ''}`} aria-pressed={draft.cuisines.includes(c.id)} onClick={() => setDraft((d) => ({ ...d, cuisines: toggle(d.cuisines, c.id) }))}>
                  <span className="tile-emoji" aria-hidden>{c.flag}</span>{c.label}
                </button>
              ))}
            </div>
          </>
        )}

        {name === 'kinds' && (
          <>
            <h1>What do you like to eat?</h1>
            <p className="lead">Mains, breakfast, pastries, anything. Pick a few.</p>
            <div className="tiles">
              {KINDS.map((k) => (
                <button key={k.id} className={`tile ${draft.kinds.includes(k.id) ? 'on' : ''}`} aria-pressed={draft.kinds.includes(k.id)} onClick={() => setDraft((d) => ({ ...d, kinds: toggle(d.kinds, k.id) }))}>
                  <span className="tile-emoji" aria-hidden>{k.emoji}</span>{k.label}
                </button>
              ))}
            </div>
          </>
        )}

        {name === 'effort' && (
          <>
            <h1>How much effort?</h1>
            <p className="lead">We keep every suggestion simple. This sets how simple.</p>
            <div className="options">
              {EFFORTS.map((e) => (
                <button key={e.id} className={`option ${draft.effort === e.id ? 'on' : ''}`} aria-pressed={draft.effort === e.id} onClick={() => setDraft((d) => ({ ...d, effort: e.id as Effort }))}>
                  <span className="tile-emoji" aria-hidden>{e.icon === 'lightning' ? <Lightning size={26} weight="duotone" /> : e.icon === 'pot' ? <CookingPot size={26} weight="duotone" /> : <Hourglass size={26} weight="duotone" />}</span>
                  <span><b>{e.label}</b><small>{e.hint}</small></span>
                </button>
              ))}
            </div>
          </>
        )}

        {name === 'avoid' && (
          <>
            <h1>Anything to skip?</h1>
            <p className="lead">We will hide dishes that contain these. Pick none if you eat everything.</p>
            <div className="tiles">
              {AVOID.map((a) => (
                <button key={a.id} className={`tile ${draft.avoid.includes(a.id) ? 'on' : ''}`} aria-pressed={draft.avoid.includes(a.id)} onClick={() => setDraft((d) => ({ ...d, avoid: toggle(d.avoid, a.id) }))}>
                  <span className="tile-emoji" aria-hidden>{a.emoji}</span>{a.label}
                </button>
              ))}
            </div>
          </>
        )}
        {err && <p className="error" role="alert">{err}</p>}
      </section>

      <footer className="quiz-nav">
        {step > 0 && <button className="btn" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
        <button className="btn primary grow big" disabled={busy} onClick={() => (last ? finish(draft) : setStep(step + 1))}>
          {busy ? 'Setting up…' : last ? 'Show me dishes' : step === 0 ? "Let's go" : 'Next'}
        </button>
      </footer>
    </main>
  )
}
