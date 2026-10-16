// EfendiLig ham verisinin yedeği: sync/cache/ altındaki API yanıtları (kulüp, sezonlar, sezon maç listeleri, maç ayrıntıları,
// oyuncu kariyerleri ve profilleri, arama dizini, forma renkleri) ve sync/backfill.json, geçmişi main'den ayrı 'efendilig-yedek'
// dalına yazılır. EfendiLig kapanırsa site bu daldan yeniden üretilebilir; sunucunun indirdiği main zip'i büyümez.
// guncelle.yml'de güncelleme turundan sonra işte bir kez çalışır. Günde en çok bir yedek commit'i (tam senkronda ya da
// henüz yedek yoksa beklemez); içerik değişmediyse commit atılmaz. Hata olursa yazılır ve geçilir, iş düşmez.
//   node sync/yedekle.mjs [--tam]
// Depo herkese açık: sitenin yayımlamadığı kişisel veri yedeğe girmez (AYIKLANAN; ayrıntı BENIOKU metninde).
// Yeni anlık görüntü önceki ucun ağacından başlar: yerelde eksik ya da okunamayan dosya yedekteki son sürümüyle kalır.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DAL = 'efendilig-yedek'
const ARALIK = 23 * 3600e3 // iş saatleri kaydığı için 24 yerine 23 saat
const HARIC = new Set(['state.json', 'red.json']) // her turda değişen durum dosyaları, ham veri değil
const root = fileURLToPath(new URL('..', import.meta.url))
const CACHE = join(root, 'sync/cache')
const TAM = process.argv.includes('--tam')

// EfendiLig fotoğraf dosya adları tam doğum tarihini (yıl dahil) içerir. Sitenin yayımlamadığı fotoğraf yolları ayıklanır:
// rakip ve başka kulüplerdeki takım arkadaşlarının fotoğrafları. Profilde doğum yılı yok (gün/ay site yayımlıyor).
// ust: alanın bulunduğu üst anahtar (null: her yerde). Hem ayıklama hem BENIOKU bu listeden.
const AYIKLANAN = [
  { ust: null, k: 'MvpPlayerImage', aciklama: 'maç ayrıntısı: MVP oyuncunun fotoğraf yolu (rakip oyuncular dahil; site kullanmıyor)' },
  { ust: 'teammates', k: 'photoUrl', aciklama: 'oyuncu kariyeri: takım arkadaşlarının fotoğraf yolları (başka kulüplerdekiler dahil; site kullanmıyor)' },
]
function ayikla(v, ust) {
  if (Array.isArray(v)) return v.map(x => ayikla(x, ust))
  if (!v || typeof v !== 'object') return v
  const o = {}
  for (const [k, x] of Object.entries(v)) {
    if (AYIKLANAN.some(a => a.k === k && (a.ust === null || a.ust === ust))) continue
    o[k] = ayikla(x, k)
  }
  return o
}

const BENIOKU = `# EfendiLig ham veri yedeği

Bu dal \`main\`'den bağımsızdır (ortak geçmiş yok) ve yalnızca veri içerir. \`sync/yedekle.mjs\` güncelleme işinden sonra,
içerik değiştiyse günde en çok bir kez, öncekinin üstüne yeni bir anlık görüntü commit'i olarak yazar. Dosya silinmez:
yerelde eksik ya da okunamayan dosya önceki sürümüyle kalır.

- \`cache/\`: \`sync/backfill.mjs\`'in EfendiLig API'sinden (https://apiv1.efendilig.com/api) aldığı yanıtlar, alındığı gibi
  (yalnızca \`data\` alanı, boşluksuz (küçültülmüş) JSON). Dosya adı istek yolundan üretilir (\`/players/x/career\` → \`_players_x_career.json\`).
  \`jerseys.json\` forma görsellerinden çıkarılan renklerdir. \`state.json\` ve \`red.json\` (her turda değişen durum) alınmaz.
- \`backfill.json\`: \`sync/build-data.mjs\`'in girdisi (\`fetchedAt\` alanı çıkarılmış). EfendiLig erişilemezken siteyi
  doğrudan bundan üretmek için.

## Ayıklanan alanlar

Depo herkese açık. Sitenin yayımlamadığı kişisel veri yedeğe yazılmaz:

${AYIKLANAN.map(a => `- \`${a.ust ? a.ust + '[].' : ''}${a.k}\`: ${a.aciklama}`).join('\n')}

