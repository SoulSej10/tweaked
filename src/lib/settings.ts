import type { UnitSystem } from './parse'

export type TextSize = 's' | 'm' | 'l'

/** The colour that drives the whole look. `color` is only for the little swatch in the picker. */
export const ACCENTS = [
  { id: 'berry', label: 'Berry', color: '#c2255c' },
  { id: 'tomato', label: 'Tomato', color: '#c9342a' },
  { id: 'mango', label: 'Mango', color: '#a65300' },
  { id: 'matcha', label: 'Matcha', color: '#3f7d20' },
  { id: 'teal', label: 'Teal', color: '#2b6d67' },
  { id: 'ocean', label: 'Ocean', color: '#1c64d1' },
  { id: 'grape', label: 'Grape', color: '#6741d9' },
] as const

export type Accent = (typeof ACCENTS)[number]['id']

export type Settings = {
  units: UnitSystem // default units on recipe pages
  keepAwake: boolean // keep the screen on in Cook mode
  vibrate: boolean // buzz when a step timer ends
  voiceLang: string // dictation language for tweak notes
  textSize: TextSize
  accent: Accent
}

export const DEFAULT_SETTINGS: Settings = { units: 'as-saved', keepAwake: true, vibrate: true, voiceLang: 'en-US', textSize: 'm', accent: 'berry' }

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
      accent: ACCENTS.some((a) => a.id === p.accent) ? (p.accent as Accent) : 'berry',
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
  applyAccent(s.accent)
}

export function applyTextSize(size: TextSize) {
  document.documentElement.dataset.size = size
}

export function applyAccent(accent: Accent) {
  document.documentElement.dataset.accent = accent
}
