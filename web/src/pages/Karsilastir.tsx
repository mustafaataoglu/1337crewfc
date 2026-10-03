import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Nav } from '@/App'
import type { Player } from '@/types'
import { data, played, POS_LABEL } from '@/lib/site'
import { Avatar, SectionTitle } from '@/components/bits'
import { cn } from '@/lib/utils'

// Oyuncu listesi: güncel kadro önce, sonra eski oyuncular; her grupta en çok maça çıkan önce
const LISTE = [...data.players].sort((a, b) => Number(!!a.former) - Number(!!b.former) || b.career.m - a.career.m)
const oran = (a: number, b: number) => (b ? (a / b).toFixed(2).replace('.', ',') : '–')

export default function Karsilastir({ a, b, nav }: { a?: string; b?: string; nav: Nav }) {
  const pa = data.players.find(p => p.slug === a) ?? LISTE[0]
  const pb = data.players.find(p => p.slug === b && p.slug !== pa.slug) ?? LISTE.find(p => p.slug !== pa.slug)!
  const sec = (x: string, y: string) => nav.go({ page: 'karsilastir', a: x, b: y })

  // Birlikte: ikisinin de kadroda (ilk 11 ya da yedek) olduğu maçlar
  const birlikte = useMemo(() => {
    const ic = (m: (typeof played)[number], s: string) => !!m.lineup && (m.lineup.xi.includes(s) || m.lineup.subs.includes(s))
    const ms = played.filter(m => ic(m, pa.slug) && ic(m, pb.slug))
    const gol = (s: string) => ms.reduce((t, m) => t + (m.scorers?.find(x => x.slug === s)?.n ?? 0), 0)
    return { n: ms.length, g: ms.filter(m => m.result === 'G').length, b: ms.filter(m => m.result === 'B').length, m: ms.filter(m => m.result === 'M').length, golA: gol(pa.slug), golB: gol(pb.slug) }
  }, [pa.slug, pb.slug])

  const satirlar: [string, (p: Player) => number | string, boolean][] = [
    ['Maç', p => p.career.m, true], ['Gol', p => p.career.g, true], ['Asist', p => p.career.a, true], ['MVP', p => p.career.mvp ?? 0, true],
    ['Gol / maç', p => oran(p.career.g, p.career.m), true], ['Asist / maç', p => oran(p.career.a, p.career.m), true],
    ['Bu sezon maç', p => p.current.m, true], ['Bu sezon gol', p => p.current.g, true], ['Bu sezon asist', p => p.current.a, true],
    ['Sezon', p => p.seasons ?? p.bySeason.length, true], ['İlk sezon', p => p.firstYear ?? '–', false],
  ]
  const sayi = (v: number | string) => (typeof v === 'number' ? v : Number(String(v).replace(',', '.')) || 0)

  return (
    <div className="max-w-3xl">
      <button onClick={() => nav.go({ page: 'istatistik' })} className="flex items-center gap-1 text-[14px] font-semibold mb-3"><ArrowLeft className="w-4 h-4" /> İstatistik</button>
      <SectionTitle>Oyuncu karşılaştır</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {[pa, pb].map((p, i) => (
          <div key={i} className="rounded-xl border bg-card p-3 flex flex-col items-center gap-2 text-center min-w-0">
            <Avatar p={p} size={64} />
            <label htmlFor={`oy-${i}`} className="sr-only">{i ? 'İkinci oyuncu' : 'Birinci oyuncu'}</label>
            <select id={`oy-${i}`} value={p.slug} onChange={e => (i ? sec(pa.slug, e.target.value) : sec(e.target.value, pb.slug))}
              className="w-full h-10 px-2 rounded-lg border bg-background text-[14px] font-semibold">
              {LISTE.filter(x => x.slug !== (i ? pa.slug : pb.slug)).map(x => <option key={x.slug} value={x.slug}>{x.name}{x.former ? ' (eski)' : ''}</option>)}
            </select>
            <span className="text-[13px] text-muted-foreground">{POS_LABEL[p.pos]}{p.no ? ` · #${p.no}` : ''}</span>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card mt-4 divide-y">
        {satirlar.map(([ad, f, buyukIyi]) => {
          const va = f(pa), vb = f(pb), na = sayi(va), nb = sayi(vb)
          const ustA = buyukIyi && na > nb, ustB = buyukIyi && nb > na
          return (
            <div key={ad} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2.5">
              <span className={cn('font-display text-[24px] num text-left', ustA ? 'text-foreground' : 'text-muted-foreground')}>{va}{ustA && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-club align-middle" />}</span>
              <span className="eyebrow text-center">{ad}</span>
              <span className={cn('font-display text-[24px] num text-right', ustB ? 'text-foreground' : 'text-muted-foreground')}>{ustB && <span className="mr-1.5 inline-block w-2 h-2 rounded-full bg-club align-middle" />}{vb}</span>
            </div>
          )
        })}
      </div>

      <section className="mt-6">
        <h3 className="font-display text-[22px] mb-2">Birlikte</h3>
        {birlikte.n === 0 ? <p className="text-muted-foreground">Kayıtlarda iki oyuncunun aynı kadroda olduğu maç yok.</p> : (
          <div className="rounded-xl border bg-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div><div className="font-display text-3xl num">{birlikte.n}</div><div className="eyebrow">Maç</div></div>
            <div><div className="font-display text-3xl num">{birlikte.g}-{birlikte.b}-{birlikte.m}</div><div className="eyebrow">G-B-M</div></div>
            <div><div className="font-display text-3xl num">{birlikte.golA}</div><div className="eyebrow truncate">{pa.short} golü</div></div>
            <div><div className="font-display text-3xl num">{birlikte.golB}</div><div className="eyebrow truncate">{pb.short} golü</div></div>
          </div>
        )}
      </section>
    </div>
  )
}
