#!/usr/bin/env bash
#
# scripts/release-web.sh
#
# OTA-релиз веб-слоя (Фаза 15): собирает бандл приложения и публикует его на контуре.
#
# Зачем отдельный скрипт: правки интерфейса и логики больше **не требуют установки APK** —
# приложение скачивает zip (единицы МБ), проверяет хэш и применяет его при следующем
# запуске («Обновить без установки» в «Ещё»). APK остаётся для нативных изменений
# (плагины, разрешения, `versionCode`) — это `release-apk.sh`.
#
# Что делает:
#   1) берёт `versionName`/`versionCode` из `src-capacitor/android/gradle.properties`
#      (versionName — префикс идентификатора бандла, versionCode — в «минимально нужный APK»),
#      а номер веб-релиза считает от манифеста контура (`APP_BUNDLE_BUILD` — только пол,
#      см. задачу 15.21: идентификатор `<версия APK>.<номер>.<дата-время>`);
#   2) собирает web-часть в режиме Capacitor **с адресом нужного контура**
#      (`--skip-pkg`: нативный проект не собираем — APK не нужен);
#   3) упаковывает `src-capacitor/www` в zip и считает sha256 в двух видах:
#      hex — для манифеста, base64 — именно в таком виде хэш ждёт плагин OTA;
#   4) публикует бандл на контуре (`php artisan app:publish-bundle`) и проверяет
#      `/api/app-version`.
# Контуры и защиты — те же, что у APK-релиза (см. `release-apk.sh`): dev-адрес из
# `RELEASE_API_URL`/`.env.local`/`.env`; для prod обязательны явные https-адрес, сервер
# и каталог; локальный адрес и адрес второго контура в бандле — ошибка.
#
# Примеры:
#   npm run release:web -- --channel dev --notes "Правки склада"   # соберёт и покажет команды публикации
#   RELEASE_SERVER=ledgercraft-home npm run release:web -- --channel dev   # домашний контур (текущий dev)
#   npm run release:web -- --channel dev --dry-run                 # план без сборки
#   npm run release:web -- --channel dev --version 1.8.15 --min-native-version 10
#
# ⚠️ Публикацию OTA принимает бэкенд (`app:publish-bundle`, бэкенд-задача 15.7 — реализована
# 15.09.2026). Опция называется `--bundle-version`: `--version` у Symfony Console глобальный
# и «съедает» команду (публикация молча ничего не делала).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRADLE_PROPERTIES="$ROOT_DIR/src-capacitor/android/gradle.properties"
WWW_DIR="$ROOT_DIR/src-capacitor/www"
# Каталог публикации по умолчанию — домашний контур (текущий dev); у prod он другой и задаётся явно.
REMOTE_DIR="${RELEASE_REMOTE_DIR:-/opt/projects/ledgercraft/backend}"
REMOTE_DIR_EXPLICIT="${RELEASE_REMOTE_DIR:+1}"
# Чем запускать artisan на контуре. На домашнем сервере (текущий dev) PHP-расширения
# (pdo_pgsql) есть только в контейнере, поэтому по умолчанию идём через `docker exec`.
# Для прежнего dev-VPS (страховка/откат) задайте явно:
#   RELEASE_SERVER=dev-vps RELEASE_REMOTE_DIR=/var/www/LedgerCraftDocker03 RELEASE_REMOTE_PHP=php
REMOTE_PHP="${RELEASE_REMOTE_PHP:-docker exec ledgercraft-app php}"

CHANNEL="${RELEASE_CHANNEL:-dev}"

NOTES=""
BUNDLE_VERSION=""
MIN_NATIVE_VERSION=""
SERVER="${RELEASE_SERVER:-}"
LOCAL_ONLY=0
SKIP_BUILD=0
DRY_RUN=0
ALLOW_LOCAL=0

