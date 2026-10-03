import { useCallback, useEffect, useState } from 'react'
import { CalendarPlus, Check, Minus, Plus, Trophy, X } from 'lucide-react'
import type { Nav } from '@/App'
import type { Match } from '@/types'
import { kickoff, playerBySlug, theirs } from '@/lib/site'
import { Avatar } from '@/components/bits'
import { cn } from '@/lib/utils'
import { deviceId } from '@/lib/cihaz'
import { F } from '@/lib/dizilis'
import { oneri, type Sonuc } from '@/lib/oneri'
import { ABONE_GOOGLE, ABONE_WEBCAL, macGoogle, macTakvimeEkle } from '@/lib/takvim'

const pct = (n: number, d: number) => Math.round((n / Math.max(1, d)) * 100)
const AD_KEY = '1337-takma-ad'
const ilk = <T,>(url: string): Promise<T> => fetch(url, { headers: { 'X-Cihaz': deviceId() } }).then(r => r.json())
const gonder = async (url: string, govde: object) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...govde, cihaz: deviceId() }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.ok) throw new Error(j.hata || `Sunucu hatası (${r.status})`)
  return j
}

/** Taraftar sayfalarının üst sekmeleri */
export function TaraftarSekme({ aktif, nav }: { aktif: 'oyla' | 'tahmin' | 'efsane'; nav: Nav }) {
  const S = [['oyla', "Senin 11'in"], ['tahmin', 'Skor tahmini'], ['efsane', 'Tüm zamanlar']] as const
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-muted mb-5 w-fit max-w-full overflow-x-auto" role="tablist" aria-label="Taraftar">
      {S.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={aktif === k} onClick={() => nav.go({ page: k })}
          className={cn('shrink-0 px-3 py-1.5 rounded-md text-[14px] font-semibold whitespace-nowrap', aktif === k ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{l}</button>
      ))}
    </div>
  )
}

// ---------- skor tahmini
type TahminCevap = { ok: boolean; basladi: boolean; toplam: number; benim: { ev: number; dep: number; ad: string } | null; puan?: number; dagilim?: { ev: number; beraber: number; dep: number; skorlar: Record<string, number> }; hata?: string }
const adDuzelt = (s: string) => s.replace(/\s+/g, ' ').trim()

function Sayac({ deger, set, etiket }: { deger: number; set: (n: number) => void; etiket: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={etiket}>
      <button onClick={() => set(Math.max(0, deger - 1))} aria-label={`${etiket} azalt`} className="w-9 h-9 rounded-lg border grid place-items-center shrink-0"><Minus className="w-4 h-4" /></button>
      <span className="font-display text-[40px] leading-none w-10 text-center num" aria-live="polite">{deger}</span>
      <button onClick={() => set(Math.min(30, deger + 1))} aria-label={`${etiket} artır`} className="w-9 h-9 rounded-lg border grid place-items-center shrink-0"><Plus className="w-4 h-4" /></button>
    </div>
  )
}

