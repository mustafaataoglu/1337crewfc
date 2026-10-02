import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Veri sitenin yanındaki data/veri.json'dan okunur (GitHub her 15 dakikada yeniler).
// Uygulama, veri geldikten sonra yüklenir; böylece tüm sayfalar aynı ortak veriden beslenir.
const root = createRoot(document.getElementById('root')!)

async function start() {
  try {
    const r = await fetch(`data/veri.json?t=${Math.floor(Date.now() / 60000)}`)
    if (!r.ok) throw new Error(`veri.json ${r.status}`)
    ;(window as unknown as { __VERI__: unknown }).__VERI__ = await r.json()
    const { default: App } = await import('./App.tsx')
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (e) {
    root.render(
      <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 520, margin: '40px auto' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>1337 Crew FC</h1>
        <p>Veriler şu an yüklenemedi. Birkaç dakika sonra sayfayı yenileyin.</p>
        <p style={{ color: '#888', fontSize: 13 }}>{String(e)}</p>
      </div>,
    )
  }
}
start()
