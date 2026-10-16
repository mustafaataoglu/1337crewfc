// Eski kulüp blogunu (1337crewfc.blogspot.com, 2010–2020) site içi arşive çevirir. Tek seferlik içe aktarma:
// blog 2020'den beri donuk; tur.sh'a ve iş akışına eklenmez. 2019 öncesi veri ayrı kalır, veri.json'a karışmaz.
//   node sync/arsiv.mjs --kurallar <dosya>   ayıklama kuralları (zorunlu; depo dışında durur, depo herkese açık)
//     --kaynak <klasör>    posts.json/pages.json'u yerel klasörden okur (yoksa Blogger beslemelerini indirir)
//     --inceleme <klasör>  sahibin incelemesi için özet (ozet.md) ve çıkarılan cümleler (cikarilan-cumleler.md); depo dışında olmalı
//     --az-ayiklama        ayar.json'daki beklenen sayılardan az ayıklamaya izin verir (kural bilerek gevşetildiyse)
// Çıktı: web/public/data/arsiv/{liste,sayfalar,<yıl>}.json. Görseller Blogger'dan bağlanır, depoya kopyalanmaz.
// Oyuncu değerlendirme paragrafları, sağlık/özel hayat cümleleri ve ölü bağlantılar (Vimeo, istanbulligi.com,
// pazarligi.com, Facebook...) çıkarılır; kadro/puan, goller, penaltılar, takım anlatımı, foto ve videolar kalır.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = p => new URL(p, import.meta.url)
const BLOG = 'https://1337crewfc.blogspot.com'
const CIKTI = here('../web/public/data/arsiv/')
const AYAR = JSON.parse(readFileSync(here('./arsiv/ayar.json'), 'utf8'))
const arg = ad => { const i = process.argv.indexOf(ad); return i > 0 ? process.argv[i + 1] : null }
const KAYNAK = arg('--kaynak'), INCELEME = arg('--inceleme'), KURALLAR = arg('--kurallar'), AZ = process.argv.includes('--az-ayiklama')
// Ayıklama kuralları ve inceleme çıktısı depoya girmez: depodan kurallar olmadan çıkarılan metin yeniden üretilemesin
const DEPO = fileURLToPath(here('../'))
const depoIci = p => { const r = relative(DEPO, resolve(p)); return !r || (!r.startsWith('..') && !isAbsolute(r)) }
if (!KURALLAR) throw new Error('--kurallar <dosya> gerekli: ayıklama kuralları depo dışındaki dosyada durur')
if (depoIci(KURALLAR) || (INCELEME && depoIci(INCELEME))) throw new Error('--kurallar ve --inceleme depo dışında olmalı')
const KURAL = JSON.parse(readFileSync(KURALLAR, 'utf8'))
for (const k of ['hassas', 'koru', 'ekDegerlendirme', 'ekHassas', 'ekAtla']) if (!KURAL[k]) throw new Error(`kurallar dosyasında ${k} yok`)

// ---- kaynak: Blogger JSON beslemesi ya da yerel kopya
const girdi = e => ({
  id: e.id.$t.split('.post-')[1] ?? e.id.$t.split('.page-')[1], published: e.published.$t, title: e.title.$t,
  url: e.link.find(l => l.rel === 'alternate')?.href, html: e.content?.$t ?? e.summary?.$t ?? ''
})
async function besle(yol) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(BLOG + yol, { signal: AbortSignal.timeout(60000) }); if (r.ok) return await r.json() } catch {}
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error('Besleme alınamadı: ' + yol)
}
async function kaynak() {
  if (KAYNAK) {
    const p = JSON.parse(readFileSync(join(KAYNAK, 'posts.json'), 'utf8'))
    const s = JSON.parse(readFileSync(join(KAYNAK, 'pages.json'), 'utf8'))
    return { yazilar: Array.isArray(p) ? p : p.feed.entry.map(girdi), sayfalar: (s.feed?.entry ?? s).map(e => e.id?.$t ? girdi(e) : e) }
  }
  const yazilar = []
  for (let s = 1; ; s += 150) {
    const j = await besle(`/feeds/posts/default?alt=json&max-results=150&start-index=${s}`)
    const e = j.feed.entry ?? []
    yazilar.push(...e.map(girdi))
    if (e.length < 150) break
  }
  const s = await besle('/feeds/pages/default?alt=json')
  return { yazilar, sayfalar: (s.feed.entry ?? []).map(girdi) }
}

// ---- metin yardımcıları
const VARLIK = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»' }
const coz = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, k) => k[0] === '#' ? String.fromCodePoint(k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : +k.slice(1)) : VARLIK[k.toLowerCase()] ?? m)
const sade = s => s.replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim()
const kucuk = s => s.toLocaleLowerCase('tr')
const buyukBas = s => s ? s[0].toLocaleUpperCase('tr') + s.slice(1) : s
// Ad karşılaştırması: küçük harf, Türkçe harfler ASCII'ye katlanır ("Bahadir" = "Bahadır"), sondaki nokta atılır
const katla = s => kucuk(s).replace(/[ıİ]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/\.$/, '')
const ozetle = s => kucuk(sade(s.normalize('NFC')))
// Çıkarılan/korunan metinler kurallar dosyasında metinle değil kısa özetle (sha1) anılır
const iz = s => createHash('sha1').update(ozetle(s)).digest('hex').slice(0, 10)
const sayi = s => s == null ? null : +String(s).replace(',', '.')
const tarihIst = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const nitelik = a => { const o = {}; for (const m of a.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) o[m[1].toLowerCase()] = coz(m[2] ?? m[3] ?? m[4] ?? ''); return o }