/** Skor tahmini: maç saatine kadar açık; tahmin verince (ya da maç başlayınca) taraftarın tahmin dağılımı, maç bitince alınan puan */
export function TahminFormu({ m }: { m: Match }) {
  const [c, setC] = useState<TahminCevap | null>(null)
  const [ev, setEv] = useState(1), [dep, setDep] = useState(1)
  const [ad, setAd] = useState(() => { try { return localStorage.getItem(AD_KEY) ?? '' } catch { return '' } })
  const [durum, setDurum] = useState<'bos' | 'gonderiliyor'>('bos')
  const [err, setErr] = useState<string | null>(null)
  // Açık sayfada da maç saatinde kapansın
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t) }, [])
  const yukle = useCallback(() => ilk<TahminCevap>(`api/tahmin.php?mac=${encodeURIComponent(m.id)}`).then(j => {
    if (!j.ok) { setErr(j.hata ?? 'Tahminler alınamadı'); return }
    setC(j)
    if (j.benim) { setEv(j.benim.ev); setDep(j.benim.dep); setAd(a => a || j.benim!.ad) }
  }).catch(() => setErr('Sunucuya ulaşılamadı')), [m.id])
  useEffect(() => { yukle() }, [yukle])
  const basladi = !!c?.basladi || now >= kickoff(m).getTime() || m.status === 'done'
  // Maç saati açık sayfada gelince dağılım için bir kez yeniden çek
  useEffect(() => { if (basladi && c && !c.basladi) yukle() }, [basladi]) // eslint-disable-line react-hooks/exhaustive-deps
  const kaydet = async () => {
    const temiz = adDuzelt(ad)
    setDurum('gonderiliyor'); setErr(null)
    try {
      await gonder('api/tahmin.php', { mac: m.id, ev, dep, ad: temiz })
      setAd(temiz)
      try { localStorage.setItem(AD_KEY, temiz) } catch { /* depolama kapalı */ }
      await yukle()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      if (/başladı|kapandı/i.test(String(e))) yukle()
    } finally { setDurum('bos') }
  }
  // Oynanmış eski maçlarda tahmin yoksa bölüm gösterilmez
  if (m.status === 'done' && c && c.toplam === 0) return null
  const d = c?.dagilim
  // dağılım ev sahibine göre gelir; 1337'nin bakışıyla göster
  const biz = d ? (m.us === 'home' ? d.ev : d.dep) : 0, onlar = d ? (m.us === 'home' ? d.dep : d.ev) : 0
  const degisti = !c?.benim || c.benim.ev !== ev || c.benim.dep !== dep || c.benim.ad !== adDuzelt(ad)
  const kapanis = kickoff(m).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="font-display text-[24px] leading-none">Skor tahmini</h3>
        {c && <span className="font-data text-[14px] text-muted-foreground num">{c.toplam} tahmin</span>}
      </div>
      {!basladi ? (
        <>
          <div className="grid grid-cols-2 gap-3 text-center">
            <span className="font-display text-[17px] leading-tight min-w-0 break-words">{m.home.name}</span>
            <span className="font-display text-[17px] leading-tight min-w-0 break-words">{m.away.name}</span>
          </div>
          <div className="flex items-center justify-between gap-1 mt-2">
            <Sayac deger={ev} set={setEv} etiket={`${m.home.name} golü`} />
            <span className="font-display text-[28px] text-muted-foreground" aria-hidden>–</span>
            <Sayac deger={dep} set={setDep} etiket={`${m.away.name} golü`} />
          </div>
          <div className="flex gap-2 mt-4">
            <label htmlFor={`ad-${m.id}`} className="sr-only">Takma ad</label>
            <input id={`ad-${m.id}`} value={ad} onChange={e => setAd(e.target.value)} maxLength={20} placeholder="Takma ad" autoComplete="nickname"
              className="flex-1 min-w-0 h-11 px-3 rounded-lg border bg-background" />
            <button onClick={kaydet} disabled={durum === 'gonderiliyor' || adDuzelt(ad).length < 2 || !degisti}
              className="shrink-0 px-3 h-11 rounded-lg bg-club text-clubink font-data font-bold uppercase tracking-wider text-[14px] disabled:opacity-60 flex items-center gap-1.5">
              {durum === 'gonderiliyor' ? 'Kaydediliyor…' : !degisti ? <><Check className="w-4 h-4" /> Kayıtlı</> : c?.benim ? 'Güncelle' : 'Tahmin et'}
            </button>
          </div>
          <p className="text-[13px] text-muted-foreground mt-2 num">Son tahmin: {kapanis} · tam skor 3, doğru sonuç 1 puan</p>
        </>
      ) : c?.benim ? (
        <p className="text-[15px]">
          Tahminin: <b className="num">{m.home.name} {c.benim.ev}–{c.benim.dep} {m.away.name}</b>
          {c.puan !== undefined && <> · <b className="num">{c.puan} puan</b></>}
        </p>
      ) : <p className="text-[15px] text-muted-foreground">Tahminler kapandı.</p>}
      {err && <p className="text-[14px] text-loss mt-2 font-semibold">{err}</p>}
      {d && c && c.toplam > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="eyebrow mb-2">Taraftar ne diyor</div>
          {([['1337 kazanır', biz], ['Berabere', d.beraber], [`${theirs(m).name} kazanır`, onlar]] as const).map(([l, n]) => (
            <div key={l} className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_44px] items-center gap-2 text-[14px] mb-1.5">
              <span className="truncate">{l}</span>
              <span className="h-2.5 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-club" style={{ width: `${pct(n, c.toplam)}%` }} /></span>
              <span className="text-right num font-semibold">%{pct(n, c.toplam)}</span>
            </div>
          ))}
          <div className="flex gap-1.5 flex-wrap mt-2">
            {Object.entries(d.skorlar).map(([s, n]) => <span key={s} className="font-data font-semibold text-[13px] px-2 py-0.5 rounded bg-muted num">{s} · {n} kişi</span>)}
          </div>
        </div>
      )}
    </section>
  )
}

