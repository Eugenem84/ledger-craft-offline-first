// src/boot/errorLog.js
//
// Глобальные перехватчики ошибок (Фаза 14, задача 14.1).
//
// boot-файл стоит первым в списке (`quasar.config.js`): тогда необработанные
// ошибки самого старта (инициализация БД, миграции) тоже попадают в постоянный
// буфер `utils/errorLog.js`, а не только в консоль, которой на боевом APK нет.
//
// Перехватчики ничего не показывают пользователю — только пишут хвост ошибок в
// буфер, из которого его заберёт отчёт «Сообщить об ошибке» (задача 14.5).
import { boot } from 'quasar/wrappers'
import { installErrorHandlers } from 'src/utils/errorLog.js'
import { logger } from 'src/utils/logger.js'

export default boot(({ app, router }) => {
  const installed = installErrorHandlers({
    app,
    getScreen: () => router?.currentRoute?.value?.fullPath ?? null,
  })

  if (installed) {
    logger.log('[ErrorLog] Перехватчики ошибок установлены (error / unhandledrejection / Vue)')
  }
})
