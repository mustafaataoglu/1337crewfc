import { useSyncExternalStore } from 'react'
import { deviceId } from '@/lib/cihaz'

// Mağaza: ürünler ve siparişler sunucuda (api/magaza.php, yönetim: api/magaza-yonetim.php) tutulur.
// Sepet ve bu cihazdan verilen siparişlerin numaraları tarayıcıda saklanır; üyelik yok.
// Ödeme ve teslim elden: sipariş verilince 1337 Crew FC kişiyle telefonla iletişime geçer.

export type Satis = 'stok' | 'onsiparis'
export type Durum = 'yeni' | 'gorusuldu' | 'hazir' | 'teslim' | 'iptal'

/** stok: satılabilir adet; ön siparişte null (sınırsız) */
export interface Beden { ad: string; stok: number | null }

export interface Urun {
  id: string
  ad: string
  kategori: string
  aciklama: string
  /** TL, tam sayı */
  fiyat: number
  /** görsel kimlikleri; ilk görsel kapak */
  resimler: string[]
  bedenler: Beden[]
  satis: Satis
  /** ön siparişin son günü (YYYY-MM-DD, İstanbul, o gün dahil); null: yönetim kapatana kadar açık */
  onSiparisBitis: string | null
  teslimTahmini: string
  /** isim ve numara baskısı sunuluyor mu */
  baski: boolean
  baskiUcret: number
  /** sunucu hesaplar: mağaza açık ve ürün şu an sipariş verilebilir */
  siparisAcik: boolean
}
export interface UrunTam extends Urun { yayinda: boolean; sira: number; olusturma: string; guncelleme: string }

export interface Katalog { acik: boolean; teslimNotu: string; whatsapp: string; urunler: Urun[] }

export interface Baski { isim: string; numara: string }
export interface SepetKalem { urun: string; beden: string; adet: number; baski?: Baski }
export interface SiparisKalem { urun: string; ad: string; beden: string; adet: number; baski?: Baski; birim: number; satis: Satis }
export interface Gecmis { zaman: string; durum: Durum }

/** Takipte görünen sipariş: ad ve telefon yok */
export interface Siparis { no: string; zaman: string; durum: Durum; odendi: boolean; kalemler: SiparisKalem[]; toplam: number; gecmis: Gecmis[] }
/** Yönetimde görünen sipariş. tel: ülke koduyla yalnız rakam (905321234567) */
export interface SiparisTam extends Siparis { ad: string; tel: string; not: string; icNot: string; odemeZaman: string | null }

export interface Ayarlar { acik: boolean; teslimNotu: string; whatsapp: string; eposta: string }

/** Sunucunun döndürdüğü hata; durum: HTTP kodu (401: panel anahtarı geçersiz, 429: çok fazla deneme) */
export class MagazaHata extends Error {
  durum: number
  constructor(mesaj: string, durum: number) { super(mesaj); this.durum = durum }
}

async function cevap<T>(r: Response): Promise<T> {
  let j: { ok?: boolean; hata?: string } & Record<string, unknown>
  try { j = await r.json() } catch { throw new MagazaHata('Sunucuya ulaşılamadı', r.status || 0) }
  if (!j.ok) throw new MagazaHata(j.hata || 'Bir sorun oluştu, tekrar dene', r.status)
  return j as T
}
const istek = <T>(url: string, init?: RequestInit) =>
  fetch(url, { cache: 'no-store', ...init }).catch(() => { throw new MagazaHata('Sunucuya ulaşılamadı', 0) }).then(r => cevap<T>(r))
const postJson = <T>(url: string, govde: object, basliklar: Record<string, string> = {}) =>
  istek<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...basliklar }, body: JSON.stringify(govde) })

// ——— Taraftar tarafı ———

export const katalogAl = () => istek<{ ok: true } & Katalog>('api/magaza.php')

