<?php
// 1337crewfc.com kendi kendini güncelleme sistemi.
// GitHub'daki site/surum.txt değişince deponun site/ klasörünü indirip web köküne açar.
// Durumu herkese açık durum.json'a yazar (gizli bilgi içermez).

const CREW_REPO = 'mustafaataoglu/1337crewfc';
const CREW_DAL = 'main';
const CREW_KONTROL_ARALIGI = 300; // saniye
const CREW_KAPALI_HTACCESS = "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n";

function crew_kok(): string { return dirname(__DIR__); }
function crew_veri_dizini(): string {
    $d = crew_kok() . '/_veri';
    if (!is_dir($d)) @mkdir($d, 0755, true);
    if (!file_exists("$d/.htaccess")) @file_put_contents("$d/.htaccess", CREW_KAPALI_HTACCESS);
    return $d;
}

function crew_hata_kaydi(): void {
    $log = crew_veri_dizini() . '/php-hata.log';
    ini_set('log_errors', '1');
    ini_set('error_log', $log);
    ini_set('display_errors', '0');
    // Günlük 200 KB'ı geçerse kırp
    if (@filesize($log) > 200000) @file_put_contents($log, substr((string)@file_get_contents($log), -50000));
}

function crew_http(string $url, int $timeout = 20): ?string {
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_USERAGENT => '1337crewfc-guncelleyici']);
        $r = curl_exec($c);
        $kod = curl_getinfo($c, CURLINFO_HTTP_CODE);
        $hata = curl_error($c);
        curl_close($c);
        if ($r !== false && $kod >= 200 && $kod < 300) return $r;
        if ($kod >= 400) return null; // sunucu cevap verdi ama hata: ikinci yöntemi deneme
        if ($hata) error_log("curl: $url → $hata");
        if (!ini_get('allow_url_fopen')) return null;
    }
    $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'user_agent' => '1337crewfc-guncelleyici', 'ignore_errors' => false]]);
    $r = @file_get_contents($url, false, $ctx);
    return $r === false ? null : $r;
}

function crew_durum_yaz(array $ek = []): array {
    $d = crew_veri_dizini();
    $eski = json_decode((string)@file_get_contents(crew_kok() . '/durum.json'), true) ?: [];
    $log = (string)@file_get_contents("$d/php-hata.log");
    $satirlar = array_slice(array_filter(explode("\n", $log)), -10);
    // Yol ve kullanıcı bilgilerini gizle
    $satirlar = array_map(fn($s) => preg_replace('#/home\d*/[^/\s]+#', '~', str_replace(crew_kok(), '~', $s)), $satirlar);
    $oy = 0;
    foreach (glob("$d/oylar/*.json") ?: [] as $f) $oy += count(json_decode((string)file_get_contents($f), true) ?: []);
    $durum = array_merge($eski, ['hata' => null], [
        'surum' => trim((string)@file_get_contents(crew_kok() . '/surum.txt')),
        'php' => PHP_VERSION,
        'eklentiler' => ['zip' => class_exists('ZipArchive'), 'curl' => function_exists('curl_init'), 'url_fopen' => (bool)ini_get('allow_url_fopen'), 'gd' => function_exists('imagecreatefromstring')],
        'sync' => json_decode((string)@file_get_contents(crew_kok() . '/data/durum-sync.json'), true),
        'oySayisi' => $oy,
        'phpHatalari' => array_values($satirlar),
        'zaman' => date('c'),
    ], $ek);
    @file_put_contents(crew_kok() . '/durum.json', json_encode($durum, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $durum;
}

/** Eski WordPress klasörü dışarıya kapalı olmalı. Taşınan WordPress .htaccess'i koruma dosyasını ezmişse düzelt. */
function crew_eski_siteyi_kapat(): void {
    $e = crew_kok() . '/_eski_site';
    if (!is_dir($e)) return;
    $h = "$e/.htaccess";
    $mevcut = (string)@file_get_contents($h);
    if ($mevcut === CREW_KAPALI_HTACCESS) return;
    if ($mevcut !== '' && !file_exists("$e/eski.htaccess")) @rename($h, "$e/eski.htaccess");
    @file_put_contents($h, CREW_KAPALI_HTACCESS);
}

/** GitHub'da yeni sürüm varsa indirip kurar. $zorla: aralık beklemeden kontrol et. */
function crew_guncelle(bool $zorla = false): array {
    @set_time_limit(180);
    $d = crew_veri_dizini();
    $kilit = fopen("$d/guncelle.lock", 'c');
    if (!$kilit || !flock($kilit, LOCK_EX | LOCK_NB)) return ['sonuc' => 'baska-islem-suruyor'];
    try {
        crew_eski_siteyi_kapat();
        $son = (int)@file_get_contents("$d/son-kontrol");
        // Zorla modunda bile en fazla dakikada bir dene (GitHub kapalıyken her ziyaret indirmesin)
        if (time() - $son < ($zorla ? 60 : CREW_KONTROL_ARALIGI)) return ['sonuc' => 'erken'];
        file_put_contents("$d/son-kontrol", (string)time());

        $yerel = trim((string)@file_get_contents(crew_kok() . '/surum.txt'));
        // Zorla (GitHub'dan gelen "güncellen" sinyali): raw önbelleği gecikebileceği için doğrudan arşive bak
        if ($zorla) return crew_arsivden($d, $yerel);
        $uzak = crew_http('https://raw.githubusercontent.com/' . CREW_REPO . '/' . CREW_DAL . '/site/surum.txt?t=' . time(), 10);
        if ($uzak === null) return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'hata', 'hata' => 'GitHub surum.txt okunamadı']);
        $uzak = trim($uzak);
        if (!preg_match('/^[0-9a-f]{12}$/', $uzak)) return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'hata', 'hata' => 'GitHub beklenmeyen cevap verdi']);
        if ($uzak === $yerel) return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'guncel']);
        return crew_arsivden($d, $yerel);
    } catch (Throwable $e) {
        error_log('guncelle: ' . $e->getMessage());
        return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'hata', 'hata' => $e->getMessage()]);
    } finally {
        flock($kilit, LOCK_UN);
        fclose($kilit);
    }
}

