# 1337crewfc.com

1337 Crew FC'nin kulüp sitesi. Veriler EfendiLig ve YouTube'dan otomatik gelir.

- `sync/` — EfendiLig + YouTube senkronu ve site verisinin üretimi (GitHub Actions, 15 dakikada bir)
- `web/` — React arayüzü
- `server/` — sunucu tarafı: kendi kendini güncelleme, oylama API'si
- `site/` — derlenmiş site (otomatik üretilir, sunucu bunu indirir)

Sunucu durumu: https://1337crewfc.com/durum.json
