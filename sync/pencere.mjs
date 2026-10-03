// Maç penceresi döngüsü. GitHub'ın zamanlanmış çalışmaları saatlerce gecikebildiği için (Ağustos 2026'dan beri
// platform genelinde 15 dakikalık zamanlama 3-5 saatte bir geliyor) maç günü güncelliği bu döngü sağlar:
// oynanmamış bir maçın başlamasından 4 saat önce ile 6 saat sonrası arasındaysak 10 dakikada bir güncelleme turu.
// Pencere dışında hiçbir şey yapmaz. İşin süresi dolarken pencere sürüyorsa sıradaki çalışmayı başlatır
// (zincir yalnızca maç penceresinde kurulur, maç bitince kendiliğinden durur).
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ONCE = 4 * 3600e3, SONRA = 6 * 3600e3, ARALIK = 10 * 60e3
const SINIR = 5 * 3600e3 + 15 * 60e3 // işin 6 saatlik üst sınırının altında kal (ilk tur da bu sürenin içinde)
const basla = Date.now()
const kickoff = m => new Date(`${m.date}T${/^\d\d:\d\d$/.test(m.time ?? '') ? m.time : '21:00'}:00+03:00`).getTime()
function pencerede() {
  try {
    const v = JSON.parse(readFileSync(new URL('../web/public/data/veri.json', import.meta.url), 'utf8'))
    const t = Date.now()
    return v.matches.find(m => m.status !== 'done' && t >= kickoff(m) - ONCE && t <= kickoff(m) + SONRA) ?? null
  } catch { return null }
}

const m = pencerede()
if (!m) { console.log('Maç penceresi dışında, döngü yok'); process.exit(0) }
console.log(`Maç penceresi: ${m.home.name} - ${m.away.name} (${m.date} ${m.time}); 10 dakikada bir güncellenecek`)
while (Date.now() - basla + ARALIK < SINIR) {
  await new Promise(r => setTimeout(r, ARALIK))
  if (!pencerede()) { console.log('Maç penceresi bitti'); process.exit(0) }
  console.log('— tur', new Date().toISOString())
  spawnSync('bash', ['sync/tur.sh'], { stdio: 'inherit', env: { ...process.env, ZORLA_PING: '0', TAM: '' } })
}
if (pencerede()) {
  console.log('Pencere sürüyor, sıradaki çalışma başlatılıyor')
  const r = spawnSync('gh', ['workflow', 'run', 'guncelle.yml', '--ref', 'main', '-f', 'dongu=true'], { stdio: 'inherit' })
  if (r.status !== 0) console.log('Sıradaki çalışma başlatılamadı; zamanlanmış çalışma devam ettirecek')
}
