// EfendiLig görsellerinin (rakip logoları, arma, oyuncu fotoğrafları, formalar) depodaki kopyası.
// EfendiLig kapansa da site görselsiz kalmasın: her görsel bir kez web/public/efendilig/ altına indirilir (vite site/efendilig/'e
// kopyalar) ve veri.json'a göreli adres ('efendilig/<dosya>') yazılır. Dosya adı EfendiLig yolundan türetilir (adres hangi sunucudan
// gelirse gelsin aynı yol aynı dosya); EfendiLig dosya adları zaman damgası içerdiği için değişen fotoğraf yeni dosya olur, inmiş
// dosya bir daha indirilmez. Oyuncu fotoğrafının adı yolun özetidir (yolda ad soyad ve doğum tarihi var). İnemeyen ve kopyası
// olmayan görselin uzak adresi kalır (görsel yüzünden derleme bozulmaz). Kullanılmayan dosya 30 gün sonra silinir (sync/gorseller.json
// hangi dosyanın ne zamandan beri kullanılmadığını tutar); bir turda çok dosya birden kullanılmaz olursa (eksik senkron) hiç silinmez.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { extname } from 'node:path'

export const S3 = 'https://s3-eu-west-1.amazonaws.com/efendilig/'
const DIR = new URL('../web/public/efendilig/', import.meta.url)
const LISTE = new URL('./gorseller.json', import.meta.url)
const KOK = 'efendilig/'
// Asıllar saklanır (oyuncu fotoğrafı 400 px, logo ve forma en çok 256 px); yalnız bundan büyükler aynı biçimde küçültülür
const EN_BUYUK = 512
const ESZAMANLI = 4
const BEKLEME_GUN = 30
const sharp = createRequire(new URL('../web/package.json', import.meta.url))('sharp')
const sleep = ms => new Promise(r => setTimeout(r, ms))
// Bu turda inemeyen yollar: forma rengi çözümlemesi aynı görseli yeniden beklemesin
const basarisiz = new Set()

const coz = s => { try { return decodeURI(s) } catch { return s } }
// EfendiLig görsel yolu ('optimized/clubs/x.png') ya da adresi → yol; başka adresler null. Sunucu değişse de (S3 bölge ya da
// sanal adres, CDN) yol aynı kalır: '/efendilig/' ya da '/optimized/' sonrası alınır
function yolOf(u) {
  if (!u) return null
  if (!/^[a-z]+:/i.test(u)) return u.replace(/^\/+/, '')
  let a
  try { a = new URL(u) } catch { return null }
  if (!/efendilig|amazonaws\.com$/i.test(a.hostname)) return null
  const p = coz(a.pathname)
  return (p.match(/\/efendilig\/(.+)/) ?? p.match(/\/(optimized\/.+)/) ?? [, p.slice(1)])[1] || null
}
const kaynakOf = u => /^[a-z]+:/i.test(u) ? u : S3 + yolOf(u)
export const dosyaAdi = yol => /(^|\/)players\//.test(yol)
  ? 'oyuncu_' + createHash('sha1').update(yol).digest('hex').slice(0, 16) + extname(yol).replace(/[^A-Za-z0-9.]/g, '')
  : yol.replace(/[^A-Za-z0-9._-]/g, '_')
const dosya = ad => new URL(ad, DIR)

async function indir(yol, url = S3 + yol) {
  if (basarisiz.has(yol)) return null
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(2000 * i)
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (r.status === 403 || r.status === 404) break // dosya yok
      if (!r.ok) continue
      const buf = Buffer.from(await r.arrayBuffer())
      const boy = r.headers.get('content-encoding') ? null : r.headers.get('content-length')
      // Yarım inen yanıt ya da hata sayfası görsel diye kaydedilmesin: boyut ve görselin tamamı çözülerek denetlenir
      if (buf.length && (!boy || Number(boy) === buf.length) && await sharp(buf).stats().then(() => true, () => false)) return buf
    } catch { }
  }
  basarisiz.add(yol)
  return null
}

async function kucult(buf) {
  try {
    const m = await sharp(buf).metadata()
    if (Math.max(m.width ?? 0, m.height ?? 0) <= EN_BUYUK) return buf
    const k = sharp(buf).resize(EN_BUYUK, EN_BUYUK, { fit: 'inside', withoutEnlargement: true })
    const enc = { png: () => k.png({ compressionLevel: 9 }), webp: () => k.webp({ quality: 82 }), jpeg: () => k.jpeg({ quality: 82, mozjpeg: true }) }[m.format]
    if (!enc) return buf
    const yeni = await enc().toBuffer()
    return yeni.length < buf.length ? yeni : buf
  } catch { return buf }
}

