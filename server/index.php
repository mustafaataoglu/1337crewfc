<?php
// Sayfayı hemen gönderir; ardından (5 dakikada bir) GitHub'da yeni sürüm var mı diye bakar.
require __DIR__ . '/_sistem/guncelle.php';
crew_hata_kaydi();

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
$sayfa = @file_get_contents(__DIR__ . '/index.html');
if ($sayfa === false) {
    http_response_code(503);
    echo '<!doctype html><meta charset="utf-8"><title>1337 Crew FC</title><p style="font-family:system-ui;padding:24px">Site güncelleniyor, birkaç dakika sonra tekrar deneyin.</p>';
    crew_guncelle(true);
    exit;
}
echo $sayfa;

// Ziyaretçiyi bekletmeden bağlantıyı kapat, kontrolü arka planda yap
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
else { @ob_end_flush(); @flush(); }
crew_guncelle();
