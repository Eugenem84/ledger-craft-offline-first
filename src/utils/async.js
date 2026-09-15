// src/utils/async.js
//
// Мелочи для асинхронного кода, нужные нескольким модулям (Фаза 15).
//
// Зачем `withTimeout`: нативные вызовы Capacitor умеют «молчать» — связка JS↔native
// ещё не готова, плагин не ответил, устройство занято. Если такой вызов стоит в
// цепочке, которую кто-то ждёт (проверка обновлений, а тем более boot-файл), приложение
// просто зависает без ошибки. Предельное время ожидания превращает молчание в обычную
// ошибку: вызывающий её ловит и продолжает работу.
//
// Проверено на двух живых дефектах: чёрный экран сборки 1.9 (`await` на плагине в
// boot-файле) и «версия приложения неизвестна» (единственный источник версии не
// ответил, а результат запомнился навсегда).

/** Предел ожидания нативного вызова по умолчанию. */
export const NATIVE_CALL_TIMEOUT_MS = 3000

/**
 * Оборачивает промис предельным временем ожидания.
 *
 * @param {Promise<unknown>} promise что ждём
 * @param {string} label как назвать вызов в тексте ошибки (для лога/отчёта)
 * @param {number} [timeoutMs]
 * @returns {Promise<unknown>} результат промиса или ошибка «не ответил за N мс»
 */
export function withTimeout(promise, label, timeoutMs = NATIVE_CALL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}: нет ответа за ${timeoutMs} мс`))
    }, timeoutMs)

    Promise.resolve(promise).then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
