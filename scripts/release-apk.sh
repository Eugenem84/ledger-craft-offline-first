#!/usr/bin/env bash
#
# scripts/release-apk.sh
#
# Сборка и публикация Android-релиза (Фаза 13, задача 13.4).
#
# Что делает:
#   1) берёт versionCode/versionName из `src-capacitor/android/gradle.properties`;
#   2) собирает web-часть в режиме Capacitor и синхронизирует нативный проект;
#   3) собирает подписанный release APK (подпись — задача 13.3);
#   4) проверяет подпись (apksigner) и печатает sha256;
#   5) публикует релиз на сервере (`php artisan app:publish-apk`) и проверяет
#      `/api/app-version`.
#
# Правило сред (Фаза 11): сначала dev-VPS, на прод — только проверенное.
#
# Примеры:
#   scripts/release-apk.sh --notes "Чиним склад"                # соберёт и покажет команды публикации
#   RELEASE_SERVER=dev-vps scripts/release-apk.sh --notes "…"   # соберёт и опубликует на dev
#   scripts/release-apk.sh --mandatory --min-version 3          # обязательное обновление
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/src-capacitor/android"
GRADLE_PROPERTIES="$ANDROID_DIR/gradle.properties"
REMOTE_DIR="${RELEASE_REMOTE_DIR:-/var/www/LedgerCraftDocker03}"

NOTES=""
MANDATORY=0
MIN_VERSION=0
SERVER="${RELEASE_SERVER:-}"
LOCAL_ONLY=0

usage() {
  cat <<'EOF'
Сборка и публикация Android-релиза.

Использование: scripts/release-apk.sh [ключи]

  --notes "текст"        что нового (попадёт в приложение)
  --mandatory            обязательное обновление (в приложении не будет «позже»)
  --min-version N        минимальный versionCode, который ещё поддерживается
  --server user@host     сервер для публикации (или переменная RELEASE_SERVER)
  --local-only           только собрать, без публикации
  -h, --help             эта справка
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --notes) NOTES="${2:-}"; shift 2 ;;
    --mandatory) MANDATORY=1; shift ;;
    --min-version) MIN_VERSION="${2:-0}"; shift 2 ;;
    --server) SERVER="${2:-}"; shift 2 ;;
    --local-only) LOCAL_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Неизвестный аргумент: $1"; usage; exit 1 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✖ %s\033[0m\n' "$1"; exit 1; }

# --- Версия сборки -----------------------------------------------------------
read_prop() {
  grep -E "^$1=" "$GRADLE_PROPERTIES" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]' || true
}

[ -f "$GRADLE_PROPERTIES" ] || fail "Не найден $GRADLE_PROPERTIES"

VERSION_CODE="$(read_prop APP_VERSION_CODE)"
VERSION_NAME="$(read_prop APP_VERSION_NAME)"

[ -n "$VERSION_CODE" ] || fail 'В gradle.properties не задан APP_VERSION_CODE'
[ -n "$VERSION_NAME" ] || fail 'В gradle.properties не задан APP_VERSION_NAME'

step "Релиз: versionName $VERSION_NAME, versionCode $VERSION_CODE"

# --- Сборка ------------------------------------------------------------------
step 'Web-часть под Capacitor'
(cd "$ROOT_DIR" && npx quasar build -m capacitor -T android)

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

API_URL="${RELEASE_API_URL:-$(grep -E '^VITE_API_URL=' "$ROOT_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)}"

PUBLISH_CMD="php artisan app:publish-apk storage/app/releases/$APK_NAME"
PUBLISH_CMD="$PUBLISH_CMD --version-code=$VERSION_CODE --version-name=$VERSION_NAME"
PUBLISH_CMD="$PUBLISH_CMD --min-version=$MIN_VERSION"

if [ "$MANDATORY" = "1" ]; then
  PUBLISH_CMD="$PUBLISH_CMD --mandatory"
fi

if [ -n "$NOTES" ]; then
  PUBLISH_CMD="$PUBLISH_CMD --notes=$(printf '%q' "$NOTES")"
fi

if [ "$LOCAL_ONLY" = "1" ] || [ -z "$SERVER" ]; then
  cat <<EOF

Релиз собран. Публикация — командой (или запустите с --server user@host / RELEASE_SERVER):

  ssh $SERVER "mkdir -p $REMOTE_DIR/storage/app/releases"
  scp "$APK" $SERVER:$REMOTE_DIR/storage/app/releases/
  ssh $SERVER "cd $REMOTE_DIR && $PUBLISH_CMD"

После публикации проверьте: curl ${API_URL:-https://<домен>/api}/app-version
EOF
  exit 0
fi

# --- Публикация --------------------------------------------------------------
step "Публикация на $SERVER"
ssh "$SERVER" "mkdir -p '$REMOTE_DIR/storage/app/releases'"
scp "$APK" "$SERVER:$REMOTE_DIR/storage/app/releases/"
ssh "$SERVER" "cd '$REMOTE_DIR' && $PUBLISH_CMD"

if [ -n "$API_URL" ]; then
  step "Проверка /api/app-version"
  curl -sS "$API_URL/app-version"; echo
fi

step 'Готово'
