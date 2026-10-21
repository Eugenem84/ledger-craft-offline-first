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
// Адрес API — `.env.local` → `.env` (`VITE_API_URL`; `.env` отслеживается git'ом и
// содержит только безопасный дефолт dev-контура), либо аргумент `--api=`.
// Токен выгрузки — **только** `.env.local` (`FEEDBACK_PULL_TOKEN`, он в .gitignore) или
// `--token=`. В `.env` секреты не вписываем никогда: файл лежит в публичном репозитории
// (гигиена секретов — инфра-репозиторий, docs/04-security.md §10).
//
// Флаги: `--all` (выгрузить заново всё), `--since=<ISO/мс>` (только новее),
// `--file=<путь>` (положить отчёт, присланный вручную — аварийный путь 14.5),
// `--api=<url>`, `--token=<token>`.
//
// Разбор отчёта (задача 14.9; доработка 16.10.2026). У отчёта в контуре есть **статус
// разбора** (`new`/`read`/`accepted`/`rejected`) и заметка «что сделано» (`resolution_note`).
// Их показывает домашний монитор (`homestatus` → `home-monitor-app`, экран «Фитбек»),
// поэтому разбор **не закрыт**, пока статус не проставлен в контуре: иначе отчёт числится
// «не разобран», хотя задача давно сделана и выкачена. Пишем через тот же pull-токен:
//   `--check`                                что в контуре ещё не разобрано (только чтение);
//   `--mark=accepted --uuid=<id> --note="…"` проставить статус и заметку; `--uuid` — полный
//                                            id или префикс, можно несколько раз/через запятую;
//   `--mark=rejected` без `--uuid`           пометить отчёты, выгруженные этим запуском.
//
// Курсор выгрузки ведётся **по контурам** (`feedback/.pulled.json` → `contours.<адрес>`),
// поэтому выгрузка с dev и prod больше не «съедает» отчёты друг друга (задача 14.31);
// `--file=` файл отчёта уже не перезаписывается при повторной выгрузке того же uuid.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INBOX_DIR = path.join(root, 'feedback', 'inbox')
const INBOX_FILE = path.join(root, 'feedback', 'INBOX.md')
const PULLED_FILE = path.join(root, 'feedback', '.pulled.json')

const KIND_LABELS = { bug: 'Ошибка', suggestion: 'Предложение', question: 'Вопрос', crash: 'Сбой' }

/** Статусы разбора отчёта — те же, что принимает `PATCH /api/feedback/{uuid_id}`. */
export const STATUSES = ['new', 'read', 'accepted', 'rejected']

/** Принимает ли контур такой статус (проверяем до сетевого вызова). */
export function isValidStatus(value) {
  return STATUSES.includes(String(value))
}

/**
 * Ключ контура для курсора выгрузки: адрес без схемы, пути и хвостового слэша
 * (`https://ledgercraft.ru/api` → `ledgercraft.ru`). Схему отбрасываем осознанно:
 * dev и prod различаются доменом, а не протоколом (задача 14.31).
 */
export function contourKey(api) {
  const text = String(api || '').trim()

  return text.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '').split('/')[0].toLowerCase()
}

/**
 * С какой отметки читать выдачу: явный `--since` важнее курсора, `--all` — читать всё.
 * Курсор свой у каждого контура: раньше он был один на репозиторий, и выгрузка с prod
 * «съедала» отчёты dev-контура (они потом не появлялись в инбоксе — задача 14.31).
 */
export function resolveSince({ options = {}, state = {}, api } = {}) {
  if (options.all) return null
  if (options.since) return String(options.since)

  const contours = state.contours && typeof state.contours === 'object' ? state.contours : {}
  const entry = contours[contourKey(api)]

  return entry?.lastPulledAt || null
}

/**
 * Имя файла отчёта в инбоксе: уже выгруженный отчёт **не переписываем** новым именем.
 * Иначе `--all` плодил дубликаты файлов одного и того же отчёта (задача 14.31).
 */
export function fileNameFor(uuid, existing, stampValue) {
  return existing?.fileName || `${stampValue}-${shortId(uuid)}.md`
}

