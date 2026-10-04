<?php
// Mağaza yönetimi. Her istek takım paneli anahtarını ister (X-Panel-Anahtar); hatalı denemeler sınırlanır.
// GET ?islem=veri                     -> siparişler (yeniden eskiye), ürünler (taslaklar dahil), ayarlar
// GET ?islem=csv                      -> siparişler Excel için CSV (UTF-8 BOM, noktalı virgül)
// POST {islem:"giris"}                -> yalnızca anahtarı doğrular
// POST {islem:"siparis-guncelle", no, durum?, odendi?, icNot?} | {islem:"siparis-sil", no}
// POST {islem:"urun-kaydet", urun} | {islem:"urun-sil", id} | {islem:"urun-sirala", ids}
// POST {islem:"ayarlar", ayarlar} | {islem:"eposta-dene"}
// POST multipart: islem=resim, dosya  -> {id}
require dirname(__DIR__) . '/_sistem/magaza.php';
crew_hata_kaydi();

function magaza_urunler_tam(array $urunler): array {
    $ay = magaza_ayarlar();
    return array_map(fn($u) => magaza_urun_tam($u, $ay), $urunler);
}

function magaza_siparis_guncelle(array $g): void {
    $no = magaza_no($g['no'] ?? '') ?? '';
    $durum = $g['durum'] ?? null;
    $odendi = $g['odendi'] ?? null;
    if ($durum !== null && !in_array($durum, MAGAZA_DURUMLAR, true)) magaza_hata('Geçersiz durum');
    if ($odendi !== null && !is_bool($odendi)) magaza_hata('Geçersiz istek');
    $icNot = isset($g['icNot']) ? magaza_metin($g['icNot'], 1000, true) : null;
    [$o, $urunler] = magaza_kilitli(function () use ($no, $durum, $odendi, $icNot) {
        $kayit = magaza_siparisler();
        $o = $kayit['siparisler'][$no] ?? null;
        if (!$o) magaza_hata('Sipariş bulunamadı', 404);
        $urunler = magaza_urunler();
        if ($durum !== null && $durum !== $o['durum']) {
            // Stok yalnızca iptale girerken (geri konur) ve iptalden çıkarken (yeniden ayrılır) değişir
            if ($durum === 'iptal') magaza_stok_tasi($urunler, $o, 1);
            elseif ($o['durum'] === 'iptal' && ($eksik = magaza_stok_tasi($urunler, $o, -1))) magaza_hata("Stok yetersiz: $eksik[0] $eksik[1]", 409);
            $o['durum'] = $durum;
            $o['gecmis'][] = ['zaman' => date('c'), 'durum' => $durum];
        }
        if ($odendi !== null && $odendi !== !empty($o['odendi'])) {
            $o['odendi'] = $odendi;
            $o['odemeZaman'] = $odendi ? date('c') : null;
        }
        if ($icNot !== null) $o['icNot'] = $icNot;
        $kayit['siparisler'][$no] = $o;
        magaza_yaz(['urunler' => ['urunler' => $urunler], 'siparisler' => magaza_siparis_dosyasi($kayit)]);
        return [$o, $urunler];
    });
    magaza_cevap(['ok' => true, 'siparis' => magaza_siparis_tam($o), 'urunler' => magaza_urunler_tam($urunler)]);
}

function magaza_siparis_sil(array $g): void {
    $no = magaza_no($g['no'] ?? '') ?? '';
    $urunler = magaza_kilitli(function () use ($no) {
        $kayit = magaza_siparisler();
        $o = $kayit['siparisler'][$no] ?? null;
        if (!$o) magaza_hata('Sipariş bulunamadı', 404);
        $urunler = magaza_urunler();
        if ($o['durum'] !== 'iptal') magaza_stok_tasi($urunler, $o, 1);
        unset($kayit['siparisler'][$no]);
        magaza_yaz(['urunler' => ['urunler' => $urunler], 'siparisler' => magaza_siparis_dosyasi($kayit)]);
        return $urunler;
    });
    magaza_cevap(['ok' => true, 'urunler' => magaza_urunler_tam($urunler)]);
}

