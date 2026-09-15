// test/order-draft-store.test.js
//
// Фаза 8 (8.1/8.2): стор черновика заказа — то, что раньше жило прямо в
// `OrderDetailsPage.vue`. Тест гоняет стор на **настоящем** sql.js с реальными миграциями,
// репозиториями и `ordersStore`: создание заказа с работой/материалом/товаром,
// перечитывание его позиций из БД и правка («удалить и добавить заново»).
//
// Здесь же — регрессия на «добавить модель техники из заказа»: до рефакторинга страница
// ждала локальный id от `modelsStore.add` (экшен его не возвращал) и падала на
// `modelsRepo.getById(undefined)`.
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'
import * as orderServiceRepo from 'src/repositories/orderServiceRepo.js'
import * as materialsRepo from 'src/repositories/materialsRepo.js'
import * as orderProductRepo from 'src/repositories/orderProductRepo.js'

import { useOrderDraftStore } from 'src/stores/useOrderDraftStore.js'
import { useOrdersStore } from 'src/stores/useOrdersStore.js'

const ORDER_TABLES = ['orders', 'order_service', 'materials', 'order_product']

/** Минимальный справочник: специализация, категория работ, работа, клиент, товар. */
async function seedCatalog() {
  const specializationId = await specializationsRepo.save({ name: 'Ремонт' })
  // Привязка к профилю (Фаза 10): после строгого фильтра каталога/справочников
  // запись без `specialization_id` в профиле не видна (легаси-строки разово
  // привязывает миграция 029 — см. `catalog-specialization-filter.test.js`).
  const categoryId = await categoriesRepo.save({
    category_name: 'Двигатель',
    specialization_id: specializationId,
  })
  const serviceId = await servicesRepo.save({
    service: 'Замена масла',
    price: 500,
    category_id: categoryId,
  })
  const clientId = await clientsRepo.save({
    name: 'Иван',
    phone: '123',
    specialization_id: specializationId,
  })
  const productCategoryId = await productCategoriesRepo.save({
    name: 'Фильтры',
    specialization_id: specializationId,
  })
  const productId = await productsRepo.save({
    name: 'Фильтр',
    base_sale_price: 300,
    product_category_id: productCategoryId,
  })

  return { specializationId, categoryId, serviceId, clientId, productId }
}

/** Таблицы очереди операций — по ним проверяем, что позиции реально уезжают в синк. */
async function queuedTables() {
  const rows = await db.query('SELECT * FROM operations')
  return rows.map(row => row.table)
}

beforeEach(async () => {
  await setupTestDb()
  setActivePinia(createPinia())
})

