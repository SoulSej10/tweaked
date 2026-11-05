import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type Toast = { id: number; text: string; kind: 'ok' | 'error' }
type ConfirmOptions = {
  title: string
  body?: string
  confirmLabel?: string
  danger?: boolean
  /** Make the person type this word before the button works (for things that cannot be undone). */
  requireText?: string
}

type Feedback = {
  toast: (text: string, kind?: 'ok' | 'error') => void
  confirm: (o: ConfirmOptions) => Promise<boolean>
}

const Ctx = createContext<Feedback>({ toast: () => {}, confirm: async () => false })

/** Small messages ("Saved") and proper confirm dialogs, in place of the browser's pop-ups. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const [typed, setTyped] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const next = useRef(1)

  const toast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = next.current++
    setToasts((t) => [...t.slice(-2), { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200)
  }, [])

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setTyped('')
        setAsk({ ...o, resolve })
      }),
    [],
  )

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (ask && !d.open) d.showModal()
    if (!ask && d.open) d.close()
  }, [ask])

  function answer(v: boolean) {
    ask?.resolve(v)
    setAsk(null)
  }

  const blocked = Boolean(ask?.requireText) && typed.trim().toLowerCase() !== ask?.requireText?.toLowerCase()

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
      <dialog ref={dialog} className="dlg" onCancel={(e) => { e.preventDefault(); answer(false) }} aria-labelledby="dlg-title">
        {ask && (
          <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (!blocked) answer(true) }}>
            <h2 id="dlg-title">{ask.title}</h2>
            {ask.body && <p className="muted">{ask.body}</p>}
            {ask.requireText && (
              <label>
                <span className="small">Type <b>{ask.requireText}</b> to confirm</span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
              </label>
            )}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" className="btn" onClick={() => answer(false)}>Cancel</button>
              <button className={`btn ${ask.danger ? 'danger' : 'primary'}`} disabled={blocked}>{ask.confirmLabel ?? 'OK'}</button>
            </div>
          </form>
        )}
      </dialog>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useFeedback = () => useContext(Ctx)
