// Maç raporları ve maç önü yazıları yapay zekâyla yazılır.
// Sağlayıcı sırası: Google Gemini (GEMINI_API_KEY), yoksa/olmazsa OpenRouter ücretsiz modelleri (OPENROUTER_API_KEY).
// Anahtarlar GitHub gizli değişkenlerinde durur. Hiçbiri çalışmazsa site kalıp metinleri kullanır.
// Her yazı bir kez üretilip sync/yazilar.json'a kaydedilir; bilgiler değişmedikçe yeniden yazılmaz.
// Uydurmaya karşı her yazı şu kontrollerden geçer: skor, sonucun yönü, rakip adı, saha, gün/saat/hafta/tarih,
// puan/sıra sayıları, golcü rolleri, "biz" dili, bilgide olmayan isim, başlık satırı.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const FILE = new URL('./yazilar.json', import.meta.url)
// Reddetme sayacı depoya değil önbelleğe yazılır (her turda commit oluşmasın)
const RED_FILE = new URL('./cache/red.json', import.meta.url)
// YAZAR_YAYINDA=1: yeni yazı üretilir. YAZAR_TASLAK=1: üretilir ama kaydedilmez (deneme için).
// Kayıtlı yazılar her derlemede kullanılır (yerel derlemede raporlar kaybolmasın); tamamen kapatmak için YAZAR_YAYINDA=0.
const YAYINDA = process.env.YAZAR_YAYINDA === '1'
const TASLAK = process.env.YAZAR_TASLAK === '1'
const ACIK = YAYINDA || TASLAK
const KAPALI = process.env.YAZAR_YAYINDA === '0'
const GEMINI = process.env.GEMINI_API_KEY
const OPENROUTER = process.env.OPENROUTER_API_KEY
const BIR_CALISMADA_EN_FAZLA = 6 // her 15 dakikada en fazla bu kadar yeni yazı (ücretsiz kota)
const ESKI_EN_FAZLA = 2 // bir turda en fazla kaç eski maç DENENİR (başarılı ya da değil) — kota önce güncel yazılara
const EN_FAZLA_ISTEK = 24 // bir turdaki toplam HTTP isteği (tekrar denemeler ve doğrulama dahil)
const DENETIM_EN_FAZLA = 2 // doğrulayıcıdan önce kaydedilmiş yazılardan bir turda en fazla kaçı denetlenir
const RED_SINIR = 3 // bir yazı art arda bu kadar tur reddedilirse...
const RED_BEKLE = 6 * 3600e3 // ...bu kadar süre denenmez (bilgisi değişirse hemen denenir)
const SURE = 5 * 60e3 // yazarın bir turda harcayabileceği en uzun süre (sağlayıcılar cevap vermezse tur uzamasın)
const BASLA = Date.now()

export const yazilar = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {}
delete yazilar._red // eski sürümde sayaç burada tutuluyordu
const RED = existsSync(RED_FILE) ? JSON.parse(readFileSync(RED_FILE, 'utf8')) : {}
export const durum = { yazildi: 0, eski: 0, hata: [], model: null, istek: 0, durdu: { gemini: false, openrouter: false }, tukenen: [], reddedilen: [], atlanan: 0, yukseltilen: 0, bekleyen: 0, bekleyenDogrulandi: 0, denetim: 0, dogrulama: { yapildi: 0, reddetti: 0 } }