export interface SiparisFormu { ad: string; tel: string; not: string; izin: boolean; kalemler: SepetKalem[]; /** bot tuzağı: boş kalmalı */ web: string }
export const siparisVer = (f: SiparisFormu) =>
  postJson<{ ok: true; no: string; toplam: number; zaman: string }>('api/magaza.php', { islem: 'siparis', cihaz: deviceId(), ...f })

/** no: "1337-0042", "0042" ya da "42"; son4: telefonun son 4 hanesi */
export const siparisTakip = (no: string, son4: string) =>
  postJson<{ ok: true; siparis: Siparis; teslimNotu: string; whatsapp: string }>('api/magaza.php', { islem: 'takip', no, son4 })

// ——— Yönetim ———

const PANEL = '1337-panel'
// Tarayıcı site verisi saklamaya izin vermiyorsa anahtar bu sekmede bellekte kalır
let panelBellek = ''
export function panelAnahtari(): string {
  try { return localStorage.getItem(PANEL) ?? panelBellek } catch { return panelBellek }
}
export function panelKaydet(k: string | null) {
  panelBellek = k ?? ''
  try { if (k) localStorage.setItem(PANEL, k); else localStorage.removeItem(PANEL) } catch { /* depolama kapalı */ }
}
const YON = 'api/magaza-yonetim.php'
const yb = (anahtar = panelAnahtari()) => ({ 'X-Panel-Anahtar': anahtar })
const yonet = <T = { ok: true }>(govde: object) => postJson<T>(YON, govde, yb())

export const yonetimGiris = (anahtar: string) => postJson<{ ok: true }>(YON, { islem: 'giris' }, yb(anahtar))
export const yonetimVeri = () => istek<{ ok: true; siparisler: SiparisTam[]; urunler: UrunTam[]; ayarlar: Ayarlar }>(`${YON}?islem=veri`, { headers: yb() })
export type SiparisDegisim = { durum?: Durum; odendi?: boolean; icNot?: string }
export const siparisGuncelle = (no: string, d: SiparisDegisim) => yonet<{ ok: true; siparis: SiparisTam; urunler: UrunTam[] }>({ islem: 'siparis-guncelle', no, ...d })
export const siparisSil = (no: string) => yonet<{ ok: true; urunler: UrunTam[] }>({ islem: 'siparis-sil', no })
/**
 * id yoksa yeni ürün; sira/olusturma/guncelleme sunucuda belirlenir.
 * bedenler[].onceki: form açıldığında o bedenin stoğu. Verilirse sunucu farkı uygular (güncel + stok − onceki),
 * böylece form açıkken gelen siparişlerin ayırdığı stok ezilmez.
 */
export type UrunGirdi = Omit<UrunTam, 'id' | 'siparisAcik' | 'sira' | 'olusturma' | 'guncelleme' | 'bedenler'> & {
  id?: string
  bedenler: (Beden & { onceki?: number | null })[]
}
export const urunKaydet = (urun: UrunGirdi) => yonet<{ ok: true; urun: UrunTam }>({ islem: 'urun-kaydet', urun })
export const urunSil = (id: string) => yonet({ islem: 'urun-sil', id })
/** ids: tüm ürünlerin yeni sırası */
export const urunSirala = (ids: string[]) => yonet<{ ok: true; urunler: UrunTam[] }>({ islem: 'urun-sirala', ids })
export const ayarlarKaydet = (ayarlar: Ayarlar) => yonet<{ ok: true; ayarlar: Ayarlar }>({ islem: 'ayarlar', ayarlar })
export const epostaDene = () => yonet({ islem: 'eposta-dene' })
export function resimYukle(dosya: Blob) {
  const f = new FormData()
  f.append('islem', 'resim')
  f.append('dosya', dosya, 'resim.jpg')
  return istek<{ ok: true; id: string }>(YON, { method: 'POST', headers: yb(), body: f })
}
/** Siparişler Excel'de açılabilen CSV olarak (UTF-8, noktalı virgül) */
export async function siparislerCsv(): Promise<Blob> {
  const r = await fetch(`${YON}?islem=csv`, { headers: yb(), cache: 'no-store' }).catch(() => { throw new MagazaHata('Sunucuya ulaşılamadı', 0) })
  if (!r.ok) await cevap(r)
  return r.blob()
}

