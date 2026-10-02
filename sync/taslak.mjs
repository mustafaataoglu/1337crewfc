// Yapay zekâ yazılarını siteye koymadan dener: birkaç maç raporu ve maç önü yazısı üretip ekrana yazar.
// GitHub'da "Yazı taslağı" çalışmasıyla elle başlatılır (YAZAR_TASLAK=1).
import { readFileSync } from 'node:fs'
import { raporYaz, onizlemeYaz, durum } from './yazar.mjs'

const d = JSON.parse(readFileSync(new URL('../web/public/data/veri.json', import.meta.url), 'utf8'))
const done = d.matches.filter(m => m.status === 'done').sort((a, b) => b.date.localeCompare(a.date))
const secim = [
  ...done.slice(0, 2),
  ...done.filter(m => (m.scorers?.length ?? 0) >= 2 && !done.slice(0, 2).includes(m)).slice(0, 2),
  ...done.filter(m => m.result === 'G' && !m.forfeit).slice(0, 1),
]
const ko = m => new Date(`${m.date}T${m.time || '21:00'}:00+03:00`).getTime()
const next = d.matches.filter(m => m.status !== 'done' && ko(m) > Date.now()).sort((a, b) => ko(a) - ko(b))[0]

for (const m of secim) {
  const r = await raporYaz(m)
  console.log(`\n### RAPOR · ${m.home.name} ${m.home.score}-${m.away.score} ${m.away.name} (${m.date})`)
  console.log(r ? `[${r.model}]\n${r.metin}` : '(yazılamadı)')
}
if (next) {
  const r = await onizlemeYaz(next, d.table, done)
  console.log(`\n### MAÇ ÖNÜ · ${next.home.name} - ${next.away.name} (${next.date})`)
  console.log(r ? `[${r.model}]\n${r.metin}` : '(yazılamadı)')
}
console.log('\n### REDDEDİLENLER')
for (const x of durum.reddedilen) console.log(`- ${x.anahtar.slice(0, 50)} [${x.model}] ${x.sebep}: ${x.metin.slice(0, 200)}`)
console.log('\n### HATALAR\n' + durum.hata.slice(0, 10).join('\n'))
