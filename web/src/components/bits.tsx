import type { ReactNode } from 'react'
import type { Jersey, Match, Player, Result, Video } from '@/types'
import { cn } from '@/lib/utils'
import { data, fmtDate, initials, ours, theirs, yt, COMP_LABEL } from '@/lib/site'
import { Play } from 'lucide-react'

export function ResultChip({ r, className }: { r: Result | null; className?: string }) {
  if (!r) return null
  const cls = r === 'G' ? 'bg-win text-white' : r === 'B' ? 'bg-draw text-white' : 'bg-loss text-white'
  return (
    <span className={cn('inline-grid place-items-center w-6 h-6 rounded-md font-data font-bold text-[13px]', cls, className)}
      title={r === 'G' ? 'Galibiyet' : r === 'B' ? 'Beraberlik' : 'Mağlubiyet'}>{r}</span>
  )
}

export function Crest({ size = 32 }: { size?: number }) {
  if (data.club.logo) return <img src={data.club.logo} alt="1337 Crew FC" className="shrink-0 object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,.35)]" style={{ width: size, height: size }} />
  return (
    <span className="inline-grid place-items-center rounded-full bg-club text-clubink font-display shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.34 }}>1337</span>
  )
}

export function TeamBadge({ code, logo, size = 36 }: { code: string; logo?: string; size?: number }) {
  if (code === '1337') return <Crest size={size} />
  if (logo) return <img src={logo} alt="" width={size} height={size} className="object-contain shrink-0" style={{ width: size, height: size }} />
  return (
    <span className="inline-grid place-items-center rounded-full bg-muted text-foreground font-data font-bold shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.3) }}>{code.slice(0, 4)}</span>
  )
}

export function Avatar({ p, size = 44, ring = true }: { p: Player; size?: number; ring?: boolean }) {
  return (
    <span className={cn('relative inline-grid place-items-center rounded-full overflow-hidden shrink-0 bg-muted font-display text-foreground', ring && 'ring-2 ring-club')}
      style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {p.photo ? <img src={p.photo} alt="" className="w-full h-full object-cover" /> : initials(p)}
    </span>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <h2 className="font-display text-[26px] leading-none tracking-[0.01em]">{children}</h2>
      {action}
    </div>
  )
}

export function MatchRow({ m, onOpen }: { m: Match; onOpen: (id: string) => void }) {
  const o = ours(m), t = theirs(m)
  const done = m.status === 'done'
  return (
    <button onClick={() => onOpen(m.id)}
      className="w-full grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors">
      <span className="font-data text-[13px] leading-tight text-muted-foreground">
        <b className="block text-foreground text-[15px]">{fmtDate(m.date).split(' ').slice(0, 2).join(' ')}</b>
        {COMP_LABEL[m.comp] ?? m.comp}{m.week ? ` · ${m.week}.h` : ''}
      </span>
      <span className="min-w-0 flex items-center gap-2.5">
        <TeamBadge code={t.code} logo={t.logo} size={30} />
        <span className="min-w-0">
          <span className="block font-semibold truncate">{t.name}</span>
          <span className="block text-[13px] text-muted-foreground">{m.us === 'home' ? 'İç saha' : 'Deplasman'}{m.forfeit ? ' · Hükmen' : m.videos.length ? ` · ${m.videos.length} video` : ''}</span>
        </span>
      </span>
      <span className="flex items-center gap-2">
        {done ? (
          <>
            <span className="font-display text-xl num">{o.score}–{t.score}</span>
            <ResultChip r={m.result} />
          </>
        ) : (
          <span className="font-data font-semibold text-[15px]">{m.time}</span>
        )}
      </span>
    </button>
  )
}

export function VideoCard({ v, sub }: { v: Video; sub?: string }) {
  const label = v.kind === 'highlight' ? 'ÖZET' : v.kind === 'part' ? 'PARÇA' : 'TAM MAÇ'
  return (
    <a href={yt(v.id)} target="_blank" rel="noreferrer" className="group block min-w-0">
      <span className="relative block aspect-video rounded-lg overflow-hidden bg-pitch">
        {v.thumb ? <img src={v.thumb} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" /> : <span className="absolute inset-0 stripes" />}
        <span className="absolute inset-0 grid place-items-center">
          <span className="w-11 h-11 rounded-full bg-black/55 grid place-items-center group-hover:bg-club group-hover:text-clubink text-white transition-colors">
            <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
          </span>
        </span>
        <span className={cn('absolute left-2 top-2 font-data font-bold text-[11px] tracking-wider px-1.5 py-0.5 rounded', v.kind === 'highlight' ? 'bg-club text-clubink' : 'bg-black/70 text-white')}>{label}</span>
        {v.len && <span className="absolute right-2 bottom-2 font-data font-semibold text-[12px] px-1.5 rounded bg-black/75 text-white num">{v.len}</span>}
      </span>
      <span className="block mt-1.5 text-[14px] font-semibold leading-snug line-clamp-2">{v.title}</span>
      {sub && <span className="block text-[13px] text-muted-foreground">{sub}</span>}
    </a>
  )
}

export function Stat({ n, label, accent }: { n: ReactNode; label: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-lg px-3 py-2.5', accent ? 'bg-club text-clubink' : 'bg-muted')}>
      <div className="font-display text-[28px] leading-none num">{n}</div>
      <div className={cn('font-data font-semibold uppercase tracking-wider text-[12px] mt-1', accent ? 'text-clubink/75' : 'text-muted-foreground')}>{label}</div>
    </div>
  )
}

export function JerseyBadge({ j, dark }: { j: Jersey; dark?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <img src={j.img} alt={`${j.colorName} forma`} className="h-[68px] w-auto drop-shadow-[0_2px_3px_rgba(0,0,0,.25)]" />
      <span className="flex items-center gap-1.5">
        {j.colors.map(c => <span key={c} className={cn('w-3 h-3 rounded-full border', dark ? 'border-black/30' : 'border-white/40')} style={{ background: c }} />)}
        <span className="font-data font-bold text-[13px]">{j.colorName}</span>
      </span>
      <span className={cn('font-data font-semibold uppercase tracking-wider text-[11px]', dark ? 'text-clubink/65' : 'text-muted-foreground')}>{j.kind === 'home' ? 'İç saha forması' : 'Deplasman forması'}</span>
    </div>
  )
}

/** Ev sahibi olduğumuz halde deplasman formasıyla çıkıyorsak (ya da tersi) bunu söyleyen cümle */
export function kitNote(m: Match) {
  const o = m.us === 'home' ? m.home : m.away
  if (!o.jersey) return null
  if (m.us === 'home' && o.jersey.kind === 'away') return `1337 Crew FC iç sahada oynamasına rağmen deplasman formasıyla (${o.jersey.colorName.toLowerCase()}) çıkıyor.`
  if (m.us === 'away' && o.jersey.kind === 'home') return `1337 Crew FC deplasmanda iç saha formasıyla (${o.jersey.colorName.toLowerCase()}) çıkıyor.`
  return null
}
