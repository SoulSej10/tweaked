import { Check, Copy, LinkSimple, ShareNetwork, TextAa, Trash } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { useFeedback } from '../feedback'
import { useAsync } from '../lib/hooks'
import { createShare, describeShare, listShares, revokeShare, type ShareKind } from '../lib/share'

/**
 * "Share this recipe": make a private link (for one person, or for anyone), see the links you made
 * and stop any of them, or send the recipe as plain text.
 */
export function ShareSheet({ recipeId, title, open, onClose, asText }: { recipeId: string; title: string; open: boolean; onClose: () => void; asText: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { toast, confirm } = useFeedback()
  const [kind, setKind] = useState<ShareKind>('once')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ url: string; kind: ShareKind } | null>(null)
  const [tick, setTick] = useState(0)
  const links = useAsync(() => (open ? listShares(recipeId) : Promise.resolve([])), [recipeId, open, tick])

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  async function make() {
    setBusy(true)
    try {
      const r = await createShare(recipeId, kind)
      setCreated({ url: r.url, kind })
      setTick((t) => t + 1)
      toast('Link ready')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied')
    } catch {
      toast('Could not copy. Press and hold the link to copy it.', 'error')
    }
  }

  async function send(url: string) {
    try {
      if (navigator.share) await navigator.share({ title, text: `A recipe from Tweaked: ${title}`, url })
      else await copy(url)
    } catch {
      /* share sheet dismissed */
    }
  }

  async function stop(id: string) {
    const ok = await confirm({ title: 'Stop this link?', body: 'Anyone who has it will no longer be able to open the recipe. People who already saved a copy keep it.', confirmLabel: 'Stop link', danger: true })
    if (!ok) return
    try {
      await revokeShare(id)
      setTick((t) => t + 1)
      toast('Link stopped')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const close = () => {
    setCreated(null)
    onClose()
  }
  const list = links.data ?? []

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="share-title"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        if (e.target === dialog.current) close()
      }}
    >
      <div className="sheet-handle" aria-hidden />
      <h2 id="share-title" className="sheet-title">Share “{title}”</h2>

      {created ? (
        <div className="share-done">
          <p className="with-icon"><Check size={20} weight="bold" aria-hidden /> <b>Your link is ready</b></p>
          <p className="muted small">
            {created.kind === 'once'
              ? 'It works for one person: the first person to open it keeps it, and anyone else will see that it was already used. It lasts 7 days. Nobody needs an account to look.'
              : 'Anyone who gets this link can read the recipe for 7 days. Nobody needs an account to look.'}
          </p>
          <input className="linkbox" readOnly value={created.url} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
          <div className="row wrap">
            <button className="btn primary" onClick={() => send(created.url)}><ShareNetwork size={18} aria-hidden /> Send</button>
            <button className="btn" onClick={() => copy(created.url)}><Copy size={18} aria-hidden /> Copy link</button>
            <button className="btn ghost" onClick={() => setCreated(null)}>Make another</button>
          </div>
          <p className="muted small">This link is shown only now. If you lose it, make a new one.</p>
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label="Who can open the link" className="sheet-list">
            <button type="button" role="radio" aria-checked={kind === 'once'} className={`sheet-opt ${kind === 'once' ? 'on' : ''}`} onClick={() => setKind('once')}>
              <span><b>Just one person</b><small>The first person to open it keeps it. Anyone else sees “already used”.</small></span>
              {kind === 'once' && <Check size={20} weight="bold" aria-hidden />}
            </button>
            <button type="button" role="radio" aria-checked={kind === 'open'} className={`sheet-opt ${kind === 'open' ? 'on' : ''}`} onClick={() => setKind('open')}>
              <span><b>Anyone with the link</b><small>Works for everyone you send it to.</small></span>
              {kind === 'open' && <Check size={20} weight="bold" aria-hidden />}
            </button>
          </div>
          <p className="muted small share-note">Links last 7 days. People can view the recipe without an account, and sign up only if they want to save a copy. They see the recipe as it is now, without your notes or photos.</p>
          <button className="btn primary full" onClick={make} disabled={busy}><LinkSimple size={18} aria-hidden /> {busy ? 'Making link…' : 'Create link'}</button>
        </>
      )}

      {list.length > 0 && (
        <div className="share-list">
          <h3>Links you made</h3>
          <ul className="plain">
            {list.map((s) => {
              const st = describeShare(s)
              return (
                <li key={s.id}>
                  <span>
                    <b>{s.kind === 'once' ? 'One person' : 'Anyone'}</b>
                    <small className={st.live ? 'live' : ''}>{st.label} · {new Date(s.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small>
                  </span>
                  {st.live && <button className="icon-btn small" onClick={() => stop(s.id)} aria-label="Stop this link"><Trash size={16} aria-hidden /></button>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="row wrap share-foot">
        <button className="btn" onClick={() => void asText().then(close)}><TextAa size={18} aria-hidden /> Share as text instead</button>
        <button className="btn ghost" onClick={close}>Close</button>
      </div>
    </dialog>
  )
}
