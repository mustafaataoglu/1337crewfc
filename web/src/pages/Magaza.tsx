import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, CircleAlert, MapPin, Package, RefreshCw, ShoppingBag } from 'lucide-react'
import type { Nav } from '@/App'
import { cn } from '@/lib/utils'
import { UrunGorsel } from '@/components/magaza-gorsel'
import { BIRINCIL, IKINCIL, MagazaLink, Rozet } from '@/components/magaza-ortak'
import { sepetCoz, urunEtiketi } from '@/components/magaza-yardim'
import { UrunSayfa } from '@/components/magaza-urun'
import { SepetSayfa } from '@/components/magaza-sepet'
import { SiparisOnay, SiparisTakip } from '@/components/magaza-siparis'
import { fiyatYazi, katalogAl, sepetAdet, useSepet, type Katalog, type Urun } from '@/lib/magaza'

// Mağaza: '' ürünler, 'urun/<id>', 'sepet', 'siparis/<no>' (sipariş alındı), 'takip'

/** İlk ürün büyük siyah kart */
function OneCikan({ u, acik, nav }: { u: Urun; acik: boolean; nav: Nav }) {
  return (
    <MagazaLink yol={`urun/${u.id}`} nav={nav}
      className="group col-span-2 lg:col-span-3 rounded-xl overflow-hidden bg-clubink text-[#f5f2e6] ring-1 ring-inset ring-white/10 grid sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <UrunGorsel u={u} className="aspect-[3/2] sm:aspect-auto sm:min-h-[300px]" />
      <span className="p-4 sm:p-7 flex flex-col gap-2 sm:justify-center">
        <Rozet r={urunEtiketi(u, acik)} koyu />
        <span className="font-display text-[26px] sm:text-[38px] leading-[1.05] break-words transition-colors group-hover:text-club">{u.ad}</span>
        <span className="flex items-baseline justify-between gap-x-3 gap-y-1 flex-wrap">
          {u.baski ? <span className="text-[14px] text-[#f5f2e6]/75">İsim ve numara baskılı olabilir</span> : <span />}
          <b className="font-data text-[21px] num">{fiyatYazi(u.fiyat)}</b>
        </span>
      </span>
    </MagazaLink>
  )
}

function UrunKart({ u, acik, nav }: { u: Urun; acik: boolean; nav: Nav }) {
  return (
    <MagazaLink yol={`urun/${u.id}`} nav={nav} className="min-w-0 rounded-xl border bg-card p-2.5 flex flex-col gap-2 transition-colors hover:border-club">
      <UrunGorsel u={u} className="aspect-square rounded-lg" />
      <span className="font-semibold text-[15px] leading-tight break-words">{u.ad}</span>
      <span className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <b className="font-data text-[17px] num">{fiyatYazi(u.fiyat)}</b>
        <Rozet r={urunEtiketi(u, acik)} />
      </span>
    </MagazaLink>
  )
}

