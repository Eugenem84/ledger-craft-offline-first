#!/usr/bin/env bash
#
# scripts/release-apk.sh
#
# Сборка и публикация Android-релиза (Фаза 13, задача 13.4).
#
# Что делает:
#   1) берёт versionCode/versionName из `src-capacitor/android/gradle.properties`;
#   2) собирает web-часть в режиме Capacitor **с адресом нужного контура** и
#      синхронизирует нативный проект;
#   3) собирает подписанный release APK (подпись — задача 13.3);
#   4) проверяет подпись (apksigner) и печатает sha256;
#   5) публикует релиз на сервере (`php artisan app:publish-apk`) и проверяет
#      `/api/app-version`.
#
# Контуры: одна полоса проверки — **релизная сборка** (решение 14.09.2026)
#   • `--channel dev`  — релизный APK с адресом dev-API: обкатка и проверка обновлений
#     на dev-контуре, оттуда же его отдаёт промо-страница `/promo/`;
#   • `--channel prod` — тот же код, пересобранный с адресом prod-API, публикация на боевой
#     контур (задача 11.12);
#   • debug-вариант (`applicationIdSuffix '.debug'` → `com.ledgercraft.app.debug`, задача
#     13.16) — только инструмент разработчика (`chrome://inspect`, live-reload): на телефоне
#     для проверок не гоняется и никуда не выкладывается.
#
# Почему адрес контура задаётся здесь, а не env-файлом: `quasar build` — это всегда
# buildType=prod, поэтому `.env.prod` подхватился бы **и для dev-контура**; а `src/config.js`
# читает первым `import.meta.env.VITE_API_URL`, который Vite наполняет из `.env`/`.env.production`
# (и перекрывает значением из окружения). Значит контур — параметр сборки, см. `VITE_API_URL`
# в шаге «Web-часть под Capacitor».
#
# Примеры:
#   npm run release:android -- --channel dev --notes "Чиним склад"     # соберёт и покажет команды публикации
#   RELEASE_SERVER=ledgercraft-home npm run release:android -- --channel dev   # домашний контур (текущий dev)
#   npm run release:android -- --channel dev --dry-run                 # план без сборки (что и куда уедет)
#   RELEASE_SERVER=prod-vps RELEASE_REMOTE_DIR=/var/www/<prod> \
#     RELEASE_API_URL=https://<prod-домен>/api \
#     npm run release:android -- --channel prod --notes "Первый боевой"
#
# ⚠️ Для prod-контура адрес, сервер и каталог обязательны явно, а `versionCode` обязан быть
# выше опубликованного на контуре (иначе Android не поставит APK — проверяется до сборки).
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/src-capacitor/android"
GRADLE_PROPERTIES="$ANDROID_DIR/gradle.properties"
# Каталог публикации по умолчанию — домашний контур (текущий dev); пути контуров разные, для prod задаётся явно.
REMOTE_DIR="${RELEASE_REMOTE_DIR:-/opt/projects/ledgercraft/backend}"
REMOTE_DIR_EXPLICIT="${RELEASE_REMOTE_DIR:+1}"
# Чем запускать artisan на контуре. На домашнем сервере (текущий dev) PHP-расширения
# (pdo_pgsql) есть только в контейнере, поэтому по умолчанию идём через `docker exec`.
# Для прежнего dev-VPS (страховка/откат) задайте явно:
#   RELEASE_SERVER=dev-vps RELEASE_REMOTE_DIR=/var/www/LedgerCraftDocker03 RELEASE_REMOTE_PHP=php
REMOTE_PHP="${RELEASE_REMOTE_PHP:-docker exec ledgercraft-app php}"

CHANNEL="${RELEASE_CHANNEL:-dev}"

NOTES=""
MANDATORY=0
MIN_VERSION=0
SERVER="${RELEASE_SERVER:-}"
LOCAL_ONLY=0
WITH_BUNDLE=0
DRY_RUN=0
ALLOW_LOCAL=0

