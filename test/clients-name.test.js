// test/clients-name.test.js
//
// Фаза 21: клиент без имени не попадает в очередь синка, а правка «офлайн-клиента»
// доезжает до сервера.
//
// Живой лог 19.10.2026: сервер отвечал
//   `DATABASE_ERROR: null value in column "name" of relation "clients"` (SQLSTATE[23502])
// на одну и ту же операцию 6+ раз. Причина: локально имя могло быть пустой строкой,
// Laravel превращал её в `null` (`ConvertEmptyStringsToNull`), а PostgreSQL отклонял
// вставку. Починить это правкой имени было нельзя: `clientsRepo.update()` для ещё не
// синхронизированного клиента **не обновлял payload операции `insert`**.
import { beforeEach, afterEach, describe, expect, it } from 'vitest'

import * as clientsRepo from 'src/repositories/clientsRepo.js'
import operationsRepo from 'src/repositories/operationsRepo.js'
import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

beforeEach(async () => {
  await setupTestDb()
})

afterEach(() => {
  // База в памяти создаётся заново в beforeEach следующего теста.
})

describe('21.5 имя клиента обязательно', () => {
  it('пустое имя не сохраняется и не ставится в очередь', async () => {
    await expect(clientsRepo.save({ name: '   ', phone: '123' })).rejects.toMatchObject({
      code: 'CLIENT_NAME_REQUIRED',
    })

    expect(await db.query('SELECT * FROM clients')).toHaveLength(0)
    expect(await operationsRepo.countPending()).toBe(0)
  })

  it('имя и телефон нормализуются (пробелы по краям не уезжают на сервер)', async () => {
    const id = await clientsRepo.save({ name: '  Иван   Петров ', phone: ' 123 ' })

    const row = await db.queryOne('SELECT * FROM clients WHERE id = ?', [id])
    expect(row.name).toBe('Иван Петров')
  })

  it('правка офлайн-клиента обновляет очередь insert (иначе сервер получал старое имя)', async () => {
    const id = await clientsRepo.save({ name: 'Иван' })

    const queued = await db.queryOne(
      'SELECT * FROM operations WHERE "table" = ? AND type = ?',
      ['clients', 'insert']
    )
    expect(JSON.parse(queued.payload).name).toBe('Иван')

    await clientsRepo.update({ id, name: 'Пётр' })

    const updated = await db.queryOne('SELECT * FROM operations WHERE id = ?', [queued.id])
    expect(JSON.parse(updated.payload).name).toBe('Пётр')
    expect(JSON.parse(updated.payload).local_id).toBe(id)
    // После правки операция снова готова к отправке.
    expect(updated).toMatchObject({ status: 'pending', attempts: 0 })
    expect(await db.queryOne('SELECT * FROM clients WHERE id = ?', [id])).toMatchObject({
      name: 'Пётр',
    })
  })

  it('частичная правка (только телефон) не обнуляет имя', async () => {
    const id = await clientsRepo.save({ name: 'Иван' })

    await clientsRepo.update({ id, phone: '999' })

    expect(await db.queryOne('SELECT * FROM clients WHERE id = ?', [id])).toMatchObject({
      name: 'Иван',
      phone: '999',
    })

    const queued = await db.queryOne(
      'SELECT * FROM operations WHERE "table" = ? AND type = ?',
      ['clients', 'insert']
    )
    expect(JSON.parse(queued.payload)).toMatchObject({ name: 'Иван', phone: '999' })
  })
})
