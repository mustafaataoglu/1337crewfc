import { useEffect, useState } from 'react'
import { ArrowRight, Cake, Flag, Film, Medal, Sparkles, TrendingUp, Vote as VoteIcon, FileText } from 'lucide-react'
import type { Nav } from '@/App'
import type { FeedItem } from '@/types'
import { data, fmtDate, kickoff, upcoming, played, playerBySlug, yt, upcomingBirthdays, bdayText } from '@/lib/site'
import { Crest, ResultChip, SectionTitle, TeamBadge, Avatar, JerseyBadge, kitNote } from '@/components/bits'
import { Leaders } from '@/pages/Stats'

const ICON: Record<FeedItem['kind'], typeof Flag> = {
  birthday: Cake,
  preview: Flag, report: FileText, video: Film, milestone: Medal, streak: TrendingUp, table: Sparkles, vote: VoteIcon,
}
const KIND: Record<FeedItem['kind'], string> = {
  birthday: 'Doğum günü',
  preview: 'Maç önü', report: 'Maç raporu', video: 'Video', milestone: 'Kilometre taşı', streak: 'Seri', table: 'Puan durumu', vote: 'Oylama',
}

function useCountdown(target?: Date) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  if (!target) return null
  const s = Math.max(0, Math.floor((target.getTime() - now) / 1000))
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 }
}

