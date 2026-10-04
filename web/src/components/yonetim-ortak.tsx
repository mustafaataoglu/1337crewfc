import { useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DURUM_ETIKET, type Ayarlar, type Durum, type SiparisTam, type UrunTam } from '@/lib/magaza'

// Mağaza yönetiminin ekranları arasında paylaşılan veri ve küçük parçalar

export interface Veri { siparisler: SiparisTam[]; urunler: UrunTam[]; ayarlar: Ayarlar }

export interface Bag {
  veri: Veri
  /** Sunucu yanıtını yerel veriye işler; o sırada yolda olan eski yoklama yanıtı yazılmaz */
  degistir: (f: (v: Veri) => Veri) => void
  /** Hatanın kullanıcıya gösterilecek metni; 401 ise oturumu kapatır */
  hataMesaji: (e: unknown) => string
  /** Yönetim içinde başka ekrana geç */
  git: (yol: string) => void
  /** Mağaza (taraftar) tarafına geç */
  magaza: (yol: string) => void
  /** Kaydedilmemiş form var mı: başka ekrana geçerken sorulur */
  kirliAyarla: (k: boolean) => void
}

const ROZET: Record<Durum, string> = {
  yeni: 'bg-club text-clubink border-club',
  gorusuldu: 'border-foreground',
  hazir: 'bg-win/15 text-win border-transparent',
  teslim: 'bg-muted text-muted-foreground border-transparent',
  iptal: 'bg-loss/15 text-loss border-transparent',
}
export function DurumRozet({ d, className }: { d: Durum; className?: string }) {
  return (
    <span className={cn('inline-block whitespace-nowrap border-[1.5px] font-data font-bold text-[13px] uppercase tracking-wide leading-5 px-2 rounded-md', ROZET[d], className)}>
      {DURUM_ETIKET[d]}
    </span>
  )
}

/** Beyaz kart içinde başlıklı bölüm */
export function Bolum({ baslik, sag, children, className }: { baslik: string; sag?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 sm:p-5 flex flex-col gap-3.5', className)}>
      <div className="flex items-center justify-between gap-2 min-h-6">
        <h3 className="font-data font-bold text-[17px] uppercase tracking-wider leading-none">{baslik}</h3>
        {sag}
      </div>
      {children}
    </section>
  )
}

const bugunIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
function indir(b: Blob, ad: string) {
  const u = URL.createObjectURL(b)
  const a = document.createElement('a')
  a.href = u; a.download = ad
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(u), 10000)
}

/** CSV indirme düğmesi; dosya adına bugünün tarihi eklenir (1337-siparisler-2026-10-04.csv) */
export function IndirDugmesi({ al, dosya, hataMesaji, className, kutu, children }: {
  al: () => Promise<Blob> | Blob; dosya: string; hataMesaji: (e: unknown) => string; className?: string; kutu?: string; children: ReactNode
}) {
  const [mesgul, setMesgul] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const tikla = async () => {
    if (mesgul) return
    setMesgul(true); setHata(null)
    try { indir(await al(), `${dosya}-${bugunIst()}.csv`) } catch (e) { setHata(hataMesaji(e)) } finally { setMesgul(false) }
  }
  // Hazırlanırken disabled yerine aria-disabled: klavye odağı düğmede kalır
  return (
    <span className={cn('inline-flex flex-col items-stretch gap-1', kutu)}>
      <button type="button" onClick={tikla} aria-disabled={mesgul || undefined}
        className={cn('h-11 px-3.5 rounded-lg border bg-card font-semibold text-[14px] flex items-center justify-center gap-2 aria-disabled:opacity-60 whitespace-nowrap', className)}>
        <Download className="w-[18px] h-[18px] shrink-0" aria-hidden />{mesgul ? 'Hazırlanıyor…' : children}
      </button>
      {hata && <span role="alert" className="text-[13px] text-loss font-semibold">{hata}</span>}
    </span>
  )
}
