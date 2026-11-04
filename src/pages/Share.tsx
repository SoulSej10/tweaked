import { Navigate, useSearchParams } from 'react-router-dom'

/**
 * Landing page for the phone's Share menu. Once Tweaked is installed, "Share → Tweaked" from the
 * Facebook / Instagram / TikTok app arrives here with the post's text and link, and we hand it
 * to the new-recipe form, which sorts out ingredients and steps.
 */
export default function Share() {
  const [params] = useSearchParams()
  const title = params.get('title') ?? ''
  const text = params.get('text') ?? ''
  const url = params.get('url') ?? ''
  // Some apps put the link inside the text instead of the url field; the form finds it either way.
  const caption = [title, text].filter((x, i, a) => x && a.indexOf(x) === i).join('\n')
  const next = new URLSearchParams()
  if (caption) next.set('caption', caption)
  if (url) next.set('url', url)
  return <Navigate to={`/new?${next}`} replace />
}
