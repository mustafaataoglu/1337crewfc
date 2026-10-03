<?php
// Skor tahmini ve tahmin ligi.
// POST {mac, ev, dep, ad, cihaz}: maç başlayana kadar tahmin (tekrar gönderim günceller). ad: takma ad (liste için).
// GET ?mac=.. (X-Cihaz): bu cihazın tahmini; tahmin verince ya da maç başlayınca taraftarın tahmin dağılımı.
// GET ?lig=1  (X-Cihaz): tahmin ligi — tam skor 3 puan, doğru sonuç (galibiyet/beraberlik/mağlubiyet) 1 puan.
require dirname(__DIR__) . '/_sistem/taraftar.php';
crew_hata_kaydi();
$dizin = crew_tur_dizini('tahmin');

/** Takma ad: 2-20 karakter, harf/rakam/boşluk/._- ; küfür içermez */
function crew_takma_ad(string $ad): ?string {
    $ad = trim(preg_replace('/\s+/u', ' ', $ad));
    $n = preg_match_all('/./u', $ad);
    if ($n < 2 || $n > 20 || !preg_match('/^[\p{L}\p{N} ._-]+$/u', $ad)) return null;
    $k = strtr(function_exists('mb_strtolower') ? mb_strtolower($ad, 'UTF-8') : strtolower($ad), ['ı' => 'i', 'ş' => 's', 'ğ' => 'g', 'ü' => 'u', 'ö' => 'o', 'ç' => 'c', ' ' => '', '.' => '', '_' => '', '-' => '']);
    foreach (['amk', 'aq', 'sik', 'yarrak', 'orospu', 'pic', 'pezevenk', 'gavat', 'ibne', 'got', 'amcik', 'kahpe', 'siktir', 'yavsak', 'serefsiz', 'admin', 'yonetici'] as $y) {
        if (strpos($k, $y) !== false) return null;
    }
    return $ad;
}
$sonucu = fn(int $a, int $b) => $a > $b ? 'G' : ($a < $b ? 'M' : 'B');

if (isset($_GET['lig'])) {
    $puan = [];
    $veri = crew_veri();
    $maclar = [];
    foreach ($veri['matches'] ?? [] as $m) $maclar[md5((string)($m['eid'] ?? $m['id']))] = $m;
    foreach (glob("$dizin/*.json") ?: [] as $f) {
        $m = $maclar[basename($f, '.json')] ?? null;
        if (!$m || ($m['status'] ?? '') !== 'done' || !is_numeric($m['home']['score'] ?? null) || !is_numeric($m['away']['score'] ?? null) || !empty($m['forfeit'])) continue;
        $h = (int)$m['home']['score']; $a = (int)$m['away']['score'];
        foreach (json_decode((string)file_get_contents($f), true) ?: [] as $c => $t) {
            $p = &$puan[$c];
            $p ??= ['puan' => 0, 'tahmin' => 0, 'tam' => 0, 'dogru' => 0, 'ad' => '', 'zaman' => ''];
            $p['tahmin']++;
            if ((int)$t['ev'] === $h && (int)$t['dep'] === $a) { $p['puan'] += 3; $p['tam']++; }
            elseif ($sonucu((int)$t['ev'], (int)$t['dep']) === $sonucu($h, $a)) { $p['puan'] += 1; $p['dogru']++; }
            // listede cihazın en son kullandığı takma ad görünür
            if (strcmp($t['zaman'] ?? '', $p['zaman']) > 0) { $p['ad'] = $t['ad'] ?? ''; $p['zaman'] = $t['zaman'] ?? ''; }
            unset($p);
        }
    }
    uasort($puan, fn($x, $y) => [$y['puan'], $y['tam'], $x['tahmin']] <=> [$x['puan'], $x['tam'], $y['tahmin']]);
    $liste = [];
    $ben = null;
    $cihaz = crew_cihaz($_SERVER['HTTP_X_CIHAZ'] ?? '');
    $sira = 0;
    foreach ($puan as $c => $p) {
        $sira++;
        $satir = ['sira' => $sira, 'ad' => $p['ad'], 'puan' => $p['puan'], 'tahmin' => $p['tahmin'], 'tam' => $p['tam'], 'dogru' => $p['dogru']];
        if ($c === $cihaz) $ben = $satir;
        if ($sira <= 50) $liste[] = $satir + ['ben' => $c === $cihaz];
    }
    crew_json_cevap(['ok' => true, 'liste' => $liste, 'ben' => $ben, 'oyuncu' => count($puan)]);
}

