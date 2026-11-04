import { useCallback, useRef, useState } from 'react'

type Rec = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function getCtor(): (new () => Rec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Dictate a tweak note with the browser's built-in speech recognition (free, no server).
 * Support varies: Chrome/Android work well; Tagalog/Bisaya accuracy is limited. Falls back to typing.
 */
export function useDictation(onText: (text: string) => void, lang = 'en-US') {
  const [listening, setListening] = useState(false)
  const rec = useRef<Rec | null>(null)
  const supported = typeof window !== 'undefined' && getCtor() !== null

  const toggle = useCallback(() => {
    if (listening) {
      rec.current?.stop()
      return
    }
    const Ctor = getCtor()
    if (!Ctor) return
    const r = new Ctor()
    r.lang = lang
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join(' ').trim()
      if (text) onText(text)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    setListening(true)
    r.start()
  }, [listening, lang, onText])

  return { supported, listening, toggle }
}
