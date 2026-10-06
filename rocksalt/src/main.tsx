import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Icon } from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png'
import 'leaflet/dist/leaflet.css'
import './index.css'
import './App.css'
import './i18n'
import App from './App.tsx'

// Set default icon globally
delete (Icon.Default.prototype as any)._getIconUrl
Icon.Default.mergeOptions({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
})

// Suppress harmless browser extension errors
if (typeof window !== 'undefined') {
  // Suppress "message port closed" errors from browser extensions
  const originalError = console.error
  console.error = (...args: any[]) => {
    const message = args[0]?.toString() || ''
    if (
      message.includes('message port closed') ||
      message.includes('runtime.lastError') ||
      message.includes('Extension context invalidated')
    ) {
      // Silently ignore browser extension errors
      return
    }
    originalError.apply(console, args)
  }

  // Also catch unhandled promise rejections from extensions
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || event.reason?.toString() || ''
    if (
      message.includes('message port closed') ||
      message.includes('runtime.lastError') ||
      message.includes('Extension context invalidated')
    ) {
      event.preventDefault()
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
