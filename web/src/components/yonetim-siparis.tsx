import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, MessageCircle, Phone, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DURUM_ETIKET, DURUM_SIRA, fiyatYazi, siparisGuncelle, siparisSil, siparislerCsv, telLink, telYazi, waLink, zamanYazi,
  type Durum, type SiparisDegisim, type SiparisKalem, type SiparisTam,
} from '@/lib/magaza'
import { DurumRozet, IndirDugmesi, type Bag } from '@/components/yonetim-ortak'

// Yönetim · Siparişler: özet kartları, arama, süzgeç, liste (geniş ekranda tablo, telefonda kart) ve sipariş ayrıntısı

const IST = 'Europe/Istanbul'
const gunAnahtari = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: IST })
/** Bugün 14:32 · Dün 22:40 · 2 Eki 18:12 */
function kisaZaman(z: string) {
  const d = new Date(z)
  if (isNaN(+d)) return ''
  const g = gunAnahtari(d), saat = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: IST })
  if (g === gunAnahtari(new Date())) return `Bugün ${saat}`
  if (g === gunAnahtari(new Date(Date.now() - 864e5))) return `Dün ${saat}`
  return zamanYazi(z)
}
const kalemOzet = (k: SiparisKalem) => `${k.ad} ${k.beden}${k.adet > 1 ? ` × ${k.adet}` : ''}${k.baski ? ` · ${k.baski.isim} ${k.baski.numara}` : ''}`

type Suz = 'acik' | Durum | 'tumu'
const SUZGEC: [Suz, string][] = [['acik', 'Açık'], ['yeni', 'Yeni'], ['gorusuldu', 'Görüşüldü'], ['hazir', 'Hazır'], ['teslim', 'Teslim edildi'], ['iptal', 'İptal'], ['tumu', 'Tümü']]
const ACIK: Durum[] = ['yeni', 'gorusuldu', 'hazir']
const uyar = (s: SiparisTam, f: Suz) => f === 'tumu' || (f === 'acik' ? ACIK.includes(s.durum) : s.durum === f)

const kucuk = (s: string) => s.toLocaleLowerCase('tr-TR')
/** Sipariş no, ad ya da telefon (0532… ya da 90532… biçiminde, parça da olur) */
function eslesir(s: SiparisTam, q: string) {
  const t = kucuk(q.trim())
  if (!t) return true
  if (kucuk(s.ad).includes(t) || kucuk(s.no).includes(t)) return true
  if (!/^[\d\s()+.-]+$/.test(t)) return false
  const r = t.replace(/\D/g, '')
  if (r.length < 2) return false
  const yerel = s.tel.startsWith('90') ? '0' + s.tel.slice(2) : s.tel
  return s.tel.includes(r) || yerel.includes(r) || s.no.replace(/\D/g, '').includes(r)
}

/** İptalden önceki durum (iptali geri alınca dönülecek) */
function oncekiDurum(s: SiparisTam): Durum {
  const g = s.gecmis
  let i = g.length - 1
  while (i >= 0 && g[i].durum === 'iptal') i--
  return i >= 0 ? g[i].durum : 'yeni'
}

function OdemeYazi({ s }: { s: SiparisTam }) {
  if (s.odendi) return <span className="text-win font-semibold text-[14px] whitespace-nowrap">Elden alındı</span>
  if (s.durum === 'iptal') return <span className="text-muted-foreground">—</span>
  return <span className="text-muted-foreground text-[14px]">Bekliyor</span>
}

const OZET: [Durum, string, string][] = [['yeni', 'Yeni', 'Aranmayı bekliyor'], ['gorusuldu', 'Görüşüldü', 'Hazırlanıyor'], ['hazir', 'Hazır', 'Teslim bekliyor'], ['teslim', 'Teslim', 'Tamamlandı']]

