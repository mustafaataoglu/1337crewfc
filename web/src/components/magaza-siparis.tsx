import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, MapPin, MessageCircle, RefreshCw } from 'lucide-react'
import type { Nav } from '@/App'
import { cn } from '@/lib/utils'
import { BIRINCIL, ETIKET, GeriLink, GIRDI, IKINCIL, MagazaLink, YESIL_DOLGU } from '@/components/magaza-ortak'
import { benimSiparisler, hataYazi } from '@/components/magaza-yardim'
import { DURUM_ETIKET, DURUM_SIRA, fiyatYazi, siparisTakip, waLink, zamanYazi, type BenimSiparis, type Durum, type Siparis } from '@/lib/magaza'

type Cevap = Awaited<ReturnType<typeof siparisTakip>>

const kisaGun = (z: string) => { const d = new Date(z); return isNaN(+d) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }) }

function KalemListesi({ s, etiket }: { s: Siparis; etiket: string }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {s.kalemler.map((k, i) => (
          <li key={i} className="flex justify-between gap-3 text-[14px]">
            <span className="min-w-0 break-words">
              {k.ad} · {k.beden}{k.baski ? ` · ${k.baski.isim} ${k.baski.numara}` : ''}
              {k.adet > 1 && <span className="text-muted-foreground num"> · {k.adet} adet</span>}
            </span>
            <b className="font-data text-[16px] num shrink-0">{fiyatYazi(k.birim * k.adet)}</b>
          </li>
        ))}
      </ul>
      <div className="flex justify-between items-baseline gap-3 border-t pt-2">
        <span className="font-data font-bold uppercase tracking-wider text-[14px]">{etiket}</span>
        <span className="font-display text-[22px] num">{fiyatYazi(s.toplam)}</span>
      </div>
    </div>
  )
}

function TeslimNotu({ metin }: { metin: string }) {
  return (
    <p className="rounded-lg bg-muted p-3 flex gap-2.5 items-start text-[14px] leading-snug">
      <MapPin className="w-5 h-5 shrink-0" aria-hidden />
      <span className="whitespace-pre-line break-words">{metin}</span>
    </p>
  )
}

function WhatsApp({ tel, no }: { tel: string; no: string }) {
  return (
    <a href={waLink(tel, `Merhaba, ${no} numaralı siparişim hakkında yazıyorum.`)} target="_blank" rel="noreferrer"
      className="w-fit h-11 inline-flex items-center gap-2 font-semibold underline-offset-2 hover:underline">
      <MessageCircle className="w-5 h-5" aria-hidden /> Soru için WhatsApp
    </a>
  )
}

const ADIMLAR: [Durum, string][] = [['yeni', 'Sipariş alındı'], ['gorusuldu', 'Kulüp seninle görüşür'], ['hazir', 'Teslime hazır'], ['teslim', 'Teslim edildi']]