function magaza_urun_kaydet($g): void {
    if (!is_array($g)) magaza_hata('Geçersiz istek');
    $ad = magaza_metin($g['ad'] ?? '');
    $n = magaza_uzunluk($ad);
    if ($n < 2 || $n > 80) magaza_hata('Ürün adı 2-80 karakter olmalı');
    $kategori = magaza_metin($g['kategori'] ?? '', 30) ?: 'Forma';
    $aciklama = magaza_metin($g['aciklama'] ?? '', 1000, true);
    $fiyat = magaza_tam($g['fiyat'] ?? null, 0, 100000);
    if ($fiyat === null) magaza_hata('Fiyat 0 ile 100000 arasında tam sayı olmalı');
    $baskiUcret = magaza_tam($g['baskiUcret'] ?? 0, 0, 10000);
    if ($baskiUcret === null) magaza_hata('Baskı ücreti 0 ile 10000 arasında tam sayı olmalı');
    $satis = $g['satis'] ?? null;
    if ($satis !== 'stok' && $satis !== 'onsiparis') magaza_hata('Satış şeklini seç');
    $bitis = $g['onSiparisBitis'] ?? null;
    if ($bitis === '') $bitis = null;
    if ($bitis !== null && !(is_string($bitis) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $bitis, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1])))
        magaza_hata('Son sipariş günü geçersiz');
    $teslimTahmini = magaza_metin($g['teslimTahmini'] ?? '', 60);
    $girdi = $g['bedenler'] ?? null;
    if (!is_array($girdi) || count($girdi) < 1 || count($girdi) > 12) magaza_hata('En az 1, en fazla 12 beden olmalı');
    $bedenler = [];
    $oncekiler = []; // beden adı → form açıldığındaki stok (kaydedilmez, yalnızca fark için)
    $gorulen = [];
    foreach ($girdi as $b) {
        $bad = magaza_metin(is_array($b) ? ($b['ad'] ?? '') : '');
        if (!preg_match('/^[\p{L}0-9 .\/+-]{1,12}$/uD', $bad)) magaza_hata('Beden adı 1-12 karakter olmalı (harf, rakam, boşluk . / + -)');
        if (isset($gorulen[magaza_buyuk($bad)])) magaza_hata("$bad bedeni iki kez yazılmış");
        $gorulen[magaza_buyuk($bad)] = true;
        $stok = null;
        if ($satis === 'stok') {
            // ön siparişten stoğa geçerken boş bırakılan bedenler 0
            $v = $b['stok'] ?? null;
            $stok = $v === null || $v === '' ? 0 : magaza_tam($v, 0, 9999);
            if ($stok === null) magaza_hata('Stok 0 ile 9999 arasında tam sayı olmalı');
            $v = $b['onceki'] ?? null;
            if ($v !== null && $v !== '') {
                $oncekiler[$bad] = magaza_tam($v, 0, 9999);
                if ($oncekiler[$bad] === null) magaza_hata('Stok 0 ile 9999 arasında tam sayı olmalı');
            }
        }
        $bedenler[] = ['ad' => $bad, 'stok' => $stok];
    }
    $resimler = $g['resimler'] ?? [];
    if (!is_array($resimler) || count($resimler) > 8) magaza_hata('En fazla 8 fotoğraf eklenebilir');
    $resimler = array_values(array_unique(array_map(fn($r) => is_string($r) ? $r : '', $resimler)));
    $baski = ($g['baski'] ?? false) === true;
    $yayinda = ($g['yayinda'] ?? false) === true;
    if ($yayinda && $fiyat < 1) magaza_hata('Yayına almak için fiyat gir');
    $id = $g['id'] ?? null;
    if ($id === '') $id = null;
    if ($id !== null && !(is_string($id) && preg_match(MAGAZA_URUN_DESENI, $id))) magaza_hata('Ürün bulunamadı', 404);

    $kayit = magaza_kilitli(function () use ($id, $ad, $kategori, $aciklama, $fiyat, $resimler, $bedenler, $oncekiler, $satis, $bitis, $teslimTahmini, $baski, $baskiUcret, $yayinda) {
        foreach ($resimler as $r) if (!preg_match(MAGAZA_RESIM_DESENI, $r) || !is_file(magaza_dizini() . "/resim/$r")) magaza_hata('Fotoğraf bulunamadı, yeniden yükle');
        $urunler = magaza_urunler();
        $i = null;
        foreach ($urunler as $j => $u) if ($u['id'] === $id) $i = $j;
        if ($id !== null && $i === null) magaza_hata('Ürün bulunamadı', 404);
        $eski = $i === null ? null : $urunler[$i];
        // Form açıkken gelen siparişlerin ayırdığı (ya da iptallerin geri koyduğu) stok ezilmesin:
        // yönetimin yaptığı değişiklik (stok − onceki) güncel stoğa eklenir. Beden yeni ya da stoğu sayı değilse gönderilen yazılır.
        if ($eski && $oncekiler) {
            $guncel = [];
            foreach ($eski['bedenler'] ?? [] as $b) if (is_int($b['stok'] ?? null)) $guncel[(string)$b['ad']] = $b['stok'];
            foreach ($bedenler as $j => $b) {
                if (isset($oncekiler[$b['ad']], $guncel[$b['ad']])) $bedenler[$j]['stok'] = max(0, min(9999, $guncel[$b['ad']] + $b['stok'] - $oncekiler[$b['ad']]));
            }
        }
        $simdi = date('c');
        $yeniId = $eski['id'] ?? null;
        if ($yeniId === null) do $yeniId = magaza_urun_kimligi(); while (in_array($yeniId, array_column($urunler, 'id'), true));
        $kayit = [
            'id' => $yeniId, 'ad' => $ad, 'kategori' => $kategori, 'aciklama' => $aciklama, 'fiyat' => $fiyat, 'resimler' => $resimler,
            'bedenler' => $bedenler, 'satis' => $satis, 'onSiparisBitis' => $bitis, 'teslimTahmini' => $teslimTahmini, 'baski' => $baski,
            'baskiUcret' => $baskiUcret, 'yayinda' => $yayinda, 'sira' => $eski['sira'] ?? max(array_merge([0], array_column($urunler, 'sira'))) + 1,
            'olusturma' => $eski['olusturma'] ?? $simdi, 'guncelleme' => $simdi,
        ];
        if ($i === null) $urunler[] = $kayit; else $urunler[$i] = $kayit;
        magaza_yaz(['urunler' => ['urunler' => $urunler]]);
        // Üründen çıkarılan ve başka üründe kullanılmayan fotoğraflar silinir
        magaza_resim_birak($urunler, array_diff($eski['resimler'] ?? [], $resimler));
        return $kayit;
    });
    magaza_cevap(['ok' => true, 'urun' => magaza_urun_tam($kayit, magaza_ayarlar())]);
}