export function Siparisler({ bag, secili, yenile }: { bag: Bag; secili: string | null; yenile: () => Promise<void> }) {
  const { siparisler } = bag.veri
  const [ara, setAra] = useState('')
  const [suz, setSuz] = useState<Suz>('acik')
  const [yenileniyor, setYenileniyor] = useState(false)
  const listeKonum = useRef(0)
  const hedefKonum = useRef<number | null>(null)

  const say = useMemo(() => {
    const n: Record<Suz, number> = { acik: 0, yeni: 0, gorusuldu: 0, hazir: 0, teslim: 0, iptal: 0, tumu: siparisler.length }
    let bekleyen = 0, tutar = 0
    for (const s of siparisler) {
      n[s.durum]++
      if (ACIK.includes(s.durum)) n.acik++
      if (s.durum !== 'iptal' && !s.odendi) { bekleyen++; tutar += s.toplam }
    }
    return { n, bekleyen, tutar }
  }, [siparisler])
  const liste = useMemo(() => siparisler.filter(s => uyar(s, suz) && eslesir(s, ara)), [siparisler, suz, ara])
  const s = secili ? siparisler.find(x => x.no === secili) : undefined

  // Geniş ekranda liste yerinde kalır; telefonda ayrıntı listenin yerine açılır, geri dönünce liste aynı yerden sürer.
  // (Sayfa geçişi en üste kaydırır; ekran çizilmeden önce eski yere dönülür.)
  useLayoutEffect(() => {
    if (hedefKonum.current !== null) scrollTo({ top: hedefKonum.current })
    hedefKonum.current = null
  }, [secili])
  const sec = (no: string) => {
    listeKonum.current = scrollY
    hedefKonum.current = innerWidth >= 1024 ? scrollY : null
    bag.git(`siparis/${no}`)
  }
  const geri = () => { hedefKonum.current = listeKonum.current; bag.git('') }
  const yenileTikla = async () => { if (yenileniyor) return; setYenileniyor(true); await yenile(); setYenileniyor(false) }

  return (
    <div className="flex flex-col gap-4">
      <div className={cn('flex flex-col gap-4', secili && 'hidden lg:flex')}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display text-[28px] sm:text-[34px] leading-none">Siparişler</h2>
          <div className="flex items-start gap-2">
            <button type="button" onClick={yenileTikla} aria-disabled={yenileniyor || undefined} aria-label="Listeyi yenile"
              className="w-11 h-11 grid place-items-center rounded-lg border bg-card aria-disabled:opacity-60">
              <RefreshCw className={cn('w-[18px] h-[18px]', yenileniyor && 'animate-spin')} aria-hidden />
            </button>
            <IndirDugmesi al={siparislerCsv} dosya="1337-siparisler" hataMesaji={bag.hataMesaji}>Excel'e aktar</IndirDugmesi>
          </div>
        </div>

        {/* Telefonda dört küçük kart yan yana, liste hemen altta başlasın */}
        <div className="grid grid-cols-4 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-2.5">
          {OZET.map(([d, kisa, alt]) => (
            <button key={d} type="button" onClick={() => setSuz(d)} aria-pressed={suz === d}
              className={cn('rounded-xl px-2 py-1.5 sm:p-3 sm:px-4 text-left flex flex-col min-w-0 border-[1.5px]',
                d === 'yeni' ? 'bg-club text-clubink border-club' : 'bg-card', suz === d && (d === 'yeni' ? 'border-clubink' : 'border-foreground'))}>
              <span className={cn('font-data font-bold text-[12px] sm:text-[13px] uppercase tracking-wide sm:tracking-wider truncate', d !== 'yeni' && 'text-muted-foreground')}>
                <span className="sm:hidden">{kisa}</span><span className="hidden sm:inline">{DURUM_ETIKET[d]}</span>
              </span>
              <span className="font-display text-[26px] sm:text-[34px] leading-[1.15] num">{say.n[d]}</span>
              <span className={cn('hidden sm:block text-[13px] truncate', d !== 'yeni' && 'text-muted-foreground')}>{alt}</span>
            </button>
          ))}
          <div className="col-span-4 sm:col-span-2 lg:col-span-1 rounded-xl px-3 py-2 sm:p-3 sm:px-4 bg-clubink text-[#f5f2e6] flex flex-wrap items-center justify-between gap-x-3 sm:flex-col sm:flex-nowrap sm:items-start sm:justify-start min-w-0">
            <span className="font-data font-bold text-[13px] uppercase tracking-wider text-club">Elden alınacak</span>
            <span className="font-display text-[24px] sm:text-[30px] leading-[1.15] num truncate">{fiyatYazi(say.tutar)}</span>
            <span className="basis-full sm:basis-auto text-[13px] text-[#f5f2e6]/75">{say.bekleyen ? `${say.bekleyen} siparişte ödeme bekliyor` : 'Bekleyen ödeme yok'}</span>
          </div>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] lg:gap-5 lg:items-start">
        <section aria-label="Sipariş listesi" className={cn('rounded-xl border bg-card overflow-hidden min-w-0', secili && 'hidden lg:block')}>
          <div className="p-3 flex flex-col gap-2.5 border-b">
            <div className="flex flex-col gap-1">
              <label htmlFor="siparis-ara" className="text-[13px] font-semibold text-muted-foreground">Ara</label>
              <input id="siparis-ara" type="search" value={ara} onChange={e => setAra(e.target.value)} placeholder="Sipariş no, ad ya da telefon"
                autoComplete="off" className="h-11 w-full px-3 rounded-lg border bg-background text-[16px]" />
            </div>
            <div role="group" aria-label="Duruma göre süz" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-3 px-3 md:flex-wrap md:overflow-visible">
              {SUZGEC.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={suz === k} onClick={() => setSuz(k)}
                  className={cn('shrink-0 h-11 md:h-10 px-3 rounded-lg border font-data text-[15px] whitespace-nowrap',
                    suz === k ? 'bg-clubink text-club border-club/60 font-bold' : 'bg-card font-semibold')}>
                  {l} <span className="num opacity-75">{say.n[k]}</span>
                </button>
              ))}
            </div>
          </div>

          {liste.length === 0 ? (
            <p className="p-5 text-muted-foreground">{!siparisler.length ? 'Henüz sipariş yok.' : ara.trim() ? 'Aramaya uyan sipariş yok.' : 'Bu süzgeçte sipariş yok.'}</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[720px] text-[14px] border-collapse">
                  <thead>
                    <tr className="text-left font-data font-bold text-[13px] uppercase tracking-wider text-muted-foreground bg-muted/50">
                      <th scope="col" className="px-3 py-2.5">No</th>
                      <th scope="col" className="px-3 py-2.5">Tarih</th>
                      <th scope="col" className="px-3 py-2.5">Müşteri</th>
                      <th scope="col" className="px-3 py-2.5">Ürünler</th>
                      <th scope="col" className="px-3 py-2.5">Tutar</th>
                      <th scope="col" className="px-3 py-2.5">Durum</th>
                      <th scope="col" className="px-3 py-2.5">Ödeme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map(x => (
                      <tr key={x.no} onClick={() => sec(x.no)}
                        className={cn('border-t align-top cursor-pointer', secili === x.no ? 'bg-club/25' : x.durum === 'yeni' ? 'bg-club/10 hover:bg-club/15' : 'hover:bg-muted/60', x.durum === 'iptal' && 'text-muted-foreground')}>
                        <td className="px-3 py-3">
                          <button type="button" onClick={e => { e.stopPropagation(); sec(x.no) }} aria-current={secili === x.no ? 'true' : undefined}
                            className="font-data font-bold text-[16px] whitespace-nowrap hover:underline underline-offset-2">{x.no}</button>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{kisaZaman(x.zaman)}</td>
                        <td className="px-3 py-3 min-w-[130px]"><b className="block font-semibold">{x.ad}</b><span className="text-muted-foreground num whitespace-nowrap">{telYazi(x.tel)}</span></td>
                        <td className="px-3 py-3">
                          {x.kalemler.slice(0, 3).map((k, i) => <span key={i} className="block">{kalemOzet(k)}</span>)}
                          {x.kalemler.length > 3 && <span className="block text-muted-foreground">+{x.kalemler.length - 3} kalem</span>}
                        </td>
                        <td className="px-3 py-3 font-data font-bold text-[15px] num whitespace-nowrap">{fiyatYazi(x.toplam)}</td>
                        <td className="px-3 py-3"><DurumRozet d={x.durum} /></td>
                        <td className="px-3 py-3"><OdemeYazi s={x} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="md:hidden divide-y">
                {liste.map(x => (
                  <li key={x.no}>
                    <button type="button" onClick={() => sec(x.no)}
                      className={cn('w-full text-left px-3 py-3 flex flex-col gap-1', x.durum === 'yeni' && 'bg-club/10', x.durum === 'iptal' && 'text-muted-foreground')}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-data font-bold text-[17px]">{x.no}</span>
                        <DurumRozet d={x.durum} />
                      </span>
                      <span className="flex items-baseline justify-between gap-2 min-w-0">
                        <span className="font-semibold truncate">{x.ad}</span>
                        <span className="text-[13px] text-muted-foreground shrink-0">{kisaZaman(x.zaman)}</span>
                      </span>
                      <span className="text-[14px] text-muted-foreground num">{telYazi(x.tel)}</span>
                      <span className="text-[14px] line-clamp-2">{x.kalemler.map(kalemOzet).join(', ')}</span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-data font-bold text-[17px] num">{fiyatYazi(x.toplam)}</span>
                        <OdemeYazi s={x} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <aside aria-label="Sipariş ayrıntısı"
          className={cn('min-w-0 lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto rounded-xl', !secili && 'hidden lg:block')}>
          {!secili ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">Ayrıntı için listeden bir sipariş seç.</div>
          ) : s ? (
            <SiparisAyrinti key={s.no} s={s} bag={bag} geri={geri} />
          ) : (
            <div className="rounded-xl border bg-card p-5 flex flex-col items-start gap-3 max-w-2xl">
              <p className="font-semibold">Sipariş bulunamadı.</p>
              <button type="button" onClick={geri} className="h-11 px-3 rounded-lg border font-semibold flex items-center gap-1.5"><ChevronLeft className="w-4 h-4" aria-hidden /> Siparişler</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function SiparisAyrinti({ s, bag, geri }: { s: SiparisTam; bag: Bag; geri: () => void }) {
  const [mesgul, setMesgul] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  // İç not: sunucudaki değer değişirse (yoklama) yalnız yazılmakta olan bir not yoksa güncellenir
  const [not, setNot] = useState({ temel: s.icNot, metin: s.icNot })
  if (not.temel !== s.icNot && not.metin === not.temel) setNot({ temel: s.icNot, metin: s.icNot })
  const [notKaydedildi, setNotKaydedildi] = useState(false)
  const notDegisti = not.metin !== not.temel
  const iptalde = s.durum === 'iptal'
  const baslik = useRef<HTMLHeadingElement>(null)
  const notMesaj = useRef<HTMLSpanElement>(null)
  const iptalDugme = useRef<HTMLButtonElement>(null)
  const oncekiIptal = useRef(iptalde)
  // Telefonda ayrıntı listenin yerine açılınca odak başlığa gelsin
  useEffect(() => { if (innerWidth < 1024) baslik.current?.focus({ preventScroll: true }) }, [])
  // Yazılmakta olan iç not: başka siparişe, sekmeye ya da sayfaya geçerken sorulur
  const { kirliAyarla } = bag
  useEffect(() => { kirliAyarla(notDegisti) }, [notDegisti, kirliAyarla])
  useEffect(() => () => kirliAyarla(false), [kirliAyarla])
  // Kaydet düğmesi kaydedince devre dışı kalır; odak "Kaydedildi" yazısına geçer
  useEffect(() => { if (notKaydedildi) notMesaj.current?.focus({ preventScroll: true }) }, [notKaydedildi])
  // "İptal et" ile "İptali geri al" yer değiştirince odak boşa düşmesin
  useEffect(() => {
    if (oncekiIptal.current === iptalde) return
    oncekiIptal.current = iptalde
    if (!document.activeElement || document.activeElement === document.body) iptalDugme.current?.focus()
  }, [iptalde])

  const uygula = async (d: SiparisDegisim) => {
    if (mesgul) return null
    setMesgul(true); setHata(null)
    try {
      const r = await siparisGuncelle(s.no, d)
      bag.degistir(v => ({ ...v, siparisler: v.siparisler.map(x => (x.no === r.siparis.no ? r.siparis : x)), urunler: r.urunler }))
      return r.siparis
    } catch (e) { setHata(bag.hataMesaji(e)); return null } finally { setMesgul(false) }
  }
  const iptal = () => {
    if (!mesgul && window.confirm(`${s.no} iptal edilsin mi?\n\nStoktan satılan ürünlerin adedi stoğa geri eklenir. İptal sonra geri alınabilir.`)) uygula({ durum: 'iptal' })
  }
  const notuKaydet = async () => {
    const r = await uygula({ icNot: not.metin })
    if (r) { setNot({ temel: r.icNot, metin: r.icNot }); setNotKaydedildi(true) }
  }
  const sil = async () => {
    if (mesgul || !window.confirm(`${s.no} kalıcı olarak silinsin mi?\n\nBu işlem geri alınamaz; sipariş listeden ve kayıtlardan tamamen kalkar.${s.durum !== 'iptal' ? ' Stoktan satılan adetler stoğa geri eklenir.' : ''}\n\nYalnızca vazgeçildiyse "İptal et" yeterli.`)) return
    setMesgul(true); setHata(null)
    try {
      const r = await siparisSil(s.no)
      bag.degistir(v => ({ ...v, siparisler: v.siparisler.filter(x => x.no !== s.no), urunler: r.urunler }))
      // Sipariş silindi: yazılmamış iç not için ayrıca sorulmasın
      kirliAyarla(false)
      geri()
    } catch (e) { setHata(bag.hataMesaji(e)); setMesgul(false) }
  }

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 flex flex-col gap-4 max-w-2xl lg:max-w-none">
      <button type="button" onClick={geri} className="lg:hidden -ml-1 -mt-1 self-start h-11 px-1 flex items-center gap-1 font-semibold text-[15px]">
        <ChevronLeft className="w-5 h-5" aria-hidden /> Siparişler
      </button>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 ref={baslik} tabIndex={-1} className="font-display text-[28px] leading-[1.1] outline-none">{s.no}</h3>
          <p className="text-[13px] text-muted-foreground">{zamanYazi(s.zaman)}</p>
        </div>
        <DurumRozet d={s.durum} className="mt-1" />
      </div>

      <div className="rounded-lg bg-muted p-3 flex flex-col gap-2.5">
        <div className="min-w-0">
          <b className="block text-[16px] font-semibold break-words">{s.ad}</b>
          <span className="text-[15px] text-muted-foreground num">{telYazi(s.tel)}</span>
        </div>
        <div className="flex gap-2">
          <a href={waLink(s.tel, `Merhaba ${s.ad}, 1337 Crew FC mağazasındaki ${s.no} numaralı siparişin hakkında yazıyorum.`)} target="_blank" rel="noreferrer"
            className="flex-[2] min-w-0 h-11 rounded-lg bg-pitch text-white flex items-center justify-center gap-2 font-semibold text-[15px] whitespace-nowrap">
            <MessageCircle className="w-[18px] h-[18px] shrink-0" aria-hidden /> WhatsApp'tan yaz
          </a>
          <a href={telLink(s.tel)} className="flex-1 min-w-0 h-11 rounded-lg border-[1.5px] border-foreground flex items-center justify-center gap-1.5 font-semibold text-[15px]">
            <Phone className="w-[18px] h-[18px] shrink-0" aria-hidden /> Ara
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="eyebrow">Ürünler</h4>
        <ul className="flex flex-col gap-2.5">
          {s.kalemler.map((k, i) => (
            <li key={i} className="flex justify-between gap-3 text-[15px]">
              <span className="min-w-0">
                <span className="block font-semibold">{k.ad}</span>
                <span className="block text-[13px] text-muted-foreground num">
                  Beden {k.beden}{k.baski ? ` · baskı: ${k.baski.isim} ${k.baski.numara}` : ''} · {k.adet} × {fiyatYazi(k.birim)}{k.satis === 'onsiparis' ? ' · ön sipariş' : ''}
                </span>
              </span>
              <span className="font-data font-bold text-[16px] num shrink-0">{fiyatYazi(k.birim * k.adet)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between items-baseline border-t pt-2">
          <span className="font-semibold">Toplam</span>
          <span className="font-display text-[24px] num">{fiyatYazi(s.toplam)}</span>
        </div>
      </div>

      {s.not && (
        <div className="flex flex-col gap-1">
          <h4 className="eyebrow">Müşteri notu</h4>
          <p className="text-[15px] whitespace-pre-line break-words">{s.not}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h4 className="eyebrow" id={`durum-${s.no}`}>Durumu değiştir</h4>
        <div role="group" aria-labelledby={`durum-${s.no}`} className={cn('grid grid-cols-2 gap-1.5', iptalde && 'opacity-50')}>
          {DURUM_SIRA.map(d => (
            <button key={d} type="button" aria-pressed={s.durum === d} disabled={iptalde} aria-disabled={mesgul || undefined} onClick={() => s.durum !== d && uygula({ durum: d })}
              className={cn('h-11 rounded-lg border-[1.5px] font-data text-[16px] px-1', s.durum === d ? 'bg-clubink text-club border-club/60 font-bold' : 'bg-card font-semibold')}>
              {DURUM_ETIKET[d]}
            </button>
          ))}
        </div>
        {iptalde ? (
          <div className="flex items-center justify-between gap-2 flex-wrap rounded-lg bg-loss/10 px-3 py-2">
            <span className="text-[14px] font-semibold text-loss">Sipariş iptal edildi.</span>
            <button ref={iptalDugme} type="button" aria-disabled={mesgul || undefined} onClick={() => uygula({ durum: oncekiDurum(s) })}
              className="h-11 px-3 rounded-lg border-[1.5px] border-foreground bg-card font-semibold text-[14px] aria-disabled:opacity-60">İptali geri al</button>
          </div>
        ) : (
          <button ref={iptalDugme} type="button" aria-disabled={mesgul || undefined} onClick={iptal} className="self-start h-11 px-1 font-semibold text-[14px] text-loss underline underline-offset-2 aria-disabled:opacity-60">İptal et</button>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-lg bg-muted px-3 min-h-12 py-2">
        <input id={`odendi-${s.no}`} type="checkbox" checked={s.odendi} aria-disabled={mesgul || undefined} onChange={e => uygula({ odendi: e.target.checked })}
          className="w-[22px] h-[22px] shrink-0 accent-win aria-disabled:opacity-60" />
        <label htmlFor={`odendi-${s.no}`} className="flex-1 font-semibold text-[15px] py-1">
          Ödeme elden alındı
          {s.odendi && s.odemeZaman && <span className="block text-[13px] font-normal text-muted-foreground">{zamanYazi(s.odemeZaman)}</span>}
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`icnot-${s.no}`} className="eyebrow">İç not (yalnız yönetim görür)</label>
        <textarea id={`icnot-${s.no}`} rows={3} maxLength={1000} value={not.metin} placeholder="Ör. pazar maçında verilecek"
          onChange={e => { const metin = e.target.value; setNot(n => ({ ...n, metin })); setNotKaydedildi(false) }}
          className="w-full rounded-lg border bg-background px-3 py-2 text-[16px] resize-y" />
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={notuKaydet} disabled={!notDegisti} aria-disabled={mesgul || undefined}
            className="h-11 px-4 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[14px] disabled:opacity-50 aria-disabled:opacity-50">Kaydet</button>
          {notDegisti ? <span className="text-[13px] text-muted-foreground">Kaydedilmedi</span>
            : notKaydedildi && <span ref={notMesaj} tabIndex={-1} className="text-[13px] text-win font-semibold flex items-center gap-1"><Check className="w-4 h-4" aria-hidden /> Kaydedildi</span>}
        </div>
      </div>

      {hata && <p role="alert" className="text-[14px] text-loss font-semibold">{hata}</p>}

      {s.gecmis.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="eyebrow">Geçmiş</h4>
          <ol className="text-[13px] text-muted-foreground num">
            {s.gecmis.map((g, i) => <li key={i}>{DURUM_ETIKET[g.durum]} · {zamanYazi(g.zaman)}</li>)}
          </ol>
        </div>
      )}

      <button type="button" onClick={sil} aria-disabled={mesgul || undefined}
        className="self-start h-11 px-1 font-semibold text-[14px] text-loss underline underline-offset-2 aria-disabled:opacity-60">Siparişi sil</button>
    </div>
  )
}
