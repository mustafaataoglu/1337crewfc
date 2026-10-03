#!/usr/bin/env bash
# Bir güncelleme turu: en son kodu al → EfendiLig/YouTube senkronu → site verisi ve yazılar → derleme
# → değiştiyse kaydet, gönder ve siteye haber ver. GitHub Actions içinde çalışır (guncelle.yml, sync/pencere.mjs).
#   TAM=--tam       tam senkron
#   ZORLA_PING=1    değişiklik olmasa da siteye haber ver (kod dağıtımı)
set -uo pipefail
git config user.name "1337crewfc-bot"
git config user.email "1337crewfc-bot@users.noreply.github.com"
git pull -q --rebase origin main || { git rebase --abort 2>/dev/null; git fetch -q origin main && git reset -q --hard origin/main; }
BAS=$(git rev-parse HEAD)

node sync/backfill.mjs ${TAM:-} || { echo "EfendiLig senkronu başarısız"; exit 1; }
node sync/build-data.mjs || { echo "Site verisi üretilemedi"; exit 1; }
(cd web && pnpm install --frozen-lockfile --prefer-offline >/dev/null && pnpm build) || { echo "Derleme başarısız"; exit 1; }
node sync/paketle.mjs || exit 1

degisti=0
git add -A site web/public/data sync/youtube.json sync/yazilar.json sync/mac-gecmisi.json
if git diff --cached --quiet; then
  echo "Değişiklik yok"
else
  git fetch -q origin main
  # Bu tur sürerken yeni kod gönderildiyse, eski kodla derlenmiş site yeni dağıtımın üstüne yazılmasın:
  # tur bırakılır, sonraki tur yeni kodla yapar
  if ! git diff --quiet "$BAS" origin/main -- web/src web/index.html web/package.json web/vite.config.ts web/tailwind.config.js server sync/backfill.mjs sync/build-data.mjs sync/yazar.mjs sync/paketle.mjs; then
    echo "Bu arada kod değişti; bu turun sonucu kaydedilmedi"
    git reset -q --hard "$BAS"
    exit 0
  fi
  git commit -q -m "Otomatik güncelleme: $(cat site/surum.txt)"
  # Bu arada başka bir commit geldiyse üstüne al; üretilen dosyalar çakışırsa bizimkini kullan
  git pull -q --rebase -X theirs origin main || { git rebase --abort; git pull -q --no-rebase -X ours origin main; }
  git push -q && degisti=1 && echo "Kaydedildi: $(cat site/surum.txt)"
fi

# Ziyaretçi beklemeden siteye haber ver: site yeni sürümü hemen indirir
if [ "$degisti" = 1 ] || [ "${ZORLA_PING:-0}" = 1 ]; then
  sleep 15
  for i in 1 2 3; do
    sonuc=$(curl -s --max-time 120 https://1337crewfc.com/api/guncelle.php || true)
    echo "$sonuc"
    echo "$sonuc" | grep -qE '"sonuc": ?"(guncellendi|guncel)"' && break
    sleep 70
  done
fi
exit 0