usage() {
  cat <<'EOF'
Сборка и публикация Android-релиза.

Использование: scripts/release-apk.sh [ключи]

  --channel dev|prod     контур: чей адрес API уедет в APK (или RELEASE_CHANNEL, по умолчанию dev)
  --notes "текст"        что нового: пункты через запятую или с новой строки (в приложении
                         показываются списком через тире)
  --mandatory            обязательное обновление (в приложении не будет «позже»)
  --min-version N        минимальный versionCode, который ещё поддерживается
  --server user@host     сервер для публикации (или переменная RELEASE_SERVER)
  --remote-dir PATH      каталог репозитория на контуре (или RELEASE_REMOTE_DIR)
  --local-only           только собрать, без публикации
  --with-bundle          после APK выложить и OTA-бандл из того же кода (одна команда на релиз,
                         где меняется нативная часть; см. README §«Нативное обновление»)
  --dry-run              показать план (контур, адрес, версия на контуре) и выйти
  --allow-local          разрешить локальный адрес API (по умолчанию это ошибка)
  -h, --help             эта справка

Контуры: dev — адрес из RELEASE_API_URL/.env/.env.local; prod — обязательны
RELEASE_API_URL (https), --server и --remote-dir. Публикация никогда не отдаёт APK
с versionCode не выше уже опубликованного на контуре.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --notes) NOTES="${2:-}"; shift 2 ;;
    --mandatory) MANDATORY=1; shift ;;
    --min-version) MIN_VERSION="${2:-0}"; shift 2 ;;
    --channel) CHANNEL="${2:-}"; shift 2 ;;
    --server) SERVER="${2:-}"; shift 2 ;;
    --remote-dir) REMOTE_DIR="${2:-}"; REMOTE_DIR_EXPLICIT=1; shift 2 ;;
    --local-only) LOCAL_ONLY=1; shift ;;
    --with-bundle) WITH_BUNDLE=1; shift ;;
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

step "Релиз: versionName $VERSION_NAME, versionCode $VERSION_CODE (контур: $CHANNEL)"

# --- Контур: чей адрес API уедет в APK ---------------------------------------
# Адрес выбирается **здесь**, а не env-файлом: `quasar build` — всегда buildType=prod,
# поэтому `.env.prod` подхватился бы и для dev-контура, а до клиента доходит
# `import.meta.env.VITE_API_URL` (Vite: `.env`/`.env.production`, приоритет у окружения).
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
      fail "В релизной сборке локальный адрес API: $EXPECTED_API_URL (для отладки — --allow-local)" ;;
  esac
fi

# Адрес второго контура — чтобы поймать «уехал чужой» на шаге проверки бандла.
if [ "$CHANNEL" = 'prod' ]; then
  OTHER_API_URL="$ENV_URL"
else
  OTHER_API_URL="$PROD_API_URL"
fi

# Публикация на prod требует явных сервера и каталога: пути контуров разные, а цена
# ошибки — релиз не на том сервере.
if [ "$CHANNEL" = 'prod' ] && [ "$LOCAL_ONLY" != '1' ]; then
  [ -n "$SERVER" ] || fail 'Для prod-контура задайте сервер: RELEASE_SERVER=prod-vps или --server'
  [ "$REMOTE_DIR_EXPLICIT" = '1' ] || fail 'Для prod-контура задайте каталог: RELEASE_REMOTE_DIR=/var/www/<prod> или --remote-dir'
fi

step "Контур $CHANNEL: адрес API $EXPECTED_API_URL"

# --- Версия на контуре (до сборки) -------------------------------------------
# Android не ставит APK с `versionCode` меньше или равным установленному, поэтому
# публикация «вниз» = у мастеров навсегда «обновление не встаёт». Проверяем манифест
# контура заранее — до двухминутной сборки.
CONTOUR_CURRENT_CODE="$(
  curl -sS -m 20 "$EXPECTED_API_URL/app-version" 2>/dev/null \
    | grep -o '"versionCode"[[:space:]]*:[[:space:]]*[0-9]\+' \
    | grep -o '[0-9]\+$' | head -1 || true
)"

if [ -n "$CONTOUR_CURRENT_CODE" ]; then
  step "На контуре уже опубликован versionCode $CONTOUR_CURRENT_CODE"
  if [ "$VERSION_CODE" -le "$CONTOUR_CURRENT_CODE" ]; then
    fail "versionCode $VERSION_CODE не выше опубликованного ($CONTOUR_CURRENT_CODE) — поднимите APP_VERSION_CODE"
  fi
