import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Package, Phone, ShoppingBag, X } from 'lucide-react'
import type { Nav } from '@/App'
import { cn } from '@/lib/utils'
import { UrunGorsel } from '@/components/magaza-gorsel'
import { AdetSecici, BIRINCIL, ETIKET, GeriLink, GIRDI, MagazaLink } from '@/components/magaza-ortak'
import { baskiOku, hataYazi, kalemYazi, sepetCoz, siparisiSakla, telGecerli, type Satir } from '@/components/magaza-yardim'
import { fiyatYazi, MagazaHata, sepetAdetAyarla, sepetBosalt, siparisVer, useSepet, type Katalog } from '@/lib/magaza'

type Alan = 'ad' | 'tel' | 'izin'

// Form taslağı bu sekmede saklanır: site kendiliğinden yenilenirse ya da sekme geri yüklenirse yazılanlar kaybolmaz
const TASLAK = '1337-siparis-taslak'
type Taslak = { ad: string; tel: string; not: string }
function taslakOku(): Taslak {
  try {
    const j = JSON.parse(sessionStorage.getItem(TASLAK) ?? '{}')
    const y = (v: unknown) => (typeof v === 'string' ? v : '')
    return { ad: y(j?.ad), tel: y(j?.tel), not: y(j?.not) }
  } catch { return { ad: '', tel: '', not: '' } }
}
function taslakYaz(t: Taslak | null) {
  try { if (t && (t.ad || t.tel || t.not)) sessionStorage.setItem(TASLAK, JSON.stringify(t)); else sessionStorage.removeItem(TASLAK) } catch { /* depolama kapalı */ }
}

function SepetSatiri({ s, cikti }: { s: Satir; cikti: () => void }) {
  const { k, u } = s
  const ad = u?.ad ?? 'Ürün bulunamadı'
  const cikar = () => { sepetAdetAyarla(s.i, 0); cikti() }
  const fazla = !s.sorun && k.adet > s.enFazla
  return (
    <li className="rounded-xl border bg-card p-2.5 flex gap-3">
      {u ? <UrunGorsel u={u} className={cn('w-16 h-16 rounded-lg shrink-0', s.sorun && 'opacity-50')} />
        : <span className="w-16 h-16 rounded-lg shrink-0 bg-muted grid place-items-center text-muted-foreground"><Package className="w-6 h-6" /></span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <div className={cn('min-w-0 flex-1', s.sorun && 'opacity-60')}>
            <p className="font-semibold text-[15px] leading-tight break-words">{ad}</p>
            <p className="text-[13px] text-muted-foreground break-words">{kalemYazi(k)}</p>
            {u && <p className="text-[13px] text-muted-foreground num">{fiyatYazi(s.birim)} / adet</p>}
          </div>
          <button type="button" onClick={cikar} aria-label={`${ad}, ${kalemYazi(k)}: sepetten çıkar`}
            className="w-11 h-11 -mr-1 -mt-1 shrink-0 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        {s.sorun ? (
          <p className="text-[13px] font-semibold text-loss flex flex-wrap items-center gap-x-3">
            {s.sorun}
            <button type="button" onClick={cikar} className="h-11 text-foreground underline underline-offset-2">Sepetten çıkar</button>
          </p>
        ) : (
          <>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <AdetSecici deger={k.adet} set={n => sepetAdetAyarla(s.i, Math.max(1, Math.min(n, Math.max(1, s.enFazla))))} enFazla={Math.max(1, s.enFazla)} etiket={`${ad} adedi`} />
              <b className="font-data text-[18px] num">{fiyatYazi(s.birim * k.adet)}</b>
            </div>
            {fazla && (
              <p className="text-[13px] font-semibold text-loss flex flex-wrap items-center gap-x-3 num">
                Bu bedende {s.enFazla} adet kaldı.
                <button type="button" onClick={() => sepetAdetAyarla(s.i, s.enFazla)} className="h-11 text-foreground underline underline-offset-2">{s.enFazla} adede düşür</button>
              </p>
            )}
          </>
        )}
      </div>
    </li>
  )
}

