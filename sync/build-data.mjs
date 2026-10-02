// Ham doldurma verisini (backfill.json + YouTube arama/RSS) sitenin veri modeline çevirir.
// Canlı sitedeki "değişiklik motoru"nun prototipi: video eşleştirme, kilometre taşları, akış kartları.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const here = p => new URL(p, import.meta.url)
import { createRequire } from 'node:module'
const sharp = createRequire(new URL('../web/package.json', import.meta.url))('sharp')
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'

// ---- forma renkleri: görseldeki baskın 1-2 renk ve Türkçe adı
const NAMED = [['Siyah', [25, 25, 25]], ['Beyaz', [240, 240, 240]], ['Gri', [140, 140, 140]], ['Sarı', [245, 215, 20]], ['Hardal', [215, 160, 50]],
  ['Turuncu', [240, 130, 30]], ['Kırmızı', [210, 35, 40]], ['Bordo', [125, 25, 45]], ['Pembe', [240, 175, 200]], ['Mor', [120, 60, 160]],
  ['Lacivert', [25, 40, 90]], ['Mavi', [40, 110, 210]], ['Açık mavi', [120, 190, 235]], ['Yeşil', [40, 140, 70]], ['Açık yeşil', [140, 205, 90]], ['Kahverengi', [120, 80, 45]]]
const nameOf = ([r, g, b]) => NAMED.reduce((best, [n, c]) => { const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2; return d < best.d ? { n, d } : best }, { n: '', d: Infinity }).n
const JFILE = new URL('./cache/jerseys.json', import.meta.url)
const jSaved = existsSync(JFILE) ? JSON.parse(readFileSync(JFILE, 'utf8')) : {}
async function jerseyInfo(path) {
  if (jSaved[path]) return jSaved[path]
  const r = await jerseyInfoRaw(path)
  if (r) { jSaved[path] = r; writeFileSync(JFILE, JSON.stringify(jSaved)) }
  return r
}
async function jerseyInfoRaw(path) {
  try {
    const buf = Buffer.from(await (await fetch(S3 + path)).arrayBuffer())
    const { data, info } = await sharp(buf).resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const bins = new Map()
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] < 200) continue
      const k = [data[i], data[i + 1], data[i + 2]].map(v => Math.min(255, Math.round(v / 24) * 24)).join(',')
      bins.set(k, (bins.get(k) ?? 0) + 1)
    }
    const total = [...bins.values()].reduce((a, b) => a + b, 0)
    const sorted = [...bins.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ rgb: k.split(',').map(Number), share: n / total }))
    // benzer tonları aynı renk adında topla
    const byName = new Map()
    for (const c of sorted) { const n = nameOf(c.rgb); const e = byName.get(n) ?? { n, share: 0, rgb: c.rgb }; e.share += c.share; byName.set(n, e) }
    const top = [...byName.values()].sort((a, b) => b.share - a.share).filter((c, i) => i === 0 || (c.share > 0.16 && !['Gri', 'Kahverengi'].includes(c.n))).slice(0, 2)
    const hex = c => '#' + c.rgb.map(v => v.toString(16).padStart(2, '0')).join('')
    return { img: S3 + path, colors: top.map(hex), colorName: top.map(c => c.n).join('-').toLowerCase().replace(/^./, ch => ch.toUpperCase()) }
  } catch { return null }
}
const raw = JSON.parse(readFileSync(here('./backfill.json'), 'utf8'))
const search = raw.youtube ?? (existsSync(here('./ytsearch.json')) ? JSON.parse(readFileSync(here('./ytsearch.json'), 'utf8')) : [])
const CLUB = '5cdbaeed0d916105e6b9cc9c'
const S3 = 'https://s3-eu-west-1.amazonaws.com/efendilig/'
const TODAY = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)

// ---- yardımcılar
const TR = { 'İ': 'I', 'I': 'I', 'ı': 'I', 'Ş': 'S', 'ş': 'S', 'Ğ': 'G', 'ğ': 'G', 'Ü': 'U', 'ü': 'U', 'Ö': 'O', 'ö': 'O', 'Ç': 'C', 'ç': 'C' }
const norm = s => (s ?? '').replace(/[İIıŞşĞğÜüÖöÇç]/g, c => TR[c]).toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '')
const lenMin = l => { if (!l) return null; const p = l.split(':').map(Number); return p.length === 3 ? p[0] * 60 + p[1] : p[0] }
const short = s => (s.match(/^(\d{4})-(\d{4})/) ? s.replace(/^(\d{4})-\d{2}(\d{2}).*/, '$1-$2') : s)

