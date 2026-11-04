import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { addVersion, createRecipe, getRecipe, updateRecipeMeta, type RecipeFull } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { formatIngredient, formatSteps, importCaption, parseIngredients, parseSteps } from '../lib/parse'
import type { SourceType } from '../lib/types'

export default function Edit() {
  const { id } = useParams()
  const { data, error, loading } = useAsync<RecipeFull | null>(() => (id ? getRecipe(id) : Promise.resolve(null)), [id])
  if (id && loading) return <main><p className="muted pad">Loading…</p></main>
  if (id && error) return <main><p className="error pad">{error}</p></main>
  return <Form key={id ?? 'new'} full={data} />
}

function Form({ full }: { full: RecipeFull | null }) {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editing = Boolean(full)
  const current = full?.versions.find((v) => v.id === full.recipe.current_version_id) ?? full?.versions[0]
  const r = full?.recipe

  const [title, setTitle] = useState(r?.title ?? '')
  const [sourceType, setSourceType] = useState<SourceType>(r?.source_type ?? 'own')
  const [sourceUrl, setSourceUrl] = useState(r?.source_url ?? '')
  const [sourceNote, setSourceNote] = useState(r?.source_note ?? '')
  const [servings, setServings] = useState(r?.servings ? String(r.servings) : '')
  const [tags, setTags] = useState(r?.tags.join(', ') ?? '')
  const [bring, setBring] = useState(r?.bring_from_home ?? false)
  const [ingText, setIngText] = useState((current?.ingredients ?? []).map(formatIngredient).join('\n'))
  const [stepText, setStepText] = useState(formatSteps(current?.steps ?? []))
  const [changeNote, setChangeNote] = useState(params.get('note') ?? '')
  const [caption, setCaption] = useState('')
  const [showMore, setShowMore] = useState(editing || Boolean(params.get('note')))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function runImport() {
    const out = importCaption(caption)
    if (out.title && !title) setTitle(out.title)
    if (out.ingredients) setIngText(out.ingredients)
    if (out.steps) setStepText(out.steps)
    if (!sourceNote) setSourceNote(caption)
    setShowMore(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const meta = {
        title: title.trim(),
        source_type: sourceType,
        source_url: sourceUrl.trim() || null,
        source_note: sourceNote.trim() || null,
        servings: servings ? Math.max(1, parseInt(servings, 10) || 1) : null,
        tags: tags.split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean),
        bring_from_home: bring,
      }
      const ingredients = parseIngredients(ingText)
      const steps = parseSteps(stepText)
      if (!full) {
        const newId = await createRecipe(meta, ingredients, steps)
        nav(`/recipe/${newId}`, { replace: true })
        return
      }
      await updateRecipeMeta(full.recipe.id, meta)
      const changed =
        JSON.stringify(ingredients) !== JSON.stringify(current?.ingredients ?? []) ||
        JSON.stringify(steps) !== JSON.stringify(current?.steps ?? [])
      if (changed) await addVersion(full.recipe.id, ingredients, steps, changeNote.trim() || null)
      nav(`/recipe/${full.recipe.id}`, { replace: true })
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="page with-bar">
      <header className="topbar">
        <Link to={full ? `/recipe/${full.recipe.id}` : '/recipes'} className="btn ghost">← Back</Link>
        <h1>{editing ? 'Edit' : 'New recipe'}</h1>
      </header>
      <form onSubmit={save} className="stack pad">
        <input
          className="big"
          placeholder="Title (the only required field)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={!editing}
          required
          aria-label="Title"
        />

        {!editing && (
          <details>
            <summary>Paste a caption to pre-fill</summary>
            <textarea rows={6} placeholder="Paste the reel caption or recipe text" value={caption} onChange={(e) => setCaption(e.target.value)} />
            <button type="button" className="btn" onClick={runImport} disabled={!caption.trim()}>Pre-fill from caption</button>
          </details>
        )}

        {!showMore && <button type="button" className="link" onClick={() => setShowMore(true)}>Add ingredients, steps, source…</button>}

        {showMore && (
          <>
            {editing && (
              <p className="muted small">
                Changing ingredients or steps saves a new version (v{(full?.versions[0]?.version_number ?? 0) + 1}). The original stays untouched.
              </p>
            )}
            <label>Ingredients <span className="muted small">one per line, like “200 g rice”</span>
              <textarea rows={7} value={ingText} onChange={(e) => setIngText(e.target.value)} />
            </label>
            <label>Steps <span className="muted small">one per line; “simmer 10 min” sets a timer</span>
              <textarea rows={7} value={stepText} onChange={(e) => setStepText(e.target.value)} />
            </label>
            {editing && (
              <label>What changed? <span className="muted small">optional</span>
                <input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="less soy sauce, added chili" />
              </label>
            )}
            <div className="grid2">
              <label>Source
                <select value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
                  <option value="own">My own</option>
                  <option value="reel">Reel</option>
                  <option value="link">Web link</option>
                  <option value="person">From someone</option>
                </select>
              </label>
              <label>Servings
                <input inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value.replace(/\D/g, ''))} />
              </label>
            </div>
            {(sourceType === 'reel' || sourceType === 'link') && (
              <input type="url" placeholder="https://…" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} aria-label="Source link" />
            )}
            <input placeholder="Source note (e.g. from Tita Mel)" value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} />
            <input placeholder="Tags, comma separated" value={tags} onChange={(e) => setTags(e.target.value)} />
            <label className="check"><input type="checkbox" checked={bring} onChange={(e) => setBring(e.target.checked)} /> Good as packed food (bring from home)</label>
          </>
        )}

        {err && <p className="error" role="alert">{err}</p>}
        <div className="actionbar">
          <button className="btn primary grow" disabled={busy || !title.trim()}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </main>
  )
}
