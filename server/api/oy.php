<?php
// Senin 11'in oylaması.
// POST: {mac, dizilis, xi:[{slot,g,oyuncu}], cihaz}  -> cihaz başına maç başına tek oy (tekrar gönderim günceller)
// GET ?mac=..&anahtar=..                              -> takım paneli sonuçları (panel anahtarı gerekir)
require dirname(__DIR__) . '/_sistem/guncelle.php';
crew_hata_kaydi();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function cevap(array $j, int $kod = 200): void { http_response_code($kod); echo json_encode($j, JSON_UNESCAPED_UNICODE); exit; }

$veri = json_decode((string)@file_get_contents(dirname(__DIR__) . '/data/veri.json'), true);
if (!$veri) cevap(['ok' => false, 'hata' => 'Veri yüklenemedi'], 503);
$dizin = crew_veri_dizini() . '/oylar';
if (!is_dir($dizin)) @mkdir($dizin, 0755, true);

$mac = (string)($_GET['mac'] ?? '');
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $g = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($g)) cevap(['ok' => false, 'hata' => 'Geçersiz istek'], 400);
    $mac = (string)($g['mac'] ?? '');
}
if (!preg_match('/^[A-Za-z0-9._-]{5,120}$/', $mac)) cevap(['ok' => false, 'hata' => 'Geçersiz maç'], 400);
$m = null;
foreach ($veri['matches'] as $x) if ($x['id'] === $mac) { $m = $x; break; }
if (!$m) cevap(['ok' => false, 'hata' => 'Maç bulunamadı'], 404);
$dosya = "$dizin/" . md5($mac) . '.json';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Maç saatinde (İstanbul) oylama kapanır
    $saat = new DateTime($m['date'] . ' ' . ($m['time'] ?: '21:00'), new DateTimeZone('Europe/Istanbul'));
    if (new DateTime('now', new DateTimeZone('Europe/Istanbul')) >= $saat || $m['status'] === 'done') cevap(['ok' => false, 'hata' => 'Bu maç için oylama kapandı'], 409);

    $cihaz = (string)($g['cihaz'] ?? '');
    if (!preg_match('/^[A-Za-z0-9-]{8,64}$/', $cihaz)) cevap(['ok' => false, 'hata' => 'Geçersiz cihaz'], 400);
    $dizilis = (string)($g['dizilis'] ?? '');
    // Her dizilişte kaleci/defans/orta saha/forvet slot sayıları (arayüzdeki dizilişlerle aynı)
    $SLOT = ['4-2-3-1' => [1, 4, 5, 1], '4-3-3' => [1, 4, 3, 3], '4-4-2' => [1, 4, 4, 2], '3-5-2' => [1, 3, 5, 2], '3-4-3' => [1, 3, 4, 3], '5-3-2' => [1, 5, 3, 2]];
    if (!isset($SLOT[$dizilis])) cevap(['ok' => false, 'hata' => 'Geçersiz diziliş'], 400);
    $kadro = [];
    foreach ($veri['players'] as $p) if (empty($p['former'])) $kadro[$p['slug']] = $p['pos'];
    $xi = is_array($g['xi'] ?? null) ? $g['xi'] : [];
    $secim = [];
    $sira = []; // dizilişteki slot sırasıyla oyuncular (sahada nereye konduğu)
    foreach ($xi as $s) {
        $o = (string)($s['oyuncu'] ?? '');
        $gr = (string)($s['g'] ?? '');
        if (!isset($kadro[$o]) || !in_array($gr, ['K', 'S', 'O', 'F'], true) || isset($secim[$o])) cevap(['ok' => false, 'hata' => 'Geçersiz oyuncu seçimi'], 400);
        $secim[$o] = $gr;
        $sira[] = $o;
    }
    if (count($secim) !== 11) cevap(['ok' => false, 'hata' => '11 oyuncu seçmelisin'], 400);
    $say = array_count_values(array_values($secim));
    if ([$say['K'] ?? 0, $say['S'] ?? 0, $say['O'] ?? 0, $say['F'] ?? 0] !== $SLOT[$dizilis]) cevap(['ok' => false, 'hata' => 'Kadro dizilişe uymuyor'], 400);

    // IPv6 adresleri /64 ağına göre say (aynı cihaz her istekte farklı adres alabilir)
    $adres = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    if (strpos($adres, ':') !== false) $adres = implode(':', array_slice(explode(':', (string)@inet_ntop((string)@inet_pton($adres))), 0, 4));
    $ip = hash('sha256', $adres . '|' . $mac);
    $kilit = fopen("$dosya.lock", 'c');
    flock($kilit, LOCK_EX);
    $oylar = json_decode((string)@file_get_contents($dosya), true) ?: [];
    $c = hash('sha256', $cihaz);
    // Aynı ağdan en fazla 25 farklı cihaz (mobil operatörlerde çok kişi aynı IP'yi paylaşır)
    $ayniIp = 0;
    foreach ($oylar as $k => $o) if (($o['ip'] ?? '') === $ip && $k !== $c) $ayniIp++;
    if ($ayniIp >= 25) { flock($kilit, LOCK_UN); fclose($kilit); cevap(['ok' => false, 'hata' => 'Bu ağdan çok fazla oy geldi'], 429); }
    $oylar[$c] = ['dizilis' => $dizilis, 'xi' => $secim, 'sira' => $sira, 'ip' => $ip, 'zaman' => date('c')];
    // Önce geçici dosyaya yaz, sonra yerine koy: yazma yarıda kalırsa eski oylar kaybolmaz
    $yazildi = file_put_contents("$dosya.yeni", json_encode($oylar)) !== false && rename("$dosya.yeni", $dosya);
    flock($kilit, LOCK_UN); fclose($kilit);
    if (!$yazildi) cevap(['ok' => false, 'hata' => 'Oy kaydedilemedi, tekrar dene'], 500);
    cevap(['ok' => true, 'toplam' => count($oylar)]);
}

