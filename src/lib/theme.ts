export type Theme = 'system' | 'light' | 'dark'

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem('theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function saveTheme(t: Theme) {
  try {
    localStorage.setItem('theme', t)
  } catch {
    /* private mode: the choice just won't persist */
  }
}
