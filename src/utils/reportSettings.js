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
// Флаг — обычный `ref` (как `utils/devMode.js`): его читает страница заказа, а хранится
// он в `localStorage`, потому что выбор — это настройка **устройства**, а не профиля:
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
