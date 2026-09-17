// src/utils/reportSettings.js
//
// Формат отчёта клиенту — выбор мастера в настройках («Ещё»).
//
// Правка владельца 17.09.2026: не все клиенты готовы открывать сторонний сайт
// («это опасно»), поэтому отчёт можно отдать двумя способами:
//   • `link` — публичная ссылка на отчёт (задача 9.4): выдаёт сервер, нужен интернет,
//     вход и синхронизированный заказ;
//   • `text` — весь отчёт текстом, который вставляется в мессенджер как есть, а внизу
//     подпись `ledgerCraft.ru`. Так отчёт работает и офлайн, и как канал, по которому
//     приложение расходится между мастерами.
//
// Правка владельца 17.09.2026 (переработка настроек): отчёт настраивается «сильно» —
// мастер сам решает, что в нём будет. Кроме формата (`link`/`text`) есть состав:
// имя клиента, телефон, модель техники и раздельные итоги (работы / запчасти).
// Подпись с сайтом зарезервирована, но пока не показывается в интерфейсе
// («сайт пока убери, добавим потом» — флаг живёт в `REPORT_CONTENT_HIDDEN`).
//
// Флаги — обычные `ref` (как `utils/devMode.js`): их читает страница заказа, а хранятся
// они в `localStorage`, потому что выбор — это настройка **устройства**, а не профиля:
// он не уезжает синком и не связан со специализацией.
import { ref } from 'vue'
import storage from 'src/utils/storage.js'

/** Значения режима. `link` — умолчание: поведение до этой правки не меняется. */
export const REPORT_FORMAT_LINK = 'link'
export const REPORT_FORMAT_TEXT = 'text'

/** Ключ хранения. */
export const REPORT_FORMAT_KEY = 'report_format'

/** Подписи для переключателя в настройках. */
export const REPORT_FORMAT_LABELS = Object.freeze({
  [REPORT_FORMAT_LINK]: 'ссылка на отчёт',
  [REPORT_FORMAT_TEXT]: 'текст отчёта',
})

/** Пояснения «что именно попадёт в буфер обмена». */
export const REPORT_FORMAT_HINTS = Object.freeze({
  [REPORT_FORMAT_LINK]: 'публичная ссылка: нужен интернет, вход и синхронизированный заказ',
  [REPORT_FORMAT_TEXT]: 'весь отчёт текстом — вставляется в мессенджер как есть, работает офлайн',
})

/** Неизвестное значение приводим к `link`, а не к «пустому» режиму. */
export function normalizeReportFormat(value) {
  return value === REPORT_FORMAT_TEXT ? REPORT_FORMAT_TEXT : REPORT_FORMAT_LINK
}

/** Реактивный режим: на него подписаны настройки и карточка заказа. */
export const reportFormat = ref(normalizeReportFormat(storage.getItem(REPORT_FORMAT_KEY)))

/** Текущий режим без реактивности. */
export function getReportFormat() {
  return normalizeReportFormat(reportFormat.value)
}

/** Отчёт отдаётся текстом (а не ссылкой). */
export function isReportTextMode() {
  return getReportFormat() === REPORT_FORMAT_TEXT
}

/** Запоминает выбор и переживает перезапуск. Возвращает новое значение. */
export function setReportFormat(value) {
  reportFormat.value = normalizeReportFormat(value)
  storage.trySetItem(REPORT_FORMAT_KEY, reportFormat.value)

  return reportFormat.value
}

// --- Состав отчёта (правка владельца 17.09.2026, вкладка «отчёты») --------------

/** Ключ хранения состава отчёта: JSON-объект «флаг → boolean». */
export const REPORT_CONTENT_KEY = 'report_content'

/**
 * Что мастер может включить в текст отчёта.
 *
 * Умолчания — `false`: отчёт остаётся минимальным (как до правки), а лишние строки
 * появляются только по явному выбору. Статус, позиции, «Итого» и комментарий —
 * базовые строки, они есть всегда и тумблеров не имеют.
 */