/**
 * Какие отчёты помечать: явные `--uuid` (полный id или префикс) либо то, что выгружено
 * этим запуском. Ошибки — заранее и словами: мусор в `--uuid` не должен молча ничего не делать.
 *
 * @param {{mark?: string|null, uuid?: Array<string>}} options
 * @param {Array<{uuid_id?: string, uuidId?: string}>} reports все отчёты контура (из выдачи)
 * @param {Array<string>} pulledNow uuid, выгруженные этим запуском
 * @returns {Array<string>} полные uuid для пометки
 */
export function resolveMarkTargets(options = {}, reports = [], pulledNow = []) {
  const available = reports
    .map(record => String(record.uuid_id || record.uuidId || ''))
    .filter(Boolean)

  const requested = options.uuid && options.uuid.length ? options.uuid : null

  if (!requested) {
    if (!pulledNow.length) {
      throw new Error(
        'Нечего помечать: этим запуском новых отчётов нет — укажите --uuid=<id|префикс>'
      )
    }

    return pulledNow
  }

  return requested.map(value => {
    const wanted = String(value).trim().toLowerCase()
    const matches = available.filter(uuid => uuid.toLowerCase().startsWith(wanted))

    if (!matches.length) throw new Error(`Отчёт «${value}» не найден в контуре`)
    if (matches.length > 1) throw new Error(`Префикс «${value}» подходит нескольким отчётам: ${matches.join(', ')}`)

    return matches[0]
  })
}

