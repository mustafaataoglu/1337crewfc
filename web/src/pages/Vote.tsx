import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Lock, X } from 'lucide-react'
import type { Player, Pos } from '@/types'
import { squad, fmtDate, upcoming, played, kickoff, POS_LABEL } from '@/lib/site'
import { Avatar, SectionTitle } from '@/components/bits'
import { cn } from '@/lib/utils'
import { hungarian } from '@/lib/assign'

type Slot = { x: number; y: number; g: Pos; label: string }
const RAW: Record<string, [number, number, Pos, string][]> = {
  '4-2-3-1': [[50, 90, 'K', 'KL'], [15, 72, 'S', 'SLB'], [38, 76, 'S', 'STP'], [62, 76, 'S', 'STP'], [85, 72, 'S', 'SĞB'], [36, 57, 'O', 'ÖL'], [64, 57, 'O', 'ÖL'], [16, 37, 'O', 'SLK'], [50, 39, 'O', '10'], [84, 37, 'O', 'SĞK'], [50, 15, 'F', 'FV']],
  '4-3-3': [[50, 90, 'K', 'KL'], [15, 72, 'S', 'SLB'], [38, 76, 'S', 'STP'], [62, 76, 'S', 'STP'], [85, 72, 'S', 'SĞB'], [50, 58, 'O', 'ÖL'], [28, 48, 'O', 'OS'], [72, 48, 'O', 'OS'], [18, 22, 'F', 'SLA'], [50, 15, 'F', 'FV'], [82, 22, 'F', 'SĞA']],
  '4-4-2': [[50, 90, 'K', 'KL'], [15, 72, 'S', 'SLB'], [38, 76, 'S', 'STP'], [62, 76, 'S', 'STP'], [85, 72, 'S', 'SĞB'], [15, 46, 'O', 'SLO'], [38, 51, 'O', 'OS'], [62, 51, 'O', 'OS'], [85, 46, 'O', 'SĞO'], [36, 17, 'F', 'FV'], [64, 17, 'F', 'FV']],
  '3-5-2': [[50, 90, 'K', 'KL'], [27, 75, 'S', 'STP'], [50, 78, 'S', 'STP'], [73, 75, 'S', 'STP'], [10, 50, 'O', 'SLK'], [35, 55, 'O', 'OS'], [50, 44, 'O', '10'], [65, 55, 'O', 'OS'], [90, 50, 'O', 'SĞK'], [36, 17, 'F', 'FV'], [64, 17, 'F', 'FV']],
  '3-4-3': [[50, 90, 'K', 'KL'], [27, 75, 'S', 'STP'], [50, 78, 'S', 'STP'], [73, 75, 'S', 'STP'], [13, 50, 'O', 'SLK'], [38, 54, 'O', 'OS'], [62, 54, 'O', 'OS'], [87, 50, 'O', 'SĞK'], [20, 22, 'F', 'SLA'], [50, 15, 'F', 'FV'], [80, 22, 'F', 'SĞA']],
  '5-3-2': [[50, 90, 'K', 'KL'], [9, 66, 'S', 'SLKB'], [30, 75, 'S', 'STP'], [50, 78, 'S', 'STP'], [70, 75, 'S', 'STP'], [91, 66, 'S', 'SĞKB'], [28, 48, 'O', 'OS'], [50, 52, 'O', 'ÖL'], [72, 48, 'O', 'OS'], [36, 17, 'F', 'FV'], [64, 17, 'F', 'FV']],
}
const F: Record<string, Slot[]> = Object.fromEntries(
  Object.entries(RAW).map(([k, v]) => [k, v.map(([x, y, g, label]) => ({ x, y, g, label }))]),
)

function autoPick(f: string): (string | null)[] {
  const used = new Set<string>()
  const pool = (g: Pos) => squad.filter(p => p.pos === g).sort((a, b) => b.career.m - a.career.m)
  return F[f].map(s => {
    const p = pool(s.g).find(x => !used.has(x.slug))
    if (p) used.add(p.slug)
    return p?.slug ?? null
  })
}

