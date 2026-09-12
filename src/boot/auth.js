// src/boot/auth.js
//
// Восстановление сессии и связка входа с сетевым слоем (задача 7.4).
//
// Boot идёт после `pinia` (см. порядок в quasar.config.js), поэтому стор уже можно
// создать. Здесь мы:
//   • читаем токен/PIN из хранилища в стор (`restore()`);
//   • регистрируем обработчик 401 в `api.js` — если сервер отверг токен (истёк,
//     отозван), стор забывает его и приложение возвращается на экран входа.
import { boot } from 'quasar/wrappers'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { setUnauthorizedHandler } from 'src/services/api.js'
import { logger } from 'src/utils/logger'

export default boot(() => {
  const auth = useAuthStore()

  auth.restore()
  setUnauthorizedHandler(() => auth.handleUnauthorized())

  logger.log(
    `[Auth] Сессия при старте: ${auth.isAuthenticated ? 'токен есть' : 'токена нет'}` +
      `${auth.hasPin ? ', PIN установлен' : ''}`
  )
})