async function dataUri(url, max = 60000) {
  try {
    const r = await fetch(url)
    if (!r.ok) return undefined
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > max) return undefined
    const type = r.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
    return `data:${type};base64,${buf.toString('base64')}`
  } catch { return undefined }
}

// ---- maçlar
const compOf = m => m.comp ?? 'other'
let matches = raw.matches.map(m => {
  const usHome = m.home.id === CLUB
  const o = usHome ? m.home : m.away, t = usHome ? m.away : m.home
  const done = m.status === 'done' && o.score != null
  return {
    id: m.slug, season: m.season, seasonShort: short(m.season), date: m.date, time: m.time,
    status: done ? 'done' : 'upcoming', comp: compOf(m), compLabel: m.compLabel ?? '', week: m.week,
    home: { name: m.home.name, code: m.home.code, score: m.home.score ?? null, logoPath: m.home.logo },
    away: { name: m.away.name, code: m.away.code, score: m.away.score ?? null, logoPath: m.away.logo },
    us: usHome ? 'home' : 'away',
    result: done ? (o.score > t.score ? 'G' : o.score === t.score ? 'B' : 'M') : null,
    videos: m.video ? [{ id: m.video, kind: 'full', title: `${m.home.name} – ${m.away.name}` }] : [],
    forfeit: done && !m.video && (!m.lineup || (!m.lineup.xi.length && !m.lineup.subs.length)) && ((o.score === 3 && t.score === 0) || (o.score === 0 && t.score === 3)),
    mvp: m.mvp ? { name: m.mvp.name, ours: m.mvp.club === CLUB } : undefined,
  }
})

// ---- YouTube videolarını maçlara eşleştir
const byId = new Map(search.map(v => [v.id, v]))
for (const m of matches) for (const v of m.videos) {
  const s = byId.get(v.id)
  if (s) { v.title = s.title; v.len = s.len; v.published = s.published }
}
const used = new Set(matches.flatMap(m => m.videos.map(v => v.id)))
// "3 ay önce yayınlandı" -> yaklaşık yayın tarihi ve hata payı (gün)
function pubDate(v) {
  if (v.published) return { t: new Date(v.published).getTime(), tol: 1 }
  return agoToDate(v.ago)
}
function agoToDate(ago) {
  const m = (ago ?? '').match(/(\d+)\s*(saat|gün|hafta|ay|yıl)/)
  if (!m) return null
  const n = Number(m[1]), unit = { saat: 0, gün: 1, hafta: 7, ay: 30.4, yıl: 365 }[m[2]]
  const tol = { saat: 1, gün: 2, hafta: 7, ay: 18, yıl: 190 }[m[2]]
  return { t: new Date(TODAY).getTime() - n * unit * 864e5, tol }
}
const extra = []
for (const v of search) {
  if (used.has(v.id)) continue
  const T = norm(v.title)
  const isHl = /^ÖZET/i.test(v.title)
  const years = v.title.match(/(\d{4})-(\d{4})/)
  const week = v.title.match(/(\d+)\.\s*Hafta/i)
  let cand = matches.filter(m => m.status === 'done' && T.includes(norm(m.us === 'home' ? m.away.name : m.home.name)))
  if (years) cand = cand.filter(m => m.season.startsWith(years[1]))
  if (week) cand = cand.filter(m => m.week === Number(week[1]))
  if (/play-?off/i.test(v.title)) cand = cand.filter(m => m.comp === 'playoff')
  else if (/kupa/i.test(v.title)) cand = cand.filter(m => m.comp === 'cup')
  else if (/sezonu/i.test(v.title)) cand = cand.filter(m => m.comp === 'league')
  if (isHl && !years && !week) {
    // Özet başlıkları sade ("ÖZET - X & Y"): en yakın tarihli, özeti olmayan maç
    cand = cand.filter(m => !m.videos.some(x => x.kind === 'highlight')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 1)
  }
  if (cand.length > 1) {
    // Başlık yetmiyorsa yayın tarihine bak: video maçtan sonra, hata payı içinde yayınlanmış olmalı
    const pub = pubDate(v)
    if (pub) {
      const near = cand.filter(m => { const t = new Date(m.date).getTime(); return t <= pub.t + pub.tol * 864e5 && t >= pub.t - (pub.tol + 10) * 864e5 })
      if (near.length === 1) cand = near
    }
  }
  if (cand.length === 1) {
    const m = cand[0]
    const kind = isHl ? 'highlight' : (lenMin(v.len) ?? 60) < 45 ? 'part' : 'full'
    m.videos.push({ id: v.id, kind, title: v.title, len: v.len, published: v.published })
    used.add(v.id)
  } else {
    extra.push({ id: v.id, kind: (lenMin(v.len) ?? 60) < 15 ? 'highlight' : (lenMin(v.len) ?? 60) < 45 ? 'part' : 'full', title: v.title, len: v.len })
  }
}
// Bir maçın parça videoları varsa API'deki tekil video da bir parçadır
for (const m of matches) {
  if (m.videos.some(v => v.kind === 'part')) for (const v of m.videos) if (v.kind === 'full' && (lenMin(v.len) ?? 60) < 45) v.kind = 'part'
  m.videos.sort((a, b) => (a.kind === 'highlight' ? -1 : 0) - (b.kind === 'highlight' ? -1 : 0))
}

