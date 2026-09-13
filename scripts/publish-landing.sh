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
# Примеры:
#   scripts/publish-landing.sh                            # dev-VPS (по умолчанию)
#   scripts/publish-landing.sh --server prod-vps          # другой контур
#   scripts/publish-landing.sh --url https://example/promo/
#   scripts/publish-landing.sh --dry-run                  # только показать, что уедет
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/landing"

REMOTE_ROOT="${LANDING_REMOTE_ROOT:-/var/www/LedgerCraftDocker03/public/promo}"
SERVER="${LANDING_SERVER:-dev-vps}"
URL="${LANDING_URL:-https://dev.medovf2h.beget.tech/promo/}"

DRY_RUN=0
DRY_ARG=""

usage() {
  cat <<'EOF'
Публикация промо-страницы Ledger Craft.

Использование: scripts/publish-landing.sh [ключи]

  --server SSH          сервер из ~/.ssh/config (или LANDING_SERVER)
  --remote-root PATH    куда класть файлы (или LANDING_REMOTE_ROOT)
  --url URL             адрес для проверки после выката (или LANDING_URL)
  --dry-run             ничего не копировать, только показать список файлов
  -h, --help            эта справка
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --server) SERVER="${2:-}"; shift 2 ;;
    --remote-root) REMOTE_ROOT="${2:-}"; shift 2 ;;
    --url) URL="${2:-}"; shift 2 ;;
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

step "Готово: ${URL%/}/"
