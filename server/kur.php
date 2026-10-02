<?php
// 1337crewfc.com kurulum dosyası. Web köküne yükleyip tarayıcıda bir kez açın.
// 1) Sunucuyu kontrol eder  2) Eski siteyi _eski_site/ klasörüne taşır (silmez)
// 3) Yeni siteyi GitHub'dan indirip kurar  4) Takım paneli anahtarını üretir  5) Kendini siler
const REPO = 'mustafaataoglu/1337crewfc';
const DAL = 'main';
@set_time_limit(300);
ini_set('display_errors', '0');
$kok = __DIR__;
$adimlar = [];
$tamam = true;
function adim(string $ad, bool $ok, string $not = ''): bool { global $adimlar, $tamam; $adimlar[] = [$ad, $ok, $not]; if (!$ok) $tamam = false; return $ok; }
function http_al(string $url, int $t = 90): ?string {
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => $t, CURLOPT_USERAGENT => '1337crewfc-kurulum']);
        $r = curl_exec($c); $k = curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c);
        if ($r !== false && $k >= 200 && $k < 300) return $r;
        if ($k >= 400 || !ini_get('allow_url_fopen')) return null;
    }
    $r = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => $t, 'user_agent' => '1337crewfc-kurulum']]));
    return $r === false ? null : $r;
}
$kapali = "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n";

// 1) Kontroller
adim('PHP sürümü ' . PHP_VERSION, version_compare(PHP_VERSION, '7.4', '>='), 'En az 7.4 gerekli');
adim('ZIP desteği', class_exists('ZipArchive'), 'cPanel > PHP Seçici\'den "zip" eklentisini açın');
adim('İnternet erişimi (curl veya allow_url_fopen)', function_exists('curl_init') || ini_get('allow_url_fopen'));
adim('Klasöre yazma izni', is_writable($kok));

if ($tamam) {
    // 2) Eski siteyi taşı (silme)
    $eski = "$kok/_eski_site";
    $koru = ['kur.php', '_eski_site', '_veri', 'cgi-bin', '.well-known', 'error_log'];
    $tasinan = 0;
    if (!is_dir($eski)) @mkdir($eski, 0755);
    @file_put_contents("$eski/.htaccess", $kapali);
    $yeniDosyalar = ['index.php', 'index.html', 'surum.txt', 'durum.json', '.htaccess', 'assets', 'data', 'galeri', 'api', '_sistem'];
    $ilkKurulum = !file_exists("$kok/_sistem/guncelle.php");
    foreach (scandir($kok) as $f) {
        if ($f === '.' || $f === '..' || in_array($f, $koru, true)) continue;
        if (!$ilkKurulum && in_array($f, $yeniDosyalar, true)) continue; // yeniden kurulumda yeni siteye dokunma
        if (@rename("$kok/$f", "$eski/$f")) $tasinan++;
    }
    adim('Eski site _eski_site/ klasörüne taşındı', true, "$tasinan dosya/klasör taşındı, hiçbir şey silinmedi");

    // 3) Veri klasörü ve panel anahtarı
    $veri = "$kok/_veri";
    if (!is_dir($veri)) @mkdir($veri, 0755);
    @file_put_contents("$veri/.htaccess", $kapali);
    @mkdir("$veri/oylar", 0755);
    $anahtarDosya = "$veri/panel-anahtari.txt";
    if (!file_exists($anahtarDosya)) file_put_contents($anahtarDosya, rtrim(strtr(base64_encode(random_bytes(9)), '+/', 'AB'), '='));
    $anahtar = trim((string)file_get_contents($anahtarDosya));
    adim('Veri klasörü ve panel anahtarı', is_dir($veri) && $anahtar !== '');

    // 4) Yeni siteyi indir ve aç
    $zip = http_al('https://codeload.github.com/' . REPO . '/zip/refs/heads/' . DAL);
    if (adim('Site GitHub\'dan indirildi', $zip !== null, 'GitHub\'a ulaşılamadı')) {
        $tmp = "$veri/kurulum.zip";
        file_put_contents($tmp, $zip);
        $z = new ZipArchive();
        $acildi = $z->open($tmp) === true;
        $sayi = 0; $onek = null;
        if ($acildi) {
            for ($i = 0; $i < $z->numFiles; $i++) {
                $ad = $z->getNameIndex($i);
                if ($onek === null && preg_match('#^([^/]+)/site/#', $ad, $m)) $onek = $m[1] . '/site/';
                if ($onek === null || strpos($ad, $onek) !== 0 || substr($ad, -1) === '/') continue;
                $goreli = substr($ad, strlen($onek));
                if ($goreli === '' || strpos($goreli, '..') !== false || strpos($goreli, '_veri/') === 0) continue;
                $hedef = "$kok/$goreli";
                if (!is_dir(dirname($hedef))) @mkdir(dirname($hedef), 0755, true);
                if (file_put_contents($hedef, $z->getFromIndex($i)) !== false) $sayi++;
            }
            $z->close();
        }
        @unlink($tmp);
        adim('Yeni site kuruldu', $acildi && $sayi > 5 && file_exists("$kok/index.php") && file_exists("$kok/_sistem/guncelle.php"), "$sayi dosya");
    }

    // 5) Durum dosyası
    if (file_exists("$kok/_sistem/guncelle.php")) {
        require_once "$kok/_sistem/guncelle.php";
        crew_hata_kaydi();
        $d = crew_durum_yaz(['kurulum' => date('c'), 'sonuc' => 'kuruldu']);
        adim('durum.json yazıldı', file_exists("$kok/durum.json"), 'Sürüm: ' . ($d['surum'] ?? '?'));
    }
}

