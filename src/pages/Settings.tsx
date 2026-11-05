import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { Shell } from '../components/Shell'
import { useFeedback } from '../feedback'
import { exportEverything, listRecipes } from '../lib/api'
import { friendlyAuthError, isEmail, passwordProblem } from '../lib/authErrors'
import { useAsync, useInstall, useSettings, useTitle } from '../lib/hooks'
import { formatIngredient, type UnitSystem } from '../lib/parse'
import { AVOID, CUISINES, EFFORTS, KINDS } from '../lib/prefs'
import { ACCENTS, VOICE_LANGS, type TextSize } from '../lib/settings'
import { supabase } from '../lib/supabase'
import { applyTheme, loadTheme, saveTheme, type Theme } from '../lib/theme'
import { usePrefs } from '../prefs'
import { ArrowsClockwise, Check, CheckCircle, DeviceMobile, DownloadSimple, SignOut, Trash } from '@phosphor-icons/react'
import { Picker } from '../components/Picker'

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

const PROVIDER_LABEL: Record<string, string> = { email: 'Email and password', google: 'Google' }

export default function Settings() {
  useTitle('Me')
  const { session } = useAuth()
  const { prefs, name, saveName } = usePrefs()
  const { toast, confirm } = useFeedback()
  const install = useInstall()
  const recipes = useAsync(listRecipes, [])
  const [settings, update] = useSettings()
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [pw, setPw] = useState({ next: '', again: '' })
  const [newEmail, setNewEmail] = useState('')
  const [open, setOpen] = useState<'password' | 'email' | null>(null)

  const user = session?.user
  const email = user?.email ?? ''
  const providers = (user?.identities ?? []).map((i) => PROVIDER_LABEL[i.provider] ?? i.provider)
  const mine = recipes.data ?? []
  const cooks = mine.reduce((n, r) => n + r.cooked_count, 0)
  const since = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null
  const shownName = name ?? email.split('@')[0]

  function pick(t: Theme) {
    setTheme(t)
    applyTheme(t)
    saveTheme(t)
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault()
    try {
      await saveName(nameDraft ?? '')
      setNameDraft(null)
      toast('Name saved')
    } catch (er) {
      toast((er as Error).message, 'error')
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(pw.next)
    if (problem) return toast(problem, 'error')
    if (pw.next !== pw.again) return toast("The two passwords don't match.", 'error')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw.next })
    setBusy(false)
    if (error) return toast(friendlyAuthError(error.message), 'error')
    setPw({ next: '', again: '' })
    setOpen(null)
    toast('Password changed')
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!isEmail(newEmail)) return toast('That does not look like an email address.', 'error')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() }, { emailRedirectTo: `${window.location.origin}/` })
    setBusy(false)
    if (error) return toast(friendlyAuthError(error.message), 'error')
    setNewEmail('')
    setOpen(null)
    toast('Check your inbox to confirm the new address.')
  }

  async function signOutEverywhere() {
    const ok = await confirm({ title: 'Sign out of all devices?', body: 'You will need to sign in again on your phone, laptop and anywhere else.', confirmLabel: 'Sign out everywhere' })
    if (ok) await supabase.auth.signOut({ scope: 'global' })
  }

  async function deleteAccount() {
    if (!user) return
    const ok = await confirm({
      title: 'Delete your account?',
      body: 'This permanently deletes your account, recipes, tweak history, photos and quiz answers. It cannot be undone. Download your cookbook first if you want a copy.',
      confirmLabel: 'Delete everything',
      danger: true,
      requireText: 'DELETE',
    })
    if (!ok) return
    setBusy(true)
    try {
      // Photos live in files, not in the database, so remove them first.
      const bucket = supabase.storage.from('dish-photos')
      const { data: top } = await bucket.list(user.id, { limit: 1000 })
      const paths: string[] = []
      for (const entry of top ?? []) {
        if (entry.id === null) {
          const { data: files } = await bucket.list(`${user.id}/${entry.name}`, { limit: 1000 })
          for (const f of files ?? []) paths.push(`${user.id}/${entry.name}/${f.name}`)
        } else paths.push(`${user.id}/${entry.name}`)
      }
      if (paths.length) await bucket.remove(paths)
      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw new Error(error.message)
      Object.keys(localStorage).filter((k) => k.startsWith('tweaked.')).forEach((k) => localStorage.removeItem(k))
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      toast('Your account was deleted.')
    } catch (e) {
      setBusy(false)
      toast((e as Error).message || 'Could not delete the account. Try again.', 'error')
    }
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
          <span className="avatar" aria-hidden>{(shownName[0] ?? '?').toUpperCase()}</span>
          <div>
            <p><b>{shownName}</b></p>
            <p className="muted small">{email}{since ? ` · since ${since}` : ''}</p>
          </div>
        </div>
        <div className="mini-stats">
          <div className="stat"><b>{mine.length}</b><span>recipes</span></div>
          <div className="stat"><b>{cooks}</b><span>times cooked</span></div>
          <div className="stat"><b>{mine.filter((r) => r.lastTweak).length}</b><span>with tweaks</span></div>
        </div>

        <h2>Profile</h2>
        <form className="panel" onSubmit={submitName}>
          <label>
            <span>Your name</span>
            <input value={nameDraft ?? name ?? ''} onChange={(e) => setNameDraft(e.target.value)} placeholder="What should we call you?" maxLength={60} autoComplete="name" />
          </label>
          <button className="btn" disabled={nameDraft === null || nameDraft === (name ?? '')}>Save name</button>
        </form>

        <h2>My taste</h2>
        <div className="panel">
          <p><b>Cuisines</b><br /><span className="muted">{labels(prefs.cuisines, CUISINES, 'Anything')}</span></p>
          <p><b>Dishes</b><br /><span className="muted">{labels(prefs.kinds, KINDS, 'Anything')}</span></p>
          <p><b>Effort</b><br /><span className="muted">{labels([prefs.effort], EFFORTS, 'Easy')}</span></p>
          <p><b>Skipping</b><br /><span className="muted">{labels(prefs.avoid, AVOID, 'Nothing')}</span></p>
          <Link className="btn" to="/onboarding"><ArrowsClockwise size={18} aria-hidden /> Retake the taste quiz</Link>
        </div>

        <h2>Cooking</h2>
        <div className="setrow">
          <b>Show amounts in</b>
          <Seg<UnitSystem> value={settings.units} name="Units" onPick={(units) => update({ units })} options={[{ id: 'as-saved', label: 'As saved' }, { id: 'metric', label: 'Metric' }, { id: 'us', label: 'US cups' }]} />
        </div>
        <label className="switch card"><input type="checkbox" checked={settings.keepAwake} onChange={(e) => update({ keepAwake: e.target.checked })} /><span>Keep the screen on while cooking</span></label>
        <label className="switch card"><input type="checkbox" checked={settings.vibrate} onChange={(e) => update({ vibrate: e.target.checked })} /><span>Vibrate when a timer ends</span></label>
        <div className="setrow">
          <b>Voice notes language</b>
          <Picker label="Voice notes language" value={settings.voiceLang} onChange={(voiceLang) => update({ voiceLang })} options={VOICE_LANGS.map((l) => ({ id: l.id, label: l.label }))} />
        </div>

        <h2>Appearance</h2>
        <div className="setrow">
          <b>Accent colour</b>
          <div className="swatches" role="group" aria-label="Accent colour">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className="swatch"
                style={{ ['--sw' as string]: a.color }}
                aria-pressed={settings.accent === a.id}
                aria-label={a.label}
                title={a.label}
                onClick={() => update({ accent: a.id })}
              >
                {settings.accent === a.id && <Check size={18} weight="bold" aria-hidden />}
              </button>
            ))}
          </div>
        </div>
        <div className="setrow">
          <b>Theme</b>
          <Seg<Theme> value={theme} name="Theme" onPick={pick} options={[{ id: 'system', label: 'Match phone' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} />
        </div>
        <div className="setrow">
          <b>Text size</b>
          <Seg<TextSize> value={settings.textSize} name="Text size" onPick={(textSize) => update({ textSize })} options={[{ id: 's', label: 'Small' }, { id: 'm', label: 'Normal' }, { id: 'l', label: 'Large' }]} />
        </div>

        <h2>Get the app</h2>
        <div className="panel">
          {install.installed ? (
            <p className="with-icon"><CheckCircle size={20} weight="fill" aria-hidden /> Tweaked is installed on this device.</p>
          ) : install.canPrompt ? (
            <>
              <p className="muted">Install Tweaked for a full-screen app, offline use, and Share-to-Tweaked from Facebook (Android).</p>
              <button className="btn primary" onClick={install.install}><DeviceMobile size={18} aria-hidden /> Install Tweaked</button>
            </>
          ) : install.isIos ? (
            <p className="muted">On iPhone: tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.</p>
          ) : (
            <p className="muted">Open your browser's menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>
          )}
        </div>

        <h2>Sign-in &amp; security</h2>
        <div className="panel">
          <p><b>Signed in with</b><br /><span className="muted">{providers.join(', ') || 'Email and password'}</span></p>
          {open === 'password' ? (
            <form className="stack" onSubmit={changePassword}>
              <input type="password" placeholder="New password (8+ characters, letters and numbers)" aria-label="New password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              <input type="password" placeholder="Type it again" aria-label="Confirm new password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
              <div className="row"><button className="btn primary" disabled={busy}>Save password</button><button type="button" className="btn ghost" onClick={() => setOpen(null)}>Cancel</button></div>
            </form>
          ) : open === 'email' ? (
            <form className="stack" onSubmit={changeEmail}>
              <input type="email" placeholder="New email address" aria-label="New email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              <div className="row"><button className="btn primary" disabled={busy}>Send confirmation</button><button type="button" className="btn ghost" onClick={() => setOpen(null)}>Cancel</button></div>
            </form>
          ) : (
            <div className="row wrap">
              <button className="btn" onClick={() => setOpen('password')}>{providers.includes('Email and password') ? 'Change password' : 'Set a password'}</button>
              <button className="btn" onClick={() => setOpen('email')}>Change email</button>
            </div>
          )}
          <button className="btn" onClick={signOutEverywhere}><SignOut size={18} aria-hidden /> Sign out of all devices</button>
        </div>

        <h2>Your data</h2>
        <p className="muted small">Your cookbook is yours. Download all of it any time.</p>
        <div className="row wrap">
          <button className="btn" onClick={exportJson} disabled={busy}><DownloadSimple size={18} aria-hidden /> Download JSON</button>
          <button className="btn" onClick={exportMd} disabled={busy}><DownloadSimple size={18} aria-hidden /> Download Markdown</button>
        </div>
        <button className="btn" onClick={clearOffline}>Clear offline copies</button>
        {note && <p className="muted small" role="status">{note}</p>}
        {err && <p className="error" role="alert">{err}</p>}

        <h2>Tips</h2>
        <details className="help"><summary>What does “tweak” mean?</summary><p>Every time you cook, tell Tweaked what you changed (“less soy sauce”). Next time it shows that note first. Bigger changes can be saved as a new version, and the old one is never lost.</p></details>
        <details className="help"><summary>How are suggestions chosen?</summary><p>From your taste quiz and the dishes you cook most, using open recipe collections. We hide dishes with long ingredient lists or anything you chose to skip.</p></details>
        <details className="help"><summary>Can I add a dish from any website?</summary><p>Yes. In Discover, paste a recipe link, or on the Add page paste it into the caption box. Tweaked reads the ingredients and steps from the page and keeps a link back to the site. If a dish is not in our collections, “Search the web” looks for it on recipe sites (limited to a few lookups a day). Facebook, Instagram and TikTok posts cannot be read; copy their caption and paste it instead.</p></details>
        <details className="help"><summary>Does it work offline?</summary><p>Your own recipes and ones you opened recently work offline once the app is installed. Suggestions need a connection.</p></details>
        <details className="help"><summary>Install on your phone</summary><p>Open this site in your phone's browser and choose “Add to Home Screen”. It then opens like an app.</p></details>

        <h2>About</h2>
        <p className="muted small">
          Tweaked 1.0. Suggestions come from <a href="https://www.themealdb.com" target="_blank" rel="noreferrer">TheMealDB</a>, <a href="https://dummyjson.com/docs/recipes" target="_blank" rel="noreferrer">DummyJSON</a>, <a href="https://www.thecocktaildb.com" target="_blank" rel="noreferrer">TheCocktailDB</a> and <a href="https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents" target="_blank" rel="noreferrer">Wikibooks Cookbook</a>. Flag icons by <a href="https://github.com/twitter/twemoji" target="_blank" rel="noreferrer">Twemoji</a>.
        </p>
        <p className="small"><Link to="/terms">Terms of Use</Link> · <Link to="/privacy">Privacy Policy</Link> · <a href="https://github.com/SoulSej10/tweaked/issues" target="_blank" rel="noreferrer">Report a problem</a></p>

        <h2>Account</h2>
        <button className="btn" onClick={() => supabase.auth.signOut()}><SignOut size={18} aria-hidden /> Sign out</button>

        <h2 className="danger-title">Danger zone</h2>
        <div className="panel danger-zone">
          <p className="muted small">Permanently delete your account and everything in it.</p>
          <button className="btn danger" onClick={deleteAccount} disabled={busy}><Trash size={18} aria-hidden /> Delete my account</button>
        </div>
      </section>
    </Shell>
  )
}
