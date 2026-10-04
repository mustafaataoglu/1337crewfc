<?php
// Mağaza (taraftar tarafı). Ödeme ve teslim elden: sipariş verilince 1337 Crew FC kişiyle telefonla iletişime geçer.
// GET                                                        -> katalog: yayındaki ürünler (sıraya göre), mağaza açık mı, teslim notu, WhatsApp
// POST {islem:"siparis", cihaz, ad, tel, not, izin, kalemler, web} -> {no, toplam, zaman}; fiyatlar ve toplam sunucuda hesaplanır
// POST {islem:"takip", no, son4}                             -> sipariş durumu (ad/telefon dönmez); numara + telefonun son 4 hanesi
require dirname(__DIR__) . '/_sistem/magaza.php';
crew_hata_kaydi();

/** Sipariş formunu denetler, kilit içinde stoğu düşüp siparişi yazar; kaydı döner */
function magaza_siparis_ver(array $g): array {
    $web = $g['web'] ?? '';
    if ($web !== '') magaza_hata('Geçersiz istek'); // bot tuzağı
    $ad = str_replace(['’', '‘', 'ʼ'], "'", magaza_metin($g['ad'] ?? ''));
    $n = magaza_uzunluk($ad);
    if ($n < 2 || $n > 60 || !preg_match("/^[\\p{L}][\\p{L}\\p{M} .'-]+$/uD", $ad)) magaza_hata('Adını ve soyadını yaz');
    $tel = magaza_tel($g['tel'] ?? '');
    if ($tel === null) magaza_hata('Telefon numarasını kontrol et');
    $not = magaza_metin($g['not'] ?? '', 500, true);
    if (($g['izin'] ?? null) !== true) magaza_hata('Onay kutusunu işaretle');
    $istek = $g['kalemler'] ?? null;
    if (!is_array($istek) || !$istek) magaza_hata('Sepetin boş');
    if (count($istek) > 20) magaza_hata('Bir siparişte en fazla 20 kalem olabilir');
    $satirlar = [];
    foreach ($istek as $k) {
        if (!is_array($k) || !is_string($k['urun'] ?? null) || !is_string($k['beden'] ?? null)) magaza_hata('Geçersiz istek');
        $adet = magaza_tam($k['adet'] ?? null, 1, 10);
        if ($adet === null) magaza_hata('Adet 1 ile 10 arasında olmalı');
        $baski = null;
        if (isset($k['baski'])) {
            if (!is_array($k['baski'])) magaza_hata('Geçersiz istek');
            $isim = magaza_buyuk(magaza_metin($k['baski']['isim'] ?? ''));
            $numara = magaza_metin($k['baski']['numara'] ?? '');
            // ikisi de boşsa baskı yok
            if ($isim !== '' || $numara !== '') {
                if ($isim === '' || $numara === '') magaza_hata('Baskı için isim ve numara yaz');
                if (!preg_match('/^[A-ZÇĞİÖŞÜ0-9 .-]{1,12}$/uD', $isim)) magaza_hata('Baskı ismi en fazla 12 karakter olabilir (harf, rakam, boşluk, nokta, tire)');
                if (!preg_match('/^\d{1,2}$/D', $numara)) magaza_hata('Baskı numarası 0 ile 99 arasında olmalı');
                $baski = ['isim' => $isim, 'numara' => $numara];
            }
        }
        $satirlar[] = ['urun' => $k['urun'], 'beden' => $k['beden'], 'adet' => $adet, 'baski' => $baski];
    }
    $ip = crew_ip('magaza');
    $c = $g['cihaz'] ?? '';
    $cihaz = is_string($c) && preg_match('/^[A-Za-z0-9-]{8,64}$/D', $c) ? hash('sha256', $c . '|magaza') : $ip;

    return magaza_kilitli(function () use ($ad, $tel, $not, $satirlar, $ip, $cihaz) {
        $ay = magaza_ayarlar();
        if (!$ay['acik']) magaza_hata('Mağaza şu an sipariş almıyor', 409);
        $s = magaza_oku('sinir');
        if (magaza_sinir_say($s, 'siparis', $ip, 3600) >= 5 || magaza_sinir_say($s, 'siparis', $ip, 86400) >= 15 || magaza_sinir_say($s, 'siparis-cihaz', $cihaz, 3600) >= 5)
            magaza_hata('Çok fazla sipariş denemesi. Biraz sonra tekrar dene.', 429);
        $kayit = magaza_siparisler();
        $bekleyen = 0;
        foreach ($kayit['siparisler'] as $o) if (($o['tel'] ?? '') === $tel && ($o['durum'] ?? '') === 'yeni') $bekleyen++;
        if ($bekleyen >= 3) magaza_hata('Bu numarayla bekleyen siparişin var; 1337 Crew FC seninle iletişime geçecek.', 429);

        $urunler = magaza_urunler();
        $bul = array_column($urunler, null, 'id');
        $kalemler = [];
        $toplam = 0;
        foreach ($satirlar as $k) {
            $u = $bul[$k['urun']] ?? null;
            if (!$u || empty($u['yayinda'])) magaza_hata('Sepetindeki bir ürün artık satışta değil', 409);
            $beden = null;
            foreach ($u['bedenler'] as $b) if ($b['ad'] === $k['beden']) $beden = $b['ad'];
            if ($beden === null) magaza_hata("{$u['ad']} için seçtiğin beden artık yok", 409);
            if ($u['satis'] !== 'stok' && !magaza_siparis_acik($u, $ay)) magaza_hata("{$u['ad']} için ön sipariş kapandı", 409);
            // 409: baskı sepete eklendikten sonra kapatılmış olabilir; istemci kataloğu yenileyip kalemi işaretler
            if ($k['baski'] && empty($u['baski'])) magaza_hata("{$u['ad']} için isim ve numara baskısı yapılmıyor", 409);
            $birim = (int)$u['fiyat'] + ($k['baski'] ? (int)$u['baskiUcret'] : 0);
            $kalem = ['urun' => $u['id'], 'ad' => $u['ad'], 'beden' => $beden, 'adet' => $k['adet']];
            if ($k['baski']) $kalem['baski'] = $k['baski'];
            $kalemler[] = $kalem + ['birim' => $birim, 'satis' => $u['satis'] === 'stok' ? 'stok' : 'onsiparis'];
            $toplam += $birim * $k['adet'];
        }
        // Stoktan satılanlar: aynı ürün ve bedenin bütün kalemleri toplamda stoğu aşamaz
        $eksik = magaza_stok_tasi($urunler, ['kalemler' => $kalemler], -1);
        if ($eksik) magaza_hata("$eksik[0] için $eksik[1] bedeninde yeterli stok yok", 409);

        $n = $kayit['son'] + 1;
        while (isset($kayit['siparisler'][sprintf('1337-%04d', $n)])) $n++;
        $no = sprintf('1337-%04d', $n);
        $zaman = date('c');
        $kayit['son'] = $n;
        $kayit['siparisler'][$no] = [
            'no' => $no, 'zaman' => $zaman, 'ad' => $ad, 'tel' => $tel, 'not' => $not, 'kalemler' => $kalemler, 'toplam' => $toplam,
            'durum' => 'yeni', 'odendi' => false, 'odemeZaman' => null, 'icNot' => '', 'gecmis' => [['zaman' => $zaman, 'durum' => 'yeni']],
            'ip' => $ip, 'cihaz' => $cihaz,
        ];
        magaza_sinir_ekle($s, 'siparis', $ip);
        magaza_sinir_ekle($s, 'siparis-cihaz', $cihaz);
        magaza_yaz(['urunler' => ['urunler' => $urunler], 'siparisler' => magaza_siparis_dosyasi($kayit), 'sinir' => magaza_sinir_temiz($s)]);
        return $kayit['siparisler'][$no];
    });
}

