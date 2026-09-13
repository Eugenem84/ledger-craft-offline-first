// src/utils/devMode.js
//
// «Режим разработчика» — переключатель в настройках («Ещё»).
//
// Зачем он нужен отдельно от `import.meta.env.DEV`: приложение — офлайн-первое и живёт
// на телефоне мастера, где консоли разработчика нет. Раньше отладочная панель была
// доступна **только в dev-сборке**, то есть на боевом APK посмотреть логи, очередь
// синка или состояние БД было нельзя. Теперь режим включается тумблером в настройках
// и переживает перезапуск (`localStorage`), а тяжёлая панель подгружается лениво —
// в обычной работе она не мешает и не грузится.
//
// Флаг — обычный `ref`, а не Pinia-стора: его читает `utils/logger.js` (в том числе из
// тестов и до инициализации приложения), и лишняя зависимость от Pinia тут ни к чему.
import { ref } from 'vue'
import storage from 'src/utils/storage.js'

/** Ключ хранения. Значение `'1'`/`'0'` — как у остальных служебных флагов. */
export const DEV_MODE_KEY = 'dev_mode_enabled'

/** Реактивный флаг: на него подписаны настройки и панель. */
export const devModeEnabled = ref(storage.getItem(DEV_MODE_KEY) === '1')

/** Включён ли режим разработчика прямо сейчас (без реактивности). */
export function isDevModeEnabled() {
  return devModeEnabled.value === true
}

/** Включает/выключает режим и запоминает выбор. Возвращает новое значение. */
export function setDevMode(value) {
  devModeEnabled.value = value === true
  storage.trySetItem(DEV_MODE_KEY, devModeEnabled.value ? '1' : '0')

  return devModeEnabled.value
}

/** Переключает режим. */
export function toggleDevMode() {
  return setDevMode(!devModeEnabled.value)
}
