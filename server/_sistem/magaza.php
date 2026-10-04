<?php
// Mağaza ortak yardımcıları. Ürünler, siparişler, ayarlar ve deneme sınırları _veri/magaza/ altında (web'e kapalı) JSON'da.
// Kişisel veri (ad, telefon, not) yalnızca burada durur: herkese açık JSON'a, adreslere, durum.json'a ve hata günlüğüne girmez.
// Bütün değişiklikler tek bir kilit altında yapılır; her dosya önce *.yeni olarak yazılıp yerine konur.
// mbstring/intl/fileinfo/GD'ye güvenilmez: Unicode işleri preg /u ile yapılır, GD varsa fotoğraflar yeniden kodlanır.
require_once __DIR__ . '/taraftar.php';

const MAGAZA_DURUMLAR = ['yeni', 'gorusuldu', 'hazir', 'teslim', 'iptal'];
const MAGAZA_DURUM_ETIKET = ['yeni' => 'Yeni', 'gorusuldu' => 'Görüşüldü', 'hazir' => 'Teslime hazır', 'teslim' => 'Teslim edildi', 'iptal' => 'İptal'];
const MAGAZA_RESIM_DESENI = '/^[a-f0-9]{16}\.(jpg|png|webp)$/D';
const MAGAZA_URUN_DESENI = '/^u[a-f0-9]{10}$/D';

/** Ziyaretçiye gösterilecek hata: mesaj Türkçe, kod HTTP durumu */
class MagazaHata extends Exception {}
function magaza_hata(string $mesaj, int $kod = 400): never { throw new MagazaHata($mesaj, $kod); }

