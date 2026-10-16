<?php
// Eski blog adresleri (blog yıllarca www.1337crewfc.com'da yayındaydı) site içi arşive yönlenir.
// .htaccess yolu parçalayıp gönderir: GET ?yil=2012&ay=05&ad=<yazı> (/2012/05/<yazı>.html) ya da ?sayfa=<sayfa> (/p/<sayfa>.html).
// Yazı/sayfa data/arsiv/liste.json'daki 'eski' yoluyla bulunur -> 301 /#arsiv/<id> (sayfa: /#arsiv/s/<id>).
// Bulunamazsa ya da liste okunamazsa 302 /#arsiv. Hedef yalnızca listedeki kimliklerden kurulur, girdi adrese yazılmaz.

function arsiv_git(string $hedef, bool $kalici): void {
    http_response_code($kalici ? 301 : 302);
    header('Location: ' . $hedef);
    // Kalıcı yönlendirme de kısa süre saklansın: arşiv kimlikleri değişirse eski adresler takılı kalmasın
    header('Cache-Control: ' . ($kalici ? 'public, max-age=3600' : 'no-cache'));
    header('X-LiteSpeed-Cache-Control: no-cache');
    header('Content-Length: 0');
    exit;
}

$al = fn(string $k): string => is_string($_GET[$k] ?? null) ? $_GET[$k] : '';
$yil = $al('yil'); $ay = $al('ay'); $ad = strtolower($al('ad')); $sayfa = strtolower($al('sayfa'));
$eski = null;
$sayfaMi = $sayfa !== '';
if ($sayfaMi && preg_match('/^[a-z0-9_-]{1,120}$/D', $sayfa)) $eski = "/p/$sayfa.html";
elseif (!$sayfaMi && preg_match('/^20[0-2]\d$/D', $yil) && preg_match('/^(0[1-9]|1[0-2])$/D', $ay) && preg_match('/^[a-z0-9_-]{1,120}$/D', $ad))
    $eski = "/$yil/$ay/$ad.html";
if ($eski === null) arsiv_git('/#arsiv', false);

$liste = json_decode((string)@file_get_contents(dirname(__DIR__) . '/data/arsiv/liste.json'), true);
$kayitlar = is_array($liste) ? ($liste[$sayfaMi ? 'sayfalar' : 'yazilar'] ?? null) : null;
if (!is_array($kayitlar)) arsiv_git('/#arsiv', false);
foreach ($kayitlar as $k) {
    if (!is_array($k) || ($k['eski'] ?? null) !== $eski) continue;
    $id = $k['id'] ?? null;
    // Kimlik de denetlenir: bozuk liste başlığa bir şey sokamasın
    if ($sayfaMi && is_string($id) && preg_match('/^s-[A-Za-z0-9_-]{1,120}$/D', $id)) arsiv_git("/#arsiv/s/$id", true);
    if (!$sayfaMi && is_string($id) && preg_match('/^\d{1,30}$/D', $id)) arsiv_git("/#arsiv/$id", true);
    break;
}
arsiv_git('/#arsiv', false);
