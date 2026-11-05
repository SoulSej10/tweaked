import { CaretDown, Check } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'

export type PickerOption<T extends string> = { id: T; label: string; hint?: string }

/**
 * A dropdown that looks like the rest of the app. The browser's own <select> popup cannot be styled
 * (on Android it is a dark-olive system sheet), so this opens a bottom sheet in our colours instead.
 */
export function Picker<T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T
  options: readonly PickerOption<T>[]
  onChange: (v: T) => void
  /** Names the control for screen readers and titles the sheet. */
  label: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const current = options.find((o) => o.id === value) ?? options[0]

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  function pick(v: T) {
    onChange(v)
    setOpen(false)
  }

  return (
    <>
      <button type="button" className={`picker-btn ${className}`} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${current?.label ?? ''}`}>
        <span>{current?.label}</span>
        <CaretDown size={16} aria-hidden />
      </button>
      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby={titleId}
        onCancel={(e) => {
          e.preventDefault()
          setOpen(false)
        }}
        onClick={(e) => {
          // a tap on the dimmed area (the dialog element itself) closes it
          if (e.target === dialog.current) setOpen(false)
        }}
      >
        <div className="sheet-handle" aria-hidden />
        <h2 id={titleId} className="sheet-title">{label}</h2>
        <div role="radiogroup" aria-labelledby={titleId} className="sheet-list">
          {options.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={o.id === value} className={`sheet-opt ${o.id === value ? 'on' : ''}`} onClick={() => pick(o.id)}>
              <span>
                <b>{o.label}</b>
                {o.hint && <small>{o.hint}</small>}
              </span>
              {o.id === value && <Check size={20} weight="bold" aria-hidden />}
            </button>
          ))}
        </div>
      </dialog>
    </>
  )
}
