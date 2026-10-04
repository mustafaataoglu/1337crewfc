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

// Açık bırakılan sayfa: 3 dakikada bir sitenin sürümüne bak; yeni sürüm varsa kendiliğinden yenile.
// Kullanıcı sayfanın neresindeyse orada kalır (kaydırma konumu saklanır); Senin 11'in kadrosu zaten kayıtlı.
const surumAl = () => fetch(`surum.txt?t=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).then(t => t.trim()).catch(() => '')
let ilkSurum = ''
surumAl().then(s => { ilkSurum = s })
try {
  const y = sessionStorage.getItem('1337-kaydirma')
  if (y) { sessionStorage.removeItem('1337-kaydirma'); setTimeout(() => window.scrollTo(0, Number(y)), 600) }
} catch { /* depolama kapalı */ }
// Ürün seçimi, sipariş formu ya da yönetim düzenlemesi sürerken yenilenmez; o sayfadan çıkınca yenilenir.
let bekleyen = false
async function kontrol() {
  const s = await surumAl()
  if (!ilkSurum) { ilkSurum = s; return }
  if (s && s !== ilkSurum) {
    if (/^#(magaza\/(sepet|urun\/)|yonetim)/.test(location.hash)) { bekleyen = true; return }
    try { sessionStorage.setItem('1337-kaydirma', String(window.scrollY)) } catch { /* depolama kapalı */ }
    location.reload()
  }
}
setInterval(kontrol, 3 * 60 * 1000)
document.addEventListener('visibilitychange', () => { if (!document.hidden) kontrol() })
addEventListener('hashchange', () => { if (bekleyen) kontrol() })