/** Onay ekranındaki adımlar: tamamlananlar yeşil tikli, saatleriyle */
function Adimlar({ s, ilkZaman }: { s?: Siparis; ilkZaman: string }) {
  const sira = s ? DURUM_SIRA.indexOf(s.durum) : 0
  const zaman = (d: Durum) => {
    const g = s?.gecmis.filter(x => x.durum === d) ?? []
    return g.length ? g[g.length - 1].zaman : d === 'yeni' ? (s?.zaman ?? ilkZaman) : ''
  }
  return (
    <ol className="flex flex-col gap-3.5">
      {ADIMLAR.map(([d, ad], i) => {
        const tamam = i <= sira, sirada = i === sira + 1
        const z = tamam ? zamanYazi(zaman(d)) : ''
        return (
          <li key={d} className="flex gap-3 items-start" aria-current={i === sira ? 'step' : undefined}>
            <span className={cn('w-[26px] h-[26px] shrink-0 rounded-full grid place-items-center font-data font-bold text-[14px]',
              tamam ? YESIL_DOLGU : sirada ? 'border-2 border-foreground' : 'border-2 border-border text-muted-foreground')}>
              {tamam ? <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className="flex flex-col">
              <b className={cn('text-[15px] leading-snug', !tamam && !sirada && 'text-muted-foreground')}>{ad}{tamam && <span className="sr-only"> (tamamlandı)</span>}</b>
              {z && <span className="text-[13px] text-muted-foreground num">{z}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Onay({ b, nav }: { b: BenimSiparis; nav: Nav }) {
  const [c, setC] = useState<Cevap | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [deneme, setDeneme] = useState(0)
  // Sipariş gönderilince odak başlığa gelir; ekran okuyucu "Sipariş alındı"yı okur
  const baslik = useRef<HTMLHeadingElement>(null)
  useEffect(() => { baslik.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    let gecersiz = false
    siparisTakip(b.no, b.son4).then(j => { if (!gecersiz) { setC(j); setHata(null) } }, e => { if (!gecersiz) setHata(hataYazi(e)) })
    return () => { gecersiz = true }
  }, [b.no, b.son4, deneme])
  const s = c?.siparis

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <span className={cn('w-14 h-14 rounded-full grid place-items-center', YESIL_DOLGU)}><Check className="w-8 h-8" strokeWidth={2.5} aria-hidden /></span>
        <h1 ref={baslik} tabIndex={-1} className="font-display text-[34px] leading-none outline-none">Sipariş alındı</h1>
        <p className="text-[16px]">1337 Crew FC, verdiğin numaradan seninle iletişime geçecek. Ödeme ve teslim elden yapılır.</p>
      </div>

      <div className="rounded-xl bg-clubink text-[#f5f2e6] ring-1 ring-inset ring-white/10 p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-data font-semibold uppercase tracking-[0.08em] text-[13px] text-[#f5f2e6]/75">Sipariş no</div>
          <div className="font-display text-[32px] leading-tight tracking-[0.02em] text-club num">{b.no}</div>
        </div>
        <span className="text-[13px] text-right text-[#f5f2e6]/75 max-w-[84px]">Takip için sakla</span>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="eyebrow !text-foreground mb-3">Sırada ne var</h2>
        {s?.durum === 'iptal' ? <p className="font-semibold text-loss">Bu sipariş iptal edildi.</p> : <Adimlar s={s} ilkZaman={b.zaman} />}
      </section>

      {s ? (
        <section className="rounded-xl border bg-card p-4" aria-label="Sipariş içeriği"><KalemListesi s={s} etiket="Toplam" /></section>
      ) : hata ? (
        <p role="alert" className="text-[14px] font-semibold text-loss flex flex-wrap items-center gap-x-3">
          {hata}
          <button type="button" onClick={() => { setHata(null); setDeneme(n => n + 1) }} className="h-11 inline-flex items-center gap-1.5 text-foreground underline underline-offset-2"><RefreshCw className="w-4 h-4" aria-hidden /> Tekrar dene</button>
        </p>
      ) : <p className="text-[14px] text-muted-foreground" role="status">Yükleniyor…</p>}

      {c?.teslimNotu && s?.durum !== 'iptal' && <TeslimNotu metin={c.teslimNotu} />}
      {c?.whatsapp && <WhatsApp tel={c.whatsapp} no={b.no} />}

      <div className="flex gap-2.5">
        <MagazaLink yol="" nav={nav} className={cn(IKINCIL, 'flex-1 px-3')}>Mağaza</MagazaLink>
        <MagazaLink yol="takip" nav={nav} className={cn(BIRINCIL, 'flex-[2] px-3')}>Siparişimi takip et</MagazaLink>
      </div>
    </div>
  )
}

/** Sipariş verildikten sonraki ekran; numara bu cihazda kayıtlı değilse takip ekranı numarayla açılır */
export function SiparisOnay({ no, nav }: { no: string; nav: Nav }) {
  const b = useMemo(() => benimSiparisler().find(s => s.no === no), [no])
  return b ? <Onay b={b} nav={nav} /> : <SiparisTakip nav={nav} ilkNo={no} />
}

const DURUM_TON: Record<Durum, string> = {
  yeni: 'bg-club text-clubink', gorusuldu: 'bg-club/25 text-foreground', hazir: 'bg-win/15 text-win', teslim: YESIL_DOLGU, iptal: 'bg-loss/15 text-loss',
}
const CUBUK = ['Alındı', 'Görüşüldü', 'Hazır', 'Teslim']

function Sonuc({ c }: { c: Cevap }) {
  const s = c.siparis
  const sira = DURUM_SIRA.indexOf(s.durum)
  const iptal = s.durum === 'iptal'
  return (
    <section className="rounded-xl border bg-card overflow-hidden" aria-label={`Sipariş ${s.no}`}>
      <div className="px-4 py-3.5 flex items-center justify-between gap-3 border-b">
        <div className="min-w-0">
          <h2 className="font-display text-[24px] leading-none num">{s.no}</h2>
          {zamanYazi(s.zaman) && <p className="text-[13px] text-muted-foreground num mt-1">{zamanYazi(s.zaman)}</p>}
        </div>
        <span className={cn('shrink-0 font-data font-bold uppercase tracking-[0.06em] text-[13px] px-2.5 py-1 rounded-md', DURUM_TON[s.durum])}>{DURUM_ETIKET[s.durum]}</span>
      </div>
      <div className="p-4 flex flex-col gap-4">
        {iptal ? <p className="font-semibold text-loss">Bu sipariş iptal edildi.</p> : (
          <ol className="grid grid-cols-4 gap-1" aria-label="Sipariş durumu">
            {CUBUK.map((ad, i) => (
              <li key={ad} className="min-w-0 flex flex-col gap-1.5" aria-current={i === sira ? 'step' : undefined}>
                <span className={cn('h-1.5 rounded-full', i <= sira ? 'bg-win' : 'bg-muted')} />
                <span className={cn('text-[12px] leading-tight truncate', i <= sira ? 'font-semibold' : 'text-muted-foreground')}>{ad}{i <= sira && <span className="sr-only"> (tamamlandı)</span>}</span>
              </li>
            ))}
          </ol>
        )}
        {c.teslimNotu && !iptal && <TeslimNotu metin={c.teslimNotu} />}
        <KalemListesi s={s} etiket={iptal ? 'Toplam' : s.odendi ? 'Ödendi' : 'Ödenecek'} />
        {c.whatsapp && !iptal && <WhatsApp tel={c.whatsapp} no={s.no} />}
      </div>
    </section>
  )
}

/** Sipariş no + telefonun son 4 hanesiyle durum sorgusu */
export function SiparisTakip({ nav, ilkNo = '' }: { nav: Nav; ilkNo?: string }) {
  const liste = useMemo(benimSiparisler, [])
  const [no, setNo] = useState(ilkNo)
  const [son4, setSon4] = useState('')
  const [c, setC] = useState<Cevap | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bekliyor, setBekliyor] = useState(false)
  const istek = useRef(0)

  const sorgula = async (n: string, s4: string) => {
    if (!/\d/.test(n)) { setHata('Sipariş numarasını yaz'); return }
    if (!/^\d{4}$/.test(s4)) { setHata('Telefonun son 4 hanesini yaz'); return }
    const bu = ++istek.current
    setBekliyor(true); setHata(null)
    try {
      const j = await siparisTakip(n.trim(), s4)
      if (bu === istek.current) setC(j)
    } catch (e) {
      if (bu === istek.current) { setC(null); setHata(hataYazi(e)) }
    } finally {
      if (bu === istek.current) setBekliyor(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <GeriLink nav={nav} />
      <h1 className="font-display text-[30px] sm:text-[36px] leading-none mb-4">Sipariş takibi</h1>
      <div className="flex flex-col gap-5">
        {liste.length > 0 && (
          <div>
            <div className="eyebrow mb-2">Siparişlerin</div>
            <div className="flex flex-wrap gap-2">
              {liste.map(b => (
                <button key={b.no} type="button" onClick={() => { setNo(b.no); setSon4(b.son4); sorgula(b.no, b.son4) }} aria-pressed={c?.siparis.no === b.no}
                  className={cn('h-11 px-3 rounded-lg border font-data font-bold text-[15px] num transition-colors', c?.siparis.no === b.no ? 'bg-clubink text-club border-clubink ring-1 ring-inset ring-club/60' : 'bg-card hover:border-foreground')}>
                  {b.no}{kisaGun(b.zaman) && ` · ${kisaGun(b.zaman)}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={e => { e.preventDefault(); sorgula(no, son4) }} noValidate className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="min-w-0">
              <label htmlFor="takip-no" className={ETIKET}>Sipariş no</label>
              <input id="takip-no" value={no} onChange={e => setNo(e.target.value)} maxLength={20} placeholder="1337-0042"
                autoComplete="off" autoCapitalize="characters" spellCheck={false} className={cn(GIRDI, 'font-data font-bold text-[18px] num')} />
            </div>
            <div className="min-w-0">
              <label htmlFor="takip-son4" className={ETIKET}>Telefonun son 4 hanesi</label>
              <input id="takip-son4" value={son4} onChange={e => setSon4(e.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} placeholder="••••"
                inputMode="numeric" autoComplete="off" autoFocus={!!ilkNo} className={cn(GIRDI, 'font-data font-bold text-[18px] num')} />
            </div>
          </div>
          {hata && <p role="alert" className="text-[14px] font-semibold text-loss">{hata}</p>}
          <button type="submit" disabled={bekliyor} className={cn(BIRINCIL, 'w-full')}>{bekliyor ? 'Sorgulanıyor…' : 'Sorgula'}</button>
        </form>

        {c && <Sonuc c={c} />}
      </div>
    </div>
  )
}