/**
 * Fotoğrafı yüklemeden önce telefonda küçültür (en uzun kenar 1600 px, JPEG). Konum gibi fotoğraf bilgileri de böylece gitmez.
 * Tarayıcı açamazsa (ör. bazı HEIC dosyaları) dosya olduğu gibi gönderilir; sunucu desteklemiyorsa söyler.
 */
export async function resimKucult(dosya: File, enFazla = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(dosya)
    const o = Math.min(1, enFazla / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * o); c.height = Math.round(bmp.height * o)
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
    g.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    const b = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.85))
    return b ?? dosya
  } catch { return dosya }
}

// ——— Biçimler ———

export const resimUrl = (id: string) => `api/magaza-resim.php?id=${encodeURIComponent(id)}`
export const fiyatYazi = (n: number) => '₺' + n.toLocaleString('tr-TR')
export const trBuyuk = (s: string) => s.toLocaleUpperCase('tr-TR')

const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
/** '2026-10-20' → '20 Ekim' */
export const gunYazi = (d: string) => { const [, m, g] = d.split('-').map(Number); return m && g ? `${g} ${AY[m - 1]}` : d }
/** ISO zaman → '4 Eki 14:32' (İstanbul) */
export const zamanYazi = (z: string) => { const d = new Date(z); return isNaN(+d) ? '' : d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) }

export const DURUM_ETIKET: Record<Durum, string> = { yeni: 'Yeni', gorusuldu: 'Görüşüldü', hazir: 'Teslime hazır', teslim: 'Teslim edildi', iptal: 'İptal' }
/** İptal dışındaki durumların sırası (ilerleme çubuğu) */
export const DURUM_SIRA: Durum[] = ['yeni', 'gorusuldu', 'hazir', 'teslim']
/** Taraftarın gördüğü adım adları */
export const ADIM_ETIKET: Record<Durum, string> = { yeni: 'Sipariş alındı', gorusuldu: 'Görüşüldü', hazir: 'Teslime hazır', teslim: 'Teslim edildi', iptal: 'İptal edildi' }

/** 905321234567 → 0532 123 45 67; yurt dışı numaralar +ülke kodu ile */
export function telYazi(tel: string) {
  const t = tel.replace(/\D/g, '')
  if (/^905\d{9}$/.test(t)) return `0${t.slice(2, 5)} ${t.slice(5, 8)} ${t.slice(8, 10)} ${t.slice(10)}`
  return '+' + t
}
export const telLink = (tel: string) => `tel:+${tel.replace(/\D/g, '')}`
export const waLink = (tel: string, metin = '') => `https://wa.me/${tel.replace(/\D/g, '')}${metin ? `?text=${encodeURIComponent(metin)}` : ''}`

export type Ton = 'iyi' | 'az' | 'yok' | 'on'
/** Ürün kartındaki durum: Stokta, Son 2, Tükendi, Ön sipariş · son gün 20 Ekim, Ön sipariş kapandı */
export function stokEtiketi(u: Urun): { metin: string; ton: Ton } {
  if (u.satis === 'onsiparis') {
    if (!u.siparisAcik) return { metin: 'Ön sipariş kapandı', ton: 'yok' }
    return { metin: u.onSiparisBitis ? `Ön sipariş · son gün ${gunYazi(u.onSiparisBitis)}` : 'Ön sipariş', ton: 'on' }
  }
  const n = u.bedenler.reduce((t, b) => t + Math.max(0, b.stok ?? 0), 0)
  if (n === 0) return { metin: 'Tükendi', ton: 'yok' }
  if (n <= 3) return { metin: `Son ${n}`, ton: 'az' }
  return { metin: 'Stokta', ton: 'iyi' }
}

