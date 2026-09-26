// src/utils/haptics.js
//
// Виброотклик на телефоне (`@capacitor/haptics`, правка владельца 26.09.2026).
// Начался с выбора количества из списка, а затем распространился на всё приложение:
// «щелчок» при смене раздела, при переключении статуса/оплаты, при вращении карусели
// количества и при сохранении (`boot/haptics.js` вешает отклик на уведомления).
//
// Зачем отдельным модулем (как `liveUpdate.js`): плагин подключается **динамическим
// импортом** и только на телефоне. В браузере и в тестах `@capacitor/haptics` не
// загружается, а все функции просто возвращают `false` — вызов можно ставить в любое
// место и ничем не оборачивать.
//
// ⚠️ Почему `impact({ style: 'Light' })`, а не `selectionChanged()`: на Android
// `selectionChanged()` даёт отклик **только если до него позвали `selectionStart()`**
// (иначе `Haptics.selectionChanged()` молча ничего не делает) — это лишнее состояние
// для одиночного выбора. «Лёгкий удар» работает всегда и ощущается как аккуратный тик.
import { isNativePlatform } from 'src/utils/platform.js'
import { logger } from 'src/utils/logger.js'
import { withTimeout } from 'src/utils/async.js'

/** Лёгкий удар: 50 мс на ~43% амплитуды — «тик», а не «жужжание». */
const LIGHT_IMPACT = 'Light'

/** Щелчок карусели/вкладки: очень короткая вибрация — палец чувствует «деление». */
const TICK_DURATION_MS = 10

/**
 * Минимальный интервал между щелчками. При быстром «кручении» карусели строки сменяются
 * десятками в секунду, и без этого ограничения отдельные щелчки слились бы в сплошное
 * жужжание (вибратор не успевает за прокруткой).
 */
const TICK_MIN_GAP_MS = 35

/** Методы плагина, которые нужны приложению (остальное не оборачиваем). */
const HAPTICS_METHODS = ['impact', 'notification', 'vibrate']

/** Импорт делаем один раз: модуль кэширован, а таймаут не должен повторяться. */
let hapticsPromise = null

/** Когда был последний щелчок — для `TICK_MIN_GAP_MS` (см. `tickHaptic`). */
let lastTickAt = 0

/** Плагин вообще возможен на этой платформе (в браузере/тестах — нет). */
export function isHapticsSupported() {
  return isNativePlatform()
}

/**
 * Плагин из динамического импорта. Оборачиваем в **обычный объект**, а не отдаём
 * прокси Capacitor: у прокси `then` оказывается «нереализованным методом», и от него
 * зависает любой `await` (живой дефект OTA-плагина, см. `liveUpdate.js`). Методы
 * привязываем к плагину, чтобы `this` не потерялся.
 */
function loadHaptics() {
  if (hapticsPromise === null) {
    hapticsPromise = withTimeout(import('@capacitor/haptics'), 'импорт @capacitor/haptics')
      .then(module => {
        const plugin = module?.Haptics
        const wrapper = {
          ImpactStyle: module?.ImpactStyle,
          NotificationType: module?.NotificationType,
        }

        for (const method of HAPTICS_METHODS) {
          try {
            const fn = plugin?.[method]

            if (typeof fn === 'function') wrapper[method] = fn.bind(plugin)
          } catch {
            // Такого метода нет в этой версии плагина — просто не кладём его в обёртку.
          }
        }

        return wrapper
      })
      .catch(err => {
        logger.log('вибро: плагин недоступен', err?.message)

        return {}
      })
  }

  return hapticsPromise
}

/**
 * Общий вход: достать плагин, позвать метод, ошибку — только в лог.
 *
 * @param {'impact'|'notification'|'vibrate'} method
 * @param {object} payload аргумент метода плагина
 * @returns {Promise<boolean>} получилось ли вибро
 */
async function runHaptic(method, payload) {
  if (isHapticsSupported() !== true) return false

  try {
    const haptics = await loadHaptics()
    const fn = haptics[method]

    if (typeof fn !== 'function') return false

    await fn(payload)

    return true
  } catch (err) {
    // Вибро — удобство, а не функция: его отсутствие не должно всплывать наверх.
    logger.log('вибро: отклик не удался', err?.message)

    return false
  }
}

/**
 * Лёгкий удар — подтверждение действия. Ничего не ждёт и не бросает: если плагина нет
 * (браузер, тесты) или он не ответил — вернётся `false`, интерфейс продолжит работать.
 *
 * @returns {Promise<boolean>} получилось ли вибро
 */
export async function selectionHaptic() {
  const haptics = isHapticsSupported() === true ? await loadHaptics() : {}

  return runHaptic('impact', {
    style: haptics.ImpactStyle?.[LIGHT_IMPACT] ?? LIGHT_IMPACT.toUpperCase(),
  })
}

/**
 * Короткий «щелчок» — одно деление: строка карусели, смена раздела, сегмент тумблера.
 * При быстром движении вызовы идут подряд, поэтому держим минимальный интервал.
 *
 * @returns {Promise<boolean>}
 */
export function tickHaptic() {
  const now = Date.now()

  if (now - lastTickAt < TICK_MIN_GAP_MS) return Promise.resolve(false)

  lastTickAt = now

  return runHaptic('vibrate', { duration: TICK_DURATION_MS })
}

/** Отклик «задача выполнена» — например, уведомление «ордер сохранён». */
export function successHaptic() {
  return notificationHaptic('Success')
}

/** Отклик «внимание» — предупреждение, подтверждение удаления. */
export function warningHaptic() {
  return notificationHaptic('Warning')
}

/** Отклик «не получилось» — ошибка загрузки/сохранения. */
export function errorHaptic() {
  return notificationHaptic('Error')
}

/** Уведомление плагина: своя «мелодия» вибро на успех/предупреждение/ошибку. */
async function notificationHaptic(type) {
  const haptics = isHapticsSupported() === true ? await loadHaptics() : {}

  return runHaptic('notification', {
    type: haptics.NotificationType?.[type] ?? type.toUpperCase(),
  })
}

/**
 * Карта «тип уведомления Quasar → отклик»: её использует `boot/haptics.js`, поэтому
 * правило одно на всё приложение — «сохранил → успех, не вышло → ошибка».
 * `info` молчит осознанно: это подсказка, а не событие.
 */
export const HAPTIC_BY_NOTIFY_TYPE = {
  positive: successHaptic,
  negative: errorHaptic,
  warning: warningHaptic,
}
