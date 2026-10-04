import type { MouseEvent, ReactNode, Ref } from 'react'
import { ChevronLeft, Minus, Plus } from 'lucide-react'
import type { Nav } from '@/App'
import { cn } from '@/lib/utils'
import type { Ton } from '@/lib/magaza'

// Mağaza ekranlarının ortak parçaları: bağlantı, rozet, adet seçici, düğme biçimleri

export const BIRINCIL = 'h-12 px-5 rounded-lg bg-clubink text-club ring-1 ring-inset ring-white/15 font-data font-bold uppercase tracking-wider text-[16px] inline-flex items-center justify-center gap-2 disabled:bg-muted disabled:text-muted-foreground disabled:ring-0 disabled:cursor-not-allowed'
export const IKINCIL = 'h-12 px-5 rounded-lg border-[1.5px] border-foreground bg-card font-data font-bold uppercase tracking-wider text-[16px] inline-flex items-center justify-center gap-2'
export const GIRDI = 'w-full h-12 px-3 rounded-lg border bg-card text-[16px] placeholder:text-muted-foreground aria-[invalid=true]:border-loss'
export const ETIKET = 'block text-[13px] font-semibold text-muted-foreground mb-1'
/** Üstünde beyaz yazı/ikon olan dolgular: koyu temada da açılmaz (yeşil 5.3:1, kırmızı 6:1) */
export const YESIL_DOLGU = 'bg-[rgb(29_122_69)] text-white'
export const KIRMIZI_DOLGU = 'bg-[rgb(179_54_43)] text-white'

/** Mağaza içi bağlantı: gerçek adres (#magaza/...), tıklanınca sayfa yenilenmeden açılır; yeni sekmede de açılabilir */
export function MagazaLink({ yol, nav, className, children, label, sayfa = 'magaza', ref }: {
  yol: string; nav: Nav; className?: string; children: ReactNode; label?: string; sayfa?: 'magaza' | 'yonetim'; ref?: Ref<HTMLAnchorElement>
}) {
  const tikla = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    nav.go({ page: sayfa, yol })
  }
  return <a ref={ref} href={`#${sayfa}${yol ? '/' + yol : ''}`} onClick={tikla} aria-label={label} className={className}>{children}</a>
}

/** Ekranın üstündeki "‹ Mağaza" dönüş bağlantısı */
export function GeriLink({ nav }: { nav: Nav }) {
  return (
    <MagazaLink yol="" nav={nav} className="inline-flex items-center gap-1 h-11 -ml-2 pl-1 pr-2 mb-1 rounded-md font-data font-bold uppercase tracking-wider text-[14px] text-muted-foreground hover:text-foreground">
      <ChevronLeft className="w-5 h-5" /> Mağaza
    </MagazaLink>
  )
}

const TON: Record<Ton, string> = { iyi: 'bg-win/15 text-win', az: 'bg-loss/15 text-loss', yok: 'bg-muted text-muted-foreground', on: 'bg-clubink text-club' }
const TON_KOYU: Record<Ton, string> = { iyi: YESIL_DOLGU, az: KIRMIZI_DOLGU, yok: 'bg-white/15 text-[#f5f2e6]', on: 'bg-club text-clubink' }
/** Stok / ön sipariş rozeti; koyu: siyah kart üstünde */
export function Rozet({ r, koyu, className }: { r: { metin: string; ton: Ton }; koyu?: boolean; className?: string }) {
  return <span className={cn('inline-block w-fit font-data font-bold uppercase tracking-[0.06em] text-[12px] leading-[18px] px-2 py-0.5 rounded-md', (koyu ? TON_KOYU : TON)[r.ton], className)}>{r.metin}</span>
}

/** − adet + (en az 1) */
export function AdetSecici({ deger, set, enFazla, etiket }: { deger: number; set: (n: number) => void; enFazla: number; etiket: string }) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-card shrink-0" role="group" aria-label={etiket}>
      <button type="button" onClick={() => set(deger - 1)} disabled={deger <= 1} aria-label={`${etiket}: azalt`} className="w-11 h-11 grid place-items-center rounded-l-lg disabled:opacity-35"><Minus className="w-4 h-4" /></button>
      <span className="min-w-[28px] text-center font-data font-bold text-[18px] num" aria-live="polite">{deger}</span>
      <button type="button" onClick={() => set(deger + 1)} disabled={deger >= enFazla} aria-label={`${etiket}: artır`} className="w-11 h-11 grid place-items-center rounded-r-lg disabled:opacity-35"><Plus className="w-4 h-4" /></button>
    </div>
  )
}
