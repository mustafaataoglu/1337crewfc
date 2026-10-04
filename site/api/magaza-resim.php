<?php
// Mağaza ürün fotoğrafı: GET ?id=<16 hex>.jpg|png|webp. Yalnızca rastgele kimlik kabul edilir, yol asla.
// Dosyalar web'e kapalı _veri/magaza/resim/ altında; adı değişmediği için tarayıcıda süresiz saklanabilir.
$id = $_GET['id'] ?? '';
$turler = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
$yontem = $_SERVER['REQUEST_METHOD'] ?? '';
$dosya = is_string($id) && preg_match('/^[a-f0-9]{16}\.(jpg|png|webp)$/D', $id, $m) ? dirname(__DIR__) . "/_veri/magaza/resim/$id" : null;
if (($yontem !== 'GET' && $yontem !== 'HEAD') || $dosya === null || !is_file($dosya)) {
    http_response_code(404);
    header('Cache-Control: no-store');
    exit;
}
header('Content-Type: ' . $turler[$m[1]]);
header('Content-Length: ' . filesize($dosya));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=31536000, immutable');
header("Content-Security-Policy: default-src 'none'");
if ($yontem === 'GET') readfile($dosya);
