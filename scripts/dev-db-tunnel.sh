#!/usr/bin/env bash
#
# scripts/dev-db-tunnel.sh
#
# Локальный SSH-туннель к базе **dev-контура** Ledger Craft (домашний сервер).
#
# Зачем скрипт: Postgres контуров наружу не публикуется — так требует регламент
# инфраструктуры (`home-server-vps`), порт 5432 живёт только во внутренней сети
# Docker контура. Единственный путь к базе — SSH на домашний сервер. Скрипт
# спрашивает внутренний IP контейнера `ledgercraft-db` и прокидывает в его 5432
# локальный порт (по умолчанию 15433: 5433 на маке занят локальным dev-docker'ом).
#
# Использование (отдельный терминал, пока работаете с базой):
#   bash scripts/dev-db-tunnel.sh                      # 127.0.0.1:15433 → dev
#   LEDGERCRAFT_LOCAL_PORT=15434 bash scripts/dev-db-tunnel.sh
#
# Параметры подключения (SQLTools, psql, DataGrip):
#   host=127.0.0.1  port=15433  database=ledger_craft_db  user=root
#   пароль — `DB_PASSWORD` из `/opt/projects/ledgercraft/.env` на сервере (на dev он
#   же в переменной `POSTGRES_PASSWORD` контейнера `ledgercraft-db`):
#     ssh ledgercraft-home 'docker exec ledgercraft-db printenv POSTGRES_PASSWORD'
#
# Готовая задача VS Code «Dev DB: SSH-туннель» (`.vscode/tasks.json`) запускает этот скрипт.
#
# ⚠️ Внутренний IP контейнера меняется, если контейнер пересоздали
# (`docker compose up -d --build db`) — тогда просто перезапустите скрипт.
#
# ⚠️ Prod-контур (`ledgercraft-prod-db`) так подключать не нужно: там боевые данные,
# доступ — только ручными действиями по регламенту (`LedgerCraftDocker03/DEPLOY.md`).
set -euo pipefail

SSH_HOST="${LEDGERCRAFT_SSH:-ledgercraft-home}"
CONTAINER="${LEDGERCRAFT_DB_CONTAINER:-ledgercraft-db}"
LOCAL_PORT="${LEDGERCRAFT_LOCAL_PORT:-15433}"
REMOTE_PORT="${LEDGERCRAFT_REMOTE_PORT:-5432}"
DATABASE="${LEDGERCRAFT_DB_NAME:-ledger_craft_db}"
DB_USER="${LEDGERCRAFT_DB_USER:-root}"

say() { printf '%s\n' "$*"; }

if lsof -nP -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  say "Порт $LOCAL_PORT уже занят — туннель, скорее всего, уже поднят."
  say "Другой порт: LEDGERCRAFT_LOCAL_PORT=15434 bash $0"
  exit 1
fi

say "Ищу IP контейнера $CONTAINER на ${SSH_HOST}…"
REMOTE_IP="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" \
  "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $CONTAINER" 2>/dev/null || true)"

if [ -z "$REMOTE_IP" ]; then
  say "Не удалось определить IP контейнера $CONTAINER на $SSH_HOST." >&2
  say "Проверьте доступ: ssh $SSH_HOST 'docker ps --filter name=$CONTAINER'" >&2
  exit 1
fi

say "Туннель: 127.0.0.1:$LOCAL_PORT → $REMOTE_IP:$REMOTE_PORT (через $SSH_HOST)"
say "Подключение: host=127.0.0.1 port=$LOCAL_PORT db=$DATABASE user=$DB_USER"
say "Пароль: DB_PASSWORD из /opt/projects/ledgercraft/.env на сервере."
say "Ctrl+C — закрыть туннель."
say ''

exec ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=6 \
  -N -L "$LOCAL_PORT:$REMOTE_IP:$REMOTE_PORT" "$SSH_HOST"
