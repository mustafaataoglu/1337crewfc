import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronUp, ExternalLink, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MagazaHata, fiyatYazi, gunYazi, resimKucult, resimUrl, resimYukle, trBuyuk, urunKaydet, urunSil, urunSirala,
  type Satis, type UrunGirdi, type UrunTam,
} from '@/lib/magaza'
import { UrunGorsel } from '@/components/magaza-gorsel'
import { Bolum, type Bag } from '@/components/yonetim-ortak'
import { UretimOzeti } from '@/components/yonetim-uretim'

// Yönetim · Ürünler: liste, sıralama ve ürün düzenleme formu

function satisOzet(u: UrunTam) {
  let s: string
  if (u.satis === 'stok') {
    const n = u.bedenler.reduce((t, b) => t + Math.max(0, b.stok ?? 0), 0)
    s = `Stoktan · ${n} adet · ${u.bedenler.map(b => `${b.ad} ${b.stok ?? 0}`).join(' · ')}`
  } else s = `Ön sipariş · ${u.onSiparisBitis ? `son gün ${gunYazi(u.onSiparisBitis)}` : 'son gün yok'}`
  return u.yayinda && !u.siparisAcik ? `${s} · sipariş kapalı` : s
}

export function Urunler({ bag }: { bag: Bag }) {
  const u = bag.veri.urunler
  const [mesgul, setMesgul] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  // Taşırken düğmeler devre dışı kalır ve odak düşer; bitince taşınan ürünün aynı yöndeki düğmesine (listenin ucundaysa öbürüne) döner
  const odak = useRef<{ id: string; yon: -1 | 1 } | null>(null)
  useEffect(() => {
    const o = odak.current
    if (mesgul || !o) return
    odak.current = null
    const dugme = (y: number) => document.querySelector<HTMLButtonElement>(`[data-tasi="${o.id}${y < 0 ? '-yukari' : '-asagi'}"]`)
    const b = dugme(o.yon)
    ;(b && !b.disabled ? b : dugme(-o.yon))?.focus()
  }, [mesgul])
  const tasi = async (i: number, yon: -1 | 1) => {
    if (mesgul) return
    const ids = u.map(x => x.id)
    const j = i + yon
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    odak.current = { id: u[i].id, yon }
    setMesgul(true); setHata(null)
    try {
      const r = await urunSirala(ids)
      bag.degistir(v => ({ ...v, urunler: r.urunler }))
    } catch (e) { setHata(bag.hataMesaji(e)) } finally { setMesgul(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-[28px] sm:text-[34px] leading-none">Ürünler</h2>
        <button type="button" onClick={() => bag.git('urun/yeni')}
          className="h-11 px-4 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[15px] flex items-center gap-2">
          <Plus className="w-[18px] h-[18px]" aria-hidden /> Yeni ürün
        </button>
      </div>
      {hata && <p role="alert" className="text-[14px] text-loss font-semibold">{hata}</p>}
      {u.length === 0 ? <p className="rounded-xl border bg-card p-5 text-muted-foreground">Henüz ürün yok.</p> : (
        <ol className="rounded-xl border bg-card divide-y overflow-hidden">
          {u.map((x, i) => (
            <li key={x.id} className="flex items-center gap-2 p-2 sm:p-3">
              <button type="button" onClick={() => bag.git(`urun/${x.id}`)} className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-lg p-1 -m-1 hover:bg-muted/60">
                <UrunGorsel u={x} className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg shrink-0" />
                <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <span className="font-semibold leading-tight line-clamp-2 break-words">{x.ad}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-data font-bold text-[16px] num">{x.fiyat ? fiyatYazi(x.fiyat) : 'Fiyat yok'}</span>
                    <span className={cn('font-data font-bold text-[12px] uppercase tracking-wide px-1.5 rounded', x.yayinda ? 'bg-win/15 text-win' : 'bg-muted text-muted-foreground')}>
                      {x.yayinda ? 'Yayında' : 'Taslak'}
                    </span>
                  </span>
                  <span className="text-[13px] leading-snug text-muted-foreground line-clamp-2 num">{satisOzet(x)}</span>
                </span>
              </button>
              <div className="flex flex-col sm:flex-row gap-1 shrink-0">
                <button type="button" aria-label={`${x.ad}: yukarı taşı`} data-tasi={`${x.id}-yukari`} disabled={mesgul || i === 0} onClick={() => tasi(i, -1)}
                  className="w-11 h-11 grid place-items-center rounded-lg border disabled:opacity-30"><ChevronUp className="w-5 h-5" aria-hidden /></button>
                <button type="button" aria-label={`${x.ad}: aşağı taşı`} data-tasi={`${x.id}-asagi`} disabled={mesgul || i === u.length - 1} onClick={() => tasi(i, 1)}
                  className="w-11 h-11 grid place-items-center rounded-lg border disabled:opacity-30"><ChevronDown className="w-5 h-5" aria-hidden /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ——— Ürün düzenleme ———

let satirSayac = 0
interface BedenSatir { k: number; ad: string; stok: string }
const satirYap = (ad: string, stok: string): BedenSatir => ({ k: ++satirSayac, ad, stok })
interface Form {
  ad: string; kategori: string; fiyat: string; aciklama: string; resimler: string[]; satis: Satis; onSiparisBitis: string
  teslimTahmini: string; bedenler: BedenSatir[]; baski: boolean; baskiUcret: string; yayinda: boolean
}
const STANDART = ['S', 'M', 'L', 'XL', 'XXL']
const KATEGORI = ['Forma', 'Hoodie', 'Diğer']
const ENFAZLA_RESIM = 8

function formdan(u?: UrunTam): Form {
  if (!u) return {
    ad: '', kategori: 'Forma', fiyat: '', aciklama: '', resimler: [], satis: 'stok', onSiparisBitis: '', teslimTahmini: '',
    bedenler: STANDART.map(b => satirYap(b, '0')), baski: false, baskiUcret: '0', yayinda: false,
  }
  return {
    ad: u.ad, kategori: u.kategori || 'Forma', fiyat: u.fiyat ? String(u.fiyat) : '', aciklama: u.aciklama, resimler: [...u.resimler], satis: u.satis,
    onSiparisBitis: u.onSiparisBitis ?? '', teslimTahmini: u.teslimTahmini, bedenler: u.bedenler.map(b => satirYap(b.ad, String(b.stok ?? 0))),
    baski: u.baski, baskiUcret: String(u.baskiUcret), yayinda: u.yayinda,
  }
}
/** Değişiklik karşılaştırması için satır anahtarları olmadan */
const ozet = (f: Form) => JSON.stringify({ ...f, bedenler: f.bedenler.map(b => [b.ad, b.stok]) })
const sayi = (s: string) => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : 0 }
const rakam = (s: string, n: number) => s.replace(/\D/g, '').slice(0, n)

const giris = 'h-11 w-full px-3 rounded-lg border bg-background text-[16px]'
const etiket = 'text-[13px] font-semibold text-muted-foreground'
const kutu = 'w-[22px] h-[22px] shrink-0 accent-[hsl(var(--foreground))]'

export function UrunDuzenle({ bag, id, kaydedildi, yeniKaydedildi }: { bag: Bag; id: string; kaydedildi: boolean; yeniKaydedildi: (id: string) => void }) {
  const yeni = id === 'yeni'
  const urun = yeni ? undefined : bag.veri.urunler.find(u => u.id === id)
  // Form yerelde tutulur: yoklama (60 sn) yazılmakta olan değerlerin üstüne yazmaz
  const [temel, setTemel] = useState(() => formdan(urun))
  const [f, setF] = useState(temel)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [mesaj, setMesaj] = useState<string | null>(kaydedildi ? 'Kaydedildi' : null)
  const [yukleme, setYukleme] = useState<string | null>(null)
  const [resimHata, setResimHata] = useState<string[]>([])
  const degisti = ozet(f) !== ozet(temel)
  const { kirliAyarla } = bag
  useEffect(() => { kirliAyarla(degisti) }, [degisti, kirliAyarla])
  useEffect(() => () => kirliAyarla(false), [kirliAyarla])
  const sayisi = useRef(0)
  // Kaydedince Kaydet düğmesi devre dışı kalır; odak "Kaydedildi" yazısına geçer (yeni üründe sayfa yeniden açılınca da)
  const mesajYeri = useRef<HTMLSpanElement>(null)
  useEffect(() => { if (mesaj) mesajYeri.current?.focus({ preventScroll: true }) }, [mesaj])

  // Alan değişince eski kayıt mesajı ve hata kalkar
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF(x => ({ ...x, [k]: v })); setMesaj(null); setHata(null) }
  const bedenAyarla = (i: number, d: Partial<BedenSatir>) => { setF(x => ({ ...x, bedenler: x.bedenler.map((b, j) => (j === i ? { ...b, ...d } : b)) })); setMesaj(null); setHata(null) }

  if (!yeni && !urun) {
    return (
      <div className="rounded-xl border bg-card p-5 flex flex-col items-start gap-3">
        <p className="font-semibold">Ürün bulunamadı.</p>
        <button type="button" onClick={() => bag.git('urunler')} className="h-11 px-3 rounded-lg border font-semibold flex items-center gap-1.5"><ChevronLeft className="w-4 h-4" aria-hidden /> Ürünler</button>
      </div>
    )
  }

  const resimEkle = async (dosyalar: File[]) => {
    const hatalar: string[] = []
    sayisi.current = f.resimler.length
    setResimHata([]); setMesaj(null)
    for (let i = 0; i < dosyalar.length; i++) {
      if (sayisi.current >= ENFAZLA_RESIM) { hatalar.push(`En fazla ${ENFAZLA_RESIM} fotoğraf eklenebilir.`); break }
      setYukleme(dosyalar.length > 1 ? `Yükleniyor ${i + 1}/${dosyalar.length}…` : 'Yükleniyor…')
      try {
        const r = await resimYukle(await resimKucult(dosyalar[i]))
        sayisi.current++
        setF(x => ({ ...x, resimler: [...x.resimler, r.id] }))
      } catch (e) {
        const m = bag.hataMesaji(e)
        if (e instanceof MagazaHata && e.durum === 401) return
        hatalar.push(dosyalar.length > 1 ? `${dosyalar[i].name}: ${m}` : m)
      }
    }
    setYukleme(null); setResimHata(hatalar)
  }
  const resimKaldir = (i: number) => set('resimler', f.resimler.filter((_, j) => j !== i))
  const kapakYap = (i: number) => set('resimler', [f.resimler[i], ...f.resimler.filter((_, j) => j !== i)])
  const standartEkle = () => {
    const var_ = new Set(f.bedenler.map(b => trBuyuk(b.ad.trim())))
    set('bedenler', [...f.bedenler.filter(b => b.ad.trim() || b.stok !== '0'), ...STANDART.filter(b => !var_.has(b)).map(b => satirYap(b, '0'))])
  }

  const kaydet = async () => {
    if (kaydediliyor) return
    setHata(null); setMesaj(null)
    const bedenler = f.bedenler.filter(b => b.ad.trim())
    if (f.ad.trim().length < 2) return setHata('Ürün adını yaz')
    if (!bedenler.length) return setHata('En az bir beden ekle')
    const tekrar = bedenler.find((b, i) => bedenler.findIndex(x => trBuyuk(x.ad.trim()) === trBuyuk(b.ad.trim())) !== i)
    if (tekrar) return setHata(`${tekrar.ad.trim()} bedeni iki kez yazılmış`)
    const fiyat = sayi(f.fiyat)
    if (f.yayinda && fiyat < 1) return setHata('Yayına almak için fiyat gir')
    const girdi: UrunGirdi = {
      ...(yeni ? {} : { id }),
      ad: f.ad.trim(), kategori: f.kategori, fiyat, aciklama: f.aciklama, resimler: f.resimler, satis: f.satis,
      onSiparisBitis: f.satis === 'onsiparis' && f.onSiparisBitis ? f.onSiparisBitis : null,
      teslimTahmini: f.teslimTahmini.trim(),
      bedenler: bedenler.map(b => {
        const ad = b.ad.trim()
        if (f.satis !== 'stok') return { ad, stok: null }
        // onceki: form sunucudan alındığında bu bedenin adedi. Sunucu farkı uygular (güncel + stok − onceki);
        // form açıkken gelen siparişin ayırdığı ya da iptalle dönen stok ezilmez. Yeni bedende onceki yok.
        const ilk = temel.satis === 'stok' ? temel.bedenler.find(x => x.ad.trim() === ad) : undefined
        return ilk ? { ad, stok: sayi(b.stok), onceki: sayi(ilk.stok) } : { ad, stok: sayi(b.stok) }
      }),
      baski: f.baski, baskiUcret: sayi(f.baskiUcret), yayinda: f.yayinda,
    }
    setKaydediliyor(true)
    try {
      const r = await urunKaydet(girdi)
      bag.degistir(v => ({ ...v, urunler: v.urunler.some(x => x.id === r.urun.id) ? v.urunler.map(x => (x.id === r.urun.id ? r.urun : x)) : [...v.urunler, r.urun] }))
      if (yeni) { kirliAyarla(false); yeniKaydedildi(r.urun.id); return }
      const t = formdan(r.urun)
      setTemel(t); setF(t); setMesaj('Kaydedildi')
    } catch (e) { setHata(bag.hataMesaji(e)) } finally { setKaydediliyor(false) }
  }
  const sil = async () => {
    if (!urun || !window.confirm(`"${urun.ad}" silinsin mi?\n\nBu işlem geri alınamaz. Verilmiş siparişler etkilenmez.`)) return
    setKaydediliyor(true); setHata(null)
    try {
      await urunSil(urun.id)
      bag.degistir(v => ({ ...v, urunler: v.urunler.filter(x => x.id !== urun.id) }))
      kirliAyarla(false)
      bag.git('urunler')
    } catch (e) { setHata(bag.hataMesaji(e)); setKaydediliyor(false) }
  }

  const stoklu = f.satis === 'stok'
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 print:hidden">
        <button type="button" onClick={() => bag.git('urunler')} className="self-start -ml-1 h-11 px-1 flex items-center gap-1 font-semibold text-[15px]">
          <ChevronLeft className="w-5 h-5" aria-hidden /> Ürünler
        </button>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <h2 className="font-display text-[28px] sm:text-[34px] leading-[1.05] break-words min-w-0">{f.ad.trim() || (yeni ? 'Yeni ürün' : urun?.ad)}</h2>
          {urun?.yayinda && (
            <button type="button" onClick={() => bag.magaza(`urun/${urun.id}`)} className="h-11 px-3.5 rounded-lg border-[1.5px] border-foreground font-semibold text-[15px] flex items-center gap-2">
              <ExternalLink className="w-4 h-4" aria-hidden /> Mağazada gör
            </button>
          )}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5 lg:items-start">
        <form onSubmit={e => { e.preventDefault(); kaydet() }} className="flex flex-col gap-4 min-w-0 print:hidden" noValidate>
          <Bolum baslik="Temel bilgiler">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="urun-ad" className={etiket}>Ürün adı</label>
                <input id="urun-ad" value={f.ad} onChange={e => set('ad', e.target.value)} maxLength={80} placeholder="İç saha forması" className={giris} />
              </div>
              <div className="grid grid-cols-2 sm:contents gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <label htmlFor="urun-kategori" className={etiket}>Kategori</label>
                  <select id="urun-kategori" value={f.kategori} onChange={e => set('kategori', e.target.value)} className={cn(giris, 'px-2')}>
                    {(KATEGORI.includes(f.kategori) ? KATEGORI : [...KATEGORI, f.kategori]).map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <label htmlFor="urun-fiyat" className={etiket}>Fiyat (₺)</label>
                  <input id="urun-fiyat" value={f.fiyat} onChange={e => set('fiyat', rakam(e.target.value, 6))} inputMode="numeric" autoComplete="off" placeholder="0"
                    className={cn(giris, 'font-data font-bold text-[18px] num')} />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="urun-aciklama" className={etiket}>Açıklama</label>
              <textarea id="urun-aciklama" value={f.aciklama} onChange={e => set('aciklama', e.target.value)} maxLength={1000} rows={3}
                className="w-full rounded-lg border bg-background px-3 py-2 text-[16px] resize-y" />
            </div>
          </Bolum>

          <Bolum baslik="Fotoğraflar" sag={<span className="text-[13px] text-muted-foreground num">{f.resimler.length}/{ENFAZLA_RESIM}</span>}>
            <ul className="grid grid-cols-3 sm:grid-cols-[repeat(auto-fill,96px)] gap-2.5">
              {f.resimler.map((r, i) => (
                <li key={r} className="min-w-0 flex flex-col items-center">
                  <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-muted border">
                    <img src={resimUrl(r)} alt={`Fotoğraf ${i + 1}`} className="w-full h-full object-cover" />
                    {i === 0 && <span className="absolute left-1 bottom-1 px-1.5 rounded bg-clubink text-club font-data font-bold text-[11px] uppercase tracking-wide">Kapak</span>}
                    <button type="button" onClick={() => resimKaldir(i)} aria-label={`Fotoğraf ${i + 1}: kaldır`} className="absolute right-0 top-0 w-11 h-11 grid place-items-center">
                      <span className="w-7 h-7 rounded-full bg-black/65 text-white grid place-items-center"><X className="w-4 h-4" aria-hidden /></span>
                    </button>
                  </div>
                  {i > 0 && <button type="button" onClick={() => kapakYap(i)} className="h-11 px-1 text-[13px] font-semibold underline underline-offset-2">Kapak yap</button>}
                </li>
              ))}
              {f.resimler.length < ENFAZLA_RESIM && (
                <li>
                  <label className={cn('w-full aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-center text-[13px] font-semibold text-muted-foreground cursor-pointer',
                    'focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[rgb(var(--club))]', yukleme && 'opacity-60 cursor-wait')}>
                    <input type="file" accept="image/*" multiple disabled={!!yukleme} className="sr-only"
                      onChange={e => { const d = [...(e.target.files ?? [])]; e.target.value = ''; if (d.length) resimEkle(d) }} />
                    <ImagePlus className="w-[22px] h-[22px]" aria-hidden />
                    {yukleme ? 'Yükleniyor…' : 'Fotoğraf ekle'}
                  </label>
                </li>
              )}
            </ul>
            <div aria-live="polite" className="flex flex-col gap-1 empty:hidden">
              {yukleme && <p className="text-[14px] font-semibold">{yukleme}</p>}
              {resimHata.map((h, i) => <p key={i} role="alert" className="text-[14px] text-loss font-semibold">{h}</p>)}
            </div>
          </Bolum>

          <Bolum baslik="Satış şekli">
            <fieldset className="flex flex-col sm:flex-row gap-2.5">
              <legend className="sr-only">Satış şekli</legend>
              {([['stok', 'Stoktan'], ['onsiparis', 'Ön sipariş']] as const).map(([k, b]) => (
                <label key={k} htmlFor={`satis-${k}`} className={cn('flex-1 flex gap-3 items-center rounded-lg border-[1.5px] p-3 min-h-12 cursor-pointer', f.satis === k && 'border-foreground bg-club/15')}>
                  <input id={`satis-${k}`} type="radio" name="satis" value={k} checked={f.satis === k} onChange={() => set('satis', k)} className="w-5 h-5 shrink-0 accent-[hsl(var(--foreground))]" />
                  <span className="min-w-0 font-semibold">{b}</span>
                </label>
              ))}
            </fieldset>
            {!stoklu && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="urun-songun" className={etiket}>Son sipariş günü (isteğe bağlı)</label>
                  <div className="flex gap-2">
                    <input id="urun-songun" type="date" value={f.onSiparisBitis} onChange={e => set('onSiparisBitis', e.target.value)} className={cn(giris, 'min-w-0')} />
                    {f.onSiparisBitis && (
                      <button type="button" onClick={() => set('onSiparisBitis', '')} aria-label="Son sipariş gününü kaldır" className="w-11 h-11 shrink-0 grid place-items-center rounded-lg border">
                        <X className="w-4 h-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="urun-teslim" className={etiket}>Tahmini teslim</label>
                  <input id="urun-teslim" value={f.teslimTahmini} onChange={e => set('teslimTahmini', e.target.value)} maxLength={60} placeholder="Kasım ortası" className={giris} />
                </div>
              </div>
            )}
          </Bolum>

          <Bolum baslik="Bedenler">
            <div className="flex flex-col gap-2">
              <div className={cn('grid gap-2 text-[13px] font-semibold text-muted-foreground', stoklu ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px]' : 'grid-cols-[minmax(0,1fr)_44px]')} aria-hidden>
                <span>Beden</span>{stoklu && <span>Satılabilir adet</span>}
              </div>
              {f.bedenler.map((b, i) => (
                <div key={b.k} className={cn('grid gap-2 items-center', stoklu ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px]' : 'grid-cols-[minmax(0,1fr)_44px]')}>
                  <label htmlFor={`beden-ad-${b.k}`} className="sr-only">{i + 1}. beden adı</label>
                  <input id={`beden-ad-${b.k}`} value={b.ad} onChange={e => bedenAyarla(i, { ad: e.target.value })} maxLength={12} autoComplete="off"
                    className={cn(giris, 'font-data font-bold text-[17px]')} />
                  {stoklu && (
                    <>
                      <label htmlFor={`beden-stok-${b.k}`} className="sr-only">{b.ad.trim() || `${i + 1}. beden`} satılabilir adet</label>
                      <input id={`beden-stok-${b.k}`} value={b.stok} onChange={e => bedenAyarla(i, { stok: rakam(e.target.value, 4) })} inputMode="numeric" autoComplete="off"
                        className={cn(giris, 'font-data font-bold text-[17px] num')} />
                    </>
                  )}
                  <button type="button" onClick={() => set('bedenler', f.bedenler.filter((_, j) => j !== i))} aria-label={`${b.ad.trim() || `${i + 1}. beden`} satırını kaldır`}
                    className="w-11 h-11 grid place-items-center rounded-lg border text-muted-foreground hover:text-loss"><Trash2 className="w-[18px] h-[18px]" aria-hidden /></button>
                </div>
              ))}
              <div className="flex gap-2 flex-wrap">
                <button type="button" disabled={f.bedenler.length >= 12} onClick={() => set('bedenler', [...f.bedenler, satirYap('', '0')])}
                  className="h-11 px-3.5 rounded-lg border font-semibold text-[14px] flex items-center gap-1.5 disabled:opacity-50"><Plus className="w-4 h-4" aria-hidden /> Beden ekle</button>
                <button type="button" onClick={standartEkle} className="h-11 px-3.5 rounded-lg border font-semibold text-[14px]">S–XXL ekle</button>
              </div>
            </div>
          </Bolum>

          <Bolum baslik="Seçenekler">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label htmlFor="urun-baski" className="flex items-center gap-3 min-h-11 flex-1 basis-[220px] font-semibold">
                <input id="urun-baski" type="checkbox" checked={f.baski} onChange={e => set('baski', e.target.checked)} className={kutu} />
                İsim ve numara baskısı sunulsun
              </label>
              <span className="flex items-center gap-2">
                <label htmlFor="urun-baski-ucret" className={etiket}>Ek ücret ₺</label>
                <input id="urun-baski-ucret" value={f.baskiUcret} disabled={!f.baski} onChange={e => set('baskiUcret', rakam(e.target.value, 5))} inputMode="numeric" autoComplete="off"
                  className={cn(giris, 'w-24 font-data font-bold text-[17px] num disabled:opacity-50')} />
              </span>
            </div>
            <div className="border-t" />
            <label htmlFor="urun-yayinda" className="flex items-center gap-3 min-h-11 font-semibold">
              <input id="urun-yayinda" type="checkbox" checked={f.yayinda} onChange={e => set('yayinda', e.target.checked)} className="w-[22px] h-[22px] shrink-0 accent-win" />
              Mağazada göster
            </label>
            {f.yayinda && sayi(f.fiyat) < 1 && <p className="text-[13px] text-loss font-semibold">Yayına almak için fiyat gir.</p>}
            {!yeni && (
              <button type="button" onClick={sil} disabled={kaydediliyor}
                className="self-start h-11 px-1 font-semibold text-[14px] text-loss underline underline-offset-2 disabled:opacity-60">Ürünü sil</button>
            )}
          </Bolum>

          {/* Değişiklik varken kaydet çubuğu ekranın altında kalır (telefonda alt menünün üstünde) */}
          <div className={cn('rounded-xl border bg-card p-3 flex items-center gap-3',
            (degisti || hata || kaydediliyor || yukleme) && 'sticky z-20 bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-4 shadow-lg')}>
            <div className="flex-1 min-w-0 text-[14px]" aria-live="polite">
              {hata ? <span role="alert" className="text-loss font-semibold">{hata}</span>
                : yukleme ? <span className="text-muted-foreground">Fotoğraf yükleniyor…</span>
                : mesaj && !degisti ? <span ref={mesajYeri} tabIndex={-1} className="text-win font-semibold flex items-center gap-1"><Check className="w-4 h-4" aria-hidden /> {mesaj}</span>
                : degisti ? <span className="text-muted-foreground">Kaydedilmemiş değişiklik var</span> : null}
            </div>
            <button type="submit" disabled={!!yukleme || (!yeni && !degisti)} aria-disabled={kaydediliyor || undefined}
              className="shrink-0 h-11 px-6 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[16px] disabled:opacity-50 aria-disabled:opacity-50">
              {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>

        {!yeni && (
          <aside className="hidden lg:block lg:sticky lg:top-[72px] print:block print:static">
            <UretimOzeti bag={bag} urunId={id} />
          </aside>
        )}
      </div>
    </div>
  )
}
