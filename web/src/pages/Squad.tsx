import type { Nav } from '@/App'
import { squad, formerPlayers, POS_LABEL } from '@/lib/site'
import { Avatar, SectionTitle } from '@/components/bits'

export default function Squad({ nav }: { nav: Nav }) {
  const groups = (['K', 'S', 'O', 'F'] as const).map(g => ({
    g, list: squad.filter(p => p.pos === g).sort((a, b) => b.career.m - a.career.m),
  }))
  return (
    <div>
      <SectionTitle>Kadro</SectionTitle>
      <p className="text-[14px] text-muted-foreground -mt-1 mb-5">{squad.length} oyuncu · EfendiLig'deki güncel kadro. Maç, gol ve asist 1337 formasıyla oynanan tüm resmi maçların toplamı.</p>
      <div className="flex flex-col gap-7">
        {groups.map(({ g, list }) => (
          <section key={g}>
            <div className="eyebrow mb-2">{POS_LABEL[g]} · {list.length}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {list.map(p => (
                <button key={p.slug} onClick={() => nav.openPlayer(p.slug)}
                  className="flex items-center gap-3 p-3 rounded-xl border bg-card text-left hover:border-club transition-colors min-w-0">
                  <Avatar p={p} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold truncate">{p.name}{p.captain && <span className="ml-1.5 text-[11px] font-data font-bold px-1 rounded bg-club text-clubink align-middle">K</span>}</span>
                    <span className="block text-[13px] text-muted-foreground num">{p.career.m} maç · {p.career.g} gol · {p.career.a} asist</span>
                  </span>
                  <span className="font-display text-2xl text-muted-foreground num">{p.no}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        <section>
          <div className="eyebrow mb-2">Eski oyuncular · {formerPlayers.length}</div>
          <p className="text-[14px] text-muted-foreground -mt-1 mb-3">Crew formasıyla maça çıkmış, bugün kadroda olmayan oyuncular. Maç kadrolarından otomatik bulunur.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {formerPlayers.map(p => (
              <button key={p.slug} onClick={() => nav.openPlayer(p.slug)} className="flex items-center gap-3 p-3 rounded-xl border bg-card/60 text-left hover:border-club transition-colors min-w-0">
                <Avatar p={p} size={40} ring={false} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold truncate">{p.name}</span>
                  <span className="block text-[13px] text-muted-foreground num">{p.career.m} maç · {p.career.g} gol · {p.career.a} asist{p.nowClub ? ` · şimdi ${p.nowClub}` : ''}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
