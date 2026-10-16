import { useEffect, useMemo, useRef, useState, type ComponentProps, type RefObject, type SyntheticEvent } from 'react'
import { ArrowLeft, Camera, Check, ChevronLeft, ChevronRight, FileText, Play, RefreshCw, Search, Table2, Trophy, X } from 'lucide-react'
import type { Nav } from '@/App'
import { fmtDate } from '@/lib/site'
import { cn } from '@/lib/utils'
import { Crest, Lightbox, ResultChip, SayfaLink, SectionTitle, TeamBadge, VideoCard } from '@/components/bits'
import {
  guvenliResim, kucukKapak, listeDosya, sadelestir, sayfalarDosya, sonucu, useArsiv, yilDosya, ytGecerli,
  type ArsivListe, type Blok, type Bloklar, type Foto, type GolSatir, type KadroSatir, type PenaltiSatir, type Yazi,
} from '@/lib/arsiv'

// Arşiv: '' liste, '<yazı kimliği>' yazı, 's/<sayfa kimliği>' blogun istatistik sayfası
export default function Arsiv({ yol, nav }: { yol: string; nav: Nav }) {
  const { veri: l, hata, tekrar } = useArsiv<ArsivListe>(listeDosya)
  // Süzgeç ve son açılan yazı listeye dönünce korunur
  const [lig, setLig] = useState('hepsi')
  const [ara, setAra] = useState('')
  const son = useRef<string | null>(null)

  if (!l) return hata ? <Hata baslik="Arşiv" tekrar={tekrar} /> : <Iskelet />
  if (yol.startsWith('s/')) return <SayfaGorunum key={yol} l={l} id={yol.slice(2)} nav={nav} />
  if (yol) return <YaziGorunum key={yol} l={l} id={yol} nav={nav} son={son} />
  return <Liste l={l} nav={nav} lig={lig} setLig={setLig} ara={ara} setAra={setAra} son={son} />
}

const ArsivLink = (p: Omit<ComponentProps<typeof SayfaLink>, 'sayfa'>) => <SayfaLink sayfa="arsiv" {...p} />

const GERI = 'inline-flex items-center gap-1 text-[14px] font-semibold mb-3'
const DUGME = 'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[14px]'

function Iskelet() {
  return (
    <div role="status" aria-label="Yükleniyor" className="animate-pulse max-w-3xl">
      <div className="h-7 w-32 rounded-lg bg-muted mb-4" />
      <div className="h-4 w-full max-w-lg rounded bg-muted mb-6" />
      <div className="rounded-xl border bg-card divide-y">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-[84px]" />)}
      </div>
      <span className="sr-only">Yükleniyor</span>
    </div>
  )
}

function Hata({ baslik, tekrar }: { baslik: string; tekrar: () => void }) {
  return (
    <div className="max-w-md py-6">
      <h1 className="font-display text-[30px] leading-none mb-3">{baslik}</h1>
      <Yuklenemedi mesaj="Arşiv şu an yüklenemedi." tekrar={tekrar} />
    </div>
  )
}

function Yuklenemedi({ mesaj, tekrar }: { mesaj: string; tekrar: () => void }) {
  return (
    <div>
      <p role="alert" className="font-semibold">{mesaj}</p>
      <button type="button" onClick={tekrar} className={cn(DUGME, 'mt-3')}><RefreshCw className="w-4 h-4" aria-hidden /> Tekrar dene</button>
    </div>
  )
}

const ligAdi = (l: ArsivListe, id: string) => l.ligler.find(x => x.id === id)?.ad ?? id
const kunye = (l: ArsivListe, y: Yazi) => [ligAdi(l, y.lig), y.sezon].filter(Boolean).join(' · ')
const kisaTarih = (d: string) => fmtDate(d).split(' ').slice(0, 2).join(' ')
const TUR: Record<string, string> = { istatistik: 'İstatistik', haber: 'Haber' }
const skorYaz = (y: Yazi) => y.skor ? `${y.skor[0]}–${y.skor[1]}${y.pen ? ` (pen. ${y.pen[0]}–${y.pen[1]})` : ''}` : ''
// Bazı blog başlıklarında penaltılar skora eklenmiş: "Crew 10 - 8 Bilkur" = 6–6, penaltılar 4–2
const penDahil = (y: Yazi) => {
  const m = y.baslik.match(/(\d+)\s*-\s*(\d+)/)
  return !!(m && y.skor && y.pen && +m[1] === y.skor[0] + y.pen[0] && +m[2] === y.skor[1] + y.pen[1])
}

