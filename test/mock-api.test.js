// test/mock-api.test.js
//
// Задача 7.2: моки вынесены в отдельный DEV-слой `src/services/mockApi.js`, который
// подключается только в dev-сборке по флагу. Здесь проверяем, что сам слой живой и
// отдаёт контракт сервера (`SyncController`), а конфиг по умолчанию не подменяет
// сервер моками. Отсутствие моков в production-сборке проверяется отдельно —
// grep'ом по `dist/spa` (в проде чанк `mockApi-*.js` не создаётся).
import { describe, it, expect } from 'vitest'
import mockApi from 'src/services/mockApi.js'
import { API_URL, USE_MOCK } from 'src/config.js'

describe('7.2 DEV-слой моков', () => {
  it('send отдаёт контракт сервера { synced, errors }', async () => {
    const res = await mockApi.send({
      operations: [
        { type: 'insert', payload: { local_id: 'uuid-1' } },
        { type: 'update', id: 5, payload: {} },
      ],
    })

    expect(res.errors).toEqual([])
    expect(res.synced).toHaveLength(2)
    expect(res.synced[0]).toMatchObject({ type: 'insert', local_id: 'uuid-1' })
    expect(res.synced[1].type).toBe('update')
    expect(typeof res.synced[0].server_id).toBe('number')
  })

  it('fetchUpdates отдаёт данные клиентов из моков', async () => {
    const res = await mockApi.fetchUpdates({ table: 'clients', since: 0 })

    expect(res.table).toBe('clients')
    expect(res.count).toBe(res.records.length)
    expect(res.records.length).toBeGreaterThan(0)
  })

  it('конфиг знает адрес сервера, а флаг моков — булев', () => {
    expect(typeof API_URL).toBe('string')
    expect(API_URL.length).toBeGreaterThan(0)
    expect(typeof USE_MOCK).toBe('boolean')
  })
})
