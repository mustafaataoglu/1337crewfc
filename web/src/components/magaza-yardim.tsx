import { birimFiyat, stokEtiketi, MagazaHata, siparisiHatirla, siparislerim, type BenimSiparis, type Katalog, type SepetKalem, type Ton, type Urun } from '@/lib/magaza'

// Mağaza ekranlarının ortak hesapları: sepet satırlarının güncel katalogla karşılaştırılması, telefon denetimi

/** Ürün şu an neden sipariş verilemiyor (verilebiliyorsa null) */
export function kapaliNeden(u: Urun, acik: boolean): string | null {
  if (u.siparisAcik) return null
  if (!acik) return 'Mağaza şu an sipariş almıyor'
  return u.satis === 'onsiparis' ? 'Ön sipariş kapandı' : 'Tükendi'
}

/** Kart rozeti; mağaza kapalıyken ön sipariş "kapandı" görünmesin */
export const urunEtiketi = (u: Urun, acik: boolean): { metin: string; ton: Ton } =>
  !acik && u.satis === 'onsiparis' ? { metin: 'Ön sipariş', ton: 'yok' } : stokEtiketi(u)

/** Baskı bilgisi (boşsa undefined) */
export function baskiOku(k: Pick<SepetKalem, 'baski'>) {
  const isim = typeof k.baski?.isim === 'string' ? k.baski.isim.trim() : ''
  const numara = typeof k.baski?.numara === 'string' ? k.baski.numara.trim() : ''
  return isim || numara ? { isim, numara } : undefined
}
/** "Beden L · CREW 21" */
export const kalemYazi = (k: Pick<SepetKalem, 'beden' | 'baski'>) => {
  const b = baskiOku(k)
  return `Beden ${k.beden}${b ? ` · ${b.isim} ${b.numara}` : ''}`
}

export interface Satir {
  k: SepetKalem
  /** sepetteki sırası (sepetAdetAyarla için) */
  i: number
  u?: Urun
  birim: number
  /** sipariş verilemiyorsa nedeni; bu satır gönderilmez */
  sorun: string | null
  /** bu satıra ayrılabilecek en fazla adet (stoklu üründe aynı bedenin önceki satırları düşülmüş) */
  enFazla: number
}
/** Sepetteki her satırı güncel katalogla karşılaştırır: kalkan ürün/beden, kapanan satış, azalan stok */
export function sepetCoz(sepet: SepetKalem[], kat: Katalog): Satir[] {
  const ayrilan = new Map<string, number>()
  return sepet.map((k, i) => {
    const u = kat.urunler.find(x => x.id === k.urun)
    if (!u) return { k, i, birim: 0, sorun: 'Bu ürün artık satışta değil', enFazla: 0 }
    const b = u.bedenler.find(x => x.ad === k.beden)
    const baski = baskiOku(k)
    let sorun = !b ? 'Bu beden artık yok' : kapaliNeden(u, kat.acik)
    if (!sorun && baski) sorun = !u.baski ? 'Bu üründe baskı artık yok' : !baski.isim || !baski.numara ? 'Baskı bilgisi eksik' : null
    let enFazla = 10
    if (b && u.satis === 'stok') {
      const anahtar = `${u.id}|${b.ad}`, once = ayrilan.get(anahtar) ?? 0
      enFazla = Math.min(10, Math.max(0, (b.stok ?? 0) - once))
      if (!sorun && enFazla === 0) sorun = 'Bu beden tükendi'
      if (!sorun) ayrilan.set(anahtar, once + Math.min(k.adet, enFazla))
    }
    return { k, i, u, birim: birimFiyat(u, { baski }), sorun, enFazla }
  })
}

/** Sunucunun kabul ettiği biçimler: 05xx…, 5xx…, 905xx…, +ülke kodu ya da 00ülke kodu */
export function telGecerli(s: string) {
  const t = s.replace(/[\s().-]/g, '')
  if (t.startsWith('+')) return /^\+\d{8,15}$/.test(t)
  return /^0?5\d{9}$/.test(t) || /^905\d{9}$/.test(t) || /^00\d{8,15}$/.test(t)
}

export const hataYazi = (e: unknown) => (e instanceof MagazaHata ? e.message : 'Bir sorun oluştu, tekrar dene')

// Bu sekmede verilen siparişler bellekte de tutulur: tarayıcı depolamaya izin vermese de onay ekranı açılır
let bellekteki: BenimSiparis[] = []
export function siparisiSakla(s: BenimSiparis) {
  bellekteki = [s, ...bellekteki.filter(x => x.no !== s.no)].slice(0, 20)
  siparisiHatirla(s)
}
/** Bu cihazdan verilen siparişler (bozuk kayıtlar atlanır); bu sekmedekiler önce */
export function benimSiparisler(): BenimSiparis[] {
  const kayitli = siparislerim().filter(s => s && typeof s.no === 'string' && typeof s.son4 === 'string')
  return [...bellekteki, ...kayitli.filter(x => !bellekteki.some(b => b.no === x.no))]
}
