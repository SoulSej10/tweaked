import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { Shell } from '../components/Shell'
import { exportEverything, listRecipes } from '../lib/api'
import { useAsync, useSettings } from '../lib/hooks'
import { formatIngredient, type UnitSystem } from '../lib/parse'
import { AVOID, CUISINES, EFFORTS, KINDS } from '../lib/prefs'
import { VOICE_LANGS, type TextSize } from '../lib/settings'
import { supabase } from '../lib/supabase'
import { applyTheme, loadTheme, saveTheme, type Theme } from '../lib/theme'
import { usePrefs } from '../prefs'

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const labels = (ids: string[], list: readonly { id: string; label: string }[], empty: string) =>
  ids.map((id) => list.find((x) => x.id === id)?.label).filter(Boolean).join(', ') || empty

function Seg<T extends string>({ value, options, onPick, name }: { value: T; options: readonly { id: T; label: string }[]; onPick: (v: T) => void; name: string }) {
  return (
    <div className="chips-wrap" role="group" aria-label={name}>
      {options.map((o) => (
        <button key={o.id} className={`chip ${value === o.id ? 'on' : ''}`} aria-pressed={value === o.id} onClick={() => onPick(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

export default function Settings() {
  const { session } = useAuth()
  const { prefs } = usePrefs()
  const recipes = useAsync(listRecipes, [])
  const [settings, update] = useSettings()
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const email = session?.user.email ?? ''
  const mine = recipes.data ?? []
  const cooks = mine.reduce((n, r) => n + r.cooked_count, 0)
  const since = session?.user.created_at ? new Date(session.user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null

  function pick(t: Theme) {
    setTheme(t)
    applyTheme(t)
    saveTheme(t)
  }

  async function exportJson() {
    setBusy(true)
    setErr(null)
    try {
      download('tweaked-cookbook.json', JSON.stringify(await exportEverything(), null, 2), 'application/json')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function exportMd() {
    setBusy(true)
    setErr(null)
    try {
      const all = await exportEverything()
      const out = ['# My cookbook\n']
      for (const r of all.recipes) {
        const vs = all.versions.filter((v) => v.recipe_id === r.id).sort((a, b) => a.version_number - b.version_number)
        const cur = vs.find((v) => v.id === r.current_version_id) ?? vs[vs.length - 1]
        out.push(`## ${r.title}\n`)
        if (r.tags.length) out.push(`Tags: ${r.tags.join(', ')}\n`)
        if (r.source_url) out.push(`Source: ${r.source_url}\n`)
        if (cur) {
          out.push(`### Ingredients (v${cur.version_number})\n`, ...cur.ingredients.map((i) => `- ${formatIngredient(i)}`), '')
          out.push('### Steps\n', ...cur.steps.map((s, n) => `${n + 1}. ${s.text}`), '')
        }
        const logs = all.cook_logs.filter((l) => l.recipe_id === r.id && l.tweak_note)
        if (logs.length) out.push('### Tweaks\n', ...logs.map((l) => `- ${new Date(l.cooked_at).toLocaleDateString()}: ${l.tweak_note}`), '')
      }
      download('tweaked-cookbook.md', out.join('\n'), 'text/markdown')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function clearOffline() {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('tweaked.dish.')).forEach((k) => localStorage.removeItem(k))
      for (const k of await caches.keys()) await caches.delete(k)
      setNote('Offline copies cleared. Suggestions will reload fresh.')
    } catch {
      setNote('Nothing to clear.')
    }
  }

  return (
    <Shell>
      <header className="topbar"><h1>Me</h1></header>
      <section className="pad stack">
        <div className="profile">
          <span className="avatar" aria-hidden>{(email[0] ?? '?').toUpperCase()}</span>
          <div>
            <p><b>{email || 'Signed in'}</b></p>
            <p className="muted small">{since ? `Cooking with Tweaked since ${since}` : 'Welcome back'}</p>
          </div>
        </div>
        <div className="mini-stats">
          <div className="stat"><b>{mine.length}</b><span>recipes</span></div>
          <div className="stat"><b>{cooks}</b><span>times cooked</span></div>
          <div className="stat"><b>{mine.filter((r) => r.lastTweak).length}</b><span>with tweaks</span></div>
        </div>

        <h2>My taste</h2>
        <div className="panel">
          <p><b>Cuisines</b><br /><span className="muted">{labels(prefs.cuisines, CUISINES, 'Anything')}</span></p>
          <p><b>Dishes</b><br /><span className="muted">{labels(prefs.kinds, KINDS, 'Anything')}</span></p>
          <p><b>Effort</b><br /><span className="muted">{labels([prefs.effort], EFFORTS, 'Easy')}</span></p>
          <p><b>Skipping</b><br /><span className="muted">{labels(prefs.avoid, AVOID, 'Nothing')}</span></p>
          <Link className="btn" to="/onboarding">Retake the taste quiz</Link>
        </div>

        <h2>Cooking</h2>
        <div className="setrow">
          <b>Show amounts in</b>
          <Seg<UnitSystem> value={settings.units} name="Units" onPick={(units) => update({ units })} options={[{ id: 'as-saved', label: 'As saved' }, { id: 'metric', label: 'Metric' }, { id: 'us', label: 'US cups' }]} />
        </div>
        <label className="switch card"><input type="checkbox" checked={settings.keepAwake} onChange={(e) => update({ keepAwake: e.target.checked })} /><span>Keep the screen on while cooking</span></label>
        <label className="switch card"><input type="checkbox" checked={settings.vibrate} onChange={(e) => update({ vibrate: e.target.checked })} /><span>Vibrate when a timer ends</span></label>
        <label className="setrow">
          <b>Voice notes language</b>
          <select value={settings.voiceLang} onChange={(e) => update({ voiceLang: e.target.value })}>
            {VOICE_LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>

        <h2>Appearance</h2>
        <div className="setrow">
          <b>Theme</b>
          <Seg<Theme> value={theme} name="Theme" onPick={pick} options={[{ id: 'system', label: 'Match phone' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} />
        </div>
        <div className="setrow">
          <b>Text size</b>
          <Seg<TextSize> value={settings.textSize} name="Text size" onPick={(textSize) => update({ textSize })} options={[{ id: 's', label: 'Small' }, { id: 'm', label: 'Normal' }, { id: 'l', label: 'Large' }]} />
        </div>

        <h2>Your data</h2>
        <p className="muted small">Your cookbook is yours. Download all of it any time.</p>
        <div className="row wrap">
          <button className="btn" onClick={exportJson} disabled={busy}>Download JSON</button>
          <button className="btn" onClick={exportMd} disabled={busy}>Download Markdown</button>
        </div>
        <button className="btn" onClick={clearOffline}>Clear offline copies</button>
        {note && <p className="muted small" role="status">{note}</p>}
        {err && <p className="error" role="alert">{err}</p>}

        <h2>Tips</h2>
        <details className="help"><summary>What does “tweak” mean?</summary><p>Every time you cook, tell Tweaked what you changed (“less soy sauce”). Next time it shows that note first. Bigger changes can be saved as a new version, and the old one is never lost.</p></details>
        <details className="help"><summary>How are suggestions chosen?</summary><p>From your taste quiz and the dishes you cook most, using open recipe collections. We hide dishes with long ingredient lists or anything you chose to skip.</p></details>
        <details className="help"><summary>Does it work offline?</summary><p>Your own recipes and ones you opened recently work offline once the app is installed. Suggestions need a connection.</p></details>
        <details className="help"><summary>Install on your phone</summary><p>Open this site in your phone's browser and choose “Add to Home Screen”. It then opens like an app.</p></details>

        <h2>About</h2>
        <p className="muted small">
          Tweaked 1.0. Suggestions come from <a href="https://www.themealdb.com" target="_blank" rel="noreferrer">TheMealDB</a>, <a href="https://dummyjson.com/docs/recipes" target="_blank" rel="noreferrer">DummyJSON</a> and <a href="https://www.thecocktaildb.com" target="_blank" rel="noreferrer">TheCocktailDB</a>. Flag icons by <a href="https://github.com/twitter/twemoji" target="_blank" rel="noreferrer">Twemoji</a>.
        </p>

        <h2>Account</h2>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </section>
    </Shell>
  )
}