elif [ "$CHANNEL" = 'prod' ] && [ "$LOCAL_ONLY" != '1' ]; then
  fail "Не удалось прочитать $EXPECTED_API_URL/app-version — выкат на prod вслепую запрещён"
else
  echo '⚠️  Манифест контура недоступен — проверка «версия растёт» пропущена'
fi

if [ "$DRY_RUN" = '1' ]; then
  step 'Dry-run: сборка и публикация не выполняются'
  printf '  сборка:  VITE_API_URL=%s npx quasar build -m capacitor -T android\n' "$EXPECTED_API_URL"
  printf '  затем:   npx cap sync android && ./gradlew --no-daemon assembleRelease\n'
  printf '  контур:  %s:%s\n' "${SERVER:-<сервер не задан>}" "$REMOTE_DIR"

  if [ "$WITH_BUNDLE" = '1' ]; then
    printf '  бандл:   bash scripts/release-web.sh --channel %s --skip-build --min-native-version %s\n' \
      "$CHANNEL" "$VERSION_CODE"
  fi

  exit 0
fi

# --- Сборка ------------------------------------------------------------------
step 'Web-часть под Capacitor'
# Адрес контура передаём переменной окружения: Vite отдаёт приоритет `process.env` над
# env-файлами (`loadEnv`), а `src/config.js` читает `import.meta.env.VITE_API_URL`.
(cd "$ROOT_DIR" && VITE_API_URL="$EXPECTED_API_URL" npx quasar build -m capacitor -T android)

# --- Проверка адреса API в собранном бандле ----------------------------------
# Дефект живого прогона 14.11: если в APK уезжает «не тот» адрес API, приложение
# выглядит как «не видит сервер» — ни синка, ни проверки версии, запросы просто не
# уходят (в логах сервера тишина). Ловим это на сборке, а не глазами мастера.
step 'Адрес API в веб-сборке'
if grep -rq "$EXPECTED_API_URL" "$ROOT_DIR/src-capacitor/www/assets" 2>/dev/null; then
  echo "  ✓ в бандле есть $EXPECTED_API_URL"
else
  fail "В собранном бандле нет $EXPECTED_API_URL — APK уйдёт с чужим адресом API"
fi

if [ -n "$OTHER_API_URL" ] && [ "$OTHER_API_URL" != "$EXPECTED_API_URL" ] \
  && grep -rq "$OTHER_API_URL" "$ROOT_DIR/src-capacitor/www/assets" 2>/dev/null; then
  fail "В бандле есть адрес второго контура ($OTHER_API_URL) — сборка перепутала контур"
fi

step 'Синхронизация нативного проекта'
(cd "$ROOT_DIR/src-capacitor" && npx cap sync android)

step 'Сборка release APK'
(cd "$ANDROID_DIR" && ./gradlew --no-daemon assembleRelease)

APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
UNSIGNED_APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release-unsigned.apk"

if [ ! -f "$APK" ] && [ -f "$UNSIGNED_APK" ]; then
  fail "Собран неподписанный APK: нет src-capacitor/android/keystore.properties (см. keystore.properties.example)"
fi

[ -f "$APK" ] || fail "Не нашли собранный APK: $APK"

# --- Подпись и хэш -----------------------------------------------------------
step 'Проверка подписи'
APKSIGNER="$(command -v apksigner || true)"

if [ -z "$APKSIGNER" ] && [ -n "${ANDROID_HOME:-}" ]; then
  APKSIGNER="$(ls "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | tail -1 || true)"
fi

if [ -n "$APKSIGNER" ]; then
  "$APKSIGNER" verify --print-certs "$APK"
else
  echo '⚠️  apksigner не найден: подпись проверьте вручную (Android Studio → Build → Analyze APK)'
fi

SHA256="$(shasum -a 256 "$APK" | awk '{print $1}')"
SIZE_BYTES="$(wc -c < "$APK" | tr -d ' ')"
APK_NAME="$(basename "$APK")"

