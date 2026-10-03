<?php
// Taraftarın maçın oyuncusu oylaması: maç bitince (sonuç girilince) açılır, başlama saatinden 3 gün sonra kapanır.
// Adaylar o maçta 1337 kadrosunda (ilk 11 ya da yedek) olanlar. Cihaz başına maç başına tek oy (tekrar gönderim günceller).
// POST: {mac, oyuncu, cihaz}
// GET ?mac=..  (X-Cihaz başlığı): oylama sürerken sonuçları oy veren görür, kapanınca herkes görür.
require dirname(__DIR__) . '/_sistem/taraftar.php';
crew_hata_kaydi();
const MVP_SURE_GUN = 3;

$post = $_SERVER['REQUEST_METHOD'] === 'POST';
$g = $post ? json_decode((string)file_get_contents('php://input'), true) : null;
if ($post && !is_array($g)) crew_json_cevap(['ok' => false, 'hata' => 'Geçersiz istek'], 400);
$mac = (string)($post ? ($g['mac'] ?? '') : ($_GET['mac'] ?? ''));
$m = crew_mac($mac);
if (!$m) crew_json_cevap(['ok' => false, 'hata' => 'Maç bulunamadı'], 404);

$adaylar = array_values(array_unique(array_merge($m['lineup']['xi'] ?? [], $m['lineup']['subs'] ?? [])));
$bitti = ($m['status'] ?? '') === 'done' && empty($m['forfeit']) && count($adaylar) > 0;
$kapanis = (clone crew_baslama($m))->modify('+' . MVP_SURE_GUN . ' days');
$acik = $bitti && crew_simdi() < $kapanis;
$dosya = crew_mac_dosyasi(crew_tur_dizini('mvp'), $m);

if ($post) {
    if (!$bitti) crew_json_cevap(['ok' => false, 'hata' => 'Oylama maç bitince açılır'], 409);
    if (!$acik) crew_json_cevap(['ok' => false, 'hata' => 'Bu maç için oylama kapandı'], 409);
    $cihaz = crew_cihaz($g['cihaz'] ?? '');
    if (!$cihaz) crew_json_cevap(['ok' => false, 'hata' => 'Geçersiz cihaz'], 400);
    $oyuncu = (string)($g['oyuncu'] ?? '');
    if (!in_array($oyuncu, $adaylar, true)) crew_json_cevap(['ok' => false, 'hata' => 'Bu oyuncu maçın kadrosunda yok'], 400);
    $ip = crew_ip((string)($m['eid'] ?? $mac));
    $r = crew_kilitli_guncelle($dosya, function (array $k) use ($cihaz, $oyuncu, $ip) {
        if (crew_ag_dolu($k, $ip, $cihaz)) return 'Bu ağdan çok fazla oy geldi';
        $k[$cihaz] = ['oyuncu' => $oyuncu, 'ip' => $ip, 'zaman' => date('c')];
        return $k;
    });
    if (!is_array($r)) crew_json_cevap(['ok' => false, 'hata' => $r], 429);
    crew_json_cevap(['ok' => true, 'toplam' => count($r)]);
}

$oylar = json_decode((string)@file_get_contents($dosya), true) ?: [];
$cihaz = crew_cihaz($_SERVER['HTTP_X_CIHAZ'] ?? '');
$benim = $cihaz && isset($oylar[$cihaz]) ? $oylar[$cihaz]['oyuncu'] : null;
$durum = ['bitti' => $bitti, 'acik' => $acik, 'kapanis' => $kapanis->format('c'), 'toplam' => count($oylar), 'benim' => $benim];
if ($acik && !$benim) crew_json_cevap(['ok' => true, 'kilitli' => true] + $durum);
$say = [];
foreach ($oylar as $o) $say[$o['oyuncu']] = ($say[$o['oyuncu']] ?? 0) + 1;
arsort($say);
crew_json_cevap(['ok' => true, 'kilitli' => false, 'oyuncular' => $say ?: new stdClass()] + $durum);
