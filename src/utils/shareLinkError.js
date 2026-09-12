// src/utils/shareLinkError.js
//
// Задача 9.4: публичная share-ссылка на отчёт требует сервера и доступа к нему,
// поэтому «не получилось» бывает по разным причинам — нет интернета, не выполнен
// вход, заказ ещё не уехал на сервер. Пользователю нужна причина, а не общее
// «Ошибка копирования ссылки». Правила вынесены из страницы чистой функцией
// (как `syncStatusView.js`), поэтому они проверяются юнит-тестом.

/** Код ошибки стора: заказ ещё не синхронизирован (у него нет `server_id`). */
export const ORDER_NOT_SYNCED = 'ORDER_NOT_SYNCED'

/**
 * Причина неудачи → сообщение и уровень уведомления Quasar.
 *
 * @param {unknown} error ошибка стора/axios
 * @returns {{ message: string, level: 'warning'|'negative' }}
 */
export function shareLinkErrorView(error) {
  // Заказ ещё не на сервере: ссылку выдать некому (сначала синк).
  if (error?.code === ORDER_NOT_SYNCED) {
    return { message: 'Сначала нужно синхронизировать ордер', level: 'warning' }
  }

  const status = error?.response?.status

  // Ссылку выдаёт сервер и только владельцу (задача 9.4) — значит нужен вход.
  if (status === 401) {
    return { message: 'Ссылку создаёт сервер: войдите в приложение', level: 'warning' }
  }

  // Заказ не найден на сервере (удалён или ещё не уехал).
  if (status === 404) {
    return { message: 'Ордер не найден на сервере', level: 'warning' }
  }

  // Ответа нет вовсе — это офлайн, а не ошибка сервера.
  if (!error?.response) {
    return { message: 'Нужен интернет, чтобы создать ссылку', level: 'warning' }
  }

  return { message: 'Не удалось создать ссылку', level: 'negative' }
}
