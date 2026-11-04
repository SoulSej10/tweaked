import { Link } from 'react-router-dom'
import type { Dish } from '../lib/discover'
import { dishEmoji, tileIndex } from '../lib/emoji'

export function DishCard({ dish, wide = false }: { dish: Dish; wide?: boolean }) {
  return (
    <Link to={`/dish/${dish.id}`} className={`dcard ${wide ? 'wide' : ''}`}>
      <div className={`dthumb t${tileIndex(dish.name)}`}>
        <span className="demoji" aria-hidden>{dishEmoji(dish.name, [dish.category])}</span>
        {dish.thumb && <img src={`${dish.thumb}/medium`} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      </div>
      <div className="dbody">
        <h3>{dish.name}</h3>
        <p className="dmeta">
          {dish.cuisine && <span>{dish.cuisine}</span>}
          <span>{dish.ingredients.length} ingredients</span>
        </p>
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
