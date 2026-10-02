<?php
// GitHub yeni sürüm gönderdiğinde buraya haber verir; site ziyaretçi beklemeden kendini günceller.
// Gizli bilgi gerektirmez: en kötü ihtimalle dakikada bir GitHub'daki son sürüm kontrol edilir.
require dirname(__DIR__) . '/_sistem/guncelle.php';
crew_hata_kaydi();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-LiteSpeed-Cache-Control: no-cache');
$d = crew_guncelle(true);
echo json_encode(['sonuc' => $d['sonuc'] ?? null, 'surum' => $d['surum'] ?? trim((string)@file_get_contents(dirname(__DIR__) . '/surum.txt')), 'hata' => $d['hata'] ?? null], JSON_UNESCAPED_UNICODE);