type Anchor = { x: number; y: number; g: Pos }
type Saved = { f: string; xi: (string | null)[]; anchors?: Record<string, Anchor>; sent?: boolean; mac?: string }
const KEY = '1337-vote-v2'
// Kayıtlı kadroyu doğrula: geçersiz dizilişi varsayılana çevir, kadrodan çıkan oyuncuyu boşalt
function load(): Saved | null {
  try {
    const r = localStorage.getItem(KEY)
    if (!r) return null
    const s = JSON.parse(r) as Saved
    if (!F[s.f] || !Array.isArray(s.xi) || s.xi.length !== F[s.f].length) return null
    const inSquad = new Set(squad.map(p => p.slug))
    s.xi = s.xi.map(x => (x && inSquad.has(x) ? x : null))
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

export default function Vote() {
  const next = upcoming[0]
  const saved = useMemo(load, [])
  const [f, setF] = useState(saved?.f ?? '4-2-3-1')
  const [xi, setXi] = useState<(string | null)[]>(saved?.xi ?? autoPick('4-2-3-1'))
  // Her oyuncunun kullanıcının onu yerleştirdiği nokta. Taktik değişse de korunur,
  // böylece dizilişler arasında gidip gelince kadro kaymaz ve eski haline döner.
  const [anchors, setAnchors] = useState<Record<string, Anchor>>(() => anchorsOf(saved?.f ?? '4-2-3-1', saved?.xi ?? autoPick('4-2-3-1'), saved?.anchors))
  // "Oy verildi" bilgisi maça özel: önceki maça verilen oy sıradaki maçı kilitlemesin
  const [sent, setSent] = useState(!!saved?.sent && !!next && saved?.mac === next.id)
  const [pick, setPick] = useState<number | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  // Telefonda oyuncu listesi sahanın altında açılır: görünür olsun diye oraya kaydır
  useEffect(() => { if (pick !== null && innerWidth < 1024) pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [pick])
  // Maç saati geldiğinde açık sayfada da oylama kapansın
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t) }, [])
  const bySlug = (s: string | null) => (s ? squad.find(p => p.slug === s) : undefined)
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
    try { localStorage.setItem(KEY, JSON.stringify({ f, xi, anchors, sent, mac: next?.id })) } catch { /* depolama kapalı */ }
  }, [f, xi, anchors, sent, next?.id])

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
  const [err, setErr] = useState<string | null>(null)
  const closed = next ? now >= kickoff(next).getTime() : true
  // Oy sunucuya gider: cihaz başına maç başına tek oy (yeniden gönderilirse günceller)
  const send = async () => {
    if (!next) return
    setSending(true); setErr(null)
    try {
      const r = await fetch('api/oy.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac: next.id, dizilis: f, xi: F[f].map((s, i) => ({ slot: s.label, g: s.g, oyuncu: xi[i] })), cihaz: deviceId() }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.hata || `Sunucu hatası (${r.status})`)
      setSent(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setSending(false) }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] gap-8">
      <div className="min-w-0">
        <SectionTitle>Senin 11'in</SectionTitle>
        {next && <p className="text-[15px] -mt-1 mb-4"><b>{next.home.name} – {next.away.name}</b> · {fmtDate(next.date, true)} {next.time}. Oylama maç saatinde kapanır.</p>}

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

        <div className="flex items-center gap-3 mt-4">
          <button onClick={send} disabled={filled < 11 || sent || sending || closed}
            className="px-5 py-3 rounded-lg bg-club text-clubink font-data font-bold uppercase tracking-wider text-[15px] disabled:opacity-60 flex items-center gap-2">
            {closed ? 'Oylama kapandı' : sent ? <><Check className="w-4 h-4" /> Oyun kaydedildi</> : sending ? 'Gönderiliyor…' : `Oyumu gönder (${filled}/11)`}
          </button>
          {sent && !closed && <button onClick={() => setSent(false)} className="text-[14px] font-semibold underline underline-offset-2">Değiştir</button>}
        </div>
        {err && <p className="text-[14px] text-loss mt-2 font-semibold">Oy gönderilemedi: {err}</p>}
        <p className="text-[13px] text-muted-foreground mt-2">Her cihaz maç başına bir oy verir; tekrar gönderirsen oyun güncellenir. Oylama maç saatinde kapanır.</p>
      </div>

      <div className="min-w-0">
        <div ref={pickerRef} className="scroll-mt-20" />
        {pick !== null ? (
          <Picker slot={F[f][pick]} current={xi} onChoose={choose} onClose={() => setPick(null)} />
        ) : (
          <TeamPanel f={f} />
        )}
      </div>
    </div>
  )
}