export default function Home({ nav }: { nav: Nav }) {
  const next = upcoming[0]
  const cd = useCountdown(next ? kickoff(next) : undefined)
  const last = played[0]
  const c = data.club
  const bdays = upcomingBirthdays(5)
  const todayStr = new Date().toISOString().slice(0, 10)
  // Doğum günü kartı sitenin açıldığı gün canlı üretilir (statik akıştaki kartlar atlanır)
  const feed: FeedItem[] = [
    ...bdays.filter(b => b.days === 0).map(({ p }) => ({ id: 'bd-' + p.slug, kind: 'birthday' as const, date: todayStr, playerSlug: p.slug, title: `İyi ki doğdun ${p.name}!`, body: `1337 formasıyla ${p.career.m} maç, ${p.career.g} gol, ${p.career.a} asist. Bugün onun günü.` })),
    ...data.feed.filter(f => f.kind !== 'birthday'),
  ]
  const around = data.table.filter(r => Math.abs(r.rank - c.rank) <= 2 || r.rank === 1)

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <div className="min-w-0 flex flex-col gap-6">
        {next && (
          <section className="rounded-xl bg-club text-clubink overflow-hidden relative">
            <span aria-hidden className="absolute -right-6 -top-10 font-display text-[190px] leading-none text-black/[0.07] select-none">1337</span>
            <div className="relative p-5 sm:p-6 flex flex-col gap-4">
              <div className="font-data font-bold uppercase tracking-[0.12em] text-[13px] text-clubink/70">
                Sıradaki maç · {next.compLabel}{next.week ? ` · ${next.week}. hafta` : ''}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex flex-col items-center gap-2 text-center">
                  {next.us === 'home' ? <Crest size={56} /> : <TeamBadge code={next.home.code} logo={next.home.logo} size={56} />}
                  <span className="font-display text-xl sm:text-2xl leading-tight">{next.home.name}</span>
                  {next.home.jersey && <JerseyBadge j={next.home.jersey} dark />}
                </div>
                <div className="text-center font-data font-bold">
                  <div className="text-[15px]">{fmtDate(next.date, true)}</div>
                  <div className="font-display text-3xl">{next.time}</div>
                </div>
                <div className="flex flex-col items-center gap-2 text-center">
                  {next.us === 'away' ? <Crest size={56} /> : <TeamBadge code={next.away.code} logo={next.away.logo} size={56} />}
                  <span className="font-display text-xl sm:text-2xl leading-tight">{next.away.name}</span>
                  {next.away.jersey && <JerseyBadge j={next.away.jersey} dark />}
                </div>
              </div>
              {kitNote(next) && <p className="text-center font-semibold text-[15px] -mt-1">{kitNote(next)}</p>}
              {cd && (
                <div className="flex justify-center gap-5 font-data font-bold uppercase text-[12px] tracking-wider" aria-label="Maça kalan süre">
                  {([['gün', cd.d], ['saat', cd.h], ['dk', cd.m], ['sn', cd.s]] as const).map(([l, v]) => (
                    <span key={l} className="flex flex-col items-center"><b className="font-display font-normal text-[34px] leading-none num tracking-normal">{String(v).padStart(2, '0')}</b>{l}</span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 justify-center">
                <button onClick={() => nav.go({ page: 'oyla' })} className="px-4 py-2.5 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[14px]">Senin 11'ini kur</button>
                <button onClick={() => nav.openMatch(next.id)} className="px-4 py-2.5 rounded-lg border border-clubink/40 font-data font-bold uppercase tracking-wider text-[14px]">Maç önü analizi</button>
              </div>
            </div>
          </section>
        )}

        <section>
          <SectionTitle>Akış</SectionTitle>
          <p className="text-[14px] text-muted-foreground -mt-1 mb-3">Bu kartların hiçbirini kimse yazmadı. Site EfendiLig ve YouTube'daki her değişikliği yakalayıp kendisi üretti.</p>
          <ol className="flex flex-col gap-3">
            {feed.map(f => <FeedCard key={f.id} f={f} nav={nav} />)}
          </ol>
        </section>
      </div>

      <aside className="min-w-0 flex flex-col gap-6">
        {last && (
          <section className="rounded-xl border bg-card p-4">
            <div className="eyebrow mb-2">Son maç</div>
            <button onClick={() => nav.openMatch(last.id)} className="w-full flex items-center justify-between gap-3 text-left">
              <span className="min-w-0">
                <span className="block font-semibold truncate">{last.home.name} – {last.away.name}</span>
                <span className="block text-[13px] text-muted-foreground">{fmtDate(last.date)} · {last.compLabel}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0"><span className="font-display text-2xl num">{last.home.score}–{last.away.score}</span><ResultChip r={last.result} /></span>
            </button>
          </section>
        )}

        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-baseline justify-between mb-2">
            <div className="eyebrow">Puan durumu</div>
            <button onClick={() => nav.go({ page: 'puan' })} className="text-[13px] font-semibold flex items-center gap-1">Tümü <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
          <table className="w-full text-[14px] num">
            <tbody>
              {around.map(r => (
                <tr key={r.code} className={r.us ? 'font-bold' : ''}>
                  <td className="py-1.5 w-7 text-muted-foreground">{r.rank}</td>
                  <td className="py-1.5"><span className={r.us ? 'bg-club text-clubink px-1.5 rounded' : ''}>{r.name}</span></td>
                  <td className="py-1.5 text-right text-muted-foreground w-10">{r.gd > 0 ? '+' + r.gd : r.gd}</td>
                  <td className="py-1.5 text-right w-8 font-semibold">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <span className="text-[13px] text-muted-foreground">Form</span>
            <span className="flex gap-1">{c.form.map((r, i) => <ResultChip key={i} r={r} />)}</span>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <div className="eyebrow mb-2 flex items-center gap-1.5"><Cake className="w-3.5 h-3.5" /> Yaklaşan doğum günleri</div>
          <ul className="flex flex-col">
            {bdays.map(({ p, days }) => (
              <li key={p.slug}>
                <button onClick={() => nav.openPlayer(p.slug)} className="w-full flex items-center gap-3 py-1.5 text-left">
                  <Avatar p={p} size={34} ring={days === 0} />
                  <span className="min-w-0 flex-1"><span className="block font-semibold truncate text-[15px]">{p.name}</span><span className="block text-[13px] text-muted-foreground">{bdayText(p)}</span></span>
                  <span className={days === 0 ? 'font-data font-bold text-[13px] px-2 py-0.5 rounded bg-club text-clubink' : 'font-data font-semibold text-[13px] text-muted-foreground num'}>{days === 0 ? 'Bugün!' : days === 1 ? 'Yarın' : `${days} gün`}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <Leaders nav={nav} compact />
      </aside>
    </div>
  )
}

function FeedCard({ f, nav }: { f: FeedItem; nav: Nav }) {
  const I = ICON[f.kind]
  const p = f.playerSlug ? playerBySlug(f.playerSlug) : undefined
  const open = () => (f.matchId ? nav.openMatch(f.matchId) : f.playerSlug ? nav.openPlayer(f.playerSlug) : f.kind === 'vote' ? nav.go({ page: 'oyla' }) : undefined)
  return (
    <li className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 flex gap-3">
        {p ? <Avatar p={p} size={44} /> : (
          <span className={f.kind === 'report' || f.kind === 'preview' ? 'w-11 h-11 rounded-full bg-club text-clubink grid place-items-center shrink-0' : 'w-11 h-11 rounded-full bg-muted grid place-items-center shrink-0'}>
            <I className="w-5 h-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="eyebrow !text-[12px]">{KIND[f.kind]} · {fmtDate(f.date)}</div>
          <h3 className="font-display text-[21px] leading-tight mt-0.5">{f.title}</h3>
          <p className="text-[15px] text-muted-foreground mt-1">{f.body}</p>
          {f.videoId && (
            <a href={yt(f.videoId)} target="_blank" rel="noreferrer" className="mt-3 block relative aspect-video max-w-md rounded-lg overflow-hidden bg-pitch">
              {f.thumb ? <img src={f.thumb} alt="" className="w-full h-full object-cover" /> : <span className="absolute inset-0 stripes" />}
              <span className="absolute left-2 bottom-2 font-data font-bold text-[12px] px-2 py-0.5 rounded bg-club text-clubink">YouTube'da izle</span>
            </a>
          )}
          {(f.matchId || f.playerSlug || f.kind === 'vote') && (
            <button onClick={open} className="mt-2 text-[14px] font-semibold inline-flex items-center gap-1 underline-offset-2 hover:underline">
              {f.matchId ? 'Maç sayfası' : f.playerSlug ? 'Oyuncu profili' : 'Oy ver'} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

