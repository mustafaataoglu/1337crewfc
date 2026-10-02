import { useMemo, useState } from 'react'
import type { Nav } from '@/App'
import { data, fmtDate, ours, theirs } from '@/lib/site'
import { SectionTitle, VideoCard } from '@/components/bits'
import { cn } from '@/lib/utils'

export default function Videos({ nav }: { nav: Nav }) {
  const withVid = data.matches.filter(m => m.videos.length).sort((a, b) => b.date.localeCompare(a.date))
  const seasons = useMemo(() => [...new Set(withVid.map(m => m.seasonShort))], [withVid])
  const [season, setSeason] = useState<string>('all')
  const [kind, setKind] = useState<'all' | 'highlight' | 'full'>('all')
  const list = withVid.filter(m => season === 'all' || m.seasonShort === season)
  const total = withVid.reduce((n, m) => n + m.videos.length, 0)

  return (
    <div>
      <SectionTitle>Videolar</SectionTitle>
      <p className="text-[14px] text-muted-foreground -mt-1 mb-4">
        {withVid.length} maçın {total} videosu. Eski sezonlarda her maçın tek videosu var, 2026-27'den itibaren tam maç ve özet ayrı yükleniyor. Yeni videolar yüklendiği gün buraya kendiliğinden düşer.
      </p>
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex gap-1 p-1 rounded-lg bg-muted">
          {([['all', 'Hepsi'], ['highlight', 'Özetler'], ['full', 'Tam maçlar']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={cn('px-3 py-1 rounded-md text-[14px] font-semibold', kind === k ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {['all', ...seasons].map(s => (
            <button key={s} onClick={() => setSeason(s)} className={cn('shrink-0 px-3 py-1.5 rounded-md font-data font-semibold text-[14px] border', s === season ? 'bg-clubink text-club border-clubink' : 'bg-card')}>{s === 'all' ? 'Tüm sezonlar' : s}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {list.map(m => {
          const vids = m.videos.filter(v => kind === 'all' || (kind === 'highlight' ? v.kind === 'highlight' : v.kind !== 'highlight'))
          if (!vids.length) return null
          const o = ours(m), t = theirs(m)
          return (
            <section key={m.id}>
              <button onClick={() => nav.openMatch(m.id)} className="flex items-baseline gap-3 mb-2 text-left">
                <span className="font-display text-[20px] leading-tight">{m.home.name} {m.home.score}–{m.away.score} {m.away.name}</span>
                <span className="text-[13px] text-muted-foreground shrink-0">{fmtDate(m.date)}</span>
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {vids.map(v => <VideoCard key={v.id} v={v} sub={`${m.compLabel}${m.week ? ` · ${m.week}. hafta` : ''}`} />)}
              </div>
              <span className="sr-only">{o.name} {t.name}</span>
            </section>
          )
        })}
      </div>

      {data.extraVideos.length > 0 && kind !== 'highlight' && season === 'all' && (
        <section className="mt-10">
          <SectionTitle>Diğer videolar</SectionTitle>
          <p className="text-[14px] text-muted-foreground -mt-1 mb-4">Kanalda olup EfendiLig'de maç kaydı bulunmayan videolar (hazırlık maçları, eski parçalar).</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.extraVideos.map(v => <VideoCard key={v.id} v={v} />)}
          </div>
        </section>
      )}
    </div>
  )
}