/** Kalemin birim fiyatı (baskı dahil) */
export const birimFiyat = (u: Urun, k: Pick<SepetKalem, 'baski'>) => u.fiyat + (k.baski && u.baski ? u.baskiUcret : 0)

/** Baskı: isim en fazla 12 harf (Türkçe büyük harf), numara 0-99 */
export const baskiIsim = (s: string) => trBuyuk(s).replace(/[^A-ZÇĞİÖŞÜ0-9 .-]/g, '').replace(/\s+/g, ' ').slice(0, 12)
export const baskiNumara = (s: string) => s.replace(/\D/g, '').slice(0, 2)

// ——— Sepet (bu tarayıcıda) ———

const SEPET = '1337-sepet'
const ayni = (a: SepetKalem, b: SepetKalem) => a.urun === b.urun && a.beden === b.beden && (a.baski?.isim ?? '') === (b.baski?.isim ?? '') && (a.baski?.numara ?? '') === (b.baski?.numara ?? '')
function sepetOku(): SepetKalem[] {
  try {
    const j = JSON.parse(localStorage.getItem(SEPET) ?? '[]')
    return Array.isArray(j) ? j.filter(k => k && typeof k.urun === 'string' && typeof k.beden === 'string' && Number.isInteger(k.adet) && k.adet > 0) : []
  } catch { return [] }
}
let sepet: SepetKalem[] = sepetOku()
const dinleyen = new Set<() => void>()
function sepetYaz(s: SepetKalem[]) {
  sepet = s
  try { localStorage.setItem(SEPET, JSON.stringify(s)) } catch { /* depolama kapalı: sepet bu sekmede kalır */ }
  dinleyen.forEach(f => f())
}
// Başka sekmede değişirse bu sekme de güncellensin
if (typeof window !== 'undefined') addEventListener('storage', e => { if (e.key === SEPET) { sepet = sepetOku(); dinleyen.forEach(f => f()) } })

export function useSepet(): SepetKalem[] {
  return useSyncExternalStore(f => { dinleyen.add(f); return () => { dinleyen.delete(f) } }, () => sepet)
}
export const sepetAdet = (s: SepetKalem[]) => s.reduce((t, k) => t + k.adet, 0)
/** Aynı ürün, beden ve baskı zaten sepetteyse adedi artar (en fazla 10) */
export function sepeteEkle(k: SepetKalem) {
  const i = sepet.findIndex(x => ayni(x, k))
  if (i < 0) sepetYaz([...sepet, { ...k, adet: Math.min(10, k.adet) }])
  else sepetYaz(sepet.map((x, j) => (j === i ? { ...x, adet: Math.min(10, x.adet + k.adet) } : x)))
}
/** adet 0: kalem çıkar */
export function sepetAdetAyarla(i: number, adet: number) {
  sepetYaz(adet <= 0 ? sepet.filter((_, j) => j !== i) : sepet.map((x, j) => (j === i ? { ...x, adet: Math.min(10, adet) } : x)))
}
export const sepetBosalt = () => sepetYaz([])

// ——— Bu cihazdan verilen siparişler (takip için numara ve telefonun son 4 hanesi) ———

const SIPARISLERIM = '1337-siparislerim'
export interface BenimSiparis { no: string; son4: string; zaman: string }
export function siparislerim(): BenimSiparis[] {
  try { const j = JSON.parse(localStorage.getItem(SIPARISLERIM) ?? '[]'); return Array.isArray(j) ? j : [] } catch { return [] }
}
export function siparisiHatirla(s: BenimSiparis) {
  try { localStorage.setItem(SIPARISLERIM, JSON.stringify([s, ...siparislerim().filter(x => x.no !== s.no)].slice(0, 20))) } catch { /* depolama kapalı */ }
}