// ---- bağlantı ve medya
const OLU = AYAR.olu.alanlar
const oluMu = u => { const s = kucuk(u ?? ''); return OLU.some(a => s.includes(a)) }
const ytId = u => (u ?? '').match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?(?:[^#]*&)?v=)|youtube\.googleapis\.com\/v\/|youtu\.be\/|img\.youtube\.com\/vi\/|ytimg\.com\/vi\/)([A-Za-z0-9_-]{11})/)?.[1] ?? null
// Yalnız Blogger'da duran görseller (https); boyut kısmı büyük için s1600, küçük için s640/w640
function gorsel(u) {
  if (!u) return null
  u = u.trim().replace(/^\/\//, 'https://').replace(/^http:\/\//i, 'https://')
  let x
  try { x = new URL(u) } catch { return null }
  // ön yüzdeki guvenliResim() ile aynı kural (lib/arsiv.ts): https, kullanıcı/parola/port yok, yalnız Blogger görsel sunucuları
  if (x.protocol !== 'https:' || x.username || x.password || x.port) return null
  if (!/^(?:blogger\.googleusercontent\.com|[a-z0-9]+\.bp\.blogspot\.com)$/.test(x.hostname)) return null
  return x.href
}
function boyut(u, buyuk) {
  const x = new URL(u)
  if (/=[swh]\d/.test(x.pathname)) { x.pathname = x.pathname.replace(/=[^/]*$/, buyuk ? '=s1600' : '=w640'); return x.href }
  const p = x.pathname.split('/')
  const i = p.findLastIndex((s, j) => j < p.length - 1 && /^(?:[swh]\d+|w\d+-h\d+)(?:-[a-z0-9-]+)?$/i.test(s))
  if (i > 0) p[i] = buyuk ? 's1600' : 's640'
  else p.splice(p.length - 1, 0, buyuk ? 's1600' : 's640')
  x.pathname = p.join('/')
  return x.href
}
const gorselAnahtar = u => { const x = new URL(u); return x.pathname.replace(/=[^/]*$/, '').split('/').filter(s => !/^(?:[swh]\d+|w\d+-h\d+)(?:-[a-z0-9-]+)?$/i.test(s)).join('/') }

// ---- HTML'i satır/medya akışına çevir: <br>, <p>, <div>, tablo hücreleri satır böler; boş satır paragraf arasıdır.
// Blogger'ın foto altyazısı hücresindeki (td.tr-caption) satırlar 'alt' işaretlidir.
const BLOK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'blockquote', 'pre', 'center', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'hr'])
function akis(html) {
  const out = []
  let satir = { x: '', linkler: [] }, a = null, atla = 0, pre = 0, alt = false
  const bitir = () => { out.push({ k: 'satir', x: sade(satir.x), linkler: satir.linkler, ...(alt && { alt }) }); satir = { x: '', linkler: [] } }
  const medya = m => { if (sade(satir.x) || satir.linkler.length) bitir(); out.push(m) }
  for (const m of html.matchAll(/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g)) {
    if (m[0].startsWith('<!--')) continue
    if (m[4] != null) {
      if (atla) continue
      // <pre> içinde boş satır paragraf arasıdır; tek satır sonu boşluk sayılır (blogda white-space: normal)
      const parcalar = coz(m[4]).split(pre ? /\r?\n[ \t\u00a0]*\r?\n/ : /(?!)/)
      parcalar.forEach((p, k) => {
        if (k) { bitir(); bitir() }
        const t = p.replace(/\r?\n/g, ' ')
        satir.x += t
        if (a) a.x += t
      })
      continue
    }
    const kapa = m[1] === '/', ad = m[2].toLowerCase(), n = nitelik(m[3] ?? '')
    // eşi olmayan kapanış etiketi sayacı eksiye düşürüp ardındaki metni yutmasın
    if (ad === 'style' || ad === 'script') { atla = Math.max(0, atla + (kapa ? -1 : 1)); continue }
    if (ad === 'br') { bitir(); continue }
    if (ad === 'pre') pre += kapa ? -1 : 1
    if (BLOK.has(ad)) {
      if (sade(satir.x) || satir.linkler.length || ad === 'p' || ad === 'tr') bitir()
      if (ad === 'td') alt = !kapa && /(^|\s)tr-caption(\s|$)/.test(n.class ?? '')
      continue
    }
    if (ad === 'a') {
      if (kapa) { if (a) satir.linkler.push(a); a = null }
      else a = { href: n.href ?? '', x: '' }
      continue
    }
    if (kapa) continue
    if (ad === 'img') {
      const y = ytId(n.src)
      if (y) { medya({ k: 'yt', id: y }); continue }
      const src = gorsel(n.src), buyuk = gorsel(a?.href)
      if (src) medya({ k: 'foto', src: buyuk && gorselAnahtar(buyuk) === gorselAnahtar(src) ? buyuk : src })
      else medya({ k: 'olu', gorsel: true })
      continue
    }
    if (ad === 'iframe' || ad === 'embed' || (ad === 'param' && /^(movie|src)$/i.test(n.name ?? ''))) {
      const u = n.src ?? n.value ?? ''
      const y = ytId(u)
      medya(y ? { k: 'yt', id: y } : { k: 'olu', u })
    }
  }
  bitir()
  return out
}

// ---- satır kalıpları
const AD = String.raw`[\p{L}][\p{L}'’]*\.?(?:\s+[\p{L}][\p{L}'’]*\.?){0,2}`
const PUAN = String.raw`(\d{1,2}(?:[.,]\d{1,2})?)`
const R_OYUNCU = new RegExp(String.raw`^(${AD})\s*[:\-–]?\s+${PUAN}$`, 'u')
const R_YEDEK = new RegExp(String.raw`^\(\s*(?:dk\.?\s*)?(\d{1,3})\s*['’.]?\s*[-:]?\s*(${AD})\s*(?:\)\s*${PUAN}?|${PUAN}\s*\)?)\s*$`, 'iu')
const R_GOL = new RegExp(String.raw`^(?:(\d{1,3})\s*(?:['’.]|\.?\s*dk\.?)?\s+)?(${AD}|k\.\s?k\.?)\s*(\((?:pen\.?|penaltı|p|frikik|kk|k\.k\.|kendi kalesine)\))?\s*(?:\(?\s*(?:asist|ast)\s*[:.]?\s*(${AD})\s*\)?)?\s*(\((?:pen\.?|penaltı)\))?$`, 'iu')
const R_GOLLER = /^(?:goller|gol|goals?)(?![\p{L}])\s*[:;]?\s*(.*)$/iu
const R_PENLER = /^penalt[ıi]lar(?:\s+atışları)?(?![\p{L}])\s*:?\s*(.*)$/iu
const R_IMZA = /^(?:[-–]|.{0,40}\s)?\s*(yazan|değerlendiren|hazırlayan|edit|düzenleyen)\s*[:\-–]?\s*(?:kaptan\s+)?([\p{L}]+)\s*[.!]?$/iu
const R_BASLIK_BILINEN = /^(?:k\.k\.?|kırmızı kart(?:lar)?|sarı kart(?:lar)?|kartlar|maçın özeti|maç özeti|maçın videosu|maç videosu|maç sonu röportajı|maç sonu röportajları|röportaj|maçın fotoğrafları|maçın golleri)\s*[:\-]?$/i
const R_KADRO_BASLIK = /^(?:kadro|ilk ?7|ilk ?11|maç kadrosu)\s*:?$/i
// "Gol ve Asist Bilgisi" altında sıra numaralı, dakikasız gol satırları: "3 Yunus(Alper)"
const R_GOL_ASIST_BASLIK = /^gol ve asist(?: bilgisi)?\s*:?$/i
const R_SIRALI_GOL = new RegExp(String.raw`^(\d{1,2})\s+(${AD})\s*(?:\(\s*(${AD})\s*\))?$`, 'u')
// tek satırda kadro: "İlk 11: Pamir (6.5) – Onur(6.5), Burak(7.5), Selçuk, …"; diziliş çizgileri de ayraçtır
const R_TEK_SATIR_KADRO = /^(?:kadro|[iİ]lk ?7|[iİ]lk ?11)\s*:\s*(.+)$/iu
const R_KADRO_PARCA = new RegExp(String.raw`^(${AD})\s*(?:\(\s*${PUAN}\s*\))?$`, 'u')
const puanOk = p => p != null && p >= 0 && p <= 10

// ---- yazıyı bloklara çevir (ilk geçiş: yapı; değerlendirme/hassas ayıklama sonra)
function yapi(html, isimlerYazi) {
  const ak = akis(html)
  const bloklar = [], ytGoruldu = new Set(), fotoGoruldu = new Set()
  let yazar = null, i = 0, oluSil = 0, oluGorsel = false, oluGomme = false
  const sonBlok = () => bloklar[bloklar.length - 1]
  const satirMi = j => ak[j]?.k === 'satir'
  const sonrakiOluGomme = j => { j++; while (satirMi(j) && !ak[j].x && !ak[j].linkler.length) j++; return ak[j]?.k === 'olu' && !ak[j].gorsel }
  const ekleFoto = src => {
    const anahtar = gorselAnahtar(src)
    if (fotoGoruldu.has(anahtar)) return
    fotoGoruldu.add(anahtar)
    const g = { src: boyut(src, true), k: boyut(src, false) }
    const s = sonBlok()
    if (s?.t === 'foto' && s._bitisik) s.r.push(g)
    else bloklar.push({ t: 'foto', r: [g], _bitisik: true })
  }
  const ekleYt = id => { if (ytGoruldu.has(id) || AYAR.olu.youtube.includes(id)) return; ytGoruldu.add(id); bloklar.push({ t: 'yt', id }) }
  const metin = x => { const s = sonBlok(); if (s?.t === 'foto') s._bitisik = false; bloklar.push({ t: 'p', x }) }
  while (i < ak.length) {
    const e = ak[i]
    if (e.k === 'foto') { ekleFoto(e.src); oluGorsel = oluGomme = false; i++; continue }
    if (e.k === 'yt') { ekleYt(e.id); oluGorsel = oluGomme = false; i++; continue }
    if (e.k === 'olu') { oluSil++; oluGorsel = !!e.gorsel; oluGomme = !e.gorsel; i++; continue }
    // ölü fotoğrafın altyazısı fotoğrafla birlikte gider
    if (e.alt && oluGorsel) { i++; continue }
    // iki ölü gömmenin (Vimeo) arasındaki kısa satır ikincisinin başlığıdır: "Haftanın Golü Seçilen …"
    if (e.x && oluGomme && e.x.length <= 80 && !/[.!?…]$/.test(e.x) && !e.linkler.length && sonrakiOluGomme(i)) { oluSil++; i++; continue }
    if (e.x) oluGorsel = oluGomme = false
    // satır: bağlantıları ayıkla
    let x = e.x
    let olu = false
    const ytler = []
    for (const l of e.linkler) {
      const y = ytId(l.href)
      if (y) { ytler.push(y); x = x.replace(sade(l.x), ' '); continue }
      if (oluMu(l.href)) olu = true
    }
    // alıntı künyesindeki ölü alan adı sitenin adına döner: "www.istanbulligi.com'dan alıntıdır" → "İstanbul Ligi sitesinden alıntıdır"
    x = x.replace(/(?:https?:\/\/)?(?:www\.)?(istanbulligi|pazarligi)\.com\/?['’]dan alıntı/gi, (_, a) => `${kucuk(a) === 'pazarligi' ? 'Pazarligi' : 'İstanbul Ligi'} sitesinden alıntı`)
    if (/https?:\/\/|www\./i.test(x)) { if (/vimeo|istanbulligi|pazarligi|facebook|1337crewfc\.com|easy-share|lineupbuilder/i.test(x)) olu = true; x = x.replace(/(?:https?:\/\/|www\.)\S+/gi, ' ') }
    if (/\b(?:vimeo|facebook)\b/i.test(x)) olu = true
    x = sade(x)
    if (ytler.length) { if (x && !olu) metin(x); ytler.forEach(ekleYt); i++; continue }
    if (olu) {
      // ölü bağlantılı kısa satır (etiket + link, "buraya tıklayın" vb.) tümden gider; önceki "…:" etiketi de
      if (x.length < 140) {
        oluSil++
        const s = sonBlok()
        if (s && (s.t === 'h' || (s.t === 'p' && s.x.length < 100 && /:$/.test(s.x)))) bloklar.pop()
        i++; continue
      }
    }
    if (!x) { const s = sonBlok(); if (s?.t === 'p') s._son = true; i++; continue }
    const im = x.match(R_IMZA)
    if (im && x.length <= 60) { if (!yazar && !/^(edit|düzenleyen)$/i.test(im[1])) yazar = buyukBas(im[2]); i++; continue }
    // kadro: art arda en az 6 "Ad puan" / "(dk. N Ad) puan" satırı
    if (R_KADRO_BASLIK.test(x) && satirMi(i + 1) && R_OYUNCU.test(ak[i + 1].x)) { i++; continue }
    const ts = x.match(R_TEK_SATIR_KADRO)
    if (ts) {
      const r = ts[1].split(/\s*[,–—]\s*|\s+-\s+/).map(p => p.match(R_KADRO_PARCA))
      if (r.length >= 6 && r.every(m => m && (m[2] == null || puanOk(sayi(m[2]))))) {
        const k = r.map(m => ({ ad: buyukBas(sade(m[1])), p: sayi(m[2]), dk: null }))
        bloklar.push({ t: 'kadro', r: k }); k.forEach(s => isimlerYazi.add(katla(s.ad))); i++; continue
      }
    }
    if (R_OYUNCU.test(x)) {
      let j = i
      const r = []
      while (satirMi(j)) {
        if (!ak[j].x) {
          // satırlar arasına boş satır karışmışsa ardından yine kadro satırı geliyorsa sürer
          let k = j
          while (satirMi(k) && !ak[k].x && !ak[k].linkler.length) k++
          if (r.length && satirMi(k) && (R_OYUNCU.test(ak[k].x) || R_YEDEK.test(ak[k].x))) { j = k; continue }
          break
        }
        const t = ak[j].x, o = t.match(R_OYUNCU), y = t.match(R_YEDEK)
        if (y && r.length) r.push({ ad: buyukBas(sade(y[2])), p: sayi(y[3] ?? y[4]), dk: +y[1] })
        else if (o && puanOk(sayi(o[2]))) r.push({ ad: buyukBas(sade(o[1])), p: sayi(o[2]), dk: null })
        else break
        j++
      }
      if (r.length >= 6 && r.every(s => s.p == null || puanOk(s.p))) {
        bloklar.push({ t: 'kadro', r }); r.forEach(s => isimlerYazi.add(katla(s.ad))); i = j; continue
      }
    }
    // başlığın (Goller/Penaltılar) ardından gelen satırlar; başlıkla ilk satır arasındaki boşluklar atlanır
    const altSatirlar = (ilk, j) => {
      const r = ilk ? [ilk] : []
      if (!ilk) while (satirMi(j) && !ak[j].x && ak[j].linkler.length === 0) j++
      const bas = j
      while (satirMi(j) && ak[j].x) r.push(ak[j].x), j++
      return { r, bas }
    }
    // goller: dakikasız satır yalnız asistliyse ya da blogun kadrolarında geçen bir adsa kabul edilir;
    // araya boş satır girse de ardından dakikası daha büyük bir gol satırı geliyorsa liste sürer
    const golSatiri = t => {
      const g = t.match(R_GOL)
      if (!g || R_PENLER.test(t) || R_GOLLER.test(t) || R_BASLIK_BILINEN.test(kucuk(t))) return null
      const ad = sade(g[2]), bilinen = /^k\.?\s?k\.?$/i.test(ad) || isimlerYazi.has(katla(ad)) || isimlerYazi.has(katla(ad.split(' ')[0]))
      if (!g[1] && !g[4] && !bilinen) return null
      const not = g[3] ?? g[5]
      return { dk: g[1] ? +g[1] : null, ad: buyukBas(ad) + (not ? ' ' + not : ''), asist: g[4] ? buyukBas(sade(g[4])) : null }
    }
    if (R_GOL_ASIST_BASLIK.test(x)) {
      const { r: satirlar, bas } = altSatirlar('', i + 1)
      const r = []
      for (const t of satirlar) {
        const m = t.match(R_SIRALI_GOL)
        if (!m || +m[1] !== r.length + 1) break
        r.push({ dk: null, ad: buyukBas(sade(m[2])), asist: m[3] ? buyukBas(sade(m[3])) : null })
      }
      if (r.length && r.length === satirlar.length) { bloklar.push({ t: 'goller', r }); i = bas + r.length; continue }
    }
    // yazının sonunda başlıksız duran gol satırları ("Yunus" / "Mehmet (asist: Selçuk)"): en az biri asistliyse
    {
      const r = []
      let j = i
      while (satirMi(j) && ak[j].x) { const g = golSatiri(ak[j].x); if (!g) break; r.push(g); j++ }
      let k = j
      while (satirMi(k) && !ak[k].x && !ak[k].linkler.length) k++
      if (r.length >= 2 && r.some(g => g.asist) && k >= ak.length) { bloklar.push({ t: 'goller', r }); i = j; continue }
    }
    const gb = x.match(R_GOLLER)
    const gbOk = gb && (!sade(gb[1]) || R_GOL.test(sade(gb[1])))
    if (gbOk || (sonBlok()?.t === 'kadro' && /^\d{1,3}\s/.test(x) && R_GOL.test(x))) {
      const ilk = gbOk ? sade(gb[1]) : x
      const r = []
      const ilkGol = ilk ? golSatiri(ilk) : null
      if (!ilk || ilkGol) {
        if (ilkGol) r.push(ilkGol)
        let son = i, j = i + 1
        while (satirMi(j)) {
          if (!ak[j].x) {
            let k = j
            while (satirMi(k) && !ak[k].x && !ak[k].linkler.length) k++
            const s = satirMi(k) && ak[k].x.match(/^(\d{1,3})\s/)
            if (!r.length || (s && +s[1] >= (r[r.length - 1].dk ?? 0) && golSatiri(ak[k].x))) { j = k; continue }
            break
          }
          const g = golSatiri(ak[j].x)
          if (!g) break
          r.push(g); son = j; j++
        }
        if (r.length) { bloklar.push({ t: 'goller', r }); i = son + 1; continue }
        bloklar.push({ t: 'h', x: 'Goller' }); i++; continue
      }
    }
    // penaltılar: "+ Ad" / "Ad -" / "Ad" / "A, B, C"
    const pb = x.match(R_PENLER)
    if (pb) {
      const ilk = sade(pb[1])
      const { r: satirlar, bas } = altSatirlar(ilk, i + 1)
      const r = []
      let n = 0
      const tek = new RegExp(String.raw`^(?:([+\-–])\s*(${AD})|(${AD})\s*([+\-–])?)$`, 'u')
      for (const t of satirlar) {
        const parca = t.includes(',') ? t.split(',').map(sade).filter(Boolean) : [t]
        const sat = parca.map(p => p.match(tek))
        if (sat.some(s => !s) || (parca.length > 1 && sat.some(s => s[1] || s[4]))) break
        for (const s of sat) { const isaret = s[1] ?? s[4]; r.push({ ad: buyukBas(sade(s[2] ?? s[3])), gol: isaret ? isaret === '+' : null }) }
        n++
      }
      if (r.length) { bloklar.push({ t: 'penaltilar', r }); i = ilk ? i + n : bas + n; continue }
      if (!ilk) { bloklar.push({ t: 'h', x: 'Penaltılar' }); i++; continue }
    }
    if (R_BASLIK_BILINEN.test(kucuk(x)) || (x.length <= 40 && /:$/.test(x) && !/[.!?]/.test(x.slice(0, -1)) && !/alıntı/i.test(x))) {
      bloklar.push({ t: 'h', x: buyukBas(x.replace(/\s*[:\-]$/, '')) }); i++; continue
    }
    metin(x)
    i++
  }
  return { bloklar, yazar, oluSil }
}

// Tek <br> ile bölünmüş cümleleri birleştir (Word/e-posta yapıştırmaları): önceki satır noktalamasız, sonraki küçük harfle başlıyorsa
function birlestir(bloklar) {
  const out = []
  for (const b of bloklar) {
    const s = out[out.length - 1]
    if (b.t === 'p' && s?.t === 'p' && !s._son && !/[.!?…:;)"”]$/.test(s.x) && /^[\p{Ll}]/u.test(b.x)) { s.x += ' ' + b.x; s._son = b._son; continue }
    out.push(b)
  }
  return out
}

// ---- oyuncu değerlendirme paragrafı: "Ad, …" / "Ad: …" (Selçuk biçimi); ad blogun kadrolarında geçiyorsa
function degerlendirmeMi(x, isimler) {
  const m = x.match(/^([\p{Lu}][\p{L}'’]*\.?)(?:\s+([\p{L}][\p{L}'’]*\.?))?\s*(?:\(\s*\d{1,2}(?:[.,]\d)?\s*\))?\s*([,:;])\s*(.*)$/u)
  if (!m) return null
  const var_ = s => isimler.has(katla(s))
  let ad = null
  if (m[2] && var_(m[1] + ' ' + m[2])) ad = m[1] + ' ' + m[2]
  else if (!m[2] && var_(m[1])) ad = m[1]
  if (!ad || m[4].length < 25) return null
  return ad
}

// ---- hassas cümleler (sağlık, beden, askerlik, özel hayat)
const HASSAS = KURAL.hassas.map(s => new RegExp(s, 'iu'))
const KORU = new Set(KURAL.koru)
const cumleler = x => x.split(/(?<=[.!?…])\s+(?=["“„'(]?[\p{Lu}\d])/u)
const hassasMi = s => HASSAS.some(r => r.test(kucuk(s)))

// ---- statik sayfa tabloları
function tablolar(html) {
  const out = []
  for (const t of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const satirlar = [...t[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(r => [...r[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => sade(coz(c[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')))))
    out.push(satirlar)
  }
  return out
}
const R_PUAN_SATIR = /^(\d+)\.\s+(.+?)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)$/
function sayfaBloklari(html) {
  const bloklar = []
  for (const parca of html.split(/(<table[\s\S]*?<\/table>)/i)) {
    if (!/^<table/i.test(parca)) { for (const e of akis(parca)) if (e.k === 'satir' && e.x && !/https?:\/\//.test(e.x)) bloklar.push({ t: 'p', x: e.x }); continue }
    const satirlar = tablolar(parca)[0] ?? []
    // boş satırlar tabloyu gruplara böler (puan durumu, maçlar, oyuncu istatistikleri)
    const gruplar = [[]]
    for (const r of satirlar) r.some(Boolean) ? gruplar[gruplar.length - 1].push(r) : gruplar.push([])
    const dolular = gruplar.filter(g => g.length)
    const oyuncuMu = g => /^(MAÇ|DK)$/.test(g[0][1] ?? '')
    // oyuncu tablosunun altındaki ilk hücresi boş ortalama satırı ayrı gruba düşmüşse tabloya geri katılır
    const birlesik = dolular.reduce((o, g) => { const s = o[o.length - 1]; if (s && oyuncuMu(s) && g.every(r => !r[0])) s.push(...g); else o.push(g); return o }, [])
    for (const g of birlesik) {
      const bas = g[0].filter(Boolean)
      if (bas.length === 1 && /^G\s+B\s+M\s+A\s+Y\s+P\s+Av\.?$/.test(bas[0])) {
        const r = g.slice(1).map(s => s.filter(Boolean).join(' ').match(R_PUAN_SATIR)).filter(Boolean).map(m => m.slice(1))
        if (r.length === g.length - 1) { bloklar.push({ t: 'tablo', baslik: 'Puan durumu', r: [['Sıra', 'Takım', 'G', 'B', 'M', 'A', 'Y', 'P', 'Av.'], ...r] }); continue }
      }
      if (g.every(s => s.filter(Boolean).length === 3 && /hafta|playoff|play-off|tur/i.test(s[0]))) {
        bloklar.push({ t: 'tablo', baslik: 'Maçlar', r: [['Hafta', 'Maç', 'Sonuç'], ...g.map(s => s.slice(0, 3))] }); continue
      }
      const genislik = Math.max(...g.map(s => s.length))
      let r = g.map(s => [...s, ...Array(genislik - s.length).fill('')])
      // tümüyle boş sütunlar atılır
      const dolu = r[0].map((_, j) => r.some(s => s[j]))
      r = r.map(s => s.filter((_, j) => dolu[j]))
      const oyuncu = oyuncuMu(g)
      if (oyuncu && !r[0][0]) r[0][0] = 'Oyuncu'
      if (oyuncu) r = r.map((s, j) => j && !s[0] ? ['Ortalama', ...s.slice(1)] : s)
      bloklar.push({ t: 'tablo', baslik: oyuncu ? 'Oyuncu istatistikleri' : null, r })
    }
  }
  return bloklar
}

// Düz metin sıralama listesi (ör. "1 Takım Taklavat 27,0138 4") başlık satırı varsa tabloya dönüşür.
// "… puan durumu" başlığının (h) altındaki "1 Teoman SK 18 35" satırları: takım, puan, averaj
function metinTablolari(bloklar) {
  const out = []
  const sira = s => s?.t === 'p' && /^\d{1,2}\.?\s+\S.*\s-?\d+(?:,\d+)?$/.test(s.x)
  for (let i = 0; i < bloklar.length; i++) {
    const b = bloklar[i]
    const puanDurumu = b.t === 'h' && /puan durumu$/i.test(b.x)
    if ((puanDurumu || (b.t === 'p' && !/\d/.test(b.x) && b.x.split(' ').length >= 3)) && sira(bloklar[i + 1])) {
      let j = i + 1
      const satirlar = []
      while (sira(bloklar[j]) && +bloklar[j].x.match(/^\d+/)[0] === satirlar.length + 1) satirlar.push(bloklar[j++].x.split(' '))
      // satır sonundaki sayı sütunlarının sayısı: satırların çoğunda geçerli olan değer ("Crew 1337 7,0526 4" adında sayı olsa da)
      const kuyruk = t => { let n = 0; while (n < t.length - 2 && /^-?\d+(?:,\d+)?$/.test(t[t.length - 1 - n])) n++; return n }
      const say = {}
      satirlar.forEach(t => { const n = kuyruk(t); say[n] = (say[n] ?? 0) + 1 })
      const k = +Object.entries(say).sort((x, y) => y[1] - x[1])[0]?.[0]
      const kelime = b.x.split(' ')
      if (satirlar.length >= 5 && k >= 1 && satirlar.every(t => kuyruk(t) >= k) && (puanDurumu ? k === 2 : kelime.length >= k + 1)) {
        const r = satirlar.map(t => [t[0].replace(/\.$/, ''), t.slice(1, t.length - k).join(' '), ...t.slice(t.length - k)])
        const bas = puanDurumu ? ['#', 'Takım', 'P', 'Av.'] : ['#', ...kelime.slice(0, k), kelime.slice(k).join(' ')]
        out.push({ t: 'tablo', baslik: puanDurumu ? b.x : null, r: [bas, ...r] }); i = j - 1; continue
      }
    }
    out.push(b)
  }
  return out
}

// ---- ana akış
const { yazilar: hamYazilar, sayfalar: hamSayfalar } = await kaynak()
const zaman = y => Date.parse(y.published)
hamYazilar.sort((a, b) => zaman(a) - zaman(b) || a.id.localeCompare(b.id))
const SINIF = AYAR.yazilar
const eksik = hamYazilar.filter(y => !SINIF[y.id]?.lig || !SINIF[y.id]?.tur)
if (eksik.length) throw new Error('ayar.json sınıflandırması eksik: ' + eksik.map(y => y.id + ' ' + y.title).join(', '))
// besleme yarıda kesildiyse eski arşiv daha küçüğüyle değişmesin
const gelen = new Set(hamYazilar.map(y => y.id))
const gelmeyen = Object.keys(SINIF).filter(id => !gelen.has(id))
if (gelmeyen.length || !hamSayfalar.length) throw new Error(`Kaynak eksik: ${gelmeyen.length} yazı gelmedi (${gelmeyen.slice(0, 5).join(', ')}), ${hamSayfalar.length} sayfa`)

// 1) yapı ve blogdaki tüm kadro/gol adları
const isimler = new Set(AYAR.ekIsimler.map(katla))
const ara = hamYazilar.map(y => {
  const adlar = new Set()
  const s = yapi(y.html, adlar)
  for (const b of s.bloklar) {
    if (b.t === 'goller') b.r.forEach(g => { adlar.add(kucuk(g.ad.replace(/\s*\(.*$/, ''))); if (g.asist) adlar.add(kucuk(g.asist)) })
    if (b.t === 'penaltilar') b.r.forEach(p => adlar.add(kucuk(p.ad)))
  }
  for (const a of adlar) { const k = katla(a); isimler.add(k); isimler.add(k.split(' ')[0]) }
  return { y, ...s }
})
// ikinci geçiş: gol satırlarındaki dakikasız adlar için tüm blogun kadro adları bilinsin
for (const a of ara) { const s = yapi(a.y.html, new Set(isimler)); a.bloklar = s.bloklar; a.yazar = s.yazar; a.oluSil = s.oluSil }

// 2) değerlendirme ve hassas cümle ayıklama. ekHassas: elle seçilen hassas cümleler; ekAtla: kaldırılan video,
// bağlantı ya da değerlendirmeye gönderme yapan cümle/paragraflar. İkisi de sahibin incelemesine girer;
// sor: arşivde kalıp yalnız incelemede sahibin kararına sunulan cümleler
const sayac = { degerlendirme: {}, hassas: 0, yazilarDeg: 0, atla: 0 }
const inceleme = []
const sonuc = []
// elle seçilen her kod kaynakta bir metne denk gelmeli; metin değişince kural sessizce boşa düşmesin
const tutan = new Set()
for (const a of ara) {
  const { y } = a
  const ek = KURAL.ekDegerlendirme[y.id] ?? [], ekH = KURAL.ekHassas[y.id] ?? [], ekA = KURAL.ekAtla[y.id] ?? [], sor = KURAL.sor?.[y.id] ?? []
  const tut = (liste, h) => { if (liste.includes(h)) { tutan.add(`${y.id}:${h}`); return true } return false }
  const koru = h => { if (KORU.has(h)) { tutan.add('koru:' + h); return true } return false }
  const yil = tarihIst(y.published).slice(0, 4)
  const cikan = [], atlanan = [], sorulan = []
  let degSay = 0
  const degerlendirmeler = []
  let bloklar = metinTablolari(birlestir(a.bloklar))
  bloklar = bloklar.flatMap(b => {
    if (b.t !== 'p') return [b]
    const h = iz(b.x)
    if (!koru(h)) {
      const ad = degerlendirmeMi(b.x, isimler)
      if (tut(ek, h) || ad) { degSay++; degerlendirmeler.push({ ad, x: b.x }); return [{ t: '_deg' }] }
    }
    if (tut(ekA, h)) { sayac.atla++; atlanan.push({ x: b.x, iz: h }); return [] }
    const elH = tut(ekH, h)
    const kalan = []
    for (const c of cumleler(b.x)) {
      const ch = iz(c)
      if (tut(ekA, ch)) { sayac.atla++; atlanan.push({ x: c, iz: ch }) }
      else if (!koru(ch) && (tut(ekH, ch) || elH || hassasMi(c))) cikan.push({ x: c, iz: ch, el: !hassasMi(c) })
      else { kalan.push(c); if (tut(sor, ch)) sorulan.push({ x: c, iz: ch }) }
    }
    if (!kalan.length) return []
    return [{ ...b, x: kalan.join(' ') }]
  })
  // kadrosu ayrı yazılmamış Selçuk biçimi yazılarda puanlar değerlendirmenin sonunda "(6.5)" olarak durur
  const R_SON_PUAN = /\(\s*(\d{1,2}(?:[.,]\d)?|\?)\s*\)\s*$/
  if (!bloklar.some(b => b.t === 'kadro') && degerlendirmeler.filter(d => R_SON_PUAN.test(d.x)).length >= 5) {
    const r = degerlendirmeler.filter(d => d.ad).map(d => { const p = d.x.match(R_SON_PUAN)?.[1]; return { ad: buyukBas(d.ad), p: p && p !== '?' ? sayi(p) : null, dk: null } })
    bloklar.splice(bloklar.findIndex(b => b.t === '_deg'), 0, { t: 'kadro', r })
  }
  bloklar = bloklar.filter(b => b.t !== '_deg')
  // öksüz başlıklar: ardından içerik gelmeyen ya da medyası kalmamış video/foto başlıkları
  bloklar = bloklar.filter((b, j) => {
    if (b.t !== 'h') return true
    const s = bloklar[j + 1]
    if (!s || s.t === 'h') return false
    if (/özet|video|röportaj|görüntü/i.test(b.x) && s.t !== 'yt') return false
    if (/fotoğraf|galeri/i.test(b.x) && s.t !== 'foto') return false
    return true
  })
  // ayıklamadan sonra yan yana kalan foto blokları birleşir
  bloklar = bloklar.reduce((o, b) => { const s = o[o.length - 1]; if (b.t === 'foto' && s?.t === 'foto') s.r = [...s.r, ...b.r]; else o.push({ ...b }); return o }, [])
  bloklar = bloklar.map(({ _son, _bitisik, ...b }) => b)
  sayac.degerlendirme[yil] = (sayac.degerlendirme[yil] ?? 0) + degSay
  if (degSay) sayac.yazilarDeg++
  sayac.hassas += cikan.length
  if (INCELEME && (cikan.length || atlanan.length || sorulan.length)) inceleme.push({ tarih: tarihIst(y.published), baslik: sade(y.title), url: y.url, cikan, atlanan, sorulan })
  sonuc.push({ y, bloklar, yazar: a.yazar, degSay, hassas: cikan.length, oluSil: a.oluSil })
}

// 3) liste ve yıllık dosyalar
// Özet: ilk uzun paragraftan başlar; yoksa foto altyazısı olmayan ilk kısa paragraftan
const ozetMetni = bloklar => {
  let bas = bloklar.findIndex(b => b.t === 'p' && b.x.length >= 80)
  if (bas < 0) bas = bloklar.findIndex((b, j) => b.t === 'p' && b.x.length >= 30 && bloklar[j - 1]?.t !== 'foto')
  if (bas < 0) return ''
  let s = bloklar.slice(bas).filter(b => b.t === 'p').map(b => b.x).join(' ')
  if (s.length <= 180) return s
  s = s.slice(0, 179)
  return s.slice(0, s.lastIndexOf(' ')).replace(/[\s,;:.–-]+$/, '') + '…'
}
const yillik = {}, liste = [], bos = []
for (const { y, bloklar, yazar } of sonuc) {
  if (!bloklar.length) { bos.push(y); continue }
  const s = SINIF[y.id], tarih = tarihIst(y.published)
  const fotolar = bloklar.filter(b => b.t === 'foto').flatMap(b => b.r)
  ;(yillik[tarih.slice(0, 4)] ??= {})[y.id] = bloklar
  liste.push({
    id: y.id, tarih, baslik: sade(y.title), lig: s.lig, sezon: s.sezon ?? null, tur: s.tur,
    skor: s.skor ?? null, pen: s.pen ?? null, hukmen: !!s.hukmen, rakip: s.rakip ?? null,
    ozet: ozetMetni(bloklar), kapak: fotolar[0]?.k ?? null, foto: fotolar.length, video: bloklar.filter(b => b.t === 'yt').length,
    yazar: yazar && kucuk(yazar) !== 'berk' ? yazar : null, eski: new URL(y.url).pathname
  })
}
// sonuc eskiden yeniye sıralı; liste yeniden eskiye
liste.reverse()

const sayfaSira = s => /toplam/i.test(s.title) ? 0 : 100 - (+s.title.match(/(\d+)\. Sezon/)?.[1] || 0)
const sayfalar = hamSayfalar.map(s => ({ s, slug: new URL(s.url).pathname.replace(/^\/p\/|\.html$/g, '') })).sort((a, b) => sayfaSira(a.s) - sayfaSira(b.s) || a.slug.localeCompare(b.slug))
const sayfaVeri = {}
for (const { s, slug } of sayfalar) sayfaVeri['s-' + slug] = sayfaBloklari(s.html)

const ligler = AYAR.ligler.filter(l => liste.some(y => y.lig === l.id) || (l.id === 'pazarligi' && sayfalar.length))
const listeJson = {
  kaynak: BLOG + '/', ligler, onecikan: AYAR.onecikan.filter(o => liste.some(y => y.id === o.id)),
  yazilar: liste,
  sayfalar: sayfalar.map(({ s, slug }) => ({ id: 's-' + slug, baslik: sade(s.title), lig: 'pazarligi', eski: new URL(s.url).pathname }))
}

const tutmayan = [
  ...['ekDegerlendirme', 'ekHassas', 'ekAtla', 'sor'].flatMap(k => Object.entries(KURAL[k] ?? {}).flatMap(([id, l]) => l.filter(h => !tutan.has(`${id}:${h}`)).map(h => `${k} ${id} ${h}`))),
  ...KURAL.koru.filter(h => !tutan.has('koru:' + h)).map(h => 'koru ' + h)
]
if (tutmayan.length) throw new Error('Kaynakta karşılığı kalmayan kural kodu (metin değişmiş olabilir): ' + tutmayan.join(', '))
// Eksik ya da boş kurallar dosyası çıkarılan metni sessizce geri yayınlamasın: ayıklama sayıları yayındakinden az olamaz
const sayilar = { degerlendirme: Object.values(sayac.degerlendirme).reduce((a, b) => a + b, 0), hassas: sayac.hassas, atla: sayac.atla }
const azalan = Object.entries(AYAR.beklenen ?? {}).filter(([k, v]) => sayilar[k] < v)
if (azalan.length && !AZ) throw new Error('Ayıklama beklenenden az (' + azalan.map(([k, v]) => `${k} ${sayilar[k]} < ${v}`).join(', ') + '): kurallar dosyası eksik olabilir. Bilerek gevşetildiyse --az-ayiklama')
if (JSON.stringify(sayilar) !== JSON.stringify(AYAR.beklenen)) console.log('Ayıklama sayıları ayar.json beklenen alanından farklı, güncelleyin:', JSON.stringify(sayilar))

rmSync(CIKTI, { recursive: true, force: true })
mkdirSync(CIKTI, { recursive: true })
const yaz = (ad, v) => { writeFileSync(new URL(ad, CIKTI), JSON.stringify(v) + '\n'); return Buffer.byteLength(JSON.stringify(v)) }
const boyutlar = { 'liste.json': yaz('liste.json', listeJson), 'sayfalar.json': yaz('sayfalar.json', sayfaVeri) }
// yıllık dosyalarda yazılar eskiden yeniye (yazı kimlikleri dizi sırası sayılmayacak kadar uzun, ekleme sırası korunur)
for (const yil of Object.keys(yillik).sort()) boyutlar[yil + '.json'] = yaz(yil + '.json', yillik[yil])
const toplam = Object.values(boyutlar).reduce((a, b) => a + b, 0)
console.log(`Arşiv hazır: ${liste.length} yazı, ${sayfalar.length} sayfa, ${Math.round(toplam / 1024)} KB ·`, Object.entries(boyutlar).map(([k, v]) => `${k} ${Math.round(v / 1024)}K`).join(', '))
if (bos.length) console.log('İçeriği kalmayan yazılar atlandı:', bos.map(y => `${tarihIst(y.published)} ${sade(y.title)}`).join(' | '))

// 4) sahibin incelemesi (yalnız depo dışına)
if (INCELEME) {
  mkdirSync(INCELEME, { recursive: true })
  let md = '# Arşivden çıkarılan cümleler\n\nSağlık, sakatlık, beden, askerlik, eğitim/yurt dışı ve özel hayatla ilgili olduğu için arşive alınmayan cümleler. ' +
    '"(elle)" işaretliler kurala değil elle seçime dayanır: takım anlatımı içindeki adlı oyuncu değerlendirmeleri, rakip oyuncuların tam adıyla ceza bilgisi, beden tarifleri. ' +
    '"(gönderme)" işaretliler kaldırılan video, bağlantı ya da değerlendirmeye gönderme yaptığı için çıkarıldı. ' +
    '"(kaldı, karar sizin)" işaretliler arşivde duruyor: adlı hata ya da kaçan pozisyon anlatımı; çıkarılsın denirse kodu kurallar dosyasında `sor`dan `ekHassas`a taşıyın. ' +
    'Bir cümlenin kalması istenirse yanındaki kodu kurallar dosyasındaki `koru` listesine ekleyin (ekAtla için oradan silin) ve betiği yeniden çalıştırın.\n'
  for (const k of inceleme) {
    md += `\n## ${k.tarih} · ${k.baslik}\n${k.url}\n\n`
    for (const c of k.cikan) md += `- ${c.el ? '(elle) ' : ''}${c.x} \`${c.iz}\`\n`
    for (const c of k.atlanan) md += `- (gönderme) ${c.x} \`${c.iz}\`\n`
    for (const c of k.sorulan) md += `- (kaldı, karar sizin) ${c.x} \`${c.iz}\`\n`
  }
  writeFileSync(join(INCELEME, 'cikarilan-cumleler.md'), md)
  const baslikSkor = t => { const m = t.match(/(\d+)\s*[-–]\s*(\d+)/); return m ? [+m[1], +m[2]] : null }
  const maclar = liste.filter(l => l.tur === 'mac')
  let oz = `# Arşiv özeti\n\n- Yazı: ${hamYazilar.length} (arşivde ${liste.length}; içeriği kalmadığı için atlanan ${bos.length})\n- Statik sayfa: ${sayfalar.length}\n`
  oz += `- Tür: ${['mac', 'istatistik', 'haber'].map(t => `${t} ${liste.filter(l => l.tur === t).length}`).join(', ')}\n`
  oz += `- Lig: ${ligler.map(l => `${l.id} ${liste.filter(y => y.lig === l.id).length}`).join(', ')}\n`
  oz += `- Çıkarılan oyuncu değerlendirme paragrafı: ${Object.values(sayac.degerlendirme).reduce((a, b) => a + b, 0)} (${sayac.yazilarDeg} yazıda) · yıllara göre: ${Object.entries(sayac.degerlendirme).map(([k, v]) => `${k} ${v}`).join(', ')}\n`
  oz += `- Çıkarılan hassas cümle: ${sayac.hassas} · gönderme yaptığı içerik kalkan cümle/paragraf: ${sayac.atla}\n`
  oz += `- Ölü bağlantı/gömme satırı: ${sonuc.reduce((a, s) => a + s.oluSil, 0)}\n`
  oz += `- Foto: ${liste.reduce((a, l) => a + l.foto, 0)} · YouTube: ${liste.reduce((a, l) => a + l.video, 0)}\n`
  oz += `- Skor: ${maclar.filter(l => l.skor).length} maçta var, ${maclar.filter(l => !l.skor).length} maçta boş\n\n## Skoru boş bırakılan maçlar\n\n`
  for (const l of maclar.filter(l => !l.skor)) oz += `- ${l.tarih} · ${l.baslik} — ${SINIF[l.id].not ?? 'güvenilir skor yok'}\n`
  oz += '\n## Başlıktan farklı yazılan skorlar\n\n'
  for (const l of maclar.filter(l => l.skor && String(baslikSkor(l.baslik)) !== String(l.skor))) oz += `- ${l.tarih} · ${l.baslik} → ${l.skor.join('-')}${l.pen ? ` (pen. ${l.pen.join('-')})` : ''} — ${SINIF[l.id].not ?? ''}\n`
  oz += '\n## Notlu sınıflandırmalar\n\n'
  for (const l of liste.filter(l => SINIF[l.id].not && l.skor && String(baslikSkor(l.baslik)) === String(l.skor))) oz += `- ${l.tarih} · ${l.baslik} — ${SINIF[l.id].not}\n`
  if (bos.length) oz += `\n## Atlanan yazılar\n\n${bos.map(y => `- ${tarihIst(y.published)} · ${sade(y.title)}`).join('\n')}\n`
  oz += `\n## Dosya boyutları\n\n${Object.entries(boyutlar).map(([k, v]) => `- ${k}: ${(v / 1024).toFixed(1)} KB`).join('\n')}\n- toplam: ${(toplam / 1024).toFixed(1)} KB\n`
  writeFileSync(join(INCELEME, 'ozet.md'), oz)
}
