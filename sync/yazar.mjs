// Maç raporları ve maç önü yazıları yapay zekâyla yazılır.
// Sağlayıcı sırası: Google Gemini (GEMINI_API_KEY), yoksa/olmazsa OpenRouter ücretsiz modelleri (OPENROUTER_API_KEY).
// Anahtarlar GitHub gizli değişkenlerinde durur. Hiçbiri çalışmazsa site kalıp metinleri kullanır.
// Her yazı bir kez üretilip sync/yazilar.json'a kaydedilir; bilgiler değişmedikçe yeniden yazılmaz.
// Uydurmaya karşı: skor, rakip adı, saha, "biz" dili ve "bilgide olmayan isim" kontrolünden geçmeyen yazı kullanılmaz.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const FILE = new URL('./yazilar.json', import.meta.url)
// YAZAR_YAYINDA=1: yeni yazı üretilir. YAZAR_TASLAK=1: üretilir ama kaydedilmez (deneme için).
// Kayıtlı yazılar her derlemede kullanılır (yerel derlemede raporlar kaybolmasın); tamamen kapatmak için YAZAR_YAYINDA=0.
const YAYINDA = process.env.YAZAR_YAYINDA === '1'
const TASLAK = process.env.YAZAR_TASLAK === '1'
const ACIK = YAYINDA || TASLAK
const KAPALI = process.env.YAZAR_YAYINDA === '0'
const GEMINI = process.env.GEMINI_API_KEY
const OPENROUTER = process.env.OPENROUTER_API_KEY
const BIR_CALISMADA_EN_FAZLA = 6 // her 15 dakikada en fazla bu kadar yeni yazı (ücretsiz kota)
const ESKI_EN_FAZLA = 2 // bunlardan en fazla kaçı eski maç raporu olabilir (kota önce güncel yazılara kalsın)
const EN_FAZLA_ISTEK = 20 // bir turdaki toplam HTTP isteği (tekrar denemeler dahil)
const RED_SINIR = 3 // bir yazı art arda bu kadar tur reddedilirse...
const RED_BEKLE = 6 * 3600e3 // ...bu kadar süre denenmez (bilgisi değişirse hemen denenir)

export const yazilar = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {}
const RED = (yazilar._red ??= {}) // reddedilen yazıların kalıcı sayacı: { anahtar:hash: { sayi, zaman } }
export const durum = { yazildi: 0, eski: 0, hata: [], model: null, istek: 0, durdu: { gemini: false, openrouter: false }, tukenen: [], reddedilen: [], atlanan: 0 }

