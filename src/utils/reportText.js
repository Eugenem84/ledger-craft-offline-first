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
// дата ему не нужны, поэтому в тексте остаются только статус, позиции с ценами, итог,
// комментарий и подпись «Отчёт сформирован в ledgerCraft.ru». Слова «оплачено» в отчёте
// нет — про оплату мастер скажет словами (правка владельца).
//
// Здесь только чистое форматирование: данные собирает `useOrderDraftStore`
// (`clientReport`), а склейка строк живёт тут и проверяется тестом без DOM и БД.
// Текст «человеческий», а не markdown: он уходит в мессенджер как есть.

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

/**
 * Собирает минимальный текст отчёта для клиента.
 *
 * @param {object} report данные из `useOrderDraftStore().clientReport`
 * @param {{signature?: string}} [options] подпись внизу (подменяется в тестах)
 * @returns {string} готовое сообщение для буфера обмена
 */
export function buildOrderReportText(report = {}, { signature = REPORT_SIGNATURE } = {}) {
  const data = report || {}
  const blocks = []

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

  // 3. Только итог: разбивка «работы / материалы» дублирует цены в позициях.
  blocks.push([`Итого: ${formatMoney(data.total)} р`])

  // 4. Комментарий. Дату в отчёте не печатаем (правка владельца 17.09.2026): клиенту она
  //    не нужна, место занимает, а мессенджер и так показывает время сообщения.
  blocks.push([data.comments])

  // 5. Подпись внизу: «Отчёт сформирован в ledgerCraft.ru» (правка владельца 17.09.2026 —
  //    сначала подпись была только адресом сайта, владелец попросил добавить пояснение).
  blocks.push([`${REPORT_BRAND_LINE} ${signature}`])

  return blocks
    .map(block => block.filter(line => line != null && line !== ''))
    .filter(block => block.length)
    .map(block => block.join('\n'))
    .join('\n\n')
}
