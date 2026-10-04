import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { LogOut, Store } from 'lucide-react'
import type { Nav } from '@/App'
import { cn } from '@/lib/utils'
import { MagazaHata, panelAnahtari, panelKaydet, yonetimGiris, yonetimVeri } from '@/lib/magaza'
import type { Bag, Veri } from '@/components/yonetim-ortak'
import { Siparisler } from '@/components/yonetim-siparis'
import { Urunler, UrunDuzenle } from '@/components/yonetim-urun'
import { UretimListesi } from '@/components/yonetim-uretim'
import { AyarlarFormu } from '@/components/yonetim-ayarlar'

// Mağaza yönetimi (#yonetim): giriş takım paneli anahtarıyla. Veri sekme görünürken dakikada bir yenilenir.
// Yollar: '' siparişler, 'siparis/<no>', 'urunler', 'urun/<id|yeni>', 'uretim', 'ayarlar'

type Ekran = 'siparisler' | 'urunler' | 'uretim' | 'ayarlar'
const SEKMELER: [Ekran, string, string, string][] = [
  ['siparisler', '', 'Siparişler', 'Siparişler'],
  ['urunler', 'urunler', 'Ürünler', 'Ürünler'],
  ['uretim', 'uretim', 'Üretim listesi', 'Üretim'],
  ['ayarlar', 'ayarlar', 'Ayarlar', 'Ayarlar'],
]
const YOKLAMA = 60_000

// Yazdırırken site başlığı, alt menü ve altbilgi gizlenir; koyu temada da kâğıda açık renklerle basılır
const YAZDIR = `@media print{#root header,#root footer,#root>div>nav{display:none!important}#root>div{padding-bottom:0!important}
body{--background:0 0% 100%;--foreground:0 0% 0%;--card:0 0% 100%;--card-foreground:0 0% 0%;--muted:0 0% 94%;--muted-foreground:0 0% 30%;--border:0 0% 80%;color-scheme:light;background:#fff}
@page{margin:12mm}}`

/** Bilinmeyen yol siparişlere düşer */
function yolCoz(yol: string): { ekran: Ekran; secili: string | null; urun: string | null } {
  const [b, ...k] = yol.split('/')
  const alt = k.join('/') || null
  if (b === 'siparis') return { ekran: 'siparisler', secili: alt, urun: null }
  if (b === 'urun' && alt) return { ekran: 'urunler', secili: null, urun: alt }
  return { ekran: b === 'urunler' || b === 'uretim' || b === 'ayarlar' ? b : 'siparisler', secili: null, urun: null }
}

