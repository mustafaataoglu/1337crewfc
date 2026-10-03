import type { Slot } from '@/lib/oneri'

export type PaylasOyuncu = { isim: string; alt?: string } | null

/** Kadroyu 1080x1350 PNG olarak çizer (WhatsApp/Instagram için). Fotoğraf yerine baş harfler: dış kaynaklı resimler tuvali kirletir. */
export async function kadroGorseli(o: { baslik: string; alt: string; dizilis: string; slots: Slot[]; oyuncular: PaylasOyuncu[]; yedekler?: string[] }): Promise<Blob> {
  await document.fonts?.ready
  const W = 1080, H = 1350
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const c = cv.getContext('2d')!
  const KULUP = '#f2c200', MUREKKEP = '#14130f', KREM = '#f5f2e6'
  c.fillStyle = MUREKKEP; c.fillRect(0, 0, W, H)

  // Başlık
  c.fillStyle = KULUP
  c.font = '64px Anton, Impact, sans-serif'
  c.textBaseline = 'alphabetic'
  c.fillText('1337 CREW FC', 60, 108)
  c.fillStyle = KREM
  c.font = '600 34px "Barlow Condensed", "Arial Narrow", sans-serif'
  c.fillText(o.baslik.toLocaleUpperCase('tr'), 60, 158)
  c.fillStyle = 'rgba(245,242,230,.65)'
  c.font = '500 28px "Barlow Condensed", "Arial Narrow", sans-serif'
  c.fillText(o.alt, 60, 198)
  c.textAlign = 'right'
  c.fillStyle = KULUP
  c.font = '72px Anton, Impact, sans-serif'
  c.fillText(o.dizilis, W - 60, 120)
  c.textAlign = 'left'

  // Saha
  const sx = 60, sy = 230, sw = W - 120, sh = o.yedekler?.length ? 860 : 1000
  const serit = 8
  for (let i = 0; i < serit; i++) { c.fillStyle = i % 2 ? '#2f8a4a' : '#2a7d43'; c.fillRect(sx, sy + (sh / serit) * i, sw, sh / serit + 1) }
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 4
  c.strokeRect(sx + 2, sy + 2, sw - 4, sh - 4)
  c.beginPath(); c.moveTo(sx, sy + sh / 2); c.lineTo(sx + sw, sy + sh / 2); c.stroke()
  c.beginPath(); c.arc(sx + sw / 2, sy + sh / 2, sw * 0.13, 0, Math.PI * 2); c.stroke()
  c.strokeRect(sx + sw * 0.22, sy + sh * 0.86, sw * 0.56, sh * 0.14)
  c.strokeRect(sx + sw * 0.22, sy, sw * 0.56, sh * 0.14)

  // Oyuncular
  o.slots.forEach((s, i) => {
    const p = o.oyuncular[i]
    const x = sx + (Math.min(90, Math.max(10, s.x)) / 100) * sw
    const y = sy + (6 + (s.y - 13) * (86 / 79)) / 100 * sh
    const r = 46
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2)
    c.fillStyle = p ? KREM : 'rgba(0,0,0,.25)'; c.fill()
    c.lineWidth = 6; c.strokeStyle = KULUP; c.stroke()
    c.fillStyle = MUREKKEP; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.font = '38px Anton, Impact, sans-serif'
    const bas = p ? p.isim.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toLocaleUpperCase('tr') : s.label
    c.fillText(bas, x, y + 2)
    c.textBaseline = 'alphabetic'
    c.font = '700 30px "Barlow Condensed", "Arial Narrow", sans-serif'
    c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,.55)'
    const ad = p?.isim ?? s.label
    c.strokeText(ad, x, y + r + 34); c.fillStyle = '#fff'; c.fillText(ad, x, y + r + 34)
    if (p?.alt) { c.font = '700 24px "Barlow Condensed", sans-serif'; c.fillStyle = KULUP; c.fillText(p.alt, x, y + r + 62) }
    c.textAlign = 'left'
  })

  // Yedekler
  if (o.yedekler?.length) {
    c.fillStyle = KULUP; c.font = '600 28px "Barlow Condensed", sans-serif'
    c.fillText('YEDEKLER', 60, sy + sh + 52)
    c.fillStyle = KREM; c.font = '500 30px "Barlow Condensed", sans-serif'
    c.fillText(o.yedekler.join(' · '), 60, sy + sh + 94, W - 120)
  }
  c.fillStyle = 'rgba(245,242,230,.6)'; c.font = '600 28px "Barlow Condensed", sans-serif'; c.textAlign = 'right'
  c.fillText('1337crewfc.com', W - 60, H - 40)
  return new Promise((ok, red) => cv.toBlob(b => (b ? ok(b) : red(new Error('Görsel oluşturulamadı'))), 'image/png'))
}

/** Telefonda paylaşım menüsünü açar; desteklenmiyorsa resmi indirir */
export async function gorselPaylas(blob: Blob, dosya: string, metin: string) {
  const file = new File([blob], dosya, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text: metin }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = dosya
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
