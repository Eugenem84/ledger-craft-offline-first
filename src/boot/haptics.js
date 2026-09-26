// src/boot/haptics.js
//
// Виброотклик на уведомления приложения (правка владельца 26.09.2026: «при сохранении
// вибро… и сам подумай куда ещё напихать»).
//
// Правило одно на всё приложение: тип уведомления решает, как «чувствуется» событие —
// `positive` (ордер сохранён, синк прошёл, бэкап создан) → отклик «успех», `negative`
// (ошибка загрузки/сохранения) → «ошибка», `warning` → «внимание». Так отклик получают
// все 80+ уведомлений без правки каждого экрана — вместо того чтобы расставлять вибро
// по обработчикам вручную.
//
// ⚠️ Почему подменяем `$q.notify`, а не `Notify.create`: в Quasar это **одна и та же**
// функция (`install()` в `plugins/notify/Notify.js` присваивает `$q.notify = this.create`),
// но приложение зовёт именно `$q.notify`. Заменяем ссылку на `$q` и переносим на обёртку
// «сервисные» свойства функции (`setDefaults`/`registerType`) — иначе они бы потерялись.
//
// `info` молчит осознанно (подсказка — не событие), а сам boot-файл обязан стоять
// **до** тех, кто показывает уведомления при старте (см. порядок в `quasar.config.js`).
import { boot } from 'quasar/wrappers'
import { HAPTIC_BY_NOTIFY_TYPE } from 'src/utils/haptics.js'
import { logger } from 'src/utils/logger.js'

export default boot(({ app }) => {
  const $q = app.config.globalProperties.$q
  const notify = $q?.notify

  if (typeof notify !== 'function') {
    logger.log('[Haptics] $q.notify не найден — вибро на уведомления не подключено')

    return
  }

  const wrapped = options => {
    const haptic = HAPTIC_BY_NOTIFY_TYPE[options?.type]

    // Отклик — «выстрелил и забыл»: он не должен задерживать само уведомление.
    if (haptic !== undefined) haptic()

    return notify(options)
  }

  wrapped.setDefaults = notify.setDefaults
  wrapped.registerType = notify.registerType

  $q.notify = wrapped

  logger.log('[Haptics] Виброотклик на уведомления подключён')
})
