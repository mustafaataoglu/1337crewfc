import type { Match } from '@/types'
import { kickoff } from '@/lib/site'

const SURE_DK = 100
const ICS = 'https://1337crewfc.com/data/takvim.ics'
/** Bütün fikstüre abonelik: telefon takvimi webcal adresini açar, Google Takvim kendi ekleme sayfasını */
export const ABONE_WEBCAL = ICS.replace(/^https:/, 'webcal:')
export const ABONE_GOOGLE = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(ABONE_WEBCAL)}`

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const baslik = (m: Match) => `${m.home.name} - ${m.away.name}`
const aciklama = (m: Match) => `${m.compLabel}${m.week ? ` · ${m.week}. hafta` : ''}\nhttps://1337crewfc.com/#mac/${encodeURIComponent(m.id)}`

/** Tek maçı takvime ekleme dosyası (.ics) indirir; iPhone ve çoğu Android doğrudan takvime ekler */
export function macTakvimeEkle(m: Match) {
  const bas = kickoff(m), bit = new Date(bas.getTime() + SURE_DK * 60e3)
  const kac = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//1337 Crew FC//Mac//TR', 'BEGIN:VEVENT', `UID:${m.eid ?? m.id}@1337crewfc.com`, `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(bas)}`, `DTEND:${utc(bit)}`, `SUMMARY:${kac(baslik(m))}`, `DESCRIPTION:${kac(aciklama(m))}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  a.download = `1337-${m.date}.ics`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

/** Google Takvim'de etkinlik oluşturma sayfası */
export function macGoogle(m: Match) {
  const bas = kickoff(m), bit = new Date(bas.getTime() + SURE_DK * 60e3)
  const q = new URLSearchParams({ action: 'TEMPLATE', text: baslik(m), dates: `${utc(bas)}/${utc(bit)}`, details: aciklama(m) })
  return `https://calendar.google.com/calendar/render?${q}`
}
