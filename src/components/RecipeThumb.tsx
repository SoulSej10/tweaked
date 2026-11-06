import { dishEmoji, tileIndex } from '../lib/emoji'

/** A recipe's picture, or its emoji tile while there is none (or it fails to load). */
export function RecipeThumb({ title, tags, src, mini = false }: { title: string; tags: string[]; src?: string; mini?: boolean }) {
  return (
    <span className={`${mini ? 'mini-tile' : 'rtile'} t${tileIndex(title)}`} aria-hidden>
      {dishEmoji(title, tags)}
      {src && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} />}
    </span>
  )
}