/** Ana dalın arşivini indirip site/ klasörünü açar; arşivdeki sürüm yereldekiyle aynıysa dokunmaz */
function crew_arsivden(string $d, string $yerel): array {
        $zip = crew_http('https://codeload.github.com/' . CREW_REPO . '/zip/refs/heads/' . CREW_DAL, 90);
        if ($zip === null) return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'hata', 'hata' => 'Arşiv indirilemedi']);
        $tmp = "$d/guncelleme.zip";
        file_put_contents($tmp, $zip);
        $sonuc = crew_ac($tmp, $yerel);
        @unlink($tmp);
        if ($sonuc === 'ayni') return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'guncel']);
        if ($sonuc !== true) return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'hata', 'hata' => $sonuc]);
        return crew_durum_yaz(['sonKontrol' => date('c'), 'sonGuncelleme' => date('c'), 'sonuc' => 'guncellendi', 'hata' => null]);
}

/** Arşivdeki <depo>-<dal>/site/ içeriğini web köküne açar. Önce geçici klasöre, sonra yerine taşır. */
function crew_ac(string $zipYolu, string $yerel = '') {
    if (!class_exists('ZipArchive')) return 'Sunucuda ZipArchive yok';
    $z = new ZipArchive();
    if ($z->open($zipYolu) !== true) return 'Arşiv açılamadı';
    $kok = crew_kok();
    $onek = null;
    $dosyalar = [];
    for ($i = 0; $i < $z->numFiles; $i++) {
        $ad = $z->getNameIndex($i);
        if ($onek === null && preg_match('#^([^/]+)/site/#', $ad, $m)) $onek = $m[1] . '/site/';
        if ($onek !== null && strpos($ad, $onek) === 0 && substr($ad, -1) !== '/') {
            $goreli = substr($ad, strlen($onek));
            if ($goreli === '' || strpos($goreli, '..') !== false || strpos($goreli, '_veri/') === 0) continue;
            $dosyalar[$goreli] = $i;
        }
    }
    if (!$dosyalar || !isset($dosyalar['index.html']) || !isset($dosyalar['surum.txt'])) { $z->close(); return 'Arşivde site/ eksik'; }
    if ($yerel !== '' && trim((string)$z->getFromIndex($dosyalar['surum.txt'])) === $yerel) { $z->close(); return 'ayni'; }
    // Önce assets ve veri, en son index.html ve surum.txt yazılır (yarım güncelleme görünmesin)
    uksort($dosyalar, function ($a, $b) {
        $son = ['index.html' => 2, 'surum.txt' => 3, 'index.php' => 1];
        return ($son[$a] ?? 0) <=> ($son[$b] ?? 0) ?: strcmp($a, $b);
    });
    foreach ($dosyalar as $goreli => $i) {
        $hedef = "$kok/$goreli";
        if (!is_dir(dirname($hedef))) @mkdir(dirname($hedef), 0755, true);
        $icerik = $z->getFromIndex($i);
        // Kurulumda korunan cPanel PHP işleyici satırları her güncellemede .htaccess'in başında kalır
        if ($goreli === '.htaccess' && $icerik !== false) $icerik = (string)@file_get_contents(crew_veri_dizini() . '/php-isleyici.txt') . $icerik;
        if ($icerik === false || file_put_contents("$hedef.yeni", $icerik) === false || !rename("$hedef.yeni", $hedef)) {
            $z->close();
            return "Yazılamadı: $goreli";
        }
    }
    $z->close();
    // Artık kullanılmayan eski asset dosyalarını temizle (açık sekmeler eski parçaları isteyebilir: 7 gün bekle)
    foreach (glob("$kok/assets/*") ?: [] as $f) {
        if (!isset($dosyalar['assets/' . basename($f)]) && time() - (int)@filemtime($f) > 7 * 86400) @unlink($f);
    }
    return true;
}