usage() {
  cat <<'EOF'
Сборка и публикация OTA-релиза веб-слоя (без установки APK).

Использование: scripts/release-web.sh [ключи]

  --channel dev|prod        контур: чей адрес API уедет в бандл (или RELEASE_CHANNEL, dev)
  --version ID              идентификатор бандла (по умолчанию —
                            versionName.номер веб-релиза.ддммгг-ччмм, напр. 1.14.7.260915-1440)
  --min-native-version N    минимальный versionCode APK, на котором бандл имеет смысл
                            (по умолчанию — текущий APP_VERSION_CODE из gradle.properties)
  --notes "текст"           что нового: пункты через запятую или с новой строки
  --server user@host        сервер для публикации (или RELEASE_SERVER)
  --remote-dir PATH         каталог репозитория на контуре (или RELEASE_REMOTE_DIR)
  --local-only              только собрать бандл, без публикации
  --skip-build              не пересобирать веб-часть: взять готовый `src-capacitor/www`
                            (нужно, когда бандл выкладывают сразу после APK-релиза)
  --dry-run                 показать план (контур, адрес, что опубликовано) и выйти
  --allow-local             разрешить локальный адрес API (по умолчанию это ошибка)
  -h, --help                эта справка

Контуры: dev — адрес из RELEASE_API_URL/.env.local/.env; prod — обязательны
RELEASE_API_URL (https), --server и --remote-dir. Повторная публикация того же
идентификатора бандла на контуре — отказ (устройства считают бандл «своим» по нему).
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --notes) NOTES="${2:-}"; shift 2 ;;
    --version) BUNDLE_VERSION="${2:-}"; shift 2 ;;
    --min-native-version) MIN_NATIVE_VERSION="${2:-}"; shift 2 ;;
    --channel) CHANNEL="${2:-}"; shift 2 ;;
    --server) SERVER="${2:-}"; shift 2 ;;
    --remote-dir) REMOTE_DIR="${2:-}"; REMOTE_DIR_EXPLICIT=1; shift 2 ;;
    --local-only) LOCAL_ONLY=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --allow-local) ALLOW_LOCAL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Неизвестный аргумент: $1"; usage; exit 1 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✖ %s\033[0m\n' "$1"; exit 1; }

# Аргумент в одинарных кавычках для печатаемой команды публикации.
# `printf %q` для этого не годится: в C-локали он превращает кириллицу в $'\237...'
# (заметки релиза у нас русские, и мастер видит их в приложении).
shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

case "$CHANNEL" in
  dev|prod) ;;
  *) fail "Неизвестный контур: '$CHANNEL' (ожидали dev или prod)" ;;
esac


# --- Версия сборки -----------------------------------------------------------
read_prop() {
  grep -E "^$1=" "$GRADLE_PROPERTIES" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]' || true
}

[ -f "$GRADLE_PROPERTIES" ] || fail "Не найден $GRADLE_PROPERTIES"

VERSION_CODE="$(read_prop APP_VERSION_CODE)"
VERSION_NAME="$(read_prop APP_VERSION_NAME)"

[ -n "$VERSION_CODE" ] || fail 'В gradle.properties не задан APP_VERSION_CODE'
[ -n "$VERSION_NAME" ] || fail 'В gradle.properties не задан APP_VERSION_NAME'

case "$VERSION_CODE" in
  ''|*[!0-9]*) fail "APP_VERSION_CODE должен быть целым числом, а не '$VERSION_CODE'" ;;
esac

# --- Контур: чей адрес API уедет в бандл -------------------------------------
ENV_LOCAL_URL="$(grep -E '^VITE_API_URL=' "$ROOT_DIR/.env.local" 2>/dev/null | head -1 | cut -d= -f2- || true)"
ENV_URL="$(grep -E '^VITE_API_URL=' "$ROOT_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"

DEV_API_URL="${DEV_API_URL:-https://ledgercraft.dev.medovf2h.beget.tech/api}"
PROD_API_URL="${PROD_API_URL:-}" # боевой домен ещё не выбран — задача 11.12

if [ -n "${RELEASE_API_URL:-}" ]; then
  EXPECTED_API_URL="$RELEASE_API_URL"
elif [ "$CHANNEL" = 'prod' ]; then
  [ -n "$PROD_API_URL" ] || fail 'Для prod-контура нужен адрес: RELEASE_API_URL=https://<prod-домен>/api'
  EXPECTED_API_URL="$PROD_API_URL"
else
  EXPECTED_API_URL="${ENV_LOCAL_URL:-${ENV_URL:-$DEV_API_URL}}"
  echo "  dev-адрес взят из RELEASE_API_URL/.env.local/.env (фолбэк — $DEV_API_URL)"