export const DEFAULT_REPORT_CONTENT = Object.freeze({
  clientName: false,
  clientPhone: false,
  model: false,
  servicesTotal: false,
  partsTotal: false,
  signature: false,
})

/**
 * Флаги, которые пока НЕ показываются в интерфейсе.
 *
 * `signature` — подпись «Отчёт сформирован в ledgerCraft.ru»: владелец попросил убрать
 * сайт из отчёта и вернуть позже («сайт пока убери, добавим потом»). Логика подписи
 * жива (`buildOrderReportText`), поэтому включение обратно — это убрать флаг отсюда.
 */
export const REPORT_CONTENT_HIDDEN = Object.freeze(['signature'])

/** Подписи тумблеров. */
export const REPORT_CONTENT_LABELS = Object.freeze({
  clientName: 'имя клиента',
  clientPhone: 'телефон клиента',
  model: 'модель техники',
  servicesTotal: 'итого за работы',
  partsTotal: 'итого за запчасти',
  signature: 'подпись с сайтом',
})

/** Пояснения «какая строка появится в отчёте». */
export const REPORT_CONTENT_HINTS = Object.freeze({
  clientName: 'строка с именем — клиенту понятно, что отчёт про него',
  clientPhone: 'строка с телефоном: видно, куда звонить',
  model: 'что за техника — модель из карточки заказа',
  servicesTotal: 'отдельная строка «Итого за работы»',
  partsTotal: 'отдельная строка «Итого за запчасти» (материалы и товары)',
  signature: 'строка «Отчёт сформирован в ledgerCraft.ru» — по ней приходят новые мастера',
})

/** Значение флага приводим строго к boolean (мусор — это «выключено»). */
function asFlag(value) {
  return value === true || value === 1 || value === '1'
}

/**
 * Нормализует состав отчёта: принимает JSON-строку (как лежит в storage) или объект,
 * неизвестные ключи игнорирует, отсутствующие берёт из умолчаний.
 */
export function normalizeReportContent(source) {
  let parsed = source

  if (typeof source === 'string') {
    try {
      parsed = JSON.parse(source)
    } catch {
      return { ...DEFAULT_REPORT_CONTENT }
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...DEFAULT_REPORT_CONTENT }
  }

  return Object.fromEntries(
    Object.keys(DEFAULT_REPORT_CONTENT).map(key => [
      key,
      parsed[key] === undefined ? DEFAULT_REPORT_CONTENT[key] : asFlag(parsed[key]),
    ])
  )
}

const readStoredContent = () => normalizeReportContent(storage.getItem(REPORT_CONTENT_KEY))

/** Реактивный состав отчёта: на него подписаны настройки и карточка заказа. */
export const reportContent = ref(readStoredContent())

/** Текущий состав без реактивности (копия — чтобы никто не писал в ref мимо `set`). */
export function getReportContent() {
  return { ...reportContent.value }
}

/** Включён ли конкретный флаг (например, `partsTotal`). */
export function isReportContentEnabled(flag) {
  return reportContent.value[flag] === true && Object.hasOwn(DEFAULT_REPORT_CONTENT, flag)
}

/**
 * Запоминает состав отчёта и переживает перезапуск.
 *
 * Принимает полный объект или частичный (тогда остальные флаги берутся текущие):
 * так удобно ставить один тумблер — `setReportContentFlag('model', true)`.
 */
export function setReportContent(value) {
  const next = normalizeReportContent({ ...reportContent.value, ...(value || {}) })

  reportContent.value = next
  storage.trySetItem(REPORT_CONTENT_KEY, JSON.stringify(next))

  return { ...next }
}

/** Переключает один флаг и возвращает новый флаг. */
export function setReportContentFlag(flag, value) {
  if (!Object.hasOwn(DEFAULT_REPORT_CONTENT, flag)) return undefined

  setReportContent({ [flag]: value === true })

  return reportContent.value[flag]
}
