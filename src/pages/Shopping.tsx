import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Shell } from '../components/Shell'
import { useFeedback } from '../feedback'
import { addItems, clearAll, clearDone, removeItem, toggleItem, useShopping } from '../lib/shopping'

export default function Shopping() {
  const items = useShopping()
  const { confirm, toast } = useFeedback()
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const todo = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)

  function add(e: React.FormEvent) {
    e.preventDefault()
    // Allow "eggs, milk, rice" in one go.
    addItems(text.split(/[,\n]/))
    setText('')
  }

  async function share() {
    const body = todo.map((i) => `• ${i.text}`).join('\n')
    try {
      if (navigator.share) await navigator.share({ title: 'Shopping list', text: body })
      else {
        await navigator.clipboard.writeText(body)
        setCopied(true)
        toast('List copied')
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      /* share dismissed */
    }
  }

  return (
    <Shell>
      <header className="topbar">
        <h1>Shopping list</h1>
        {todo.length > 0 && <button className="btn" onClick={share}>{copied ? 'Copied ✓' : 'Share'}</button>}
      </header>

      <form className="addrow" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add items: eggs, rice, garlic" aria-label="Add items" enterKeyHint="done" />
        <button className="btn primary" disabled={!text.trim()}>Add</button>
      </form>

      {items.length === 0 && (
        <div className="empty">
          <p className="nudge-emoji" aria-hidden>🛒</p>
          <h2>Nothing to buy yet</h2>
          <p className="muted">Open any recipe and tap “Add to shopping list”, or type items above.</p>
          <Link className="btn" to="/discover">Find something to cook</Link>
        </div>
      )}

      {todo.length > 0 && (
        <ul className="shop">
          {todo.map((i) => (
            <li key={i.id}>
              <label className="check"><input type="checkbox" checked={false} onChange={() => toggleItem(i.id)} /><span>{i.text}{i.from && <small>{i.from}</small>}</span></label>
              <button className="x" onClick={() => removeItem(i.id)} aria-label={`Remove ${i.text}`}>×</button>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <>
          <div className="sec-head"><h2>In the basket ({done.length})</h2><button className="link" onClick={clearDone}>Clear checked</button></div>
          <ul className="shop done">
            {done.map((i) => (
              <li key={i.id}>
                <label className="check"><input type="checkbox" checked onChange={() => toggleItem(i.id)} /><span>{i.text}</span></label>
                <button className="x" onClick={() => removeItem(i.id)} aria-label={`Remove ${i.text}`}>×</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {items.length > 0 && <div className="pad"><button className="link danger" onClick={async () => { if (await confirm({ title: 'Clear the whole list?', body: 'Everything on your shopping list will be removed.', confirmLabel: 'Clear list', danger: true })) { clearAll(); toast('List cleared') } }}>Clear everything</button></div>}
    </Shell>
  )
}
