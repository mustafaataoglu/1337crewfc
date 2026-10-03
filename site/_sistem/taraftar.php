<?php
// Taraftar etkileşimlerinin (maçın oyuncusu oylaması, skor tahmini) ortak yardımcıları.
// Kimlik yok: cihaz kimliği tarayıcının ürettiği rastgele bir değerdir, sunucu yalnızca özetini (sha256) saklar.
require_once __DIR__ . '/guncelle.php';

function crew_json_cevap(array $j, int $kod = 200): void {
    http_response_code($kod);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($j, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Sitenin güncel verisi (maçlar, oyuncular) */
function crew_veri(): array {
    static $v = null;
    if ($v === null) $v = json_decode((string)@file_get_contents(crew_kok() . '/data/veri.json'), true) ?: [];
    if (!$v) crew_json_cevap(['ok' => false, 'hata' => 'Veri yüklenemedi'], 503);
    return $v;
}

function crew_mac(string $id): ?array {
    if (!preg_match('/^[A-Za-z0-9._-]{5,120}$/', $id)) return null;
    foreach (crew_veri()['matches'] ?? [] as $m) if (($m['id'] ?? '') === $id) return $m;
    return null;
}

/** Maçın başlama anı (İstanbul saati) */
function crew_baslama(array $m): DateTime {
    $saat = preg_match('/^\d\d:\d\d$/', (string)($m['time'] ?? '')) ? $m['time'] : '21:00';
    return new DateTime($m['date'] . ' ' . $saat, new DateTimeZone('Europe/Istanbul'));
}
function crew_simdi(): DateTime { return new DateTime('now', new DateTimeZone('Europe/Istanbul')); }

/** Geçerli cihaz kimliğinin özeti; geçersizse null */
function crew_cihaz(?string $c): ?string {
    $c = (string)$c;
    return preg_match('/^[A-Za-z0-9-]{8,64}$/', $c) ? hash('sha256', $c) : null;
}

/** IP (IPv6'da /64 ağı) + maç özeti: aynı ağdan çok cihaz sınırı için */
function crew_ip(string $mac): string {
    $adres = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    if (strpos($adres, ':') !== false) $adres = implode(':', array_slice(explode(':', (string)@inet_ntop((string)@inet_pton($adres))), 0, 4));
    return hash('sha256', $adres . '|' . $mac);
}

/**
 * Maçın kayıt dosyası: EfendiLig'in kalıcı kimliğiyle (eid). Maç adresi (id) tarih-saati içerir ve saat değişince
 * değişir; o yüzden adresle kaydedilmiş eski dosya varsa bir kez kalıcı adlı dosyaya taşınır.
 */
function crew_mac_dosyasi(string $dizin, array $m): string {
    $kalici = "$dizin/" . md5((string)($m['eid'] ?? $m['id'])) . '.json';
    $eski = "$dizin/" . md5((string)$m['id']) . '.json';
    if ($kalici !== $eski && !file_exists($kalici) && file_exists($eski)) @rename($eski, $kalici);
    return $kalici;
}

function crew_tur_dizini(string $tur): string {
    $d = crew_veri_dizini() . '/' . $tur;
    if (!is_dir($d)) @mkdir($d, 0755, true);
    return $d;
}

/**
 * Kilitli oku-değiştir-yaz: $fn(array $kayit): array|string — dizi dönerse yazılır, metin dönerse hata olarak verilir.
 * Önce geçici dosyaya yazıp yerine koyar: yazma yarıda kalırsa eski kayıt kaybolmaz.
 */
function crew_kilitli_guncelle(string $dosya, callable $fn) {
    $kilit = fopen("$dosya.lock", 'c');
    flock($kilit, LOCK_EX);
    $kayit = json_decode((string)@file_get_contents($dosya), true) ?: [];
    $yeni = $fn($kayit);
    if (is_array($yeni)) {
        $ok = file_put_contents("$dosya.yeni", json_encode($yeni, JSON_UNESCAPED_UNICODE)) !== false && rename("$dosya.yeni", $dosya);
        if (!$ok) $yeni = 'Kaydedilemedi, tekrar dene';
    }
    flock($kilit, LOCK_UN);
    fclose($kilit);
    return $yeni;
}

/** Aynı ağdan en fazla 25 farklı cihaz (mobil operatörlerde çok kişi aynı IP'yi paylaşır) */
function crew_ag_dolu(array $kayitlar, string $ip, string $cihaz): bool {
    $n = 0;
    foreach ($kayitlar as $k => $o) if (($o['ip'] ?? '') === $ip && $k !== $cihaz) $n++;
    return $n >= 25;
}
