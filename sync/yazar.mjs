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
const EN_FAZLA_ISTEK = 20 // bir turdaki toplam HTTP isteği (tekrar denemeler dahil)
const RED_SINIR = 3 // bir yazı art arda bu kadar tur reddedilirse...
const RED_BEKLE = 6 * 3600e3 // ...bu kadar süre denenmez (bilgisi değişirse hemen denenir)

export const yazilar = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {}
delete yazilar._red // eski sürümde sayaç burada tutuluyordu
const RED = existsSync(RED_FILE) ? JSON.parse(readFileSync(RED_FILE, 'utf8')) : {}
export const durum = { yazildi: 0, eski: 0, hata: [], model: null, istek: 0, durdu: { gemini: false, openrouter: false }, tukenen: [], reddedilen: [], atlanan: 0, yukseltilen: 0 }

// ---------- metin yardımcıları
const TR = { 'İ': 'I', 'I': 'I', 'ı': 'I', 'Ş': 'S', 'ş': 'S', 'Ğ': 'G', 'ğ': 'G', 'Ü': 'U', 'ü': 'U', 'Ö': 'O', 'ö': 'O', 'Ç': 'C', 'ç': 'C', 'Â': 'A', 'â': 'A' }
const norm = s => (s ?? '').replace(/[İIıŞşĞğÜüÖöÇçÂâ]/g, c => TR[c]).toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '')
const ozet = o => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 10)
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const gunAdi = tarih => { const [y, m, d] = tarih.split('-').map(Number); return GUNLER[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }
/** Cümlelere böl */
const cumleler = metin => metin.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean)
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
const CUMLE_BASI = new Set(['BU', 'BUNA', 'BUNUNLA', 'BOYLE', 'AYNI', 'EV', 'IC', 'IKI', 'UC', 'DORT', 'BES', 'BIR', 'HER', 'TUM', 'ILK', 'SON', 'EN', 'YINE', 'DAHA', 'OYSA', 'GECEN', 'MAC', 'MACI', 'MACIN', 'MACTA', 'MACTAN', 'MACA', 'GOL', 'GOLU', 'GOLLER', 'GOLLERI', 'GOLLERINI', 'GOLLERLE', 'MVP', 'LIGDE', 'TEK', 'HEM', 'OTE', 'ORTA'])
const CUMLE_BASI_KOK = ['TAKIM', 'KARSILASMA', 'MUCADELE', 'ASIST', 'SKOR', 'SONUC', 'DEVRE', 'YARI', 'RAKIP', 'RAKIB', 'DEPLASMAN', 'SAHA', 'SEZON', 'HAFTA', 'PUAN', 'SIRA', 'TABLO', 'ONCEKI', 'OYUNCU', 'KALECI', 'GALIBIYET', 'MAGLUBIYET', 'BERABERLIK', 'KAYIT', 'TARAF', 'ANCAK', 'AYRICA', 'BOYLECE', 'SONRA', 'ONCE', 'IKINCI', 'BIRINCI', 'SIRADAKI', 'DEGERLI', 'GOL', 'KONUK', 'TOPLAM', 'ARDINDAN', 'UZATMA', 'PENALTI', 'FRIKIK', 'KAFA', 'KONTRA', 'HUCUM', 'SAVUNMA', 'DEFANS', 'DIGER', 'USTELIK', 'OZELLIKLE', 'FAKAT', 'EKIP']
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
    const kisiCumlesi = /^\S+(\s+\S+){0,4}\s+(att|kaydett|buld|imza|fileleri)/i.test(cumle)
    for (let i = 0; i < ham.length; i++) {
      for (const w of parcala(ham[i])) {
        if (!/^[A-ZÇĞİÖŞÜ]/.test(w)) continue
        if (i === 0) {
          // Cümle başı her zaman büyük harflidir. Yine de ad kalıbındaysa (virgül, kesme işaretli ek, ardından büyük harfli kelime)
          // ya da gol/asist/MVP cümlesindeyse kontrol edilir — sıradan bir kelime değilse.
          const adKalibi = kisiCumlesi || /[,’']/.test(ham[0]) || /^[A-ZÇĞİÖŞÜ]/.test(ham[1] ?? '')
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
// 1337 cümlenin öznesi mi? "1337 Crew FC'yi/'ye/'nin" özne değildir
const ozne1337 = /1337(?!(?:\s*Crew\s*FC)?['’])/i
const ONE = String.raw`1337(?:\s*Crew\s*FC)?`
const SAHIP_1337 = new RegExp(`${ONE}['’](n[iı]n|in)\\s+(kendi\\s+|iç\\s+)?(sahas|evi|ev\\s+sahipliğ)`, 'i')
const kelimeler = c => parcala(c).map(w => ({ ham: w, n: norm(kok(w)), ekli: /['’]/.test(w) }))
/** Rakip adının (FC/SK gibi genel ekler olmadan) cümlede geçtiği yer; yoksa -1 */
function rakipYeri(ws, kisa) {
  if (!kisa.length) return -1
  return ws.findIndex((_, i) => kisa.every((p, j) => ws[i + j]?.n === p))
}

/** Saha yanlış mı? Deplasman maçında 1337'yi ev sahibi, iç saha maçında deplasmanda gösteren cümle */
function sahaYanlis(t, m) {
  const { kisa } = takimParcalari(m.us === 'home' ? m.away.name : m.home.name)
  for (const c0 of cumleler(t)) {
    if (oncekiMac(c0) && !/(ardından|sonra)/i.test(c0)) continue
    const c = buMac(c0)
    const ws = kelimeler(c)
    const r = rakipYeri(ws, kisa)
    const rakipOzne = r >= 0 && !ws[r + kisa.length - 1].ekli
    const sonraki = r >= 0 ? ws.slice(r + kisa.length, r + kisa.length + 10).map(x => x.ham).join(' ') : ''
    const i = c.search(ozne1337)
    // 1337 özneyse, ilk bağlaca kadar olan kısım
    const pencere = i >= 0 ? c.slice(i).split(/;|\s(?:ve|ise|ancak|fakat|ama)\s/i)[0].slice(0, 100) : ''
    if (m.us === 'away') {
      if (new RegExp(`ev\\s+sahibi\\s+${ONE}`, 'i').test(c) || SAHIP_1337.test(c)) return true
      if (new RegExp(`${ONE},?\\s+(ev\\s+sahibi\\s+(olarak|olduğu|olacağı|konumunda|sıfatıyla)|ev\\s+sahipliği\\s+yap)`, 'i').test(c)) return true
      if (pencere) {
        const yer = pencere.search(/(kendi\s+sahas|iç\s+saha|(?<!\p{L})sahas[ıi]nda(?!\p{L})|(?<!\p{L})evinde(?!\p{L})|ağırla|konuk\s+e[dt]|misafir\s+e[dt])/iu)
        if (yer >= 0) {
          const once = pencere.slice(0, yer)
          // "1337 Crew FC, deplasmanda Bordreaux JB'nin sahasında": sahanın sahibi rakip ya da 1337 açıkça deplasmanda
          // (yalnızca tamlayan eki: "Bordreaux JB'nin sahasında"; "Bordreaux JB'yi ağırladı" yanlıştır)
          const rakipSahibi = kelimeler(once).some(x => /['’]n?[ıiuü]n$/i.test(x.ham) && kisa.includes(x.n)) || /(rakib[ıi]n[ıi]n|ev\s+sahibi|deplasman|konuk\s+ol|konuğu)/i.test(once)
          if (!rakipSahibi) return true
        }
      }
      // rakip özne olup deplasmandaysa ya da 1337'ye konuk oluyorsa
      if (rakipOzne && /^,?\s*(deplasmanda|1337[^.]{0,20}(konuğu|konuk\s+ol|misafiri))/i.test(sonraki)) return true
    } else {
      if (pencere && /((?<!\p{L})deplasmanda(?!\p{L})|deplasmana\s+(çık|gid)|konuğu\s+ol|konuk\s+ol|misafiri\s+ol)/iu.test(pencere) && !/deplasmanda\s+(ağırla|konuk\s+e[dt])/i.test(pencere)) return true
      if (r >= 0 && /ev\s+sahibi\s*$/i.test(ws.slice(0, r).map(x => x.ham).join(' '))) return true // "ev sahibi Bordreaux JB"
      if (rakipOzne && /(kendi\s+sahas|(?<!\p{L})sahas[ıi]nda(?!\p{L})|(?<!\p{L})evinde(?!\p{L})|ağırla|konuk\s+e[dt]|ev\s+sahipliği)/iu.test(sonraki) && !SAHIP_1337.test(sonraki)) return true
    }
  }
  return false
}

const KAZAN = /(mağlup\s+et(ti|erek)|(?<!\p{L})yen(di|erek)(?!\p{L})|(?<!puan[ıi]?\s|puanları\s)kazan(dı|arak)(?!\p{L})|galip\s+(geldi|ayrıl)|galibiyet(le|i\s+(aldı|elde)|\s+aldı)|üstün\s+geldi)/iu
const KAYBET = /(mağlup\s+(oldu|ayrıl)|mağlubiyet(le|e\s+uğra|\s+aldı|\s+yaşadı)|(?<!\p{L})yenil(di|erek)(?!\p{L})|(?<!puan[ıi]?\s|puanları\s)kaybet(ti|erek)|boyun\s+eğdi|yenilgi(ye\s+uğra|\s+aldı|yle)|puansız\s+döndü)/iu
const BERABER = /(berabere\s+kal|beraberlikle|puanları\s+paylaş|yenişemedi|beraberliğe\s+razı)/i
/** Sonucun yönü: 1337'nin özne olduğu cümle parçasında beklenen sonuç dışında bir sonuç sözcüğü varsa yanlış */
function sonucYanlis(t, m) {
  if (m.forfeit || !m.result) return false
  const yanlis = { G: [KAYBET, BERABER], M: [KAZAN, BERABER], B: [KAZAN, KAYBET] }[m.result]
  for (const c0 of cumleler(t)) {
    if (oncekiMac(c0) && !/(ardından|sonra)/i.test(c0)) continue
    const c = buMac(c0)
    const i = c.search(ozne1337)
    if (i < 0) continue
    // 1337'den sonraki kısım; ortaçlı yan cümleler ("rakibin kazandığı", "galibiyetle sonuçlanan seriyi") ile "galibiyetsiz/yenilgisiz" sayılmaz
    const parca = c.slice(i).replace(/\S+(dığı|diği|duğu|düğü|tığı|tiği|tuğu|tüğü)\S*/gi, '').replace(/(galibiyetsiz|yenilgisiz)\S*/gi, '')
    if (yanlis.some(r => r.test(parca))) return true
  }
  return false
}

const SAYI_ADI = { iki: 2, üç: 3, dört: 4, beş: 5, altı: 6 } // "bir" belirsiz ("bir gol daha"), sayılmaz
/** Gün, saat, hafta, tarih ve (maç önünde) puan/sıra/maç/averaj sayıları bilgiyle uyuşuyor mu? */
function sayiYanlis(t, bilgi, sayilar = null) {
  const gun = bilgi.gun ?? (bilgi.tarih ? gunAdi(bilgi.tarih) : null)
  for (const g of GUNLER) if (new RegExp(`(?<!\\p{L})${g}(?!\\p{L})`, 'iu').test(t) && g !== gun) return `gün yanlış (${g})`
  for (const [, h, d] of t.matchAll(/(?<![\d.:-])(\d{1,2})[:.](\d{2})(?![\d.:])/g)) {
    if (!bilgi.saat || `${h.padStart(2, '0')}:${d}` !== bilgi.saat) return `saat yanlış (${h}:${d})`
  }
  for (const [, n] of t.matchAll(/(\d+)\.\s*hafta/gi)) if (Number(n) !== bilgi.hafta) return `hafta yanlış (${n})`
  if (/(?<!\p{L})ilk\s+hafta/iu.test(t) && bilgi.hafta !== 1) return 'hafta yanlış (ilk)'
  if (bilgi.tarih) {
    const [, ay, gn] = bilgi.tarih.split('-').map(Number)
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

/** Gol atan olarak yazılan kişi gerçekten golcü mü, gol sayısı doğru mu? (MVP ile golcüyü karıştırma) */
function golcuYanlis(t, kisiler) {
  const { golcu, asist, mvp } = kisiler
  const golSayisi = Object.fromEntries(golcu.map(x => [x.name, x.n ?? 1]))
  const adlar = [...new Set([...golcu.map(x => x.name), ...asist, ...(mvp ? [mvp.name] : [])])]
  const parcalar = ad => ad.split(/\s+/).map(norm).filter(x => x.length > 2)
  for (const c of cumleler(t)) {
    if (!/gol/i.test(c)) continue
    const ws = kelimeler(c)
    // ad cümlede nerede geçiyor (ilk ya da soyadı)
    const yer = ad => ws.findIndex(x => parcalar(ad).includes(x.n))
    const gecen = adlar.filter(ad => yer(ad) >= 0)
    const golFiili = /(att|kaydett|buld|atan|imza|fileleri|sahne)/i.test(c)
    for (const ad of gecen) {
      if (ad in golSayisi) continue
      if (!golFiili) continue
      if (asist.includes(ad) && /(asist|pas)/i.test(c)) continue
      if (mvp && ad === mvp.name && /(mvp|değerli)/i.test(c)) {
        // MVP aynı cümlede anılabilir; ama adının hemen ardından (araya golcü girmeden) gol fiili geliyorsa golü ona yazmıştır
        const i = yer(ad), sonra = ws.slice(i + 1, i + 5)
        const k = sonra.findIndex(x => /(att|kaydett|imza)/i.test(x.ham))
        if (k >= 0 && !sonra.slice(0, k).some(x => golcu.some(g => parcalar(g.name).includes(x.n)))) return `golcü yanlış (${ad})`
        continue
      }
      return `golcü yanlış (${ad})`
    }
    // Gol sayısı: golcünün adından hemen sonra gelen "iki gol / 2 gol"; "hat-trick" en az 3 gol ister
    const anilan = gecen.filter(ad => ad in golSayisi)
    for (const ad of anilan) {
      const i = yer(ad)
      for (let k = i + 1; k <= i + 4 && k + 1 < ws.length; k++) {
        if (!/^gol/i.test(ws[k + 1].ham)) continue
        const s = ws[k].ham.toLocaleLowerCase('tr')
        const n = /^\d+$/.test(s) ? Number(s) : SAYI_ADI[s]
        if (n && n !== golSayisi[ad]) return `gol sayısı yanlış (${ad}: ${n})`
      }
    }
    if (/hat-?trick/i.test(c) && !anilan.some(ad => golSayisi[ad] >= 3)) return 'hat-trick yanlış'
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
async function geminiYaz(model, sistem, istek) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': GEMINI, 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sistem }] }, contents: [{ role: 'user', parts: [{ text: istek }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 4096 } }),
    signal: AbortSignal.timeout(90000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.error) return { hata: `${j.error?.message ?? r.status}`, kod: r.status }
  return { metin: (j.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('') }
}

const OR_TERCIH = ['openrouter/free', 'google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free']
async function openrouterYaz(model, sistem, istek) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENROUTER}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://1337crewfc.com', 'X-Title': '1337 Crew FC' },
    body: JSON.stringify({ model, temperature: 0.4, max_tokens: 500, messages: [{ role: 'system', content: sistem }, { role: 'user', content: istek }] }),
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

/** Ortak kontroller + yazıya özel kontrol. Sorun yoksa null, varsa sebep. */
function kontrol(metin, bilgi, dogrula) {
  if (!metin) return 'boş'
  if (metin.length < 40) return 'çok kısa'
  if (metin.length > 900) return 'çok uzun'
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

/** Yazıyı döndürür (önceden yazılmışsa kayıttan); yazamazsa null. */
async function yaz({ anahtar, bilgi, eskiBilgi, istek, dogrula, oncelikli = true }) {
  const k = `${anahtar}:${ozet(bilgi)}`
  if (KAPALI) return null
  // Bir kerelik geçiş: anahtarın hesaplanma biçimi değiştiyse eski kaydı yeni anahtara taşı
  if (eskiBilgi && !yazilar[k]) { const ek = `${anahtar}:${ozet(eskiBilgi)}`; if (yazilar[ek]) { yazilar[k] = yazilar[ek]; delete yazilar[ek] } }
  let kayitli = null
  if (!TASLAK && yazilar[k]) {
    // Kayıtlı yazı da güncel kurallardan geçmeli; geçmezse kullanılmaz (silinmez: yenisi yazılınca yerini alır)
    const sebep = kontrol(yazilar[k].metin, bilgi, dogrula)
    if (!sebep) kayitli = { metin: yazilar[k].metin, model: yazilar[k].model }
    else durum.hata.push(`${anahtar.slice(0, 40)}: kayıtlı yazı kurallardan geçmedi (${sebep})`)
  }
  // Yükseltme: Gemini dışı bir modelin yazdığı öncelikli yazı, Gemini müsaitse Gemini'ye yeniden yazdırılır
  const yukselt = kayitli && oncelikli && GEMINI && !/^gemini/.test(kayitli.model ?? '') && !durum.durdu.gemini
  if (kayitli && !yukselt) return kayitli
  if (!ACIK) return kayitli
  if (durum.yazildi >= BIR_CALISMADA_EN_FAZLA || durum.istek >= EN_FAZLA_ISTEK) return kayitli
  if (!oncelikli && durum.eski >= ESKI_EN_FAZLA) return kayitli
  const red = RED[k]
  if (!TASLAK && red && red.sayi >= RED_SINIR && Date.now() - Date.parse(red.zaman) < RED_BEKLE) { durum.atlanan++; return kayitli }
  if (!oncelikli) durum.eski++ // eski maçlar denemeye göre sayılır (reddedilse de kota harcar)
  const tam = `${istek}\n\nBilgiler:\n${JSON.stringify(bilgi, null, 1)}`
  let reddedildi = false
  for (const d of await denemeler(!!yukselt)) {
    if (durum.durdu[d.ad] || durum.tukenen.includes(d.model) || durum.istek >= EN_FAZLA_ISTEK) continue
    try {
      durum.istek++
      let r = await d.fn(d.model, SISTEM, tam)
      // Ücretsiz modeller yoğunken "high demand / overloaded" der: 20 sn bekleyip bir kez daha dene
      if (r.hata && /high demand|overloaded|unavailable|try again/i.test(r.hata) && durum.istek < EN_FAZLA_ISTEK) {
        await new Promise(x => setTimeout(x, 20000))
        durum.istek++
        r = await d.fn(d.model, SISTEM, tam)
      }
      if (r.hata) {
        durum.hata.push(`${d.model}: ${r.hata}`.slice(0, 160))
        if ([401, 402, 403].includes(r.kod) || (r.kod === 400 && /key|auth|permission|credit|billing/i.test(r.hata))) durum.durdu[d.ad] = true
        else if (r.kod === 429 || r.kod === 404 || /quota|RESOURCE_EXHAUSTED|rate.?limit|not found/i.test(r.hata)) durum.tukenen.push(d.model)
        else if ((modelHata[d.model] = (modelHata[d.model] ?? 0) + 1) >= 2) durum.tukenen.push(d.model)
        continue
      }
      const metin = temizle(r.metin)
      const sebep = kontrol(metin, bilgi, dogrula)
      if (sebep) { reddedildi = true; durum.reddedilen.push({ anahtar, model: d.model, sebep, metin }); durum.hata.push(`${d.model}: reddedildi (${sebep})`); continue }
      if (!TASLAK) {
        yazilar[k] = { metin, model: d.model, zaman: new Date().toISOString() }
        for (const x of Object.keys(yazilar)) if (x !== k && x.startsWith(anahtar + ':')) delete yazilar[x]
        for (const x of Object.keys(RED)) if (x.startsWith(anahtar + ':')) delete RED[x]
      }
      durum.yazildi++
      if (yukselt) durum.yukseltilen++
      durum.model = d.model
      return { metin, model: d.model }
    } catch (e) {
      durum.hata.push(`${d.model}: ${e.message}`.slice(0, 160))
      if ((modelHata[d.model] = (modelHata[d.model] ?? 0) + 1) >= 2) durum.tukenen.push(d.model)
    }
  }
  // Model metin yazdı ama kontrolden geçemedi: kalıcı sayaç (kota/yoğunluk hataları sayılmaz)
  if (reddedildi && !TASLAK) {
    for (const x of Object.keys(RED)) if (x !== k && x.startsWith(anahtar + ':')) delete RED[x]
    RED[k] = { sayi: (RED[k]?.sayi ?? 0) + 1, zaman: new Date().toISOString() }
  }
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
    dogrula: x => !skorVar(x, m) ? 'skor yok' : !adVar(x, t.name) ? 'rakip adı yok' : sahaYanlis(x, m) ? 'saha yanlış' : sonucYanlis(x, m) ? 'sonuç yanlış' : sayiYanlis(x, bilgi) ?? golcuYanlis(x, kisiler),
  })
}

export async function onizlemeYaz(next, table, done) {
  const opp = m => (m.us === 'home' ? m.away : m.home)
  const t = opp(next)
  // Hiç maç oynanmamış tabloda sıra/puan anlamsızdır: verilmez
  const row = table.find(r => r.code === t.code && r.played > 0), us = table.find(r => r.us && r.played > 0)
  const h2h = done.filter(m => opp(m).code === t.code)
  const bilgi = {
    mac: `${next.home.name} - ${next.away.name}`, yarisma: next.compLabel, hafta: next.week ?? null, tarih: next.date, gun: gunAdi(next.date), saat: next.time,
    saha: next.us === 'home' ? `1337 iç sahada, ${next.home.name} ev sahibi` : `1337 deplasmanda, ev sahibi ${next.home.name}`,
    rakip: t.name, rakipSira: row ? `${row.rank}. sıra, ${row.played} maçta ${row.points} puan, averaj ${row.gd}` : null,
    sira1337: us ? `${us.rank}. sıra, ${us.played} maçta ${us.points} puan, averaj ${us.gd}` : null,
    oncekiKarsilasmalar: h2h.length ? `kayıtlı ${h2h.length} maç: ${h2h.filter(m => m.result === 'G').length} 1337 galibiyeti, ${h2h.filter(m => m.result === 'B').length} beraberlik, ${h2h.filter(m => m.result === 'M').length} ${t.name} galibiyeti` : 'kayıtlarda iki takımın maçı yok',
    sonMac1337: done[0] ? `${done[0].home.name} ${done[0].home.score}-${done[0].away.score} ${done[0].away.name}` : null,
  }
  const rows = [row, us].filter(Boolean)
  const sayilar = { puan: rows.map(r => r.points), sira: rows.map(r => r.rank), mac: [...rows.map(r => r.played), h2h.length], averaj: rows.map(r => Math.abs(r.gd)) }
  return yaz({
    anahtar: `onizleme:${next.id}`, bilgi, istek: 'Bu maç için kısa bir maç önü yazısı yaz.',
    dogrula: x => !adVar(x, t.name) ? 'rakip adı yok' : sahaYanlis(x, next) ? 'saha yanlış' : sayiYanlis(x, bilgi, sayilar),
  })
}

export function kaydet() {
  if (TASLAK) return
  writeFileSync(FILE, JSON.stringify(yazilar, null, 1))
  redKaydet()
}
export const _dogrulama = { yabanciIsim, sahaYanlis, sonucYanlis, sayiYanlis, golcuYanlis, skorVar, adVar, bizVar, kontrol, gunAdi, temizle, RED }
