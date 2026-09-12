// src/services/mockApi.js
//
// DEV-only слой моков сетевого слоя (задача 7.2). Раньше моки лежали в `api.js`
// и их JSON-данные попадали в production-бандл даже при `USE_MOCK = false`.
// Теперь `api.js` подключает этот модуль динамическим импортом и только когда
// `import.meta.env.DEV === true` и включён флаг `VITE_USE_MOCK`: в проде ветка
// вырезается сборщиком вместе с этим файлом и `src/mocks/*.json`.

import { logger } from 'src/utils/logger'
import mockClients from 'src/mocks/clients.json'
import mockSpecializations from 'src/mocks/specializations.json'

export default {
  async send(operation) {
    logger.log('[MOCK] send:', operation)
    await new Promise(r => setTimeout(r, 200))

    // Структура ответа — как у сервера (`SyncController`): { synced, errors }.
    const results = {
      synced: [],
      errors: [],
    }

    operation.operations.forEach(op => {
      results.synced.push({
        type: op.type,
        local_id: op.type === 'insert' ? op.payload.local_id : op.id,
        server_id: Math.floor(Math.random() * 100000),
      })
    })

    return results
  },

  async fetchUpdates({ table, since }) {
    logger.log(`[MOCK] fetchUpdates for ${table}, since ${since}`)
    await new Promise(r => setTimeout(r, 300))

    let data = []

    switch (table) {
      case 'clients':
        data = mockClients
        break
      case 'specializations':
        data = mockSpecializations
        break
      default:
        data = []
    }

    return { table, count: data.length, records: data }
  },
}