$post = $_SERVER['REQUEST_METHOD'] === 'POST';
$g = $post ? json_decode((string)file_get_contents('php://input'), true) : null;
if ($post && !is_array($g)) crew_json_cevap(['ok' => false, 'hata' => 'Geçersiz istek'], 400);
$mac = (string)($post ? ($g['mac'] ?? '') : ($_GET['mac'] ?? ''));
$m = crew_mac($mac);
if (!$m) crew_json_cevap(['ok' => false, 'hata' => 'Maç bulunamadı'], 404);
$basladi = crew_simdi() >= crew_baslama($m) || ($m['status'] ?? '') === 'done';
$dosya = crew_mac_dosyasi($dizin, $m);

if ($post) {
    if ($basladi) crew_json_cevap(['ok' => false, 'hata' => 'Maç başladı, tahminler kapandı'], 409);
    $cihaz = crew_cihaz($g['cihaz'] ?? '');
    if (!$cihaz) crew_json_cevap(['ok' => false, 'hata' => 'Geçersiz cihaz'], 400);
    $ev = $g['ev'] ?? null; $dep = $g['dep'] ?? null;
    if (!is_int($ev) || !is_int($dep) || $ev < 0 || $dep < 0 || $ev > 30 || $dep > 30) crew_json_cevap(['ok' => false, 'hata' => 'Geçersiz skor'], 400);
    $ad = crew_takma_ad((string)($g['ad'] ?? ''));
    if ($ad === null) crew_json_cevap(['ok' => false, 'hata' => 'Takma ad 2-20 karakter olmalı (harf, rakam, boşluk); uygunsuz kelime içermemeli'], 400);
    $ip = crew_ip((string)($m['eid'] ?? $mac));
    $r = crew_kilitli_guncelle($dosya, function (array $k) use ($cihaz, $ev, $dep, $ad, $ip) {
        if (crew_ag_dolu($k, $ip, $cihaz)) return 'Bu ağdan çok fazla tahmin geldi';
        $k[$cihaz] = ['ev' => $ev, 'dep' => $dep, 'ad' => $ad, 'ip' => $ip, 'zaman' => date('c')];
        return $k;
    });
    if (!is_array($r)) crew_json_cevap(['ok' => false, 'hata' => $r], 429);
    crew_json_cevap(['ok' => true, 'toplam' => count($r)]);
}

$tahminler = json_decode((string)@file_get_contents($dosya), true) ?: [];
$cihaz = crew_cihaz($_SERVER['HTTP_X_CIHAZ'] ?? '');
$benim = $cihaz && isset($tahminler[$cihaz]) ? ['ev' => $tahminler[$cihaz]['ev'], 'dep' => $tahminler[$cihaz]['dep'], 'ad' => $tahminler[$cihaz]['ad']] : null;
$cevap = ['ok' => true, 'basladi' => $basladi, 'toplam' => count($tahminler), 'benim' => $benim];
// Dağılım: tahmin verene ya da maç başlayınca (önceden görülürse çoğunluğa uyulur)
if ($benim || $basladi) {
    $sonuc = ['G' => 0, 'B' => 0, 'M' => 0];
    $skor = [];
    foreach ($tahminler as $t) {
        $sonuc[$sonucu((int)$t['ev'], (int)$t['dep'])]++;
        $s = $t['ev'] . '-' . $t['dep'];
        $skor[$s] = ($skor[$s] ?? 0) + 1;
    }
    arsort($skor);
    // G/B/M ev sahibine göre; arayüz 1337'ye göre çevirir
    $cevap['dagilim'] = ['ev' => $sonuc['G'], 'beraber' => $sonuc['B'], 'dep' => $sonuc['M'], 'skorlar' => array_slice($skor, 0, 5, true) ?: new stdClass()];
}
crew_json_cevap($cevap);
