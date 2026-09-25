// src/boot/deepLinks.js
//
// Ссылки из писем → приложение (подтверждение почты и сброс пароля).
//
// Письмо ведёт на https-адрес бэкенда (`/app/reset`, `/app/verified`), а бэкенд
// уводит в приложение: напрямую через Android App Links или через bridge-страницу
// со схемой `ledgercraft://`. Здесь ловим обе формы:
//   • `App.getLaunchUrl()` — приложение **запустили** ссылкой (холодный старт);
//   • `App.addListener('appUrlOpen')` — ссылка пришла в уже запущенное приложение.
//
// Разбор ссылки — в чистой `src/domain/deepLinks.js` (покрыта тестом), здесь только
// навигация.
//
// ⚠️ На входе ничего не ждём (`await` в boot-файле держит монтирование приложения —
// живой дефект 1.9/1.10, чёрный экран): импорт плагина и нативные вызовы уходят в
// фон, каждый — под таймаутом. Ошибка не ломает старт.
import { boot } from 'quasar/wrappers'
import { parseDeepLink } from 'src/domain/deepLinks.js'
import { isNativePlatform } from 'src/utils/platform.js'
import { withTimeout } from 'src/utils/async.js'
import { logger } from 'src/utils/logger'

export default boot(({ router }) => {
  // В браузере и в тестах ссылками занимается ОС (или ничего) — плагина нет.
  if (!isNativePlatform()) return

  /**
   * Разбирает ссылку и уводит на нужный экран.
   *
   * Целевые маршруты (`/reset-password`, `/verify-email`) публичные
   * (`meta.requiredAuth: false`), поэтому они открываются и без входа и без
   * разблокировки PIN: пароль можно сменить и с нового телефона, где ещё нет
   * сессии.
   *
   * @param {string} rawUrl
   */
  function open(rawUrl) {
    const target = parseDeepLink(rawUrl)

    if (!target) return

    logger.log(`[DeepLink] Открываю ${target.path}${target.query.email ? ` для ${target.query.email}` : ''}`)

    // `isReady()` ждёт первичную навигацию: на холодном старте boot выполняется
    // раньше, чем роутер смонтирован и обработал стартовый маршрут.
    Promise.resolve(router.isReady()).then(
      () =>
        router.push(target).catch(error => {
          logger.warn('[DeepLink] Не удалось перейти по ссылке:', error?.message || error)
        }),
      () => {}
    )
  }

  // Фон: boot не должен ждать нативный плагин.
  void (async () => {
    try {
      const { App } = await withTimeout(import('@capacitor/app'), 'импорт @capacitor/app')

      // Холодный старт: приложение запущено ссылкой.
      try {
        const launch = await withTimeout(App.getLaunchUrl(), 'App.getLaunchUrl()')

        if (launch?.url) open(launch.url)
      } catch (error) {
        logger.warn('[DeepLink] getLaunchUrl не ответил:', error?.message || error)
      }

      // Тёплый старт: ссылка пришла, пока приложение уже работало.
      await App.addListener('appUrlOpen', event => {
        if (event?.url) open(event.url)
      })
    } catch (error) {
      // Старые APK без плагина и веб-сборка попадают сюда — это норма.
      logger.warn('[DeepLink] Плагин ссылок недоступен:', error?.message || error)
    }
  })()
})
