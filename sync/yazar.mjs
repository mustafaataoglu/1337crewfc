// Maç raporları ve maç önü yazıları yapay zekâyla yazılır.
// Sağlayıcı sırası: Google Gemini (GEMINI_API_KEY), yoksa/olmazsa OpenRouter ücretsiz modelleri (OPENROUTER_API_KEY).
// Anahtarlar GitHub gizli değişkenlerinde durur. Hiçbiri çalışmazsa site kalıp metinleri kullanır.
// Her yazı bir kez üretilip sync/yazilar.json'a kaydedilir; bilgiler değişmedikçe yeniden yazılmaz.
// Uydurmaya karşı: skor, rakip adı, saha ve "bilgide olmayan isim" kontrolünden geçmeyen yazı kullanılmaz.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const FILE = new URL('./yazilar.json', import.meta.url)
// YAZAR_YAYINDA=1: yazılar siteye girer. YAZAR_TASLAK=1: yazılır ama kaydedilmez (deneme için).
const YAYINDA = process.env.YAZAR_YAYINDA === '1'
const TASLAK = process.env.YAZAR_TASLAK === '1'
const ACIK = YAYINDA || TASLAK
const GEMINI = process.env.GEMINI_API_KEY
const OPENROUTER = process.env.OPENROUTER_API_KEY
const BIR_CALISMADA_EN_FAZLA = 6 // her 15 dakikada en fazla bu kadar yeni yazı (ücretsiz kota)
const EN_FAZLA_ISTEK = 20

export const yazilar = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {}
export const durum = { yazildi: 0, hata: [], model: null, istek: 0, durdu: { gemini: false, openrouter: false }, reddedilen: [] }

// ---------- metin yardımcıları
const TR = { 'İ': 'I', 'I': 'I', 'ı': 'I', 'Ş': 'S', 'ş': 'S', 'Ğ': 'G', 'ğ': 'G', 'Ü': 'U', 'ü': 'U', 'Ö': 'O', 'ö': 'O', 'Ç': 'C', 'ç': 'C' }
const norm = s => (s ?? '').replace(/[İIıŞşĞğÜüÖöÇç]/g, c => TR[c]).toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '')
const temizle = s => (s ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/[*#_`>]/g, '').replace(/^["“”']+|["“”']+$/g, '').replace(/[ \t]+\n/g, '\n').trim()
const ozet = o => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 10)
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const SERBEST = new Set(['EFENDILIG', 'SEZONU', 'SEZON', 'LIGI', 'LIG', 'KUPASI', 'KUPA', 'PLAYOFF', 'PLAY', 'OFF', 'MVP', 'CREW', 'FC', '1337', 'ATK', 'FINAL', 'YOLU', 'GRUBU', 'HAFTA', 'HAFTASI', ...AYLAR.map(norm)])

/** Metinde, verilen bilgilerde geçmeyen özel isim var mı? (Cümle başı hariç büyük harfle başlayan kelimeler) */
function yabanciIsim(metin, bilgi) {
  const izinli = new Set([...SERBEST, ...JSON.stringify(bilgi).split(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]+/).map(norm).filter(Boolean)])
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

// ---------- sağlayıcılar
let geminiModeller = null
async function geminiModelleri() {
  if (geminiModeller) return geminiModeller
  try {
    const j = await (await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': GEMINI } })).json()
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
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sistem }] }, contents: [{ role: 'user', parts: [{ text: istek }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 2048 } }),
    signal: AbortSignal.timeout(90000),
  })
  const j = await r.json()
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
  const j = await r.json()
  if (!r.ok || j.error) return { hata: `${j.error?.message ?? r.status}`, kod: r.status }
  return { metin: j.choices?.[0]?.message?.content }
}

async function denemeler() {
  const d = []
  if (GEMINI) for (const m of await geminiModelleri()) d.push({ ad: 'gemini', model: m, fn: geminiYaz })
  if (OPENROUTER) for (const m of OR_TERCIH) d.push({ ad: 'openrouter', model: m, fn: openrouterYaz })
  return d
}

const SISTEM = `Amatör futbol takımı 1337 Crew FC'nin kulüp sitesi için kısa Türkçe yazılar yazıyorsun.
Kurallar:
- Sadece verilen bilgileri kullan. Bilgide olmayan hiçbir şey ekleme: gol dakikası, pozisyon, oyuncu uyruğu, hava, taraftar, sakatlık, teknik direktör sözü, gelecek tahmini yok.
- Bilgide adı geçmeyen hiçbir kişiden bahsetme. MVP ile golcüyü karıştırma: MVP'nin gol attığını ancak golcüler listesinde varsa yaz.
- Maçın nerede oynandığını "saha" bilgisine göre yaz; ev sahibi her zaman "evSahibi" alanındaki takımdır.
- 2-3 cümle, düz metin. Başlık, madde işareti, emoji, etiket, tırnak işareti yok.
- Doğru, akıcı ve sade bir Türkçe. Abartı ve klişe yok.
- Takımdan "1337 Crew FC" ya da "1337" diye bahset; "biz" deme.
- Skoru her zaman ev sahibi önce gelecek şekilde "X-Y" biçiminde yaz.`