/** Numara ve telefonun son 4 hanesiyle sipariş; yanlışlar sayılır (10 dakikada 10) */
function magaza_takip(array $g): array {
    $no = magaza_no($g['no'] ?? '');
    $son4 = magaza_metin($g['son4'] ?? '', 10);
    $ip = crew_ip('magaza');
    $o = magaza_kilitli(function () use ($no, $son4, $ip) {
        $s = magaza_oku('sinir');
        if (magaza_sinir_say($s, 'takip-hata', $ip, 600) >= 10 || magaza_sinir_say($s, 'takip', $ip, 600) >= 60)
            magaza_hata('Çok fazla deneme. 10 dakika sonra tekrar dene.', 429);
        magaza_sinir_ekle($s, 'takip', $ip);
        $o = $no ? (magaza_siparisler()['siparisler'][$no] ?? null) : null;
        if ($o && !(preg_match('/^\d{4}$/D', $son4) && hash_equals(substr((string)$o['tel'], -4), $son4))) $o = null;
        if (!$o) magaza_sinir_ekle($s, 'takip-hata', $ip);
        magaza_yaz(['sinir' => magaza_sinir_temiz($s)]);
        return $o;
    });
    if (!$o) magaza_hata('Sipariş bulunamadı. Numarayı ve telefonun son 4 hanesini kontrol et.', 404);
    return $o;
}

magaza_calistir(function () {
    $yontem = $_SERVER['REQUEST_METHOD'] ?? '';
    if ($yontem === 'GET' || $yontem === 'HEAD') {
        $ay = magaza_ayarlar();
        $urunler = [];
        foreach (magaza_urunler() as $u) if (!empty($u['yayinda'])) $urunler[] = magaza_urun_genel($u, $ay);
        magaza_cevap(['ok' => true, 'acik' => $ay['acik'], 'teslimNotu' => $ay['teslimNotu'], 'whatsapp' => $ay['whatsapp'], 'urunler' => $urunler]);
    }
    if ($yontem !== 'POST') magaza_hata('Geçersiz istek', 405);
    $g = magaza_govde();
    $islem = $g['islem'] ?? '';
    if ($islem === 'siparis') {
        $o = magaza_siparis_ver($g);
        // Bildirim e-postası cevaptan sonra ve kilit dışında: gönderilemezse sipariş yine geçerli
        magaza_cevap_sonra(['ok' => true, 'no' => $o['no'], 'toplam' => $o['toplam'], 'zaman' => $o['zaman']], fn() => magaza_siparis_epostasi($o));
    }
    if ($islem === 'takip') {
        $o = magaza_takip($g);
        $ay = magaza_ayarlar();
        magaza_cevap(['ok' => true, 'siparis' => magaza_siparis_genel($o), 'teslimNotu' => $ay['teslimNotu'], 'whatsapp' => $ay['whatsapp']]);
    }
    magaza_hata('Geçersiz istek');
});
