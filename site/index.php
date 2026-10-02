<?php
// Sayfayı hemen gönderir; ardından (5 dakikada bir) GitHub'da yeni sürüm var mı diye bakar.
// Güncelleyici bozuk gelse bile sayfa önce gönderildiği için site açık kalır.
$sayfa = @file_get_contents(__DIR__ . '/index.html');
if ($sayfa === false) {
    http_response_code(503);
    $sayfa = '<!doctype html><meta charset="utf-8"><title>1337 Crew FC</title><p style="font-family:system-ui;padding:24px">Site güncelleniyor, birkaç dakika sonra tekrar deneyin.</p>';
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
header('Content-Length: ' . strlen($sayfa));
header('Connection: close');
header('X-LiteSpeed-Cache-Control: no-cache');
echo $sayfa;

// Ziyaretçiyi bekletmeden bağlantıyı kapat, kontrolü arka planda yap
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
else { while (ob_get_level() > 0) @ob_end_flush(); @flush(); }

try {
    require_once __DIR__ . '/_sistem/guncelle.php';
    crew_hata_kaydi();
    crew_guncelle(!file_exists(__DIR__ . '/index.html'));
} catch (Throwable $e) {
    // Güncelleyici bozuksa (ör. hatalı sürüm) sayfa yine açık kalır; hatayı kaydet
    @file_put_contents(__DIR__ . '/_veri/kurtarma.log', date('c') . ' ' . $e->getMessage() . "\n", FILE_APPEND);
}
