import { useEffect, useState } from 'react'
import { Home as HomeIcon, CalendarDays, Users, BarChart3, PlaySquare, Vote as VoteIcon, ListOrdered, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Crest } from '@/components/bits'
import ErrorBoundary from '@/components/ErrorBoundary'
import Home from '@/pages/Home'
import Fixtures from '@/pages/Fixtures'
import MatchPage from '@/pages/MatchPage'
import Table from '@/pages/Table'
import Squad from '@/pages/Squad'
import PlayerPage from '@/pages/PlayerPage'
import Stats from '@/pages/Stats'
import Videos from '@/pages/Videos'
import Vote from '@/pages/Vote'
import Club from '@/pages/Club'

export type Route =
  | { page: 'home' | 'fikstur' | 'puan' | 'kadro' | 'istatistik' | 'video' | 'oyla' | 'kulup' }
  | { page: 'mac'; id: string }
  | { page: 'oyuncu'; slug: string }

export interface Nav { go: (r: Route) => void; openMatch: (id: string) => void; openPlayer: (slug: string) => void }

const TABS = [
  { page: 'home', label: 'Akış', icon: HomeIcon },
  { page: 'fikstur', label: 'Maçlar', icon: CalendarDays },
  { page: 'puan', label: 'Puan', icon: ListOrdered },
  { page: 'kadro', label: 'Kadro', icon: Users },
  { page: 'istatistik', label: 'İstatistik', icon: BarChart3 },
  { page: 'video', label: 'Videolar', icon: PlaySquare },
  { page: 'oyla', label: "Senin 11'in", icon: VoteIcon },
  { page: 'kulup', label: 'Kulüp', icon: Shield },
] as const

const TOP = TABS.map(t => t.page as string)

// Adresler: #fikstur, #mac/<maç>, #oyuncu/<oyuncu> — paylaşılabilir, geri tuşu çalışır
function fromHash(): Route {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''))
  if (h.startsWith('mac/')) return { page: 'mac', id: h.slice(4) }
  if (h.startsWith('oyuncu/')) return { page: 'oyuncu', slug: h.slice(7) }
  return TOP.includes(h) ? ({ page: h } as Route) : { page: 'home' }
}
const toHash = (r: Route) =>
  r.page === 'home' ? '' : r.page === 'mac' ? `#mac/${encodeURIComponent(r.id)}` : r.page === 'oyuncu' ? `#oyuncu/${encodeURIComponent(r.slug)}` : `#${r.page}`

export default function App() {
  const [route, setRoute] = useState<Route>(fromHash)
  const go = (r: Route) => {
    setRoute(r)
    history.pushState(null, '', toHash(r) || location.pathname)
    window.scrollTo({ top: 0 })
  }
  const nav: Nav = { go, openMatch: id => go({ page: 'mac', id }), openPlayer: slug => go({ page: 'oyuncu', slug }) }
  useEffect(() => {
    const f = () => { setRoute(fromHash()); window.scrollTo({ top: 0 }) }
    addEventListener('popstate', f)
    addEventListener('hashchange', f)
    return () => { removeEventListener('popstate', f); removeEventListener('hashchange', f) }
  }, [])

  const active = route.page === 'mac' ? 'fikstur' : route.page === 'oyuncu' ? 'kadro' : route.page

  return (
    <div className="min-h-full pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-10">
      <header className="sticky top-0 z-30 bg-clubink text-[#f5f2e6] pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => go({ page: 'home' })} className="flex items-center gap-2.5 shrink-0" aria-label="Ana sayfa">
            <Crest size={34} />
            <span className="font-display text-[22px] tracking-[0.02em] leading-none">1337 CREW FC</span>
          </button>
          <nav className="hidden md:flex items-center gap-1 ml-auto" aria-label="Ana menü">
            {TABS.map(t => (
              <button key={t.page} onClick={() => go({ page: t.page } as Route)} aria-current={active === t.page ? 'page' : undefined}
                className={cn('px-2.5 py-1.5 rounded-md font-data font-semibold uppercase tracking-wider text-[14px] transition-colors',
                  active === t.page ? 'bg-club text-clubink' : 'text-[#f5f2e6]/80 hover:text-[#f5f2e6] hover:bg-white/10')}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-5">
        <ErrorBoundary resetKey={JSON.stringify(route)}>
        {route.page === 'home' && <Home nav={nav} />}
        {route.page === 'fikstur' && <Fixtures nav={nav} />}
        {route.page === 'mac' && <MatchPage id={route.id} nav={nav} />}
        {route.page === 'puan' && <Table />}
        {route.page === 'kadro' && <Squad nav={nav} />}
        {route.page === 'oyuncu' && <PlayerPage slug={route.slug} nav={nav} />}
        {route.page === 'istatistik' && <Stats nav={nav} />}
        {route.page === 'video' && <Videos nav={nav} />}
        {route.page === 'oyla' && <Vote />}
        {route.page === 'kulup' && <Club />}
        </ErrorBoundary>
        <footer className="mt-14 pt-5 border-t text-[13px] text-muted-foreground flex flex-wrap gap-x-6 gap-y-1">
          <span>© 1337 Crew FC · 2007'den beri</span>
          <a className="underline underline-offset-2" href="https://efendilig.com/takim/1337-Crew-FC" target="_blank" rel="noreferrer">Veri: EfendiLig</a>
          <a className="underline underline-offset-2" href="https://www.youtube.com/@EfendiLig" target="_blank" rel="noreferrer">YouTube: @EfendiLig</a>
        </footer>
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-clubink text-[#f5f2e6] pb-[env(safe-area-inset-bottom)] border-t border-white/10" aria-label="Alt menü">
        <div className="flex overflow-x-auto [scrollbar-width:none]">
          {TABS.map(t => {
            const I = t.icon
            return (
              <button key={t.page} onClick={() => go({ page: t.page } as Route)}
                className={cn('flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 font-data font-semibold text-[9.5px] uppercase tracking-normal',
                  active === t.page ? 'text-club' : 'text-[#f5f2e6]/65')}>
                <I className="w-5 h-5" />
                <span className="leading-none whitespace-nowrap">{t.label === "Senin 11'in" ? 'Oyla' : t.label === 'İstatistik' ? 'İstat.' : t.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
