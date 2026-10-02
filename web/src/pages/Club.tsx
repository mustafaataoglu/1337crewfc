import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { data, fmtDate, squad, AYLAR } from '@/lib/site'
import { Crest, SectionTitle } from '@/components/bits'

export default function Club() {
  const c = data.club
  const photos = (data.gallery ?? []).filter(g => g.kind === 'foto').sort((a, b) => b.date.localeCompare(a.date))
  const kits = (data.gallery ?? []).filter(g => g.kind === 'forma')
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    if (open === null) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen(i => (i === null ? i : (i + 1) % photos.length))
      if (e.key === 'ArrowLeft') setOpen(i => (i === null ? i : (i - 1 + photos.length) % photos.length))
    }
    addEventListener('keydown', onKey)
    return () => { removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, photos.length])

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

      {open !== null && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" role="dialog" aria-label="Fotoğraf" onClick={() => setOpen(null)}>
          <img src={photos[open].src} alt="" className="max-w-full max-h-[86vh] object-contain rounded" onClick={e => e.stopPropagation()} />
          <div className="absolute bottom-[calc(16px+env(safe-area-inset-bottom))] inset-x-0 text-center text-white/80 text-[14px] font-data">{open + 1} / {photos.length} · {fmtDate(photos[open].date)}</div>
          <button aria-label="Kapat" onClick={() => setOpen(null)} className="absolute top-[calc(12px+env(safe-area-inset-top))] right-3 p-2 rounded-full bg-white/10 text-white"><X className="w-6 h-6" /></button>
          <button aria-label="Önceki" onClick={e => { e.stopPropagation(); setOpen((open - 1 + photos.length) % photos.length) }} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white"><ChevronLeft className="w-7 h-7" /></button>
          <button aria-label="Sonraki" onClick={e => { e.stopPropagation(); setOpen((open + 1) % photos.length) }} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white"><ChevronRight className="w-7 h-7" /></button>
        </div>
      )}
    </div>
  )
}