type LigSatir = { sira: number; ad: string; puan: number; tahmin: number; tam: number; dogru: number; ben?: boolean }
/** Tahmin ligi: oynanan maçlardaki tahminlerin puanı */
export function TahminLigi() {
  const [l, setL] = useState<{ liste: LigSatir[]; ben: LigSatir | null; oyuncu: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { ilk<{ ok: boolean; liste: LigSatir[]; ben: LigSatir | null; oyuncu: number }>('api/tahmin.php?lig=1').then(j => (j.ok ? setL(j) : setErr('Liste alınamadı'))).catch(() => setErr('Sunucuya ulaşılamadı')) }, [])
  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <div className="p-5 pb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[24px] leading-none flex items-center gap-2"><Trophy className="w-5 h-5" /> Tahmin ligi</h3>
        {l && <span className="font-data text-[14px] text-muted-foreground num">{l.oyuncu} kişi</span>}
      </div>
      {err && <p className="px-5 pb-5 text-loss">{err}</p>}
      {l && !l.liste.length && <p className="px-5 pb-5 text-muted-foreground">Henüz puanlanan tahmin yok.</p>}
      {l && l.liste.length > 0 && (
        <ol>
          {l.liste.map(r => (
            <li key={r.sira} className={cn('grid grid-cols-[32px_minmax(0,1fr)_auto_44px] items-center gap-3 px-5 py-2 border-t text-[14px]', r.ben && 'bg-club/15')}>
              <span className="font-display text-[18px] num">{r.sira}</span>
              <span className="truncate font-semibold">{r.ad}{r.ben && <span className="ml-1.5 text-[12px] text-muted-foreground">(sen)</span>}</span>
              <span className="text-[12px] text-muted-foreground num">{r.tahmin} tahmin · {r.tam} tam</span>
              <span className="text-right font-display text-[20px] num">{r.puan}</span>
            </li>
          ))}
          {l.ben && !l.liste.some(r => r.ben) && (
            <li className="grid grid-cols-[32px_minmax(0,1fr)_auto_44px] items-center gap-3 px-5 py-2 border-t text-[14px] bg-club/15">
              <span className="font-display text-[18px] num">{l.ben.sira}</span><span className="truncate font-semibold">{l.ben.ad} (sen)</span>
              <span className="text-[12px] text-muted-foreground num">{l.ben.tahmin} tahmin · {l.ben.tam} tam</span><span className="text-right font-display text-[20px] num">{l.ben.puan}</span>
            </li>
          )}
        </ol>
      )}
    </section>
  )
}

