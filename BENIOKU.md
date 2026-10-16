# EfendiLig ham veri yedeği

Bu dal `main`'den bağımsızdır (ortak geçmiş yok) ve yalnızca veri içerir. `sync/yedekle.mjs` güncelleme işinden sonra,
içerik değiştiyse günde en çok bir kez, öncekinin üstüne yeni bir anlık görüntü commit'i olarak yazar. Dosya silinmez:
yerelde eksik ya da okunamayan dosya önceki sürümüyle kalır.

- `cache/`: `sync/backfill.mjs`'in EfendiLig API'sinden (https://apiv1.efendilig.com/api) aldığı yanıtlar, alındığı gibi
  (yalnızca `data` alanı, boşluksuz (küçültülmüş) JSON). Dosya adı istek yolundan üretilir (`/players/x/career` → `_players_x_career.json`).
  `jerseys.json` forma görsellerinden çıkarılan renklerdir. `state.json` ve `red.json` (her turda değişen durum) alınmaz.
- `backfill.json`: `sync/build-data.mjs`'in girdisi (`fetchedAt` alanı çıkarılmış). EfendiLig erişilemezken siteyi
  doğrudan bundan üretmek için.

## Ayıklanan alanlar

Depo herkese açık. Sitenin yayımlamadığı kişisel veri yedeğe yazılmaz:

- `MvpPlayerImage`: maç ayrıntısı: MVP oyuncunun fotoğraf yolu (rakip oyuncular dahil; site kullanmıyor)
- `teammates[].photoUrl`: oyuncu kariyeri: takım arkadaşlarının fotoğraf yolları (başka kulüplerdekiler dahil; site kullanmıyor)

EfendiLig fotoğraf dosya adları tam doğum tarihini içerir (`.../1234-7-Ad-Soyad-1990-01-012026-...`). 1337 oyuncularının
fotoğraf yolları (`squad[].photoUrl`, kariyerde `player.photoUrl`, profilde `imagePath`) site verisinde zaten
yayımlandığı için yedekte kalır. Profilde doğum yılı yok (yalnız gün/ay). Telefon, e-posta ya da kimlik numarası yok.

## Geri yükleme

GitHub Actions önbelleği boşsa `guncelle.yml` `sync/cache`'i bu daldan kendiliğinden doldurur. Elle:

    git fetch origin efendilig-yedek
    mkdir -p sync/cache && git archive FETCH_HEAD cache | tar -x -C sync
    git show FETCH_HEAD:backfill.json > sync/backfill.json   # EfendiLig yoksa: doğrudan node sync/build-data.mjs

Uçtaki bir dosya bozuksa ya da boş geldiyse eski anlık görüntüler dalın geçmişindedir (sığ klonda önce
`git fetch --unshallow origin efendilig-yedek`):

    git log --oneline FETCH_HEAD -- cache/<dosya>
    git show <commit>:cache/<dosya> > sync/cache/<dosya>
