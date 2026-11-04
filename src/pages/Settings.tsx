import { useState } from 'react'
import { Link } from 'react-router-dom'
import { exportEverything } from '../lib/api'
import { formatIngredient } from '../lib/parse'
import { supabase } from '../lib/supabase'

import { applyTheme, loadTheme, saveTheme, type Theme } from '../lib/theme'

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function Settings() {
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function pick(t: Theme) {
    setTheme(t)
    applyTheme(t)
    saveTheme(t)
  }

  async function exportJson() {
    setBusy(true); setErr(null)
    try {
      download('tweaked-cookbook.json', JSON.stringify(await exportEverything(), null, 2), 'application/json')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function exportMd() {
    setBusy(true); setErr(null)
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
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <main>
      <header className="bar">
        <Link to="/" className="btn ghost">← Library</Link>
        <h1>Settings</h1>
      </header>
      <section className="pad stack">
        <h2>Theme</h2>
        <div className="chips">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} className={`chip ${theme === t ? 'on' : ''}`} onClick={() => pick(t)}>{t}</button>
          ))}
        </div>
        <h2>Export</h2>
        <p className="muted small">Your cookbook is yours. Download all of it any time.</p>
        <button className="btn" onClick={exportJson} disabled={busy}>Download JSON</button>
        <button className="btn" onClick={exportMd} disabled={busy}>Download Markdown</button>
        {err && <p className="error" role="alert">{err}</p>}
        <h2>Account</h2>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </section>
    </main>
  )
}
