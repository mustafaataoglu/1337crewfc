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
    $satirlar = array_slice(array_filter(explode("\n", $log)), -15);
    // Yol bilgilerini gizle
    $satirlar = array_map(fn($s) => str_replace(crew_kok(), '~', $s), $satirlar);
    $oy = 0;
    foreach (glob("$d/oylar/*.json") ?: [] as $f) $oy += count(json_decode((string)file_get_contents($f), true) ?: []);
    $durum = array_merge($eski, [
        'surum' => trim((string)@file_get_contents(crew_kok() . '/surum.txt')),
        'php' => PHP_VERSION,
        'eklentiler' => ['zip' => class_exists('ZipArchive'), 'curl' => function_exists('curl_init'), 'url_fopen' => (bool)ini_get('allow_url_fopen')],
        'sync' => json_decode((string)@file_get_contents(crew_kok() . '/data/durum-sync.json'), true),
        'oySayisi' => $oy,
        'phpHatalari' => array_values($satirlar),
        'zaman' => date('c'),
    ], $ek);
    @file_put_contents(crew_kok() . '/durum.json', json_encode($durum, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $durum;
}

/** GitHub'da yeni sürüm varsa indirip kurar. $zorla: aralık beklemeden kontrol et. */
function crew_guncelle(bool $zorla = false): array {
    $d = crew_veri_dizini();
    $kilit = fopen("$d/guncelle.lock", 'c');
    if (!$kilit || !flock($kilit, LOCK_EX | LOCK_NB)) return ['sonuc' => 'baska-islem-suruyor'];
    try {
        $son = (int)@file_get_contents("$d/son-kontrol");
        if (!$zorla && time() - $son < CREW_KONTROL_ARALIGI) return ['sonuc' => 'erken'];
        file_put_contents("$d/son-kontrol", (string)time());

        $uzak = crew_http('https://raw.githubusercontent.com/' . CREW_REPO . '/' . CREW_DAL . '/site/surum.txt?t=' . time(), 10);
        if ($uzak === null) return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'hata', 'hata' => 'GitHub surum.txt okunamadı']);
        $uzak = trim($uzak);
        $yerel = trim((string)@file_get_contents(crew_kok() . '/surum.txt'));
        if ($uzak === $yerel && !$zorla) return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'guncel']);

        $zip = crew_http('https://codeload.github.com/' . CREW_REPO . '/zip/refs/heads/' . CREW_DAL, 90);
        if ($zip === null) return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'hata', 'hata' => 'Arşiv indirilemedi']);
        $tmp = "$d/guncelleme.zip";
        file_put_contents($tmp, $zip);
        $sonuc = crew_ac($tmp);
        @unlink($tmp);
        if ($sonuc !== true) return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'hata', 'hata' => $sonuc]);
        return crew_durum_yaz(['sonKontrol' => date('c'), 'sonGuncelleme' => date('c'), 'sonuc' => 'guncellendi', 'hata' => null]);
    } catch (Throwable $e) {
        error_log('guncelle: ' . $e->getMessage());
        return crew_durum_yaz(['sonKontrol' => date('c'), 'sonuc' => 'hata', 'hata' => $e->getMessage()]);
    } finally {
        flock($kilit, LOCK_UN);
        fclose($kilit);
    }
}

/** Arşivdeki <depo>-<dal>/site/ içeriğini web köküne açar. Önce geçici klasöre, sonra yerine taşır. */
function crew_ac(string $zipYolu) {
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
    // Önce assets ve veri, en son index.html ve surum.txt yazılır (yarım güncelleme görünmesin)
    uksort($dosyalar, function ($a, $b) {
        $son = ['index.html' => 2, 'surum.txt' => 3, 'index.php' => 1];
        return ($son[$a] ?? 0) <=> ($son[$b] ?? 0) ?: strcmp($a, $b);
    });
    foreach ($dosyalar as $goreli => $i) {
        $hedef = "$kok/$goreli";
        if (!is_dir(dirname($hedef))) @mkdir(dirname($hedef), 0755, true);
        $icerik = $z->getFromIndex($i);
        if ($icerik === false || file_put_contents("$hedef.yeni", $icerik) === false || !rename("$hedef.yeni", $hedef)) {
            $z->close();
            return "Yazılamadı: $goreli";
        }
    }
    $z->close();
    // Artık kullanılmayan eski asset dosyalarını temizle
    foreach (glob("$kok/assets/*") ?: [] as $f) {
        if (!isset($dosyalar['assets/' . basename($f)])) @unlink($f);
    }
    return true;
}
