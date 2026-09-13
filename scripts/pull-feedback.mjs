#!/usr/bin/env node
// scripts/pull-feedback.mjs
//
// Выгрузка отчётов «Сообщить об ошибке» в инбокс репозитория (Фаза 14, задача 14.7).
//
// Последнее звено цепочки: агент/разработчик читает **файлы** рабочего каталога, а не
// БД и не почту. Скрипт тянет `GET /api/feedback` (отдельный pull-токен, не
// пользовательский) и раскладывает: по файлу на отчёт в `feedback/inbox/` плюс
// сводку `feedback/INBOX.md`. Уже выгруженные отчёты запоминаются в
// `feedback/.pulled.json`, чтобы повторный запуск не дублировал записи.
//
// Запуск: `npm run feedback:pull` (см. `feedback/README.md`).
// Адрес API и токен — из `.env.local`/`.env` (`VITE_API_URL`, `FEEDBACK_PULL_TOKEN`)
// или аргументами `--api=`/`--token=`; в git они не попадают.
//
// Флаги: `--all` (выгрузить заново всё), `--since=<ISO/мс>` (только новее),
// `--file=<путь>` (положить отчёт, присланный вручную — аварийный путь 14.5),
// `--api=<url>`, `--token=<token>`.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INBOX_DIR = path.join(root, 'feedback', 'inbox')
const INBOX_FILE = path.join(root, 'feedback', 'INBOX.md')
const PULLED_FILE = path.join(root, 'feedback', '.pulled.json')

const KIND_LABELS = { bug: 'Ошибка', suggestion: 'Предложение', question: 'Вопрос', crash: 'Сбой' }

/** Простой разбор аргументов: `--all`, `--since=x`, `--file=x`, `--api=x`, `--token=x`. */
function parseArgs(argv) {
  const options = { all: false, since: null, file: null, api: null, token: null }

  for (const arg of argv) {
    if (arg === '--all') options.all = true
    else if (arg.startsWith('--since=')) options.since = arg.slice('--since='.length)
    else if (arg.startsWith('--file=')) options.file = arg.slice('--file='.length)
    else if (arg.startsWith('--api=')) options.api = arg.slice('--api='.length)
    else if (arg.startsWith('--token=')) options.token = arg.slice('--token='.length)
  }

  return options
}

/** Читает `.env`-файл (если есть) в объект «ключ → значение»; кавычки снимаем. */
async function readEnvFile(file) {
  try {
    const text = await readFile(file, 'utf8')
    const result = {}

    for (const line of text.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)

      if (!match) continue

      result[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }

    return result
  } catch {
    return {}
  }
}

/** Значение из окружения: сначала `.env.local`, потом `.env`, потом `process.env`. */
async function resolveConfig(cli) {
  const local = await readEnvFile(path.join(root, '.env.local'))
  const base = await readEnvFile(path.join(root, '.env'))

  const api = cli.api || process.env.VITE_API_URL || local.VITE_API_URL || base.VITE_API_URL
  const token = cli.token || process.env.FEEDBACK_PULL_TOKEN || local.FEEDBACK_PULL_TOKEN

  return { api, token }
}

/** Метка времени для имени файла: `2026-09-13_20-11-03`. */
function stamp(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  )
}

function shortId(value) {
  return String(value || 'report').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8) || 'report'
}