// ---- oyuncular
const cur = raw.club.season
// Sadece Crew formasıyla oynanan maçlar sayılır (kariyer başka kulüpleri de içerebilir)
const crewSlugs = new Set(raw.matches.map(m => m.slug.toLowerCase()))
const mvpCount = {}
for (const m of raw.matches) if (m.mvp?.club === CLUB && m.mvp.slug) mvpCount[m.mvp.slug] = (mvpCount[m.mvp.slug] ?? 0) + 1
// ---- ORTAK OYUNCU LİSTESİ: güncel kadro + eski oyuncular, mükerrer hesaplar birleştirilir
const POS = { K: 'K', S: 'S', OS: 'O', O: 'O', F: 'F' }
const tokens = n => norm(n).length ? (n ?? '').split(String.fromCharCode(32)).map(norm).filter(Boolean) : []
const sameperson = (a, b) => { const A = tokens(a), B = tokens(b); if (!A.length || !B.length) return false; const [s1, l1] = A.length <= B.length ? [A, B] : [B, A]; return s1.at(-1) === l1.at(-1) && s1.every(t => l1.includes(t)) }
const accounts = [
  ...raw.players.map(p => ({ ...p, former: false })),
  ...(raw.former ?? []).map(p => ({ ...p, former: true })),
]
const people = []
for (const a of accounts) {
  const host = people.find(p => sameperson(p.name, a.name))
  if (host) { host.accounts.push(a); if (host.former && !a.former) Object.assign(host, { slug: a.slug, name: a.name, no: a.no, pos: a.pos, captain: a.captain, former: false }); continue }
  people.push({ slug: a.slug, name: a.name, no: a.no, pos: a.pos, captain: a.captain, former: a.former, nowClub: a.nowClub, accounts: [a] })
}
const players = people.map(p => {
  const bySeasonMap = new Map(), countedMatch = new Set()
  const tot = { m: 0, g: 0, a: 0, yc: 0, rc: 0, mvp: 0 }
  let now = { m: 0, g: 0, a: 0, mvp: 0 }, photoPath, elM = 0
  for (const acc of p.accounts) {
    const c = acc.career ?? {}
    photoPath ??= c.player?.photoUrl
    elM += c.career?.matches ?? 0
    tot.mvp += mvpCount[acc.slug] ?? 0
    for (const se of c.seasons ?? []) {
      const label = short(se.label ?? se.seasonSlug ?? '')
      const line = bySeasonMap.get(label) ?? { label, m: 0, g: 0, a: 0, start: se.year ?? Number(label.slice(0, 4)) }
      for (const r of se.matches ?? []) {
        const key = (r.slug ?? '').toLowerCase()
        if (!r.played || !crewSlugs.has(key) || countedMatch.has(key)) continue
        countedMatch.add(key)
        line.m++; line.g += r.goals ?? 0; line.a += r.assists ?? 0
        tot.yc += r.yellow ?? 0; tot.rc += r.red ?? 0
        if (se.seasonId === cur.id) { now.m++; now.g += r.goals ?? 0; now.a += r.assists ?? 0 }
      }
      bySeasonMap.set(label, line)
    }
  }
  const bySeason = [...bySeasonMap.values()].filter(l => l.m).sort((x, y) => y.start - x.start).map(({ start, ...l }) => l)
  tot.m = bySeason.reduce((n, l) => n + l.m, 0); tot.g = bySeason.reduce((n, l) => n + l.g, 0); tot.a = bySeason.reduce((n, l) => n + l.a, 0)
  const parts = p.name.split(' ')
  return {
    slug: p.slug, name: p.name, no: p.no ?? '', pos: POS[p.pos] ?? 'O', captain: !!p.captain, former: p.former,
    nowClub: p.former ? p.nowClub ?? undefined : undefined,
    short: parts.length > 2 ? parts.slice(-1)[0] : parts[0],
    photoPath, firstYear: bySeason.length ? Number(bySeason.at(-1).label.slice(0, 4)) : undefined, seasons: bySeason.length,
    otherClubMatches: elM > tot.m ? elM - tot.m : 0,
    accountSlugs: p.accounts.map(a => a.slug),
    birthday: p.accounts.map(a => raw.birthdays?.[a.slug]).find(Boolean),
    career: tot, current: now, bySeason,
  }
}).filter(p => !p.former || p.career.m > 0)
// Aynı kısa ad iki kişide varsa soyadının baş harfini ekle
const cnt = {}
players.forEach(p => (cnt[p.short] = (cnt[p.short] ?? 0) + 1))
players.forEach(p => { if (cnt[p.short] > 1) p.short = `${p.name.split(' ')[0]} ${p.name.split(' ').slice(-1)[0][0]}.` })