function magaza_basliklar(int $kod): void {
    if (headers_sent()) return; // PHP istekten önce uyarı yazdıysa (ör. post_max_size aşımı, display_errors açık)
    http_response_code($kod);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
}
function magaza_cevap(array $j, int $kod = 200): void {
    magaza_basliklar($kod);
    echo json_encode($j, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
/** Cevabı gönderip bağlantıyı kapatır, ardından $sonra() çalışır (ör. e-posta): ziyaretçi beklemez */
function magaza_cevap_sonra(array $j, callable $sonra): void {
    $govde = json_encode($j, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    magaza_basliklar(200);
    header('Content-Length: ' . strlen($govde));
    header('Connection: close');
    echo $govde;
    ignore_user_abort(true);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
    else { while (ob_get_level() > 0) @ob_end_flush(); @flush(); }
    try { $sonra(); } catch (Throwable $e) { error_log('magaza: ' . get_class($e) . ' ' . substr($e->getMessage(), 0, 200)); }
    exit;
}

/** Uç noktanın gövdesi: bilinen hatalar kendi koduyla, beklenmeyenler 500 (günlüğe yalnızca hata türü ve yeri yazılır) */
function magaza_calistir(callable $fn): void {
    try { $fn(); }
    catch (MagazaHata $e) { magaza_cevap(['ok' => false, 'hata' => $e->getMessage()], $e->getCode() ?: 400); }
    catch (Throwable $e) {
        error_log('magaza: ' . get_class($e) . ' ' . substr($e->getMessage(), 0, 200) . ' @' . basename($e->getFile()) . ':' . $e->getLine());
        magaza_cevap(['ok' => false, 'hata' => 'Bir sorun oluştu, tekrar dene'], 500);
    }
}

/** JSON istek gövdesi (en fazla 64 KB) */
function magaza_govde(): array {
    $ham = (string)file_get_contents('php://input', false, null, 0, 65537);
    $g = strlen($ham) > 65536 ? null : json_decode($ham, true, 16);
    if (!is_array($g)) magaza_hata('Geçersiz istek');
    return $g;
}

// ——— Depolama ———

function magaza_dizini(): string {
    static $d = null;
    if ($d !== null) return $d;
    $d = crew_veri_dizini() . '/magaza';
    if (!is_dir("$d/resim")) @mkdir("$d/resim", 0755, true);
    if (!file_exists("$d/.htaccess")) @file_put_contents("$d/.htaccess", CREW_KAPALI_HTACCESS);
    return $d;
}

/** _veri/magaza/<ad>.json. Okunamayan dosya boş sayılmaz (üzerine yazılıp siparişler kaybolmasın); yalnızca sınır kaydı sıfırlanabilir. */
function magaza_oku(string $ad): array {
    $f = magaza_dizini() . "/$ad.json";
    if (!is_file($f)) return [];
    $v = json_decode((string)@file_get_contents($f), true);
    if (is_array($v)) return $v;
    if ($ad === 'sinir') return [];
    throw new RuntimeException("$ad.json okunamadı");
}

/** Önce hepsi *.yeni olarak yazılır, sonra yerine konur: yazma yarıda kalırsa eski kayıt bozulmaz. Kilit içinde çağrılır. */
function magaza_yaz(array $dosyalar): void {
    $d = magaza_dizini();
    foreach ($dosyalar as $ad => $v) {
        $j = json_encode($v, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($j === false || file_put_contents("$d/$ad.json.yeni", $j) !== strlen($j)) throw new RuntimeException("$ad.json yazılamadı");
    }
    foreach ($dosyalar as $ad => $v) if (!magaza_yerine_koy("$d/$ad.json.yeni", "$d/$ad.json")) throw new RuntimeException("$ad.json yerine konamadı");
}
/** rename; Windows'ta dosyayı o an okuyan olursa birkaç kez yeniden dener (Linux'ta ilk denemede olur) */
function magaza_yerine_koy(string $kaynak, string $hedef): bool {
    for ($i = 0; $i < 10; $i++) {
        if (@rename($kaynak, $hedef)) return true;
        usleep(20000);
    }
    return false;
}

/** Tek genel kilit: okuma-karar-yazma bütün mağaza için sırayla yapılır (iç içe çağrı aynı kilidi kullanır) */
function magaza_kilitli(callable $fn) {
    static $icinde = false;
    if ($icinde) return $fn();
    $k = fopen(magaza_dizini() . '/magaza.lock', 'c');
    if (!$k || !flock($k, LOCK_EX)) throw new RuntimeException('mağaza kilidi alınamadı');
    $icinde = true;
    try { return $fn(); } finally { $icinde = false; flock($k, LOCK_UN); fclose($k); }
}

// ——— Metin, sayı, telefon ———

/** Unicode harf sayısı */
function magaza_uzunluk(string $s): int { return (int)preg_match_all('/./us', $s); }

/**
 * Metni temizler: denetim ve görünmez yön karakterleri gider, boşluk dizileri teke iner, baş/son boşluk kırpılır,
 * en fazla $enFazla harf kalır (0: sınırsız). Çok satırlıda satır sonları korunur.
 */
function magaza_metin($v, int $enFazla = 0, bool $cokSatir = false): string {
    $s = is_string($v) ? $v : (is_int($v) ? (string)$v : '');
    if ($s === '' || !preg_match('//u', $s)) return '';
    $s = str_replace(["\r\n", "\r", "\u{2028}", "\u{2029}"], "\n", $s);
    // önce görünmez ve denetim karakterleri (sekme ve satır sonu boşluk sayılır), sonra boşluk dizileri
    $s = (string)preg_replace('/[\x{0}-\x{8}\x{B}-\x{1F}\x{7F}-\x{9F}\x{AD}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{2066}-\x{2069}\x{FEFF}]/u', '', $s);
    $s = (string)preg_replace($cokSatir ? '/[^\S\n]+/u' : '/\s+/u', ' ', $s);
    if ($cokSatir) $s = (string)preg_replace(["/ *\n */", "/\n{3,}/"], ["\n", "\n\n"], $s);
    $s = trim($s, " \n");
    if ($enFazla > 0 && magaza_uzunluk($s) > $enFazla) { preg_match('/^.{0,' . $enFazla . '}/us', $s, $m); $s = rtrim($m[0], " \n"); }
    return $s;
}

/** Tam sayı (JSON'da 2.0 gibi gelse de) ve aralıkta mı; değilse null */
function magaza_tam($v, int $en, int $ust): ?int {
    if (is_float($v) && is_finite($v) && floor($v) == $v && abs($v) < 1e9) $v = (int)$v;
    return is_int($v) && $v >= $en && $v <= $ust ? $v : null;
}

/** Türkçe büyük harf: i→İ, ı→I, sonra ASCII (mbstring'e ve yerel ayara güvenmeden) */
function magaza_buyuk(string $s): string {
    $s = strtr($s, ['i' => 'İ', 'ı' => 'I', 'ç' => 'Ç', 'ğ' => 'Ğ', 'ö' => 'Ö', 'ş' => 'Ş', 'ü' => 'Ü']);
    return strtr($s, 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
}

/** Telefon: ülke koduyla yalnız rakam (905321234567). +/00 ile yurt dışı 8-15 hane; başında + yoksa yalnız TR cep. Geçersizse null. */
function magaza_tel($v): ?string {
    $t = (string)preg_replace('/[\s().\-]+/u', '', magaza_metin($v));
    if (strlen($t) > 20) return null;
    if (preg_match('/^(?:\+|00)900(\d{10})$/D', $t, $m)) return '90' . $m[1]; // +90 (0532) ... yazımı
    if (preg_match('/^(?:\+|00)([1-9]\d{7,14})$/D', $t, $m)) return $m[1];
    if (preg_match('/^0?(5\d{9})$/D', $t, $m)) return '90' . $m[1];
    if (preg_match('/^905\d{9}$/D', $t)) return $t;
    return null;
}
/** 905321234567 → 0532 123 45 67; yurt dışı +ülke koduyla */
function magaza_tel_yazi(string $t): string {
    return preg_match('/^90(\d{3})(\d{3})(\d{2})(\d{2})$/D', $t, $m) ? "0$m[1] $m[2] $m[3] $m[4]" : "+$t";
}

/** Sipariş numarası: "42", "0042", "1337-0042", "1337 0042" → "1337-0042"; olmazsa null */
function magaza_no($v): ?string {
    $s = str_replace(['–', '—', '_', '/'], '-', (string)preg_replace('/[\s#]+/u', '', magaza_metin($v)));
    if (strlen($s) > 30 || !preg_match('/^(?:1337-?)?0*(\d{1,7})$/D', $s, $m) || (int)$m[1] < 1) return null;
    return sprintf('1337-%04d', (int)$m[1]);
}
function magaza_no_sayi(string $no): int { return (int)substr($no, 5); }

/** ISO zaman → 04.10.2026 14:32 (İstanbul) */
function magaza_zaman_yazi(string $z): string {
    try { return (new DateTime($z))->setTimezone(new DateTimeZone('Europe/Istanbul'))->format('d.m.Y H:i'); }
    catch (Exception $e) { return ''; }
}

// ——— Ayarlar, ürünler ———

function magaza_ayarlar(): array {
    $a = magaza_oku('ayarlar');
    return ['acik' => (bool)($a['acik'] ?? true), 'teslimNotu' => (string)($a['teslimNotu'] ?? ''), 'whatsapp' => (string)($a['whatsapp'] ?? ''), 'eposta' => (string)($a['eposta'] ?? '')];
}

function magaza_urun_kimligi(): string { return 'u' . bin2hex(random_bytes(5)); }

/** İlk açılışta üç taslak ürün (yayında değil, fiyatsız): yönetim fiyat ve fotoğraf girip yayına alır */
function magaza_tohum(): array {
    $simdi = date('c');
    $u = fn(string $ad, string $kategori, string $satis, bool $baski, int $sira) => [
        'id' => magaza_urun_kimligi(), 'ad' => $ad, 'kategori' => $kategori, 'aciklama' => '', 'fiyat' => 0, 'resimler' => [],
        'bedenler' => array_map(fn($b) => ['ad' => $b, 'stok' => $satis === 'stok' ? 0 : null], ['S', 'M', 'L', 'XL', 'XXL']),
        'satis' => $satis, 'onSiparisBitis' => null, 'teslimTahmini' => '', 'baski' => $baski, 'baskiUcret' => 0,
        'yayinda' => false, 'sira' => $sira, 'olusturma' => $simdi, 'guncelleme' => $simdi,
    ];
    return [$u('İç saha forması', 'Forma', 'onsiparis', true, 1), $u('Deplasman forması', 'Forma', 'onsiparis', true, 2), $u('Siyah kapüşonlu hoodie', 'Hoodie', 'stok', false, 3)];
}

/** Bütün ürünler (taslaklar dahil) sıraya göre */
function magaza_urunler(): array {
    $f = magaza_dizini() . '/urunler.json';
    if (!is_file($f)) magaza_kilitli(function () use ($f) { if (!is_file($f)) magaza_yaz(['urunler' => ['urunler' => magaza_tohum()]]); });
    $u = magaza_oku('urunler')['urunler'] ?? [];
    usort($u, fn($a, $b) => ($a['sira'] ?? 0) <=> ($b['sira'] ?? 0));
    return $u;
}

/** Şu an sipariş verilebilir mi: mağaza açık, ürün yayında; stokta en az bir beden var ya da ön sipariş son günü geçmedi (İstanbul, o gün dahil) */
function magaza_siparis_acik(array $u, array $ay): bool {
    if (!$ay['acik'] || empty($u['yayinda'])) return false;
    if (($u['satis'] ?? '') === 'stok') {
        foreach ($u['bedenler'] ?? [] as $b) if ((int)($b['stok'] ?? 0) > 0) return true;
        return false;
    }
    $bitis = $u['onSiparisBitis'] ?? null;
    return $bitis === null || crew_simdi()->format('Y-m-d') <= $bitis;
}

/** Herkese açık ürün (yalnız bu alanlar) */
function magaza_urun_genel(array $u, array $ay): array {
    $stok = ($u['satis'] ?? '') === 'stok';
    return [
        'id' => (string)$u['id'], 'ad' => (string)$u['ad'], 'kategori' => (string)($u['kategori'] ?? ''), 'aciklama' => (string)($u['aciklama'] ?? ''),
        'fiyat' => (int)($u['fiyat'] ?? 0), 'resimler' => array_values(array_map('strval', $u['resimler'] ?? [])),
        'bedenler' => array_map(fn($b) => ['ad' => (string)$b['ad'], 'stok' => $stok ? (int)($b['stok'] ?? 0) : null], $u['bedenler'] ?? []),
        'satis' => $stok ? 'stok' : 'onsiparis', 'onSiparisBitis' => $u['onSiparisBitis'] ?? null, 'teslimTahmini' => (string)($u['teslimTahmini'] ?? ''),
        'baski' => !empty($u['baski']), 'baskiUcret' => (int)($u['baskiUcret'] ?? 0), 'siparisAcik' => magaza_siparis_acik($u, $ay),
    ];
}
/** Yönetimin gördüğü ürün */
function magaza_urun_tam(array $u, array $ay): array {
    return magaza_urun_genel($u, $ay) + ['yayinda' => !empty($u['yayinda']), 'sira' => (int)($u['sira'] ?? 0), 'olusturma' => (string)($u['olusturma'] ?? ''), 'guncelleme' => (string)($u['guncelleme'] ?? '')];
}

// ——— Siparişler ———

/** ['son' => son numara, 'siparisler' => [no => kayıt]] */
function magaza_siparisler(): array {
    $s = magaza_oku('siparisler');
    return ['son' => (int)($s['son'] ?? 0), 'siparisler' => is_array($s['siparisler'] ?? null) ? $s['siparisler'] : []];
}
function magaza_siparis_dosyasi(array $k): array { return ['son' => (int)$k['son'], 'siparisler' => $k['siparisler'] ?: new stdClass()]; }

function magaza_kalem(array $k): array {
    $r = ['urun' => (string)$k['urun'], 'ad' => (string)$k['ad'], 'beden' => (string)$k['beden'], 'adet' => (int)$k['adet']];
    if (!empty($k['baski'])) $r['baski'] = ['isim' => (string)$k['baski']['isim'], 'numara' => (string)$k['baski']['numara']];
    return $r + ['birim' => (int)$k['birim'], 'satis' => $k['satis'] === 'stok' ? 'stok' : 'onsiparis'];
}
/** Takipte görünen sipariş: ad, telefon, not, iç not ve ip/cihaz özetleri yok */
function magaza_siparis_genel(array $o): array {
    return [
        'no' => (string)$o['no'], 'zaman' => (string)$o['zaman'], 'durum' => (string)$o['durum'], 'odendi' => !empty($o['odendi']),
        'kalemler' => array_map('magaza_kalem', $o['kalemler'] ?? []), 'toplam' => (int)$o['toplam'],
        'gecmis' => array_map(fn($g) => ['zaman' => (string)$g['zaman'], 'durum' => (string)$g['durum']], $o['gecmis'] ?? []),
    ];
}
/** Yönetimin gördüğü sipariş (ip/cihaz özetleri hiçbir zaman dönmez) */
function magaza_siparis_tam(array $o): array {
    return magaza_siparis_genel($o) + ['ad' => (string)$o['ad'], 'tel' => (string)$o['tel'], 'not' => (string)($o['not'] ?? ''), 'icNot' => (string)($o['icNot'] ?? ''), 'odemeZaman' => $o['odemeZaman'] ?? null];
}

/** "İç saha forması L ×1 (CREW 21)" */
function magaza_kalem_yazi(array $k): string {
    return "{$k['ad']} {$k['beden']} ×{$k['adet']}" . (!empty($k['baski']) ? " ({$k['baski']['isim']} {$k['baski']['numara']})" : '');
}

/**
 * Siparişin stoktan satılan kalemlerini stoğa geri koyar ($yon 1) ya da ayırır ($yon -1). Ürün silinmiş, beden kalkmış ya da
 * ürün ön siparişe dönmüşse o kalem atlanır. Yetmeyen olursa hiçbir şey değişmez ve [ürün adı, beden] döner.
 */
function magaza_stok_tasi(array &$urunler, array $siparis, int $yon): ?array {
    $yeni = $urunler;
    foreach ($siparis['kalemler'] ?? [] as $k) {
        if (($k['satis'] ?? '') !== 'stok') continue;
        foreach ($yeni as $i => $u) {
            if ($u['id'] !== $k['urun'] || ($u['satis'] ?? '') !== 'stok') continue;
            foreach ($u['bedenler'] as $j => $b) {
                if ($b['ad'] !== $k['beden']) continue;
                $n = (int)$yeni[$i]['bedenler'][$j]['stok'] + $yon * (int)$k['adet'];
                if ($n < 0) return [(string)$u['ad'], (string)$b['ad']];
                $yeni[$i]['bedenler'][$j]['stok'] = $n;
            }
        }
    }
    $urunler = $yeni;
    return null;
}

// ——— Deneme sınırları (sinir.json: tür → anahtar özeti → unix zamanları) ———

function magaza_sinir_say(array $s, string $tur, string $anahtar, int $pencere): int {
    $sinir = time() - $pencere;
    $n = 0;
    foreach ($s[$tur][$anahtar] ?? [] as $t) if ($t > $sinir) $n++;
    return $n;
}
function magaza_sinir_ekle(array &$s, string $tur, string $anahtar): void { $s[$tur][$anahtar][] = time(); }
/** Bir günden eski kayıtları atar; anahtar başına en fazla 200 kayıt */
function magaza_sinir_temiz(array $s): array {
    $sinir = time() - 86400;
    foreach ($s as $tur => $anahtarlar) {
        if (!is_array($anahtarlar)) { unset($s[$tur]); continue; }
        foreach ($anahtarlar as $k => $z) {
            $z = array_values(array_filter(is_array($z) ? $z : [], fn($t) => is_int($t) && $t > $sinir));
            if ($z) $s[$tur][$k] = array_slice($z, -200); else unset($s[$tur][$k]);
        }
        if (!$s[$tur]) unset($s[$tur]);
    }
    return $s;
}

// ——— Yönetim girişi ———

/**
 * X-Panel-Anahtar takım paneli anahtarıyla karşılaştırılır. Aynı ağdan 15 dakikada 10 hatalı denemeden sonra anahtar hiç
 * karşılaştırılmadan 429 döner. Genel (herkes için) kilit yok: başka adreslerden yapılan denemeler yönetimi dışarıda bırakamaz;
 * anahtar uzun ve rastgele olduğu için adres başına sınır yeterli. Boş anahtar deneme sayılmaz. Doğru anahtarlı istekler sınırlanmaz.
 */
function magaza_panel_dogrula(): void {
    $verilen = trim((string)($_SERVER['HTTP_X_PANEL_ANAHTAR'] ?? ''));
    $ip = crew_ip('magaza');
    magaza_kilitli(function () use ($verilen, $ip) {
        $s = magaza_oku('sinir');
        if (magaza_sinir_say($s, 'panel-hata', $ip, 900) >= 10) magaza_hata('Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.', 429);
        $anahtar = trim((string)@file_get_contents(crew_veri_dizini() . '/panel-anahtari.txt'));
        if ($anahtar === '') magaza_hata('Panel anahtarı sunucuda yok', 503);
        if ($verilen !== '' && strlen($verilen) <= 512 && hash_equals($anahtar, $verilen)) return;
        if ($verilen !== '') {
            magaza_sinir_ekle($s, 'panel-hata', $ip);
            magaza_yaz(['sinir' => magaza_sinir_temiz($s)]);
        }
        magaza_hata('Panel anahtarı geçersiz', 401);
    });
}

// ——— Fotoğraflar ———

/** Ürünlerde kullanılan fotoğraf kimlikleri */
function magaza_kullanilan_resimler(array $urunler): array {
    $k = [];
    foreach ($urunler as $u) foreach ($u['resimler'] ?? [] as $r) $k[$r] = true;
    return $k;
}
/** $adaylar arasından artık hiçbir üründe olmayanları siler (kilit içinde) */
function magaza_resim_birak(array $urunler, array $adaylar): void {
    $kullanilan = magaza_kullanilan_resimler($urunler);
    foreach ($adaylar as $r) if (is_string($r) && preg_match(MAGAZA_RESIM_DESENI, $r) && !isset($kullanilan[$r])) @unlink(magaza_dizini() . "/resim/$r");
}
/** Hiçbir üründe kullanılmayan, 24 saatten eski fotoğrafları ve yarım kalmış yüklemeleri siler (kilit içinde) */
function magaza_eski_resimleri_sil(): void {
    $d = magaza_dizini() . '/resim';
    $kullanilan = magaza_kullanilan_resimler(magaza_urunler());
    foreach (scandir($d) ?: [] as $ad) {
        $yas = time() - (int)@filemtime("$d/$ad");
        $sil = preg_match(MAGAZA_RESIM_DESENI, $ad) ? !isset($kullanilan[$ad]) && $yas > 86400 : preg_match('/^\.[a-f0-9]{16}\.yukleniyor$/D', $ad) && $yas > 3600;
        if ($sil) @unlink("$d/$ad");
    }
}

/** GD fotoğrafı açarken yaklaşık en×boy×5 bayt ister; bellek sınırı yetmiyorsa (768 MB'a kadar) yükseltmeyi dener */
function magaza_bellek_yeter(int $gerek): bool {
    $s = strtolower(trim((string)ini_get('memory_limit')));
    if ($s === '' || $s === '-1') return true;
    $sinir = (int)$s * (['g' => 1 << 30, 'm' => 1 << 20, 'k' => 1 << 10][substr($s, -1)] ?? 1);
    $gerek += memory_get_usage() + (16 << 20);
    if ($sinir >= $gerek) return true;
    return $gerek <= (768 << 20) && @ini_set('memory_limit', (string)$gerek) !== false;
}

/** Telefon fotoğrafının EXIF yönü (exif eklentisi varsa): GD yönü kendisi uygulamaz */
function magaza_yonlendir($g, string $dosya) {
    if (!function_exists('exif_read_data')) return $g;
    $aci = [3 => 180, 6 => 270, 8 => 90][(int)(@exif_read_data($dosya)['Orientation'] ?? 1)] ?? 0;
    $r = $aci ? @imagerotate($g, $aci, 0) : false;
    return $r ?: $g;
}

/**
 * Yüklenen fotoğraf ($_FILES['dosya']): en fazla 8 MB, JPEG/PNG/WebP, en fazla 40 megapiksel. GD varsa açılıp en uzun kenarı
 * 1600 px'e küçültülür, saydamlık beyaza basılır ve JPEG olarak yeniden kodlanır (konum gibi bilgiler gider).
 * GD yoksa olduğu gibi saklanır. Kimlik rastgeledir; dosya adı ve istemcinin bildirdiği tür kullanılmaz.
 */
function magaza_resim_yukle(): string {
    $f = $_FILES['dosya'] ?? null;
    $buyuk = 'Fotoğraf en fazla 8 MB olabilir';
    if (!is_array($f) || !is_int($f['error'] ?? null)) magaza_hata('Fotoğraf seç');
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) magaza_hata($buyuk);
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) magaza_hata('Fotoğraf yüklenemedi, tekrar dene');
    $tmp = $f['tmp_name'];
    if ((int)filesize($tmp) > 8 << 20) magaza_hata($buyuk);
    $bilgi = @getimagesize($tmp);
    $uzanti = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'][$bilgi[2] ?? 0] ?? null;
    if (!$bilgi || !$uzanti) magaza_hata('Bu fotoğraf biçimi desteklenmiyor (JPEG, PNG ya da WebP)');
    [$en, $boy] = $bilgi;
    if ($en < 1 || $boy < 1 || $en * $boy > 40000000) magaza_hata('Fotoğrafın çözünürlüğü çok yüksek');
    $d = magaza_dizini() . '/resim';
    $gecici = "$d/." . bin2hex(random_bytes(8)) . '.yukleniyor';
    // GD bu türü açıp JPEG yazabiliyorsa yeniden kodlanır (ör. WebP desteği olmayan GD'de dosya olduğu gibi kalır)
    $gd = function_exists('imagecreatefromstring') && function_exists('imagetypes') && function_exists('imagejpeg')
        && (imagetypes() & IMG_JPG) && (imagetypes() & ['jpg' => IMG_JPG, 'png' => IMG_PNG, 'webp' => IMG_WEBP][$uzanti]);
    if ($gd) {
        if (!magaza_bellek_yeter($en * $boy * 5)) magaza_hata('Fotoğrafın çözünürlüğü çok yüksek');
        $kaynak = @imagecreatefromstring((string)file_get_contents($tmp));
        if (!$kaynak) magaza_hata('Bu fotoğraf açılamadı, başka bir fotoğraf dene');
        if ($uzanti === 'jpg') $kaynak = magaza_yonlendir($kaynak, $tmp);
        $ken = imagesx($kaynak); $kboy = imagesy($kaynak);
        $o = min(1, 1600 / max($ken, $kboy));
        $yen = max(1, (int)round($ken * $o)); $yboy = max(1, (int)round($kboy * $o));
        $hedef = imagecreatetruecolor($yen, $yboy);
        imagefilledrectangle($hedef, 0, 0, $yen - 1, $yboy - 1, imagecolorallocate($hedef, 255, 255, 255));
        imagealphablending($hedef, true);
        imagecopyresampled($hedef, $kaynak, 0, 0, 0, 0, $yen, $yboy, $ken, $kboy);
        unset($kaynak);
        $ok = @imagejpeg($hedef, $gecici, 82);
        unset($hedef);
        if (!$ok) { @unlink($gecici); throw new RuntimeException('jpeg yazılamadı'); }
        $uzanti = 'jpg';
    } elseif (!move_uploaded_file($tmp, $gecici)) throw new RuntimeException('yüklenen dosya taşınamadı');
    $id = bin2hex(random_bytes(8)) . ".$uzanti";
    magaza_kilitli(function () use ($gecici, $d, $id) {
        if (!magaza_yerine_koy($gecici, "$d/$id")) { @unlink($gecici); throw new RuntimeException('fotoğraf yerine konamadı'); }
        magaza_eski_resimleri_sil();
    });
    return $id;
}

// ——— E-posta ———

/** Düz metin e-posta. Başlıklarda kullanıcı girdisi yok; alıcı yönetimin kaydettiği doğrulanmış adres. */
function magaza_eposta(string $kime, string $konu, string $govde): bool {
    if (!filter_var($kime, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n,;]/', $kime)) return false;
    $basliklar = "From: 1337 Crew FC <noreply@1337crewfc.com>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
    // SMTP satır sınırı (998 bayt) aşılmasın: uzun satırlar 200 harfte bölünür
    $satirlar = [];
    foreach (explode("\n", $govde) as $s) { preg_match_all('/.{1,200}/us', $s, $m); array_push($satirlar, ...($m[0] ?: [''])); }
    $ok = @mail($kime, '=?UTF-8?B?' . base64_encode($konu) . '?=', implode("\r\n", $satirlar), $basliklar);
    if (!$ok) error_log('magaza: e-posta gönderilemedi');
    return $ok;
}

/** Yeni sipariş bildirimi (ayarlarda e-posta varsa). Hata siparişi bozmaz. */
function magaza_siparis_epostasi(array $o): void {
    $ay = magaza_ayarlar();
    if ($ay['eposta'] === '') return;
    $tl = fn(int $n) => number_format($n, 0, ',', '.') . ' TL';
    $s = ["Yeni sipariş: {$o['no']}", 'Zaman: ' . magaza_zaman_yazi($o['zaman']), '', 'Ürünler:'];
    foreach ($o['kalemler'] as $k) $s[] = '- ' . magaza_kalem_yazi($k) . ' · ' . $tl($k['birim'] * $k['adet']);
    array_push($s, 'Toplam: ' . $tl($o['toplam']), '', 'Müşteri: ' . $o['ad'], 'Telefon: ' . magaza_tel_yazi($o['tel']));
    if ($o['not'] !== '') array_push($s, '', 'Not:', $o['not']);
    array_push($s, '', 'https://1337crewfc.com/#yonetim/siparis/' . $o['no']);
    magaza_eposta($ay['eposta'], 'Yeni sipariş ' . $o['no'], implode("\n", $s));
}
