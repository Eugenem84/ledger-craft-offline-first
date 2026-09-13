// src/boot/updateCheck.js
//
// Фоновая проверка обновлений при старте (Фаза 13, задача 13.8).
//
// Работает как автосинк: boot-файл ничего не ждёт, приложение рисуется первым, а
// проверка версии уезжает в фон (первый вызов — через несколько секунд, чтобы не
// конкурировать со стартом синка). Офлайн — нормальное состояние: проверка молчит
// и повторится сама при появлении сети.
import { boot } from 'quasar/wrappers'
import updateService from 'src/services/updateService.js'
import { logger } from 'src/utils/logger.js'

export default boot(() => {
  // Кэш последнего ответа: баннер знает состояние сразу, ещё до сети.
  updateService.restore()
  updateService.startAutoCheck()

  logger.log('[Update] авто-проверка обновлений включена')
})