// ---------- metin yardımcıları
const TR = { 'İ': 'I', 'I': 'I', 'ı': 'I', 'Ş': 'S', 'ş': 'S', 'Ğ': 'G', 'ğ': 'G', 'Ü': 'U', 'ü': 'U', 'Ö': 'O', 'ö': 'O', 'Ç': 'C', 'ç': 'C' }
const norm = s => (s ?? '').replace(/[İIıŞşĞğÜüÖöÇç]/g, c => TR[c]).toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '')
const temizle = s => (s ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/[*#_`>]/g, '').replace(/^["“”']+|["“”']+$/g, '').replace(/[ \t]+\n/g, '\n').trim()
const ozet = o => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 10)
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const SERBEST = new Set(['EFENDILIG', 'EFENDI', 'SEZONU', 'SEZON', 'LIGI', 'LIG', 'KUPASI', 'KUPA', 'PLAYOFF', 'PLAY', 'OFF', 'MVP', 'CREW', 'FC', '1337', 'ATK', 'FINAL', 'YOLU', 'GRUBU', 'HAFTA', 'HAFTASI', ...AYLAR.map(norm), ...GUNLER.map(norm)])
const gunAdi = tarih => { const [y, m, d] = tarih.split('-').map(Number); return GUNLER[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }
/** Bilgide geçen bütün kelimeler (oyuncu, takım, yarışma adları) — bu kelimeler hiçbir kontrolde sorun sayılmaz */
const bilgiKelimeleri = bilgi => new Set(JSON.stringify(bilgi).split(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]+/).map(norm).filter(Boolean))

/** Metinde, verilen bilgilerde geçmeyen özel isim var mı? (Cümle başı hariç büyük harfle başlayan kelimeler) */
function yabanciIsim(metin, bilgi) {
  const izinli = new Set([...SERBEST, ...bilgiKelimeleri(bilgi)])
  for (const cumle of metin.split(/(?<=[.!?])\s+/)) {
    const kelimeler = cumle.split(/\s+/)
    for (let i = 1; i < kelimeler.length; i++) {
      const w = kelimeler[i].replace(/^[("“]+/, '')
      if (!/^[A-ZÇĞİÖŞÜ]/.test(w)) continue
      const kok = norm(w.split(/['’]/)[0])
      if (kok && !izinli.has(kok)) return w
    }
  }
  return null
}

// ---------- "biz" dili: site kulüpten üçüncü şahısla bahseder
const BIZ_KELIME = new Set(['biz', 'bizim', 'bize', 'bizi', 'bizden', 'bizde', 'bizimle', 'bizler', 'bizlere', 'bizleri', 'bizlerden', 'bizimkiler', 'bizimkileri', 'bizce'])
const BIZ_ON = ['aramız', 'önümüz', 'arkamız', 'yanımız', 'kendimiz', 'hepimiz', 'birimiz', 'ikimiz', 'karşımız']
const HAL = '(ı|i|u|ü|a|e|da|de|ta|te|dan|den|tan|ten|ın|in|un|ün|la|le|dır|dir|dur|dür|dı|di|du|dü|ki|daki|deki|dan|ca|ce)?'
const BIZ_EK = new RegExp('(' + [
  'ıyoruz', 'iyoruz', 'uyoruz', 'üyoruz', // çıkıyoruz
  'acağız', 'eceğiz', // kazanacağız
  'mışız', 'mişiz', 'muşuz', 'müşüz',
  '(ıyor|iyor|uyor|üyor)duk',
  '[aeıioöuü]d[ıiuü]k', // oynadık
  '[bcçfgğhjklmnprsştvyz][dt][ıiuü]k', // kazandık, attık, çıktık, kestik
  `(ımız|imiz|umuz|ümüz)${HAL}`, // takımımıza, oyuncumuzu
  `[aeıioöuü]m[ıiuü]z${HAL}`, // sahamızda, formamız
  '[rlny][ıiuü]z', // lideriz, hazırız, güçlüyüz, kazanırız, kazanmalıyız
  '(ırsak|irsek|ursak|ürsek|arsak|ersek|masak|mesek)', // kazanırsak
  '[ae]l[ıi]m', // bakalım, izleyelim
].join('|') + ')$')
const BIZ_DEGIL = new Set([
  'artık', 'açık', 'yakın', 'mutlak', 'deniz', 'sekiz', 'semiz', 'temiz', 'beniz', 'yalnız', 'kendiniz',
  'taktik', 'istatistik', 'plastik', 'fantastik', 'mistik', 'lojistik', 'elastik', 'akustik', 'eklektik', 'baltık', 'klasik', 'yastık',
  'beklenmedik', 'alışılmadık', 'görülmedik', 'umulmadık', 'rastlanmadık', 'tanıdık', 'sadık', 'dimdik', 'fındık', 'çeltik', 'erdik', 'gedik',
  'selim', 'halim', 'alim', 'zalim', 'kalım', 'teslim', 'hakim', 'hâkim', 'bilim', 'dilim', 'ilim',
])
const APOSTROF_BIZ = /^(m[ıiuü]z|ımız|imiz|umuz|ümüz|y[ıiuü]z|[ıiuü]z)/ // 1337'miz, Crew'umuz, 1337'yiz
/** Birinci çoğul şahıs içeren kelimeyi döndürür, yoksa null. `izinli`: bilgide geçen (norm) kelimeler — bunlar sorgulanmaz. */
export function bizVar(metin, izinli = new Set()) {
  for (const ham of metin.toLocaleLowerCase('tr').split(/[^a-z0-9çğıöşüâ'’]+/)) {
    if (!ham) continue
    const [kok, ek] = ham.split(/['’]/)
    if (ek && APOSTROF_BIZ.test(ek)) return ham
    const w = kok
    if (!w || izinli.has(norm(w))) continue
    if (BIZ_KELIME.has(w) || BIZ_ON.some(o => w.startsWith(o))) return ham
    if (w.length >= 5 && !BIZ_DEGIL.has(w) && BIZ_EK.test(w)) return ham
  }
  return null
}

// ---------- sağlayıcılar
let geminiModeller = null
async function geminiModelleri() {
  if (geminiModeller) return geminiModeller
  try {
    durum.istek++
    const j = await (await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': GEMINI }, signal: AbortSignal.timeout(30000) })).json()
    const ad = (j.models ?? []).filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''))
    const sira = [/^gemini-3[\d.]*-pro$/, /^gemini-3[\d.]*-flash$/, /^gemini-2\.5-pro$/, /^gemini-2\.5-flash$/, /^gemini-[\d.]+-flash$/]
    geminiModeller = sira.flatMap(r => ad.filter(n => r.test(n)).sort().reverse()).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3)
    if (!geminiModeller.length) durum.hata.push('Gemini: uygun model bulunamadı (' + ad.slice(0, 8).join(', ') + ')')
  } catch (e) { geminiModeller = []; durum.hata.push('Gemini model listesi: ' + e.message) }
  return geminiModeller
}
async function geminiYaz(model, sistem, istek) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': GEMINI, 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sistem }] }, contents: [{ role: 'user', parts: [{ text: istek }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 4096 } }),
    signal: AbortSignal.timeout(90000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.error) return { hata: `${j.error?.message ?? r.status}`, kod: r.status }
  return { metin: (j.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('') }
}

const OR_TERCIH = ['openrouter/free', 'google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free']
async function openrouterYaz(model, sistem, istek) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENROUTER}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://1337crewfc.com', 'X-Title': '1337 Crew FC' },
    body: JSON.stringify({ model, temperature: 0.4, max_tokens: 500, messages: [{ role: 'system', content: sistem }, { role: 'user', content: istek }] }),
    signal: AbortSignal.timeout(60000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.error) return { hata: `${j.error?.message ?? r.status}`, kod: r.status }
  return { metin: j.choices?.[0]?.message?.content }
}

async function denemeler() {
  const d = []
  if (GEMINI) for (const m of await geminiModelleri()) d.push({ ad: 'gemini', model: m, fn: geminiYaz })
  if (OPENROUTER) for (const m of OR_TERCIH) d.push({ ad: 'openrouter', model: m, fn: openrouterYaz })
  return d
}
const modelHata = {} // bu turda modelin geçici hata sayısı

const SISTEM = `Amatör futbol takımı 1337 Crew FC'nin kulüp sitesi için kısa Türkçe yazılar yazıyorsun.
Kurallar:
- Sadece verilen bilgileri kullan. Bilgide olmayan hiçbir şey ekleme: gol dakikası, pozisyon, oyuncu uyruğu, hava, taraftar, sakatlık, teknik direktör sözü, gelecek tahmini yok.
- Bilgide adı geçmeyen hiçbir kişiden bahsetme. MVP ile golcüyü karıştırma: MVP'nin gol attığını ancak golcüler listesinde varsa yaz.
- Maçın nerede oynandığını "saha" bilgisine göre yaz; ev sahibi her zaman "evSahibi" alanındaki takımdır.
- 2-3 cümle, düz metin. Başlık, madde işareti, emoji, etiket, tırnak işareti yok.
- Doğru, akıcı ve sade bir Türkçe. Abartı ve klişe yok.
- Takımdan "1337 Crew FC" ya da "1337" diye, üçüncü şahısla bahset. Asla "biz", "bizim", "-ımız" ya da "kazandık, sıradayız" gibi birinci çoğul şahıs kullanma.
- Rakip takımın adını bilgide yazıldığı gibi tam yaz.
- Skoru her zaman ev sahibi önce gelecek şekilde "X-Y" biçiminde yaz.`

/** Ortak kontroller + yazıya özel kontrol. Sorun yoksa null, varsa sebep. */
function kontrol(metin, bilgi, dogrula) {
  if (!metin) return 'boş'
  if (metin.length < 40) return 'çok kısa'
  if (metin.length > 900) return 'çok uzun'
  if (!/[.!?…]$/.test(metin)) return 'yarım kalmış'
  const b = bizVar(metin, bilgiKelimeleri(bilgi))
  if (b) return `biz dili: ${b}`
  const y = yabanciIsim(metin, bilgi)
  if (y) return `bilgide olmayan isim: ${y}`
  return dogrula(metin)
}

/** Yazıyı döndürür (önceden yazılmışsa kayıttan); yazamazsa null. */
async function yaz(anahtar, bilgi, istek, dogrula, oncelikli = true) {
  const k = `${anahtar}:${ozet(bilgi)}`
  if (KAPALI) return null
  if (!TASLAK && yazilar[k]) {
    // Kayıtlı yazı da güncel kurallardan geçmeli; geçmezse silinir ve (açıksa) yeniden yazılır
    if (!kontrol(yazilar[k].metin, bilgi, dogrula)) return { metin: yazilar[k].metin, model: yazilar[k].model }
    durum.hata.push(`${anahtar.slice(0, 40)}: kayıtlı yazı yeni kurallardan geçmedi, silindi`)
    delete yazilar[k]
  }
  if (!ACIK) return null
  if (durum.yazildi >= BIR_CALISMADA_EN_FAZLA || durum.istek >= EN_FAZLA_ISTEK) return null
  if (!oncelikli && durum.eski >= ESKI_EN_FAZLA) return null
  const red = RED[k]
  if (!TASLAK && red && red.sayi >= RED_SINIR && Date.now() - Date.parse(red.zaman) < RED_BEKLE) { durum.atlanan++; return null }
  const tam = `${istek}\n\nBilgiler:\n${JSON.stringify(bilgi, null, 1)}`
  let reddedildi = false
  for (const d of await denemeler()) {
    if (durum.durdu[d.ad] || durum.tukenen.includes(d.model) || durum.istek >= EN_FAZLA_ISTEK) continue
    try {
      durum.istek++
      let r = await d.fn(d.model, SISTEM, tam)
      // Ücretsiz modeller yoğunken "high demand / overloaded" der: 20 sn bekleyip bir kez daha dene
      if (r.hata && /high demand|overloaded|unavailable|try again/i.test(r.hata) && durum.istek < EN_FAZLA_ISTEK) {
        await new Promise(x => setTimeout(x, 20000))
        durum.istek++
        r = await d.fn(d.model, SISTEM, tam)
      }
      if (r.hata) {
        durum.hata.push(`${d.model}: ${r.hata}`.slice(0, 160))
        if ([401, 402, 403].includes(r.kod) || (r.kod === 400 && /key|auth|permission|credit|billing/i.test(r.hata))) durum.durdu[d.ad] = true // anahtar/yetki: sağlayıcı bu tur kapalı
        else if (r.kod === 429 || r.kod === 404 || /quota|RESOURCE_EXHAUSTED|rate.?limit|not found/i.test(r.hata)) durum.tukenen.push(d.model) // kota doldu / model yok
        else if ((modelHata[d.model] = (modelHata[d.model] ?? 0) + 1) >= 2) durum.tukenen.push(d.model) // aynı turda 2 kez geçici hata
        continue
      }
      const metin = temizle(r.metin)
      const sebep = kontrol(metin, bilgi, dogrula)
      if (sebep) { reddedildi = true; durum.reddedilen.push({ anahtar, model: d.model, sebep, metin }); durum.hata.push(`${d.model}: reddedildi (${sebep})`); continue }
      if (!TASLAK) {
        yazilar[k] = { metin, model: d.model, zaman: new Date().toISOString() }
        for (const x of Object.keys(yazilar)) if (x !== k && x.startsWith(anahtar + ':')) delete yazilar[x]
        for (const x of Object.keys(RED)) if (x.startsWith(anahtar + ':')) delete RED[x]
      }
      durum.yazildi++
      if (!oncelikli) durum.eski++
      durum.model = d.model
      return { metin, model: d.model }
    } catch (e) {
      durum.hata.push(`${d.model}: ${e.message}`.slice(0, 160))
      if ((modelHata[d.model] = (modelHata[d.model] ?? 0) + 1) >= 2) durum.tukenen.push(d.model)
    }
  }
  // Model metin yazdı ama kontrolden geçemedi: kalıcı sayaç (kota/yoğunluk hataları sayılmaz)
  if (reddedildi && !TASLAK) {
    for (const x of Object.keys(RED)) if (x !== k && x.startsWith(anahtar + ':')) delete RED[x]
    RED[k] = { sayi: (RED[k]?.sayi ?? 0) + 1, zaman: new Date().toISOString() }
  }
  return null
}

// ---------- maç raporu ve maç önü
/** Skor "X-Y" olarak, başka bir sayının parçası olmadan geçiyor mu? ("2026-2027" içindeki "6-2" sayılmaz) */
const skorVar = (t, m) => new RegExp(`(?<![\\d-])${m.home.score}\\s*[-–—]\\s*${m.away.score}(?![\\d-])`).test(t)
const GENEL = new Set(['FC', 'FK', 'SK', 'AC', 'CF', 'SC', 'JK', 'SPOR', 'KULUBU'])
/** Takım adı tam kelimelerle geçiyor mu? "FC/FK/SK/AC" gibi ekler olmadan da kabul edilir ("AC Nevizade" → "Nevizade") */
function adVar(t, ad) {
  const metin = t.split(/[\s,.;:!?()"“”]+/).map(w => norm(w.split(/['’]/)[0])).filter(Boolean)
  const tam = ad.split(/\s+/).map(norm).filter(Boolean)
  const kisa = tam.filter(x => !GENEL.has(x))
  const icinde = parca => parca.length > 0 && metin.some((_, i) => parca.every((p, j) => metin[i + j] === p))
  return icinde(tam) || (kisa.length > 0 && icinde(kisa))
}
/** Deplasman maçında 1337'nin evinde/iç sahada, iç saha maçında deplasmanda olduğunu açıkça söyleyen cümle */
function sahaYanlis(t, m) {
  const ONE = String.raw`1337(\s*Crew\s*FC)?`
  if (m.us === 'away' && (
    new RegExp(`${ONE}['’]?(n[iı]n|in)\\s+(kendi\\s+)?(sahas[ıi]nda|evinde)`, 'i').test(t) ||
    new RegExp(`${ONE},?\\s+(kendi\\s+sahas[ıi]nda|iç\\s+sahada|evinde)`, 'i').test(t))) return true
  if (m.us === 'home' && new RegExp(`${ONE},?\\s+deplasmanda`, 'i').test(t)) return true
  return false
}

export async function raporYaz(m, oncelikli = true) {
  const t = m.us === 'home' ? m.away : m.home
  const bilgi = {
    yarisma: m.compLabel, hafta: m.week ?? null, tarih: m.date, evSahibi: m.home.name, deplasman: m.away.name,
    skor: `${m.home.score}-${m.away.score}`, sonuc1337: m.result === 'G' ? 'galibiyet' : m.result === 'B' ? 'beraberlik' : 'mağlubiyet',
    saha: m.us === 'home' ? `1337 iç sahada, ${m.home.name} ev sahibi` : `1337 deplasmanda, ev sahibi ${m.home.name}`, hukmen: !!m.forfeit,
    golculer1337: (m.scorers ?? []).map(x => x.n > 1 ? `${x.name} (${x.n})` : x.name),
    asistler1337: (m.assisters ?? []).map(x => x.name),
    macinMVPsi: m.mvp ? `${m.mvp.name} (${m.mvp.ours ? '1337 oyuncusu' : t.name + ' oyuncusu'})` : null,
  }
  const istek = m.forfeit ? 'Bu maç hükmen sonuçlandı; bunu belirten 1-2 cümlelik kısa bir not yaz.' : 'Bu maç için kısa bir maç raporu yaz.'
  return yaz(`rapor:${m.id}`, bilgi, istek, x =>
    !skorVar(x, m) ? 'skor yok' : !adVar(x, t.name) ? 'rakip adı yok' : sahaYanlis(x, m) ? 'saha yanlış' : null, oncelikli)
}

export async function onizlemeYaz(next, table, done) {
  const opp = m => (m.us === 'home' ? m.away : m.home)
  const t = opp(next), row = table.find(r => r.code === t.code), us = table.find(r => r.us)
  const h2h = done.filter(m => opp(m).code === t.code)
  const bilgi = {
    mac: `${next.home.name} - ${next.away.name}`, yarisma: next.compLabel, hafta: next.week ?? null, tarih: next.date, gun: gunAdi(next.date), saat: next.time,
    saha: next.us === 'home' ? `1337 iç sahada, ${next.home.name} ev sahibi` : `1337 deplasmanda, ev sahibi ${next.home.name}`,
    rakip: t.name, rakipSira: row ? `${row.rank}. sıra, ${row.played} maçta ${row.points} puan, averaj ${row.gd}` : null,
    sira1337: us ? `${us.rank}. sıra, ${us.played} maçta ${us.points} puan, averaj ${us.gd}` : null,
    oncekiKarsilasmalar: h2h.length ? `kayıtlı ${h2h.length} maç: ${h2h.filter(m => m.result === 'G').length} 1337 galibiyeti, ${h2h.filter(m => m.result === 'B').length} beraberlik, ${h2h.filter(m => m.result === 'M').length} ${t.name} galibiyeti` : 'kayıtlarda iki takımın maçı yok',
    sonMac1337: done[0] ? `${done[0].home.name} ${done[0].home.score}-${done[0].away.score} ${done[0].away.name}` : null,
  }
  return yaz(`onizleme:${next.id}`, bilgi, 'Bu maç için kısa bir maç önü yazısı yaz.', x =>
    !adVar(x, t.name) ? 'rakip adı yok' : sahaYanlis(x, next) ? 'saha yanlış' : null)
}

export function kaydet() {
  if (!TASLAK) writeFileSync(FILE, JSON.stringify(yazilar, null, 1))
}
export const _dogrulama = { yabanciIsim, sahaYanlis, skorVar, adVar, bizVar, kontrol, gunAdi }