function magaza_urun_sil(array $g): void {
    $id = is_string($g['id'] ?? null) ? $g['id'] : '';
    magaza_kilitli(function () use ($id) {
        $urunler = magaza_urunler();
        $eski = null;
        foreach ($urunler as $j => $u) if ($u['id'] === $id) { $eski = $u; array_splice($urunler, $j, 1); break; }
        if (!$eski) magaza_hata('Ürün bulunamadı', 404);
        magaza_yaz(['urunler' => ['urunler' => $urunler]]);
        // Siparişler ürünün o anki adını ve fiyatını kendisi taşır; yalnızca fotoğraflar silinir
        magaza_resim_birak($urunler, $eski['resimler'] ?? []);
    });
    magaza_cevap(['ok' => true]);
}

function magaza_urun_sirala(array $g): void {
    $ids = $g['ids'] ?? null;
    $urunler = magaza_kilitli(function () use ($ids) {
        $urunler = magaza_urunler();
        $mevcut = array_column($urunler, 'id');
        $gecerli = is_array($ids) && array_values($ids) === $ids && count($ids) === count($mevcut)
            && !array_filter($ids, fn($x) => !is_string($x)) && count(array_unique($ids)) === count($ids) && !array_diff($mevcut, $ids);
        if (!$gecerli) magaza_hata('Ürün listesi değişmiş; sayfayı yenileyip tekrar dene');
        $sira = array_flip($ids);
        foreach ($urunler as $j => $u) $urunler[$j]['sira'] = $sira[$u['id']] + 1;
        usort($urunler, fn($a, $b) => $a['sira'] <=> $b['sira']);
        magaza_yaz(['urunler' => ['urunler' => $urunler]]);
        return $urunler;
    });
    magaza_cevap(['ok' => true, 'urunler' => magaza_urunler_tam($urunler)]);
}

function magaza_ayarlari_kaydet($a): void {
    if (!is_array($a) || !is_bool($a['acik'] ?? null)) magaza_hata('Geçersiz istek');
    $whatsapp = magaza_metin($a['whatsapp'] ?? '') === '' ? '' : magaza_tel($a['whatsapp']);
    if ($whatsapp === null) magaza_hata('WhatsApp numarasını kontrol et');
    $eposta = magaza_metin($a['eposta'] ?? '');
    if ($eposta !== '' && (strlen($eposta) > 120 || !filter_var($eposta, FILTER_VALIDATE_EMAIL))) magaza_hata('E-posta adresini kontrol et');
    $ay = ['acik' => $a['acik'], 'teslimNotu' => magaza_metin($a['teslimNotu'] ?? '', 300, true), 'whatsapp' => $whatsapp, 'eposta' => $eposta];
    magaza_kilitli(fn() => magaza_yaz(['ayarlar' => $ay]));
    magaza_cevap(['ok' => true, 'ayarlar' => $ay]);
}

