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

export function kickoff(m: Match) {
  const [y, mo, d] = m.date.split('-').map(Number)
  const [h, mi] = (m.time || '21:00').split(':').map(Number)
  return new Date(y, mo - 1, d, h, mi)
}

export const ours = (m: Match) => (m.us === 'home' ? m.home : m.away)
export const theirs = (m: Match) => (m.us === 'home' ? m.away : m.home)

export const played = data.matches.filter(m => m.status === 'done').sort((a, b) => b.date.localeCompare(a.date))
export const upcoming = data.matches.filter(m => m.status !== 'done').sort((a, b) => a.date.localeCompare(b.date))
export const matchById = (id: string) => data.matches.find(m => m.id === id)
export const playerBySlug = (s: string) => data.players.find(p => p.slug === s)
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
  return [...(scope === 'current' ? squad : data.players)]
    .filter(p => (p[scope][key] ?? 0) > 0)
    .sort((a, b) => (b[scope][key] ?? 0) - (a[scope][key] ?? 0) || a[scope].m - b[scope].m)
}

export const AYLAR = AY
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