EfendiLig fotoğraf dosya adları tam doğum tarihini içerir (\`.../1234-7-Ad-Soyad-1990-01-012026-...\`). 1337 oyuncularının
fotoğraf yolları (\`squad[].photoUrl\`, kariyerde \`player.photoUrl\`, profilde \`imagePath\`) site verisinde zaten
yayımlandığı için yedekte kalır. Profilde doğum yılı yok (yalnız gün/ay). Telefon, e-posta ya da kimlik numarası yok.

## Geri yükleme

GitHub Actions önbelleği boşsa \`guncelle.yml\` \`sync/cache\`'i bu daldan kendiliğinden doldurur. Elle:

    git fetch origin efendilig-yedek
    mkdir -p sync/cache && git archive FETCH_HEAD cache | tar -x -C sync
    git show FETCH_HEAD:backfill.json > sync/backfill.json   # EfendiLig yoksa: doğrudan node sync/build-data.mjs

Uçtaki bir dosya bozuksa ya da boş geldiyse eski anlık görüntüler dalın geçmişindedir (sığ klonda önce
\`git fetch --unshallow origin efendilig-yedek\`):

    git log --oneline FETCH_HEAD -- cache/<dosya>
    git show <commit>:cache/<dosya> > sync/cache/<dosya>
`

const yaz = m => console.log('Yedek:', m)
function git(args, { env } = {}) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env })
  if (r.status !== 0) throw new Error(`git ${args[0]}: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`)
  return r.stdout.trim()
}
const yas = uc => Date.now() - Number(git(['log', '-1', '--format=%ct', uc])) * 1000
// Dalın uzaktaki ucunu getirir; dal yoksa null. ls-remote: 0 var, 2 yok, başka kod bağlantı hatası.
function uzakUc() {
  const r = spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', DAL], { cwd: root, encoding: 'utf8' })
  if (r.status === 2) return null
  if (r.status !== 0) throw new Error('ls-remote: ' + (r.stderr || '').trim().split('\n')[0])
  // Tam klonda --depth=1 dalın geçmişini (eski anlık görüntüleri) gizler; yalnızca sığ klonda (CI) kullanılır
  const derinlik = git(['rev-parse', '--is-shallow-repository']) === 'true' ? ['--depth=1'] : []
  git(['fetch', '-q', ...derinlik, 'origin', `+refs/heads/${DAL}:refs/remotes/origin/${DAL}`])
  return git(['rev-parse', `refs/remotes/origin/${DAL}`])
}

// Anlık görüntünün ağacı: geçici index uçtaki ağaçla başlar, okunan dosyalar üstüne yazılır (--ignore-removal: silinen yok)
function agacKur(icerik, uc) {
  const env = { GIT_INDEX_FILE: join(gecici, 'index'), GIT_WORK_TREE: icerik }
  if (uc) git(['read-tree', uc], { env })
  else rmSync(env.GIT_INDEX_FILE, { force: true })
  git(['add', '--ignore-removal', '.'], { env })
  return git(['write-tree'], { env })
}

