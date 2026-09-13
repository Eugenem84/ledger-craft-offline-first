#!/usr/bin/env bash
#
# scripts/publish-landing.sh
#
# Публикация промо-страницы (`landing/`) на контур.
#
# Почему просто копирование: nginx контура монтирует корень Laravel-репозитория в
# `/var/www` и отдаёт статику из `/var/www/public` (`root /var/www/public;` +
# `try_files $uri $uri/ /index.php?$query_string`). Значит файлы, положенные в
# `public/promo/`, доступны по `/promo/` **сразу** — без правки конфига nginx и без
# перезапуска контейнера. Скрипт копирует `landing/` (без служебного `README.md`)
# и проверяет, что страница и ассеты отвечают `200`.
#
# Контуры (решение 14.09.2026): страница спрашивает `/app-version` **у своего контура** —
# dev-промо отдаёт релизный APK с dev-адресом, боевое промо — с боевым. Поэтому при
# выкате на боевой контур передавайте и `--api`, и `--url`: `--api` подставляет адрес в
# копию `index.html` (файл в git не меняется), `--url` проверяет опубликованную страницу.
# ⚠️ prod-VPS ещё не поднят (задача 11.12) — боевой выкат станет возможен после него.
#
# Примеры:
#   scripts/publish-landing.sh                            # dev-VPS (по умолчанию), адрес из index.html
#   scripts/publish-landing.sh --dry-run                  # только показать, что уедет
#   scripts/publish-landing.sh --server prod-vps \
#     --url https://<prod-домен>/promo/ --api https://<prod-домен>/api
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/landing"

REMOTE_ROOT="${LANDING_REMOTE_ROOT:-/var/www/LedgerCraftDocker03/public/promo}"
SERVER="${LANDING_SERVER:-dev-vps}"
URL="${LANDING_URL:-https://dev.medovf2h.beget.tech/promo/}"
API="${LANDING_API:-}"

URL_EXPLICIT="${LANDING_URL:+1}"
DRY_RUN=0
DRY_ARG=""
STAGE_DIR=""

cleanup() {
  if [ -n "$STAGE_DIR" ]; then
    rm -rf "$STAGE_DIR"
  fi
}

trap cleanup EXIT

usage() {
  cat <<'EOF'
Публикация промо-страницы Ledger Craft.

Использование: scripts/publish-landing.sh [ключи]

  --server SSH          сервер из ~/.ssh/config (или LANDING_SERVER)
  --remote-root PATH    куда класть файлы (или LANDING_REMOTE_ROOT)
  --url URL             адрес для проверки после выката (или LANDING_URL);
                        обязателен для не-dev сервера
  --api URL             адрес API контура: подставляется в index.html при выкате
                        (или LANDING_API). Для боевого контура обязателен
  --dry-run             ничего не копировать, только показать список файлов
  -h, --help            эта справка
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --server) SERVER="${2:-}"; shift 2 ;;
    --remote-root) REMOTE_ROOT="${2:-}"; shift 2 ;;
    --url) URL="${2:-}"; URL_EXPLICIT=1; shift 2 ;;
    --api) API="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Неизвестный аргумент: $1"; usage; exit 1 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✖ %s\033[0m\n' "$1"; exit 1; }

[ -d "$SOURCE_DIR" ] || fail "Не найдена папка лендинга: $SOURCE_DIR"
[ -f "$SOURCE_DIR/index.html" ] || fail "В $SOURCE_DIR нет index.html"
command -v rsync >/dev/null 2>&1 || fail 'Не найден rsync'

# Не-dev контур: адрес проверки и адрес API обязаны быть заданы явно — иначе страница
# уедет на боевой хост, а спрашивать версию и APK будет у dev (и проверка HTTP пойдёт
# по dev-адресу, то есть промолчит).
if [ "$SERVER" != 'dev-vps' ]; then
  [ "$URL_EXPLICIT" = '1' ] || fail "Для контура '$SERVER' задайте адрес страницы: --url https://<домен>/promo/"
  [ -n "$API" ] || fail "Для контура '$SERVER' задайте адрес API: --api https://<домен>/api"
fi

# --- Адрес API контура на странице -------------------------------------------
# `--api` подставляет адрес в **копию** `index.html` (в git файл не меняется): у промо
# на dev-контуре должен быть dev-адрес, у боевого промо — боевой, иначе страница отдаёт
# APK и версию чужого контура.
if [ -n "$API" ]; then
  STAGE_DIR="$(mktemp -d)"
  cp -R "$SOURCE_DIR/." "$STAGE_DIR/"
  sed -i.bak -E "s#(window\.LEDGER_CRAFT_API = window\.LEDGER_CRAFT_API \|\| ')[^']*(')#\1${API}\2#" \
    "$STAGE_DIR/index.html"
  rm -f "$STAGE_DIR/index.html.bak"
  grep -q "$API" "$STAGE_DIR/index.html" || fail "Не удалось подставить адрес $API в index.html"
  SOURCE_DIR="$STAGE_DIR"
  step "Адрес API на странице: $API"
fi

if [ "$DRY_RUN" = "1" ]; then
  DRY_ARG="--dry-run"
fi

step "Промо-страница: $SERVER:$REMOTE_ROOT"
# `--delete` убирает устаревшие файлы (например, старые хэши ассетов) — каталог
# полностью принадлежит лендингу. `README.md` не публикуем: это внутренняя инструкция.
# shellcheck disable=SC2086
rsync -av --delete --exclude 'README.md' $DRY_ARG \
  "$SOURCE_DIR/" "$SERVER:$REMOTE_ROOT/"

if [ "$DRY_RUN" = "1" ]; then
  step 'Dry-run: копирование пропущено'
  exit 0
fi

step 'Проверка HTTP'
check() {
  local path="$1"
  local code
  code="$(curl -s -m 20 -o /dev/null -w '%{http_code}' "${URL%/}${path}")"

  if [ "$code" != "200" ]; then
    fail "${URL%/}${path} → ${code} (ожидали 200)"
  fi

  printf '  %-16s → %s\n' "$path" "$code"
}

check '/'
check '/landing.css'
check '/landing.js'

if [ -n "$API" ]; then
  step 'Проверка адреса API на опубликованной странице'
  if curl -s -m 20 "${URL%/}/index.html" | grep -q "$API"; then
    printf '  ✓ страница спрашивает версию у %s\n' "$API"
  else
    fail "На ${URL%/}/index.html нет адреса $API — страница осталась на чужом контуре"
  fi
fi

step "Готово: ${URL%/}/"