// ---- maç kadroları (ilk 11 + yedek), ortak listeden
const personOf = new Map(players.flatMap(p => p.accountSlugs.map(sl => [sl, p.slug])))
const idToPerson = id => personOf.get(raw.idMap?.[id])
for (const rm of raw.matches) {
  const m = matches.find(x => x.id === rm.slug)
  if (m && rm.lineup) m.lineup = { xi: rm.lineup.xi.map(idToPerson).filter(Boolean), subs: rm.lineup.subs.map(idToPerson).filter(Boolean) }
}
// ---- maç başına gol ve asist (oyuncu kariyerlerindeki maç satırlarından)
const bySlug = new Map(matches.map(m => [m.id.toLowerCase(), m]))
for (const p of [...raw.players, ...(raw.former ?? [])]) for (const se of p.career?.seasons ?? []) for (const pm of se.matches ?? []) {
  const m = bySlug.get((pm.slug ?? '').toLowerCase()); if (!m) continue
  const pl = players.find(x => x.accountSlugs.includes(p.slug))
  if (!pl || !pm.played) continue
  if (pm.goals && !(m.scorers ??= []).some(x => x.slug === pl.slug)) m.scorers.push({ slug: pl.slug, name: pl.name, n: pm.goals })
  if (pm.assists && !(m.assisters ??= []).some(x => x.slug === pl.slug)) m.assisters.push({ slug: pl.slug, name: pl.name, n: pm.assists })
}
// ---- puan tablosu
const table = cur.totalTable.map(r => ({ rank: r.rank, name: r.name, code: r.code, played: r.played, points: r.points, gd: r.goalDiff, us: r.clubId === CLUB }))
const club = {
  name: raw.club.club.name, founded: raw.club.club.foundedYear, coach: raw.club.club.coach, captains: raw.club.club.captains,
  season: cur.label, rank: cur.rank,
  stats: { played: cur.stats.played, wins: cur.stats.wins, draws: cur.stats.draws, losses: cur.stats.losses, gf: cur.stats.goalsFor, ga: cur.stats.goalsAgainst, points: cur.stats.points },
  form: (raw.club.form ?? []).map(x => ({ W: 'G', D: 'B', L: 'M' }[x] ?? x)),
}