// ---------- metin yardımcıları
const TR = { 'İ': 'I', 'I': 'I', 'ı': 'I', 'Ş': 'S', 'ş': 'S', 'Ğ': 'G', 'ğ': 'G', 'Ü': 'U', 'ü': 'U', 'Ö': 'O', 'ö': 'O', 'Ç': 'C', 'ç': 'C', 'Â': 'A', 'â': 'A' }
const norm = s => (s ?? '').replace(/[İIıŞşĞğÜüÖöÇçÂâ]/g, c => TR[c]).toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '')
const ozet = o => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 10)
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const gunAdi = tarih => { const [y, m, d] = tarih.split('-').map(Number); return GUNLER[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }
const tarihYazi = tarih => { const [y, m, d] = tarih.split('-').map(Number); return `${d} ${AYLAR[m - 1]} ${y}` }
/** Bilgideki tarihten [ay, gün]; iki biçim de okunur */
const tarihParca = t => { const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (iso) return [Number(iso[2]), Number(iso[3])]; const y = t.match(/^(\d{1,2})\s+(\S+)/); return y ? [AYLAR.findIndex(a => norm(a) === norm(y[2])) + 1, Number(y[1])] : [0, 0] }
/** Cümlelere böl */
const cumleler = metin => metin.split(/(?<=[.!?…])\s+(?!\p{Ll})/u).map(s => s.trim()).filter(Boolean)
/** Kelimelere böl: boşluk, noktalama, tırnak, tire ve eğik çizgide; her kelimenin kesme işaretinden önceki kökü */
const parcala = s => s.split(/[\s,;:!?.()"“”«»\[\]—–\-\/]+/).map(w => w.replace(/^[^\p{L}\d]+|[^\p{L}\d'’]+$/gu, '')).filter(Boolean)
const kok = w => w.replace(/^['’]+|['’]+$/g, '').split(/['’]/)[0]

/** Model bazen başa başlık ya da skor satırı ekler: noktalamasız kısa ilk satırı at */
function temizle(s) {
  let t = (s ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/[*#_`>]/g, '').replace(/[ \t]+\n/g, '\n').trim()
  const satir = t.split(/\n/)
  if (satir.length > 1 && satir[0].trim().length < 90 && !/[.!?…]$/.test(satir[0].trim())) t = satir.slice(1).join('\n').trim()
  return t.replace(/^["“”']+|["“”']+$/g, '').trim()
}

// ---------- bilgide olmayan isim
const SERBEST = new Set(['EFENDILIG', 'EFENDI', 'SEZONU', 'SEZON', 'LIGI', 'LIG', 'KUPASI', 'KUPA', 'PLAYOFF', 'PLAY', 'OFF', 'MVP', 'CREW', 'FC', '1337', 'ATK', 'FINAL', 'YOLU', 'YOL', 'GRUBU', 'GRUP', 'HAFTA', 'HAFTASI', 'EN', 'DEGERLI', 'OYUNCU', 'OYUNCUSU', ...AYLAR.map(norm), ...GUNLER.map(norm)])
// Büyük harfle yazılsa da ek alabilen kökler ("Sezonunda", "Yolunda", "Kupasında")
const EKLI_KOK = ['SEZON', 'LIG', 'KUPA', 'YOL', 'FINAL', 'HAFTA', 'EFENDI', 'GRUP', 'PLAYOFF']
// Cümle başında büyük harfle yazılan sıradan kelimeler (ad değildir): tam kelime ya da (uzun kökler için) ek almış hali
const CUMLE_BASI = new Set(['BU', 'BUNA', 'BUNUNLA', 'BOYLE', 'AYNI', 'EV', 'IC', 'IKI', 'UC', 'DORT', 'BES', 'BIR', 'HER', 'TUM', 'ILK', 'SON', 'EN', 'YINE', 'DAHA', 'OYSA', 'GECEN', 'MAC', 'MACI', 'MACIN', 'MACTA', 'MACTAN', 'MACA', 'GOL', 'GOLU', 'GOLLER', 'GOLLERI', 'GOLLERINI', 'GOLLERLE', 'MVP', 'LIGDE', 'TEK', 'HEM', 'OTE', 'ORTA', 'SADECE', 'YALNIZCA', 'AMA', 'BUNUN', 'KALAN', 'OTEKI', 'UCUNCU', 'ATILAN', 'HAT', 'TRICK', 'BOYLELIKLE', 'DOLAYISIYLA', 'NETICEDE', 'NITEKIM', 'KISACASI', 'HATTA', 'ZIRA', 'OYLEKI', 'SONUNDA', 'NETICE'])
const CUMLE_BASI_KOK = ['TAKIM', 'KARSILASMA', 'MUCADELE', 'ASIST', 'SKOR', 'SONUC', 'DEVRE', 'YARI', 'RAKIP', 'RAKIB', 'DEPLASMAN', 'SAHA', 'SEZON', 'HAFTA', 'PUAN', 'SIRA', 'TABLO', 'ONCEKI', 'OYUNCU', 'KALECI', 'GALIBIYET', 'MAGLUBIYET', 'BERABERLIK', 'KAYIT', 'TARAF', 'ANCAK', 'AYRICA', 'BOYLECE', 'SONRA', 'ONCE', 'IKINCI', 'BIRINCI', 'SIRADAKI', 'DEGERLI', 'GOL', 'KONUK', 'TOPLAM', 'ARDINDAN', 'UZATMA', 'PENALTI', 'FRIKIK', 'KAFA', 'KONTRA', 'HUCUM', 'SAVUNMA', 'DEFANS', 'DIGER', 'USTELIK', 'OZELLIKLE', 'FAKAT', 'EKIP', 'EKIB', 'MUSABAKA', 'YENILGI', 'YENILGIDE']
const siradanMi = w => { const n = norm(kok(w)); return CUMLE_BASI.has(n) || CUMLE_BASI_KOK.some(r => n.startsWith(r) && n.length - r.length <= 6) }
const bilgiKelimeleri = bilgi => new Set(JSON.stringify(bilgi).split(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşüÂâ]+/).map(norm).filter(Boolean))
function izinliMi(w, izinli) {
  const n = norm(kok(w))
  if (!n || /^\d+$/.test(n) || izinli.has(n)) return true
  // ek almış hali ("Sezonunda", "Bordreauxnun"): izinli bir kökle başlıyorsa
  return [...EKLI_KOK, ...[...izinli].filter(x => x.length >= 4)].some(r => n.startsWith(r) && n.length - r.length <= 6)
}
/** Metinde, verilen bilgilerde geçmeyen özel isim var mı? */
function yabanciIsim(metin, bilgi) {
  const izinli = new Set([...SERBEST, ...bilgiKelimeleri(bilgi)])
  for (const cumle of cumleler(metin)) {
    const ham = cumle.split(/\s+/)
    const kisiCumlesi = /^\S+(\s+[a-zçğıöşü0-9][^\s]*){0,3}?\s+[a-zçğıöşü]*(att|kaydett|buld|imza|fileleri)/u.test(cumle)
    for (let i = 0; i < ham.length; i++) {
      for (const w of parcala(ham[i])) {
        if (!/^[A-ZÇĞİÖŞÜ]/.test(w)) continue
        if (i === 0) {
          // Cümle başı her zaman büyük harflidir. Yine de ad kalıbındaysa (virgül, kesme işaretli ek, ardından büyük harfli kelime)
          // ya da gol/asist/MVP cümlesindeyse kontrol edilir — sıradan bir kelime değilse.
          const sonrakiAd = /^[A-ZÇĞİÖŞÜ]/.test(ham[1] ?? '') && !izinliMi(parcala(ham[1])[0] ?? '', izinli)
          const adKalibi = kisiCumlesi || /^[^\-–]+[,’']/.test(ham[0]) || sonrakiAd
          if (!adKalibi || siradanMi(w)) continue
        }
        if (!izinliMi(w, izinli)) return w
      }
    }
  }
  return null
}

// ---------- "biz" dili: site kulüpten üçüncü şahısla bahseder
const BIZ_ON = /^(biz(im|ler|de|den|e|i|ce|siz|dek)|aramız|önümüz|arkamız|yanımız|kendimiz|hepimiz|birimiz|ikimiz|karşımız)/
const BIZ_KELIME = new Set(['biz', 'idik', 'imişiz', 'iyiz', 'değiliz'])
const HAL = '(ı|i|u|ü|a|e|da|de|ta|te|dan|den|tan|ten|ın|in|un|ün|la|le|dır|dir|dur|dür|dı|di|du|dü|ki|daki|deki|dakiler|dekiler|ca|ce|dayken|deyken)?'
const BIZ_EK = new RegExp('(' + [
  'ıyoruz', 'iyoruz', 'uyoruz', 'üyoruz', // çıkıyoruz
  'acağız', 'eceğiz', // kazanacağız
  'mışız', 'mişiz', 'muşuz', 'müşüz',
  '(ıyor|iyor|uyor|üyor)duk', '(dı|di|du|dü|tı|ti|tu|tü)ysak', '(dı|di|du|dü|tı|ti|tu|tü)ysek',
  '[aeıioöuü]d[ıiuü]k', // oynadık
  '([bcgğjlmnrvyz]d|[çfhkpsşt]t)[ıiuü]k', // kazandık, attık, çıktık, bildik (ses uyumu: yumuşaktan sonra -dık, sertten sonra -tık)
  '(ımız|imiz|umuz|ümüz|[aeıioöuü]m[ıiuü]z)([aeıioöuüdtlnkcçy][a-zçğıöşü]*)?', // takımımıza, sahamızdaydı, takımımızdakiler (dinamizm gibi ünsüzle devam edenler hariç)
  '[rlny][ıiuü]z', // lideriz, hazırız, güçlüyüz, kazanırız, sıradayız
  's[ıiuü]z[ıiuü]z', // yenilgisiziz, puansızız, golsüzüz
  '[bğşçp][ıiuü]z', // galibiz, mağlubuz, eksiğiz, beşiz
  's[ae]k', // kazansak, oynasak, kazanırsak, kazandıysak
  '[ae]l[ıi]m', // bakalım, izleyelim
].join('|') + ')$')
const BIZ_DEGIL = new Set([
  'artık', 'açık', 'yakın', 'mutlak', 'deniz', 'sekiz', 'semiz', 'temiz', 'beniz', 'yalnız', 'kendiniz', 'henüz', 'maruz', 'sürpriz', 'analiz', 'ingiliz', 'kriz', 'yıldız', 'kunduz', 'domuz', 'otuz', 'dokuz', 'karpuz', 'cengiz', 'oğuz', 'ağız', 'ikiz',
  'taktik', 'istatistik', 'plastik', 'fantastik', 'mistik', 'lojistik', 'elastik', 'akustik', 'eklektik', 'baltık', 'klasik', 'yastık', 'romantik', 'otantik', 'optik', 'artistik', 'periyodik', 'mantık', 'koltuk', 'sandık', 'bildik', 'alışıldık',
  'beklenmedik', 'alışılmadık', 'görülmedik', 'umulmadık', 'rastlanmadık', 'yaşanmadık', 'denenmedik', 'gelmedik', 'tanıdık', 'sadık', 'dimdik', 'fındık', 'çeltik', 'erdik', 'gedik',
  'selim', 'halim', 'alim', 'zalim', 'kalım', 'teslim', 'hakim', 'hâkim', 'bilim', 'dilim', 'ilim', 'yasak', 'başak', 'yüksek', 'kuşak', 'boynuz', 'kopuz', 'hepsek',
])
const BIZ_DEGIL_ON = /^(omuz|temiz|domuz|semiz|yamuz|yıldız|deniz|analiz|sürpriz|kriz|yasak|yüksek)/
// Ses uyumu gereği fiil olamayan alıntı sonları (romantik, artistik, periyodik, taktik) ve bileşikler (Akdeniz)
const BIZ_DEGIL_SON = /(deniz|yıldız|analiz|kriz|istik|astik|ustik|aktik|ptik|ntik|odik)$/
const APOSTROF_BIZ = /^(y?[ıiuü]z|m[ıiuü]z|ımız|imiz|umuz|ümüz|n?[dt][ae]y[ıi]z|l[ıiuü]y[ıiuü]z|[dt][ıiuü]k)/ // 1337'miz, Yolu'ndayız, 1337'liyiz
/** Birinci çoğul şahıs içeren kelimeyi döndürür, yoksa null. `izinli`: bilgide geçen (norm) kelimeler — bunlar sorgulanmaz. */
export function bizVar(metin, izinli = new Set()) {
  for (const ham0 of metin.toLocaleLowerCase('tr').split(/[^a-z0-9çğıöşüâ'’]+/)) {
    const ham = ham0.replace(/^['’]+|['’]+$/g, '')
    if (!ham) continue
    const [w, ...ekler] = ham.split(/['’]/)
    const ek = ekler.join('')
    if (ek && APOSTROF_BIZ.test(ek)) return ham
    if (!w || izinli.has(norm(w))) continue
    if (BIZ_KELIME.has(w) || BIZ_ON.test(w)) return ham
    if (w.length >= 5 && !BIZ_DEGIL.has(w) && !BIZ_DEGIL_ON.test(w) && !BIZ_DEGIL_SON.test(w) && BIZ_EK.test(w)) return ham
  }
  return null
}

// ---------- maça özel kontroller
/** Skor "X-Y" (ev sahibi önce), başka bir sayının parçası olmadan: "2026-2027" içindeki "6-2" sayılmaz */
const skorVar = (t, m) => new RegExp(`(?<![\\d-])${m.home.score}\\s*[-–—−:]\\s*${m.away.score}(?![\\d-])`).test(t)
const GENEL = new Set(['FC', 'FK', 'SK', 'AC', 'CF', 'SC', 'JK', 'SPOR', 'KULUBU'])
const takimParcalari = ad => { const tam = ad.split(/[\s\-–—\/]+/).map(norm).filter(Boolean); return { tam, kisa: tam.filter(x => !GENEL.has(x)) } }
/** Takım adı tam kelimelerle geçiyor mu? "FC/FK/SK/AC" olmadan da kabul edilir ("AC Nevizade" → "Nevizade") */
function adVar(t, ad) {
  const metin = parcala(t).map(w => norm(kok(w))).filter(Boolean)
  const { tam, kisa } = takimParcalari(ad)
  const icinde = parca => parca.length > 0 && metin.some((_, i) => parca.every((p, j) => metin[i + j] === p))
  return icinde(tam) || (kisa.length > 0 && icinde(kisa))
}
/** Cümlenin önceki maça dair kısmını (… maçın ardından / … sonra) at: kontroller yalnızca bu maça bakar */
const buMac = c => c.split(/(?<!\p{L})(?:ardından|sonrası|sonra|ertesinde)(?!\p{L})/iu).at(-1)
/** Önceki bir maçtan söz eden cümle (maç önünde son maç bilgisi verilir; o maçın sahası bu maçınkiyle karışmasın) */
const oncekiMac = c => /(?<!\p{L})(son|önceki|geçen|bir\s+önceki)\s+(maç|hafta|karşılaşma|mücadele)/iu.test(c)
const ONE = String.raw`1337(?:\s*Crew\s*FC)?`
const SAHIP_1337 = new RegExp(`${ONE}['’](n[iı]n|in)\\s+(kendi\\s+|iç\\s+)?(sahas|evi|ev\\s+sahipliğ)`, 'i')
const kelimeler = c => parcala(c).map(w => ({ ham: w, n: norm(kok(w)), ekli: /['’]/.test(w) }))
const kacir = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Takım adının ardından gelip onu bir ad öbeğinin parçası yapan kelimeler ("1337 Crew FC karşısında", "Baston Villa ile").
// Ardından virgül geliyorsa takım yine öznedir ("Baston Villa, …").
const TUMLEC = /^(karşısında|karşısına|karşısındaki|karşı|ile|ilen|önünde|tarafından|arasında|arasındaki|lehine|aleyhine|adına|ve)$/i
// İyelik eki almış baş ad: "Baston Villa maçını / savunmasını / deplasmanında" (ama "deplasmanda", "sahadan" değil)
const IYELIK = /^(maç|mücadele|karşılaşma|deplasman|savunma|kale|taraftar|seyirci|saha|ekib|takım|forma|oyuncu|kadro|hücum|engel|cephe|tribün|golcü)(ler|lar)?s?[ıiuü](n(da|de|dan|den|a|e|ı|i|u|ü|ın|in|un|ün|la|le)?)?$/i
// Yan cümle başındaki takımın ardından gelince belirsizdir, özne sayılır: "1337 Crew FC maçı 3-1 kaybetti", "1337 Crew FC sahasında 1-3 yenildi"
const BASTA_OZNE = /^(\p{L}+[^n\s][ıiuü]|sahas[ıi]nda|sahas[ıi]ndan|evinde|evinden)$/iu
/**
 * Takımın metindeki anılışları: { bas, son, ek, sonraki, virgul, basta, ozne, tamlayan, belirtme }.
 * Tam ad ya da FC/SK gibi genel ekler olmadan; "1337 Crew FC" için tek başına "1337" de sayılır.
 */
function takimAnis(c, ad) {
  const parca = ad.split(/[\s\-–—\/]+/).filter(Boolean)
  const desenler = [parca, parca.filter(x => !GENEL.has(norm(x)))]
  if (/^1337/.test(ad)) desenler.push(['1337'])
  const out = []
  for (const p of desenler) {
    if (!p.length) continue
    const re = new RegExp(`(?<![\\p{L}\\d])${p.map(kacir).join('[\\s\\-–—/]+')}(?:['’](\\p{L}+))?(?![\\p{L}\\d])`, 'giu')
    for (const mt of c.matchAll(re)) {
      if (out.some(o => mt.index >= o.bas && mt.index < o.son)) continue
      const son = mt.index + mt[0].length, ek = (mt[1] ?? '').toLocaleLowerCase('tr')
      const sm = c.slice(son).match(/^\s*(,?)\s*(\p{L}+)?/u)
      const virgul = !!sm?.[1], sonraki = sm?.[2] ?? ''
      // yan cümle başı ("ev sahibi / konuk / lider" öneki olabilir)
      const basta = !/[\p{L}\d]/u.test(c.slice(0, mt.index).replace(/(ev\s+sahibi|konuk|lider|rakip)\s*$/iu, ''))
      const tire = /^\s*[-–—]\s*\S/.test(c.slice(son)) // "Baston Villa - 1337 Crew FC maçı"
      const birlesik = tire || TUMLEC.test(sonraki) || (IYELIK.test(sonraki) && !(basta && BASTA_OZNE.test(sonraki)))
      out.push({ bas: mt.index, son, ek, sonraki, virgul, basta, ozne: !ek && (virgul || !birlesik), tamlayan: /^n?[ıiuü]n$/.test(ek), belirtme: /^[yn]?[ıiuü]$/.test(ek) })
    }
  }
  return out.sort((a, b) => a.bas - b.bas)
}
// Takım adı yerine geçen özne öbekleri ("konuk ekip maçı kazandı"); kime ait olduğu m.us'tan çözülür
const OZNE_OBEK = /(?<![\p{L}'’])(ev\s+sahibi(?:\s+(?:ekip|takım|taraf))?|konuk\s+(?:ekip|takım|taraf)|konuklar|misafir\s+(?:ekip|takım)|deplasman\s+ekibi|rakip\s+(?:ekip|takım))(?![\p{L}'’])(?!\s+(?:ekib|takım|taraf)\p{L})/giu
const OBEK_TAMLAYAN = /(ev\s+sahibi\s+(?:ekibin|takımın)|ev\s+sahibinin|konuk\s+(?:ekibin|takımın)|konukların|rakibinin|rakibin|rakip\s+(?:ekibin|takımın))$/iu
const obekBizMi = (s, m) => /^(ev\s+sahibi)/i.test(s) ? m.us === 'home' : /^(konuk|misafir|deplasman)/i.test(s) ? m.us === 'away' : false
/** Özne öbeklerinin anılışları (ardından bir takım adı geliyorsa öbek o adın ön ekidir, sayılmaz) */
function obekAnis(c, m, takimlar) {
  const out = []
  for (const mt of c.matchAll(new RegExp(OZNE_OBEK.source, 'giu'))) {
    const son = mt.index + mt[0].length
    if (takimlar.some(a => a.bas >= son && /^\s*$/.test(c.slice(son, a.bas)))) continue
    out.push({ bas: mt.index, son, ek: '', ozne: true, obek: true, biz: obekBizMi(mt[0], m) })
  }
  return out
}

// Yer sözünün ardından ortaç + rakip geliyorsa söz rakibi niteler: "kendi sahasında oynayan Baston Villa"
const ORTAC = /^\s*(\p{L}+(?:yan|yen|an|en|dığı|diği|duğu|düğü|tığı|tiği))\s+/iu
const rakibeBagli = (sonra, rakipAd) => { const o = sonra.match(ORTAC); return !!o && takimAnis(sonra.slice(o[0].length), rakipAd).some(a => a.bas === 0) }
// Yer sözünün ardından ortaç + sonuç adı geliyorsa söz önceki maça aittir: "deplasmanda aldığı 2-0'lık yenilgi"
const oncekiMacaBagli = sonra => /^\s*\p{L}+(dığı|diği|duğu|düğü|tığı|tiği|tuğu|tüğü)\s+(\S+\s+){0,2}(yenilgi|galibiyet|beraberlik|mağlubiyet|zafer|puan)/iu.test(sonra)
const BIRINCI_YER = /(kendi\s+sahas\p{L}*|iç\s+saha\p{L}*|(?<!\p{L})sahas[ıi]nda(?!\p{L})|(?<!\p{L})evinde(?!\p{L})|(taraftar|seyirci)\p{L}*\s+önünde)/iu
// Yalnızca çekimli fiiller: "ev sahipliği yaptığı/yapan" ortaçtır, kimin ev sahibi olduğunu söylemez
const AGIRLADI = /(ağırla(dı|yacak|yor|r|mış)|konuk\s+e(tti|decek|diyor|der|miş)|misafir\s+e(tti|decek|diyor|der)|ev\s+sahipliği\s+yap(tı|acak|ıyor|ar|mış))(?!\p{L})/iu
const KONUK_OLDU = /((?<!\p{L})deplasmanda(?!\p{L})|deplasmana\s+çık(tı|acak|ıyor|ar)(?!\p{L})|konu(k|ğu)\s+ol(du|acak|uyor|ur|muş)(?!\p{L})|misafiri\s+ol(du|acak|uyor|ur)(?!\p{L}))/iu
/** 1337'nin ardından ilk bağlaca, "-ken"e ya da virgülden sonra gelen yeni özneye kadar */
function pencereAl(c, bas, kesimler = []) {
  const kes = Math.min(c.length, ...kesimler.filter(x => x > bas))
  return c.slice(bas, kes).split(/;|\s(?:ve|ise|ancak|fakat|ama|oysa)\s|(?<=\p{L}ken)(?!\p{L})/iu)[0].slice(0, 110)
}

/** Saha yanlış mı? Deplasman maçında 1337'yi ev sahibi, iç saha maçında deplasmanda gösteren cümle. Belirsizse yanlış sayılmaz. */
function sahaYanlis(t, m, oncekiRakip = null) {
  const rakipAd = m.us === 'home' ? m.away.name : m.home.name
  for (const c0 of cumleler(t)) {
    if (oncekiMac(c0) && !/(ardından|sonra)/i.test(c0)) continue
    const c = buMac(c0)
    // önceki maçın rakibi geçen cümlede ("Baston Villa'ya yenildiği maçı geride bırakıp…") yalnızca açık kalıplara bakılır
    const oncekiVar = !!oncekiRakip && takimAnis(c, oncekiRakip).length > 0
    const bizHepsi = takimAnis(c, '1337 Crew FC'), biz = bizHepsi.filter(a => a.ozne)
    const rakip = takimAnis(c, rakipAd)
    // virgülden sonra yeni özne (rakip ya da "konuk ekip") 1337'nin penceresini keser
    const kesimler = [...rakip.filter(a => a.ozne), ...obekAnis(c, m, [...rakip, ...bizHepsi])].filter(a => /,\s*$/.test(c.slice(0, a.bas))).map(a => a.bas)
    const basta = rakip.find(a => a.basta && a.ozne) // cümle rakiple başlıyor, rakip özne
    // rakip-başı penceresi: arada 1337 özne ya da tamlayan olarak anılıyorsa ("Bordreaux JB, 1337 Crew FC'nin ev sahipliği…") o kısım 1337'ye aittir
    const bastaPencere = basta ? c.slice(basta.son, Math.min(basta.son + 100, ...bizHepsi.filter(a => a.bas > basta.son && (a.ozne || a.tamlayan)).map(a => a.bas))) : ''
    if (m.us === 'away') {
      if (new RegExp(`ev\\s+sahibi\\s+${ONE}`, 'i').test(c) || SAHIP_1337.test(c)) return true
      if (bizHepsi.some(a => !a.ek && /^\s+(kendi\s+)?(sahas[ıi]nda|evinde)(?!\p{L})/u.test(c.slice(a.son)))) return true // "1337 Crew FC sahasında"
      if (new RegExp(`${ONE},?\\s+(ev\\s+sahibi\\s+(olarak|olduğu|olacağı|konumunda|sıfatıyla)|ev\\s+sahipliği\\s+yap(tı|acak|ıyor|ar)(?!\\p{L}))`, 'iu').test(c)) return true
      if (!oncekiVar) for (const a of biz) {
        const p = pencereAl(c, a.son, kesimler)
        const y = p.match(BIRINCI_YER)
        if (y) {
          const once = p.slice(0, y.index), sonra = p.slice(y.index + y[0].length)
          // yer sözü rakibe ait: tamlayan ("X'in sahasında"), ekli nesne ("X'i evinde yendi"), eksiz izafet ("X sahasında")
          const sonRakip = takimAnis(once, rakipAd).filter(x => /^\s*(kendi\s+)?$/iu.test(once.slice(x.son))).at(-1)
          const rakipSahibi = !!sonRakip || takimAnis(once, rakipAd).some(x => x.tamlayan) || /(rakib\p{L}*|ev\s+sahibi|deplasman|konuk\s+ol|konuğu)/iu.test(once)
          if (!rakipSahibi && !rakibeBagli(sonra, rakipAd) && !oncekiMacaBagli(sonra)) return true
        }
        const ag = p.match(AGIRLADI)
        if (ag && !takimAnis(p.slice(0, ag.index), rakipAd).some(x => x.tamlayan) && !/kendisine\s*$/i.test(p.slice(0, ag.index))) return true
      }
      // rakip özne ve konuk/deplasmanda: "Baston Villa, … 1337 Crew FC'ye konuk oldu"
      if (basta) {
        const y = bastaPencere.match(KONUK_OLDU)
        if (y && !rakibeBagli(bastaPencere.slice(y.index + y[0].length), '1337 Crew FC') && !oncekiMacaBagli(bastaPencere.slice(y.index + y[0].length))) return true
      }
    } else {
      if (new RegExp(`ev\\s+sahibi\\s+${rakipAd.split(/[\s\-–—\/]+/).map(kacir).join('[\\s\\-–—/]+')}`, 'iu').test(c)) return true
      // "X'in sahasında / X'in ev sahipliği yaptığı", "X sahasında", "X deplasmanına çıktı / X deplasmanında"
      if (rakip.some(a => a.tamlayan && /^\s*(kendi\s+|iç\s+)?(sahas|evi|ev\s+sahipliğ)/iu.test(c.slice(a.son)))) return true
      if (rakip.some(a => !a.ek && /^\s+(kendi\s+)?(sahas[ıi]nda|evinde)(?!\p{L})/u.test(c.slice(a.son)) && !rakibeBagli(c.slice(a.son).replace(/^\s+(kendi\s+)?(sahas[ıi]nda|evinde)/u, ''), '1337 Crew FC'))) return true
      if (rakip.some(a => (!a.ek || a.tamlayan) && /^\s+deplasman(ın)?(a|da|dan)(?!\p{L})/u.test(c.slice(a.son)))) return true
      if (!oncekiVar) for (const a of biz) {
        const p = pencereAl(c, a.son, kesimler)
        const y = p.match(KONUK_OLDU)
        if (!y) continue
        const sonra = p.slice(y.index + y[0].length)
        if (!rakibeBagli(sonra, rakipAd) && !oncekiMacaBagli(sonra) && !/^deplasmanda\s+(ağırla|konuk\s+e)/i.test(p.slice(y.index))) return true
      }
      if (basta) {
        if (AGIRLADI.test(bastaPencere)) return true
        const y = bastaPencere.match(/^\s*,?\s*((kendi\s+)?sahas[ıi]nda|evinde|iç\s+sahada)(?!\p{L})/iu)
        if (y && !rakibeBagli(bastaPencere.slice(y[0].length), '1337 Crew FC')) return true
      }
    }
  }
  return false
}

// Sonuç sözleri. "bir puan kazandı", "moral kazandı", "iki puan kaybetti", "galibiyeti kaçırdı", "yenilgi serisine son verdi" sonuç bildirmez.
const KAZAN = new RegExp([
  String.raw`mağlup\s+(etti|ederek|edecek|etmişti|ederken|edip)`, String.raw`(?<!\p{L})yen(di|erek|mişti|erken|ip)(?!\p{L})`, String.raw`alt\s+et(ti|erek|ip)`,
  String.raw`(?<!(bir|1)\s+puan[ıi]?\s|puan\s|moral\s|güven\s|özgüven\s|ivme\s|deneyim\s|tecrübe\s|avantaj\s|zaman\s)kazan(dı|arak|ırken|ıp)(?!\p{L})`,
  String.raw`galip\s+(geldi|gelerek|gelirken|gelip|ayrıldı|ayrılarak|çıktı|çıkarak)`,
  String.raw`galibiyet\p{L}*(\s+[^\s.,;]+){0,5}?\s+(aldı|alarak|elde\s+etti|kazandı|imza\s+attı|uzandı|uzanarak|ulaştı|ulaşarak|kutladı|ekledi)(?!\p{L})`,
  String.raw`galibiyet\p{L}*\s+(sevinci\s+yaşa|hanesine\s+yazdır|sahibi\s+ol)\p{L}*`, String.raw`galibiyet(le|iyle)(?!\p{L})`,
  String.raw`üstün\s+gel(di|erek|irken)`, String.raw`üstünlük\s+kur(du|arak)`, String.raw`zafer\p{L}*\s+(kazandı|elde\s+etti|imza\s+attı|ulaştı|uzandı)`, String.raw`zafer(le|iyle)(?!\p{L})`, String.raw`üstünlüğü(yle|nü\s+kur\p{L}*)(?!\p{L})`,
  String.raw`(yenilgiye|mağlubiyete)\s+uğrat(tı|arak)(?!\p{L})`, String.raw`(mağlup\s+etme|yenme|kazanma)\p{L}*\s+(başardı|bildi)`,
  String.raw`(3|üç)\s+puan\p{L}*\s+(aldı|alarak|kazandı|hanesine\s+yazdır(dı|arak)|topladı|cebine\s+koydu|getirdi|döndü|ayrıldı|kaptı|çıkardı|sahibi\s+oldu)`,
  String.raw`gülen\s+taraf\s+ol(du|arak)`, String.raw`şans\s+tanıma(dı|yarak)`, String.raw`kârlı\s+çık(tı|arak)`,
].join('|'), 'iu')
const KAYBET = new RegExp([
  String.raw`mağlup\s+(oldu|olarak|olurken|olup|ayrıldı|edildi|edilerek)`, String.raw`mağlubiyet\p{L}*\s+(aldı|alarak|yaşadı)`, String.raw`mağlubiyet(le|iyle)(?!\p{L})`,
  String.raw`(yenilgiye|mağlubiyete)\s+(uğra(dı|yarak|mıştı)|uğratıl(dı|arak))(?!\p{L})`, String.raw`yenilgi\p{L}*\s+(aldı|alarak|yaşadı)`, String.raw`yenilgi(yle|siyle)(?!\p{L})`,
  String.raw`(?<!\p{L})yenil(di|erek|irken|mişti|ip)(?!\p{L})`, String.raw`yenik\s+(düş(tü|erek|üp)|ayrıldı|döndü|kaldı)`, String.raw`alt\s+edil(di|erek)`, String.raw`diz\s+çök(tü|erek)`,
  String.raw`(?<!puan[ıi]?\s|puanları\s)kaybet(ti|erek|ip)(?!\p{L})`, String.raw`boyun\s+eğ(di|erek)`, String.raw`teslim\s+ol(du|arak)`,
  String.raw`puansız\s+(döndü|kaldı|ayrıldı)`, String.raw`puan\s+(çıkara|ala)(madı|mayarak)`, String.raw`eli\s+boş\s+(döndü|ayrıldı|kaldı)`, String.raw`kaybeden\s+taraf\s+ol(du|arak)`,
  String.raw`yenilgi\p{L}*\s+(önleyeme|engelleyeme)(di|yerek)`, String.raw`mağlubiyet\p{L}*\s+kurtulama(dı|yarak)`,
  String.raw`hezimet\p{L}*\s+(yaşadı|aldı)`, String.raw`hezimetle(?!\p{L})`,
].join('|'), 'iu')
const BERABER = new RegExp([
  String.raw`berabere\s+kal(dı|arak|ırken|ıp)`, String.raw`beraberlik(le|iyle)(?!\p{L})`, String.raw`beraberliğ\p{L}*\s+(aldı|alarak)`, String.raw`puanları\s+paylaş(tı|arak|ıp)`,
  String.raw`yenişe(medi|meyerek)`, String.raw`beraberliğe\s+razı\s+(oldu|kaldı)`, String.raw`(bir|1)\s+puan\p{L}*\s+(aldı|alarak|kazandı|topladı|yetindi|döndü)`,
].join('|'), 'iu')
// "kazanamadı / galibiyete uzanamadı": galibiyet değil (beraberlik ya da yenilgi olabilir)
const GALIBIYET_DEGIL = /(kazanama(dı|yarak)|galibiyet\p{L}*\s+(uzana|ulaşa|ala)ma(dı|yarak)|galip\s+gele(medi|meyerek))(?!\p{L})/iu
// Nesnesi rakip olmalı: "Baston Villa'yı geride bıraktı / devirdi / geçti" (ama "haftayı geride bıraktı", "öne geçti" değil)
const KAZAN_NESNE = /(geride\s+bırak(tı|arak|ıp)|devir(di|erek|ip)|geç(ti|erek)|geçme\p{L}*\s+(başardı|bildi)|engel\p{L}*\s+(\S+\s+){0,2}aş(tı|arak))(?!\p{L})/iu
// Takımı niteleyen sonuç ortaçları: "Baston Villa'yı 2-0 yenen 1337 Crew FC"
const ORTAC_SONUC = [['G', /(?<!\p{L})(yenen|mağlup\s+eden|alt\s+eden|kazanan|galip\s+(gelen|ayrılan|çıkan))\s+$/iu], ['M', /(?<!\p{L})(yenilen|kaybeden|mağlup\s+(olan|ayrılan)|yenik\s+(düşen|ayrılan)|boyun\s+eğen|puansız\s+kalan)\s+$/iu], ['B', /(?<!\p{L})(berabere\s+kalan|puanları\s+paylaşan)\s+$/iu]]
const SONUC = [['G', KAZAN], ['M', KAYBET], ['B', BERABER]]
const TERS = { G: 'M', M: 'G', B: 'B' }
const SONUC_ADI = /^(galibiyet|yenilgi|mağlubiyet|beraberlik|zafer|üstünlü[kğ]|hezimet)/i
// Tamlayan ile sonuç adı arasına girebilecek nitelemeler: skor, sıfat, "-daki" ("1337 Crew FC'nin deplasmandaki 2-0'lık net galibiyeti").
// "sahasında / evinde" giremez: "X'in sahasında galibiyet aldı" sonucu X'e değil özneye bağlar.
const ARA_SOZ = /^\s*((\d+\s*[-–—]\s*\d+['’]?\p{L}*|net|farklı|rahat|büyük|kritik|önemli|tarihi|ilk|deplasman|iç\s+saha|\p{L}+(daki|deki|taki|teki))\s+){0,3}$/iu
// Ardındaki kelime olumsuzsa ("galibiyetle tanışamadı", "yenilgiyle tanışmadı") sonuç bildirmez
const OLUMSUZ = /^\s*\p{L}*?(?:[ae]?m[ae](?:d[ıi]|z|y[ae]|m[ıi]ş|s[ıi]n))/u

/**
 * Cümleyi yan cümlelere böl ve her birinin öznesini bul. Sınırlar: "-ken", "-ınca", ama/fakat/ancak/oysa, ";", ":",
 * "ve" ya da virgül + yeni özne, "X ise". Öznesi olmayan yan cümle öncekinin öznesini devralır ("-ken" özneyi değiştirmez).
 */
function yanCumleler(c, m, rakipAd) {
  const takimlar = [...takimAnis(c, '1337 Crew FC').map(a => ({ ...a, biz: true })), ...takimAnis(c, rakipAd).map(a => ({ ...a, biz: false }))]
  const anis = [...takimlar, ...obekAnis(c, m, takimlar)].sort((a, b) => a.bas - b.bas)
  const sinir = new Set([0, c.length])
  for (const mt of c.matchAll(/\p{L}+(ken|[ıiuü]nc[ae])(?!\p{L})/gu)) sinir.add(mt.index + mt[0].length)
  for (const mt of c.matchAll(/[;:]|\s(?:ama|fakat|ancak|oysa)\s/giu)) sinir.add(mt.index)
  for (const a of anis) {
    if (a.ek) continue
    const once = c.slice(0, a.bas)
    if (/^ise$/i.test(a.sonraki ?? '')) sinir.add(a.bas)
    if ((a.obek || a.ozne) &&/(\sve|,)\s*$/i.test(once)) sinir.add(once.search(/(\sve|,)\s*$/i))
  }
  const s = [...sinir].sort((a, b) => a - b)
  const out = []
  let ozne = null
  for (let i = 0; i + 1 < s.length; i++) {
    const metin = c.slice(s[i], s[i + 1])
    const kTakim = [...takimAnis(metin, '1337 Crew FC').map(a => ({ ...a, biz: true })), ...takimAnis(metin, rakipAd).map(a => ({ ...a, biz: false }))]
    const kendi = [...kTakim, ...obekAnis(metin, m, kTakim)].sort((x, y) => x.bas - y.bas)
    ozne = kendi.find(a => a.ozne) ?? ozne
    out.push({ metin, bas: s[i], anis: kendi, ozne })
  }
  return out
}

/**
 * Sonucun yönü. Her sonuç sözünün sahibi yan cümlenin öznesidir ("Baston Villa, 1337 Crew FC karşısında 2-0 kazandı" → Baston Villa);
 * sonuç adı doğrudan bir tamlayana bağlıysa ("1337 Crew FC'nin 2-0'lık galibiyetiyle") o takımdır; ortaç takımı niteliyorsa
 * ("yenen 1337 Crew FC") o takımdır. 1337'ninse beklenen sonuç, rakibinse tersi. Sahibi belli değilse yanlış sayılmaz —
 * kalan kalıpları doğrulayıcı model denetler.
 */
function sonucYanlis(t, m, rakipAd) {
  if (m.forfeit || !m.result) return false
  const beklenen = a => a.biz ? m.result : TERS[m.result]
  for (const c0 of cumleler(t)) {
    if (oncekiMac(c0) && !/(ardından|sonra)/i.test(c0)) continue
    const c = buMac(c0)
    for (const [ad, biz] of [['1337 Crew FC', true], [rakipAd, false]]) {
      for (const a of takimAnis(c, ad)) {
        const once = c.slice(0, a.bas), sonra = c.slice(a.son)
        // "kazanan taraf X oldu", "maçın galibi … X oldu", "X lehine sonuçlandı"
        let tur = /^\s+(\d+\s*[-–—]\s*\d+['’]?\p{L}*\s+)?lehine\s+(\S+\s+){0,2}(sonuçlan|bit|tamamlan|sona\s+er|kapan)/iu.test(sonra) ? 'G' : null
        if (!tur && /^\s*oldu/i.test(sonra)) {
          const on = once.slice(-70)
          tur = /(galibi|kazananı|kazanan(\s+taraf)?|galip\s+(gelen|çıkan)(\s+taraf)?|gülen\s+taraf)(?![\p{L}])[^.;:]*$/iu.test(on) ? 'G' : /(kaybeden(\s+taraf)?|mağlup\s+olan(\s+taraf)?|yenilen\s+taraf)(?![\p{L}])[^.;:]*$/iu.test(on) ? 'M' : null
        }
        // sonuç ortacı takımı niteliyor
        if (!tur) for (const [t2, re] of ORTAC_SONUC) if (re.test(once)) { tur = t2; break }
        if (tur && tur !== beklenen({ biz })) return true
      }
    }
    for (const yan of yanCumleler(c, m, rakipAd)) {
      // ortaçlı yan cümleler ("rakibin kazandığı maçta") ve "galibiyetsiz/yenilgisiz" sonuç bildirmez
      const metin = yan.metin.replace(/\S+(dığı|diği|duğu|düğü|tığı|tiği|tuğu|tüğü)\S*/giu, x => ' '.repeat(x.length)).replace(/(galibiyetsiz|yenilgisiz)\S*/giu, x => ' '.repeat(x.length))
      for (const [tur, re] of [...SONUC, ['G', KAZAN_NESNE], ['¬G', GALIBIYET_DEGIL]]) {
        for (const mt of metin.matchAll(new RegExp(re.source, 'giu'))) {
          const sonra = metin.slice(mt.index + mt[0].length)
          if (OLUMSUZ.test(sonra)) continue
          if (re === KAZAN_NESNE && !yan.anis.some(a => a.belirtme || (!a.ek && /^engel/i.test(a.sonraki ?? '')))) continue
          // "… galibiyetiyle biten maçta": sahibi belirtilmemiş sonuç adı maçı niteler
          let sahip = null
          if (SONUC_ADI.test(mt[0])) {
            const once = metin.slice(0, mt.index)
            const ara = a => metin.slice(a.son, mt.index)
            sahip = yan.anis.filter(a => a.tamlayan && a.son <= mt.index && ARA_SOZ.test(ara(a))).at(-1) ?? null
            // "rakibinin / ev sahibi ekibin 4-1'lik galibiyeti": araya en çok 3 kelime (skor, niteleme) girebilir
            const kel = once.trimEnd().split(/\s+/)
            let ob = null
            for (let n = 0; n <= 3 && !ob && n < kel.length; n++) ob = kel.slice(0, kel.length - n).join(' ').match(OBEK_TAMLAYAN)
            if (!sahip && ob) sahip = { biz: /^rakib|^rakip/i.test(ob[0]) ? false : obekBizMi(ob[0], m) }
            if (!sahip && /^\s*(biten|sonuçlanan|sona\s+eren|tamamlanan|kapanan)/iu.test(sonra)) continue
          }
          sahip ??= yan.ozne
          if (!sahip) continue
          const b = beklenen(sahip)
          if (tur === '¬G' ? b === 'G' : tur !== b) return true
        }
      }
    }
  }
  return false
}

const SAYI_ADI = { iki: 2, üç: 3, dört: 4, beş: 5, altı: 6 } // "bir" belirsiz ("bir gol daha"), sayılmaz
/** Gün, saat, hafta, tarih ve (maç önünde) puan/sıra/maç/averaj sayıları bilgiyle uyuşuyor mu? */
function sayiYanlis(t, bilgi, sayilar = null) {
  const gun = bilgi.gun ?? (/^\d{4}-/.test(bilgi.tarih ?? '') ? gunAdi(bilgi.tarih) : null)
  for (const g of GUNLER) if (new RegExp(`(?<!\\p{L})${g}(?!\\p{L})`, 'iu').test(t) && g !== gun) return `gün yanlış (${g})`
  for (const [, h, d] of t.matchAll(/(?<![\d.:-])(\d{1,2})[:.](\d{2})(?![\d.:])/g)) {
    if (!bilgi.saat || `${h.padStart(2, '0')}:${d}` !== bilgi.saat) return `saat yanlış (${h}:${d})`
  }
  for (const [, n] of t.matchAll(/(\d+)\.\s*hafta/gi)) if (Number(n) !== bilgi.hafta) return `hafta yanlış (${n})`
  if (/(?<!\p{L})ilk\s+hafta/iu.test(t) && bilgi.hafta !== 1) return 'hafta yanlış (ilk)'
  if (bilgi.tarih) {
    const [ay, gn] = tarihParca(bilgi.tarih)
    for (const mt of t.matchAll(new RegExp(`(\\d{1,2})\\s+(${AYLAR.join('|')})`, 'giu'))) {
      if (Number(mt[1]) !== gn || norm(mt[2]) !== norm(AYLAR[ay - 1])) return `tarih yanlış (${mt[0]})`
    }
  }
  if (/(?<!\p{L})puanle(?!\p{L})|maçde|sırade/iu.test(t)) return 'ek uyumu'
  if (sayilar) {
    for (const [, n] of t.matchAll(/(\d+)\s+puan/gi)) if (!sayilar.puan.includes(Number(n))) return `puan yanlış (${n})`
    for (const [, n] of t.matchAll(/(\d+)\.\s*(sıra|basamak)/gi)) if (!sayilar.sira.includes(Number(n))) return `sıra yanlış (${n})`
    for (const [, n] of t.matchAll(/(\d+)\s+maç(ta|tan|lık|ın|ı)?(?!\p{L})/giu)) if (!sayilar.mac.includes(Number(n))) return `maç sayısı yanlış (${n})`
    for (const mt of t.matchAll(/averaj\S*\s*(?:ile\s+|olarak\s+)?([+-]?\d+)|([+-]?\d+)\s+averaj/gi)) {
      const n = mt[1] ?? mt[2]
      if (!sayilar.averaj.includes(Math.abs(Number(n)))) return `averaj yanlış (${n})`
    }
    if (/(?<!\p{L})lider/iu.test(t) && !sayilar.sira.includes(1)) return 'lider yanlış'
  }
  return null
}

/** Gol atan olarak yazılan kişi gerçekten golcü mü, gol sayısı doğru mu? (MVP ya da asistçiyle golcüyü karıştırma) */
const DUR = /^(ve|ile|ise|ama|fakat|ancak|toplam|toplamda|takımın|takımının|ekibin|diğer|maçta|maçın|maçtaki|1337\p{L}*)$/iu
const GOL_FIILI = /(att|kaydett|buld|imza|fileleri)/i
function golcuYanlis(t, kisiler) {
  const { golcu, asist, mvp } = kisiler
  const golSayisi = Object.fromEntries(golcu.map(x => [x.name, x.n ?? 1]))
  const adlar = [...new Set([...golcu.map(x => x.name), ...asist, ...(mvp ? [mvp.name] : [])])]
  const parca = ad => ad.split(/\s+/).map(norm).filter(Boolean)
  // Kişinin cümledeki yerleri: tam ad; yoksa yalnızca ona ait (başka kimsenin adında olmayan) soyadı.
  // Böylece "Kemal Sezer Şahin" geçen cümlede asistçi "Kemal Orkun Gündoğdu" anılmış sayılmaz.
  function yerler(ws, ad) {
    const p = parca(ad), out = []
    for (let i = 0; i + p.length <= ws.length; i++) if (p.every((x, j) => ws[i + j].n === x)) out.push({ i, son: i + p.length })
    if (out.length || p.length < 2) return out
    const soyad = p.at(-1)
    if (soyad.length > 2 && !adlar.some(b => b !== ad && parca(b).includes(soyad))) ws.forEach((w, i) => { if (w.n === soyad) out.push({ i, son: i + 1 }) })
    return out
  }
  for (const c of cumleler(t)) {
    if (!/gol|hat-?trick/i.test(c)) continue
    const ws = kelimeler(c)
    const anis = adlar.map(ad => ({ ad, y: yerler(ws, ad) })).filter(x => x.y.length)
    const baskasi = (ad, k) => anis.some(o => o.ad !== ad && o.y.some(z => k >= z.i && k < z.son))
    // Golcü olmayan biri (asistçi, MVP) ancak golün öznesiyse yanlıştır: adı eksiz ve hemen ardından (araya başka ad
    // ya da bağlaç girmeden) gol fiili geliyor ("Mehmet Öz golü attı"). "X'in hazırladığı golü Y attı", "en iyi oyuncusu X seçildi" geçer.
    for (const { ad, y } of anis) {
      if (ad in golSayisi) continue
      for (const z of y) {
        if (ws[z.son - 1].ekli) continue
        for (let k = z.son; k < z.son + 4 && k < ws.length; k++) {
          if (DUR.test(ws[k].ham) || baskasi(ad, k)) break
          if (/^asist/i.test(ws[k].ham)) break // "X bir asist kaydetti", "asiste imza attı"
          if (GOL_FIILI.test(ws[k].ham)) return `golcü yanlış (${ad})`
        }
      }
    }
    // Gol sayısı: golcünün adının hemen ardından "iki gol / 2 gol"; araya başka ad ya da "ve/toplam/takımın/1337'nin" girerse,
    // ya da "golünden / gollü / golün" gibi bir toplamı anlatıyorsa sayı ona ait değildir
    for (const { ad, y } of anis.filter(x => x.ad in golSayisi)) {
      for (const { son } of y) {
        for (let k = son; k < son + 3 && k + 1 < ws.length; k++) {
          if (DUR.test(ws[k].ham) || baskasi(ad, k)) break
          if (!/^gol/i.test(ws[k + 1].ham)) continue
          if (/^gol(ünden|den|lü|ün|lük|ler|lerin|lerinden)$/i.test(kok(ws[k + 1].ham) + (ws[k + 1].ham.split(/['’]/)[1] ?? ''))) break
          const s = ws[k].ham.toLocaleLowerCase('tr'), n = /^\d+$/.test(s) ? Number(s) : SAYI_ADI[s]
          if (n && n !== golSayisi[ad]) return `gol sayısı yanlış (${ad}: ${n})`
          break
        }
      }
    }
    // hat-trick: maçta 3+ gol atan yoksa ya da cümlede yalnızca 3'ten az gol atan biri anılıyorsa yanlış
    if (/hat-?trick/i.test(c)) {
      const anilanGolcu = anis.filter(x => x.ad in golSayisi)
      if (!golcu.some(x => (x.n ?? 1) >= 3) || (anilanGolcu.length && !anilanGolcu.some(x => golSayisi[x.ad] >= 3))) return 'hat-trick yanlış'
    }
  }
  return null
}

// ---------- sağlayıcılar
let geminiModeller = null
async function geminiModelleri() {
  if (geminiModeller) return geminiModeller
  try {
    durum.istek++
    const j = await (await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': GEMINI }, signal: AbortSignal.timeout(30000) })).json()
    const ad = (j.models ?? []).filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''))
    const sira = [/^gemini-3[\d.]*-pro$/, /^gemini-3[\d.]*-flash$/, /^gemini-2\.5-pro$/, /^gemini-2\.5-flash$/, /^gemini-[\d.]+-flash$/]
    geminiModeller = sira.flatMap(r => ad.filter(n => r.test(n)).sort().reverse()).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3)
    if (!geminiModeller.length) durum.hata.push('Gemini: uygun model bulunamadı (' + ad.slice(0, 8).join(', ') + ')')
  } catch (e) { geminiModeller = []; durum.hata.push('Gemini model listesi: ' + e.message) }
  return geminiModeller
}
// ayar.json: doğrulayıcı için (sıcaklık 0, JSON yanıt)
async function geminiYaz(model, sistem, istek, ayar = {}) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': GEMINI, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistem }] }, contents: [{ role: 'user', parts: [{ text: istek }] }],
      generationConfig: { temperature: ayar.json ? 0 : 0.4, maxOutputTokens: 4096, ...(ayar.json ? { responseMimeType: 'application/json' } : {}) },
    }),
    signal: AbortSignal.timeout(90000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.error) return { hata: `${j.error?.message ?? r.status}`, kod: r.status }
  return { metin: (j.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('') }
}

const OR_TERCIH = ['openrouter/free', 'google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free']
async function openrouterYaz(model, sistem, istek, ayar = {}) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENROUTER}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://1337crewfc.com', 'X-Title': '1337 Crew FC' },
    body: JSON.stringify({ model, temperature: ayar.json ? 0 : 0.4, max_tokens: ayar.json ? 800 : 500, messages: [{ role: 'system', content: sistem }, { role: 'user', content: istek }] }),
    signal: AbortSignal.timeout(60000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.error) return { hata: `${j.error?.message ?? r.status}`, kod: r.status }
  return { metin: j.choices?.[0]?.message?.content }
}

async function denemeler(sadeceGemini = false) {
  const d = []
  if (GEMINI) for (const m of await geminiModelleri()) d.push({ ad: 'gemini', model: m, fn: geminiYaz })
  if (OPENROUTER && !sadeceGemini) for (const m of OR_TERCIH) d.push({ ad: 'openrouter', model: m, fn: openrouterYaz })
  return d
}
const modelHata = {} // bu turda modelin geçici hata sayısı
const geciciHata = model => { if ((modelHata[model] = (modelHata[model] ?? 0) + 1) >= 2) durum.tukenen.push(model) }

/** Modele bir istek atar; hata olursa sağlayıcıyı/modeli bu tur için işaretler. Metni ya da null döndürür. */
async function cagir(d, sistem, istek, ayar = {}) {
  if (durum.durdu[d.ad] || durum.tukenen.includes(d.model) || durum.istek >= EN_FAZLA_ISTEK) return null
  if (Date.now() - BASLA > SURE) { if (!durum.hata.includes('süre doldu')) durum.hata.push('süre doldu'); return null }
  try {
    durum.istek++
    let r = await d.fn(d.model, sistem, istek, ayar)
    // Ücretsiz modeller yoğunken "high demand / overloaded" der: 20 sn bekleyip bir kez daha dene
    if (r.hata && /high demand|overloaded|unavailable|try again/i.test(r.hata) && durum.istek < EN_FAZLA_ISTEK && Date.now() - BASLA < SURE - 60e3) {
      await new Promise(x => setTimeout(x, 20000))
      durum.istek++
      r = await d.fn(d.model, sistem, istek, ayar)
    }
    if (r.hata) {
      durum.hata.push(`${d.model}: ${r.hata}`.slice(0, 160))
      if ([401, 402, 403].includes(r.kod) || (r.kod === 400 && /key|auth|permission|credit|billing/i.test(r.hata))) durum.durdu[d.ad] = true
      else if (r.kod === 429 || r.kod === 404 || /quota|RESOURCE_EXHAUSTED|rate.?limit|not found/i.test(r.hata)) durum.tukenen.push(d.model)
      else geciciHata(d.model)
      return null
    }
    const metin = (r.metin ?? '').trim()
    // Boş yanıt (akıl yürüten model jetonları bitirdi) red değil, model hatasıdır
    if (!metin) { durum.hata.push(`${d.model}: boş yanıt`); geciciHata(d.model); return null }
    return metin
  } catch (e) {
    durum.hata.push(`${d.model}: ${e.message}`.slice(0, 160))
    if (/abort|timeout/i.test(e.name + e.message)) durum.tukenen.push(d.model)
    else geciciHata(d.model)
    return null
  }
}

const SISTEM = `Amatör futbol takımı 1337 Crew FC'nin kulüp sitesi için kısa Türkçe yazılar yazıyorsun.
Kurallar:
- Sadece verilen bilgileri kullan. Bilgide olmayan hiçbir şey ekleme: gol dakikası, pozisyon, oyuncu uyruğu, hava, taraftar, sakatlık, teknik direktör sözü, gelecek tahmini yok.
- Bilgide adı geçmeyen hiçbir kişiden bahsetme. Golleri sadece "golculer1337" listesindeki oyuncuların attığını yaz; MVP'nin gol attığını ancak bu listede varsa yaz. Rakibin golcülerini bilmiyoruz, kim attığını yazma.
- Maçın nerede oynandığını "saha" bilgisine göre yaz; ev sahibi her zaman "evSahibi" alanındaki takımdır.
- Gün, saat, tarih, hafta, puan ve sıra yazacaksan bilgideki değerleri aynen kullan; bilgide yoksa yazma.
- 2-3 cümle, düz metin. Başlık, skor satırı, madde işareti, emoji, etiket, tırnak işareti yok.
- Doğru, akıcı ve sade bir Türkçe. Abartı ve klişe yok. Türkçe ek uyumuna dikkat et (ör. "4 puanla", "2-0'lık").
- Takımdan "1337 Crew FC" ya da "1337" diye, üçüncü şahısla bahset. Asla "biz", "bizim", "-ımız" ya da "kazandık, sıradayız" gibi birinci çoğul şahıs kullanma.
- Rakip takımın adını bilgide yazıldığı gibi tam yaz.
- Skoru her zaman ev sahibi önce gelecek şekilde "X-Y" biçiminde yaz.`

// Doğrulayıcı: yazıyı başka bir model bilgilerle karşılaştırır. Kurallar dilin her kalıbını yakalayamaz; anlamı bu adım denetler.
const DOGRULAYICI = `Amatör futbol takımı 1337 Crew FC'nin kulüp sitesi için yapay zekâyla yazılmış kısa Türkçe metinleri, verilen bilgilerle karşılaştırıp OLGU HATALARINI buluyorsun.
Hata sayılanlar:
1. Sonuç: metin bilgideki sonuçtan farklı bir sonuç söylüyor (kazanan, kaybeden ya da berabere). "sonuc1337" 1337 Crew FC'nin sonucudur. Skor ev sahibi önce yazılır.
2. Saha: metin ev sahibi takımı ya da maçın kimin sahasında oynandığını bilgideki "saha"/"evSahibi" ile çelişecek biçimde yazıyor.
3. Skor yanlış ya da ters.
4. Kişiler: golcü listesinde olmayan birine gol yazılması, gol sayısının yanlış verilmesi, asist ya da MVP bilgisinin yanlış verilmesi, rakibin golcüsünün adının verilmesi.
5. Tarih, gün, saat, hafta, puan, sıra, averaj, maç sayısı ya da önceki karşılaşmalar bilgiyle çelişiyor.
6. Bilgide olmayan kişi, olay ya da ayrıntı uydurulmuş (gol dakikası, penaltı, kart, sakatlık, taraftar, hava, teknik direktör sözü vb.).
7. Takımdan birinci çoğul şahısla söz ediliyor ("biz", "kazandık", "takımımız").
Hata SAYILMAYANLAR: üslup, kelime seçimi, cümle yapısı, bilgilerle çelişmeyen genel nitelemeler ("zorlu maç", "puanları paylaştı").
Yalnızca şu JSON'u döndür: {"hatalar": ["kısa açıklama", ...]}. Hata yoksa {"hatalar": []}.`
const jsonAl = s => { try { const m = String(s).replace(/```(json)?/gi, '').match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null } }

/**
 * Metni bilgilerle karşılaştırır: { hatalar, model } ya da (doğrulayıcı yoksa / kota bittiyse) null.
 * Yazandan farklı bir model tercih edilir: önce başka bir Gemini modeli, sonra OpenRouter, en son yazanın kendisi.
 */
async function dogrulaAI(bilgi, metin, yazan) {
  const sira = (await denemeler()).map(d => ({ d, p: d.model === yazan ? 2 : d.ad === 'gemini' ? 0 : 1 })).sort((a, b) => a.p - b.p).map(x => x.d)
  for (const d of sira) {
    const cevap = await cagir(d, DOGRULAYICI, `Bilgiler:\n${JSON.stringify(bilgi, null, 1)}\n\nMetin:\n${metin}`, { json: true })
    if (cevap == null) continue
    const j = jsonAl(cevap)
    if (!j || !Array.isArray(j.hatalar)) { durum.hata.push(`${d.model}: doğrulama yanıtı okunamadı`); geciciHata(d.model); continue }
    durum.dogrulama.yapildi++
    const hatalar = j.hatalar.map(x => String(x).trim()).filter(Boolean)
    if (hatalar.length) durum.dogrulama.reddetti++
    return { hatalar, model: d.model }
  }
  return null
}

/** Ortak kontroller + yazıya özel kontrol. Sorun yoksa null, varsa sebep. */
function kontrol(metin, bilgi, dogrula) {
  if (!metin) return 'boş'
  if (metin.length < 40) return 'çok kısa'
  if (metin.length > 900) return 'çok uzun'
  if (/\d{4}-\d{2}-\d{2}/.test(metin)) return 'ham tarih'
  if (metin.split('\n').some(s => s.trim() && !/[.!?…]$/.test(s.trim()))) return 'başlık ya da yarım satır'
  const b = bizVar(metin, bilgiKelimeleri(bilgi))
  if (b) return `biz dili: ${b}`
  const y = yabanciIsim(metin, bilgi)
  if (y) return `bilgide olmayan isim: ${y}`
  return dogrula(metin)
}

function redKaydet() {
  if (TASLAK) return
  mkdirSync(new URL('./cache/', import.meta.url), { recursive: true })
  writeFileSync(RED_FILE, JSON.stringify(RED))
}
function redArtir(anahtar, k) {
  if (TASLAK) return
  for (const x of Object.keys(RED)) if (x !== k && x.startsWith(anahtar + ':')) delete RED[x]
  RED[k] = { sayi: (RED[k]?.sayi ?? 0) + 1, zaman: new Date().toISOString() }
}
/** Doğrulanmış yazıyı kaydet; aynı yazının eski sürümlerini ve red sayacını temizle */
function kesinlestir(anahtar, k, kayit) {
  if (TASLAK) return
  yazilar[k] = { ...kayit, dogrulandi: true }
  for (const x of Object.keys(yazilar)) if (x !== k && x.startsWith(anahtar + ':')) delete yazilar[x]
  for (const x of Object.keys(RED)) if (x.startsWith(anahtar + ':')) delete RED[x]
}

/**
 * Yazıyı döndürür (önceden yazılmışsa kayıttan); yazamazsa null.
 * Akış: model yazar → kurallar (ucuz ön eleme) → doğrulayıcı model (anlam) → kayıt. Doğrulayıcıya ulaşılamazsa yazı
 * "doğrulama bekliyor" olarak saklanır, sitede gösterilmez; sonraki turda önce o doğrulanır (yeniden yazdırmaktan ucuz).
 */
async function yaz({ anahtar, bilgi, eskiBilgi, istek, dogrula, oncelikli = true }) {
  const k = `${anahtar}:${ozet(bilgi)}`
  if (KAPALI) return null
  // Bir kerelik geçiş: anahtarın hesaplanma biçimi değiştiyse eski kaydı yeni anahtara taşı
  if (eskiBilgi && !yazilar[k]) { const ek = `${anahtar}:${ozet(eskiBilgi)}`; if (yazilar[ek]) { yazilar[k] = yazilar[ek]; delete yazilar[ek] } }
  let kayitli = null, bekleyen = null, eskiKayit = false
  if (!TASLAK && yazilar[k]) {
    const kayit = yazilar[k]
    // Kayıtlı yazı da güncel kurallardan geçmeli; geçmezse kullanılmaz (silinmez: yenisi yazılınca yerini alır)
    const sebep = kontrol(kayit.metin, bilgi, dogrula)
    if (sebep) durum.hata.push(`${anahtar.slice(0, 40)}: kayıtlı yazı kurallardan geçmedi (${sebep})`)
    else if (kayit.dogrulandi === false) bekleyen = kayit
    else { kayitli = { metin: kayit.metin, model: kayit.model }; eskiKayit = kayit.dogrulandi === undefined }
  }
  const butceVar = () => ACIK && durum.istek < EN_FAZLA_ISTEK && (oncelikli || durum.eski < ESKI_EN_FAZLA)
  // 1) Doğrulama bekleyen yazı
  if (bekleyen) {
    if (!butceVar()) return null
    if (!oncelikli) durum.eski++
    const v = await dogrulaAI(bilgi, bekleyen.metin, bekleyen.model)
    if (!v) return null
    if (!v.hatalar.length) { kesinlestir(anahtar, k, { ...bekleyen, dogrulayan: v.model }); durum.bekleyenDogrulandi++; return { metin: bekleyen.metin, model: bekleyen.model } }
    durum.reddedilen.push({ anahtar, model: bekleyen.model, sebep: 'doğrulayıcı: ' + v.hatalar.join('; '), metin: bekleyen.metin })
    durum.hata.push(`${bekleyen.model}: doğrulayıcı reddetti (${v.hatalar[0]})`.slice(0, 160))
    if (!TASLAK) delete yazilar[k]
    redArtir(anahtar, k)
  }
  // 2) Doğrulayıcıdan önceki sürümde kaydedilmiş yazı: boş kapasite varsa bir kez denetlenir. Denetimde düşerse
  //    yeniden yazdırılır; doğrulanmış yenisi gelene kadar eskisi sitede kalır (doğrulayıcı yanılırsa site boş kalmasın).
  let yeniden = kayitli && !!yazilar[k]?.denetim
  if (kayitli && eskiKayit && !yeniden && butceVar() && durum.istek < EN_FAZLA_ISTEK / 2 && durum.denetim < DENETIM_EN_FAZLA) {
    durum.denetim++
    const v = await dogrulaAI(bilgi, kayitli.metin, kayitli.model)
    if (v && !v.hatalar.length && !TASLAK) yazilar[k] = { ...yazilar[k], dogrulandi: true, dogrulayan: v.model }
    else if (v) {
      durum.reddedilen.push({ anahtar, model: kayitli.model, sebep: 'denetim: ' + v.hatalar.join('; '), metin: kayitli.metin })
      durum.hata.push(`${anahtar.slice(0, 40)}: kayıtlı yazı denetimde düştü (${v.hatalar[0]})`.slice(0, 160))
      if (!TASLAK) yazilar[k] = { ...yazilar[k], denetim: { hatalar: v.hatalar, zaman: new Date().toISOString() } }
      yeniden = true
    }
  }
  // Yükseltme: Gemini dışı bir modelin yazdığı öncelikli yazı, Gemini müsaitse Gemini'ye yeniden yazdırılır
  const yukselt = kayitli && oncelikli && GEMINI && !/^gemini/.test(kayitli.model ?? '') && !durum.durdu.gemini
  if (kayitli && !yukselt && !yeniden) return kayitli
  if (!ACIK) return kayitli
  if (durum.yazildi >= BIR_CALISMADA_EN_FAZLA || durum.istek >= EN_FAZLA_ISTEK) return kayitli
  if (!oncelikli && durum.eski >= ESKI_EN_FAZLA) return kayitli
  const red = RED[k]
  if (!TASLAK && red && red.sayi >= RED_SINIR && Date.now() - Date.parse(red.zaman) < RED_BEKLE) { durum.atlanan++; return kayitli }
  if (!oncelikli) durum.eski++ // eski maçlar denemeye göre sayılır (reddedilse de kota harcar)
  const tam = `${istek}\n\nBilgiler:\n${JSON.stringify(bilgi, null, 1)}`
  let reddedildi = false
  for (const d of await denemeler(!!yukselt)) {
    const ham = await cagir(d, SISTEM, tam)
    if (ham == null) continue
    const metin = temizle(ham)
    const sebep = kontrol(metin, bilgi, dogrula)
    if (sebep) { reddedildi = true; durum.reddedilen.push({ anahtar, model: d.model, sebep, metin }); durum.hata.push(`${d.model}: reddedildi (${sebep})`); continue }
    const kayit = { metin, model: d.model, zaman: new Date().toISOString() }
    const v = await dogrulaAI(bilgi, metin, d.model)
    if (!v) {
      // Doğrulayıcı yok: yükseltmede eski yazı kalır; yoksa yazı doğrulama beklemeye alınır (sitede gösterilmez)
      if (!kayitli && !TASLAK) yazilar[k] = { ...kayit, dogrulandi: false }
      durum.yazildi++; durum.bekleyen++
      return kayitli
    }
    if (v.hatalar.length) {
      reddedildi = true
      durum.reddedilen.push({ anahtar, model: d.model, sebep: 'doğrulayıcı: ' + v.hatalar.join('; '), metin })
      durum.hata.push(`${d.model}: doğrulayıcı reddetti (${v.hatalar[0]})`.slice(0, 160))
      continue
    }
    kesinlestir(anahtar, k, { ...kayit, dogrulayan: v.model })
    durum.yazildi++
    if (yukselt) durum.yukseltilen++
    durum.model = d.model
    return { metin, model: d.model }
  }
  // Model metin yazdı ama kurallardan ya da doğrulayıcıdan geçemedi: kalıcı sayaç (kota/yoğunluk hataları sayılmaz)
  if (reddedildi) redArtir(anahtar, k)
  return kayitli
}

// ---------- maç raporu ve maç önü
const sirala = xs => [...xs].sort((a, b) => (b.n ?? 1) - (a.n ?? 1) || a.name.localeCompare(b.name, 'tr'))

export async function raporYaz(m, oncelikli = true) {
  const t = m.us === 'home' ? m.away : m.home
  const temel = {
    yarisma: m.compLabel, hafta: m.week ?? null, tarih: m.date, evSahibi: m.home.name, deplasman: m.away.name,
    skor: `${m.home.score}-${m.away.score}`, sonuc1337: m.result === 'G' ? 'galibiyet' : m.result === 'B' ? 'beraberlik' : 'mağlubiyet',
    saha: m.us === 'home' ? `1337 iç sahada, ${m.home.name} ev sahibi` : `1337 deplasmanda, ev sahibi ${m.home.name}`, hukmen: !!m.forfeit,
  }
  const liste = (sc, as) => ({
    golculer1337: sc.map(x => x.n > 1 ? `${x.name} (${x.n})` : x.name),
    asistler1337: as.map(x => x.name),
    macinMVPsi: m.mvp ? `${m.mvp.name} (${m.mvp.ours ? '1337 oyuncusu' : t.name + ' oyuncusu'})` : null,
  })
  // Golcü/asist sırası sabit (kadro sırası değişince anahtar değişip yazı yeniden yazılmasın); eski anahtar bir kez taşınır
  const bilgi = { ...temel, ...liste(sirala(m.scorers ?? []), sirala(m.assisters ?? [])) }
  const eskiBilgi = { ...temel, ...liste(m.scorers ?? [], m.assisters ?? []) }
  const kisiler = { golcu: (m.scorers ?? []).map(x => ({ name: x.name, n: x.n ?? 1 })), asist: (m.assisters ?? []).map(x => x.name), mvp: m.mvp ?? null }
  const istek = m.forfeit ? 'Bu maç hükmen sonuçlandı; bunu belirten 1-2 cümlelik kısa bir not yaz.' : 'Bu maç için kısa bir maç raporu yaz.'
  return yaz({
    anahtar: `rapor:${m.id}`, bilgi, eskiBilgi, istek, oncelikli,
    dogrula: x => !skorVar(x, m) ? 'skor yok' : !adVar(x, t.name) ? 'rakip adı yok' : sahaYanlis(x, m) ? 'saha yanlış' : sonucYanlis(x, m, t.name) ? 'sonuç yanlış' : sayiYanlis(x, bilgi) ?? golcuYanlis(x, kisiler),
  })
}

export async function onizlemeYaz(next, table, done) {
  const opp = m => (m.us === 'home' ? m.away : m.home)
  const t = opp(next)
  // Hiç maç oynanmamış tabloda sıra/puan anlamsızdır: verilmez
  const row = table.find(r => r.code === t.code && r.played > 0), us = table.find(r => r.us && r.played > 0)
  const h2h = done.filter(m => opp(m).code === t.code)
  const bilgi = {
    mac: `${next.home.name} - ${next.away.name}`, yarisma: next.compLabel, hafta: next.week ?? null, tarih: tarihYazi(next.date), gun: gunAdi(next.date), saat: next.time,
    saha: next.us === 'home' ? `1337 iç sahada, ${next.home.name} ev sahibi` : `1337 deplasmanda, ev sahibi ${next.home.name}`,
    rakip: t.name, rakipSira: row ? `${row.rank}. sıra, ${row.played} maçta ${row.points} puan, averaj ${row.gd > 0 ? '+' : ''}${row.gd}` : null,
    sira1337: us ? `${us.rank}. sıra, ${us.played} maçta ${us.points} puan, averaj ${us.gd > 0 ? '+' : ''}${us.gd}` : null,
    oncekiKarsilasmalar: h2h.length ? `kayıtlı ${h2h.length} maç: ${h2h.filter(m => m.result === 'G').length} 1337 galibiyeti, ${h2h.filter(m => m.result === 'B').length} beraberlik, ${h2h.filter(m => m.result === 'M').length} ${t.name} galibiyeti` : 'kayıtlarda iki takımın maçı yok',
    sonMac1337: done[0] ? `${done[0].home.name} ${done[0].home.score}-${done[0].away.score} ${done[0].away.name}` : null,
  }
  const rows = [row, us].filter(Boolean)
  // izinli sayılar: tablo değerleri, galibiyetin 3 puanı, iki takım arasındaki puan farkı, önceki karşılaşmaların dağılımı
  const dagilim = ['G', 'B', 'M'].map(r => h2h.filter(m => m.result === r).length)
  const sayilar = {
    puan: [...rows.map(r => r.points), 3, ...(row && us ? [Math.abs(row.points - us.points)] : [])], sira: rows.map(r => r.rank),
    mac: [...rows.map(r => r.played), h2h.length, ...dagilim], averaj: rows.map(r => Math.abs(r.gd)),
  }
  return yaz({
    anahtar: `onizleme:${next.id}`, bilgi, istek: 'Bu maç için kısa bir maç önü yazısı yaz.',
    dogrula: x => !adVar(x, t.name) ? 'rakip adı yok' : sahaYanlis(x, next, done[0] ? opp(done[0]).name : null) ? 'saha yanlış' : sayiYanlis(x, bilgi, sayilar),
  })
}

export function kaydet() {
  if (TASLAK) return
  writeFileSync(FILE, JSON.stringify(yazilar, null, 1))
  redKaydet()
}
export const _dogrulama = { yanCumleler, takimAnis, tarihYazi, tarihParca, yabanciIsim, sahaYanlis, sonucYanlis, sayiYanlis, golcuYanlis, skorVar, adVar, bizVar, kontrol, gunAdi, temizle, RED }
