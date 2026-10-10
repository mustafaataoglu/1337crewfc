import { cn } from '@/lib/utils'
import { resimUrl, type Urun } from '@/lib/magaza'

// Fotoğrafı olmayan ürünler için çizim: kategoriye göre forma ya da kapüşonlu.
// Formalar kulübün yeşil iç saha / açık deplasman renklerinde, kapüşonlu siyah.

function FormaCizim({ acik }: { acik: boolean }) {
  const govde = acik ? '#f5f2e6' : '#307860'
  const yazi = acik ? '#307860' : '#f2c200'
  return (
    <svg viewBox="0 0 120 120" className="w-[70%] h-[70%]" aria-hidden>
      <path d="M40 14 L22 22 L8 44 L22 54 L30 46 L30 106 L90 106 L90 46 L98 54 L112 44 L98 22 L80 14 C76 22 68 26 60 26 C52 26 44 22 40 14 Z" fill={govde} stroke="#15140f" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M40 14 C44 22 52 26 60 26 C68 26 76 22 80 14" fill="none" stroke={acik ? '#307860' : '#f2c200'} strokeWidth="5" />
      <text x="60" y="80" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize="24" fill={yazi}>1337</text>
    </svg>
  )
}

function KapusonluCizim() {
  return (
    <svg viewBox="0 0 120 120" className="w-[70%] h-[70%]" aria-hidden>
      <path d="M38 22 L20 30 L8 78 L20 82 L30 52 L30 108 L90 108 L90 52 L100 82 L112 78 L100 30 L82 22 Z" fill="#1f1e19" stroke="#15140f" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M40 26 C38 6 82 6 80 26 C72 34 48 34 40 26 Z" fill="#1f1e19" stroke="#15140f" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M48 24 C52 32 68 32 72 24" fill="none" stroke="#5b5951" strokeWidth="2" />
      <path d="M55 30 L54 46 M65 30 L66 46" stroke="#f5f2e6" strokeWidth="2" strokeLinecap="round" />
      <path d="M42 82 L78 82 L84 104 L36 104 Z" fill="none" stroke="#5b5951" strokeWidth="2" strokeLinejoin="round" />
      <text x="60" y="70" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize="18" fill="#f2c200">1337</text>
    </svg>
  )
}

/**
 * Ürünün kapak görseli; fotoğraf yoksa çizim. Kapsayıcının boyutunu doldurur (boyutu dışarıdan ver).
 * tam: fotoğraf kırpılmadan bütünüyle gösterilir (ürün sayfası galerisi); yoksa kutuyu doldurur (kartlar).
 */
export function UrunGorsel({ u, i = 0, className, tam = false }: { u: Pick<Urun, 'ad' | 'kategori' | 'resimler'>; i?: number; className?: string; tam?: boolean }) {
  const id = u.resimler[i]
  const kapusonlu = /hoodie|kap[uü]ş?on|sweat/i.test(`${u.kategori} ${u.ad}`)
  const acik = /deplasman|dış saha|beyaz/i.test(u.ad)
  return (
    // Siyah kapüşonlu çizimi koyu temada da açık zemin üstünde (açık temanın --muted rengi)
    <div className={cn('relative overflow-hidden grid place-items-center', !id ? (kapusonlu ? 'bg-[hsl(48_14%_89%)]' : acik ? 'bg-muted' : 'bg-club') : tam && 'bg-muted', className)}>
      {id
        ? <img src={resimUrl(id)} alt={u.ad} loading="lazy" className={cn('absolute inset-0 w-full h-full', tam ? 'object-contain' : 'object-cover')} />
        : kapusonlu ? <KapusonluCizim /> : <FormaCizim acik={acik} />}
    </div>
  )
}
