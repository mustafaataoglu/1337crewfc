import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trBuyuk, type SiparisTam, type UrunTam } from '@/lib/magaza'
import { IndirDugmesi, type Bag } from '@/components/yonetim-ortak'

// Üretim listesi: bir ürünün iptal edilmemiş siparişlerinden beden beden adet ve baskı (isim, numara) listesi.
// Aynı hesap ürün düzenleme ekranının yanında da gösterilir.

interface Uretim { bedenler: { ad: string; n: number }[]; toplam: number; baskilar: { isim: string; numara: string; beden: string; no: string }[] }

const STANDART = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', 'XXXL', '4XL', '5XL']
function hesapla(siparisler: SiparisTam[], urunId: string, urun: UrunTam | undefined, teslimDahil: boolean): Uretim {
  const sira = urun?.bedenler.map(b => b.ad) ?? []
  const yer = (x: string) => { const k = sira.indexOf(x); if (k >= 0) return k; const s = STANDART.indexOf(trBuyuk(x)); return s >= 0 ? 100 + s : 1000 }
  const karsilastir = (a: string, b: string) => yer(a) - yer(b) || a.localeCompare(b, 'tr')
  const adet = new Map<string, number>(sira.map(b => [b, 0]))
  const baskilar: Uretim['baskilar'] = []
  for (const s of siparisler) {
    if (s.durum === 'iptal' || (!teslimDahil && s.durum === 'teslim')) continue
    for (const k of s.kalemler) {
      if (k.urun !== urunId) continue
      adet.set(k.beden, (adet.get(k.beden) ?? 0) + k.adet)
      // Her forma ayrı satır: aynı baskıdan 2 adet istendiyse iki kez yazılır
      if (k.baski) for (let i = 0; i < k.adet; i++) baskilar.push({ isim: k.baski.isim, numara: k.baski.numara, beden: k.beden, no: s.no })
    }
  }
  baskilar.sort((a, b) => karsilastir(a.beden, b.beden) || a.isim.localeCompare(b.isim, 'tr', { numeric: true }) || +a.numara - +b.numara || a.no.localeCompare(b.no))
  const bedenler = [...adet].map(([ad, n]) => ({ ad, n })).sort((a, b) => karsilastir(a.ad, b.ad))
  return { bedenler, toplam: bedenler.reduce((t, b) => t + b.n, 0), baskilar }
}