/** Görselin baytları: yerel kopya varsa ondan, yoksa EfendiLig'den (forma rengi çözümlemesi için) */
export async function gorselVerisi(u) {
  const yol = yolOf(u)
  if (!yol) throw new Error('EfendiLig görseli değil: ' + u)
  const f = dosya(dosyaAdi(yol))
  if (existsSync(f)) return readFileSync(f)
  const buf = await indir(yol, kaynakOf(u))
  if (!buf) throw new Error('indirilemedi: ' + yol)
  return buf
}

/** Görselleri yerel kopyaya alır. adres(u): 'efendilig/<dosya>', kopya yoksa uzak adres (boşsa undefined) */
export async function gorselleriAynala(liste) {
  mkdirSync(DIR, { recursive: true })
  const kaynak = new Map(), disarida = new Set()
  for (const u of liste) {
    if (!u) continue
    const y = yolOf(u)
    if (!y) disarida.add(u)
    else if (!kaynak.has(y)) kaynak.set(y, kaynakOf(u))
  }
  const yollar = [...kaynak.keys()]
  const yerel = new Map(), stat = { gorsel: yollar.length, indirilen: 0, kucultulen: 0, budanan: 0, bekleyen: 0, hata: [], disarida: [...disarida], uyari: [] }
  const kuyruk = yollar.filter(y => existsSync(dosya(dosyaAdi(y))) ? (yerel.set(y, dosyaAdi(y)), false) : true)
  await Promise.all(Array.from({ length: ESZAMANLI }, async () => {
    for (let y; (y = kuyruk.shift());) {
      const ham = await indir(y, kaynak.get(y))
      if (!ham) { stat.hata.push(y); continue }
      const buf = await kucult(ham)
      if (buf !== ham) stat.kucultulen++
      const ad = dosyaAdi(y), gecici = dosya(ad + '.yeni')
      writeFileSync(gecici, buf)
      renameSync(gecici, dosya(ad))
      yerel.set(y, ad); stat.indirilen++
    }
  }))

  // Budama: kullanılmayan dosya hemen değil BEKLEME_GUN sonra silinir. Bir turda dosyaların beşte birinden fazlası birden
  // kullanılmaz olursa (EfendiLig'den eksik/bozuk veri) o tur hiçbir şey işaretlenmez ve silinmez
  const kullanilan = new Set(yerel.values())
  let bekleyen = {}
  try { bekleyen = JSON.parse(readFileSync(LISTE, 'utf8')) } catch { }
  const once = JSON.stringify(bekleyen)
  const bugun = new Date().toISOString().slice(0, 10)
  const mevcut = readdirSync(DIR, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name)
  const kullanilmayan = new Set(mevcut.filter(f => !kullanilan.has(f)))
  for (const f of Object.keys(bekleyen)) if (!kullanilmayan.has(f)) delete bekleyen[f] // yeniden kullanılan ya da elle silinen
  const yeni = [...kullanilmayan].filter(f => !bekleyen[f])
  if (!stat.gorsel || yeni.length > mevcut.length * 0.2) {
    if (yeni.length) stat.uyari.push(`${mevcut.length} dosyanın ${yeni.length} tanesi birden kullanılmaz oldu, budama atlandı (EfendiLig verisi eksik olabilir; kalıcıysa dosyaları elle silin)`)
  } else {
    for (const f of yeni) bekleyen[f] = bugun
    for (const f of kullanilmayan) {
      if (!((Date.parse(bugun) - Date.parse(bekleyen[f])) / 864e5 >= BEKLEME_GUN)) continue
      unlinkSync(dosya(f)); delete bekleyen[f]; stat.budanan++
    }
  }
  stat.bekleyen = Object.keys(bekleyen).length
  if (!existsSync(LISTE) || JSON.stringify(bekleyen) !== once) writeFileSync(LISTE, JSON.stringify(bekleyen, null, 1) + '\n')
  stat.kb = Math.round(readdirSync(DIR, { withFileTypes: true }).filter(d => d.isFile()).reduce((n, d) => n + statSync(dosya(d.name)).size, 0) / 1024)
  const adres = u => { if (!u) return undefined; const y = yolOf(u); if (!y) return u; const ad = yerel.get(y); return ad ? KOK + ad : kaynakOf(u) }
  return { adres, stat }
}
