// src/stores/useOrderDraftStore.js
//
// Черновик заказа для страницы деталей (Фаза 8, задачи 8.1/8.2).
//
// До рефакторинга вся работа с репозиториями и позиционные SQL-параметры жили прямо в
// `pages/OrderDetailsPage.vue` (1000+ строк), а сами репозитории вызывались из Vue-файла.
// Теперь страница и её компоненты знают только про этот стор (критерий 8.2: в `*.vue`
// нет вызовов `*Repo`), а стор — про репозитории.
//
// Что важно помнить:
//   • позиции заказа (`services`, `materials`, `products`) — это **черновик**: при создании
//     заказа они пишутся в БД/очередь один раз, при правке — «удалить и добавить заново»
//     (как было до рефакторинга, чтобы не плодить частичные update-операции);
//   • уведомления (Quasar) и навигация остаются в странице: стор про UI не знает и на ошибках
//     просто бросает исключение;
//   • `ordersStore.add/update/remove` — единственный путь изменения самого заказа, поэтому
//     после сохранения список ордеров обновляется оптимистично (как раньше).
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

import * as orderServiceRepo from 'src/repositories/orderServiceRepo.js'
import * as materialsRepo from 'src/repositories/materialsRepo.js'
import * as orderProductRepo from 'src/repositories/orderProductRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'
import * as modelsRepo from 'src/repositories/modelsRepo.js'

import { apiClient } from 'src/services/api.js'
import { logger } from 'src/utils/logger'
import { ORDER_NOT_SYNCED } from 'src/utils/shareLinkError.js'
import { normalizeQuantity, normalizeQuantityInput } from 'src/utils/quantity.js'
import { useOrdersStore } from 'src/stores/useOrdersStore.js'
import { useModelsStore } from 'src/stores/useModelsStore.js'
import { useCategoriesStore } from 'src/stores/useCategoriesStore.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'

/** Пустой клиент заказа (подпись в селекторе — как в старой странице). */
const emptyClient = () => ({ id: null, name: 'выберите клиента', phone: '' })
/** Пустая модель техники. */
const emptyModel = () => ({ id: null, name: null })
/** Черновик ещё не созданного заказа. */
const emptyOrder = () => ({ status: 'waiting', paid: false, clientId: null, modelId: null, comments: '' })
/**
 * Количество строки черновика: у работ это `quantity`, у товаров и ручных позиций —
 * `amount`. В поле ввода может лежать пусто/`0`/`−3`/`2.5`, а в заказ, в БД и на сервер
 * уходит только целое ≥ 1 (задача 14.19) — нормализация одна на весь стор.
 */
const lineQuantity = line => normalizeQuantity(line?.quantity ?? line?.amount)

