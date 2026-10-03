import { ArrowLeft } from 'lucide-react'
import type { Nav } from '@/App'
import { playerBySlug, rankBy, POS_LABEL, bdayText } from '@/lib/site'
import { Avatar, SectionTitle, Stat } from '@/components/bits'

export default function PlayerPage({ slug, nav }: { slug: string; nav: Nav }) {
  const p = playerBySlug(slug)
  if (!p) return <p>Oyuncu bulunamadı.</p>
  const c = p.career
  const gRank = rankBy('g', 'career').findIndex(x => x.slug === slug) + 1
  const aRank = rankBy('a', 'career').findIndex(x => x.slug === slug) + 1
  const mRank = rankBy('m', 'career').findIndex(x => x.slug === slug) + 1
  const contrib = c.m ? ((c.g + c.a) / c.m).toFixed(2).replace('.', ',') : '0'

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => nav.go({ page: 'kadro' })} className="flex items-center gap-1 text-[14px] font-semibold"><ArrowLeft className="w-4 h-4" /> Kadro</button>
        <button onClick={() => nav.go({ page: 'karsilastir', a: p.slug })} className="px-3 py-1.5 rounded-lg border font-data font-bold uppercase tracking-wider text-[13px]">Karşılaştır</button>
      </div>
      <section className="rounded-xl bg-clubink text-[#f5f2e6] p-5 flex items-center gap-4 relative overflow-hidden">
        <span aria-hidden className="absolute right-3 -bottom-8 font-display text-[150px] leading-none text-white/[0.06] select-none num">{p.no}</span>
        <Avatar p={p} size={88} />
        <div className="min-w-0 relative">
          <div className="font-data font-semibold uppercase tracking-[0.12em] text-[13px] text-club">{p.former ? 'Eski oyuncu' : `#${p.no}`} · {POS_LABEL[p.pos]}{p.captain ? ' · Kaptan' : ''}{p.nowClub ? ` · şimdi ${p.nowClub}` : ''}</div>
          <h1 className="font-display text-[34px] sm:text-[42px] leading-[1.02]">{p.name}</h1>
          {p.birthday && <div className="text-[14px] text-[#f5f2e6]/70 mt-1">Doğum günü: {bdayText(p)}</div>}
          {p.firstYear && <div className="text-[14px] text-[#f5f2e6]/70 mt-0.5">{p.former ? `1337'de ${p.seasons} sezon` : `${p.firstYear}'den beri 1337'de · ${p.seasons} sezon`}</div>}
        </div>
      </section>

      <section className="mt-6">
        <div className="eyebrow mb-2">1337 formasıyla · lig, kupa, play-off, ATK</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Stat n={c.m} label="Maç" />
          <Stat n={c.g} label="Gol" accent={c.g > 0} />
          <Stat n={c.a} label="Asist" accent={c.a > 0} />
          <Stat n={contrib} label="Katkı / maç" />
        </div>
        <div className="grid grid-cols-3 gap-2.5 mt-2.5">
          <Stat n={c.mvp ?? 0} label="MVP" />
          <Stat n={c.yc ?? 0} label="Sarı kart" />
          <Stat n={c.rc ?? 0} label="Kırmızı" />
        </div>
      </section>

      {!!p.otherClubMatches && <p className="mt-3 text-[14px] text-muted-foreground">EfendiLig'de başka bir takımla oynadığı {p.otherClubMatches} maç daha var. Bu sayfadaki sayılara dahil değil.</p>}
      <section className="mt-6 rounded-xl border bg-card p-4">
        <div className="eyebrow mb-2">Kulüp içindeki yeri</div>
        <ul className="grid sm:grid-cols-3 gap-3 text-[15px]">
          <li><b className="font-display text-2xl num">{mRank ? mRank + '.' : '–'}</b> <span className="text-muted-foreground">en çok maç</span></li>
          <li><b className="font-display text-2xl num">{gRank ? gRank + '.' : '–'}</b> <span className="text-muted-foreground">gol krallığı</span></li>
          <li><b className="font-display text-2xl num">{aRank ? aRank + '.' : '–'}</b> <span className="text-muted-foreground">asist krallığı</span></li>
        </ul>
      </section>

      {p.bySeason.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Sezon sezon</SectionTitle>
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full min-w-[360px] text-[15px] num">
              <thead><tr className="eyebrow !text-[12px] text-left"><th className="py-2.5 pl-4">Sezon</th><th className="text-right">Maç</th><th className="text-right">Gol</th><th className="text-right pr-4">Asist</th></tr></thead>
              <tbody>
                {p.bySeason.map(s => (
                  <tr key={s.label} className="border-t">
                    <td className="py-2.5 pl-4">{s.label}</td><td className="text-right">{s.m}</td>
                    <td className="text-right font-semibold">{s.g}</td><td className="text-right pr-4 font-semibold">{s.a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