/** Yazıyı döndürür (önceden yazılmışsa kayıttan); yazamazsa null. */
async function yaz(anahtar, bilgi, istek, dogrula) {
  const k = `${anahtar}:${ozet(bilgi)}`
  if (!ACIK) return null
  if (!TASLAK && yazilar[k]) return { metin: yazilar[k].metin, model: yazilar[k].model }
  if (durum.yazildi >= BIR_CALISMADA_EN_FAZLA || durum.istek >= EN_FAZLA_ISTEK) return null
  const tam = `${istek}\n\nBilgiler:\n${JSON.stringify(bilgi, null, 1)}`
  for (const d of await denemeler()) {
    if (durum.durdu[d.ad] || durum.istek >= EN_FAZLA_ISTEK) continue
    durum.istek++
    try {
      const r = await d.fn(d.model, SISTEM, tam)
      if (r.hata) {
        durum.hata.push(`${d.model}: ${r.hata}`.slice(0, 160))
        if ([400, 401, 402, 403].includes(r.kod) && /key|auth|permission|credit|quota|billing/i.test(r.hata)) durum.durdu[d.ad] = true
        continue
      }
      const metin = temizle(r.metin)
      const sebep = !metin ? 'boş' : metin.length < 40 ? 'çok kısa' : metin.length > 900 ? 'çok uzun' : dogrula(metin)
      if (sebep) { durum.reddedilen.push({ anahtar, model: d.model, sebep, metin }); durum.hata.push(`${d.model}: reddedildi (${sebep})`); continue }
      if (!TASLAK) {
        yazilar[k] = { metin, model: d.model, zaman: new Date().toISOString() }
        for (const x of Object.keys(yazilar)) if (x !== k && x.startsWith(anahtar + ':')) delete yazilar[x]
      }
      durum.yazildi++
      durum.model = d.model
      return { metin, model: d.model }
    } catch (e) { durum.hata.push(`${d.model}: ${e.message}`.slice(0, 160)) }
  }
  return null
}

// ---------- maç raporu ve maç önü
const skorVar = (t, m) => t.replace(/\s*[–—-]\s*/g, '-').includes(`${m.home.score}-${m.away.score}`)
const adVar = (t, ad) => norm(t).includes(norm(ad.split(' ')[0]))
function sahaYanlis(t, m) {
  if (m.us === 'away' && /(1337(\s*Crew\s*FC)?['’]?\s*(n[iı]n|in)?\s+(kendi\s+)?(sahas[ıi]nda|evinde))|iç sahada|evinde ağırlad/i.test(t)) return true
  if (m.us === 'home' && /1337(\s*Crew\s*FC)?,?\s+[^.]{0,40}deplasman/i.test(t)) return true
  return false
}

export async function raporYaz(m) {
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
    !skorVar(x, m) ? 'skor yok' : !adVar(x, t.name) ? 'rakip adı yok' : sahaYanlis(x, m) ? 'saha yanlış' : (() => { const y = yabanciIsim(x, bilgi); return y ? `bilgide olmayan isim: ${y}` : null })())
}

export async function onizlemeYaz(next, table, done) {
  const opp = m => (m.us === 'home' ? m.away : m.home)
  const t = opp(next), row = table.find(r => r.code === t.code), us = table.find(r => r.us)
  const h2h = done.filter(m => opp(m).code === t.code)
  const bilgi = {
    mac: `${next.home.name} - ${next.away.name}`, yarisma: next.compLabel, hafta: next.week ?? null, tarih: next.date, saat: next.time,
    saha: next.us === 'home' ? `1337 iç sahada, ${next.home.name} ev sahibi` : `1337 deplasmanda, ev sahibi ${next.home.name}`,
    rakip: t.name, rakipSira: row ? `${row.rank}. sıra, ${row.played} maçta ${row.points} puan, averaj ${row.gd}` : null,
    sira1337: us ? `${us.rank}. sıra, ${us.played} maçta ${us.points} puan, averaj ${us.gd}` : null,
    aramizdakiMaclar: h2h.length ? `${h2h.length} maç: ${h2h.filter(m => m.result === 'G').length} 1337 galibiyeti, ${h2h.filter(m => m.result === 'B').length} beraberlik, ${h2h.filter(m => m.result === 'M').length} ${t.name} galibiyeti` : 'daha önce karşılaşmadılar',
    sonMac1337: done[0] ? `${done[0].home.name} ${done[0].home.score}-${done[0].away.score} ${done[0].away.name}` : null,
  }
  return yaz(`onizleme:${next.id}`, bilgi, 'Bu maç için kısa bir maç önü yazısı yaz.', x =>
    !adVar(x, t.name) ? 'rakip adı yok' : sahaYanlis(x, next) ? 'saha yanlış' : (() => { const y = yabanciIsim(x, bilgi); return y ? `bilgide olmayan isim: ${y}` : null })())
}

export function kaydet() {
  if (!TASLAK) writeFileSync(FILE, JSON.stringify(yazilar, null, 1))
}
export const _dogrulama = { yabanciIsim, sahaYanlis, skorVar }
