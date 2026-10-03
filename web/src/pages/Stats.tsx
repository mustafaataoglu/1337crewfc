import { useState } from 'react'
import type { Nav } from '@/App'
import type { Player } from '@/types'
import { data, rankBy } from '@/lib/site'
import { Avatar, SectionTitle } from '@/components/bits'
import { cn } from '@/lib/utils'

type Scope = 'current' | 'career'

function Board({ title, unit, k, scope, nav, limit }: { title: string; unit: string; k: 'g' | 'a' | 'm' | 'mvp'; scope: Scope; nav: Nav; limit: number }) {
  const list = rankBy(k, scope).slice(0, limit)
  const max = list[0]?.[scope][k] ?? 1
  return (
    <section className="rounded-xl border bg-card overflow-hidden min-w-0">
      <div className="px-4 pt-4 pb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[22px] leading-none">{title}</h3>
        <span className="eyebrow !text-[12px]">{scope === 'current' ? 'Bu sezon' : 'Tüm zamanlar'}</span>
      </div>
      {list.length === 0 ? <p className="px-4 pb-4 text-[14px] text-muted-foreground">{scope === 'current' ? 'Bu sezon henüz kimse yok.' : 'Henüz kimse yok.'}</p> : (
        <ol>
          {list.map((p, i) => <Row key={p.slug} p={p} i={i} v={p[scope][k] ?? 0} m={p[scope].m} max={max} unit={unit} nav={nav} />)}
        </ol>
      )}
    </section>
  )
}

function Row({ p, i, v, m, max, unit, nav }: { p: Player; i: number; v: number; m: number; max: number; unit: string; nav: Nav }) {
  return (
    <li className="border-t">
      <button onClick={() => nav.openPlayer(p.slug)} className="w-full grid grid-cols-[22px_auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60">
        <span className={cn('font-display text-[18px] num', i === 0 ? 'text-foreground' : 'text-muted-foreground')}>{i + 1}</span>
        <Avatar p={p} size={36} ring={i === 0} />
        <span className="min-w-0">
          <span className="block font-semibold truncate text-[15px]">{p.name}{p.former && <span className="ml-1.5 text-[11px] font-data font-semibold uppercase tracking-wide text-muted-foreground">eski</span>}</span>
          <span className="block h-1.5 mt-1 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-club rounded-full" style={{ width: `${(v / max) * 100}%` }} /></span>
        </span>
        <span className="text-right">
          <b className="font-display text-[24px] leading-none num">{v}</b>
          <span className="block text-[11px] text-muted-foreground num">{unit} · {m} maç</span>
        </span>
      </button>
    </li>
  )
}

export function Leaders({ nav, compact }: { nav: Nav; compact?: boolean }) {
  const [scope, setScope] = useState<Scope>('current')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 p-1 rounded-lg bg-muted self-start">
        {([['current', 'Bu sezon'], ['career', 'Tüm zamanlar']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setScope(k)} className={cn('px-3 py-1 rounded-md text-[14px] font-semibold', scope === k ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{l}</button>
        ))}
      </div>
      <div className={cn('grid gap-4', !compact && 'md:grid-cols-2')}>
        <Board title="Gol krallığı" unit="gol" k="g" scope={scope} nav={nav} limit={compact ? 5 : 10} />
        <Board title="Asist krallığı" unit="asist" k="a" scope={scope} nav={nav} limit={compact ? 5 : 10} />
      </div>
    </div>
  )
}

export default function Stats({ nav }: { nav: Nav }) {
  const [scope, setScope] = useState<Scope>('career')
  const tot = data.players.reduce((s, p) => ({ g: s.g + p.career.g, a: s.a + p.career.a }), { g: 0, a: 0 })
  return (
    <div>
      <SectionTitle action={<button onClick={() => nav.go({ page: 'karsilastir' })} className="px-3 py-1.5 rounded-lg border font-data font-bold uppercase tracking-wider text-[13px]">Oyuncu karşılaştır</button>}>İstatistikler</SectionTitle>
      <p className="text-[14px] text-muted-foreground -mt-1 mb-5">Sadece 1337 formasıyla oynanan resmi maçlar: lig, play-off, kupa ve ATK. Tüm zamanlar listeleri eski oyuncuları da içerir. Toplam: {tot.g} gol, {tot.a} asist.</p>
      <Leaders nav={nav} />
      <div className="mt-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-[26px] leading-none">Diğer listeler</h2>
          <div className="flex gap-1 p-1 rounded-lg bg-muted">
            {([['current', 'Bu sezon'], ['career', 'Tüm zamanlar']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} className={cn('px-3 py-1 rounded-md text-[14px] font-semibold', scope === k ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Board title="En çok maç" unit="maç" k="m" scope={scope} nav={nav} limit={10} />
          <div className="min-w-0 flex flex-col gap-2">
            <Board title="MVP" unit="MVP" k="mvp" scope={scope} nav={nav} limit={10} />
            <p className="text-[13px] text-muted-foreground px-1">MVP seçimi 2026-27 sezonunda başladı.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
