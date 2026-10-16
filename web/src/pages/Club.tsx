import { useState } from 'react'
import { Archive, ArrowRight, Trophy } from 'lucide-react'
import type { Nav } from '@/App'
import { data, fmtDate, squad, AYLAR } from '@/lib/site'
import { Crest, Lightbox, SayfaLink, SectionTitle } from '@/components/bits'

export default function Club({ nav }: { nav: Nav }) {
  const c = data.club
  const photos = (data.gallery ?? []).filter(g => g.kind === 'foto').sort((a, b) => b.date.localeCompare(a.date))
  const kits = (data.gallery ?? []).filter(g => g.kind === 'forma')
  const [open, setOpen] = useState<number | null>(null)

  const seasons = new Set(data.matches.map(m => m.seasonShort)).size

  return (
    <div>
      <section className="rounded-xl bg-clubink text-[#f5f2e6] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <Crest size={96} />
        <div className="min-w-0">
          <h1 className="font-display text-[40px] leading-none">1337 CREW FC</h1>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mt-4">
            {([['Kuruluş', String(c.founded)], ['Teknik direktör', c.coach], ['Kaptanlar', c.captains.join(', ')], ['EfendiLig', `${seasons} sezon · ${squad.length} kişilik kadro`]] as const).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="font-data font-semibold uppercase tracking-[0.12em] text-[12px] text-club">{k}</dt>
                <dd className="text-[15px] mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="eyebrow flex items-center gap-1.5"><Archive className="w-4 h-4" aria-hidden /> Arşiv · 2010–2020</div>
          <h2 className="font-display text-[24px] leading-tight mt-1">Eski blogdan maçlar ve hikâyeler</h2>
          <p className="text-[14px] text-muted-foreground mt-1">Pazarligi, İstanbul Ligi ve Golden League yılları: maç yazıları, kadrolar, goller, fotoğraflar. Sitenin istatistiklerine katılmaz.</p>
          <ul className="flex flex-col gap-1 mt-3 text-[14px] font-semibold">
            {['2014 İlkbahar · İstanbul Ligi 1. Lig şampiyonu', '2014 Sonbahar · İstanbul Ligi Süper Lig şampiyonu'].map(t => (
              <li key={t} className="flex items-center gap-2"><Trophy className="w-4 h-4 text-club shrink-0" aria-hidden />{t}</li>
            ))}
          </ul>
        </div>
        <SayfaLink sayfa="arsiv" yol="" nav={nav}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[14px] shrink-0">
          Arşive git <ArrowRight className="w-4 h-4" aria-hidden />
        </SayfaLink>
      </section>

      {kits.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Formalar</SectionTitle>
          <div className="grid grid-cols-2 gap-4 max-w-xl">
            {kits.map((k, i) => (
              <figure key={k.file} className="rounded-xl border bg-card p-3">
                <img src={k.src} alt={i === 0 ? 'İç saha forması' : 'Dış saha forması'} className="w-full h-auto" />
                <figcaption className="eyebrow text-center mt-2">{i === 0 ? 'İç saha' : 'Dış saha'}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <SectionTitle>Doğum günleri</SectionTitle>
        <p className="text-[14px] text-muted-foreground -mt-1 mb-4">Güncel kadronun doğum günleri.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {AYLAR.map((ay, mi) => {
            const list = squad.filter(p => p.birthday?.month === mi + 1).sort((a, b) => a.birthday!.day - b.birthday!.day)
            const now = new Date().getMonth() === mi
            return (
              <div key={ay} className={now ? 'rounded-xl border-2 border-club bg-card p-3' : 'rounded-xl border bg-card p-3'}>
                <div className="font-display text-[19px] leading-none mb-2">{ay}</div>
                {list.length ? (
                  <ul className="flex flex-col gap-1 text-[14px]">
                    {list.map(p => <li key={p.slug} className="flex gap-2"><b className="font-data num w-5 text-right shrink-0">{p.birthday!.day}</b><span className="truncate">{p.name}</span></li>)}
                  </ul>
                ) : <span className="text-[13px] text-muted-foreground">Doğum günü yok</span>}
              </div>
            )
          })}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle>Galeri</SectionTitle>
        <p className="text-[14px] text-muted-foreground -mt-1 mb-4">{photos.length} fotoğraf</p>
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 [column-fill:_balance]">
          {photos.map((p, i) => (
            <button key={p.file} onClick={() => setOpen(i)} className="block w-full mb-3 break-inside-avoid rounded-lg overflow-hidden bg-muted group">
              <img src={p.src} alt={`1337 Crew FC, ${fmtDate(p.date)}`} loading="lazy" className="w-full h-auto group-hover:scale-[1.02] transition-transform" style={{ aspectRatio: `${p.w}/${p.h}` }} />
            </button>
          ))}
        </div>
      </section>

      {open !== null && photos[open] && <Lightbox src={photos[open].src} i={open} n={photos.length} setI={setOpen} altyazi={fmtDate(photos[open].date)} />}
    </div>
  )
}