/** Sepet ve sipariş formu */
export function SepetSayfa({ kat, nav, yenile }: { kat: Katalog; nav: Nav; yenile: () => void }) {
  const sepet = useSepet()
  const satirlar = useMemo(() => sepetCoz(sepet, kat), [sepet, kat])
  const gecerli = satirlar.filter(s => !s.sorun)
  const toplam = gecerli.reduce((t, s) => t + s.birim * s.k.adet, 0)
  const [ilk] = useState(taslakOku)
  const [ad, setAd] = useState(ilk.ad)
  const [tel, setTel] = useState(ilk.tel)
  const [not, setNot] = useState(ilk.not)
  useEffect(() => { taslakYaz({ ad, tel, not }) }, [ad, tel, not])
  // Satır çıkarılınca düğmesi kaybolur; odak "Sepet" başlığına geçer
  const baslik = useRef<HTMLHeadingElement>(null)
  const [cikan, setCikan] = useState(0)
  useEffect(() => { if (cikan) baslik.current?.focus({ preventScroll: true }) }, [cikan])
  const cikti = () => setCikan(n => n + 1)
  const [izin, setIzin] = useState(false)
  const [web, setWeb] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState<{ mesaj: string; alan?: Alan } | null>(null)
  // Hatalı alan düzeltilmeye başlanınca uyarı kalkar
  const duzelt = (alan: Alan) => { if (hata?.alan === alan) setHata(null) }

  const gonder = async (e: FormEvent) => {
    e.preventDefault()
    if (gonderiliyor) return
    const uyar = (mesaj: string, alan?: Alan) => { setHata({ mesaj, alan }); if (alan) document.getElementById(`siparis-${alan}`)?.focus() }
    // iPhone'un akıllı noktalaması: D’Angelo → D'Angelo (sunucu da böyle düzeltir)
    const adTemiz = ad.replace(/[’‘ʼ]/g, "'").replace(/\s+/g, ' ').trim()
    if (!kat.acik) return uyar('Mağaza şu an sipariş almıyor.')
    if (!gecerli.length) return uyar('Sepette sipariş verilebilecek ürün yok.')
    if (gecerli.some(s => s.k.adet > s.enFazla)) return uyar('Sepetteki adetleri kontrol et.')
    if (gecerli.length > 20) return uyar('Bir siparişte en fazla 20 kalem olabilir.')
    if (adTemiz.length < 2 || !/^\p{L}[\p{L}\p{M} .'-]+$/u.test(adTemiz)) return uyar('Adını ve soyadını yaz', 'ad')
    if (!telGecerli(tel)) return uyar('Telefon numarasını kontrol et', 'tel')
    if (!izin) return uyar('Onay kutusunu işaretle', 'izin')
    setHata(null)
    setGonderiliyor(true)
    try {
      const j = await siparisVer({
        ad: adTemiz, tel: tel.trim(), not: not.trim(), izin, web,
        kalemler: gecerli.map(({ k }) => { const b = baskiOku(k); return { urun: k.urun, beden: k.beden, adet: k.adet, ...(b ? { baski: b } : {}) } }),
      })
      siparisiSakla({ no: j.no, son4: tel.replace(/\D/g, '').slice(-4), zaman: j.zaman })
      taslakYaz(null)
      // Önce onay ekranına geç, sonra sepeti boşalt: arada "Sepetin boş" görünmesin
      flushSync(() => nav.go({ page: 'magaza', yol: `siparis/${j.no}` }))
      sepetBosalt()
      yenile()
    } catch (er) {
      setHata({ mesaj: hataYazi(er) })
      // Stok bitti / ön sipariş ya da mağaza kapandı: güncel durumu göster
      if (er instanceof MagazaHata && er.durum === 409) yenile()
    } finally {
      setGonderiliyor(false)
    }
  }

  if (!sepet.length) return (
    <div className="max-w-xl">
      <GeriLink nav={nav} />
      <h1 ref={baslik} tabIndex={-1} className="font-display text-[30px] sm:text-[36px] leading-none outline-none">Sepet</h1>
      <div className="mt-4 rounded-xl border bg-card p-8 text-center">
        <ShoppingBag className="w-8 h-8 mx-auto text-muted-foreground" aria-hidden />
        <p className="mt-2 font-semibold text-[17px]">Sepetin boş.</p>
        <MagazaLink yol="" nav={nav} className={cn(BIRINCIL, 'mt-4')}>Mağazaya dön</MagazaLink>
      </div>
    </div>
  )

  return (
    <div>
      <GeriLink nav={nav} />
      <h1 ref={baslik} tabIndex={-1} className="font-display text-[30px] sm:text-[36px] leading-none mb-4 outline-none">Sepet</h1>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-6 lg:gap-8 items-start">
        <section aria-label="Sepetteki ürünler" className="min-w-0">
          <ul className="flex flex-col gap-2.5">
            {satirlar.map(s => <SepetSatiri key={`${s.k.urun}|${s.k.beden}|${s.k.baski?.isim ?? ''}|${s.k.baski?.numara ?? ''}`} s={s} cikti={cikti} />)}
          </ul>
          <div className="flex justify-between items-baseline gap-3 mt-3 px-0.5">
            <span className="font-data font-bold uppercase tracking-wider text-[15px]">Toplam</span>
            <span className="font-display text-[26px] num">{fiyatYazi(toplam)}</span>
          </div>
        </section>

        <form onSubmit={gonder} noValidate className="relative min-w-0 flex flex-col gap-3 border-t pt-5 lg:border lg:rounded-xl lg:bg-card lg:p-5">
          <h2 className="font-display text-[22px] leading-none">Sipariş bilgileri</h2>
          <div>
            <label htmlFor="siparis-ad" className={ETIKET}>Ad soyad</label>
            <input id="siparis-ad" value={ad} onChange={e => { setAd(e.target.value); duzelt('ad') }} autoComplete="name" maxLength={60}
              aria-invalid={hata?.alan === 'ad'} className={cn(GIRDI, 'lg:bg-background')} />
          </div>
          <div>
            <label htmlFor="siparis-tel" className={ETIKET}>Telefon (WhatsApp)</label>
            <input id="siparis-tel" type="tel" inputMode="tel" value={tel} onChange={e => { setTel(e.target.value); duzelt('tel') }} autoComplete="tel" maxLength={24}
              placeholder="05xx xxx xx xx" aria-invalid={hata?.alan === 'tel'} className={cn(GIRDI, 'lg:bg-background num')} />
          </div>
          <div>
            <label htmlFor="siparis-not" className={ETIKET}>Not (isteğe bağlı)</label>
            <textarea id="siparis-not" value={not} onChange={e => setNot(e.target.value)} rows={2} maxLength={500}
              placeholder="Teslim için uygun gün, beden sorusu…" className={cn(GIRDI, 'h-auto min-h-[76px] py-2.5 resize-y lg:bg-background')} />
          </div>
          <p className="rounded-xl bg-clubink text-[#f5f2e6] ring-1 ring-inset ring-white/10 p-3 flex gap-2.5 items-start text-[14px] leading-snug">
            <Phone className="w-5 h-5 shrink-0 text-club" aria-hidden />
            <span>Ödeme ve teslim elden. Siparişten sonra 1337 Crew FC bu numaradan seninle iletişime geçer.</span>
          </p>
          <div className="flex gap-3 items-start">
            <input id="siparis-izin" type="checkbox" checked={izin} onChange={e => { setIzin(e.target.checked); duzelt('izin') }} aria-invalid={hata?.alan === 'izin'}
              className="mt-0.5 w-5 h-5 shrink-0 accent-[hsl(var(--foreground))]" />
            <label htmlFor="siparis-izin" className="text-[14px] leading-snug">Ad ve telefonumun yalnızca bu sipariş için kullanılmasını kabul ediyorum.</label>
          </div>
          {/* Bot tuzağı: insanlar görmez, boş kalmalı */}
          <div aria-hidden className="absolute -left-[10000px] top-0 w-px h-px overflow-hidden">
            <label htmlFor="siparis-web">Web sitesi</label>
            <input id="siparis-web" name="web" type="text" value={web} onChange={e => setWeb(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden />
          </div>
          {hata && <p role="alert" className="text-[14px] font-semibold text-loss">{hata.mesaj}</p>}
          <button type="submit" disabled={gonderiliyor} className={cn(BIRINCIL, 'w-full h-[52px] text-[18px]')}>{gonderiliyor ? 'Gönderiliyor…' : 'Siparişi gönder'}</button>
        </form>
      </div>
    </div>
  )
}
