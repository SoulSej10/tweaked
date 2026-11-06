import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/nunito'
import './index.css'
import App from './App.tsx'
import { applyTheme, loadTheme } from './lib/theme.ts'
import { applyAccent, applyTextSize, loadSettings } from './lib/settings.ts'
import { startShoppingSync } from './lib/shopping.ts'

startShoppingSync()

applyTheme(loadTheme())
applyTextSize(loadSettings().textSize)
applyAccent(loadSettings().accent)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