/** Строки/секции одного отчёта в markdown — тот же состав, что в диалоге (14.5). */
function renderReport(payload, meta = {}) {
  const report = payload && typeof payload === 'object' ? payload : {}
  const sync = report.sync || {}
  const lines = []

  lines.push(`# Отчёт ${report.uuid_id || meta.uuidId || '—'}`)
  lines.push('')
  lines.push(`- тип: **${KIND_LABELS[report.kind] || report.kind || '—'}**`)
  lines.push(`- создан на устройстве: ${report.client_created_at || '—'}`)
  lines.push(`- получен сервером: ${meta.receivedAt || '—'}`)
  lines.push(`- серверный id: ${meta.serverId ?? '—'} (аккаунт ${meta.userId ?? '—'})`)
  lines.push(`- экран: ${report.screen || '—'}`)
  lines.push(`- контакт: ${report.contact || '—'}`)
  lines.push('')
  lines.push('## текст мастера')
  lines.push('')
  lines.push(report.message || '_(пусто)_')
  lines.push('')
  lines.push('## окружение')
  lines.push('')
  lines.push(`- версия приложения: ${report.app_version || 'неизвестна'}`)
  lines.push(`- платформа: ${report.platform || '—'} ${report.platform_version || ''}`.trim())
  lines.push(`- API_URL: ${report.api_url || '—'}`)
  lines.push(`- схема: эталон ${report.schema_version ?? '?'} · в БД ${report.schema_stored ?? '?'}`)
  lines.push(`- аккаунт: ${report.account || '—'}`)
  lines.push(`- профиль: ${report.profile || '—'}`)
  lines.push('')
  lines.push('## синхронизация')
  lines.push('')

  const syncKeys = Object.keys(sync)

  if (!syncKeys.length) lines.push('- _(снимок не приложен)_')
  else for (const key of syncKeys) lines.push(`- ${key}: ${sync[key]}`)

  lines.push('')
  lines.push(`## ошибки (${(report.errors || []).length})`)
  lines.push('')
  for (const entry of report.errors || []) {
    lines.push(`- ${entry.time || ''} [${entry.level || 'error'}] ${entry.message || ''}`)
  }
  if (!(report.errors || []).length) lines.push('- _(нет)_')

  lines.push('')
  lines.push(`## логи (${(report.logs || []).length})`)
  lines.push('')
  for (const entry of report.logs || []) {
    lines.push(`- ${entry.time || ''} [${entry.level || 'log'}] ${entry.message || ''}`)
  }
  if (!(report.logs || []).length) lines.push('- _(не приложены)_')
  lines.push('')

  return lines.join('\n')
}

/** Сводка `feedback/INBOX.md`: свежие сверху, ссылка на файл + краткая суть. */
function renderIndex(entries) {
  const lines = [
    '# INBOX — отчёты «Сообщить об ошибке» (Фаза 14)',
    '',
    'Файл собирается командой `npm run feedback:pull` (см. `feedback/README.md`).',
    'Свежие отчёты — сверху. Сырые отчёты лежат в `feedback/inbox/`; оба каталога в `.gitignore`.',
    'Разбор каждого отчёта фиксируется в `feedback/DECISIONS.md` (правило 14.9).',
    '',
    `Обновлён: ${new Date().toLocaleString('ru-RU')} · отчётов: ${entries.length}`,
    '',
    '| Создан | Тип | Аккаунт | Файл | Текст |',
    '|---|---|---|---|---|',
  ]

  for (const entry of entries) {
    lines.push(
      `| ${entry.createdAt || '—'} | ${KIND_LABELS[entry.kind] || entry.kind || '—'} | ` +
        `${entry.account || '—'} | \`${entry.fileName}\` | ${entry.summary} |`
    )
  }

  lines.push('')

  return lines.join('\n')
}

/** Короткий однострочный текст отчёта для таблицы (без переводов строк и «|»). */
function summaryOf(message) {
  const text = String(message || '').replace(/\s+/g, ' ').replace(/\|/g, '/')

  return text.length > 80 ? `${text.slice(0, 79)}…` : text
}