describe('8.1 useOrderDraftStore', () => {
  it('новый заказ: справочники, итоги и запись заказа с позициями', async () => {
    const { categoryId, serviceId, clientId, productId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })

    expect(draft.isNewOrder).toBe(true)
    expect(draft.editMode).toBe(true)
    // Справочники и первая категория работ (как делала страница в onMounted)
    expect(draft.categories).toHaveLength(1)
    expect(draft.selectedServiceCategory).toBe(categoryId)
    expect(draft.servicesByCategory.map(service => service.service)).toEqual(['Замена масла'])
    expect(draft.clients.map(client => client.name)).toEqual(['Иван'])

    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 })
    draft.addMaterial({ name: 'Герметик', price: 200, amount: 2 })
    draft.selectedStoreProduct = { id: productId, name: 'Фильтр', base_sale_price: 300 }
    draft.addProductFromStore()
    draft.comments = 'тест'

    expect(draft.servicesTotal).toBe(500)
    expect(draft.materialsTotal).toBe(400)
    expect(draft.productsTotal).toBe(300)
    expect(draft.totalAmount).toBe(1200)

    const orderId = await draft.createOrder()

    expect(await db.queryOne('SELECT * FROM orders WHERE id = ?', [orderId])).toMatchObject({
      client_id: clientId,
      total_amount: 1200,
      comments: 'тест',
      status: 'waiting',
      paid: 0,
    })
    expect(await orderServiceRepo.getByOrderId(orderId)).toHaveLength(1)
    expect(await materialsRepo.getByOrderId(orderId)).toHaveLength(1)
    expect(await orderProductRepo.getByOrderId(orderId)).toHaveLength(1)

    // Регрессия «аналитика не считала работы»: цена работы фиксируется в строке заказа
    // сразу (офлайн-первая аналитика считает выручку как `quantity * sale_price`).
    expect(
      await db.queryOne('SELECT * FROM order_service WHERE order_id = ?', [orderId])
    ).toMatchObject({ service_id: serviceId, sale_price: 500 })

    const queued = await queuedTables()
    for (const table of ORDER_TABLES) {
      expect(queued).toContain(table)
    }
  })

  it('существующий заказ: подтягивает клиента и все позиции', async () => {
    const { serviceId, clientId, productId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 })
    draft.addMaterial({ name: 'Герметик', price: 200, amount: 2 })
    draft.selectedStoreProduct = { id: productId, name: 'Фильтр', base_sale_price: 300 }
    draft.addProductFromStore()
    draft.comments = 'первая правка'
    const orderId = await draft.createOrder()

    // Как со страницы списка: ордер выбран в `ordersStore`
    const ordersStore = useOrdersStore()
    await ordersStore.load()
    await ordersStore.select(orderId)

    await draft.init({ create: false })

    expect(draft.isNewOrder).toBe(false)
    expect(draft.order.id).toBe(orderId)
    expect(draft.client).toMatchObject({ id: clientId, name: 'Иван' })
    expect(draft.services).toHaveLength(1)
    expect(draft.materials).toHaveLength(1)
    expect(draft.products).toHaveLength(1)
    expect(draft.comments).toBe('первая правка')
    expect(draft.servicesTotal).toBe(500)
    expect(draft.materialsTotal).toBe(400)
    expect(draft.productsTotal).toBe(300)
  })

  it('правка заказа перезаписывает позиции без дублей и сохраняет итоги', async () => {
    const { categoryId, serviceId, clientId } = await seedCatalog()
    const secondServiceId = await servicesRepo.save({
      service: 'Замена фильтра',
      price: 100,
      category_id: categoryId,
    })

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 })
    draft.addMaterial({ name: 'Герметик', price: 200, amount: 1 })
    const orderId = await draft.createOrder()

    // Заказ уже синхронизирован (как после первого `sync()`) — тогда правки уходят
    // отдельными `update`-операциями, а не растворяются в `insert` (см. ordersRepo.update).
    await db.execute('UPDATE orders SET server_id = ? WHERE id = ?', [555, orderId])

    const ordersStore = useOrdersStore()
    await ordersStore.load()
    await ordersStore.select(orderId)
    await draft.init({ create: false })
    draft.addService({ id: secondServiceId, service: 'Замена фильтра', price: 100 })
    draft.removeMaterial(0)
    draft.comments = 'вторая правка'
    await draft.setStatus('done')
    await draft.togglePaid()
    await draft.save()

    // Меняем состав: добавляем работу, убираем материал, закрываем заказ, помечаем оплату
    expect(await db.queryOne('SELECT * FROM orders WHERE id = ?', [orderId])).toMatchObject({
      total_amount: 600,
      comments: 'вторая правка',
      status: 'done',
      paid: 1,
    })
    expect(await orderServiceRepo.getByOrderId(orderId)).toHaveLength(2)
    expect(await materialsRepo.getByOrderId(orderId)).toHaveLength(0)

    // Заказ обновляется операцией `update`, а не повторным `insert`
    const orderOps = (await db.query('SELECT * FROM operations')).filter(
      op => op.table === 'orders'
    )
    const orderTypes = orderOps.map(op => op.type)
    expect(orderTypes[0]).toBe('insert')
    expect(orderTypes.filter(type => type === 'update').length).toBeGreaterThan(0)
  })

  it('«добавить модель из заказа» создаёт модель и выбирает её (регрессия 8.1)', async () => {
    await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })

    const created = await draft.addModel({ name: 'Kia Rio' })

    expect(created).toMatchObject({ name: 'Kia Rio' })
    expect(created.id).toBeTruthy()
    expect(draft.model).toMatchObject({ id: created.id, name: 'Kia Rio' })
    expect(draft.models.map(model => model.id)).toContain(created.id)
  })

  it('себестоимость позиций: маржа/наценка заказа и buy_price в очереди синка (9.5/9.6)', async () => {
    const { clientId, productId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }

    // Ручная позиция: закупку вводит мастер (взять её больше неоткуда).
    draft.addMaterial({ name: 'Герметик', price: 200, amount: 2, buy_price: 50 })
    // Товар со склада: закупка приезжает из последней закупки (`buy_price`, задача 9.3).
    draft.selectedStoreProduct = {
      id: productId,
      name: 'Фильтр',
      base_sale_price: 1000,
      buy_price: 700,
    }
    draft.addProductFromStore()

    expect(draft.materialsCost).toBe(100) // 2 × 50
    expect(draft.productsCost).toBe(700) // 1 × 700
    expect(draft.costTotal).toBe(800)
    expect(draft.totalAmount).toBe(1400) // 2×200 + 1×1000
    expect(draft.margin).toBe(600) // 1400 − 800
    expect(draft.markupPercent).toBe(75) // 600 / 800
    expect(draft.hasUnknownCost).toBe(false)

    const orderId = await draft.createOrder()

    // На сервер уезжает себестоимость — иначе маржа там считалась бы как «выручка = прибыль».
    const operations = await db.query('SELECT * FROM operations')
    const materialOp = operations.find(op => op.table === 'materials')
    const productOp = operations.find(op => op.table === 'order_product')

    expect(JSON.parse(materialOp.payload)).toMatchObject({ price: 200, amount: 2, buy_price: 50 })
    expect(JSON.parse(productOp.payload)).toMatchObject({
      sale_price: 1000,
      quantity: 1,
      buy_price: 700,
    })

    // И сохраняется локально: маржа видна и после перезагрузки заказа.
    expect(await db.queryOne('SELECT buy_price FROM materials WHERE order_id = ?', [orderId])).toMatchObject({ buy_price: 50 })
    expect(await db.queryOne('SELECT buy_price FROM order_product WHERE order_id = ?', [orderId])).toMatchObject({ buy_price: 700 })
  })

  it('позиция без закупки: маржа равна выручке, наценка не определена (9.5/9.6)', async () => {
    const { clientId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addMaterial({ name: 'Изолента', price: 100, amount: 1 })

    expect(draft.costTotal).toBe(0)
    expect(draft.margin).toBe(100)
    expect(draft.markupPercent).toBeNull()
    expect(draft.hasUnknownCost).toBe(true)

    // Мастер стёр поле «закупка» в редакторе: это «не знаю», а не «себестоимость 0».
    draft.updateMaterialLine(0, 'buy_price', '')
    expect(draft.materials[0].buy_price).toBeNull()
    expect(draft.hasUnknownCost).toBe(true)
    expect(draft.markupPercent).toBeNull()
  })
})