$silindi = false;
if ($tamam) $silindi = @unlink(__FILE__);
?><!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>1337 Crew FC kurulum</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f3f2ec;color:#15140f;margin:0;padding:24px 16px}
.k{max-width:620px;margin:0 auto}
h1{font-size:28px;margin:0 0 4px}
ul{list-style:none;padding:0;margin:20px 0;border:1px solid #dcd9cc;border-radius:12px;background:#fff}
li{padding:12px 16px;border-top:1px solid #dcd9cc;display:flex;gap:10px}
li:first-child{border-top:0}
.ok{color:#1d7a45;font-weight:700}.no{color:#b3362b;font-weight:700}
small{display:block;color:#5d5a4e}
.anahtar{background:#f2c200;border-radius:12px;padding:16px;margin:20px 0}
.anahtar code{display:block;font-size:26px;font-weight:700;letter-spacing:.06em;margin-top:6px;user-select:all}
a.btn{display:inline-block;background:#15140f;color:#f2c200;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700}
</style></head><body><div class="k">
<h1><?= $tamam ? 'Kurulum tamamlandı' : 'Kurulum tamamlanamadı' ?></h1>
<p><?= $tamam ? 'Yeni 1337crewfc.com kuruldu. Site bundan sonra kendini GitHub\'dan otomatik güncelleyecek.' : 'Aşağıdaki kırmızı adımın ekran görüntüsünü gönderin, düzelteyim. Bu dosya silinmedi; düzeltmeden sonra sayfayı yenileyerek tekrar deneyebilirsiniz.' ?></p>
<ul><?php foreach ($adimlar as [$ad, $ok, $not]): ?>
<li><span class="<?= $ok ? 'ok' : 'no' ?>"><?= $ok ? '✓' : '✗' ?></span><span><?= htmlspecialchars($ad) ?><?php if ($not): ?><small><?= htmlspecialchars($not) ?></small><?php endif ?></span></li>
<?php endforeach ?></ul>
<?php if ($tamam && !empty($anahtar)): ?>
<div class="anahtar"><b>Takım paneli anahtarı</b> — Senin 11'in sayfasındaki takım paneline bu anahtarla girilir. Bir yere not edin ve sadece takım içinde paylaşın. Bu ekran bir daha gösterilmeyecek.
<code><?= htmlspecialchars($anahtar) ?></code></div>
<p><?= $silindi ? 'Güvenlik için kur.php kendini sildi.' : 'Not: kur.php silinemedi, cPanel Dosya Yöneticisi\'nden silebilirsiniz.' ?></p>
<p><a class="btn" href="./">Siteyi aç</a></p>
<?php endif ?>
</div></body></html>
