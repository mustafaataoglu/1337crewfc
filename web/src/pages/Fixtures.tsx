import { useMemo, useState } from 'react'
import type { Nav } from '@/App'
import { data } from '@/lib/site'
import { MatchRow, SectionTitle } from '@/components/bits'
import { AboneButonlari } from '@/components/taraftar'
import { cn } from '@/lib/utils'

export default function Fixtures({ nav }: { nav: Nav }) {
  const seasons = useMemo(() => [...new Set(data.matches.map(m => m.seasonShort))], [])
  const [season, setSeason] = useState(seasons[0])
  const [comp, setComp] = useState<'all' | 'league' | 'other'>('all')
  const list = data.matches
    .filter(m => m.seasonShort === season)
    .filter(m => comp === 'all' || (comp === 'league' ? m.comp === 'league' : m.comp !== 'league'))
  const next = list.filter(m => m.status !== 'done').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const done = list.filter(m => m.status === 'done').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  const w = done.filter(m => m.result === 'G').length, d = done.filter(m => m.result === 'B').length, l = done.filter(m => m.result === 'M').length

  return (
    <div className="max-w-3xl">
      <SectionTitle>Maçlar</SectionTitle>
      <div className="mb-4"><AboneButonlari /></div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4" role="tablist" aria-label="Sezon">
        {seasons.map(s => (
          <button key={s} role="tab" aria-selected={s === season} onClick={() => setSeason(s)}
            className={cn('shrink-0 px-3 py-1.5 rounded-md font-data font-semibold text-[14px] border', s === season ? 'bg-clubink text-club border-clubink' : 'bg-card')}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-4">
        <div className="flex gap-1 p-1 rounded-lg bg-muted">
          {([['all', 'Tümü'], ['league', 'Lig'], ['other', 'Kupa ve diğer']] as const).map(([k, l2]) => (
            <button key={k} onClick={() => setComp(k)} className={cn('px-3 py-1 rounded-md text-[14px] font-semibold', comp === k ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{l2}</button>
          ))}
        </div>
        {done.length > 0 && <span className="font-data font-semibold text-[15px] num">{done.length} maç · {w}G {d}B {l}M</span>}
      </div>

      {next.length > 0 && (
        <>
          <div className="eyebrow mb-2">Yaklaşan</div>
          <div className="rounded-xl border bg-card divide-y mb-6">{next.map(m => <MatchRow key={m.id} m={m} onOpen={nav.openMatch} />)}</div>
        </>
      )}
      <div className="eyebrow mb-2">Oynanan</div>
      {done.length ? (
        <div className="rounded-xl border bg-card divide-y">{done.map(m => <MatchRow key={m.id} m={m} onOpen={nav.openMatch} />)}</div>
      ) : <p className="text-muted-foreground">Bu filtrede oynanmış maç yok.</p>}
    </div>
  )
}