function Liste({ kat, nav }: { kat: Katalog; nav: Nav }) {
  const sepet = useSepet()
  const adet = sepetAdet(sepet)
  const toplam = sepetCoz(sepet, kat).reduce((t, s) => t + (s.sorun ? 0 : s.birim * s.k.adet), 0)
  const [ilk, ...diger] = kat.urunler
  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-4">
        <h1 className="font-display text-[30px] sm:text-[36px] leading-none">Mağaza</h1>
        <span className="font-data font-semibold text-[14px] text-muted-foreground text-right">Ödeme ve teslim elden</span>
      </div>
      {!kat.acik && (
        <p role="status" className="mb-3 rounded-xl border border-loss/30 bg-loss/10 text-loss font-semibold p-3 flex items-center gap-2">
          <CircleAlert className="w-5 h-5 shrink-0" aria-hidden /> Mağaza şu an sipariş almıyor.
        </p>
      )}
      {kat.teslimNotu && (
        <p className="mb-4 rounded-xl bg-muted text-muted-foreground text-[14px] leading-snug p-3 flex gap-2.5 items-start">
          <MapPin className="w-4 h-4 shrink-0 mt-0.5" aria-hidden /><span className="whitespace-pre-line break-words">{kat.teslimNotu}</span>
        </p>
      )}
      {ilk ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <OneCikan u={ilk} acik={kat.acik} nav={nav} />
          {diger.map(u => <UrunKart key={u.id} u={u} acik={kat.acik} nav={nav} />)}
        </div>
      ) : <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">Ürünler yakında.</p>}

      <div className="mt-8 flex items-center justify-between gap-3 flex-wrap">
        <MagazaLink yol="takip" nav={nav} className={cn(IKINCIL, 'h-11 px-4 text-[14px] border')}><Package className="w-4 h-4" aria-hidden /> Sipariş takibi</MagazaLink>
        <MagazaLink sayfa="yonetim" yol="" nav={nav} className="h-11 inline-flex items-center px-2 text-[13px] text-muted-foreground underline-offset-2 hover:underline hover:text-foreground">Yönetim</MagazaLink>
      </div>

      {adet > 0 && (
        // Telefonda alt menünün üstünde, geniş ekranda sağ altta (data-alt-cubuk: altbilgi altında yer açılır)
        <div data-alt-cubuk className="fixed inset-x-0 z-20 px-4 bottom-[calc(56px+env(safe-area-inset-bottom))] md:bottom-4 pointer-events-none">
          <div className="max-w-6xl mx-auto flex md:justify-end">
            <MagazaLink yol="sepet" nav={nav}
              className="pointer-events-auto w-full md:w-auto md:min-w-[360px] h-14 px-4 rounded-xl bg-club text-clubink shadow-lg shadow-black/25 flex items-center gap-3 font-data font-bold uppercase tracking-wider text-[16px]">
              <ShoppingBag className="w-5 h-5 shrink-0" aria-hidden />
              <span>Sepete git</span>
              <span className="ml-auto normal-case tracking-normal num">{adet} ürün{toplam > 0 && ` · ${fiyatYazi(toplam)}`}</span>
            </MagazaLink>
          </div>
        </div>
      )}
    </div>
  )
}

function Iskelet() {
  return (
    <div role="status" aria-label="Yükleniyor" className="animate-pulse">
      <div className="h-8 w-40 rounded-lg bg-muted mb-4" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="col-span-2 lg:col-span-3 h-72 rounded-xl bg-muted" />
        <div className="aspect-[4/5] rounded-xl bg-muted" />
        <div className="aspect-[4/5] rounded-xl bg-muted" />
      </div>
      <span className="sr-only">Yükleniyor</span>
    </div>
  )
}

export default function Magaza({ yol, nav }: { yol: string; nav: Nav }) {
  const [kat, setKat] = useState<Katalog | null>(null)
  const [hata, setHata] = useState(false)
  const sira = useRef(0)
  // Katalog sayfa açıkken bir kez alınır; sipariş verilince ve stok/kapanış hatasında (409) yenilenir
  const yukle = useCallback(() => {
    const bu = ++sira.current
    setHata(false)
    katalogAl().then(({ acik, teslimNotu, whatsapp, urunler }) => { if (bu === sira.current) setKat({ acik, teslimNotu, whatsapp, urunler }) },
      () => { if (bu === sira.current) setHata(true) })
  }, [])
  useEffect(yukle, [yukle])

  const [ana, ...kalan] = yol.split('/')
  const arg = kalan.join('/')
  if (ana === 'siparis' && arg) return <SiparisOnay key={arg} no={arg} nav={nav} />
  if (ana === 'takip') return <SiparisTakip nav={nav} />

  if (!kat) return hata ? (
    <div className="max-w-md py-6">
      <h1 className="font-display text-[30px] leading-none">Mağaza</h1>
      <p role="alert" className="mt-3 font-semibold">Mağaza şu an yüklenemedi.</p>
      <button type="button" onClick={yukle} className={cn(BIRINCIL, 'mt-4')}><RefreshCw className="w-4 h-4" aria-hidden /> Tekrar dene</button>
    </div>
  ) : <Iskelet />

  if (ana === 'urun' && arg) {
    const u = kat.urunler.find(x => x.id === arg)
    return u ? <UrunSayfa key={u.id} u={u} acik={kat.acik} nav={nav} /> : (
      <div className="max-w-md py-6">
        <h1 className="font-display text-[30px] leading-none">Ürün bulunamadı</h1>
        <MagazaLink yol="" nav={nav} className={cn(IKINCIL, 'mt-4')}><ChevronLeft className="w-5 h-5" aria-hidden /> Mağazaya dön</MagazaLink>
      </div>
    )
  }
  if (ana === 'sepet') return <SepetSayfa kat={kat} nav={nav} yenile={yukle} />
  return <Liste kat={kat} nav={nav} />
}