let gecici
try {
  const dosyalar = existsSync(CACHE) ? readdirSync(CACHE).filter(f => f.endsWith('.json') && !HARIC.has(f)).sort() : []
  if (!dosyalar.length) { yaz('sync/cache boş, atlandı'); process.exit(0) }

  let uc = uzakUc()
  if (uc && !TAM) {
    const once = yas(uc)
    if (once < ARALIK) { yaz(`son yedek ${(once / 3600e3).toFixed(1)} saat önce, atlandı`); process.exit(0) }
  }

  // Anlık görüntü geçici bir klasörde hazırlanır, geçici bir index ile ağaca yazılır (çalışma kopyası ve main index'i değişmez)
  gecici = mkdtempSync(join(tmpdir(), 'efendilig-yedek-'))
  const icerik = join(gecici, 'icerik')
  mkdirSync(join(icerik, 'cache'), { recursive: true })
  let bozuk = 0
  for (const f of dosyalar) {
    let v
    try { v = JSON.parse(readFileSync(join(CACHE, f), 'utf8')) } catch { bozuk++; continue }
    writeFileSync(join(icerik, 'cache', f), JSON.stringify(ayikla(v)))
  }
  const BF = join(root, 'sync/backfill.json')
  if (existsSync(BF)) {
    try { const { fetchedAt, ...b } = JSON.parse(readFileSync(BF, 'utf8')); writeFileSync(join(icerik, 'backfill.json'), JSON.stringify(ayikla(b))) } catch { bozuk++ }
  }
  writeFileSync(join(icerik, 'BENIOKU.md'), BENIOKU)
  if (bozuk) yaz(`${bozuk} dosya okunamadı, ${uc ? 'yedekteki önceki sürümü kalır' : 'alınmadı'}`)

  let agac = agacKur(icerik, uc)
  const kimlik = { GIT_AUTHOR_NAME: '1337crewfc-bot', GIT_AUTHOR_EMAIL: '1337crewfc-bot@users.noreply.github.com', GIT_COMMITTER_NAME: '1337crewfc-bot', GIT_COMMITTER_EMAIL: '1337crewfc-bot@users.noreply.github.com' }
  // Dal yalnızca anlık görüntülerden oluşur: yeni commit her zaman uzaktaki son ucun üstüne kurulur.
  // Aynı anda başka bir iş (kod/veri kuyrukları) yedek gönderdiyse (non-fast-forward ya da eşzamanlı ref güncellemesi)
  // bir kez yeniden denenir; diğer işin yedeği ARALIK'tan yeniyse (tam senkron değilse) ikinci commit atılmaz.
  // Başka retler (kural ihlali, yetki) hemen hata olur.
  for (let deneme = 1; ; deneme++) {
    if (uc && git(['rev-parse', `${uc}^{tree}`]) === agac) { yaz('değişiklik yok'); break }
    const sayi = git(['ls-tree', '--name-only', agac, 'cache/']).split('\n').filter(Boolean).length
    const mesaj = `Ham veri yedeği: ${sayi} dosya${TAM ? ' (tam senkron)' : ''}`
    const commit = git(['commit-tree', agac, ...(uc ? ['-p', uc] : []), '-m', mesaj], { env: kimlik })
    const p = spawnSync('git', ['push', '-q', 'origin', `${commit}:refs/heads/${DAL}`], { cwd: root, encoding: 'utf8' })
    if (p.status === 0) { yaz(`gönderildi ${commit.slice(0, 12)}${uc ? '' : ' (ilk yedek)'}`); break }
    // Sebep (ör. GH013 kural ihlali, 403) mesajda kalsın: ipucu, uyarı ve genel "failed to push" satırları atılır
    const sebep = (p.stderr || '').split('\n').map(s => s.trim()).filter(s => s && !/^(hint:|warning:|To |error: failed to push)/.test(s)).join(' / ').slice(0, 400)
    if (deneme === 2 || !/\[rejected\]|fetch first|non-fast-forward|cannot lock ref|incorrect old value/.test(p.stderr)) throw new Error('push reddedildi: ' + (sebep || `çıkış kodu ${p.status}`))
    yaz('push reddedildi (dal ilerlemiş), uzaktaki dal yeniden alınıp deneniyor')
    uc = uzakUc()
    if (uc && !TAM && yas(uc) < ARALIK) { yaz('başka iş az önce yedekledi, atlandı'); break }
    agac = agacKur(icerik, uc)
  }
} catch (e) {
  yaz('başarısız, geçildi: ' + e.message)
  // Adım continue-on-error ile hep yeşil biter; uyarı çalıştırma özetinde görünsün
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Ham veri yedeği::${e.message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`)
} finally {
  if (gecici) rmSync(gecici, { recursive: true, force: true })
}
process.exit(0)
