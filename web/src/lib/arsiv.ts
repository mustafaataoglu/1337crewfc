import { useEffect, useState } from 'react'
import type { Result } from '@/types'

// Arşiv: kulübün eski blogu (1337crewfc.blogspot.com, 2010–2020). EfendiLig öncesi; sitenin istatistiklerine katılmaz.
// Veri sitenin yanındaki data/arsiv/ klasöründe (sync/arsiv.mjs üretir): liste.json bir kez, yıl dosyaları ve sayfalar.json gerektiğinde alınır.

export type Tur = 'mac' | 'istatistik' | 'haber'

export interface ArsivLig { id: string; ad: string; donem: string }

export interface Yazi {
  /** Blogger yazı kimliği (rakam) */
  id: string
  /** blogda yayımlandığı gün (İstanbul), YYYY-MM-DD */
  tarih: string
  baslik: string
  lig: string
  sezon: string | null
  tur: Tur
  /** [1337, rakip] normal süre; emin olunmayan maçlarda null */
  skor: [number, number] | null
  pen: [number, number] | null
  hukmen: boolean
  rakip: string | null
  ozet: string
  /** ilk fotoğrafın küçük hali (~640 px) */
  kapak: string | null
  foto: number
  video: number
  /** yalnız başkasının imzasıyla yazılmışsa */
  yazar: string | null
  /** blogdaki adresin yolu: /2014/04/....html */
  eski: string
}

export interface ArsivSayfa { id: string; baslik: string; lig: string; eski: string }

export interface ArsivListe {
  kaynak: string
  ligler: ArsivLig[]
  onecikan: { id: string; baslik: string }[]
  /** en yeni önce */
  yazilar: Yazi[]
  sayfalar: ArsivSayfa[]
}

/** dk: oyuna girdiği dakika (bir önceki satırdaki oyuncunun yerine) */
export interface KadroSatir { ad: string; p: number | null; dk: number | null }
export interface GolSatir { dk: number | null; ad: string; asist: string | null }
export interface PenaltiSatir { ad: string; gol: boolean | null }
export interface Foto { src: string; k: string }

export type Blok =
  | { t: 'p'; x: string }
  | { t: 'h'; x: string }
  | { t: 'kadro'; r: KadroSatir[] }
  | { t: 'goller'; r: GolSatir[] }
  | { t: 'penaltilar'; r: PenaltiSatir[] }
  | { t: 'foto'; r: Foto[] }
  | { t: 'yt'; id: string }
  /** ilk satır başlık */
  | { t: 'tablo'; r: string[][]; baslik: string | null }

export type Bloklar = Record<string, Blok[]>

export const listeDosya = 'liste.json'
export const sayfalarDosya = 'sayfalar.json'
export const yilDosya = (tarih: string) => `${tarih.slice(0, 4)}.json`

// Aynı dosya bir kez istenir; hata olursa önbellekten silinir, "Tekrar dene" yeniden ister
const istek = new Map<string, Promise<unknown>>()
const hazir = new Map<string, unknown>()

export function arsivAl<T>(dosya: string): Promise<T> {
  let p = istek.get(dosya)
  if (!p) {
    p = fetch(`data/arsiv/${dosya}`)
      .then(r => { if (!r.ok) throw new Error(`${dosya} ${r.status}`); return r.json() })
      .then(j => {
        if (!j || typeof j !== 'object' || (dosya === listeDosya && !Array.isArray(j.yazilar))) throw new Error(`${dosya} bozuk`)
        hazir.set(dosya, j)
        return j
      })
    p.catch(() => istek.delete(dosya))
    istek.set(dosya, p)
  }
  return p as Promise<T>
}

/** Arşiv dosyasını yükler; daha önce gelmişse beklemeden döner. dosya null: henüz bir şey isteme */
export function useArsiv<T>(dosya: string | null) {
  const [, yenile] = useState(0)
  const [hata, setHata] = useState<string | null>(null)
  const [deneme, setDeneme] = useState(0)
  useEffect(() => {
    if (!dosya || hazir.has(dosya)) return
    let iptal = false
    arsivAl(dosya).then(() => { if (!iptal) yenile(n => n + 1) }, () => { if (!iptal) setHata(dosya) })
    return () => { iptal = true }
  }, [dosya, deneme])
  return {
    veri: dosya ? (hazir.get(dosya) as T | undefined) : undefined,
    hata: !!dosya && hata === dosya,
    tekrar: () => { setHata(null); setDeneme(n => n + 1) },
  }
}

/** Yalnız Blogger'ın görsel sunucularındaki https adresleri gösterilir (sync/arsiv.mjs gorsel() ile aynı kural) */
export function guvenliResim(u: string | null | undefined): string | null {
  if (!u) return null
  try {
    const a = new URL(u)
    if (a.protocol !== 'https:' || a.username || a.password || a.port) return null
    return a.hostname === 'blogger.googleusercontent.com' || /^[a-z0-9]+\.bp\.blogspot\.com$/.test(a.hostname) ? a.href : null
  } catch { return null }
}

/** Liste satırı için küçük kare kapak (Blogger boyutu adresten seçer) */
export const kucukKapak = (u: string) => u.replace(/\/s640\//, '/s200-c/')

export const ytGecerli = (id: string) => /^[A-Za-z0-9_-]{11}$/.test(id)

export const sonucu = (s: [number, number]): Result => (s[0] > s[1] ? 'G' : s[0] < s[1] ? 'M' : 'B')

/** Aramada büyük/küçük harf ve Türkçe harf farkı gözetilmez (ı/i, ş/s ...) */
export function sadelestir(s: string) {
  return s.toLocaleLowerCase('tr').replace(/[ıİ]/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