// ---- akış (değişiklik motorunun bugünkü çıktısı)
const feed = []
const done = matches.filter(m => m.status === 'done').sort((a, b) => b.date.localeCompare(a.date))
const next = matches.filter(m => m.status !== 'done').sort((a, b) => a.date.localeCompare(b.date))[0]
const opp = m => (m.us === 'home' ? m.away : m.home)
const ourS = m => (m.us === 'home' ? m.home : m.away)
if (next) {
  const t = opp(next), row = table.find(r => r.code === t.code), us = table.find(r => r.us)
  const h2h = done.filter(m => opp(m).code === t.code)
  const w = h2h.filter(m => m.result === 'G').length, d = h2h.filter(m => m.result === 'B').length, l = h2h.filter(m => m.result === 'M').length
  feed.push({
    id: 'pre-' + next.id, kind: 'preview', date: TODAY, matchId: next.id,
    title: row?.rank === 1 ? `Lider ${t.name} ${next.us === 'home' ? 'bize geliyor' : 'ile deplasmanda'}` : `Sırada ${t.name} var`,
    body: `${row ? `${t.name} ${row.played} maçta ${row.points} puan ve ${row.gd > 0 ? '+' : ''}${row.gd} averajla ${row.rank}. sırada. ` : ''}Biz ${us?.points} puanla ${us?.rank}. sıradayız. ${h2h.length ? `Kayıtlı ${h2h.length} karşılaşmada ${w} galibiyet, ${d} beraberlik, ${l} mağlubiyet.` : 'Kayıtlarda aramızda oynanmış maç yok.'}`,
  })
  feed.push({ id: 'vote-' + next.id, kind: 'vote', date: TODAY, title: `${t.name} maçı için 11'ini kur`, body: 'Taraftar oylaması açıldı. Maç saatinde kapanır, sonuçlar takıma iletilir.' })
}
for (const m of done.filter(m => m.seasonShort === short(cur.label))) {
  const t = opp(m), o = ourS(m)
  const hl = m.videos.find(v => v.kind === 'highlight')
  if (hl) feed.push({ id: 'hl-' + m.id, kind: 'video', date: hl.published ? new Date(new Date(hl.published).getTime() + 3 * 3600e3).toISOString().slice(0, 10) : addDays(m.date, 2), matchId: m.id, videoId: hl.id, title: `Özet yayında: ${m.home.name} ${m.home.score}–${m.away.score} ${m.away.name}`, body: `${hl.len ? hl.len + ' dakikalık ' : ''}maç özeti EfendiLig kanalına yüklendi ve maç sayfasına eklendi.` })
  const verb = m.result === 'G' ? 'galibiyet' : m.result === 'B' ? 'beraberlik' : 'mağlubiyet'
  feed.push({
    id: 'rep-' + m.id, kind: 'report', date: m.date, matchId: m.id,
    title: `${m.us === 'home' ? 'Evimizde' : t.name + ' deplasmanında'} ${o.score}–${t.score} ${verb}`,
    body: `${m.compLabel}${m.week ? ` ${m.week}. hafta` : ''}. ${m.scorers?.length ? `Goller: ${m.scorers.map(x => x.name + (x.n > 1 ? ` (${x.n})` : '')).join(', ')}. ` : ''}${m.assisters?.length ? `Asist: ${m.assisters.map(x => x.name).join(', ')}. ` : ''}${m.mvp ? (m.mvp.ours ? `MVP bizden: ${m.mvp.name}. ` : `MVP rakipten ${m.mvp.name}. `) : ''}${m.videos.length ? 'Maçın videosu maç sayfasında.' : ''}`,
  })
}
function addDays(d, n) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
// kilometre taşları: bu sezon geçilen eşikler
const lastDate = done[0]?.date ?? TODAY
for (const p of players) {
  if (!p.current.m) continue
  for (const T of [25, 50, 75, 100]) if (p.career.m >= T && p.career.m - p.current.m < T) {
    const top = [...players].sort((a, b) => b.career.m - a.career.m)[0]
    feed.push({ id: `ms-m-${p.slug}-${T}`, kind: 'milestone', date: lastDate, playerSlug: p.slug, title: `${p.name}: kulüpte ${T}. maç`, body: `Toplam ${p.career.m} maç, ${p.career.g} gol, ${p.career.a} asist.${top.slug === p.slug ? ' Kulübün en çok forma giyen oyuncusu.' : ''}` })
  }
  for (const T of [10, 25, 50]) if (p.career.g >= T && p.career.g - p.current.g < T) feed.push({ id: `ms-g-${p.slug}-${T}`, kind: 'milestone', date: lastDate, playerSlug: p.slug, title: `${p.name} ${T}. golünü attı`, body: `${p.career.m} maçta ${p.career.g} gol.` })
  for (const T of [10, 25]) if (p.career.a >= T && p.career.a - p.current.a < T) feed.push({ id: `ms-a-${p.slug}-${T}`, kind: 'milestone', date: lastDate, playerSlug: p.slug, title: `${p.name} ${T}. asistini yaptı`, body: `${p.career.m} maçta ${p.career.a} asist. Kulübün asist listesinde üst sıralarda.` })
  if (p.current.g > 0 && p.career.g === p.current.g) feed.push({ id: `ms-first-${p.slug}`, kind: 'milestone', date: lastDate, playerSlug: p.slug, title: `${p.name} ilk golünü attı`, body: `EfendiLig'deki ${p.career.m}. maçında ilk golü geldi.` })
}
const [ty, tm, td] = TODAY.split('-').map(Number)
for (const p of players.filter(p => !p.former && p.birthday?.day === td && p.birthday?.month === tm)) {
  feed.push({ id: 'bd-' + p.slug + '-' + ty, kind: 'birthday', date: TODAY, playerSlug: p.slug, title: `İyi ki doğdun ${p.name}!`, body: `1337 formasıyla ${p.career.m} maç, ${p.career.g} gol, ${p.career.a} asist. Bugün onun günü.` })
}
const usRow = table.find(r => r.us)
if (usRow && done[0]) feed.push({ id: 'tbl-' + done[0].id, kind: 'table', date: done[0].date, title: `${usRow.played}. haftadan sonra ${usRow.rank}. sıradayız`, body: `${usRow.points} puan, averaj ${usRow.gd}. Lider ${table[0].name} ${table[0].points} puanda.` })
const ORDER = { birthday: -1, preview: 0, vote: 1, video: 2, table: 3, milestone: 4, report: 5, streak: 6 }
feed.sort((a, b) => b.date.localeCompare(a.date) || ORDER[a.kind] - ORDER[b.kind])

