// src/utils/uniqueLines.js
//
// Дедупликация позиций заказа по «натуральному ключу» (задача 21.27).
//
// Зачем: сохранение заказа раньше пересоздавало все строки, а повторные выгрузки
// могли привезти копии. Черновик копил дубли (у мастера — «двойные работы», 4 копии
// товара на сервере; отчёт `a8df6cf1`, 21.10.2026). Перед сохранением и после
// загрузки список схлопываем: остаётся первая строка каждого ключа.
/**
 * @template T
 * @param {T[]} list
 * @param {(item: T) => string} keyOf
 * @returns {T[]}
 */
export function uniqueBy(list, keyOf) {
  const seen = new Set()
  const result = []

  for (const item of Array.isArray(list) ? list : []) {
    const key = keyOf(item)

    if (seen.has(key)) continue

    seen.add(key)
    result.push(item)
  }

  return result
}
