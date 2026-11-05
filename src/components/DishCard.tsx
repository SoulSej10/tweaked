import { Link } from 'react-router-dom'
import { thumbUrl, type Dish } from '../lib/discover'
import { dishEmoji, tileIndex } from '../lib/emoji'

export type PantryNote = { have: number; total: number; missing: string[] }

export function DishCard({ dish, wide = false, note }: { dish: Dish; wide?: boolean; note?: PantryNote }) {
  return (
    <Link to={`/dish/${encodeURIComponent(dish.id)}`} className={`dcard ${wide ? 'wide' : ''}`}>
      <div className={`dthumb t${tileIndex(dish.name)}`}>
        <span className="demoji" aria-hidden>{dishEmoji(dish.name, [dish.category])}</span>
        {dish.thumb && <img src={thumbUrl(dish, 'small')} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      </div>
      <div className="dbody">
        <h3>{dish.name}</h3>
        <p className="dmeta">
          {dish.cuisine && <span>{dish.cuisine}</span>}
          <span>{dish.minutes ? `${dish.minutes} min` : `${dish.ingredients.length} ingredients`}</span>
        </p>
        {note && (
          <p className="pnote">
            <b>Have {note.have} of {note.total}</b>
            {note.missing.length > 0 ? ` · need ${note.missing.slice(0, 3).join(', ')}${note.missing.length > 3 ? ` +${note.missing.length - 3}` : ''}` : ' · nothing to buy'}
          </p>
        )}
      </div>
    </Link>
  )
}

export function DishSkeletons({ n = 4 }: { n?: number }) {
  return (
    <div className="rail" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="dcard skeleton">
          <div className="dthumb" />
          <div className="dbody"><span className="sk-line" /><span className="sk-line short" /></div>
        </div>
      ))}
    </div>
  )
}