fi

case "$EXPECTED_API_URL" in
  http://*|https://*) ;;
  *) fail "Адрес API не похож на URL: $EXPECTED_API_URL" ;;
esac

if [ "$CHANNEL" = 'prod' ] && [ "${EXPECTED_API_URL#https://}" = "$EXPECTED_API_URL" ]; then
  fail "Боевой контур обязан быть https: $EXPECTED_API_URL"
fi

if [ "$ALLOW_LOCAL" != '1' ]; then
  case "$EXPECTED_API_URL" in
    *//localhost*|*//127.*|*//10.*|*//192.168.*|*//172.1[6-9].*|*//172.2[0-9].*|*//172.3[01].*)
      fail "В релизном бандле локальный адрес API: $EXPECTED_API_URL (для отладки — --allow-local)" ;;
  esac
fi

# Адрес второго контура — чтобы поймать «уехал чужой» на шаге проверки бандла.
if [ "$CHANNEL" = 'prod' ]; then
  OTHER_API_URL="$ENV_URL"
else
  OTHER_API_URL="$PROD_API_URL"
fi

# Публикация на prod требует явных сервера и каталога: пути контуров разные.
if [ "$CHANNEL" = 'prod' ] && [ "$LOCAL_ONLY" != '1' ]; then
  [ -n "$SERVER" ] || fail 'Для prod-контура задайте сервер: RELEASE_SERVER=prod-vps или --server'
  [ "$REMOTE_DIR_EXPLICIT" = '1' ] || fail 'Для prod-контура задайте каталог: RELEASE_REMOTE_DIR=/var/www/<prod> или --remote-dir'
fi

step "Контур $CHANNEL: адрес API $EXPECTED_API_URL"

# --- Что уже опубликовано на контуре (до сборки) -----------------------------
# Нужно и для проверки «бандл не публиковали», и для счётчика веб-релизов (задача 15.21):
# «последний выпущенный номер» знает контур, а `APP_BUNDLE_BUILD` в gradle.properties —
# только пол на случай, когда манифест недоступен.
CONTOUR_MANIFEST="$(curl -sS -m 20 "$EXPECTED_API_URL/app-version" 2>/dev/null || true)"
CONTOUR_BUNDLE_ID=''

if [ -n "$CONTOUR_MANIFEST" ]; then
  # "bundle":{…,"version":"1.14.7.260915-1440",…} → идентификатор опубликованного бандла
  CONTOUR_BUNDLE_JSON="$(printf '%s' "$CONTOUR_MANIFEST" | tr -d '\n' \
    | sed -n 's/.*"bundle"[[:space:]]*:[[:space:]]*{\([^}]*\)}.*/\1/p')"
  CONTOUR_BUNDLE_ID="$(printf '%s' "$CONTOUR_BUNDLE_JSON" | tr ',' '\n' \
    | sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
elif [ "$CHANNEL" = 'prod' ] && [ "$LOCAL_ONLY" != '1' ]; then
  fail "Не удалось прочитать $EXPECTED_API_URL/app-version — выкат на prod вслепую запрещён"
else
  echo '⚠️  Манифест контура недоступен — счётчик веб-релиза и проверка «бандл ещё не публиковался» пропущены'
fi