// Sonuçlar: panel anahtarı gerekir
$anahtar = (string)@file_get_contents(crew_veri_dizini() . '/panel-anahtari.txt');
if ($anahtar === '' || !hash_equals(trim($anahtar), (string)($_SERVER['HTTP_X_PANEL_ANAHTAR'] ?? $_GET['anahtar'] ?? ''))) cevap(['ok' => false, 'hata' => 'Anahtar geçersiz'], 403);
$oylar = json_decode((string)@file_get_contents($dosya), true) ?: [];
$sonuc = ['toplam' => count($oylar), 'dizilisler' => [], 'oyuncular' => [], 'mevkiler' => [], 'slotlar' => [], 'oylar' => []];
foreach ($oylar as $o) {
    $sonuc['dizilisler'][$o['dizilis']] = ($sonuc['dizilisler'][$o['dizilis']] ?? 0) + 1;
    // Her dizilişte her slota kimin konduğu (taraftarın 11'ini sahada çizmek için)
    foreach ($o['sira'] ?? [] as $i => $slug) $sonuc['slotlar'][$o['dizilis']][$i][$slug] = ($sonuc['slotlar'][$o['dizilis']][$i][$slug] ?? 0) + 1;
    // Tek tek oylar: kim verdiği yok, sadece diziliş, 11 ve saat
    $sonuc['oylar'][] = ['dizilis' => $o['dizilis'], 'zaman' => $o['zaman'] ?? '', 'sira' => $o['sira'] ?? array_keys($o['xi'])];
    foreach ($o['xi'] as $slug => $gr) {
        $sonuc['oyuncular'][$slug] = ($sonuc['oyuncular'][$slug] ?? 0) + 1;
        $sonuc['mevkiler'][$gr][$slug] = ($sonuc['mevkiler'][$gr][$slug] ?? 0) + 1;
    }
}
usort($sonuc['oylar'], fn($a, $b) => strcmp($b['zaman'], $a['zaman']));
$sonuc['oylar'] = array_slice($sonuc['oylar'], 0, 100);
if (!$sonuc['slotlar']) $sonuc['slotlar'] = new stdClass();
cevap(['ok' => true, 'sonuc' => $sonuc]);
