// src/boot/pinia.js
import { logger } from 'src/utils/logger'
import { boot } from 'quasar/wrappers'
import { createPinia } from 'pinia'

export default boot(({ app }) => {
  logger.log('[Pinia] Boot start')

  const pinia = createPinia()
  logger.log('[Pinia] Pinia instance created')

  app.use(pinia)
  logger.log('[Pinia] Pinia instance registered with app')

  logger.log('[Pinia] Boot end')
})