# --- Идентификатор бандла ----------------------------------------------------
# Идентификатор — строка: устройство считает бандл «своим» при совпадении строк.
# Поэтому в него входит время сборки: два OTA-релиза одного APK не должны
# «схлопнуться» в один и тот же идентификатор.
#
# Формат: `<APP_VERSION_NAME>.<номер веб-релиза>.<ддммгг-ччмм>` — например
# `1.14.7.260915-1440` (задача 15.21, просьба владельца 15.09.2026: «почему всегда 1.14?»).
# Префикс — версия **APK-линии** (растёт только нативным релизом), а номер показывает,
# какой это по счёту выкат веб-слоя. Следующий номер = максимум из `APP_BUNDLE_BUILD`
# (gradle.properties) и номера бандла на контуре, плюс один: контур важнее, локальное
# значение — пол для недоступного манифеста. Для клиента это по-прежнему просто строка
# (`parseBundleVersion` её не разбирает), «какой бандл актуальный» решает сервер.
if [ -z "$BUNDLE_VERSION" ]; then
  LAST_BUILD="$(read_prop APP_BUNDLE_BUILD)"
  case "$LAST_BUILD" in
    ''|*[!0-9]*) LAST_BUILD=0 ;;
  esac

  # `1.14.7.260915-1440` → 7: номер — предпоследнее поле. Берём его только у бандла **из той же
  # APK-линии** (`1.14.*`): после подъёма `APP_VERSION_NAME` (нативный релиз) счётчик начинается
  # заново — бандл прошлой линии `1.15.1.…` не должен дать `1.14.8.…`.
  CONTOUR_BUILD=0
  case "$CONTOUR_BUNDLE_ID" in
    "$VERSION_NAME".*)
      CONTOUR_BUILD="$(printf '%s' "$CONTOUR_BUNDLE_ID" | awk -F. 'NF>=4 && $(NF-1) ~ /^[0-9]+$/ { print $(NF-1) }')"
      CONTOUR_BUILD="${CONTOUR_BUILD:-0}"
      ;;
  esac

  if [ "$CONTOUR_BUILD" -gt "$LAST_BUILD" ]; then
    NEXT_BUILD=$((CONTOUR_BUILD + 1))
  else
    NEXT_BUILD=$((LAST_BUILD + 1))
  fi

  BUNDLE_VERSION="$VERSION_NAME.$NEXT_BUILD.$(date +%y%m%d-%H%M)"
  echo "  веб-релиз № $NEXT_BUILD (на контуре: ${CONTOUR_BUNDLE_ID:-нет}, в gradle.properties: $LAST_BUILD)"
  echo "  после выката поднимите APP_BUNDLE_BUILD=$NEXT_BUILD в src-capacitor/android/gradle.properties"
fi

if [ -z "$MIN_NATIVE_VERSION" ]; then
  MIN_NATIVE_VERSION="$VERSION_CODE"
fi

case "$MIN_NATIVE_VERSION" in
  ''|*[!0-9]*) fail "--min-native-version должен быть целым числом, а не '$MIN_NATIVE_VERSION'" ;;
esac

SAFE_VERSION="$(printf '%s' "$BUNDLE_VERSION" | tr -c 'A-Za-z0-9._-' '-')"
ZIP_NAME="ledger-craft-bundle-$SAFE_VERSION.zip"
ZIP_PATH="$ROOT_DIR/$ZIP_NAME"

step "Бандл: $BUNDLE_VERSION (APK не ставим; минимальный versionCode — $MIN_NATIVE_VERSION)"

if [ -n "$CONTOUR_MANIFEST" ] && printf '%s' "$CONTOUR_MANIFEST" | grep -q "$BUNDLE_VERSION"; then
  fail "Бандл $BUNDLE_VERSION уже опубликован на контуре — задайте другой --version"
fi

if [ "$DRY_RUN" = '1' ]; then
  step 'Dry-run: сборка и публикация не выполняются'
  if [ "$SKIP_BUILD" = '1' ]; then
    printf '  сборка:  берём готовый %s (--skip-build)\n' "$WWW_DIR"
  else
    printf '  сборка:  VITE_API_URL=%s npx quasar build -m capacitor -T android --skip-pkg\n' "$EXPECTED_API_URL"
  fi
  printf '  затем:   zip %s → %s (sha256 hex + base64)\n' "$WWW_DIR" "$ZIP_NAME"
  printf '  контур:  %s:%s\n' "${SERVER:-<сервер не задан>}" "$REMOTE_DIR"
  exit 0
fi

# --- Сборка веб-слоя ---------------------------------------------------------
if [ "$SKIP_BUILD" = '1' ]; then
  step 'Берём готовую веб-сборку (--skip-build)'
else
  step 'Web-часть под Capacitor (только UI)'
  # Адрес контура передаём переменной окружения: Vite отдаёт приоритет `process.env` над
  # env-файлами, а `src/config.js` читает первым `import.meta.env.VITE_API_URL`.
  (cd "$ROOT_DIR" && VITE_API_URL="$EXPECTED_API_URL" npx quasar build -m capacitor -T android --skip-pkg)