function Picker({ slot, current, onChoose, onClose }: { slot: Slot; current: (string | null)[]; onChoose: (s: string) => void; onClose: () => void }) {
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
              {squad.filter(p => p.pos === g).sort((a, b) => b.career.m - a.career.m).map((p: Player) => {
                const inXI = current.includes(p.slug)
                return (
                  <button key={p.slug} onClick={() => onChoose(p.slug)}
                    className={cn('flex items-center gap-2.5 p-2 rounded-lg border text-left min-w-0', inXI ? 'border-club bg-club/10' : 'hover:border-club')}>
                    <Avatar p={p} size={36} ring={false} />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold truncate">{p.name}</span>
                      <span className="block text-[12px] text-muted-foreground num">{inXI ? 'Kadroda · yer değiştir' : `${p.career.m} maç · ${p.career.g}G ${p.career.a}A`}</span>
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

function deviceId() {
  try {
    let id = localStorage.getItem('1337-cihaz')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('1337-cihaz', id) }
    return id
  } catch { return 'gecici-' + Math.random().toString(36).slice(2) }
}

type Sonuc = { toplam: number; dizilisler: Record<string, number>; oyuncular: Record<string, number>; mevkiler: Record<string, Record<string, number>> }

// Takım paneli: sonuçlar yalnızca panel anahtarıyla görünür (anahtar kurulumda bir kez gösterilir)
function TeamPanel({ f }: { f: string }) {
  // Sıradaki maç ve son oynanan 3 maç: oylama kapandıktan sonra da sonuçlar görülebilsin
  const options = [...(upcoming[0] ? [upcoming[0]] : []), ...played.slice(0, 3)]
  const [mac, setMac] = useState(options[0]?.id)
  const [key, setKey] = useState(() => { try { return localStorage.getItem('1337-panel') ?? '' } catch { return '' } })
  const [input, setInput] = useState('')
  const [res, setRes] = useState<Sonuc | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!key || !mac) return
    fetch(`api/oy.php?mac=${encodeURIComponent(mac)}`, { headers: { 'X-Panel-Anahtar': key } })
      .then(r => r.json())
      .then(j => { if (j.ok) { setRes(j.sonuc); setErr(null) } else { setErr(j.hata ?? 'Anahtar geçersiz'); setRes(null) } })
      .catch(() => setErr('Sunucuya ulaşılamadı'))
  }, [key, mac])
  const save = (e?: React.FormEvent) => { e?.preventDefault(); setKey(input.trim()) }
  // Anahtar ancak sunucu kabul edince hatırlanır
  useEffect(() => { if (res && key) { try { localStorage.setItem('1337-panel', key) } catch { /* depolama kapalı */ } } }, [res, key])
  const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 eyebrow"><Lock className="w-3.5 h-3.5" /> Takım paneli · sadece kulüp görür</div>
      <h3 className="font-display text-[24px] mt-1">Taraftar ne diyor?</h3>
      {!res ? (
        <div className="mt-3">
          <p className="text-[14px] text-muted-foreground">Sonuçları görmek için takım paneli anahtarını gir.</p>
          <form onSubmit={save} className="flex gap-2 mt-3">
            <label htmlFor="panel-anahtar" className="sr-only">Panel anahtarı</label>
            <input id="panel-anahtar" value={input} onChange={e => setInput(e.target.value)} placeholder="Panel anahtarı" className="flex-1 min-w-0 h-11 px-3 rounded-lg border bg-background" />
            <button type="submit" className="px-4 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[14px]">Aç</button>
          </form>
          {err && key && <p className="text-[14px] text-loss mt-2">{err}</p>}
        </div>
      ) : (
        <div className="mt-3">
          <label htmlFor="panel-mac" className="sr-only">Maç</label>
          <select id="panel-mac" value={mac} onChange={e => setMac(e.target.value)} className="w-full h-10 px-2 rounded-lg border bg-background text-[14px]">
            {options.map(m => <option key={m.id} value={m.id}>{m.home.name} – {m.away.name} · {fmtDate(m.date)}</option>)}
          </select>
          <p className="text-[14px] num mt-3"><b>{res.toplam}</b> oy</p>
          <div className="mt-3 flex flex-col gap-2.5">
            {top(res.dizilisler).map(([k, n]) => (
              <div key={k}>
                <div className="flex justify-between text-[15px]"><span className={cn('font-display text-[17px]', k === f && 'underline decoration-club decoration-4 underline-offset-4')}>{k}</span><span className="num font-semibold">%{Math.round((n / Math.max(1, res.toplam)) * 100)}</span></div>
                <div className="h-2 rounded-full bg-muted overflow-hidden mt-1"><div className="h-full bg-club" style={{ width: `${(n / Math.max(1, res.toplam)) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="eyebrow mt-5 mb-2">Mevkiye göre en çok seçilenler</div>
          <div className="grid grid-cols-2 gap-3 text-[14px]">
            {(['K', 'S', 'O', 'F'] as Pos[]).map(g => (
              <div key={g}>
                <div className="font-semibold">{POS_LABEL[g]}</div>
                <ol className="mt-1">
                  {top(res.mevkiler[g] ?? {}).slice(0, g === 'K' ? 2 : 5).map(([sl, n]) => (
                    <li key={sl} className="flex justify-between gap-2"><span className="truncate">{squad.find(p => p.slug === sl)?.name ?? sl}</span><span className="num text-muted-foreground">{n}</span></li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <button onClick={() => { setKey(''); setRes(null); try { localStorage.removeItem('1337-panel') } catch { /* */ } }} className="mt-4 text-[13px] underline underline-offset-2 text-muted-foreground">Panelden çık</button>
        </div>
      )}
    </section>
  )
}
