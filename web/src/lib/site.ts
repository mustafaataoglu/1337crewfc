import type { Match, Player, SiteData } from '@/types'

// main.tsx veri.json'u yükleyip buraya koyar; uygulama ondan sonra yüklenir
export const data = (window as unknown as { __VERI__: SiteData }).__VERI__

export const yt = (id: string) => `https://www.youtube.com/watch?v=${id}`

const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

export function fmtDate(d: string, withDay = false) {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  const dt = new Date(y, m - 1, day)
  return `${withDay ? GUN[dt.getDay()] + ', ' : ''}${day} ${AY[m - 1]}${withDay ? '' : ' ' + y}`
}

/** Maç başlama anı: İstanbul saatiyle (ziyaretçi hangi ülkede olursa olsun doğru) */
export function kickoff(m: Match) {
  const time = /^\d\d:\d\d$/.test(m.time ?? '') ? m.time : '21:00'
  return new Date(`${m.date}T${time}:00+03:00`)
}
const order = (m: Match) => `${m.date}T${m.time ?? ''}`

export const ours = (m: Match) => (m.us === 'home' ? m.home : m.away)
export const theirs = (m: Match) => (m.us === 'home' ? m.away : m.home)

export const played = data.matches.filter(m => m.status === 'done').sort((a, b) => order(b).localeCompare(order(a)))
// Yaklaşan: henüz oynanmamış ve başlama saatinden en fazla 2 saat geçmiş maçlar (skor girilene kadar takılı kalmasın)
export const upcoming = data.matches.filter(m => m.status !== 'done' && kickoff(m).getTime() > Date.now() - 2 * 3600e3).sort((a, b) => order(a).localeCompare(order(b)))
/** Oylama ve tahminin açık olduğu maç: henüz başlamamış ilk maç (başlamış maç skor girilene kadar "yaklaşan"da kalır) */
export const acikMac = () => upcoming.find(m => kickoff(m).getTime() > Date.now())
// Eski adresler (saat değişince değişen maç adresi, oyuncunun eski hesabı) güncel kayda yönlenir
export const matchById = (id: string) => { const g = data.macTakma?.[id] ?? id; return data.matches.find(m => m.id === g || m.eid === g) }
export const playerBySlug = (s: string) => { const g = data.oyuncuTakma?.[s] ?? s; return data.players.find(p => p.slug === g) }
export const guncelSlug = (s: string) => data.oyuncuTakma?.[s] ?? s
/** Ortak oyuncu listesi: güncel kadro (Kadro, Senin 11'in) ve eski oyuncular (arşiv, tüm zamanlar) */
export const squad = data.players.filter(p => !p.former)
export const formerPlayers = data.players.filter(p => p.former).sort((a, b) => b.career.m - a.career.m)

export const POS_LABEL: Record<string, string> = { K: 'Kaleci', S: 'Defans', O: 'Orta saha', F: 'Forvet' }
export const COMP_LABEL: Record<string, string> = { league: 'Lig', cup: 'Kupa', 'super-cup': 'Süper Kupa', playoff: 'Play-off', atk: 'ATK Ligi', other: 'Diğer' }

export function initials(p: Player) {
  const parts = p.name.split(' ')
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function rankBy(key: 'g' | 'a' | 'm' | 'mvp', scope: 'current' | 'career') {
  // Bu sezon: sezon içinde ayrılan oyuncular da bu sezonki katkısıyla listede kalır
  return [...data.players]
    .filter(p => (p[scope][key] ?? 0) > 0)
    .sort((a, b) => (b[scope][key] ?? 0) - (a[scope][key] ?? 0) || a[scope].m - b[scope].m)
}

export const AYLAR = AY
/** Bugünün tarihi (yerel), YYYY-MM-DD */
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/** Güncel kadronun yaklaşan doğum günleri, sitenin açıldığı günün tarihine göre */
export function upcomingBirthdays(limit = 5, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return squad.filter(p => p.birthday).map(p => {
    let d = new Date(today.getFullYear(), p.birthday!.month - 1, p.birthday!.day)
    if (d < today) d = new Date(today.getFullYear() + 1, p.birthday!.month - 1, p.birthday!.day)
    return { p, days: Math.round((d.getTime() - today.getTime()) / 864e5) }
  }).sort((a, b) => a.days - b.days).slice(0, limit)
}
export const bdayText = (p: Player) => (p.birthday ? `${p.birthday.day} ${AY[p.birthday.month - 1]}` : '')
