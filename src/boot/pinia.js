// src/boot/pinia.js
import { boot } from 'quasar/wrappers'
import { createPinia } from 'pinia'

export default boot(({ app }) => {
  console.log('[Pinia] Boot start')

  const pinia = createPinia()
  console.log('[Pinia] Pinia instance created')

  app.use(pinia)
  console.log('[Pinia] Pinia instance registered with app')

  console.log('[Pinia] Boot end')
})