export const useOrderDraftStore = defineStore('orderDraft', {
  state: () => ({
    /** Заказ (`orders`-запись) либо черновик для нового. */
    order: null,
    /** Режим редактирования: новый заказ всегда открывается в нём. */
    editMode: false,

    // --- Позиции заказа (черновик) ---
    services: [],
    materials: [],
    products: [],

    // --- Заказ целиком ---
    client: emptyClient(),
    model: emptyModel(),
    comments: '',
    status: 'waiting',
    paid: false,
    /** Внешний идентификатор объекта (задача 10.9): VIN / серийник рамы / адрес объекта. */
    equipmentIdentifier: null,

    // --- Справочники, нужные форме ---
    clients: [],
    models: [],
    categories: [],
    productCategories: [],
    storeProducts: [],
    selectedProductCategory: null,
    selectedStoreProduct: null,

    /** Работы выбранной категории + выбранная категория. */
    servicesByCategory: [],
    selectedServiceCategory: null,

    loading: false,
  }),

  getters: {
    isNewOrder: state => !state.order?.id,
    /** Номер для шапки: серверный id, а у ещё не синхронизированного — локальный. */
    orderNumber: state => state.order?.server_id || state.order?.id || null,
    servicesTotal: state =>
      state.services.reduce(
        (sum, service) => sum + Number(service.price || 0) * lineQuantity(service),
        0
      ),
    materialsTotal: state =>
      state.materials.reduce(
        (sum, material) => sum + Number(material.price || 0) * lineQuantity(material),
        0
      ),
    productsTotal: state =>
      state.products.reduce(
        (sum, product) => sum + Number(product.price || 0) * lineQuantity(product),
        0
      ),
    totalAmount() {
      return this.servicesTotal + this.materialsTotal + this.productsTotal
    },
    /**
     * Сколько всего позиций в заказе — счётчик на вкладке «обзор».
     * Работы раньше в счётчик не попадали, поэтому при добавлении работы он оставался 0.
     */
    positionsCount: state =>
      state.services.length + state.materials.length + state.products.length,
    /**
     * Себестоимость позиций заказа (задачи 9.5/9.6): закупка × количество по товарам
     * со склада и по ручным позициям. У работ себестоимости нет — это труд мастера,
     * поэтому в стоимость они не входят (так же считает серверный `StatisticRepository`).
     */
    materialsCost: state =>
      state.materials.reduce(
        (sum, material) => sum + Number(material.buy_price || 0) * lineQuantity(material),
        0
      ),
    productsCost: state =>
      state.products.reduce(
        (sum, product) => sum + Number(product.buy_price || 0) * lineQuantity(product),
        0
      ),
    costTotal() {
      return this.materialsCost + this.productsCost
    },
    /** Маржа заказа = выручка − себестоимость (сходится с суммой позиций). */
    margin() {
      return this.totalAmount - this.costTotal
    },
    /** Наценка в % к себестоимости; `null` — если себестоимости в заказе нет. */
    markupPercent() {
      return this.costTotal > 0 ? Math.round((this.margin / this.costTotal) * 100) : null
    },
    /**
     * Есть ли позиции без закупки: маржа тогда «частичная» (неизвестная себестоимость
     * считается нулевой), и об этом честнее сказать в итогах, чем показывать цифру как точную.
     */
    hasUnknownCost: state =>
      [...state.materials, ...state.products].some(line => line.buy_price == null),
  },

  actions: {
    /** Специализация черновика, а для нового заказа — выбранная в сторе специализаций. */
    effectiveSpecializationId() {
      const selected = useSpecializationsStore().getSelectedSpecialization
      return this.order?.specialization_id ?? selected?.id ?? null
    },

    /**
     * Инициализирует страницу: загружает заказ (или черновик), его позиции и справочники.
     * @param {{ create?: boolean }} [options] `create: true` — маршрут `/orders/new`
     */
    async init({ create = false } = {}) {
      this.reset()

      const specializationsStore = useSpecializationsStore()
      if (!specializationsStore.isLoaded) {
        await specializationsStore.load()
      }

      if (create) {
        this.order = emptyOrder()
        this.editMode = true
      } else {
        const selectedOrder = useOrdersStore().getSelectedOrder
        if (selectedOrder) {
          await this.loadOrder(selectedOrder)
        } else {
          // Прямой вход по ссылке: выбранного в сторе заказа нет — ведём себя как при создании
          // (историческое поведение страницы сохранено).
          logger.log('режим нового ордера')
          this.order = emptyOrder()
          this.editMode = true
        }
      }

      await this.loadCatalogs()
    },

    /** Заполняет стор существующим заказом (и подтягивает его позиции). */
    async loadOrder(selectedOrder) {
      this.order = { ...selectedOrder }
      this.paid = !!this.order.paid
      this.status = this.order.status || 'waiting'
      this.comments = this.order.comments || ''
      this.equipmentIdentifier = this.order.equipment_identifier || null
      this.client = {
        id: this.order.client_id,
        name: this.order.client_name,
        phone: this.order.client_phone,
      }

      if (this.order.model_id) {
        const model = await modelsRepo.getById(this.order.model_id)
        if (model) {
          this.model = model
        }
      }

      this.services = await orderServiceRepo.getByOrderId(this.order.id)
      this.materials = await materialsRepo.getByOrderId(this.order.id)
      this.products = await orderProductRepo.getByOrderId(this.order.id)
    },

    /** Справочники формы: клиенты, модели, категории работ, категории товаров. */
    async loadCatalogs() {
      // Строгий фильтр по активному профилю (Фаза 10): без него в форме заказа
      // смешивались клиенты/модели/категории всех ниш.
      const specializationId = this.effectiveSpecializationId()

      this.clients = specializationId
        ? await clientsRepo.getBySpecializationId(specializationId)
        : await clientsRepo.getAll()
      this.models = specializationId
        ? await modelsRepo.getBySpecializationId(specializationId)
        : await modelsRepo.getAll()
      logger.table(this.models)

      const categoriesStore = useCategoriesStore()
      await categoriesStore.load(specializationId)
      this.categories = [...categoriesStore.items]

      this.productCategories = specializationId
        ? await productCategoriesRepo.getBySpecializationId(specializationId)
        : []

      this.selectedServiceCategory = this.categories[0]?.id ?? null
      await this.loadServicesByCategory(this.selectedServiceCategory)
    },

    /** Работы выбранной категории (вкладка «работы»). */
    async loadServicesByCategory(categoryId) {
      this.selectedServiceCategory = categoryId ?? null
      this.servicesByCategory = this.selectedServiceCategory
        ? await servicesRepo.getByCategoryId(this.selectedServiceCategory)
        : []
    },

    /** Товары выбранной категории (диалог «товар со склада»). */
    async loadProductsByCategory(categoryOrId) {
      this.selectedStoreProduct = null
      const categoryId =
        categoryOrId && typeof categoryOrId === 'object' ? categoryOrId.id : categoryOrId
      this.selectedProductCategory = categoryId ?? null
      this.storeProducts = categoryId == null ? [] : await productsRepo.getByCategoryId(categoryId)
    },

    // --- Позиции: локальный черновик ---

    /**
     * Добавляет работу в черновик.
     *
     * @param {object} service работа из каталога (`id`, `service`, `price`)
     * @param {number} [quantity] сколько раз её оказали (задача 14.19). Повторное
     *   добавление той же работы **увеличивает количество**, а не плодит строки:
     *   на сервере связка дедуплицируется по `order_id + service_id`, поэтому вторая
     *   локальная строка просто «потерялась» бы при синке.
     */
    addService(service, quantity = 1) {
      const amount = normalizeQuantity(quantity)
      const existing = this.services.find(line => line.id === service.id)

      if (existing) {
        existing.quantity = normalizeQuantity(Number(existing.quantity || 1) + amount)
        return
      }

      this.services.push({ ...service, quantity: amount })
    },

    removeService(index) {
      this.services.splice(index, 1)
    },

    /**
     * Правка строки работы (цена/количество) — тем же способом, что у материалов
     * и товаров: значение живёт в черновике и уезжает в БД только по «Сохранить».
     */
    updateServiceLine(index, field, value) {
      const line = this.services[index]
      if (line) line[field] = this._normalizeLineField(field, value)
    },

    /**
     * Меняет количество уже выбранной в заказе работы (поле «кол-во» в каталоге работ
     * доступно только у выбранных — задача 14.19).
     *
     * @param {string} serviceId локальный id работы (услуги)
     * @param {unknown} value значение из поля ввода
     */
    setServiceQuantity(serviceId, value) {
      const index = this.services.findIndex(line => line.id === serviceId)
      if (index !== -1) this.updateServiceLine(index, 'quantity', value)
    },

    /**
     * Добавляет ручную позицию в черновик.
     * @param {{name: string, price: number, amount: number, buy_price?: number|null}} line
     */
    addMaterial({ name, price, amount, buy_price }) {
      this.materials.push({
        id: uuidv4(),
        name,
        price,
        amount: normalizeQuantity(amount),
        buy_price: buy_price ?? null,
      })
    },

    removeMaterial(index) {
      this.materials.splice(index, 1)
    },

    updateMaterialLine(index, field, value) {
      const line = this.materials[index]
      if (line) line[field] = this._normalizeLineField(field, value)
    },

    /**
     * Добавляет товар со склада в черновик.
     *
     * @param {{amount?: number}} [payload] `amount` — сколько штук добавляем сразу
     *   (задача 14.19: «нужно несколько одинаковых товаров»). Мусор/ноль/пусто → 1.
     */
    addProductFromStore({ amount = 1 } = {}) {
      const product = this.selectedStoreProduct
      if (!product) return

      // Себестоимость берём из последней закупки товара (склад отдаёт её как `buy_price`,
      // задача 9.3) — это и есть «закупка на момент продажи» (задачи 9.5/9.6).
      // Количество — целое ≥ 1 (мусор/ноль/минус/дробное → 1, задача 14.19).
      this.products.push({
        ...product,
        product_id: product.id,
        price: product.base_sale_price,
        amount: normalizeQuantity(amount),
        buy_price: product.buy_price ?? null,
      })
      this.selectedStoreProduct = null
    },

    removeProduct(index) {
      this.products.splice(index, 1)
    },

    updateProductLine(index, field, value) {
      const line = this.products[index]
      if (line) line[field] = this._normalizeLineField(field, value)
    },

    /**
     * Приводит правку строки к домену:
     *   • пустое поле «закупка» — это «не знаю» (`null`), а не 0: иначе очищенное поле
     *     выглядело бы как «себестоимость 0» и маржа заказа показывалась бы точной
     *     (задачи 9.5/9.6);
     *   • количество (работы — `quantity`, товары и материалы — `amount`) — целое ≥ 1:
     *     «−3 раза» и «2.5 колеса» не существуют (задача 14.19). Пустое поле остаётся
     *     пустым, чтобы можно было стереть цифру и набрать новую.
     */
    _normalizeLineField(field, value) {
      if (field === 'buy_price' && (value === '' || value == null)) {
        return null
      }

      if (field === 'quantity' || field === 'amount') {
        return normalizeQuantityInput(value)
      }

      return value
    },

    // --- Быстрое создание связанных сущностей из формы ---

    /**
     * Создаёт клиента и сразу выбирает его в заказе.
     * @returns {Promise<object|null>} созданный клиент
     */
    async addClient({ name, phone }) {
      const id = await clientsRepo.save({
        name,
        phone,
        specialization_id: this.effectiveSpecializationId(),
      })
      const created = await clientsRepo.getById(id)
      if (created) {
        this.clients.push(created)
        this.client = created
      }
      return created
    },

    /**
     * Создаёт модель техники и сразу выбирает её в заказе.
     *
     * UUID генерируем здесь и передаём в `modelsStore.add`: раньше страница ждала
     * локальный id от экшена, который его не возвращал, — «добавить модель из заказа»
     * падало на чтении `getById(undefined)` (найдено при 8.1).
     *
     * @returns {Promise<object>} созданная модель
     */
    async addModel({ name }) {
      const id = uuidv4()
      const modelsStore = useModelsStore()
      await modelsStore.add({ id, name, specialization_id: this.effectiveSpecializationId() })

      const created = await modelsRepo.getById(id)
      if (!created) {
        throw new Error(`Не удалось создать модель техники «${name}»`)
      }
      this.models.push(created)
      this.model = created
      return created
    },

    /** Создаёт работу в выбранной категории и перечитывает список работ. */
    async addServiceToCatalog({ name, price }) {
      await servicesRepo.save({
        service: name,
        price,
        category_id: this.selectedServiceCategory,
      })
      await this.loadServicesByCategory(this.selectedServiceCategory)
    },

    // --- Сохранение заказа ---

    /** Создаёт заказ и его позиции. @returns {Promise<string>} локальный id заказа */
    async createOrder() {
      const orderId = await useOrdersStore().add({
        specialization_id: this.effectiveSpecializationId(),
        client_id: this.client?.id ?? null,
        model_id: this.model?.id ?? null,
        total_amount: this.totalAmount,
        comments: this.comments,
        equipment_identifier: this.equipmentIdentifier || null,
        paid: this.paid,
        status: this.status,
      })

      for (const service of this.services) {
        // Цену работы фиксируем в самой строке заказа (а не «оставляем на сервер»):
        // офлайн-аналитика считает выручку как `SUM(quantity * sale_price)` и без
        // этого показывала работы нулём до первого синка.
        // Количество — из строки черновика (задача 14.19).
        await orderServiceRepo.add(orderId, service.id, service.price, lineQuantity(service))
      }
      for (const material of this.materials) {
        // Ручная позиция заказа: на сервере это строка `materials` (name/price/amount/buy_price).
        await materialsRepo.add(orderId, {
          name: material.name,
          price: material.price,
          amount: material.amount,
          buy_price: material.buy_price ?? null,
        })
      }
      for (const product of this.products) {
        await orderProductRepo.add(
          orderId,
          product.id,
          product.amount,
          product.price,
          product.buy_price ?? null
        )
      }

      return orderId
    },

    /** Обновляет заказ и перезаписывает его позиции («удалить и добавить заново»). */
    async updateOrder() {
      await useOrdersStore().update(this.order.id, {
        client_id: this.client?.id ?? null,
        model_id: this.model?.id ?? null,
        total_amount: this.totalAmount,
        comments: this.comments,
        equipment_identifier: this.equipmentIdentifier || null,
        paid: this.paid,
        status: this.status,
      })

      await orderServiceRepo.removeByOrderId(this.order.id)
      for (const service of this.services) {
        await orderServiceRepo.add(
          this.order.id,
          service.id,
          service.price,
          lineQuantity(service)
        )
      }

      await materialsRepo.removeByOrderId(this.order.id)
      for (const material of this.materials) {
        await materialsRepo.add(this.order.id, {
          name: material.name,
          price: material.price,
          amount: material.amount,
        })
      }

      await orderProductRepo.removeByOrderId(this.order.id)
      for (const product of this.products) {
        await orderProductRepo.add(this.order.id, product.id, product.amount, product.price)
      }
    },

    /** Сохраняет заказ: новый — создаёт, существующий — обновляет. */
    async save() {
      if (this.isNewOrder) {
        await this.createOrder()
      } else {
        await this.updateOrder()
      }
    },

    /** Переключает «оплачено» и (для уже сохранённого заказа) сразу пишет изменение. */
    async togglePaid() {
      this.paid = !this.paid
      if (!this.isNewOrder) {
        await useOrdersStore().update(this.order.id, { paid: this.paid })
      }
    },

    /** Меняет статус и (для уже сохранённого заказа) сразу пишет изменение. */
    async setStatus(status) {
      this.status = status
      if (!this.isNewOrder) {
        await useOrdersStore().update(this.order.id, { status })
      }
    },

    /** Удаляет заказ (диалог подтверждения — в странице). */
    async removeOrder() {
      await useOrdersStore().remove(this.order.id)
    },

    /**
     * Публичная share-ссылка на отчёт (задача 9.4).
     *
     * Ссылку выдаёт сервер и только владельцу заказа (маршрут под `auth:sanctum`),
     * поэтому заказ обязан быть синхронизированным: без `server_id` серверу нечего
     * открывать. Причина неудачи кодируется (`ORDER_NOT_SYNCED`), а текст для
     * пользователя и остальные случаи (офлайн/401/404) — в `utils/shareLinkError.js`.
     *
     * @returns {Promise<string>} url
     * @throws {Error & { code: string }} `ORDER_NOT_SYNCED` — у заказа ещё нет `server_id`
     */
    async generateShareLink() {
      if (!this.order?.server_id) {
        const error = new Error('Ордер ещё не синхронизирован')
        error.code = ORDER_NOT_SYNCED
        throw error
      }

      const { data } = await apiClient.post(`/order-report/${this.order.server_id}/share-link`)
      return data.url
    },

    /** Кнопка «очистить»: сбрасывает клиента, модель и все позиции. */
    clearPositions() {
      this.client = emptyClient()
      this.model = emptyModel()
      this.services = []
      this.materials = []
      this.products = []
      this.comments = ''
    },

    /** Полный сброс (вызывается при инициализации страницы). */
    reset() {
      this.order = null
      this.editMode = false
      this.services = []
      this.materials = []
      this.products = []
      this.client = emptyClient()
      this.model = emptyModel()
      this.comments = ''
      this.equipmentIdentifier = null
      this.status = 'waiting'
      this.paid = false
      this.clients = []
      this.models = []
      this.categories = []
      this.productCategories = []
      this.storeProducts = []
      this.selectedProductCategory = null
      this.selectedStoreProduct = null
      this.servicesByCategory = []
      this.selectedServiceCategory = null
      this.loading = false
    },
  },
})