printf '\n  APK:    %s\n  sha256: %s\n  размер: %s байт\n' "$APK" "$SHA256" "$SIZE_BYTES"

API_URL="$EXPECTED_API_URL"

if [ "$CHANNEL" = 'prod' ]; then
  step 'Напоминание для боевого контура'
  cat <<'EOF'
  • перед установкой prod-сборки на телефон: снести приложение (или «полный сброс»
    в «Режиме разработчика») — иначе тестовые данные с dev уедут первым же синком
    в боевую базу, а токен, выданный на dev, даст 401;
  • проверить у мастера: чип «доступна версия …» → обновление встаёт поверх, данные целы.
EOF
fi

PUBLISH_CMD="$REMOTE_PHP artisan app:publish-apk storage/app/releases/$APK_NAME"
PUBLISH_CMD="$PUBLISH_CMD --version-code=$VERSION_CODE --version-name=$VERSION_NAME"
PUBLISH_CMD="$PUBLISH_CMD --min-version=$MIN_VERSION"

if [ "$MANDATORY" = "1" ]; then
  PUBLISH_CMD="$PUBLISH_CMD --mandatory"
fi

if [ -n "$NOTES" ]; then
  PUBLISH_CMD="$PUBLISH_CMD --notes=$(shell_quote "$NOTES")"
fi

if [ "$LOCAL_ONLY" = "1" ] || [ -z "$SERVER" ]; then
  cat <<EOF

Релиз собран. Публикация — командой (или запустите с --server user@host / RELEASE_SERVER):

  ssh $SERVER "mkdir -p $REMOTE_DIR/storage/app/releases"
  rsync -av "$APK" $SERVER:$REMOTE_DIR/storage/app/releases/
  ssh $SERVER "cd $REMOTE_DIR && $PUBLISH_CMD"

После публикации проверьте: curl ${API_URL:-https://<домен>/api}/app-version
EOF

  if [ "$WITH_BUNDLE" = '1' ]; then
    BUNDLE_HINT="bash scripts/release-web.sh --channel $CHANNEL --skip-build --min-native-version $VERSION_CODE"

    if [ "$LOCAL_ONLY" = '1' ]; then
      BUNDLE_HINT="$BUNDLE_HINT --local-only"
    fi

    if [ -n "$NOTES" ]; then
      BUNDLE_HINT="$BUNDLE_HINT --notes=$(shell_quote "$NOTES")"
    fi

    printf '\nOTA-бандл из той же веб-сборки — отдельной командой:\n\n  %s\n' "$BUNDLE_HINT"
  fi

  exit 0
fi

# --- Публикация --------------------------------------------------------------
step "Публикация на $SERVER"
ssh "$SERVER" "mkdir -p '$REMOTE_DIR/storage/app/releases'"
rsync -av "$APK" "$SERVER:$REMOTE_DIR/storage/app/releases/"
ssh "$SERVER" "cd '$REMOTE_DIR' && $PUBLISH_CMD"

if [ -n "$API_URL" ]; then
  step "Проверка /api/app-version"
  curl -sS "$API_URL/app-version"; echo
fi

# --- OTA-бандл из того же кода (задача 15.19) --------------------------------
# Зачем: после нативного релиза на контуре не должен остаться бандл, собранный для прошлой
# сборки (иначе новый APK увидит «обновление без установки» на старый веб-слой). `--skip-build`
# берёт уже собранный `src-capacitor/www` — тот же код, что уехал в APK, — а
# `--min-native-version $VERSION_CODE` помечает, для какой сборки бандл собран: на этом
# основан клиентский запрет «понижения» (задача 15.16).
if [ "$WITH_BUNDLE" = '1' ]; then
  step 'OTA-бандл из того же кода'
  BUNDLE_ARGS=(--channel "$CHANNEL" --skip-build --min-native-version "$VERSION_CODE")

  if [ "$ALLOW_LOCAL" = '1' ]; then
    BUNDLE_ARGS+=(--allow-local)
  fi

  if [ -n "$NOTES" ]; then
    BUNDLE_ARGS+=(--notes "$NOTES")
  fi

  (cd "$ROOT_DIR" && bash scripts/release-web.sh "${BUNDLE_ARGS[@]}")
fi

step 'Готово'