function Giris({ mesaj, girdi, magaza }: { mesaj: string | null; girdi: (k: string) => void; magaza: () => void }) {
  const [k, setK] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const [hata, setHata] = useState<string | null>(mesaj)
  const gonder = async (e: FormEvent) => {
    e.preventDefault()
    const t = k.trim()
    if (!t) return
    setMesgul(true); setHata(null)
    try {
      await yonetimGiris(t)
      panelKaydet(t)
      // Tarayıcı site verisi saklamaya izin vermiyorsa anahtar sonraki isteklere eklenemez; giriş döngüye girmesin
      if (panelAnahtari() !== t) { setHata('Bu tarayıcı site verisi saklamaya izin vermiyor. Yönetim için bu sitede çerezlere ve site verisine izin ver.'); setMesgul(false); return }
      girdi(t)
    } catch (er) { setHata(er instanceof Error ? er.message : String(er)); setMesgul(false) }
  }
  return (
    <div className="max-w-sm mx-auto py-4 sm:py-10">
      <form onSubmit={gonder} className="rounded-xl border bg-card p-5 flex flex-col gap-4">
        <div>
          <div className="eyebrow">1337 Crew FC</div>
          <h1 className="font-display text-[32px] leading-none mt-1">Mağaza yönetimi</h1>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="panel-anahtari" className="text-[14px] font-semibold">Panel anahtarı</label>
          <input id="panel-anahtari" type="password" value={k} onChange={e => setK(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false}
            className="h-11 w-full px-3 rounded-lg border bg-background text-[16px]" />
        </div>
        {hata && <p role="alert" className="text-[14px] text-loss font-semibold">{hata}</p>}
        <button type="submit" disabled={mesgul || !k.trim()}
          className="h-11 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[16px] disabled:opacity-60">
          {mesgul ? 'Kontrol ediliyor…' : 'Giriş'}
        </button>
      </form>
      <button type="button" onClick={magaza} className="mt-3 h-11 px-1 text-[14px] font-semibold underline underline-offset-2">Mağazaya dön</button>
    </div>
  )
}

export default function Yonetim({ yol, nav }: { yol: string; nav: Nav }) {
  const [anahtar, setAnahtar] = useState(panelAnahtari)
  const [veri, setVeri] = useState<Veri | null>(null)
  const [yukHata, setYukHata] = useState<string | null>(null)
  const [girisMesaj, setGirisMesaj] = useState<string | null>(null)
  const [sonKayit, setSonKayit] = useState<string | null>(null)
  const [uretimSecim, setUretimSecim] = useState<string | null>(null)
  // surum: her yerel değişiklikte artar; öncesinde yola çıkmış yoklamanın eski yanıtı yazılmaz
  const surum = useRef(0)
  const sonYukleme = useRef(0)
  const kirli = useRef(false)

  const cikis = useCallback((mesaj: string | null) => {
    panelKaydet(null)
    surum.current++
    kirli.current = false
    setAnahtar(''); setVeri(null); setYukHata(null); setGirisMesaj(mesaj)
  }, [])
  const hataMesaji = useCallback((e: unknown) => {
    if (e instanceof MagazaHata && e.durum === 401) { cikis(e.message); return e.message }
    return e instanceof Error ? e.message : String(e)
  }, [cikis])
  const yukle = useCallback(async () => {
    const s = surum.current
    sonYukleme.current = Date.now()
    try {
      const j = await yonetimVeri()
      if (s !== surum.current) return
      setVeri({ siparisler: j.siparisler, urunler: j.urunler, ayarlar: j.ayarlar })
      setYukHata(null)
    } catch (e) {
      const m = hataMesaji(e)
      if (s === surum.current) setYukHata(m)
    }
  }, [hataMesaji])

  // İlk yükleme ve sekme görünürken dakikada bir yenileme; sekmeye dönülünce veri bayatsa hemen yenile
  useEffect(() => {
    if (!anahtar) return
    yukle()
    const t = setInterval(() => { if (document.visibilityState === 'visible') yukle() }, YOKLAMA)
    const g = () => { if (document.visibilityState === 'visible' && Date.now() - sonYukleme.current >= YOKLAMA) yukle() }
    document.addEventListener('visibilitychange', g)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', g) }
  }, [anahtar, yukle])

  // Kaydedilmemiş form varken sayfa kapanırsa tarayıcı sorsun
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (kirli.current) { e.preventDefault(); e.returnValue = '' } }
    addEventListener('beforeunload', f)
    return () => removeEventListener('beforeunload', f)
  }, [])

  // Sekme başlığında yeni sipariş sayısı; sayfadan çıkınca eski başlık
  const yeniSayi = veri?.siparisler.filter(s => s.durum === 'yeni').length ?? 0
  const ilkBaslik = useRef(document.title)
  useEffect(() => { const b = ilkBaslik.current; return () => { document.title = b } }, [])
  useEffect(() => { document.title = yeniSayi > 0 ? `(${yeniSayi}) Mağaza yönetimi · 1337 Crew FC` : ilkBaslik.current }, [yeniSayi])

  const degistir = useCallback((f: (v: Veri) => Veri) => { surum.current++; setVeri(v => (v ? f(v) : v)) }, [])
  const kirliAyarla = useCallback((k: boolean) => { kirli.current = k }, [])
  const birak = () => !kirli.current || window.confirm('Kaydedilmemiş değişiklikler var. Yine de çıkılsın mı?')
  // Site menüsü, sepet düğmesi ve geri tuşu da kaydedilmemiş değişiklik varsa sorar
  const { ayrilirken } = nav
  useEffect(() => {
    ayrilirken(() => {
      if (kirli.current && !window.confirm('Kaydedilmemiş değişiklikler var. Yine de çıkılsın mı?')) return false
      kirli.current = false
      return true
    })
    return () => ayrilirken(null)
  }, [ayrilirken])
  const git = (y: string) => {
    if (!birak()) return
    kirli.current = false
    setSonKayit(null)
    nav.go({ page: 'yonetim', yol: y })
  }
  const magaza = (y: string) => { if (birak()) { kirli.current = false; nav.go({ page: 'magaza', yol: y }) } }

  if (!anahtar) {
    return (
      <Giris key={girisMesaj ?? ''} mesaj={girisMesaj} magaza={() => nav.go({ page: 'magaza', yol: '' })}
        girdi={k => { surum.current++; setGirisMesaj(null); setVeri(null); setAnahtar(k) }} />
    )
  }

  const r = yolCoz(yol)
  const bag: Bag | null = veri ? { veri, degistir, hataMesaji, git, magaza, kirliAyarla } : null

  return (
    <div className="flex flex-col gap-4">
      <style>{YAZDIR}</style>
      <div className="flex flex-col gap-3 print:hidden">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-[26px] sm:text-[32px] leading-none min-w-0">Mağaza yönetimi</h1>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => magaza('')} aria-label="Mağazayı gör"
              className="h-11 px-2.5 sm:px-3 rounded-lg flex items-center gap-1.5 text-[14px] font-semibold hover:bg-muted">
              <Store className="w-5 h-5" aria-hidden /><span className="hidden sm:inline">Mağazayı gör</span>
            </button>
            <button type="button" onClick={() => { if (birak()) cikis(null) }} aria-label="Çıkış"
              className="h-11 px-2.5 sm:px-3 rounded-lg border flex items-center gap-1.5 text-[14px] font-semibold">
              <LogOut className="w-5 h-5" aria-hidden /><span className="hidden sm:inline">Çıkış</span>
            </button>
          </div>
        </div>
        <nav aria-label="Yönetim bölümleri" className="flex border-b overflow-x-auto [scrollbar-width:none] -mx-4 px-4 sm:mx-0 sm:px-0">
          {SEKMELER.map(([k, y, uzun, kisa]) => (
            <button key={k} type="button" onClick={() => git(y)} aria-current={r.ekran === k ? 'page' : undefined}
              className={cn('shrink-0 h-12 px-3 -mb-px border-b-[3px] flex items-center gap-2 font-data uppercase tracking-wider text-[15px] whitespace-nowrap',
                r.ekran === k ? 'border-foreground font-bold' : 'border-transparent text-muted-foreground font-semibold hover:text-foreground')}>
              <span className="sm:hidden">{kisa}</span><span className="hidden sm:inline">{uzun}</span>
              {k === 'siparisler' && yeniSayi > 0 && (
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-club text-clubink text-[13px] font-bold leading-[22px] text-center num">
                  {yeniSayi}<span className="sr-only"> yeni</span>
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {yukHata && (
        <div role="alert" className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 flex items-center justify-between gap-3 flex-wrap print:hidden">
          <span className="text-[14px] font-semibold text-loss">{veri ? `Güncellenemedi: ${yukHata}` : yukHata}</span>
          <button type="button" onClick={() => yukle()} className="h-11 px-3 rounded-lg border bg-card font-semibold text-[14px]">Tekrar dene</button>
        </div>
      )}

      {!bag ? (
        !yukHata && <p className="py-10 text-center text-muted-foreground" aria-live="polite">Yükleniyor…</p>
      ) : r.ekran === 'siparisler' ? (
        <Siparisler bag={bag} secili={r.secili} yenile={yukle} />
      ) : r.ekran === 'urunler' ? (
        r.urun
          ? <UrunDuzenle key={r.urun} bag={bag} id={r.urun} kaydedildi={sonKayit === r.urun}
              yeniKaydedildi={id => { git(`urun/${id}`); setSonKayit(id) }} />
          : <Urunler bag={bag} />
      ) : r.ekran === 'uretim' ? (
        <UretimListesi bag={bag} secim={uretimSecim} setSecim={setUretimSecim} />
      ) : (
        <AyarlarFormu bag={bag} />
      )}
    </div>
  )
}
