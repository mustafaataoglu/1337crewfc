// EfendiLig + YouTube senkronu. GitHub Actions'ta 15 dakikada bir çalışır.
// Her yanıt cache/ altına yazılır. Değişiklik yoksa sadece kulüp özeti ve YouTube RSS okunur;
// skor, kadro ya da fikstür değiştiyse ilgili ayrıntılar (maç detayı, oyuncu kariyerleri) tazelenir.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'

const B = 'https://apiv1.efendilig.com/api'
const CLUB = '5cdbaeed0d916105e6b9cc9c'
const CHANNEL = 'UC1rjaXVXUkTOPlBeJTfrhbw'
const here = p => new URL(p, import.meta.url)
const CACHE = here('./cache/')
mkdirSync(CACHE, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const stats = { istek: 0, onbellek: 0, hatalar: [] }

const STATE_FILE = here('./cache/state.json')
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}
const FULL = process.argv.includes('--tam') || !state.lastFull || Date.now() - state.lastFull > 24 * 3600e3

async function get(p, { fresh = false, kritik = false } = {}) {
  const file = new URL(p.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json', CACHE)
  if (!fresh && existsSync(file)) { stats.onbellek++; return JSON.parse(readFileSync(file, 'utf8')) }
  for (let i = 0; i < 8; i++) {
    try {
      stats.istek++
      const r = await fetch(B + p)
      const j = await r.json()
      if (r.status === 429 || /too many/i.test(j.message ?? '')) { console.log('429, 2 dk bekleniyor:', p); await sleep(120000); continue }
      await sleep(1200)
      if (j.success !== false && j.data != null) writeFileSync(file, JSON.stringify(j.data))
      else {
        if (kritik) stats.hatalar.push(`${p}: ${j.message ?? 'başarısız yanıt'}`)
        if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
      }
      return j.data
    } catch (e) {
      await sleep(4000)
      if (i === 7) {
        stats.hatalar.push(`${p}: ${e.message}`)
        if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
      }
    }
  }
  return null
}

// 1) Kulüp özeti her seferinde taze; imzası değiştiyse ayrıntıları tazele
const club = await get('/clubs/1337-Crew-FC/detail', { fresh: true, kritik: true })
if (!club) throw new Error('Kulüp verisi alınamadı')
const sig = JSON.stringify([club.season?.stats, club.season?.rank, club.recentMatches?.map(m => [m.slug, m.home?.score, m.away?.score, m.status]), club.upcomingMatches?.map(m => [m.slug, m.date, m.time]), club.squad?.map(s => s.playerId)])
const changed = FULL || sig !== state.sig
console.log(FULL ? 'Tam senkron' : changed ? 'Değişiklik var, ayrıntılar tazeleniyor' : 'Değişiklik yok')

let seasons = (await get('/seasons', { fresh: FULL })) ?? []
// Yeni sezon açıldıysa (kulübün sezonu listede yoksa) sezon listesi beklemeden tazelenir
const yeniSezon = !!club.season?.id && !seasons.some(s => s._id === club.season.id)
if (yeniSezon) seasons = (await get('/seasons', { fresh: true })) ?? seasons
const out = { fetchedAt: new Date().toISOString(), seasons: [], matches: [], players: [], club }
const curSeasonId = club.season?.id
const recentCut = Date.now() - 21 * 864e5
// Kulüp özeti yalnızca sıradaki 3 maçı içerir; uzaktaki maçların saat/gün değişikliği için bu sezonun listesi saatte bir tazelenir
const sezonTaze = !state.lastSeasonList || Date.now() - state.lastSeasonList > 3600e3

for (const s of seasons) {
  const isCur = s._id === curSeasonId
  const url = `/matches?season=${s._id}&limit=500`
  let res = await get(url, { fresh: isCur && (changed || sezonTaze), kritik: isCur })
  // Geçmiş sezonda sonucu girilmemiş maç kaldıysa (geç girilen ya da düzeltilen sonuç) tam senkronda ve yeni sezon açılınca liste tazelenir
  const bugun = new Date().toISOString().slice(0, 10)
  if (!isCur && (FULL || yeniSezon) && (res?.matches ?? []).some(m => (m.home?.clubId === CLUB || m.away?.clubId === CLUB) && m.status !== 'done' && m.date < bugun)) res = await get(url, { fresh: true })
  const list = (res?.matches ?? []).filter(m => m.home?.clubId === CLUB || m.away?.clubId === CLUB)
  out.seasons.push({ id: s._id, slug: s.slug, name: s.name, start: s.startDate, matchCount: list.length })
  for (const m of list) {
    let d = null
    if (m.status === 'done') {
      // Yakın tarihli maçların detayı (video, kadro, MVP) sonradan dolabilir: değişiklikte, video yoksa ya da ilk 72 saatte
      // kadro/MVP eksikse tazele (video kadrodan önce girilince kadro ve MVP 24 saat gecikmesin)
      const recent = new Date(m.date).getTime() > recentCut
      const cached = await get(`/matches/${m.slug}`)
      const bizimKadro = m.home?.clubId === CLUB ? cached?.HomeTeamSquad : cached?.AwayTeamSquad
      const ilk72 = Date.now() - new Date(`${m.date}T${m.time || '21:00'}:00+03:00`).getTime() < 72 * 3600e3
      const eksik = !cached?.VideoUrl || (ilk72 && (!cached?.MvpPlayerName || !bizimKadro?.length))
      d = recent && (changed || eksik) ? await get(`/matches/${m.slug}`, { fresh: true }) : cached
    }
    out.matches.push({
      eid: m.id, slug: m.slug, season: s.name, seasonId: s._id, date: m.date, time: m.time, status: m.status,
      comp: m.competition?.type, compLabel: m.competition?.label, week: m.competition?.week,
      home: { id: m.home?.clubId, code: m.home?.code, name: m.home?.name, logo: m.home?.logoUrl, score: m.home?.score, jersey: m.home?.jersey ?? null },
      away: { id: m.away?.clubId, code: m.away?.code, name: m.away?.name, logo: m.away?.logoUrl, score: m.away?.score, jersey: m.away?.jersey ?? null },
      video: d?.VideoUrl || null,
      lineup: d ? (m.home?.clubId === CLUB ? { xi: d.HomeTeamSquad ?? [], subs: d.HomeTeamSubstitutes ?? [] } : { xi: d.AwayTeamSquad ?? [], subs: d.AwayTeamSubstitutes ?? [] }) : null,
      mvp: d?.MvpPlayerName ? { name: `${d.MvpPlayerName} ${d.MvpPlayerSurName ?? ''}`.trim(), club: d.MvpPlayerClub, slug: d.MvpPlayerSlug } : null,
    })
  }
}

// 1b) Gol ve asistler yalnızca oyuncu kariyerlerinde: son 48 saatte biten, 1337'nin gol attığı bir maçta kariyerlerdeki goller
//     skoru tutmuyorsa (goller skordan sonra girildi), o maçın kadrosundaki oyuncuların kariyerleri saatte bir tazelenir
const golTazele = new Set()
if (!changed && (!state.golTazeleZaman || Date.now() - state.golTazeleZaman > 3600e3)) {
  const idSlug = new Map((club.squad ?? []).map(s => [s.playerId, s.slug]))
  for (const m of out.matches) {
    if (m.status !== 'done' || !m.lineup) continue
    if (Date.now() - new Date(`${m.date}T${m.time || '21:00'}:00+03:00`).getTime() > 48 * 3600e3) continue
    const bizim = m.home.id === CLUB ? m.home.score : m.away.score
    if (!bizim) continue
    const kadro = [...m.lineup.xi, ...m.lineup.subs].map(id => idSlug.get(id)).filter(Boolean)
    let gol = 0
    for (const sl of kadro) { const c = await get(`/players/${sl}/career`); for (const se of c?.seasons ?? []) for (const r of se.matches ?? []) if (r.matchId === m.eid) gol += r.goals ?? 0 }
    if (gol < bizim) kadro.forEach(sl => golTazele.add(sl))
  }
}

// 2) Güncel kadro kariyerleri: değişiklikte (ya da gol bekleyen maçın kadrosundaysa) tazele
for (const p of club.squad ?? []) {
  const c = await get(`/players/${p.slug}/career`, { fresh: changed || golTazele.has(p.slug) })
  out.players.push({ slug: p.slug, name: p.name, no: p.jerseyNumber, pos: p.position?.code, captain: !!p.captain, career: c })
}

// 3) Eski oyuncular: maç kadrolarında Crew için yer alıp güncel kadroda olmayanlar
const idx = await get('/search/index', { fresh: FULL })
const slugOf = new Map((idx?.players ?? []).map(p => [p.id, p]))
const current = new Set((club.squad ?? []).map(p => p.playerId))
const seen = new Set(out.matches.flatMap(m => m.lineup ? [...m.lineup.xi, ...m.lineup.subs] : []))
out.idMap = Object.fromEntries([...(club.squad ?? []).map(p => [p.playerId, p.slug]), ...[...seen].filter(id => slugOf.has(id)).map(id => [id, slugOf.get(id).slug])])
out.former = []
for (const id of seen) {
  if (current.has(id)) continue
  const e = slugOf.get(id)
  if (!e) continue
  const c = await get(`/players/${e.slug}/career`, { fresh: FULL })
  out.former.push({ slug: e.slug, name: e.name, nowClub: e.clubName, no: c?.player?.jerseyNumber ?? '', pos: c?.player?.position?.code ?? 'O', captain: false, career: c })
}

// 4) Doğum günleri (yalnız gün ve ay)
out.birthdays = {}
for (const p of [...out.players, ...out.former]) {
  const d = await get(`/players/${p.slug}`)
  if (d?.day && d?.month) out.birthdays[p.slug] = { day: d.day, month: d.month }
}

// 5) YouTube: RSS (son 15 video) her seferinde; birikimli liste cache/yt.json'da
// Birikimli video listesi depoda kalıcı tutulur (önbellek silinse de kaybolmaz)
const YT = here('./youtube.json')
const yt = existsSync(YT) ? JSON.parse(readFileSync(YT, 'utf8')) : (existsSync(here('./ytsearch.json')) ? JSON.parse(readFileSync(here('./ytsearch.json'), 'utf8')) : [])
try {
  const x = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`)).text()
  const unesc = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  let yeni = 0
  for (const e of x.split('<entry>').slice(1)) {
    const id = (e.match(/<yt:videoId>([^<]+)/) ?? [])[1]
    const title = unesc((e.match(/<title>([^<]*)/) ?? [])[1] ?? '')
    const published = (e.match(/<published>([^<]+)/) ?? [])[1]
    if (!id || !/1337/.test(title)) continue
    const old = yt.find(v => v.id === id)
    if (old) { old.published ??= published; continue }
    yt.push({ id, title, published }); yeni++
  }
  console.log('YouTube RSS: yeni video', yeni)
} catch (e) { stats.hatalar.push('YouTube RSS: ' + e.message) }
writeFileSync(YT, JSON.stringify(yt, null, 1))
out.youtube = yt

writeFileSync(here('./backfill.json'), JSON.stringify(out))
// Bu çalışmada istek hatası olduysa imzayı kaydetme: bir sonraki çalışma ayrıntıları yeniden tazelesin
const tutarsiz = (club.recentMatches ?? []).some(rm => { const m = out.matches.find(x => x.slug === rm.slug); return !m || m.status !== rm.status || m.home.score !== rm.home?.score || m.away.score !== rm.away?.score })
  || (club.upcomingMatches ?? []).some(um => { const m = out.matches.find(x => x.slug === um.slug); return !m || m.date !== um.date || m.time !== um.time })
if (tutarsiz) console.log('Kulüp özeti ile sezon listesi tutmuyor: sonraki turda yeniden çekilecek')
const tamam = !stats.hatalar.length && !tutarsiz
writeFileSync(STATE_FILE, JSON.stringify({ golTazeleZaman: golTazele.size ? Date.now() : state.golTazeleZaman, sig: !tamam ? state.sig : sig, lastFull: FULL && !stats.hatalar.length ? Date.now() : state.lastFull, lastSeasonList: (changed || sezonTaze) && tamam ? Date.now() : state.lastSeasonList, lastRun: Date.now() }))
writeFileSync(here('./sync-stats.json'), JSON.stringify({ ...stats, degisiklik: changed, tam: FULL }))
console.log('maç', out.matches.length, 'oyuncu', out.players.length, 'eski', out.former.length, 'istek', stats.istek, 'önbellek', stats.onbellek, 'hata', stats.hatalar.length)
