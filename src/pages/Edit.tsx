import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { addVersion, createRecipe, getRecipe, updateRecipeMeta, type RecipeFull } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { detectSource, formatIngredient, formatSteps, importCaption, parseIngredients, parseSteps } from '../lib/parse'
import { dishToRecipe } from '../lib/discover'
import { CUISINES, KINDS } from '../lib/prefs'
import { importUrl, recipeToDish } from '../lib/web'
import type { SourceType } from '../lib/types'
import { Carrot, ClipboardText, Globe, ListNumbers, PencilSimple } from '@phosphor-icons/react'
import { BackLink } from '../components/Brand'

const SOURCES: { id: SourceType; label: string }[] = [
  { id: 'own', label: 'My own' },
  { id: 'person', label: 'From someone' },
  { id: 'reel', label: 'Reel' },
  { id: 'link', label: 'Web link' },
]

const normTag = (t: string) => t.trim().toLowerCase().replace(/^#/, '')

export default function Edit() {
  const { id } = useParams()
  const { data, error, loading } = useAsync<RecipeFull | null>(() => (id ? getRecipe(id) : Promise.resolve(null)), [id])
  if (id && loading) return <main className="page"><p className="muted pad">Loading…</p></main>
  if (id && error) return <main className="page"><p className="error pad">{error}</p></main>
  return <Form key={id ?? 'new'} full={data} />
}

function Form({ full }: { full: RecipeFull | null }) {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editing = Boolean(full)
  const current = full?.versions.find((v) => v.id === full.recipe.current_version_id) ?? full?.versions[0]
  const r = full?.recipe

  // New recipes can arrive pre-filled: from a search ("Add Bicol Express myself") or from the phone's Share menu.
  const sharedText = full ? '' : params.get('caption') ?? ''
  const imported = sharedText ? importCaption(sharedText) : null
  const sharedUrl = full ? '' : params.get('url') ?? imported?.url ?? ''
  const sharedType = sharedUrl ? detectSource(sharedUrl).type : null

  const [title, setTitle] = useState(r?.title ?? params.get('title') ?? imported?.title ?? '')
  const [sourceType, setSourceType] = useState<SourceType>(r?.source_type ?? imported?.sourceType ?? sharedType ?? 'own')
  const [sourceUrl, setSourceUrl] = useState(r?.source_url ?? sharedUrl)
  const [sourceNote, setSourceNote] = useState(r?.source_note ?? (sharedText ? sharedText.slice(0, 600) : ''))
  const [servings, setServings] = useState<number | null>(r?.servings ?? null)
  const [tags, setTags] = useState(r?.tags.join(', ') ?? imported?.tags.join(', ') ?? '')
  const [bring, setBring] = useState(r?.bring_from_home ?? false)
  const [ingText, setIngText] = useState((current?.ingredients ?? []).map(formatIngredient).join('\n') || imported?.ingredients || '')
  const [stepText, setStepText] = useState(formatSteps(current?.steps ?? []) || imported?.steps || '')
  const [changeNote, setChangeNote] = useState(params.get('note') ?? '')
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const tagList = tags.split(',').map(normTag).filter(Boolean)
  const toggleTag = (t: string) => setTags((tagList.includes(t) ? tagList.filter((x) => x !== t) : [...tagList, t]).join(', '))

  const pastedLink = detectSource(caption)
  const linkOnly = Boolean(pastedLink.url) && caption.replace(pastedLink.url ?? '', '').trim().length < 12
  const readable = linkOnly && pastedLink.type === 'link' // a normal web page we can read, unlike Facebook/Instagram
  const [importing, setImporting] = useState(false)
  const [importErr, setImportErr] = useState<string | null>(null)

  async function importPage() {
    if (!pastedLink.url) return
    setImporting(true)
    setImportErr(null)
    try {
      const { recipe } = await importUrl(pastedLink.url)
      const dish = recipeToDish(recipe)
      const r = dishToRecipe(dish)
      setTitle((t) => t || recipe.title)
      setIngText(r.ingredients.map(formatIngredient).join('\n'))
      setStepText(r.steps.map((s) => s.text).join('\n'))
      setSourceUrl(recipe.url)
      setSourceType('link')
      setSourceNote(`Imported from ${recipe.site}`)
      if (recipe.servings) setServings(recipe.servings)
      setTags((t) => [...new Set([...t.split(',').map(normTag).filter(Boolean), ...r.meta.tags])].join(', '))
    } catch (e) {
      setImportErr((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  function runImport() {
    const out = importCaption(caption)
    if (out.title && !title) setTitle(out.title)
    if (out.ingredients) setIngText(out.ingredients)
    if (out.steps) setStepText(out.steps)
    if (out.url) {
      setSourceUrl(out.url)
      if (out.sourceType) setSourceType(out.sourceType)
    }
    if (out.tags.length) setTags((t) => [...new Set([...t.split(',').map(normTag).filter(Boolean), ...out.tags])].join(', '))
    if (!sourceNote) setSourceNote(caption.slice(0, 600))
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
        servings,
        tags: tagList,
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

  const ingCount = parseIngredients(ingText).length
  const stepCount = parseSteps(stepText).length

  return (
    <main className="page with-bar">
      <header className="topbar">
        <BackLink to={full ? `/recipe/${full.recipe.id}` : '/recipes'} />
        <h1>{editing ? 'Edit recipe' : 'New recipe'}</h1>
      </header>

      <form onSubmit={save} className="form pad">
        <section className="fcard">
          <input className="big" placeholder="What's it called?" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!editing} required aria-label="Title" />
          {!editing && <p className="muted small">Only the name is required. You can fill in the rest later, even while you cook.</p>}
        </section>

        {!editing && (
          <details className="fcard">
            <summary><ClipboardText size={18} aria-hidden /> Paste a caption or recipe text</summary>
            <p className="muted small">From Facebook, Instagram or TikTok: open the post, press and hold the caption to copy it, then paste it here. We pick out the ingredients, steps, hashtags and the link.</p>
            <textarea rows={5} placeholder="Paste a reel caption or recipe text" value={caption} onChange={(e) => setCaption(e.target.value)} />
            {linkOnly && !readable && <p className="callout-plain">That's just a link. Facebook and Instagram only show recipes to their own apps, so Tweaked can't read the post for you. <a href={pastedLink.url ?? '#'} target="_blank" rel="noreferrer">Open it</a>, copy the caption, and paste that here. We'll keep the link as the source.</p>}
            {readable && <p className="callout-plain">That looks like a web page. Tweaked can read the recipe from it for you.</p>}
            {importErr && <p className="error" role="alert">{importErr}</p>}
            {readable ? (
              <button type="button" className="btn primary" onClick={importPage} disabled={importing}>{importing ? 'Reading the page…' : <><Globe size={18} aria-hidden /> Import this page</>}</button>
            ) : (
              <button type="button" className="btn" onClick={runImport} disabled={!caption.trim()}>{linkOnly ? 'Save the link as the source' : 'Fill in the form'}</button>
            )}
          </details>
        )}

        {editing && (
          <p className="callout-plain">Changing ingredients or steps saves a new version (v{(full?.versions[0]?.version_number ?? 0) + 1}). The original stays untouched.</p>
        )}

        <section className="fcard">
          <label>
            <span className="with-icon"><Carrot size={18} aria-hidden /> Ingredients <small>{ingCount > 0 ? `${ingCount} listed` : 'one per line'}</small></span>
            <textarea rows={6} value={ingText} placeholder={'2 cups rice\n3 cloves garlic\n1 tbsp soy sauce'} onChange={(e) => setIngText(e.target.value)} />
          </label>
          <label>
            <span className="with-icon"><ListNumbers size={18} aria-hidden /> Steps <small>{stepCount > 0 ? `${stepCount} steps` : 'one per line, “simmer 10 min” adds a timer'}</small></span>
            <textarea rows={6} value={stepText} placeholder={'Fry the garlic until golden\nAdd the rice and stir-fry for 3 min'} onChange={(e) => setStepText(e.target.value)} />
          </label>
          {editing && (
            <label>
              <span className="with-icon"><PencilSimple size={18} aria-hidden /> What changed? <small>optional</small></span>
              <input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="less soy sauce, added chili" />
            </label>
          )}
        </section>

        <section className="fcard">
          <h2>Good to know</h2>
          <p className="muted small">Tags help Tweaked suggest dishes you will like.</p>
          <div className="chips-wrap">
            {CUISINES.map((c) => (
              <button type="button" key={c.id} className={`chip ${tagList.includes(c.id) ? 'on' : ''}`} onClick={() => toggleTag(c.id)}>{c.flag} {c.label}</button>
            ))}
          </div>
          <div className="chips-wrap">
            {KINDS.map((k) => {
              const tag = (k.categories[0] as string).toLowerCase()
              return <button type="button" key={k.id} className={`chip alt ${tagList.includes(tag) ? 'on' : ''}`} onClick={() => toggleTag(tag)}>{k.emoji} {k.label}</button>
            })}
          </div>
          <input placeholder="Other tags, comma separated" value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Tags" />
          <div className="row between">
            <span><b>Servings</b></span>
            <div className="scale">
              <button type="button" className="btn" onClick={() => setServings(servings && servings > 1 ? servings - 1 : null)} aria-label="Fewer servings">−</button>
              <strong>{servings ?? '–'}</strong>
              <button type="button" className="btn" onClick={() => setServings((servings ?? 0) + 1)} aria-label="More servings">+</button>
            </div>
          </div>
          <label className="check"><input type="checkbox" checked={bring} onChange={(e) => setBring(e.target.checked)} /> Good as packed food (bring from home)</label>
        </section>

        <section className="fcard">
          <h2>Where is it from?</h2>
          <div className="chips-wrap">
            {SOURCES.map((s) => (
              <button type="button" key={s.id} className={`chip ${sourceType === s.id ? 'on' : ''}`} onClick={() => setSourceType(s.id)}>{s.label}</button>
            ))}
          </div>
          {(sourceType === 'reel' || sourceType === 'link') && <input type="url" placeholder="https://…" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} aria-label="Source link" />}
          <input placeholder={sourceType === 'person' ? 'Who gave it to you? (e.g. Tita Mel)' : 'A note about the source (optional)'} value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} />
        </section>

        {err && <p className="error" role="alert">{err}</p>}
        <div className="actionbar">
          <button className="btn primary grow" disabled={busy || !title.trim()}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save recipe'}</button>
        </div>
      </form>
    </main>
  )
}