async function readPulled() {
  try {
    const parsed = JSON.parse(await readFile(PULLED_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writePulled(state) {
  await writeFile(PULLED_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

/** Собирает `INBOX.md` из уже лежащих в `inbox/` файлов (индекс по имени файла). */
async function rebuildIndex(entries) {
  const sorted = entries.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))

  await writeFile(INBOX_FILE, renderIndex(sorted), 'utf8')
}

/** Ручной путь: положить отчёт, присланный мастером, в `feedback/inbox/`. */
async function addManualFile(sourceFile, state) {
  const absolute = path.resolve(process.cwd(), sourceFile)
  const content = await readFile(absolute, 'utf8').catch(() => null)

  if (content == null) {
    throw new Error(`Файл не найден: ${absolute}`)
  }

  const fileName = `${stamp()}-manual-${path.basename(sourceFile).replace(/[^a-zA-Z0-9._-]/g, '')}`

  await copyFile(absolute, path.join(INBOX_DIR, fileName))

  const firstLine = content.split('\n').find(line => line.trim()) || ''

  state.reports[`manual:${fileName}`] = {
    fileName,
    createdAt: new Date().toISOString(),
    kind: 'manual',
    account: '',
    summary: summaryOf(firstLine.replace(/^#\s*/, '')),
  }

  return fileName
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { api, token } = await resolveConfig(options)
  const state = await readPulled()

  state.reports = state.reports && typeof state.reports === 'object' ? state.reports : {}

  await mkdir(INBOX_DIR, { recursive: true })

  if (options.file) {
    const fileName = await addManualFile(options.file, state)

    await writePulled(state)
    await rebuildIndex(Object.values(state.reports))

    console.log(`Положил отчёт в feedback/inbox/${fileName}`)
    console.log('Разберите его и запишите вердикт в feedback/DECISIONS.md (правило 14.9).')
    return
  }

  if (!api) {
    throw new Error('Не задан адрес API: пропишите VITE_API_URL в .env.local или передайте --api=')
  }

  if (!token) {
    throw new Error(
      'Не задан FEEDBACK_PULL_TOKEN: возьмите его на сервере (env) и пропишите в .env.local или передайте --token='
    )
  }

  const url = new URL(`${api.replace(/\/$/, '')}/feedback`)
  url.searchParams.set('limit', '200')

  if (!options.all && state.lastPulledAt) {
    url.searchParams.set('since', state.lastPulledAt)
  }

  const response = await fetch(url, { headers: { 'X-Feedback-Token': token } })

  if (response.status === 403) {
    throw new Error('Сервер отклонил pull-токен (403): проверьте FEEDBACK_PULL_TOKEN')
  }

  if (!response.ok) {
    throw new Error(`Сервер ответил ${response.status} ${response.statusText}`)
  }

  const body = await response.json()
  const reports = Array.isArray(body?.reports) ? body.reports : []
  let added = 0

  for (const record of reports) {
    const uuid = String(record.uuid_id || record.uuidId || '')

    if (!uuid || (state.reports[uuid] && !options.all)) continue

    const payload = record.payload || {}
    const fileName = `${stamp()}-${shortId(uuid)}.md`
    const markdown = renderReport(payload, {
      receivedAt: record.created_at || record.createdAt || '',
      serverId: record.server_id ?? record.serverId ?? null,
      userId: record.user_id ?? record.userId ?? null,
      uuidId: uuid,
    })

    await writeFile(path.join(INBOX_DIR, fileName), markdown, 'utf8')

    state.reports[uuid] = {
      fileName,
      createdAt: payload.client_created_at || record.created_at || '',
      kind: payload.kind || 'bug',
      account: payload.account || '',
      summary: summaryOf(payload.message),
      serverId: record.server_id ?? null,
    }

    added += 1
  }

  state.lastPulledAt = new Date().toISOString()

  await writePulled(state)
  await rebuildIndex(Object.values(state.reports))

  console.log(
    `Выгружено новых отчётов: ${added} (в инбоксе всего: ${Object.keys(state.reports).length})`
  )
  console.log('Инбокс для чтения: feedback/INBOX.md; вердикты — в feedback/DECISIONS.md')
}

main().catch(error => {
  console.error(`[feedback:pull] ${error?.message || error}`)
  process.exitCode = 1
})
