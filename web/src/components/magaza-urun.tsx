import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { Nav } from '@/App'
import { cn } from '@/lib/utils'
import { UrunGorsel } from '@/components/magaza-gorsel'
import { AdetSecici, BIRINCIL, ETIKET, GeriLink, GIRDI, MagazaLink, Rozet } from '@/components/magaza-ortak'
import { kapaliNeden, urunEtiketi } from '@/components/magaza-yardim'
import { baskiIsim, baskiNumara, birimFiyat, fiyatYazi, gunYazi, sepeteEkle, useSepet, type Urun } from '@/lib/magaza'

/** Birden çok fotoğraf: yana kaydırmalı, altta noktalar */
function Galeri({ u }: { u: Urun }) {
  const kutu = useRef<HTMLDivElement>(null)
  const [sira, setSira] = useState(0)
  if (u.resimler.length <= 1) return <UrunGorsel u={u} className="aspect-square rounded-xl md:sticky md:top-20" />
  const git = (i: number) => kutu.current?.scrollTo({ left: i * kutu.current.clientWidth, behavior: 'smooth' })
  return (
    <div className="min-w-0 md:sticky md:top-20">
      <div ref={kutu} onScroll={e => setSira(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className="flex overflow-x-auto snap-x snap-mandatory rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {u.resimler.map((id, i) => <UrunGorsel key={`${i}-${id}`} u={u} i={i} className="w-full shrink-0 snap-center aspect-square" />)}
      </div>
      <div className="flex justify-center">
        {u.resimler.map((id, i) => (
          <button key={`${i}-${id}`} type="button" onClick={() => git(i)} aria-label={`Fotoğraf ${i + 1}`} aria-current={i === sira ? 'true' : undefined} className="h-11 w-7 grid place-items-center">
            <span className={cn('w-2 h-2 rounded-full', i === sira ? 'bg-foreground' : 'bg-muted-foreground opacity-40')} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** Ürün sayfası: beden, isteğe bağlı isim/numara baskısı, adet, sepete ekle */
export function UrunSayfa({ u, acik, nav }: { u: Urun; acik: boolean; nav: Nav }) {
  const sepet = useSepet()
  const [beden, setBeden] = useState<string | null>(() => (u.bedenler.length === 1 ? u.bedenler[0].ad : null))
  const [baskiAcik, setBaskiAcik] = useState(false)
  const [isim, setIsim] = useState('')
  const [numara, setNumara] = useState('')
  const [adet, setAdet] = useState(1)
  const [eklendi, setEklendi] = useState(false)
  // Herhangi bir seçim değişince "Sepete eklendi" kalkar
  const degis = <T,>(f: (v: T) => void) => (v: T) => { f(v); setEklendi(false) }
  // "Sepete ekle" düğmesi eklenince kalkar; odak "Sepete git"e geçer
  const sepeteGit = useRef<HTMLAnchorElement>(null)
  useEffect(() => { if (eklendi) sepeteGit.current?.focus({ preventScroll: true }) }, [eklendi])

  const stoklu = u.satis === 'stok'
  const b = u.bedenler.find(x => x.ad === beden)
  const baski = baskiAcik && u.baski ? { isim: isim.trim(), numara } : undefined
  // Aynı ürün ve beden sepette varsa stoktan düşülür; aynı kalem sepette en fazla 10 adet olabilir
  const sepette = sepet.filter(k => k.urun === u.id && k.beden === beden).reduce((t, k) => t + k.adet, 0)
  const ayniKalem = sepet.find(k => k.urun === u.id && k.beden === beden && (k.baski?.isim ?? '') === (baski?.isim ?? '') && (k.baski?.numara ?? '') === (baski?.numara ?? ''))?.adet ?? 0
  const stokKalan = stoklu && b ? Math.max(0, (b.stok ?? 0) - sepette) : 10
  const enFazla = Math.max(1, Math.min(10, stokKalan, 10 - ayniKalem))
  const adetG = Math.min(adet, enFazla)
  const neden = kapaliNeden(u, acik)
  const eksik = !b ? 'Önce beden seç'
    : stoklu && (b.stok ?? 0) <= 0 ? 'Bu beden tükendi'
    : stokKalan <= 0 ? 'Bu bedenden kalanların hepsi sepetinde'
    : ayniKalem >= 10 ? 'Sepetinde bundan zaten 10 adet var'
    : baski && (!baski.isim || !baski.numara) ? 'İsim ve numarayı yaz' : null
  const tutar = birimFiyat(u, { baski }) * adetG

  const ekle = () => {
    if (neden || eksik || !b) return
    sepeteEkle({ urun: u.id, beden: b.ad, adet: adetG, ...(baski ? { baski } : {}) })
    setAdet(1)
    setEklendi(true)
  }

  return (
    <div>
      <GeriLink nav={nav} />
      <div className="grid md:grid-cols-2 gap-5 md:gap-8 items-start">
        <Galeri u={u} />
        <div className="min-w-0 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Rozet r={urunEtiketi(u, acik)} />
            <h1 className="font-display text-[30px] sm:text-[36px] leading-[1.05] break-words">{u.ad}</h1>
            <p className="font-data font-bold text-[22px] num">{fiyatYazi(u.fiyat)}</p>
            {u.aciklama && <p className="text-[15px] text-muted-foreground whitespace-pre-line break-words">{u.aciklama}</p>}
            {u.satis === 'onsiparis' && (u.onSiparisBitis || u.teslimTahmini) && (
              <dl className="text-[14px] mt-1 flex flex-col gap-0.5">
                {u.onSiparisBitis && <div><dt className="inline font-semibold">Son sipariş günü:</dt> <dd className="inline">{gunYazi(u.onSiparisBitis)}</dd></div>}
                {u.teslimTahmini && <div><dt className="inline font-semibold">Tahmini teslim:</dt> <dd className="inline">{u.teslimTahmini}</dd></div>}
              </dl>
            )}
          </div>

          <fieldset className="min-w-0">
            <legend className="font-data font-bold uppercase tracking-wider text-[14px] mb-2">Beden</legend>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-2">
              {u.bedenler.map(x => {
                const yok = stoklu && (x.stok ?? 0) <= 0
                const secili = x.ad === beden
                return (
                  <button key={x.ad} type="button" onClick={() => degis(setBeden)(x.ad)} disabled={yok} aria-pressed={secili} aria-label={yok ? `${x.ad}, tükendi` : undefined}
                    className={cn('min-h-12 px-1 rounded-lg border-[1.5px] font-data font-bold text-[17px] leading-tight break-words transition-colors',
                      secili ? 'bg-clubink text-club border-clubink ring-1 ring-inset ring-club/60' : 'bg-card hover:border-foreground',
                      yok && 'opacity-45 line-through cursor-not-allowed hover:border-border')}>
                    {x.ad}
                  </button>
                )
              })}
            </div>
            {b && stoklu && (b.stok ?? 0) > 0 && (b.stok ?? 0) <= 3 && <p className="text-[13px] font-semibold text-loss mt-2 num">{b.ad} bedeninde son {b.stok} ürün</p>}
          </fieldset>

          {u.baski && (
            <div className="rounded-xl border bg-card p-3">
              <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                <input type="checkbox" checked={baskiAcik} onChange={e => degis(setBaskiAcik)(e.target.checked)} className="w-5 h-5 shrink-0 accent-[hsl(var(--foreground))]" />
                <span className="flex-1 font-semibold text-[15px]">
                  Arkasına isim ve numara <span className="font-data font-semibold text-muted-foreground num">({u.baskiUcret > 0 ? `+${fiyatYazi(u.baskiUcret)}` : 'ücretsiz'})</span>
                </span>
              </label>
              {baskiAcik && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="col-span-2">
                    <label htmlFor="baski-isim" className={ETIKET}>İsim (en fazla 12 harf)</label>
                    <input id="baski-isim" value={isim} onChange={e => degis(setIsim)(baskiIsim(e.target.value))} placeholder="CREW"
                      autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} className={cn(GIRDI, 'font-data font-bold text-[18px]')} />
                  </div>
                  <div>
                    <label htmlFor="baski-numara" className={ETIKET}>Numara</label>
                    <input id="baski-numara" value={numara} onChange={e => degis(setNumara)(baskiNumara(e.target.value))} placeholder="21"
                      inputMode="numeric" autoComplete="off" className={cn(GIRDI, 'font-data font-bold text-[18px] num')} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="font-data font-bold uppercase tracking-wider text-[14px]">Adet</span>
            <AdetSecici deger={adetG} set={degis((n: number) => setAdet(Math.max(1, Math.min(enFazla, n))))} enFazla={enFazla} etiket="Adet" />
          </div>

          {/* Ekran okuyucu için hep yerinde duran duyuru alanı */}
          <p role="status" className="sr-only">{eklendi ? 'Sepete eklendi' : ''}</p>
          {/* Telefonda alt menünün üstünde sabit, geniş ekranda sütunun sonunda (data-alt-cubuk: altbilgi altında yer açılır) */}
          <div data-alt-cubuk className="fixed inset-x-0 z-20 px-4 bottom-[calc(56px+env(safe-area-inset-bottom))] md:static md:px-0">
            <div className="max-w-6xl mx-auto rounded-xl border bg-card shadow-lg shadow-black/15 md:shadow-none p-3 flex items-center gap-3">
              {eklendi ? (
                <>
                  <p className="flex-1 min-w-0 flex items-center gap-2 font-semibold text-win"><Check className="w-5 h-5 shrink-0" aria-hidden /> Sepete eklendi</p>
                  <MagazaLink ref={sepeteGit} yol="sepet" nav={nav} className={cn(BIRINCIL, 'shrink-0')}>Sepete git</MagazaLink>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-[13px] leading-snug', neden || eksik ? 'font-semibold' : 'text-muted-foreground')}>{neden ?? eksik ?? `Beden ${b?.ad} · ${adetG} adet`}</p>
                    <p className="font-data font-bold text-[20px] leading-tight num">{fiyatYazi(tutar)}</p>
                  </div>
                  <button type="button" onClick={ekle} disabled={!!neden || !!eksik} className={cn(BIRINCIL, 'shrink-0')}>Sepete ekle</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