/* ---------- Liste ---------- */

function Liste({ l, nav, lig, setLig, ara, setAra, son }: {
  l: ArsivListe; nav: Nav; lig: string; setLig: (s: string) => void; ara: string; setAra: (s: string) => void; son: RefObject<string | null>
}) {
  const q = sadelestir(ara.trim())
  const uyar = (y: Yazi) => (lig === 'hepsi' || (lig === 'haber' ? y.tur !== 'mac' : y.lig === lig)) && (!q || sadelestir(`${y.baslik} ${y.rakip ?? ''}`).includes(q))
  const list = l.yazilar.filter(uyar)
  const sayfalar = l.sayfalar.filter(s => (lig === 'hepsi' || lig === 'haber' || s.lig === lig) && (!q || sadelestir(s.baslik).includes(q)))
  const yilMap = new Map<string, Yazi[]>()
  for (const y of list) { const k = y.tarih.slice(0, 4); yilMap.set(k, [...(yilMap.get(k) ?? []), y]) }
  const yillar = [...yilMap].sort((a, b) => b[0].localeCompare(a[0]))
  const sayac = (id: string) => l.yazilar.filter(y => (id === 'haber' ? y.tur !== 'mac' : y.lig === id)).length
  const secenek = [['hepsi', 'Hepsi', l.yazilar.length], ...l.ligler.map(x => [x.id, x.ad, sayac(x.id)]), ['haber', 'Haber ve istatistik', sayac('haber')]] as [string, string, number][]
  const onecikan = l.onecikan.map(o => ({ o, y: l.yazilar.find(y => y.id === o.id) })).filter(x => x.y)

  // Yazıdan dönünce son açılan satır görünsün
  useEffect(() => {
    if (son.current) document.getElementById(`yazi-${son.current}`)?.scrollIntoView({ block: 'center' })
  }, [son])

  return (
    <div className="max-w-3xl">
      <SectionTitle>Arşiv</SectionTitle>
      <p className="text-[15px] leading-relaxed text-muted-foreground -mt-1 mb-5 max-w-[68ch]">
        Kulübün eski blogundaki 2010–2020 yazıları. Buradaki maçlar sitenin istatistiklerine katılmaz.
        Oyuncular hakkındaki kişisel değerlendirmeler arşive alınmadı.
      </p>

      {onecikan.length > 0 && lig === 'hepsi' && !q && (
        <section className="mb-6">
          <div className="eyebrow mb-2">Öne çıkanlar</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {onecikan.map(({ o, y }) => (
              <ArsivLink key={o.id} yol={o.id} nav={nav} className="flex items-start gap-3 rounded-xl bg-clubink text-[#f5f2e6] p-4 hover:ring-2 hover:ring-club transition-shadow">
                <Trophy className="w-6 h-6 text-club shrink-0 mt-0.5" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-display text-[20px] leading-tight">{o.baslik}</span>
                  <span className="block text-[13px] text-[#f5f2e6]/70 mt-1 truncate">
                    {y!.skor ? [/final/i.test(y!.baslik) && 'Final', skorYaz(y!), y!.rakip].filter(Boolean).join(' · ') : y!.baslik}
                  </span>
                </span>
              </ArsivLink>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4" role="group" aria-label="Lig">
        {secenek.map(([k, ad, n]) => (
          <button key={k} type="button" aria-pressed={lig === k} onClick={() => setLig(k)}
            className={cn('shrink-0 px-3 py-1.5 rounded-md font-data font-semibold text-[14px] border', lig === k ? 'bg-clubink text-club border-clubink' : 'bg-card')}>
            {ad} <span className={cn('num', lig === k ? 'text-club/70' : 'text-muted-foreground')}>{n}</span>
          </button>
        ))}
      </div>
      <label className="relative block mt-2 mb-5 sm:max-w-sm">
        <span className="sr-only">Yazılarda ara</span>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
        <input type="search" value={ara} onChange={e => setAra(e.target.value)} placeholder="Başlık ya da rakip ara"
          className="w-full h-11 pl-9 pr-3 rounded-lg border bg-card text-[16px] sm:text-[15px] outline-none focus:border-clubink" />
      </label>

      {sayfalar.length > 0 && (
        <section className="mb-6" aria-labelledby="arsiv-sayfalar">
          <div id="arsiv-sayfalar" className="eyebrow mb-2">İstatistik sayfaları · sezon tabloları</div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
            {sayfalar.map(s => (
              <ArsivLink key={s.id} yol={`s/${s.id}`} nav={nav} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-card font-semibold text-[14px] hover:border-club transition-colors">
                <Table2 className="w-4 h-4 text-muted-foreground" aria-hidden />{s.baslik}
              </ArsivLink>
            ))}
          </div>
        </section>
      )}

      {!list.length && !sayfalar.length && <p className="text-muted-foreground">Bu seçimde yazı yok.</p>}
      <div className="flex flex-col gap-6">
        {yillar.map(([yil, ys]) => (
          <section key={yil} aria-label={yil}>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-display text-[22px] leading-none">{yil}</h2>
              <span className="eyebrow">{ys.length} yazı</span>
            </div>
            <div className="rounded-xl border bg-card divide-y">{ys.map(y => <YaziSatir key={y.id} y={y} l={l} nav={nav} />)}</div>
          </section>
        ))}
      </div>
    </div>
  )
}

function YaziSatir({ y, l, nav }: { y: Yazi; l: ArsivListe; nav: Nav }) {
  return (
    <ArsivLink id={`yazi-${y.id}`} yol={y.id} nav={nav} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 sm:px-4 py-3 hover:bg-muted/60 transition-colors">
      <Kapak src={y.kapak} tur={y.tur} />
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-data text-[13px] text-muted-foreground">
          <b className="text-foreground">{kisaTarih(y.tarih)}</b>
          {y.foto > 0 && <span className="inline-flex items-center gap-0.5 num" title={`${y.foto} fotoğraf`}><Camera className="w-3.5 h-3.5" aria-hidden />{y.foto}<span className="sr-only"> fotoğraf</span></span>}
          {y.video > 0 && <span className="inline-flex items-center gap-0.5 num" title={`${y.video} video`}><Play className="w-3.5 h-3.5" aria-hidden />{y.video}<span className="sr-only"> video</span></span>}
        </span>
        <span className="block font-semibold text-[15px] leading-snug line-clamp-2">{y.baslik}</span>
        {y.ozet && <span className="hidden sm:block text-[13px] text-muted-foreground truncate">{y.ozet}</span>}
        <span className="block text-[13px] text-muted-foreground truncate">{kunye(l, y)}</span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        {y.skor ? (
          <>
            <span className="flex items-center gap-2">
              <span className="font-display text-xl num">{y.skor[0]}–{y.skor[1]}</span>
              <ResultChip r={sonucu(y.skor)} />
            </span>
            {y.pen && <span className="font-data text-[12px] text-muted-foreground num">pen. {y.pen[0]}–{y.pen[1]}</span>}
            {y.hukmen && <span className="font-data font-bold uppercase tracking-wider text-[11px] px-1.5 rounded bg-club text-clubink">Hükmen</span>}
          </>
        ) : TUR[y.tur] ? <span className="font-data font-bold uppercase tracking-wider text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{TUR[y.tur]}</span> : null}
      </span>
    </ArsivLink>
  )
}

function Kapak({ src, tur }: { src: string | null; tur: string }) {
  const g = guvenliResim(src)
  // 0: küçük kare, 1: asıl kapak, 2: görsel yok
  const [adim, setAdim] = useState(0)
  const I = tur === 'istatistik' ? Table2 : FileText
  return (
    <span className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-muted grid place-items-center shrink-0">
      {g && adim < 2
        ? <img src={adim === 0 ? kucukKapak(g) : g} alt="" width={64} height={64} loading="lazy" decoding="async" referrerPolicy="no-referrer"
            onError={() => setAdim(a => a + 1)} className="w-full h-full object-cover" />
        : <I className="w-5 h-5 text-muted-foreground" aria-hidden />}
    </span>
  )
}

/* ---------- Yazı ---------- */

function YaziGorunum({ l, id, nav, son }: { l: ArsivListe; id: string; nav: Nav; son: RefObject<string | null> }) {
  const i = l.yazilar.findIndex(y => y.id === id)
  const y = i >= 0 ? l.yazilar[i] : undefined
  const { veri, hata, tekrar } = useArsiv<Bloklar>(y ? yilDosya(y.tarih) : null)
  useEffect(() => { if (y) son.current = y.id }, [y, son])

  if (!y) return <Bulunamadi nav={nav} />
  // Liste en yeni önce: önceki yazı (daha eski) bir sonraki satır
  const onceki = l.yazilar[i + 1], sonraki = i > 0 ? l.yazilar[i - 1] : undefined
  const bloklar = veri?.[y.id]

  return (
    <article className="max-w-3xl">
      <ArsivLink yol="" nav={nav} className={GERI}><ArrowLeft className="w-4 h-4" /> Arşiv</ArsivLink>
      <div className="eyebrow">
        {kunye(l, y)} · <time dateTime={y.tarih} title="Blogda yayımlandığı tarih" className="whitespace-nowrap">Blogda {fmtDate(y.tarih)}</time>
      </div>
      <h1 className="font-display text-[30px] sm:text-[38px] leading-[1.05] mt-1">{y.baslik}</h1>
      {y.yazar && <p className="text-[14px] text-muted-foreground mt-1">Yazan: {y.yazar}</p>}
      {penDahil(y) && <p className="text-[14px] text-muted-foreground mt-1">Blog başlığındaki skor penaltılar dahil.</p>}

      {y.skor && <SkorBasligi y={y} />}

      <div className="mt-6">
        {bloklar ? <BlokListe b={bloklar} duz={y.tur === 'istatistik'} />
          : hata ? <Yuklenemedi mesaj="Yazının içeriği şu an yüklenemedi." tekrar={tekrar} />
          : veri ? <p className="text-muted-foreground">{y.ozet || 'Bu yazının içeriği arşivde yok.'}</p>
          : <IcerikIskelet />}
      </div>

      <footer className="mt-10 pt-5 border-t">
        <nav className="grid grid-cols-2 gap-3" aria-label="Diğer yazılar">
          {onceki ? <KomsuYazi y={onceki} yon="onceki" nav={nav} /> : <span />}
          {sonraki ? <KomsuYazi y={sonraki} yon="sonraki" nav={nav} /> : <span />}
        </nav>
      </footer>
    </article>
  )
}

function KomsuYazi({ y, yon, nav }: { y: Yazi; yon: 'onceki' | 'sonraki'; nav: Nav }) {
  const ileri = yon === 'sonraki'
  return (
    <ArsivLink yol={y.id} nav={nav} className={cn('min-w-0 rounded-xl border bg-card p-3 hover:border-club transition-colors', ileri && 'text-right')}>
      <span className={cn('flex items-center gap-1 eyebrow', ileri && 'justify-end')}>
        {!ileri && <ChevronLeft className="w-4 h-4" aria-hidden />}{ileri ? 'Sonraki yazı' : 'Önceki yazı'}{ileri && <ChevronRight className="w-4 h-4" aria-hidden />}
      </span>
      <span className="block text-[14px] font-semibold leading-snug line-clamp-2 mt-1">{y.baslik}</span>
      <span className="block text-[12px] text-muted-foreground mt-0.5">{fmtDate(y.tarih)}</span>
    </ArsivLink>
  )
}

function Bulunamadi({ nav, sayfa }: { nav: Nav; sayfa?: boolean }) {
  return (
    <div className="max-w-md py-6">
      <h1 className="font-display text-[30px] leading-none">{sayfa ? 'Sayfa bulunamadı' : 'Yazı bulunamadı'}</h1>
      <p className="text-muted-foreground mt-2">Bu adreste arşivde bir {sayfa ? 'sayfa' : 'yazı'} yok. Tüm yazılar arşiv listesinde.</p>
      <ArsivLink yol="" nav={nav} className={cn(DUGME, 'mt-4')}><ArrowLeft className="w-4 h-4" aria-hidden /> Arşive dön</ArsivLink>
    </div>
  )
}

function IcerikIskelet() {
  return (
    <div role="status" aria-label="Yükleniyor" className="animate-pulse flex flex-col gap-3">
      <div className="h-4 w-full rounded bg-muted" />
      <div className="h-4 w-11/12 rounded bg-muted" />
      <div className="h-4 w-4/5 rounded bg-muted" />
      <div className="aspect-[4/3] max-w-xl rounded-lg bg-muted mt-2" />
      <span className="sr-only">Yükleniyor</span>
    </div>
  )
}

// Rakip rozeti: iki kelimeyse baş harfler (How High → HH), tek kelimeyse ilk üç harf
function rakipKod(ad: string) {
  const k = ad.split(/\s+/).filter(Boolean)
  return (k.length > 1 ? k.map(w => w[0]).join('') : ad.slice(0, 3)).toLocaleUpperCase('tr')
}

function SkorBasligi({ y }: { y: Yazi }) {
  const [a, b] = y.skor!
  const rakip = y.rakip ?? 'Rakip'
  const pen = y.pen
  return (
    <section className="rounded-xl bg-clubink text-[#f5f2e6] p-5 mt-5" aria-label="Skor">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center gap-2 text-center min-w-0">
          <Crest size={56} />
          <span className="font-display text-lg sm:text-2xl leading-tight">1337 Crew FC</span>
        </div>
        <div className="text-center">
          <div className="font-display text-5xl num">{a}–{b}</div>
          {pen && <div className="font-data text-[14px] text-[#f5f2e6]/70 mt-1 num">Penaltılar {pen[0]}–{pen[1]}</div>}
        </div>
        <div className="flex flex-col items-center gap-2 text-center min-w-0">
          <TeamBadge code={rakipKod(rakip)} size={56} />
          <span className="font-display text-lg sm:text-2xl leading-tight break-words">{rakip}</span>
        </div>
      </div>
      <div className="flex justify-center items-center gap-2 mt-3">
        <ResultChip r={sonucu(y.skor!)} className="w-auto px-3" />
        {pen && pen[0] !== pen[1] && <span className="font-data font-semibold text-[13px] text-[#f5f2e6]/80">{pen[0] > pen[1] ? 'Penaltılarla kazandı' : 'Penaltılarla kaybetti'}</span>}
        {y.hukmen && <span className="font-data font-bold uppercase tracking-wider text-[13px] px-2 py-0.5 rounded bg-club text-clubink">Hükmen</span>}
      </div>
    </section>
  )
}

/* ---------- Sayfa ---------- */

function SayfaGorunum({ l, id, nav }: { l: ArsivListe; id: string; nav: Nav }) {
  const s = l.sayfalar.find(x => x.id === id)
  const { veri, hata, tekrar } = useArsiv<Bloklar>(s ? sayfalarDosya : null)
  if (!s) return <Bulunamadi nav={nav} sayfa />
  const bloklar = veri?.[s.id]
  return (
    <article className="max-w-4xl">
      <ArsivLink yol="" nav={nav} className={GERI}><ArrowLeft className="w-4 h-4" /> Arşiv</ArsivLink>
      <div className="eyebrow">{ligAdi(l, s.lig)} · İstatistik sayfası</div>
      <h1 className="font-display text-[30px] sm:text-[38px] leading-[1.05] mt-1">{s.baslik}</h1>
      <div className="mt-6">
        {bloklar ? <BlokListe b={bloklar} />
          : hata ? <Yuklenemedi mesaj="Sayfanın içeriği şu an yüklenemedi." tekrar={tekrar} />
          : veri ? <p className="text-muted-foreground">Bu sayfanın içeriği arşivde yok.</p>
          : <IcerikIskelet />}
      </div>
    </article>
  )
}

/* ---------- Bloklar ---------- */

// duz: istatistik yazıları; görseller (çoğu tablo resmi) kırpılmadan tam genişlikte alt alta
function BlokListe({ b, duz }: { b: Blok[]; duz?: boolean }) {
  const [acik, setAcik] = useState<number | null>(null)
  // Fotoğraflar yazı boyunca tek sırada: büyük görünümde oklarla hepsi gezilir
  const { parcalar, fotolar } = useMemo(() => {
    const fotolar: Foto[] = []
    const parcalar: ({ t: 'blok'; b: Blok } | { t: 'foto'; ilk: number; n: number } | { t: 'yt'; ids: string[] })[] = []
    for (const x of b) {
      if (x.t === 'foto') {
        const g = x.r.filter(f => guvenliResim(f.src) && guvenliResim(f.k))
        if (g.length) { parcalar.push({ t: 'foto', ilk: fotolar.length, n: g.length }); fotolar.push(...g) }
      } else if (x.t === 'yt') {
        if (!ytGecerli(x.id)) continue
        const onceki = parcalar[parcalar.length - 1]
        if (onceki?.t === 'yt') onceki.ids.push(x.id)
        else parcalar.push({ t: 'yt', ids: [x.id] })
      } else parcalar.push({ t: 'blok', b: x })
    }
    return { parcalar, fotolar }
  }, [b])

  return (
    <div className="flex flex-col gap-4">
      {parcalar.map((p, i) =>
        p.t === 'foto' ? <FotoGrup key={i} fotolar={fotolar.slice(p.ilk, p.ilk + p.n)} ac={j => setAcik(p.ilk + j)} duz={duz} />
        : p.t === 'yt' ? (
          <div key={i} className={cn('grid gap-4', p.ids.length > 1 && 'sm:grid-cols-2')}>
            {p.ids.map(id => (
              <div key={id} className={p.ids.length > 1 ? '' : 'max-w-xl'}>
                <VideoCard v={{ id, kind: 'full', title: "YouTube'da izle", thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` }} label="VİDEO" />
              </div>
            ))}
          </div>
        )
        : <TekBlok key={i} b={p.b} />,
      )}
      {acik !== null && fotolar[acik] && <Lightbox src={guvenliResim(fotolar[acik].src)!} i={acik} n={fotolar.length} setI={setAcik} noReferrer />}
    </div>
  )
}

function TekBlok({ b }: { b: Blok }) {
  switch (b.t) {
    case 'p': return <p className="text-[17px] leading-relaxed max-w-[65ch] whitespace-pre-line break-words">{b.x}</p>
    case 'h': return <h2 className="font-display text-[22px] leading-tight mt-3">{b.x}</h2>
    case 'kadro': return <Kadro r={b.r} />
    case 'goller': return <Goller r={b.r} />
    case 'penaltilar': return <Penaltilar r={b.r} />
    case 'tablo': return <Tablo r={b.r} baslik={b.baslik} />
    default: return null
  }
}

function Kadro({ r }: { r: KadroSatir[] }) {
  // Oyuna giren oyuncu, yerine girdiği oyuncunun altında durur
  const gruplar: KadroSatir[][] = []
  for (const x of r) {
    if (x.dk !== null && gruplar.length) gruplar[gruplar.length - 1].push(x)
    else gruplar.push([x])
  }
  const notlu = r.some(x => x.p !== null)
  return (
    <section className="rounded-xl border bg-card p-4 my-2">
      <div className="eyebrow mb-2">Kadro{notlu ? ' ve notlar' : ''}</div>
      <div className="columns-2 gap-x-6">
        {gruplar.map((g, i) => (
          <div key={i} className="break-inside-avoid">
            {g.map((x, j) => (
              <div key={j} className={cn('flex items-baseline gap-2 py-1 text-[15px]', j > 0 && 'pl-3 text-muted-foreground')}>
                {x.dk !== null && <span className="font-data font-semibold text-[12px] num shrink-0" title={`${x.dk}. dakikada oyuna girdi`}>↳ {x.dk}'</span>}
                <span className={cn('min-w-0 flex-1 truncate', j === 0 && 'font-semibold')}>{x.ad}</span>
                {x.p !== null && <span className="font-data font-bold text-[14px] num shrink-0 text-foreground">{x.p}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

// Blogdaki işaretler: "K.K" / "Kendi Kalesine" rakibin kendi kalesine attığı gol, "(p)" / "(pen)" penaltı
const KK = /^(?:k\.?\s?k\.?|kendi kalesine)$/i
const PEN = /\s*\((?:p|pen\.?|penaltı)\)$/i

function Goller({ r }: { r: GolSatir[] }) {
  return (
    <section className="my-2">
      <div className="eyebrow mb-2">Goller</div>
      <ul className="flex flex-col gap-1.5">
        {r.map((g, i) => (
          <li key={i} className="flex items-baseline gap-2.5 text-[15px]">
            <span className="font-data font-bold text-[13px] num w-10 shrink-0 text-center rounded bg-club text-clubink py-0.5">{g.dk !== null ? `${g.dk}'` : '–'}</span>
            <span className="min-w-0">
              {KK.test(g.ad) ? <span className="text-muted-foreground">Kendi kalesine</span> : <b className="font-semibold">{g.ad.replace(PEN, '')}</b>}
              {PEN.test(g.ad) && <span className="ml-1.5 font-data font-semibold uppercase tracking-wider text-[11px] px-1 rounded bg-muted text-muted-foreground">pen.</span>}
              {g.asist && <span className="text-muted-foreground"> · asist: {g.asist}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Penaltilar({ r }: { r: PenaltiSatir[] }) {
  return (
    <section className="my-2">
      <div className="eyebrow mb-2">Penaltılar</div>
      <ol className="flex flex-wrap gap-2">
        {r.map((x, i) => (
          <li key={i} className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[14px] font-semibold',
            x.gol === true && 'border-win/40 bg-win/10', x.gol === false && 'border-loss/40 bg-loss/10')}>
            {x.gol === true && <Check className="w-4 h-4 text-win" aria-label="gol" />}
            {x.gol === false && <X className="w-4 h-4 text-loss" aria-label="kaçtı" />}
            {x.ad}
          </li>
        ))}
      </ol>
    </section>
  )
}

// Sayı sütunu: boş ya da '-' dışındaki tüm hücreler sayı (8(2): 8 maç, 2'si yedekten)
const sayiMi = (s: string) => /^[-+]?\d+([.,]\d+)?(\(\d+\))?%?$/.test(s.trim())
const bosMu = (s: string) => /^[-–]?$/.test(s.trim())

function Tablo({ r, baslik }: { r: string[][]; baslik: string | null }) {
  if (!r.length) return null
  const [bas, ...satirlar] = r
  const sayiSutun = bas.map((_, j) => j > 0 && satirlar.some(s => sayiMi(s[j] ?? '')) && satirlar.every(s => sayiMi(s[j] ?? '') || bosMu(s[j] ?? '')))
  return (
    <section className="my-2">
      {baslik && <h2 className="font-display text-[22px] leading-tight mb-2">{baslik}</h2>}
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-[14px] border-collapse">
          <thead>
            <tr className="border-b">
              {bas.map((h, i) => (
                <th key={i} scope="col" className={cn('px-3 py-2 font-data font-semibold uppercase tracking-wider text-[12px] text-muted-foreground whitespace-nowrap',
                  sayiSutun[i] ? 'text-right' : 'text-left', i === 0 && 'sticky left-0 bg-card')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s, i) => {
              const ozet = /^(ortalama|toplam)$/i.test(s[0]?.trim() ?? '')
              return (
                <tr key={i} className={cn('border-b last:border-b-0', ozet && 'bg-muted font-semibold')}>
                  {s.map((c, j) => (
                    <td key={j} className={cn('px-3 py-1.5 whitespace-nowrap', sayiSutun[j] && 'num text-right', j === 0 && cn('sticky left-0 font-semibold', ozet ? 'bg-muted' : 'bg-card'))}>{c}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// Tek foto ve istatistik görselleri doğal oranında; ızgarada çok yatık/dik görseller (tablo resimleri) kırpılmaz
function FotoGrup({ fotolar, ac, duz }: { fotolar: Foto[]; ac: (i: number) => void; duz?: boolean }) {
  const tek = fotolar.length === 1 || duz
  const [sigdir, setSigdir] = useState<Record<number, boolean>>({})
  const olc = (i: number) => (e: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
    if (h && (w / h > 1.8 || w / h < 0.75)) setSigdir(s => ({ ...s, [i]: true }))
  }
  if (tek) return (
    <div className={cn('flex flex-col gap-2', !duz && 'max-w-xl')}>
      {fotolar.map((f, i) => (
        <button key={i} type="button" onClick={() => ac(i)} aria-label="Fotoğrafı büyüt" className="block w-fit max-w-full rounded-lg overflow-hidden group">
          <img src={guvenliResim(f.k)!} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
            className="block max-w-full h-auto max-h-[70vh] group-hover:scale-[1.02] transition-transform" />
        </button>
      ))}
    </div>
  )
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
      {fotolar.map((f, i) => (
        <button key={i} type="button" onClick={() => ac(i)} aria-label="Fotoğrafı büyüt"
          className="block w-full aspect-[4/3] rounded-lg overflow-hidden bg-muted group">
          <img src={guvenliResim(f.k)!} alt="" width={640} height={480} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={olc(i)}
            className={cn('w-full h-full group-hover:scale-[1.02] transition-transform', sigdir[i] ? 'object-contain' : 'object-cover')} />
        </button>
      ))}
    </div>
  )
}
