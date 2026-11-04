import type { UnitSystem } from './parse'

export type TextSize = 's' | 'm' | 'l'

export type Settings = {
  units: UnitSystem // default units on recipe pages
  keepAwake: boolean // keep the screen on in Cook mode
  vibrate: boolean // buzz when a step timer ends
  voiceLang: string // dictation language for tweak notes
  textSize: TextSize
}

export const DEFAULT_SETTINGS: Settings = { units: 'as-saved', keepAwake: true, vibrate: true, voiceLang: 'en-US', textSize: 'm' }

export const VOICE_LANGS = [
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-PH', label: 'English (Philippines)' },
  { id: 'fil-PH', label: 'Filipino / Tagalog' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'es-ES', label: 'Español' },
] as const

const KEY = 'tweaked.settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const p = JSON.parse(raw) as Partial<Settings>
    return {
      units: p.units === 'metric' || p.units === 'us' ? p.units : 'as-saved',
      keepAwake: p.keepAwake !== false,
      vibrate: p.vibrate !== false,
      voiceLang: typeof p.voiceLang === 'string' ? p.voiceLang : 'en-US',
      textSize: p.textSize === 's' || p.textSize === 'l' ? p.textSize : 'm',
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode: setting applies for this visit only */
  }
  applyTextSize(s.textSize)
}

export function applyTextSize(size: TextSize) {
  document.documentElement.dataset.size = size
}