// Excel'de açılır: UTF-8 BOM, noktalı virgül, CRLF; her hücre tırnaklı ve formül gibi başlayan hücreler etkisiz
const hucre = (v: string | number) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"` }
const satir = (a: (string | number)[]) => a.map(hucre).join(';')
// Yalnız rakamdan oluşan isim/numara ("07", "007") Excel'de sayıya dönüp baştaki sıfırı kaybetmesin: ="07" metin olarak açılır
const metin = (s: string) => (/^\d+$/.test(s) ? `"=""${s}"""` : hucre(s))
function csv(ad: string, u: Uretim, teslimDahil: boolean) {
  const s = [
    satir(['Ürün', ad]),
    satir(['Kapsam', teslimDahil ? 'İptaller hariç, teslim edilenler dahil' : 'İptaller ve teslim edilenler hariç']),
    '',
    satir(['Beden', 'Adet']),
    ...u.bedenler.map(b => satir([b.ad, b.n])),
    satir(['Toplam', u.toplam]),
    '',
    satir(['İsim', 'Numara', 'Beden', 'Sipariş no']),
    ...u.baskilar.map(b => [metin(b.isim), metin(b.numara), hucre(b.beden), hucre(b.no)].join(';')),
  ]
  return new Blob(['﻿' + s.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
}
const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }
const dosyaAdi = (ad: string) => '1337-uretim-' + (ad.toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, h => TR[h]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'urun')

/** Ürün seçenekleri: iptal edilmemiş siparişi olan ürünler (silinmiş ürünler siparişteki adıyla) */
function urunSecenekleri(siparisler: SiparisTam[], urunler: UrunTam[]) {
  const m = new Map<string, string>()
  for (const s of siparisler) if (s.durum !== 'iptal') for (const k of s.kalemler) if (!m.has(k.urun)) m.set(k.urun, k.ad)
  const yer = (id: string) => { const i = urunler.findIndex(u => u.id === id); return i < 0 ? 1e6 : i }
  return [...m].sort((a, b) => yer(a[0]) - yer(b[0])).map(([id, ad]) => ({ id, ad: urunler.find(u => u.id === id)?.ad ?? `${ad} (silinmiş)` }))
}

function Ozet({ u, ad, koyu, tarih, teslimDahil }: { u: Uretim; ad: string; koyu?: boolean; tarih?: boolean; teslimDahil: boolean }) {
  const enCok = Math.max(0, ...u.bedenler.map(b => b.n))
  const soluk = koyu ? 'text-[#f5f2e6]/75 print:text-black' : 'text-muted-foreground'
  return (
    <div className="flex flex-col gap-4">
      {tarih && (
        <div className="hidden print:block">
          <div className="font-display text-[22px] leading-tight">1337 Crew FC · Üretim listesi</div>
          <div className="text-[13px]">{new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Istanbul' })}</div>
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        <span className={cn('font-data font-bold text-[13px] uppercase tracking-wider', koyu ? 'text-club print:text-black' : 'text-muted-foreground')}>{koyu ? 'Üretim listesi' : ad}</span>
        <span className="font-display text-[40px] leading-[1.05] num">{u.toplam} adet</span>
        <span className={cn('text-[14px]', soluk)}>
          {teslimDahil ? 'İptaller hariç' : 'İptaller ve teslim edilenler hariç'} · {u.baskilar.length ? `${u.baskilar.length} tanesi baskılı` : 'baskı yok'}
        </span>
      </div>

      {u.bedenler.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5 text-center" aria-label="Beden adetleri">
          {u.bedenler.map(b => (
            <li key={b.ad} className={cn('rounded-lg py-2 px-1 flex flex-col min-w-0 print:border print:border-black/30',
              b.n === enCok && b.n > 0 ? 'bg-club text-clubink' : koyu ? 'bg-white/10' : 'bg-muted')}>
              <span className="font-data font-semibold text-[13px] truncate">{b.ad}</span>
              <span className="font-display text-[24px] leading-tight num">{b.n}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <h4 className={cn('font-data font-bold text-[13px] uppercase tracking-wider', soluk)}>Baskılar</h4>
        {u.baskilar.length === 0 ? <p className={cn('text-[14px]', soluk)}>Baskılı sipariş yok.</p> : (
          <div className={cn(koyu && 'max-h-72 overflow-y-auto print:max-h-none print:overflow-visible')}>
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className={cn('text-left font-data font-bold text-[12px] uppercase tracking-wider', soluk)}>
                  <th scope="col" className="py-1 pr-2">İsim</th>
                  <th scope="col" className="py-1 pr-2">Numara</th>
                  <th scope="col" className="py-1 pr-2">Beden</th>
                  <th scope="col" className="py-1">Sipariş no</th>
                </tr>
              </thead>
              <tbody>
                {u.baskilar.map((b, i) => (
                  <tr key={i} className={cn('border-t', koyu && 'border-white/15 print:border-black/20')}>
                    <td className="py-1.5 pr-2 font-semibold break-all">{b.isim}</td>
                    <td className="py-1.5 pr-2 font-data font-bold text-[15px] num">{b.numara}</td>
                    <td className="py-1.5 pr-2 font-data font-bold text-[15px]">{b.beden}</td>
                    <td className={cn('py-1.5 num whitespace-nowrap', soluk)}>{b.no}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Ürün düzenleme ekranının yanındaki koyu özet */
export function UretimOzeti({ bag, urunId }: { bag: Bag; urunId: string }) {
  const urun = bag.veri.urunler.find(u => u.id === urunId)
  const u = useMemo(() => hesapla(bag.veri.siparisler, urunId, urun, true), [bag.veri.siparisler, urunId, urun])
  const ad = urun?.ad ?? ''
  const siparisVar = u.toplam > 0
  return (
    <section aria-label="Üretim listesi" className="rounded-xl bg-clubink text-[#f5f2e6] p-4 sm:p-5 flex flex-col gap-4 print:bg-transparent print:text-black print:p-0">
      <div className="hidden print:block">
        <div className="font-display text-[22px] leading-tight">1337 Crew FC · {ad}</div>
        <div className="text-[13px]">{new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Istanbul' })}</div>
      </div>
      {siparisVar ? <Ozet u={u} ad={ad} koyu teslimDahil /> : (
        <div className="flex flex-col gap-1">
          <span className="font-data font-bold text-[13px] uppercase tracking-wider text-club">Üretim listesi</span>
          <p className="text-[14px] text-[#f5f2e6]/75">Bu ürün için henüz sipariş yok.</p>
        </div>
      )}
      {siparisVar && (
        <div className="flex gap-2 flex-wrap print:hidden">
          <IndirDugmesi al={() => csv(ad, u, true)} dosya={dosyaAdi(ad)} hataMesaji={bag.hataMesaji} kutu="flex-1 basis-[120px]"
            className="bg-club text-clubink border-club font-data font-bold uppercase tracking-wider text-[15px]">Excel'e aktar</IndirDugmesi>
          <button type="button" onClick={() => window.print()}
            className="flex-1 basis-[120px] h-11 rounded-lg border border-[#f5f2e6]/40 font-data font-bold uppercase tracking-wider text-[15px] flex items-center justify-center gap-2">
            <Printer className="w-[18px] h-[18px]" aria-hidden /> Yazdır
          </button>
        </div>
      )}
    </section>
  )
}

/** Üretim listesi sekmesi */
export function UretimListesi({ bag, secim, setSecim }: { bag: Bag; secim: string | null; setSecim: (id: string) => void }) {
  const { siparisler, urunler } = bag.veri
  const [teslimDahil, setTeslimDahil] = useState(true)
  const secenekler = useMemo(() => urunSecenekleri(siparisler, urunler), [siparisler, urunler])
  const secili = secenekler.find(x => x.id === secim) ?? secenekler[0]
  const urun = secili ? urunler.find(x => x.id === secili.id) : undefined
  const u = useMemo(() => (secili ? hesapla(siparisler, secili.id, urun, teslimDahil) : null), [siparisler, secili, urun, teslimDahil])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
        <h2 className="font-display text-[28px] sm:text-[34px] leading-none">Üretim listesi</h2>
        {secili && u && (
          <div className="flex gap-2">
            <IndirDugmesi al={() => csv(secili.ad, u, teslimDahil)} dosya={dosyaAdi(secili.ad)} hataMesaji={bag.hataMesaji}>Excel'e aktar</IndirDugmesi>
            <button type="button" onClick={() => window.print()} className="h-11 px-3.5 rounded-lg border bg-card font-semibold text-[14px] flex items-center gap-2">
              <Printer className="w-[18px] h-[18px]" aria-hidden /> Yazdır
            </button>
          </div>
        )}
      </div>

      {!secili || !u ? (
        <p className="rounded-xl border bg-card p-5 text-muted-foreground">Henüz sipariş yok.</p>
      ) : (
        <>
          <div className="rounded-xl border bg-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-end gap-3 print:hidden">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label htmlFor="uretim-urun" className="text-[13px] font-semibold text-muted-foreground">Ürün</label>
              <select id="uretim-urun" value={secili.id} onChange={e => setSecim(e.target.value)} className="h-11 w-full px-2 rounded-lg border bg-background text-[16px] font-semibold">
                {secenekler.map(x => <option key={x.id} value={x.id}>{x.ad}</option>)}
              </select>
            </div>
            <label htmlFor="uretim-teslim" className="flex items-center gap-3 min-h-11 font-semibold text-[15px] shrink-0">
              <input id="uretim-teslim" type="checkbox" checked={teslimDahil} onChange={e => setTeslimDahil(e.target.checked)} className="w-[22px] h-[22px] accent-[hsl(var(--foreground))]" />
              Teslim edilenleri de say
            </label>
          </div>
          <section aria-label={`${secili.ad} üretim listesi`} className="rounded-xl border bg-card p-4 sm:p-5 print:border-0 print:p-0">
            <Ozet u={u} ad={secili.ad} tarih teslimDahil={teslimDahil} />
          </section>
        </>
      )}
    </div>
  )
}
