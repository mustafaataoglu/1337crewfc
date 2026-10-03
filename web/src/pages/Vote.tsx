import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Share2, X } from 'lucide-react'
import type { Player, Pos } from '@/types'
import { data, squad, fmtDate, upcoming, kickoff, POS_LABEL } from '@/lib/site'
import { Avatar, SectionTitle } from '@/components/bits'
import { cn } from '@/lib/utils'
import { hungarian } from '@/lib/assign'
import VotePanel from '@/pages/VotePanel'
import { deviceId } from '@/lib/cihaz'
import { F, EFSANE } from '@/lib/dizilis'
import type { Slot } from '@/lib/oneri'
import { kadroGorseli, gorselPaylas } from '@/lib/paylas'

type Anchor = { x: number; y: number; g: Pos }
type Saved = { f: string; xi: (string | null)[]; anchors?: Record<string, Anchor>; sent?: boolean; mac?: string }
type Mod = 'mac' | 'efsane'
// Sıradaki maçın 11'i güncel kadrodan, tüm zamanların 11'i eski ve yeni bütün oyunculardan kurulur
const HAVUZ: Record<Mod, Player[]> = { mac: squad, efsane: data.players }
const KEY: Record<Mod, string> = { mac: '1337-vote-v2', efsane: '1337-efsane-v1' }

function autoPick(f: string, havuz: Player[]): (string | null)[] {
  const used = new Set<string>()
  const pool = (g: Pos) => havuz.filter(p => p.pos === g).sort((a, b) => b.career.m - a.career.m)
  return F[f].map(s => {
    const p = pool(s.g).find(x => !used.has(x.slug))
    if (p) used.add(p.slug)
    return p?.slug ?? null
  })
}

// Kayıtlı kadroyu doğrula: geçersiz dizilişi varsayılana çevir, havuzdan çıkan oyuncuyu boşalt
function load(mod: Mod): Saved | null {
  try {
    const r = localStorage.getItem(KEY[mod])
    if (!r) return null
    const s = JSON.parse(r) as Saved
    if (!F[s.f] || !Array.isArray(s.xi) || s.xi.length !== F[s.f].length) return null
    const inPool = new Set(HAVUZ[mod].map(p => p.slug))
    s.xi = s.xi.map(x => (x && inPool.has(x) ? x : null))
    return s
  } catch { return null }
}
const LINE: Record<Pos, number> = { K: 0, S: 1, O: 2, F: 3 }
// Bir oyuncuyu "çapa" noktasından (kullanıcının onu koyduğu yer) yeni slota taşımanın maliyeti
const moveCost = (a: Anchor, b: Slot) =>
  ((a.g === 'K') !== (b.g === 'K') ? 1000 : 0) + Math.hypot(a.x - b.x, a.y - b.y) + 25 * Math.abs(LINE[a.g] - LINE[b.g])
const anchorsOf = (f: string, xi: (string | null)[], prev: Record<string, Anchor> = {}) => {
  const out: Record<string, Anchor> = {}
  xi.forEach((sl, i) => { if (sl) out[sl] = prev[sl] ?? { x: F[f][i].x, y: F[f][i].y, g: F[f][i].g } })
  return out
}

