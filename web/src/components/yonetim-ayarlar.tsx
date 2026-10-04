import { useEffect, useRef, useState } from 'react'
import { Check, Mail } from 'lucide-react'
import { ayarlarKaydet, epostaDene, telYazi, type Ayarlar } from '@/lib/magaza'
import { Bolum, type Bag } from '@/components/yonetim-ortak'

// Yönetim · Ayarlar: sipariş alma, teslim notu, kulübün WhatsApp numarası ve yeni sipariş e-postası

const formdan = (a: Ayarlar) => ({ acik: a.acik, teslimNotu: a.teslimNotu, whatsapp: a.whatsapp ? telYazi(a.whatsapp) : '', eposta: a.eposta })
type Form = ReturnType<typeof formdan>
const ayni = (a: Form, b: Form) => JSON.stringify(a) === JSON.stringify(b)
const giris = 'h-11 w-full px-3 rounded-lg border bg-background text-[16px]'
const etiket = 'text-[14px] font-semibold'

export function AyarlarFormu({ bag }: { bag: Bag }) {
  const a = bag.veri.ayarlar
  // Sunucudaki ayar değişirse (yoklama) yalnız formda kaydedilmemiş değişiklik yoksa forma yansır
  const [d, setD] = useState(() => ({ kaynak: a, temel: formdan(a), f: formdan(a) }))
  if (d.kaynak !== a && ayni(d.f, d.temel)) setD({ kaynak: a, temel: formdan(a), f: formdan(a) })
  const { f, temel } = d
  const degisti = !ayni(f, temel)
  const [mesgul, setMesgul] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [deneme, setDeneme] = useState<{ ok: boolean; metin: string } | null>(null)
  const { kirliAyarla } = bag
  useEffect(() => { kirliAyarla(degisti) }, [degisti, kirliAyarla])
  useEffect(() => () => kirliAyarla(false), [kirliAyarla])
  // Kaydedince Kaydet düğmesi devre dışı kalır; odak "Kaydedildi" yazısına geçer
  const mesajYeri = useRef<HTMLSpanElement>(null)
  useEffect(() => { if (mesaj) mesajYeri.current?.focus({ preventScroll: true }) }, [mesaj])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setD(x => ({ ...x, f: { ...x.f, [k]: v } })); setMesaj(null) }
  const kaydet = async () => {
    if (mesgul) return
    setMesgul(true); setHata(null); setMesaj(null)
    try {
      const r = await ayarlarKaydet({ acik: f.acik, teslimNotu: f.teslimNotu, whatsapp: f.whatsapp.trim(), eposta: f.eposta.trim() })
      bag.degistir(v => ({ ...v, ayarlar: r.ayarlar }))
      setD({ kaynak: r.ayarlar, temel: formdan(r.ayarlar), f: formdan(r.ayarlar) })
      setMesaj('Kaydedildi')
    } catch (e) { setHata(bag.hataMesaji(e)) } finally { setMesgul(false) }
  }
  const dene = async () => {
    if (!denenebilir) return
    setMesgul(true); setDeneme(null)
    try { await epostaDene(); setDeneme({ ok: true, metin: `Deneme e-postası ${a.eposta} adresine gönderildi. Gelmediyse gereksiz (spam) klasörüne bak.` }) }
    catch (e) { setDeneme({ ok: false, metin: bag.hataMesaji(e) }) } finally { setMesgul(false) }
  }
  const kayitli = !!a.eposta && f.eposta.trim() === a.eposta
  const denenebilir = kayitli && !mesgul

  return (
    <form onSubmit={e => { e.preventDefault(); kaydet() }} className="flex flex-col gap-4 max-w-2xl" noValidate>
      <h2 className="font-display text-[28px] sm:text-[34px] leading-none">Ayarlar</h2>

      <Bolum baslik="Sipariş">
        <label htmlFor="ayar-acik" className="flex items-center justify-between gap-4 rounded-lg border p-3 min-h-11 cursor-pointer">
          <span className="min-w-0">
            <b className="block font-semibold">Mağaza sipariş alıyor</b>
            <span className="block text-[13px] text-muted-foreground">{f.acik ? 'Açık: ürünler sipariş edilebilir.' : 'Kapalı: ürünler görünür, sipariş verilemez.'}</span>
          </span>
          <span className="relative shrink-0">
            <input id="ayar-acik" type="checkbox" role="switch" checked={f.acik} onChange={e => set('acik', e.target.checked)} className="peer sr-only" />
            <span aria-hidden className="block w-12 h-7 rounded-full bg-muted-foreground/40 transition-colors peer-checked:bg-win peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[rgb(var(--club))]" />
            <span aria-hidden className="absolute left-1 top-1 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
        <div className="flex flex-col gap-1">
          <label htmlFor="ayar-teslim" className={etiket}>Teslim notu</label>
          <textarea id="ayar-teslim" value={f.teslimNotu} onChange={e => set('teslimNotu', e.target.value)} maxLength={300} rows={3} placeholder="Teslim maç günü sahada yapılır."
            className="w-full rounded-lg border bg-background px-3 py-2 text-[16px] resize-y" />
          <span className="text-[12.5px] text-muted-foreground num self-end">{f.teslimNotu.length}/300</span>
        </div>
      </Bolum>

      <Bolum baslik="İletişim">
        <div className="flex flex-col gap-1">
          <label htmlFor="ayar-whatsapp" className={etiket}>Kulübün WhatsApp numarası (isteğe bağlı)</label>
          <input id="ayar-whatsapp" type="tel" value={f.whatsapp} onChange={e => set('whatsapp', e.target.value)} maxLength={24} autoComplete="off" placeholder="05xx xxx xx xx" className={giris} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ayar-eposta" className={etiket}>Yeni sipariş e-postası (isteğe bağlı)</label>
          <input id="ayar-eposta" type="email" value={f.eposta} onChange={e => set('eposta', e.target.value)} maxLength={120} autoComplete="off" placeholder="ornek@alanadi.com" className={giris} />
          <button type="button" onClick={dene} disabled={!kayitli} aria-disabled={mesgul || undefined}
            className="self-start mt-1 h-11 px-3.5 rounded-lg border font-semibold text-[14px] flex items-center gap-2 disabled:opacity-50 aria-disabled:opacity-50">
            <Mail className="w-[18px] h-[18px]" aria-hidden /> Deneme e-postası gönder
          </button>
          {f.eposta.trim() && f.eposta.trim() !== a.eposta && <span className="text-[12.5px] text-muted-foreground">Denemek için önce kaydet.</span>}
          {deneme && <p role={deneme.ok ? undefined : 'alert'} className={deneme.ok ? 'text-[14px] text-win font-semibold' : 'text-[14px] text-loss font-semibold'}>{deneme.metin}</p>}
        </div>
      </Bolum>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" disabled={!degisti} aria-disabled={mesgul || undefined}
          className="h-11 px-6 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[16px] disabled:opacity-50 aria-disabled:opacity-50">
          {mesgul ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <span aria-live="polite" className="text-[14px]">
          {hata ? <span role="alert" className="text-loss font-semibold">{hata}</span>
            : mesaj && !degisti ? <span ref={mesajYeri} tabIndex={-1} className="text-win font-semibold flex items-center gap-1"><Check className="w-4 h-4" aria-hidden /> {mesaj}</span>
            : degisti ? <span className="text-muted-foreground">Kaydedilmemiş değişiklik var</span> : null}
        </span>
      </div>
    </form>
  )
}
