// src/services/api.js

import { logger } from 'src/utils/logger'
import storage from 'src/utils/storage'
import { API_URL, USE_MOCK } from 'src/config.js'
import axios from 'axios'

// --- Моки (задача 7.2) -------------------------------------------------------
// Отдельный DEV-only слой `src/services/mockApi.js`, подключаемый динамически.
// В production-сборке `USE_MOCK` — литерал `false`, поэтому ветка и сам модуль с
// JSON-моками вырезаются из бандла.
async function loadMockApi() {
  if (!USE_MOCK) return null

  const { default: mockApi } = await import('./mockApi.js')
  return mockApi
}

// --- Уникальный ID клиента для синхронизации ---
// Хранилище универсальное (задача 7.3): localStorage в браузере/WebView, память — фолбэк.
let syncId = storage.getItem('sync_id')

if (!syncId) {
  syncId = crypto.randomUUID()
  storage.trySetItem('sync_id', syncId)
}

logger.log(`[API] Sync ID: ${syncId}`)

// --- Токен доступа к синку (задачи 3.10/7.4) ---------------------------------
// Раньше токен читался один раз при импорте модуля, поэтому после входа заголовок
// не обновлялся. Теперь его подставляет интерцептор в момент запроса — вход
// (задача 7.4) начинает работать без перезагрузки страницы.
let unauthorizedHandler = null

/** Колбэк на 401: регистрируется auth-стором (сбрасывает токен и блокирует приложение). */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === 'function' ? handler : null
}

/** Есть ли токен — по нему синк решает, можно ли идти в сеть (задача 7.4). */
export function hasAuthToken() {
  return Boolean(storage.getItem('auth_token'))
}

/** Текущий токен (для auth-стора и ручной диагностики). */
export function getAuthToken() {
  return storage.getItem('auth_token')
}

// Создаем экземпляр axios с преднастроенными заголовками
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Sync-ID': syncId, // Добавляем ID в заголовки по умолчанию
  },
})

apiClient.interceptors.request.use(config => {
  const token = getAuthToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error?.response?.status === 401 && unauthorizedHandler) {
      try {
        unauthorizedHandler(error)
      } catch (e) {
        console.error('[API] Ошибка обработчика 401:', e)
      }
    }

    return Promise.reject(error)
  }
)

export { apiClient }

export default {
  async send(operation) {
    const mockApi = await loadMockApi()
    if (mockApi) return mockApi.send(operation)

    const res = await apiClient.post('/sync', operation)
    return res.data
  },

  async fetchUpdates({ table, since }) {
    const mockApi = await loadMockApi()
    if (mockApi) return mockApi.fetchUpdates({ table, since })

    const res = await apiClient.get('/sync-updates', {
      params: { table, since },
    })

    const serverData = res.data

    if (Array.isArray(serverData?.records)) {
      serverData.records = serverData.records.map(record => {
        if (table === 'specializations' && record.specializationName) {
          record.name = record.specializationName
          delete record.specializationName
        }
        return record
      })
    }

    return serverData
  },
}

