// src/utils/reportText.js
//
// Текстовый отчёт клиенту (правка владельца 17.09.2026).
//
// Раньше кнопка «поделиться» в карточке заказа отдавала только публичную ссылку
// (`generateShareLink`, задача 9.4). Часть клиентов не хочет открывать чужой сайт,
// поэтому есть второй формат — весь отчёт текстом: его вставляют в Telegram/WhatsApp
// как обычное сообщение, он читается без интернета, а внизу стоит подпись
// «Отчёт сформирован в ledgerCraft.ru» (приложение расходится именно по отчётам).
//
// Формат — минимальный (итерации правки владельца 17.09.2026): отчёт должен умещаться
// «даже в одно SMS». Клиент и сам знает свой телефон, имя и свой объект, а номер заказа и
// дата ему не нужны, поэтому по умолчанию в тексте остаются только статус, позиции с
// ценами, итог и комментарий. Слова «оплачено» в отчёте нет — про оплату мастер скажет
// словами (правка владельца).
//
// Правка владельца 17.09.2026 (переработка настроек, вкладка «отчёты»): что именно попадёт
// в отчёт, решает мастер — `content` (`utils/reportSettings.js`) включает имя клиента,
// телефон, модель техники и раздельные итоги (за работы / за запчасти). Подпись с сайтом
// тоже параметр (`signature`), но пока её в интерфейсе нет — «сайт пока убери, добавим
// потом» (флаг `signature` живёт в `REPORT_CONTENT_HIDDEN`).
//
// Здесь только чистое форматирование: данные собирает `useOrderDraftStore`
// (`clientReport`), состав приходит аргументом, а склейка строк живёт тут и проверяется
// тестом без DOM и БД. Текст «человеческий», а не markdown: он уходит в мессенджер как есть.

/** Подпись-источник внизу отчёта: по ней приходят новые мастера. */
export const REPORT_SIGNATURE = 'ledgerCraft.ru'

/** Начало подписи: целиком получается «Отчёт сформирован в ledgerCraft.ru». */
export const REPORT_BRAND_LINE = 'Отчёт сформирован в'

const num = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Деньги для отчёта: целые — без копеек, дробные — до двух знаков, тысячные разряды
 * разделены обычным пробелом (`1 234.5`). Разделитель — обычный пробел, а не узкий
 * неразрывный: текст уходит в мессенджеры, где редкие пробелы ломают выравнивание.
 */
export function formatMoney(value) {
  const rounded = Math.round(num(value) * 100) / 100
  const [intPart, fracPart] = Math.abs(rounded).toFixed(2).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const fraction = fracPart === '00' ? '' : `.${fracPart.replace(/0$/, '')}`

  return `${rounded < 0 ? '-' : ''}${grouped}${fraction}`
}

/** Количество строки позиции: может быть дробным (м², метры), лишние нули убираем. */
export function formatQuantity(value) {
  return String(Math.round(num(value) * 1000) / 1000)
}

/**
 * Строка позиции: `• Замена камеры 1×500`.
 *
 * Без «= сумма» и без «р»: сумму клиент видит в итоге, а каждое слово стоит символов —
 * формат рассчитан на одно SMS.
 */
function describeLine(line = {}) {
  const name = line.name || line.service || line.product || 'позиция'
  const quantity = num(line.quantity ?? line.amount ?? 1) || 1
  const unitPrice = num(line.unitPrice ?? line.price)

  return `• ${name} ${formatQuantity(quantity)}×${formatMoney(unitPrice)}`
}

/** Строка для шапки отчёта: пустые значения не печатаем, место в SMS дорогое. */
function headLine(value) {
  const text = value == null ? '' : String(value).trim()

  return text || null
}

/**
 * Собирает текст отчёта для клиента.
 *
 * @param {object} report данные из `useOrderDraftStore().clientReport`
 * @param {object} [options]
 * @param {object|null} [options.content] состав отчёта (`utils/reportSettings.js`):
 *   `clientName`, `clientPhone`, `model`, `servicesTotal`, `partsTotal`, `signature`.
 *   Пусто/неизвестное = минимальный отчёт (как было до правки 17.09.2026).
 * @param {string} [options.signature] подпись внизу (подменяется в тестах)
 * @returns {string} готовое сообщение для буфера обмена
 */
export function buildOrderReportText(report = {}, { content = null, signature = REPORT_SIGNATURE } = {}) {
  const data = report || {}
  const show = flag => content?.[flag] === true
  const blocks = []

  // 0. Шапка отчёта (только если мастер включил в настройках): имя клиента, телефон
  //    и модель техники. Каждое значение — отдельной строкой: в мессенджере они
  //    читаются как «кому/куда/что», а не сливаются в одну длинную строку.
  const head = [
    show('clientName') ? headLine(data.client?.name) : null,
    show('clientPhone') ? headLine(data.client?.phone) : null,
    show('model') ? headLine(data.model) : null,
  ].filter(Boolean)

  if (head.length) {
    blocks.push(head)
  }

  // 1. Состояние заказа одной строкой: клиенту важно, можно ли забирать. Про оплату не
  //    пишем (правка владельца 17.09.2026) — про неё мастер скажет словами, а слово
  //    «оплачено» занимает место. Слова «Статус:» тоже нет — значение читается и так.
  if (data.statusLabel) {
    blocks.push([data.statusLabel])
  }

  // 2. Позиции: работы отдельно, материалы и товары — отдельно. Секции разделяем пустой
  //    строкой (перевод строки почти ничего не стоит), но слов не добавляем.
  const positionBlocks = []
  if (data.services?.length) {
    positionBlocks.push(['Работы:', ...data.services.map(describeLine)].join('\n'))
  }

  const items = [...(data.materials || []), ...(data.products || [])]
  if (items.length) {
    positionBlocks.push(['Материалы и товары:', ...items.map(describeLine)].join('\n'))
  }

  blocks.push([positionBlocks.length ? positionBlocks.join('\n\n') : 'Позиции не добавлены.'])

  // 3. Итоги. Раздельные строки («за работы» / «за запчасти») — только по выбору мастера:
  //    по умолчанию остаётся один общий итог, как было до правки (минимум текста).
  const totals = []

  if (show('servicesTotal')) {
    totals.push(`Итого за работы: ${formatMoney(data.servicesTotal)} р`)
  }

  if (show('partsTotal')) {
    totals.push(`Итого за запчасти: ${formatMoney(data.partsTotal)} р`)
  }

  totals.push(`Итого: ${formatMoney(data.total)} р`)
  blocks.push(totals)

  // 4. Комментарий. Дату в отчёте не печатаем (правка владельца 17.09.2026): клиенту она
  //    не нужна, место занимает, а мессенджер и так показывает время сообщения.
  blocks.push([data.comments])

  // 5. Подпись внизу: «Отчёт сформирован в ledgerCraft.ru». С правки 17.09.2026 она
  //    выключена по умолчанию («сайт пока убери, добавим потом»), поэтому без флага
  //    `signature` строки в отчёте нет — логика подписи сохранена целиком.
  if (show('signature')) {
    blocks.push([`${REPORT_BRAND_LINE} ${signature}`])
  }

  return blocks
    .map(block => block.filter(line => line != null && line !== ''))
    .filter(block => block.length)
    .map(block => block.join('\n'))
    .join('\n\n')
}