fi

[ -f "$WWW_DIR/index.html" ] || fail "Сборка не создала $WWW_DIR/index.html"

# --- Проверка адреса API в собранном бандле ----------------------------------
step 'Адрес API в веб-сборке'
if grep -rq "$EXPECTED_API_URL" "$WWW_DIR/assets" 2>/dev/null; then
  echo "  ✓ в бандле есть $EXPECTED_API_URL"
else
  fail "В собранном бандле нет $EXPECTED_API_URL — мастера уедут на чужой API"
fi

if [ -n "$OTHER_API_URL" ] && [ "$OTHER_API_URL" != "$EXPECTED_API_URL" ] \
  && grep -rq "$OTHER_API_URL" "$WWW_DIR/assets" 2>/dev/null; then
  fail "В бандле есть адрес второго контура ($OTHER_API_URL) — сборка перепутала контур"
fi

# --- Упаковка и хэши ---------------------------------------------------------
step 'Упаковка бандла'
rm -f "$ZIP_PATH"
# Файлы кладём в корень архива: плагин отдаёт содержимое zip как корень веб-сервера.
(cd "$WWW_DIR" && zip -q -r -X "$ZIP_PATH" . -x '.*')

ZIP_SIZE="$(wc -c < "$ZIP_PATH" | tr -d ' ')"
SHA256_HEX="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
SHA256_BASE64="$(openssl dgst -sha256 -binary "$ZIP_PATH" | openssl base64 -A)"

printf '\n  бандл:  %s\n  sha256: %s (hex — это значение сверяет клиент)\n  sha256: %s (base64, справочно)\n  размер: %s байт\n' \
  "$ZIP_PATH" "$SHA256_HEX" "$SHA256_BASE64" "$ZIP_SIZE"

PUBLISH_CMD="$REMOTE_PHP artisan app:publish-bundle storage/app/bundles/$ZIP_NAME"
# ⚠️ Опция — `--bundle-version`, а не `--version`: `--version` у Symfony Console глобальный
# (печатает версию фреймворка и выходит, не доходя до команды) — публикация молча ничего не делала.
PUBLISH_CMD="$PUBLISH_CMD --bundle-version=$(shell_quote "$BUNDLE_VERSION")"
# ⚠️ Хэш передаём в hex: плагин OTA на устройстве сравнивает именно hex-значение
# (base64 он отвергает ошибкой «Checksum mismatch» — проверено живым прогоном 15.09.2026).
PUBLISH_CMD="$PUBLISH_CMD --checksum=$SHA256_HEX"
PUBLISH_CMD="$PUBLISH_CMD --min-native-version=$MIN_NATIVE_VERSION"

if [ -n "$NOTES" ]; then
  PUBLISH_CMD="$PUBLISH_CMD --notes=$(shell_quote "$NOTES")"
fi

if [ "$LOCAL_ONLY" = '1' ] || [ -z "$SERVER" ]; then
  cat <<EOF

Бандл собран. Публикация — командой (или запустите с --server user@host / RELEASE_SERVER):

  ssh $SERVER "mkdir -p $REMOTE_DIR/storage/app/bundles"
  rsync -av "$ZIP_PATH" $SERVER:$REMOTE_DIR/storage/app/bundles/
  ssh $SERVER "cd $REMOTE_DIR && $PUBLISH_CMD"

После публикации проверьте: curl $EXPECTED_API_URL/app-version — в ответе должен быть
объект "bundle" с version $BUNDLE_VERSION и base64-хэшем. Если публикация не выполнялась
(--local-only или сервер не задан) — выполните команды выше вручную на контуре.
EOF
  exit 0
fi

# --- Публикация --------------------------------------------------------------
step "Публикация на $SERVER"
ssh "$SERVER" "mkdir -p '$REMOTE_DIR/storage/app/bundles'"
rsync -av "$ZIP_PATH" "$SERVER:$REMOTE_DIR/storage/app/bundles/"
ssh "$SERVER" "cd '$REMOTE_DIR' && $PUBLISH_CMD"

step 'Проверка /api/app-version'
curl -sS "$EXPECTED_API_URL/app-version"; echo

step 'Готово'


