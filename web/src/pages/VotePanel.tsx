import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock, Share2 } from 'lucide-react'
import type { Pos } from '@/types'
import { played, upcoming, acikMac, fmtDate, playerBySlug, POS_LABEL } from '@/lib/site'
import { Avatar } from '@/components/bits'
import { cn } from '@/lib/utils'
import { deviceId } from '@/lib/cihaz'
import { oneri, ortak11, oy11, sirali, type Slot, type Sonuc, type Yer } from '@/lib/oneri'
import { EFSANE } from '@/lib/dizilis'
import { kadroGorseli, gorselPaylas } from '@/lib/paylas'

// Sahada ne gösteriliyor: önerilen 11, bir dizilişi seçenlerin ortak 11'i ya da tek bir oy
type Gorunum = { tip: 'oneri' } | { tip: 'ortak'; f: string } | { tip: 'oy'; i: number }

const pct = (n: number, d: number) => Math.round((n / Math.max(1, d)) * 100)
const saat = (z: string) => { const d = new Date(z); return isNaN(+d) ? '' : d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
const shortName = (slug: string) => playerBySlug(slug)?.short ?? slug
const KISA: Record<Pos, string> = { K: 'KL', S: 'DEF', O: 'OS', F: 'FV' }

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

// Taraftar oylamasının sonuçları. Oylar anonimdir; oylama sürerken sonuçları bu maça oy veren görür
// (önde giden kopyalanmasın), maç saatinde oylama kapanınca herkes görür.
export default function VotePanel({ F, gonderim = 0, efsane = false }: { F: Record<string, Slot[]>; gonderim?: number; efsane?: boolean }) {
  // Sıradaki maç ve son oynanan 3 maç: oylama kapandıktan sonra da sonuçlar görülebilsin. Tüm zamanların 11'i tek bir oylama.
  const options = efsane
    ? [{ id: EFSANE, label: "Tüm zamanların 11'i" }]
    : [...upcoming.slice(0, 2), ...played.slice(0, 3)].map(m => ({ id: m.id, label: `${m.home.name} – ${m.away.name} · ${fmtDate(m.date)}` }))
  const [mac, setMac] = useState(efsane ? EFSANE : (acikMac()?.id ?? options[0]?.id))
  const [res, setRes] = useState<Sonuc | null>(null)
  const [kapandi, setKapandi] = useState(false)
  const [kilit, setKilit] = useState<number | null>(null) // kilitliyse şimdiye kadarki oy sayısı
  const [err, setErr] = useState<string | null>(null)
  const [hepsi, setHepsi] = useState(false)
  const [gorunum, setGorunum] = useState<Gorunum>({ tip: 'oneri' })
  const sahaRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!mac) return
    setGorunum({ tip: 'oneri' })
    const h: Record<string, string> = { 'X-Cihaz': deviceId() }
    // Takım paneli anahtarı daha önce bu tarayıcıya kaydedildiyse hâlâ geçerlidir
    try { const k = localStorage.getItem('1337-panel'); if (k) h['X-Panel-Anahtar'] = k } catch { /* depolama kapalı */ }
    fetch(`api/oy.php?mac=${encodeURIComponent(mac)}`, { headers: h })
      .then(r => r.json())
      .then(j => {
        if (j.ok) { setRes(j.sonuc); setKapandi(!!j.kapandi); setKilit(null); setErr(null) }
        else if (j.kilitli) { setRes(null); setKilit(j.toplam ?? 0); setErr(null) }
        else { setRes(null); setKilit(null); setErr(j.hata ?? 'Sonuçlar alınamadı') }
      })
      .catch(() => setErr('Sunucuya ulaşılamadı'))
  }, [mac, gonderim])

  const dizilisler = useMemo(() => (res ? sirali(res.dizilisler).filter(([f]) => F[f]) : []), [res, F])
  const votes = useMemo(() => (res?.oylar ?? []).filter(v => F[v.dizilis] && Array.isArray(v.sira)), [res, F])
  const oner = useMemo(() => (res ? oneri(res, F) : null), [res, F])
  const saha = useMemo(() => {
    if (!res) return null
    if (gorunum.tip === 'oy') {
      const v = votes[gorunum.i]
      return v ? { tip: 'oy' as const, f: v.dizilis, slots: oy11(v, F), v } : null
    }
    if (gorunum.tip === 'ortak' && F[gorunum.f]) return { tip: 'ortak' as const, f: gorunum.f, n: res.dizilisler[gorunum.f] ?? 0, slots: ortak11(res, F, gorunum.f) }
    return oner ? { tip: 'oneri' as const, ...oner } : null
  }, [res, gorunum, votes, oner, F])
  // Telefonda liste sahanın altında kalır: seçim yapılınca sahaya kaydır
  const goster = (g: Gorunum) => {
    setGorunum(g)
    if (innerWidth < 1024) requestAnimationFrame(() => sahaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const macSecici = options.length > 1 && (
    <>
      <label htmlFor="panel-mac" className="sr-only">Maç</label>
      <select id="panel-mac" value={mac} onChange={e => setMac(e.target.value)} className="w-full h-10 px-2 rounded-lg border bg-background text-[14px] font-semibold">
        {options.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
    </>
  )
  const [paylasiliyor, setPaylasiliyor] = useState(false)
  const paylas = async () => {
    if (!oner || !res) return
    setPaylasiliyor(true)
    try {
      const blob = await kadroGorseli({
        baslik: efsane ? "Taraftarın tüm zamanlar 11'i" : 'Taraftarın önerdiği 11',
        alt: `${options.find(o => o.id === mac)?.label ?? ''} · ${res.toplam} oy`.replace(/^ · /, ''),
        dizilis: oner.f, slots: F[oner.f],
        oyuncular: oner.slots.map(c => (c ? { isim: shortName(c.slug), alt: `%${pct(c.n ?? 0, res.toplam)}` } : null)),
        yedekler: oner.yedek.map(y => shortName(y.slug)),
      })
      await gorselPaylas(blob, efsane ? '1337-taraftar-tum-zamanlar.png' : '1337-taraftarin-11i.png', '1337 Crew FC · 1337crewfc.com')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setPaylasiliyor(false) }
  }

  if (!res) {
    return (
      <section className="rounded-xl border bg-card p-5 flex flex-col gap-3">
        <div className="eyebrow">Taraftar oylaması</div>
        <h3 className="font-display text-[24px] leading-none">Taraftarın 11'i</h3>
        {macSecici}
        {kilit !== null && (
          <div className="flex items-start gap-3 rounded-lg bg-muted p-3">
            <Lock className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-[14px]"><b className="num">{kilit} oy</b> verildi. Sonuçlar oyunu gönderince açılır.</p>
          </div>
        )}
        {err && <p className="text-[14px] text-loss">{err}</p>}
      </section>
    )
  }

  const baslik = saha?.tip === 'oneri' ? 'Önerilen 11' : saha?.tip === 'ortak' ? `${saha.f} seçenlerin 11'i` : "Bir taraftarın 11'i"
  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <div className="p-5 pb-4 flex flex-col gap-3">
        <div className="eyebrow">Taraftar oylaması</div>
        {macSecici}
        <div className="flex gap-2 flex-wrap">
          <span className="font-data font-bold text-[14px] px-2.5 py-1 rounded-md bg-clubink text-club num">{res.toplam} oy</span>
          {kapandi && <span className="font-data font-semibold text-[14px] px-2.5 py-1 rounded-md bg-muted">Oylama kapandı</span>}
          {votes[0] && <span className="font-data font-semibold text-[14px] px-2.5 py-1 rounded-md bg-muted num">Son oy: {saat(votes[0].zaman)}</span>}
        </div>
      </div>

      {res.toplam === 0 ? (
        <p className="px-5 pb-5 text-muted-foreground">Bu maç için henüz oy yok.</p>
      ) : (
        <>
          {saha && (
            <div ref={sahaRef} className="px-5 scroll-mt-20">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <h3 className="font-display text-[24px] leading-none">{baslik}</h3>
                  {saha.tip === 'oy' && <p className="text-[13px] text-muted-foreground mt-1 num">{saha.f} · {saat(saha.v.zaman)}</p>}
                </div>
                {saha.tip === 'oy' && gorunum.tip === 'oy' ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button aria-label="Önceki oy" disabled={gorunum.i === 0} onClick={() => goster({ tip: 'oy', i: gorunum.i - 1 })} className="p-1.5 rounded-md border disabled:opacity-40"><ChevronLeft className="w-5 h-5" /></button>
                    <span className="font-data text-[14px] num w-[52px] text-center">{gorunum.i + 1}/{votes.length}</span>
                    <button aria-label="Sonraki oy" disabled={gorunum.i >= votes.length - 1} onClick={() => goster({ tip: 'oy', i: gorunum.i + 1 })} className="p-1.5 rounded-md border disabled:opacity-40"><ChevronRight className="w-5 h-5" /></button>
                  </div>
                ) : saha.tip !== 'oy' && (
                  <span className="font-display text-[20px] shrink-0">{saha.f} <span className="font-data text-[14px] text-muted-foreground num">%{pct(saha.tip === 'oneri' ? saha.nF : saha.n, res.toplam)}</span></span>
                )}
              </div>
              {/* Önerilen 11 ya da bir dizilişi seçenlerin 11'i */}
              {saha.tip !== 'oy' && (
                <div className="flex gap-1.5 flex-wrap mb-3" role="tablist" aria-label="Görünüm">
                  <button role="tab" aria-selected={saha.tip === 'oneri'} onClick={() => goster({ tip: 'oneri' })}
                    className={cn('px-2.5 py-1 rounded-md border font-data font-bold text-[13px] uppercase tracking-wider', saha.tip === 'oneri' ? 'bg-club text-clubink border-club' : 'bg-background')}>Önerilen</button>
                  {dizilisler.map(([f, n]) => (
                    <button key={f} role="tab" aria-selected={saha.tip === 'ortak' && f === saha.f} onClick={() => goster({ tip: 'ortak', f })}
                      className={cn('px-2.5 py-1 rounded-md border font-display text-[16px] tracking-wide', saha.tip === 'ortak' && f === saha.f ? 'bg-clubink text-club border-clubink' : 'bg-background')}>
                      {f} <span className="font-data text-[12px] num opacity-80">{n} oy</span>
                    </button>
                  ))}
                </div>
              )}
              <Saha slots={saha.slots} dizilis={saha.f} F={F} payda={saha.tip === 'oneri' ? res.toplam : saha.tip === 'ortak' ? saha.n : undefined} />
              {saha.tip === 'oneri' && saha.yedek.length > 0 && (
                <div className="mt-3">
                  <div className="eyebrow mb-2">Yedekler</div>
                  <ol className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {saha.yedek.map(y => {
                      const p = playerBySlug(y.slug)
                      return (
                        <li key={y.slug} className="flex items-center gap-2 min-w-0 rounded-lg border p-1.5">
                          {p && <Avatar p={p} size={30} ring={false} />}
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold truncate">{p?.short ?? y.slug}</span>
                            <span className="block text-[11.5px] text-muted-foreground num">{KISA[y.g]} · %{pct(y.n, res.toplam)}</span>
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )}
              {saha.tip === 'oneri' && (
                <button onClick={paylas} disabled={paylasiliyor} className="mt-3 px-3 py-2 rounded-lg border font-data font-bold uppercase tracking-wider text-[14px] flex items-center gap-2 disabled:opacity-50">
                  <Share2 className="w-4 h-4" /> {paylasiliyor ? 'Hazırlanıyor…' : "Taraftarın 11'ini paylaş"}
                </button>
              )}
              {saha.tip === 'oy' && <button onClick={() => goster({ tip: 'oneri' })} className="mt-2 text-[14px] font-semibold underline underline-offset-2">Önerilen 11'e dön</button>}
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
                      {sirali(res.mevkiler[g]).map(([sl, n]) => (
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
                <div className="eyebrow mb-2">{votes.length < res.toplam ? `Son ${votes.length} oy` : `Tüm oylar · ${votes.length}`}</div>
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
                  <button onClick={() => setHepsi(!hepsi)} className="mt-2 text-[14px] font-semibold underline underline-offset-2">{hepsi ? 'Daha az göster' : `${votes.length < res.toplam ? 'Son' : 'Tümünü göster'} ${votes.length < res.toplam ? `${votes.length} oyu göster` : `(${votes.length})`}`}</button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
