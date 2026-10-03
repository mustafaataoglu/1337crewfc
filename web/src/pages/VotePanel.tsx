import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import type { Pos } from '@/types'
import { played, upcoming, fmtDate, playerBySlug, POS_LABEL } from '@/lib/site'
import { Avatar } from '@/components/bits'
import { cn } from '@/lib/utils'

type Slot = { x: number; y: number; g: Pos; label: string }
type Oy = { dizilis: string; zaman: string; sira: string[] }
type Sonuc = {
  toplam: number
  dizilisler: Record<string, number>
  mevkiler: Partial<Record<Pos, Record<string, number>>>
  slotlar: Record<string, Record<string, Record<string, number>>>
  oylar: Oy[]
}
type Yer = { slug: string; n?: number } | null
// Sahada ne gösteriliyor: bir dizilişin ortak 11'i ya da tek bir oy
type Gorunum = { tip: 'ortak'; f?: string } | { tip: 'oy'; i: number }

const pct = (n: number, d: number) => Math.round((n / Math.max(1, d)) * 100)
const saat = (z: string) => { const d = new Date(z); return isNaN(+d) ? '' : d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
const shortName = (slug: string) => playerBySlug(slug)?.short ?? slug
const sirali = (o: Record<string, number> = {}) => Object.entries(o).sort((a, b) => b[1] - a[1])

/** Bir dizilişi seçenlerin 11'i: her slota o slota en çok konan oyuncu (tekrarsız) */
function ortak11(res: Sonuc, F: Record<string, Slot[]>, f: string): Yer[] {
  const bySlot = res.slotlar?.[f] ?? {}
  const cands: { i: number; slug: string; n: number }[] = []
  F[f].forEach((_, i) => Object.entries(bySlot[i] ?? {}).forEach(([slug, n]) => cands.push({ i, slug, n })))
  // Slot bilgisi olmayan eski oylar için mevki toplamlarına düş
  if (!cands.length) F[f].forEach((s, i) => Object.entries(res.mevkiler[s.g] ?? {}).forEach(([slug, n]) => cands.push({ i, slug, n })))
  cands.sort((a, b) => b.n - a.n)
  const used = new Set<string>()
  const slots: Yer[] = F[f].map(() => null)
  for (const c of cands) if (!slots[c.i] && !used.has(c.slug)) { slots[c.i] = { slug: c.slug, n: c.n }; used.add(c.slug) }
  return slots
}

/** Tek oyun 11'i: oyuncular dizilişteki slot sırasıyla gelir */
const oy11 = (v: Oy, F: Record<string, Slot[]>): Yer[] => F[v.dizilis].map((_, i) => (v.sira[i] ? { slug: v.sira[i] } : null))

function Saha({ slots, dizilis, F, payda }: { slots: Yer[]; dizilis: string; F: Record<string, Slot[]>; payda?: number }) {
  return (
    <div className="relative w-full aspect-[100/150] rounded-xl overflow-hidden stripes border border-black/20">
      <span className="absolute inset-x-0 top-1/2 border-t-2 border-white/50" />
      <span className="absolute left-1/2 top-1/2 w-[26%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/50" />
      <span className="absolute left-[22%] right-[22%] bottom-0 h-[14%] border-2 border-b-0 border-white/50" />
      {F[dizilis].map((s, i) => {
        const c = slots[i]
        const p = c ? playerBySlug(c.slug) : undefined
        return (
          <div key={dizilis + i} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 transition-[left,top] duration-300" style={{ left: `${Math.min(88, Math.max(12, s.x))}%`, top: `${6 + (s.y - 13) * (86 / 79)}%` }}>
            {p ? <Avatar p={p} size={36} /> : <span className="w-9 h-9 rounded-full border-2 border-dashed border-white/70 grid place-items-center text-white font-data font-bold text-[11px]">{s.label}</span>}
            <span className="max-w-[78px] truncate text-[11.5px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">{p ? p.short : c ? shortName(c.slug) : '–'}</span>
            {c?.n !== undefined && payda !== undefined && <span className="font-data font-bold text-[11px] px-1.5 rounded bg-club text-clubink num">%{pct(c.n, payda)}</span>}
          </div>
        )
      })}
    </div>
  )
}

// Takım paneli: sonuçlar yalnızca panel anahtarıyla görünür
export default function VotePanel({ F }: { F: Record<string, Slot[]> }) {
  // Sıradaki maç ve son oynanan 3 maç: oylama kapandıktan sonra da sonuçlar görülebilsin
  const options = [...(upcoming[0] ? [upcoming[0]] : []), ...played.slice(0, 3)]
  const [mac, setMac] = useState(options[0]?.id)
  const [key, setKey] = useState(() => { try { return localStorage.getItem('1337-panel') ?? '' } catch { return '' } })
  const [input, setInput] = useState('')
  const [res, setRes] = useState<Sonuc | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [hepsi, setHepsi] = useState(false)
  const [gorunum, setGorunum] = useState<Gorunum>({ tip: 'ortak' })
  const sahaRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!key || !mac) return
    setGorunum({ tip: 'ortak' })
    fetch(`api/oy.php?mac=${encodeURIComponent(mac)}`, { headers: { 'X-Panel-Anahtar': key } })
      .then(r => r.json())
      .then(j => { if (j.ok) { setRes(j.sonuc); setErr(null) } else { setErr(j.hata ?? 'Anahtar geçersiz'); setRes(null) } })
      .catch(() => setErr('Sunucuya ulaşılamadı'))
  }, [key, mac])
  // Anahtar ancak sunucu kabul edince hatırlanır
  useEffect(() => { if (res && key) { try { localStorage.setItem('1337-panel', key) } catch { /* depolama kapalı */ } } }, [res, key])

  // Arayüzün tanıdığı dizilişlere verilen oylar (en çoktan aza) ve sahada gösterilebilen tek oylar
  const dizilisler = useMemo(() => (res ? sirali(res.dizilisler).filter(([f]) => F[f]) : []), [res, F])
  const votes = useMemo(() => (res?.oylar ?? []).filter(v => F[v.dizilis] && Array.isArray(v.sira)), [res, F])
  const saha = useMemo(() => {
    if (!res) return null
    if (gorunum.tip === 'oy') {
      const v = votes[gorunum.i]
      return v ? { tip: 'oy' as const, f: v.dizilis, slots: oy11(v, F), v } : null
    }
    const f = gorunum.f && F[gorunum.f] ? gorunum.f : dizilisler[0]?.[0]
    return f ? { tip: 'ortak' as const, f, n: res.dizilisler[f] ?? 0, slots: ortak11(res, F, f) } : null
  }, [res, gorunum, votes, dizilisler, F])
  // Telefonda liste sahanın altında kalır: seçim yapılınca sahaya kaydır
  const goster = (g: Gorunum) => {
    setGorunum(g)
    if (innerWidth < 1024) requestAnimationFrame(() => sahaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  if (!res) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2 eyebrow"><Lock className="w-3.5 h-3.5" /> Takım paneli</div>
        <h3 className="font-display text-[24px] mt-1">Taraftarın 11'i</h3>
        <p className="text-[14px] text-muted-foreground mt-1">Sonuçları görmek için takım paneli anahtarını gir.</p>
        <form onSubmit={e => { e.preventDefault(); setKey(input.trim()) }} className="flex gap-2 mt-3">
          <label htmlFor="panel-anahtar" className="sr-only">Panel anahtarı</label>
          <input id="panel-anahtar" value={input} onChange={e => setInput(e.target.value)} placeholder="Panel anahtarı" autoComplete="off" className="flex-1 min-w-0 h-11 px-3 rounded-lg border bg-background" />
          <button type="submit" className="px-4 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[14px]">Aç</button>
        </form>
        {err && key && <p className="text-[14px] text-loss mt-2">{err}</p>}
      </section>
    )
  }

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <div className="p-5 pb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 eyebrow"><Lock className="w-3.5 h-3.5" /> Takım paneli</div>
          <button onClick={() => { setKey(''); setRes(null); try { localStorage.removeItem('1337-panel') } catch { /* */ } }} className="text-[13px] underline underline-offset-2 text-muted-foreground">Çık</button>
        </div>
        <label htmlFor="panel-mac" className="sr-only">Maç</label>
        <select id="panel-mac" value={mac} onChange={e => setMac(e.target.value)} className="w-full h-10 px-2 rounded-lg border bg-background text-[14px] font-semibold">
          {options.map(m => <option key={m.id} value={m.id}>{m.home.name} – {m.away.name} · {fmtDate(m.date)}</option>)}
        </select>
        <div className="flex gap-2 flex-wrap">
          <span className="font-data font-bold text-[14px] px-2.5 py-1 rounded-md bg-clubink text-club num">{res.toplam} oy</span>
          {votes[0] && <span className="font-data font-semibold text-[14px] px-2.5 py-1 rounded-md bg-muted num">Son oy: {saat(votes[0].zaman)}</span>}
        </div>
      </div>

      {res.toplam === 0 ? (
        <p className="px-5 pb-5 text-muted-foreground">Bu maç için henüz oy yok.</p>
      ) : (
        <>
          {saha && (
            <div ref={sahaRef} className="px-5 scroll-mt-20">
              {saha.tip === 'ortak' ? (
                <>
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="font-display text-[24px] leading-none">Taraftarın 11'i</h3>
                    <span className="font-display text-[20px]">{saha.f} <span className="font-data text-[14px] text-muted-foreground num">%{pct(saha.n, res.toplam)}</span></span>
                  </div>
                  {/* Diğer dizilişleri seçenlerin 11'i de görülebilsin */}
                  {dizilisler.length > 1 && (
                    <div className="flex gap-1.5 flex-wrap mb-3" role="tablist" aria-label="Diziliş">
                      {dizilisler.map(([f, n]) => (
                        <button key={f} role="tab" aria-selected={f === saha.f} onClick={() => goster({ tip: 'ortak', f })}
                          className={cn('px-2.5 py-1 rounded-md border font-display text-[16px] tracking-wide', f === saha.f ? 'bg-clubink text-club border-clubink' : 'bg-background')}>
                          {f} <span className="font-data text-[12px] num opacity-80">{n} oy</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <Saha slots={saha.slots} dizilis={saha.f} F={F} payda={saha.n} />
                  <p className="text-[13px] text-muted-foreground mt-2">Her pozisyonda, {saha.f} seçenlerin o pozisyona en çok koyduğu oyuncu. Tek tek oylar aşağıda; birine dokununca sahada görünür.</p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-[24px] leading-none">Bir taraftarın 11'i</h3>
                      <p className="text-[13px] text-muted-foreground mt-1 num">{saha.f} · {saat(saha.v.zaman)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button aria-label="Önceki oy" disabled={gorunum.tip === 'oy' && gorunum.i === 0} onClick={() => gorunum.tip === 'oy' && goster({ tip: 'oy', i: gorunum.i - 1 })} className="p-1.5 rounded-md border disabled:opacity-40"><ChevronLeft className="w-5 h-5" /></button>
                      <span className="font-data text-[14px] num w-[52px] text-center">{gorunum.tip === 'oy' ? gorunum.i + 1 : 0}/{votes.length}</span>
                      <button aria-label="Sonraki oy" disabled={gorunum.tip === 'oy' && gorunum.i >= votes.length - 1} onClick={() => gorunum.tip === 'oy' && goster({ tip: 'oy', i: gorunum.i + 1 })} className="p-1.5 rounded-md border disabled:opacity-40"><ChevronRight className="w-5 h-5" /></button>
                    </div>
                  </div>
                  <Saha slots={saha.slots} dizilis={saha.f} F={F} />
                  <button onClick={() => goster({ tip: 'ortak' })} className="mt-2 text-[14px] font-semibold underline underline-offset-2">Taraftarın 11'ine dön</button>
                </>
              )}
            </div>
          )}

          <div className="p-5 grid gap-6">
            <div>
              <div className="eyebrow mb-2">Dizilişler</div>
              <div className="flex flex-col gap-1">
                {sirali(res.dizilisler).map(([k, n]) => (
                  <button key={k} disabled={!F[k]} onClick={() => goster({ tip: 'ortak', f: k })}
                    className={cn('grid grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-3 px-1.5 py-1 rounded-md text-left', saha?.tip === 'ortak' && saha.f === k ? 'bg-muted' : 'hover:bg-muted/60')}>
                    <span className="font-display text-[17px]">{k}</span>
                    <span className="h-2.5 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-club" style={{ width: `${pct(n, res.toplam)}%` }} /></span>
                    <span className="text-right text-[14px] num"><b>%{pct(n, res.toplam)}</b> <span className="text-muted-foreground">{n}</span></span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="eyebrow mb-2">Mevki mevki</div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                {(['K', 'S', 'O', 'F'] as Pos[]).map(g => (
                  <div key={g} className="min-w-0">
                    <div className="font-semibold text-[15px] mb-1">{POS_LABEL[g]}</div>
                    <ol className="flex flex-col gap-1.5">
                      {sirali(res.mevkiler[g]).slice(0, g === 'K' ? 3 : 6).map(([sl, n]) => (
                        <li key={sl} className="grid grid-cols-[minmax(0,1fr)_42px] items-center gap-2 text-[14px]">
                          <span className="min-w-0">
                            <span className="block truncate">{playerBySlug(sl)?.name ?? sl}</span>
                            <span className="block h-1.5 mt-0.5 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-club" style={{ width: `${pct(n, res.toplam)}%` }} /></span>
                          </span>
                          <span className="text-right num font-semibold">%{pct(n, res.toplam)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>

            {votes.length > 0 && (
              <div>
                <div className="eyebrow mb-2">Tüm oylar · {votes.length}</div>
                <ol className="flex flex-col divide-y border rounded-lg overflow-hidden">
                  {(hepsi ? votes : votes.slice(0, 8)).map((v, i) => {
                    const secili = gorunum.tip === 'oy' && gorunum.i === i
                    return (
                      <li key={i}>
                        <button onClick={() => goster({ tip: 'oy', i })} aria-pressed={secili}
                          className={cn('w-full px-3 py-2 text-[13.5px] flex gap-3 min-w-0 text-left', secili ? 'bg-club/15' : 'hover:bg-muted/60')}>
                          <span className="shrink-0 font-display text-[15px] w-[58px]">{v.dizilis}</span>
                          <span className="min-w-0 flex-1 text-muted-foreground line-clamp-2">{v.sira.map(shortName).join(' · ')}</span>
                          <span className="shrink-0 text-[12px] text-muted-foreground num">{saat(v.zaman)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
                {votes.length > 8 && (
                  <button onClick={() => setHepsi(!hepsi)} className="mt-2 text-[14px] font-semibold underline underline-offset-2">{hepsi ? 'Daha az göster' : `Tümünü göster (${votes.length})`}</button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