// ---- görseller (prototipte gömülü; canlı sitede sunucuda önbellek)
const jCache = new Map()
for (const m of matches) {
  if (m.status === 'done') continue
  const rm = raw.matches.find(x => x.slug === m.id)
  for (const side of ['home', 'away']) {
    const j = rm?.[side]?.jersey
    if (!j?.imageUrl) continue
    if (!jCache.has(j.imageUrl)) jCache.set(j.imageUrl, await jerseyInfo(j.imageUrl))
    const info = jCache.get(j.imageUrl)
    if (info) m[side].jersey = { kind: j.name === 'Ev' ? 'home' : 'away', ...info }
  }
}
console.log('formalar:', [...jCache.entries()].map(([k, v]) => k.split('/').pop() + '=' + v?.colorName + ' ' + v?.colors.join('/')).join(' | '))
const thumbs = new Map()
for (const v of [...matches.flatMap(m => m.videos), ...extra]) {
  if (!thumbs.has(v.id)) thumbs.set(v.id, `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`)
  v.thumb = thumbs.get(v.id)
}
for (const f of feed) if (f.videoId) f.thumb = thumbs.get(f.videoId)
const clubLogo = S3 + raw.club.club.logoUrl
club.logo = clubLogo
const logos = new Map()
for (const m of matches) for (const s of [m.home, m.away]) {
  if (s.logoPath && !logos.has(s.logoPath)) logos.set(s.logoPath, S3 + s.logoPath)
  s.logo = s.code === '1337' ? undefined : logos.get(s.logoPath)
  delete s.logoPath
}
for (const p of players) {
  if (p.photoPath) p.photo = S3 + p.photoPath
  delete p.photoPath
  delete p.accountSlugs
}

const gallery = JSON.parse(readFileSync(here('./gallery/galeri.json'), 'utf8'))
const body = { club, table, matches, players, extraVideos: extra, feed, gallery }
const hash = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 12)
const OUTDIR = here('../web/public/data/')
mkdirSync(OUTDIR, { recursive: true })
const OUT = new URL('./veri.json', OUTDIR)
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null
const out = { updatedAt: prev?.hash === hash ? prev.updatedAt : new Date().toISOString(), hash, ...body }
if (prev?.hash !== hash) writeFileSync(OUT, JSON.stringify(out))
const syncStats = existsSync(here('./sync-stats.json')) ? JSON.parse(readFileSync(here('./sync-stats.json'), 'utf8')) : {}
writeFileSync(new URL('./durum-sync.json', OUTDIR), JSON.stringify({ veriDegisti: prev?.hash !== hash, veriZamani: out.updatedAt, hash, ...syncStats, mac: matches.length, oyuncu: players.length, video: matches.reduce((n, m) => n + m.videos.length, 0) }))
console.log(prev?.hash === hash ? 'Veri değişmedi' : 'Veri güncellendi: ' + hash)
const vids = matches.reduce((n, m) => n + m.videos.length, 0)
console.log({ matches: matches.length, withVideo: matches.filter(m => m.videos.length).length, videos: vids, highlights: matches.flatMap(m => m.videos).filter(v => v.kind === 'highlight').length, parts: matches.flatMap(m => m.videos).filter(v => v.kind === 'part').length, extra: extra.length, photos: players.filter(p => p.photo).length, thumbs: [...thumbs.values()].filter(Boolean).length, logos: [...logos.values()].filter(Boolean).length, feed: feed.length, kb: Math.round(JSON.stringify(out).length / 1024) })
