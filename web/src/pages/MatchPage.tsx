import { ArrowLeft } from 'lucide-react'
import type { Nav } from '@/App'
import type { Match } from '@/types'
import { data, fmtDate, matchById, ours, theirs, playerBySlug } from '@/lib/site'
import { Avatar, Crest, JerseyBadge, MatchRow, ResultChip, SectionTitle, TeamBadge, VideoCard, kitNote } from '@/components/bits'

function report(m: Match) {
  const o = ours(m), t = theirs(m)
  const where = m.us === 'home' ? 'evinde' : `${t.name} deplasmanında`
  const verb = m.result === 'G' ? 'galip geldi' : m.result === 'B' ? 'berabere kaldı' : m.result === 'M' ? 'mağlup oldu' : 'oynadı'
  if (m.forfeit) return `${m.compLabel} maçı hükmen ${o.score}–${t.score} ${m.result === 'G' ? '1337 Crew FC lehine' : `${t.name} lehine`} sonuçlandı. Maç oynanmadığı için kadro ve video yok.`
  const parts = [`1337 Crew FC, ${m.compLabel}${m.week ? ` ${m.week}. hafta` : ''} maçında ${where} ${t.name} karşısında ${o.score}–${t.score} ${verb}.`]
  if (m.scorers?.length) parts.push(`Goller: ${m.scorers.map(x => x.name + (x.n > 1 ? ` (${x.n})` : '')).join(', ')}.`)
  if (m.assisters?.length) parts.push(`Asistler: ${m.assisters.map(x => x.name + (x.n > 1 ? ` (${x.n})` : '')).join(', ')}.`)
  if (m.mvp) parts.push(m.mvp.ours ? `Maçın MVP'si 1337 Crew FC'den ${m.mvp.name}.` : `Maçın MVP'si rakipten ${m.mvp.name} oldu.`)
  const v = m.videos
  if (v.some(x => x.kind === 'highlight')) parts.push('Maçın hem tamamı hem özeti aşağıda.')
  else if (v.length > 1) parts.push(`Maç YouTube'a ${v.length} parça halinde yüklendi.`)
  else if (v.length) parts.push('Maçın tamamı aşağıda.')
  return parts.join(' ')
}