describe('14.19 количество работ и товаров в заказе', () => {
  it('работа ×4: итог, строка заказа и payload синка', async () => {
    const { serviceId, clientId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    // «Подкачать колесо» ×4 (четыре колеса) — количество задаёт мастер, а не N строк.
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 }, 4)

    expect(draft.servicesTotal).toBe(2000)
    expect(draft.totalAmount).toBe(2000)

    const orderId = await draft.createOrder()

    expect(
      await db.queryOne('SELECT * FROM order_service WHERE order_id = ?', [orderId])
    ).toMatchObject({ service_id: serviceId, sale_price: 500, quantity: 4 })

    // Количество уезжает на сервер: без него он проставил бы 1 (спец-обработка связки).
    const op = (await db.query('SELECT * FROM operations')).find(
      row => row.table === 'order_service'
    )
    expect(JSON.parse(op.payload)).toMatchObject({ quantity: 4, sale_price: 500 })
  })

  it('повторное добавление той же работы увеличивает количество, а не плодит строки', async () => {
    const { serviceId, clientId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 })
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 }, 2)

    // На сервере связка дедуплицируется по `order_id + service_id`: вторая строка
    // просто «потерялась» бы при синке, поэтому количество складываем в одну строку.
    expect(draft.services).toHaveLength(1)
    expect(draft.services[0].quantity).toBe(3)
    expect(draft.servicesTotal).toBe(1500)
  })

  it('количество возвращается при открытии заказа и правится в списке работ', async () => {
    const { serviceId, clientId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 }, 4)
    const orderId = await draft.createOrder()

    const ordersStore = useOrdersStore()
    await ordersStore.load()
    await ordersStore.select(orderId)
    await draft.init({ create: false })

    // Строка заказа приносит и количество, и цену строки (`sale_price`).
    expect(draft.services[0]).toMatchObject({ id: serviceId, quantity: 4, price: 500 })
    expect(draft.servicesTotal).toBe(2000)

    // Мастер поправил количество прямо в списке — как у материалов и товаров.
    draft.updateServiceLine(0, 'quantity', 2)
    expect(draft.servicesTotal).toBe(1000)

    await draft.save()

    expect(
      await db.queryOne('SELECT quantity FROM order_service WHERE order_id = ?', [orderId])
    ).toMatchObject({ quantity: 2 })
  })

  it('товар со склада добавляется сразу в нужном количестве', async () => {
    const { clientId, productId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.selectedStoreProduct = {
      id: productId,
      name: 'Фильтр',
      base_sale_price: 300,
      buy_price: 200,
    }
    // Так диалог «товар со склада» отдаёт количество (payload события `submit`).
    draft.addProductFromStore({ amount: 3 })

    expect(draft.products).toHaveLength(1)
    expect(draft.productsTotal).toBe(900)

    const orderId = await draft.createOrder()

    expect(
      await db.queryOne('SELECT * FROM order_product WHERE order_id = ?', [orderId])
    ).toMatchObject({ product_id: productId, quantity: 3, sale_price: 300 })

    const op = (await db.query('SELECT * FROM operations')).find(
      row => row.table === 'order_product'
    )
    expect(JSON.parse(op.payload)).toMatchObject({ quantity: 3, sale_price: 300, buy_price: 200 })

    // Пустое/нулевое поле в диалоге — это «одна штука», а не нулевая позиция.
    draft.selectedStoreProduct = { id: productId, name: 'Фильтр', base_sale_price: 300 }
    draft.addProductFromStore({ amount: 0 })

    expect(draft.products[1].amount).toBe(1)
    expect(draft.productsTotal).toBe(1200)
  })

  it('минус и дробь в поле количества не доезжают ни до черновика, ни до БД', async () => {
    const { serviceId, productId, clientId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 })

    // Мастер набрал «−3» в поле количества работы: «выполнено −3 раза» не бывает.
    draft.updateServiceLine(0, 'quantity', '-3')
    expect(draft.services[0].quantity).toBe(1)
    expect(draft.servicesTotal).toBe(500)

    // «2.5» у товара со склада — дробных штук тоже нет.
    draft.selectedStoreProduct = { id: productId, name: 'Фильтр', base_sale_price: 300 }
    draft.addProductFromStore({ amount: '2.5' })
    expect(draft.products[0].amount).toBe(2)
    expect(draft.productsTotal).toBe(600)

    const orderId = await draft.createOrder()

    expect(
      await db.queryOne('SELECT quantity FROM order_service WHERE order_id = ?', [orderId])
    ).toMatchObject({ quantity: 1 })
    expect(
      await db.queryOne('SELECT quantity FROM order_product WHERE order_id = ?', [orderId])
    ).toMatchObject({ quantity: 2 })

    // Ручная позиция: amount — тоже количество (минус обрезается до 1).
    draft.addMaterial({ name: 'Изолента', price: 100, amount: '-2' })
    expect(draft.materials[0].amount).toBe(1)
    draft.updateMaterialLine(0, 'amount', '3.7')
    expect(draft.materials[0].amount).toBe(3)
    expect(draft.materialsTotal).toBe(300)
  })

  it('пустое поле количества можно стереть, но в заказ уходит 1', async () => {
    const { serviceId, clientId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 }, 4)

    // Поле очищено (мастер стирает цифру, чтобы набрать новую) — итог считает «×1»,
    // а не «×0» и не отрицательное значение.
    draft.updateServiceLine(0, 'quantity', '')
    expect(draft.services[0].quantity).toBe('')
    expect(draft.servicesTotal).toBe(500)

    const orderId = await draft.createOrder()

    expect(
      await db.queryOne('SELECT quantity FROM order_service WHERE order_id = ?', [orderId])
    ).toMatchObject({ quantity: 1 })
  })

  it('количество выбранной работы меняется по id из каталога (setServiceQuantity)', async () => {
    const { serviceId, clientId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 })

    draft.setServiceQuantity(serviceId, 4)

    expect(draft.services[0].quantity).toBe(4)
    expect(draft.servicesTotal).toBe(2000)

    // Работы больше нет в черновике — правка по id ничего не ломает.
    draft.setServiceQuantity('нет-такой-работы', 2)
    expect(draft.services).toHaveLength(1)
  })
})