export default function Vote({ mod = 'mac' }: { mod?: Mod }) {
  const efsane = mod === 'efsane'
  const next = efsane ? undefined : upcoming[0]
  const macId = efsane ? EFSANE : next?.id
  const havuz = HAVUZ[mod]
  const saved = useMemo(() => load(mod), [mod])
  const [f, setF] = useState(saved?.f ?? '4-2-3-1')
  const [xi, setXi] = useState<(string | null)[]>(saved?.xi ?? autoPick('4-2-3-1', havuz))
  // Her oyuncunun kullanıcının onu yerleştirdiği nokta. Taktik değişse de korunur,
  // böylece dizilişler arasında gidip gelince kadro kaymaz ve eski haline döner.
  const [anchors, setAnchors] = useState<Record<string, Anchor>>(() => anchorsOf(saved?.f ?? '4-2-3-1', saved?.xi ?? autoPick('4-2-3-1', havuz), saved?.anchors))
  // "Oy verildi" bilgisi maça özel: önceki maça verilen oy sıradaki maçı kilitlemesin
  const [sent, setSent] = useState(!!saved?.sent && !!macId && saved?.mac === macId)
  const [pick, setPick] = useState<number | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  // Telefonda oyuncu listesi sahanın altında açılır: görünür olsun diye oraya kaydır
  useEffect(() => { if (pick !== null && innerWidth < 1024) pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [pick])
  // Maç saati geldiğinde açık sayfada da oylama kapansın
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t) }, [])
  const bySlug = (s: string | null) => (s ? havuz.find(p => p.slug === s) : undefined)
  const filled = xi.filter(Boolean).length

  // Taktik değişince aynı 11 kalır, kimse eklenmez ya da çıkarılmaz. 11 oyuncu birlikte,
  // çapa noktalarından en az kaydırmayla yeni slotlara yerleştirilir (Macar algoritması).
  const changeF = (nf: string) => {
    const to = F[nf]
    const players = xi.filter((s): s is string => !!s)
    const C = to.map((_, r) => (r < players.length ? to.map(b => moveCost(anchors[players[r]], b)) : to.map(() => 0)))
    const res = hungarian(C)
    const out: (string | null)[] = to.map(() => null)
    players.forEach((p, r) => { out[res[r]] = p })
    setF(nf); setXi(out); setSent(false)
  }
  // Kurulan kadro her değişiklikte bu tarayıcıya kaydedilir; sayfa yenilenince kaybolmaz.
  useEffect(() => {
    try { localStorage.setItem(KEY[mod], JSON.stringify({ f, xi, anchors, sent, mac: macId })) } catch { /* depolama kapalı */ }
  }, [mod, f, xi, anchors, sent, macId])

  const choose = (slug: string) => {
    if (pick === null) return
    const cur = xi.indexOf(slug)
    const n = [...xi]
    if (cur >= 0) n[cur] = xi[pick]
    n[pick] = slug
    // Elle yerleştirilen oyuncuların çapası yeni yerleri olur
    const slot = (i: number): Anchor => ({ x: F[f][i].x, y: F[f][i].y, g: F[f][i].g })
    const nextA: Record<string, Anchor> = {}
    n.forEach(sl => { if (sl && anchors[sl]) nextA[sl] = anchors[sl] })
    nextA[slug] = slot(pick)
    if (cur >= 0 && n[cur]) nextA[n[cur]!] = slot(cur)
    setAnchors(nextA); setXi(n); setPick(null); setSent(false)
  }
  const [sending, setSending] = useState(false)
  // Her başarılı gönderimde sonuçlar yeniden çekilir (oy veren sonuçları görür)
  const [gonderim, setGonderim] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const closed = efsane ? false : next ? now >= kickoff(next).getTime() : true
  // Oy sunucuya gider: cihaz başına tek oy (yeniden gönderilirse günceller)
  const send = async () => {
    if (!macId) return
    setSending(true); setErr(null)
    try {
      const r = await fetch('api/oy.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac: macId, dizilis: f, xi: F[f].map((s, i) => ({ slot: s.label, g: s.g, oyuncu: xi[i] })), cihaz: deviceId() }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.hata || `Sunucu hatası (${r.status})`)
      setSent(true)
      setGonderim(n => n + 1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSending(false) }
  }
  const [paylasiliyor, setPaylasiliyor] = useState(false)
  const paylas = async () => {
    setPaylasiliyor(true)
    try {
      const blob = await kadroGorseli({
        baslik: efsane ? "Tüm zamanların 11'i" : next ? `${next.home.name} – ${next.away.name}` : "Senin 11'in",
        alt: efsane ? "Benim tüm zamanlar 11'im" : next ? `Benim 11'im · ${fmtDate(next.date, true)} ${next.time}` : "Benim 11'im",
        dizilis: f, slots: F[f], oyuncular: xi.map(s => { const p = bySlug(s); return p ? { isim: p.short } : null }),
      })
      await gorselPaylas(blob, efsane ? '1337-tum-zamanlar-11.png' : '1337-benim-11im.png', "1337 Crew FC · 1337crewfc.com")
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setPaylasiliyor(false) }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] gap-8">
      <div className="min-w-0">
        <SectionTitle>{efsane ? "Tüm zamanların 11'i" : "Senin 11'in"}</SectionTitle>
        {efsane
          ? <p className="text-[15px] -mt-1 mb-4">1337 Crew FC'de forma giymiş eski ve yeni bütün oyuncular arasından.</p>
          : next && <p className="text-[15px] -mt-1 mb-4"><b>{next.home.name} – {next.away.name}</b> · {fmtDate(next.date, true)} {next.time}. Oylama maç saatinde kapanır.</p>}

        <div className="flex gap-1.5 flex-wrap mb-3" role="radiogroup" aria-label="Diziliş">
          {Object.keys(F).map(k => (
            <button key={k} role="radio" aria-checked={k === f} onClick={() => changeF(k)}
              className={cn('px-3 py-1.5 rounded-md font-display text-[17px] tracking-wide border', k === f ? 'bg-clubink text-club border-clubink' : 'bg-card')}>{k}</button>
          ))}
        </div>

        <div className="relative w-full aspect-[100/128] rounded-xl overflow-hidden stripes border border-black/20">
          <span className="absolute inset-x-0 top-1/2 border-t-2 border-white/50" />
          <span className="absolute left-1/2 top-1/2 w-[26%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/50" />
          <span className="absolute left-[22%] right-[22%] bottom-0 h-[14%] border-2 border-b-0 border-white/50" />
          <span className="absolute left-[22%] right-[22%] top-0 h-[14%] border-2 border-t-0 border-white/50" />
          {F[f].map((s, i) => {
            const p = bySlug(xi[i])
            return (
              <button key={f + i} onClick={() => setPick(i)} aria-label={`${s.label}: ${p?.name ?? 'boş'}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 transition-[left,top] duration-500"
                style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                {p ? <Avatar p={p} size={46} /> : <span className="w-[46px] h-[46px] rounded-full border-2 border-dashed border-white/80 bg-black/20 grid place-items-center text-white font-data font-bold text-[12px]">{s.label}</span>}
                <span className={cn('text-[12px] font-semibold text-white whitespace-nowrap [text-shadow:0_1px_2px_rgba(0,0,0,.8)]', pick === i && 'bg-club text-clubink [text-shadow:none] px-1.5 rounded')}>
                  {p ? p.short : 'Seç'}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <button onClick={send} disabled={filled < 11 || sent || sending || closed}
            className="px-5 py-3 rounded-lg bg-club text-clubink font-data font-bold uppercase tracking-wider text-[15px] disabled:opacity-60 flex items-center gap-2">
            {closed ? 'Oylama kapandı' : sent ? <><Check className="w-4 h-4" /> Oyun kaydedildi</> : sending ? 'Gönderiliyor…' : `Oyumu gönder (${filled}/11)`}
          </button>
          {sent && !closed && <button onClick={() => setSent(false)} className="text-[14px] font-semibold underline underline-offset-2">Değiştir</button>}
          <button onClick={paylas} disabled={filled < 11 || paylasiliyor} className="ml-auto px-3 py-2.5 rounded-lg border font-data font-bold uppercase tracking-wider text-[14px] flex items-center gap-2 disabled:opacity-50">
            <Share2 className="w-4 h-4" /> {paylasiliyor ? 'Hazırlanıyor…' : 'Paylaş'}
          </button>
        </div>
        {err && <p className="text-[14px] text-loss mt-2 font-semibold">{err}</p>}
        <p className="text-[13px] text-muted-foreground mt-2">Her cihaz {efsane ? 'bir' : 'maç başına bir'} oy verir; tekrar gönderirsen oyun güncellenir.{efsane ? '' : ' Oylama maç saatinde kapanır.'}</p>
      </div>

      <div className="min-w-0">
        <div ref={pickerRef} className="scroll-mt-20" />
        {pick !== null ? (
          <Picker slot={F[f][pick]} current={xi} havuz={havuz} onChoose={choose} onClose={() => setPick(null)} />
        ) : (
          <VotePanel F={F} gonderim={gonderim} efsane={efsane} />
        )}
      </div>
    </div>
  )
}

function Picker({ slot, current, havuz, onChoose, onClose }: { slot: Slot; current: (string | null)[]; havuz: Player[]; onChoose: (s: string) => void; onClose: () => void }) {
  const order: Pos[] = [slot.g, ...(['K', 'S', 'O', 'F'] as Pos[]).filter(g => g !== slot.g)]
  return (
    <section className="rounded-xl border bg-card p-4 lg:sticky lg:top-20">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-[22px]">{slot.label} için oyuncu seç</h3>
        <button onClick={onClose} aria-label="Kapat" className="p-1.5 rounded-md hover:bg-muted"><X className="w-5 h-5" /></button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto pr-1 flex flex-col gap-4">
        {order.map(g => (
          <div key={g}>
            <div className="eyebrow mb-1.5">{POS_LABEL[g]}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {havuz.filter(p => p.pos === g).sort((a, b) => b.career.m - a.career.m).map((p: Player) => {
                const inXI = current.includes(p.slug)
                return (
                  <button key={p.slug} onClick={() => onChoose(p.slug)}
                    className={cn('flex items-center gap-2.5 p-2 rounded-lg border text-left min-w-0', inXI ? 'border-club bg-club/10' : 'hover:border-club')}>
                    <Avatar p={p} size={36} ring={false} />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold truncate">{p.name}</span>
                      <span className="block text-[12px] text-muted-foreground num">{inXI ? 'Kadroda · yer değiştir' : `${p.career.m} maç · ${p.career.g}G ${p.career.a}A${p.former ? ' · eski' : ''}`}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