export default function MatchPage({ id, nav }: { id: string; nav: Nav }) {
  const m = matchById(id)
  if (!m) return <p>Maç bulunamadı.</p>
  const o = ours(m), t = theirs(m)
  const done = m.status === 'done'
  const h2h = data.matches.filter(x => x.id !== m.id && x.status === 'done' && theirs(x).code === t.code).sort((a, b) => b.date.localeCompare(a.date))
  const hw = h2h.filter(x => x.result === 'G').length, hd = h2h.filter(x => x.result === 'B').length, hl = h2h.filter(x => x.result === 'M').length
  const oppRow = data.table.find(r => r.code === t.code)
  const usRow = data.table.find(r => r.us)

  return (
    <div className="max-w-3xl">
      <button onClick={() => nav.go({ page: 'fikstur' })} className="flex items-center gap-1 text-[14px] font-semibold mb-3"><ArrowLeft className="w-4 h-4" /> Maçlar</button>

      <section className="rounded-xl bg-clubink text-[#f5f2e6] p-5">
        <div className="font-data font-semibold uppercase tracking-[0.12em] text-[13px] text-[#f5f2e6]/65 text-center">
          {m.compLabel}{m.week ? ` · ${m.week}. hafta` : ''} · {m.season}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-4">
          <Team side={m.home} isUs={m.us === 'home'} />
          <div className="text-center">
            {done ? <div className="font-display text-5xl num">{m.home.score}–{m.away.score}</div> : <div className="font-display text-3xl">{m.time}</div>}
            <div className="font-data text-[14px] text-[#f5f2e6]/70 mt-1">{fmtDate(m.date, true)}</div>
          </div>
          <Team side={m.away} isUs={m.us === 'away'} />
        </div>
        {done && <div className="flex justify-center items-center gap-2 mt-3"><ResultChip r={m.result} className="w-auto px-3" />{m.forfeit && <span className="font-data font-bold uppercase tracking-wider text-[13px] px-2 py-0.5 rounded bg-club text-clubink">Hükmen</span>}</div>}
      </section>

      {done ? (
        <>
          <section className="mt-6">
            <SectionTitle>Maç raporu</SectionTitle>
            <p className="text-[17px] leading-relaxed max-w-[62ch] whitespace-pre-line">{m.rapor ?? report(m)}</p>
          </section>
          <section className="mt-8">
            <SectionTitle>Videolar</SectionTitle>
            {m.videos.length ? (
              <div className="grid sm:grid-cols-2 gap-4">{m.videos.map(v => <VideoCard key={v.id} v={v} sub={v.kind === 'highlight' ? 'Maç özeti' : v.kind === 'part' ? 'Maçın bir bölümü' : 'Maçın tamamı'} />)}</div>
            ) : <p className="text-muted-foreground">{m.forfeit ? 'Hükmen sonuçlanan maçın videosu yok.' : 'Bu maçın videosu henüz yok.'}</p>}
          </section>
        </>
      ) : (
        <>
        {(m.home.jersey || m.away.jersey) && (
          <section className="mt-6">
            <SectionTitle>Formalar</SectionTitle>
            <div className="rounded-xl border bg-card p-4 grid grid-cols-2 gap-4">
              {[m.home, m.away].map(sd => (
                <div key={sd.code} className="flex flex-col items-center gap-2 text-center">
                  <span className="font-display text-[18px] leading-tight">{sd.name}</span>
                  {sd.jersey ? <JerseyBadge j={sd.jersey} /> : <span className="text-[14px] text-muted-foreground">Henüz belli değil</span>}
                </div>
              ))}
            </div>
            {kitNote(m) && <p className="mt-2 text-[15px] font-semibold">{kitNote(m)}</p>}
          </section>
        )}
        <section className="mt-6">
          <SectionTitle>Maç önü</SectionTitle>
          <div className="grid sm:grid-cols-3 gap-3">
            <Box label="Rakibin sırası" value={oppRow ? `${oppRow.rank}.` : '–'} sub={oppRow ? `${oppRow.points} puan · averaj ${oppRow.gd > 0 ? '+' : ''}${oppRow.gd}` : ''} />
            <Box label="1337'nin sırası" value={usRow ? `${usRow.rank}.` : '–'} sub={usRow ? `${usRow.points} puan · averaj ${usRow.gd > 0 ? '+' : ''}${usRow.gd}` : ''} />
            <Box label="Önceki karşılaşmalar" value={h2h.length ? `${hw}G ${hd}B ${hl}M` : 'Kayıt yok'} sub={h2h.length ? `${h2h.length} maç` : 'Kayıtlı karşılaşma yok'} />
          </div>
        </section>
        </>
      )}

      {done && m.lineup && m.lineup.xi.length > 0 && (
        <section className="mt-8">
          <SectionTitle>1337 kadrosu</SectionTitle>
          <Lineup title="İlk 11" slugs={m.lineup.xi} m={m} nav={nav} />
          {m.lineup.subs.length > 0 && <Lineup title="Yedekler" slugs={m.lineup.subs} m={m} nav={nav} />}
        </section>
      )}

      {h2h.length > 0 && (
        <section className="mt-8">
          <SectionTitle>{t.name} ile geçmiş</SectionTitle>
          <div className="rounded-xl border bg-card divide-y">{h2h.slice(0, 6).map(x => <MatchRow key={x.id} m={x} onOpen={nav.openMatch} />)}</div>
        </section>
      )}

      {done && m.mvp && (
        <p className="mt-6 text-[15px]"><span className="eyebrow mr-2">MVP</span>{m.mvp.name} {m.mvp.ours ? '(1337)' : `(${t.name})`}</p>
      )}
      <p className="sr-only">{o.name}</p>
    </div>
  )
}

function Team({ side, isUs }: { side: Match['home']; isUs: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center min-w-0">
      {isUs ? <Crest size={60} /> : <TeamBadge code={side.code} logo={side.logo} size={60} />}
      <span className="font-display text-lg sm:text-2xl leading-tight">{side.name}</span>
    </div>
  )
}

function Box({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="eyebrow">{label}</div>
      <div className="font-display text-3xl mt-1 num">{value}</div>
      <div className="text-[13px] text-muted-foreground mt-1">{sub}</div>
    </div>
  )
}

function Lineup({ title, slugs, m, nav }: { title: string; slugs: string[]; m: Match; nav: Nav }) {
  return (
    <div className="mb-4">
      <div className="eyebrow mb-2">{title} · {slugs.length}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {slugs.map(sl => {
          const p = playerBySlug(sl)
          if (!p) return null
          const g = m.scorers?.find(x => x.slug === sl)?.n ?? 0
          const a = m.assisters?.find(x => x.slug === sl)?.n ?? 0
          return (
            <button key={sl} onClick={() => nav.openPlayer(sl)} className="flex items-center gap-2.5 p-2 rounded-lg border bg-card text-left hover:border-club min-w-0">
              <Avatar p={p} size={34} ring={false} />
              <span className="min-w-0 flex-1 truncate font-semibold text-[15px]">{p.name}</span>
              {g > 0 && <span className="font-data font-bold text-[13px] px-1.5 rounded bg-club text-clubink">{g > 1 ? g + ' ' : ''}GOL</span>}
              {a > 0 && <span className="font-data font-bold text-[13px] px-1.5 rounded bg-muted">{a > 1 ? a + ' ' : ''}AST</span>}
              {m.mvp?.ours && m.mvp.name === p.name && <span className="font-data font-bold text-[13px] px-1.5 rounded bg-clubink text-club">MVP</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