// ---------- maç sonu: taraftarın maçın oyuncusu
type MvpCevap = { ok: boolean; bitti: boolean; acik: boolean; kapanis: string; toplam: number; benim: string | null; kilitli: boolean; oyuncular?: Record<string, number>; hata?: string }
export function TaraftarMVP({ m, nav }: { m: Match; nav: Nav }) {
  const [c, setC] = useState<MvpCevap | null>(null)
  const [secim, setSecim] = useState<string | null>(null)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const yukle = useCallback(() => ilk<MvpCevap>(`api/mvp.php?mac=${encodeURIComponent(m.id)}`).then(j => (j.ok ? setC(j) : setErr(j.hata ?? 'Alınamadı'))).catch(() => setErr('Sunucuya ulaşılamadı')), [m.id])
  useEffect(() => { yukle() }, [yukle])
  const adaylar = [...new Set([...(m.lineup?.xi ?? []), ...(m.lineup?.subs ?? [])])].filter(s => playerBySlug(s))
  // Oylamadan önce oynanmış eski maçlarda boş kutu gösterme
  if (!adaylar.length || m.forfeit || !c?.bitti || (!c.acik && c.toplam === 0)) return null
  const oyla = async () => {
    if (!secim) return
    setGonderiliyor(true); setErr(null)
    try { await gonder('api/mvp.php', { mac: m.id, oyuncu: secim }); await yukle() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setGonderiliyor(false) }
  }
  const sonuc = c.oyuncular ? Object.entries(c.oyuncular).sort((a, b) => b[1] - a[1]) : []
  const kapanis = new Date(c.kapanis).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="font-display text-[26px] leading-none">Taraftarın maç oyuncusu</h2>
        <span className="font-data text-[14px] text-muted-foreground num">{c.toplam} oy</span>
      </div>
      {c.acik && !c.benim ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {adaylar.map(sl => {
              const p = playerBySlug(sl)!
              return (
                <button key={sl} onClick={() => setSecim(sl)} aria-pressed={secim === sl}
                  className={cn('flex items-center gap-2.5 p-2 rounded-lg border text-left min-w-0', secim === sl ? 'border-club bg-club/15' : 'hover:border-club')}>
                  <Avatar p={p} size={34} ring={false} /><span className="min-w-0 flex-1 truncate font-semibold text-[15px]">{p.name}</span>
                  {secim === sl && <Check className="w-4 h-4 shrink-0" />}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button onClick={oyla} disabled={!secim || gonderiliyor} className="px-5 py-2.5 rounded-lg bg-club text-clubink font-data font-bold uppercase tracking-wider text-[14px] disabled:opacity-60">{gonderiliyor ? 'Gönderiliyor…' : 'Oyumu ver'}</button>
            <span className="text-[13px] text-muted-foreground num">Oylama kapanışı: {kapanis}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-4">
          {sonuc.length === 0 ? <p className="text-muted-foreground">Bu maç için taraftar oyu yok.</p> : (
            <ol className="flex flex-col gap-2">
              {sonuc.map(([sl, n], i) => {
                const p = playerBySlug(sl)
                return (
                  <li key={sl}>
                    <button onClick={() => nav.openPlayer(sl)} className={cn('w-full grid grid-cols-[34px_minmax(0,1fr)_52px] items-center gap-3 text-left rounded-lg p-1', c.benim === sl && 'bg-club/15')}>
                      {p ? <Avatar p={p} size={34} ring={i === 0} /> : <span />}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[15px]">{p?.name ?? sl}{c.benim === sl && <span className="ml-1.5 text-[12px] text-muted-foreground">(senin oyun)</span>}</span>
                        <span className="block h-2 mt-1 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-club" style={{ width: `${pct(n, c.toplam)}%` }} /></span>
                      </span>
                      <span className="text-right font-semibold num">%{pct(n, c.toplam)}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
          <p className="text-[13px] text-muted-foreground mt-3 num">{c.acik ? `Oylama kapanışı: ${kapanis}` : 'Oylama kapandı.'}</p>
        </div>
      )}
      {err && <p className="text-[14px] text-loss mt-2 font-semibold">{err}</p>}
    </section>
  )
}

// ---------- maç sonu: taraftarın önerdiği 11 ile sahaya çıkan 11
export function TaraftarKarsilastir({ m, nav }: { m: Match; nav: Nav }) {
  const [res, setRes] = useState<Sonuc | null>(null)
  useEffect(() => { ilk<{ ok: boolean; sonuc?: Sonuc }>(`api/oy.php?mac=${encodeURIComponent(m.id)}`).then(j => { if (j.ok && j.sonuc) setRes(j.sonuc) }).catch(() => {}) }, [m.id])
  const xi = m.lineup?.xi ?? [], subs = m.lineup?.subs ?? []
  if (!res || res.toplam === 0 || !xi.length) return null
  const o = oneri(res, F)
  if (!o) return null
  const onerilen = o.slots.filter((x): x is { slug: string; n?: number } => !!x)
  const tutan = onerilen.filter(x => xi.includes(x.slug)).length
  return (
    <section className="mt-8">
      <h2 className="font-display text-[26px] leading-none mb-1">Taraftarın 11'i sahada</h2>
      <p className="text-[15px] mb-3"><b className="num">{res.toplam} oyla</b> önerilen 11'den <b className="num">{tutan}</b> oyuncu ilk 11'de başladı.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {onerilen.map(x => {
          const p = playerBySlug(x.slug)
          const durum = xi.includes(x.slug) ? 'ilk' : subs.includes(x.slug) ? 'yedek' : 'yok'
          return (
            <button key={x.slug} onClick={() => nav.openPlayer(x.slug)} className="flex items-center gap-2.5 p-2 rounded-lg border bg-card text-left min-w-0">
              {p && <Avatar p={p} size={32} ring={false} />}
              <span className="min-w-0 flex-1 truncate font-semibold text-[15px]">{p?.name ?? x.slug}</span>
              <span className={cn('shrink-0 font-data font-bold text-[12px] px-1.5 rounded flex items-center gap-1', durum === 'ilk' ? 'bg-club text-clubink' : 'bg-muted')}>
                {durum === 'ilk' ? <><Check className="w-3.5 h-3.5" /> İLK 11</> : durum === 'yedek' ? 'YEDEKTEN' : <><X className="w-3.5 h-3.5" /> OYNAMADI</>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ---------- takvim
export function TakvimButonlari({ m }: { m: Match }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => macTakvimeEkle(m)} className="px-3 py-2 rounded-lg border font-data font-bold uppercase tracking-wider text-[13px] flex items-center gap-2"><CalendarPlus className="w-4 h-4" /> Takvime ekle</button>
      <a href={macGoogle(m)} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg border font-data font-bold uppercase tracking-wider text-[13px]">Google Takvim</a>
    </div>
  )
}
export function AboneButonlari() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={ABONE_WEBCAL} className="px-3 py-2 rounded-lg bg-clubink text-club font-data font-bold uppercase tracking-wider text-[13px] flex items-center gap-2"><CalendarPlus className="w-4 h-4" /> Fikstüre abone ol</a>
      <a href={ABONE_GOOGLE} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg border font-data font-bold uppercase tracking-wider text-[13px]">Google Takvim'e ekle</a>
    </div>
  )
}
