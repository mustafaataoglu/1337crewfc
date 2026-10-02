// Maç raporları ve maç önü yazıları: OpenRouter'daki ücretsiz modellerle yazılır.
// Anahtar GitHub'da OPENROUTER_API_KEY gizli değişkeninde durur. Anahtar yoksa ya da model
// cevap vermezse hiçbir şey yazılmaz ve site kalıp metinleri kullanır.
// Her yazı bir kez üretilip sync/yazilar.json'a kaydedilir; bilgiler değişmedikçe yeniden yazılmaz.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const FILE = new URL('./yazilar.json', import.meta.url)
// Yayın kapalı: ücretsiz modeller uydurma bilgi yazdı (golcü, saha, uyruk). Kalite doğrulanana kadar kalıp metinler kullanılır.
const YAYINDA = process.env.YAZAR_YAYINDA === '1'
const KEY = YAYINDA ? process.env.OPENROUTER_API_KEY : undefined
// Türkçe için tercih sırası; listede olmayan ya da artık ücretsiz olmayan model atlanır
// openrouter/free o an müsait ücretsiz modele yönlendirir (en güvenilir); diğerleri yedek
const TERCIH = ['openrouter/free', 'google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'google/gemma-4-26b-a4b-it:free']
const BIR_CALISMADA_EN_FAZLA = 6 // ücretsiz kotayı aşmamak için her 15 dakikada en fazla bu kadar yeni yazı

export const yazilar = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {}
export const durum = { yazildi: 0, hata: [], model: null, istek: 0, durdu: false }
const EN_FAZLA_ISTEK = 20 // bir çalışmada toplam deneme sınırı (hatalı anahtar/kota durumunda boşa istek atmasın)
let modeller = null

async function ucretsizModeller() {
  if (modeller) return modeller
  try {
    const j = await (await fetch('https://openrouter.ai/api/v1/models')).json()
    const free = new Set((j.data ?? []).filter(m => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0).map(m => m.id))
    modeller = TERCIH.filter(m => free.has(m) || m === 'openrouter/free')
  } catch { modeller = TERCIH }
  return modeller
}

const SISTEM = `Amatör futbol takımı 1337 Crew FC'nin kulüp sitesi için kısa Türkçe yazılar yazıyorsun.
Kurallar:
- Sadece verilen bilgileri kullan. Bilgide olmayan hiçbir şey ekleme: gol dakikası, pozisyon, hava, taraftar, sakatlık, teknik direktör sözü yok.
- 2-4 cümle, düz metin. Başlık, madde işareti, emoji, etiket, tırnak işareti yok.
- Doğal, sade, kulüp sitesine yakışır bir ton. Abartı ve klişe yok.
- Takımdan "1337 Crew FC" ya da "1337" diye bahset; "biz" deme.
- Skoru her zaman ev sahibi önce gelecek şekilde "X-Y" biçiminde yaz.`

const temizle = s => (s ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/[*#_`>]/g, '').replace(/^["“”']+|["“”']+$/g, '').replace(/\s+\n/g, '\n').trim()
const ozet = o => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 10)

/** Yazıyı döndürür (önceden yazılmışsa kayıttan); yazamazsa null. `dogrula` metni kabul etmezse yazı kullanılmaz. */
export async function yaz(anahtar, bilgi, istek, dogrula) {
  const k = `${anahtar}:${ozet(bilgi)}`
  if (!YAYINDA) return null
  if (yazilar[k]) return yazilar[k].metin
  if (!KEY || durum.durdu || durum.yazildi >= BIR_CALISMADA_EN_FAZLA || durum.istek >= EN_FAZLA_ISTEK) return null
  for (const model of await ucretsizModeller()) {
    if (durum.istek >= EN_FAZLA_ISTEK) return null
    durum.istek++
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://1337crewfc.com', 'X-Title': '1337 Crew FC' },
        body: JSON.stringify({ model, temperature: 0.5, max_tokens: 400, messages: [{ role: 'system', content: SISTEM }, { role: 'user', content: `${istek}\n\nBilgiler:\n${JSON.stringify(bilgi, null, 1)}` }] }),
        signal: AbortSignal.timeout(60000),
      })
      const j = await r.json()
      if (!r.ok || j.error) {
        durum.hata.push(`${model}: ${j.error?.message ?? r.status}`.slice(0, 160))
        // Anahtar geçersiz ya da kredi/kota bitti: bu çalışmada bir daha deneme
        if (r.status === 401 || r.status === 402 || r.status === 403) { durum.durdu = true; return null }
        continue
      }
      const metin = temizle(j.choices?.[0]?.message?.content)
      if (!metin || metin.length < 40 || metin.length > 900 || !dogrula(metin)) { durum.hata.push(`${model}: doğrulanamadı`); continue }
      yazilar[k] = { metin, model, zaman: new Date().toISOString() }
      // aynı yazının eski sürümlerini sil (bilgiler değişince yeniden yazılır)
      for (const x of Object.keys(yazilar)) if (x !== k && x.startsWith(anahtar + ':')) delete yazilar[x]
      durum.yazildi++
      durum.model = model
      return metin
    } catch (e) { durum.hata.push(`${model}: ${e.message}`.slice(0, 160)) }
  }
  return null
}

export function kaydet() {
  writeFileSync(FILE, JSON.stringify(yazilar, null, 1))
}
