// Derlenen siteye (site/) sunucu dosyalarını ekler ve içerikten sürüm numarası üretir.
// kur.php bilerek eklenmez: kurulum dosyası sunucuya sadece bir kez elle yüklenir.
import { cpSync, readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const site = join(root, 'site')
const server = join(root, 'server')
if (!existsSync(join(site, 'index.html'))) throw new Error('site/index.html yok, önce web derlenmeli')

cpSync(server, site, { recursive: true, filter: src => !src.endsWith('kur.php') })

const files = []
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p) } }
walk(site)
const h = createHash('sha1')
for (const f of files.sort()) {
  if (f.endsWith('surum.txt')) continue
  h.update(f.slice(site.length).replace(/\\/g, '/'))
  h.update(readFileSync(f))
}
const surum = h.digest('hex').slice(0, 12)
writeFileSync(join(site, 'surum.txt'), surum + '\n')
console.log('site/ hazır, sürüm', surum, '·', files.length, 'dosya')
