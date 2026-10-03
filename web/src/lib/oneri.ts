import type { Pos } from '@/types'
import { hungarian } from '@/lib/assign'

export type Slot = { x: number; y: number; g: Pos; label: string }
export type Oy = { dizilis: string; zaman: string; sira: string[] }
export type Sonuc = {
  toplam: number
  dizilisler: Record<string, number>
  oyuncular: Record<string, number>
  mevkiler: Partial<Record<Pos, Record<string, number>>>
  slotlar: Record<string, Record<string, Record<string, number>>>
  oylar: Oy[]
}
export type Yer = { slug: string; n?: number } | null
export type Yedek = { slug: string; n: number; g: Pos }

const GRUPLAR: Pos[] = ['K', 'S', 'O', 'F']
export const YEDEK_SAYISI = 7
export const sirali = (o: Record<string, number> = {}) => Object.entries(o).sort((a, b) => b[1] - a[1])

/** Bir dizilişi seçenlerin 11'i: her slota o slota en çok konan oyuncu (tekrarsız) */
export function ortak11(res: Sonuc, F: Record<string, Slot[]>, f: string): Yer[] {
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
export const oy11 = (v: Oy, F: Record<string, Slot[]>): Yer[] => F[v.dizilis].map((_, i) => (v.sira[i] ? { slug: v.sira[i] } : null))

/**
 * Önerilen 11 ve yedekler — tüm oylardan:
 * - Diziliş: en çok oy alan diziliş (eşitlikte o dizilişlerden ilki).
 * - 11: her mevkide (kaleci, defans, orta saha, forvet), o mevkiye koyan bütün oylar sayılarak en çok seçilenler;
 *   bir oyuncu iki mevkide de oy aldıysa daha çok oy aldığı mevkide sayılır. Mevkide yeterli aday yoksa boş yer
 *   en çok oy alan kalan oyunculardan doldurulur.
 * - Sahadaki yeri: taraftarların onu sahada koyduğu ortalama noktaya en yakın slot (Macar algoritması).
 * - Yedekler: 11 dışında kalanlardan en çok oy alan 7 oyuncu; kaleci oyu alan biri varsa yedek kaleci önce.
 */
export function oneri(res: Sonuc, F: Record<string, Slot[]>): { f: string; nF: number; slots: Yer[]; yedek: Yedek[] } | null {
  const f = sirali(res.dizilisler).find(([k]) => F[k])?.[0]
  if (!f) return null
  const yerler = F[f]

  // Oyuncunun sahadaki ortalama noktası (taraftarların koyduğu slotların ortalaması)
  const nokta: Record<string, { x: number; y: number; n: number }> = {}
  for (const [f2, slotlar] of Object.entries(res.slotlar ?? {})) {
    const F2 = F[f2]
    if (!F2) continue
    for (const [i, kisiler] of Object.entries(slotlar)) {
      const s = F2[Number(i)]
      if (!s) continue
      for (const [slug, n] of Object.entries(kisiler)) {
        const p = (nokta[slug] ??= { x: 0, y: 0, n: 0 })
        p.x += s.x * n; p.y += s.y * n; p.n += n
      }
    }
  }

  // Her mevkinin kontenjanı ve adayları: (oyuncu, mevki, oy) en çoktan aza; oyuncu tek mevkiye girer
  const kontenjan = Object.fromEntries(GRUPLAR.map(g => [g, yerler.filter(s => s.g === g).length])) as Record<Pos, number>
  const adaylar = GRUPLAR.flatMap(g => sirali(res.mevkiler[g]).map(([slug, n]) => ({ slug, g, n }))).sort((a, b) => b.n - a.n)
  const secilen = new Map<string, { g: Pos; n: number }>()
  const doluluk: Record<Pos, number> = { K: 0, S: 0, O: 0, F: 0 }
  for (const a of adaylar) {
    if (secilen.has(a.slug) || doluluk[a.g] >= kontenjan[a.g]) continue
    secilen.set(a.slug, { g: a.g, n: a.n }); doluluk[a.g]++
  }
  // Mevkide aday kalmadıysa: kalan en çok oy alanlar o mevkiye
  for (const g of GRUPLAR) {
    for (const [slug, n] of sirali(res.oyuncular)) {
      if (doluluk[g] >= kontenjan[g]) break
      if (secilen.has(slug)) continue
      secilen.set(slug, { g, n: res.mevkiler[g]?.[slug] ?? n }); doluluk[g]++
    }
  }

  // Her mevkinin oyuncularını o mevkinin slotlarına, ortalama noktalarına en yakın biçimde yerleştir
  const slots: Yer[] = yerler.map(() => null)
  for (const g of GRUPLAR) {
    const idx = yerler.map((s, i) => (s.g === g ? i : -1)).filter(i => i >= 0)
    const oyuncular = [...secilen].filter(([, v]) => v.g === g).map(([slug, v]) => ({ slug, n: v.n }))
    if (!idx.length || !oyuncular.length) continue
    const ortY = idx.reduce((t, i) => t + yerler[i].y, 0) / idx.length
    const yer = (slug: string) => { const p = nokta[slug]; return p ? { x: p.x / p.n, y: p.y / p.n } : { x: 50, y: ortY } }
    const C = idx.map((_, r) => (r < oyuncular.length ? idx.map(i => Math.hypot(yer(oyuncular[r].slug).x - yerler[i].x, yer(oyuncular[r].slug).y - yerler[i].y)) : idx.map(() => 0)))
    const atama = hungarian(C)
    oyuncular.forEach((o, r) => { slots[idx[atama[r]]] = o })
  }

  // Yedekler: 11 dışında en çok oy alanlar; yedek kaleci önce
  const mevkisi = (slug: string): Pos => GRUPLAR.map(g => [g, res.mevkiler[g]?.[slug] ?? 0] as const).sort((a, b) => b[1] - a[1])[0][0]
  const kalan = sirali(res.oyuncular).filter(([slug]) => !secilen.has(slug)).map(([slug, n]) => ({ slug, n, g: mevkisi(slug) }))
  const kaleci = kalan.find(y => y.g === 'K')
  const yedek = [...(kaleci ? [kaleci] : []), ...kalan.filter(y => y !== kaleci)].slice(0, YEDEK_SAYISI).sort((a, b) => b.n - a.n)

  return { f, nF: res.dizilisler[f], slots, yedek }
}