/** Простой разбор аргументов: `--all`, `--since=x`, `--file=x`, `--api=x`, `--token=x`, `--check`, `--mark=`, `--uuid=`, `--note=`. */
export function parseArgs(argv) {
  const options = {
    all: false,
    since: null,
    file: null,
    api: null,
    token: null,
    check: false,
    mark: null,
    note: null,
    uuid: [],
  }

  for (const arg of argv) {
    if (arg === '--all') options.all = true
    else if (arg === '--check') options.check = true
    else if (arg.startsWith('--since=')) options.since = arg.slice('--since='.length)
    else if (arg.startsWith('--file=')) options.file = arg.slice('--file='.length)
    else if (arg.startsWith('--api=')) options.api = arg.slice('--api='.length)
    else if (arg.startsWith('--token=')) options.token = arg.slice('--token='.length)
    else if (arg.startsWith('--mark=')) options.mark = arg.slice('--mark='.length)
    else if (arg.startsWith('--note=')) options.note = arg.slice('--note='.length)
    else if (arg.startsWith('--uuid=')) {
      options.uuid.push(
        ...arg
          .slice('--uuid='.length)
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
      )
    }
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

/** Значение из окружения: адрес — `.env.local` → `.env`, токен — только `.env.local`. */
async function resolveConfig(cli) {
  const local = await readEnvFile(path.join(root, '.env.local'))
  const base = await readEnvFile(path.join(root, '.env'))

  // Ловушка: `.env` отслеживается git'ом, поэтому токену там не место. Значение не печатаем —
  // только предупреждаем, что его надо перенести в `.env.local` (и почистить файл).
  if (base.FEEDBACK_PULL_TOKEN) {
    console.warn('[feedback:pull] ВНИМАНИЕ: FEEDBACK_PULL_TOKEN найден в .env — этот файл в git!')
    console.warn('[feedback:pull] Перенесите токен в .env.local и очистите строку в .env.')
  }

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

  if (report.bundle_version) {
    lines.push(`> бандл: \`${report.bundle_version}\``)
    lines.push('')
  }
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

/** Печатает состояние разбора: счётчики по статусам и что осталось неразобранным. */
function printStatuses(reports) {
  const counts = {}

  for (const record of reports) {
    const status = String(record.status || 'unknown')
    counts[status] = (counts[status] || 0) + 1
  }

  const summary = Object.entries(counts)
    .map(([status, count]) => `${status}=${count}`)
    .join(' · ')

  console.log(`  по статусам: ${summary || '—'}`)

  const open = reports.filter(record => String(record.status || 'new') === 'new')

  if (!open.length) {
    console.log('  неразобранных нет ✔')
    return
  }

  for (const record of open) {
    const kind = record.payload?.kind || ''
    console.log(`  • не разобран: ${shortId(record.uuid_id)} (${KIND_LABELS[kind] || kind || '—'})`)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { api, token } = await resolveConfig(options)
  const state = await readPulled()

  state.reports = state.reports && typeof state.reports === 'object' ? state.reports : {}
  state.contours = state.contours && typeof state.contours === 'object' ? state.contours : {}

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

  if (options.mark && !isValidStatus(options.mark)) {
    throw new Error(`Неизвестный статус «${options.mark}»: допустимы ${STATUSES.join(', ')}`)
  }

  const base = api.replace(/\/$/, '')
  const key = contourKey(api)

  /** Чтение выдачи: `since` — с какой отметки (без неё — всё, что отдаёт контур). */
  const read = async since => {
    const url = new URL(`${base}/feedback`)
    url.searchParams.set('limit', '200')
    if (since) url.searchParams.set('since', since)

    const response = await fetch(url, { headers: { 'X-Feedback-Token': token } })

    if (response.status === 403) {
      throw new Error('Сервер отклонил pull-токен (403): проверьте FEEDBACK_PULL_TOKEN')
    }

    if (!response.ok) {
      throw new Error(`Сервер ответил ${response.status} ${response.statusText}`)
    }

    const body = await response.json()

    return Array.isArray(body?.reports) ? body.reports : []
  }

  // `--check` — только посмотреть состояние разбора (одна выдача, ничего не пишем).
  if (options.check) {
    const all = await read(null)

    console.log(`Контур ${key}: отчётов в контуре — ${all.length}`)
    printStatuses(all)

    if (!options.mark) return
  }

  const reports = await read(resolveSince({ options, state, api }))
  const pulledNow = []

  for (const record of reports) {
    const uuid = String(record.uuid_id || record.uuidId || '')

    if (!uuid) continue

    const existing = state.reports[uuid]

    if (existing && !options.all) continue

    const payload = record.payload || {}
    // Уже выгруженный отчёт сохраняет своё имя файла: иначе `--all` плодил дубликаты (14.31).
    const fileName = fileNameFor(uuid, existing, stamp())
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

    pulledNow.push(uuid)
  }

  // Курсор — свой у каждого контура (задача 14.31): выгрузка с prod больше не «съедает» dev.
  state.contours[key] = { lastPulledAt: new Date().toISOString() }
  state.lastPulledAt = state.contours[key].lastPulledAt

  await writePulled(state)
  await rebuildIndex(Object.values(state.reports))

  console.log(
    `Контур ${key}: выгружено новых отчётов ${pulledNow.length} ` +
      `(в инбоксе всего: ${Object.keys(state.reports).length})`
  )

  if (!options.mark) {
    console.log('Инбокс для чтения: feedback/INBOX.md; вердикты — в feedback/DECISIONS.md')
    console.log(
      'Разбор считается закрытым после `--mark=accepted|rejected` — ' +
        'иначе отчёт числится «не разобран» в домашнем мониторе.'
    )
    return
  }

  // Цели ищем по **всей** выдаче контура: `--uuid` может указывать на отчёт, выгруженный раньше.
  const targets = resolveMarkTargets(options, await read(null), pulledNow)

  for (const uuid of targets) {
    const response = await fetch(`${base}/feedback/${uuid}`, {
      method: 'PATCH',
      headers: {
        'X-Feedback-Token': token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ status: options.mark, note: options.note || undefined }),
    })
    const result = await response.json().catch(() => ({}))

    if (response.ok && result?.ok) {
      console.log(`  ✓ ${shortId(uuid)} → ${result.status}`)
    } else {
      console.log(`  ✖ ${shortId(uuid)} → HTTP ${response.status} ${JSON.stringify(result)}`)
    }
  }

  printStatuses(await read(null))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`[feedback:pull] ${error?.message || error}`)
    process.exitCode = 1
  })
}
