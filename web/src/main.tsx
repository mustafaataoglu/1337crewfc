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

// Açık bırakılan sayfa: 3 dakikada bir sitenin sürümüne bak. Değiştiyse sekme arka plandaysa
// geri dönüldüğünde kendiliğinden yenile; öndeyse "Yeni bilgiler var" düğmesi göster.
const surumAl = () => fetch(`surum.txt?t=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).then(t => t.trim()).catch(() => '')
let ilkSurum = ''
let yenilenecek = false
surumAl().then(s => { ilkSurum = s })
function uyar() {
  if (document.getElementById('yeni-surum')) return
  const b = document.createElement('button')
  b.id = 'yeni-surum'
  b.textContent = 'Yeni bilgiler var · Yenile'
  b.setAttribute('style', 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(88px + env(safe-area-inset-bottom));z-index:60;background:#15140f;color:#f2c200;border:0;border-radius:999px;padding:10px 18px;font:700 14px/1 "Barlow Condensed",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer')
  b.onclick = () => location.reload()
  document.body.appendChild(b)
}
async function kontrol() {
  if (!ilkSurum) { ilkSurum = await surumAl(); return }
  const s = await surumAl()
  if (s && s !== ilkSurum) {
    if (document.hidden) yenilenecek = true
    else uyar()
  }
}
setInterval(kontrol, 3 * 60 * 1000)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return
  if (yenilenecek) location.reload()
  else kontrol()
})