/** Excel için CSV: her alan tırnaklı; =, +, -, @, sekme ya da satır başıyla başlayan hücre formül sayılmasın diye ' ile başlar */
function magaza_csv(): void {
    $siparisler = array_values(magaza_siparisler()['siparisler']);
    usort($siparisler, fn($a, $b) => magaza_no_sayi($a['no']) <=> magaza_no_sayi($b['no']));
    $hucre = function ($v): string {
        $v = (string)$v;
        if (preg_match('/^[=+\-@\t\r]/', $v)) $v = "'$v";
        return '"' . str_replace('"', '""', $v) . '"';
    };
    $satirlar = [['No', 'Tarih', 'Ad soyad', 'Telefon', 'Ürünler', 'Toplam (TL)', 'Durum', 'Ödeme', 'Not', 'İç not']];
    foreach ($siparisler as $o) $satirlar[] = [
        $o['no'], magaza_zaman_yazi($o['zaman']), $o['ad'], magaza_tel_yazi($o['tel']), implode(' | ', array_map('magaza_kalem_yazi', $o['kalemler'])),
        $o['toplam'], MAGAZA_DURUM_ETIKET[$o['durum']] ?? $o['durum'], empty($o['odendi']) ? 'Alınmadı' : 'Alındı', $o['not'] ?? '', $o['icNot'] ?? '',
    ];
    $csv = "\xEF\xBB\xBF";
    foreach ($satirlar as $s) $csv .= implode(';', array_map($hucre, $s)) . "\r\n";
    http_response_code(200);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="1337-siparisler-' . crew_simdi()->format('Y-m-d') . '.csv"');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . strlen($csv));
    echo $csv;
    exit;
}

magaza_calistir(function () {
    $yontem = $_SERVER['REQUEST_METHOD'] ?? '';
    if ($yontem !== 'GET' && $yontem !== 'POST') magaza_hata('Geçersiz istek', 405);
    magaza_panel_dogrula();
    if ($yontem === 'GET') {
        $islem = $_GET['islem'] ?? '';
        if ($islem === 'veri') {
            $siparisler = array_values(magaza_siparisler()['siparisler']);
            usort($siparisler, fn($a, $b) => magaza_no_sayi($b['no']) <=> magaza_no_sayi($a['no']));
            magaza_cevap(['ok' => true, 'siparisler' => array_map('magaza_siparis_tam', $siparisler), 'urunler' => magaza_urunler_tam(magaza_urunler()), 'ayarlar' => magaza_ayarlar()]);
        }
        if ($islem === 'csv') magaza_csv();
        magaza_hata('Geçersiz istek');
    }
    if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') === 0) {
        if (($_POST['islem'] ?? '') === 'resim') magaza_cevap(['ok' => true, 'id' => magaza_resim_yukle()]);
        // post_max_size aşılınca PHP formu tümüyle boş bırakır
        if (!$_POST && !$_FILES && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) magaza_hata('Fotoğraf en fazla 8 MB olabilir');
        magaza_hata('Geçersiz istek');
    }
    $g = magaza_govde();
    switch ($g['islem'] ?? '') {
        case 'giris': magaza_cevap(['ok' => true]);
        case 'siparis-guncelle': magaza_siparis_guncelle($g);
        case 'siparis-sil': magaza_siparis_sil($g);
        case 'urun-kaydet': magaza_urun_kaydet($g['urun'] ?? null);
        case 'urun-sil': magaza_urun_sil($g);
        case 'urun-sirala': magaza_urun_sirala($g);
        case 'ayarlar': magaza_ayarlari_kaydet($g['ayarlar'] ?? null);
        case 'eposta-dene':
            $ay = magaza_ayarlar();
            if ($ay['eposta'] === '') magaza_hata('Önce e-posta adresini kaydet');
            $ok = magaza_eposta($ay['eposta'], '1337 Crew FC mağaza deneme e-postası',
                "Mağazanın yeni sipariş bildirimleri bu adrese gelir.\n\nhttps://1337crewfc.com/#yonetim");
            if (!$ok) magaza_hata('E-posta gönderilemedi. Sunucunun e-posta ayarını kontrol et.', 500);
            magaza_cevap(['ok' => true]);
    }
    magaza_hata('Geçersiz istek');
});
