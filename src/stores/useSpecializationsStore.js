// src/stores/useSpecializationsStore.js
//
// Рабочие профили мастерской (Фаза 10, решения D4/D5). Специализация — сквозная
// ось и на клиенте, и на сервере (к ней привязаны заказы, клиенты, каталог),
// поэтому здесь только продуктовая оболочка: выбор активного профиля, его пресет,
// применение пресета и архивирование вместо физического удаления.
import { defineStore } from 'pinia'
import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import { getPreset } from 'src/domain/presets/index.js'
import { materializePreset } from 'src/domain/presetApply.js'
import { serializeFeatures } from 'src/domain/features.js'
import { resolvePreset } from 'src/services/presetService.js'

export const useSpecializationsStore = defineStore('specializations', {
  state: () => ({
    items: [],              // список специализаций
    selectedId: null,       // текущая выбранная
    loading: false,
    syncing: false,
    error: null
  }),

  getters: {
    getSelectedSpecialization(state) {
      return state.items.find(s => s.id === state.selectedId) || null
    },
    /** Профили, доступные в переключателе: архивированные скрыты (задача 10.8). */
    activeItems: (state) => state.items.filter(s => !s.archived),
    /** Пресет активного профиля (или `null`, если пресета нет). */
    activePreset() {
      return getPreset(this.getSelectedSpecialization?.preset_key)
    },
    isLoaded: (state) => state.items.length > 0
  },

  actions: {
    async load() {
      this.loading = true
      try {
        this.items = await specializationsRepo.getAll()
        this._ensureSelection()
      } catch (err) {
        this.error = err
      } finally {
        this.loading = false
      }
    },

    /** Держит выбранным существующий неархивированный профиль (или первый доступный). */
    _ensureSelection() {
      const current = this.items.find(s => s.id === this.selectedId)
      if (current && !current.archived) return

      this.selectedId = this.activeItems[0]?.id ?? null
    },

    /** Выбирает активный профиль; архивированный выбрать нельзя. */
    async select(id) {
      const target = this.items.find(s => s.id === id)
      if (target?.archived) return
      this.selectedId = id
    },

    async add(data) {
      // оптимистично вносим в UI
      const newItem = { ...data, id: data.id || crypto.randomUUID() }
      this.items.push(newItem)

      try {
        await specializationsRepo.save(newItem)
        if (this.selectedId === null) this.selectedId = newItem.id
      } catch (err) {
        this.error = err
        // откат если нужно
        this.items = this.items.filter(s => s.id !== newItem.id)
      }
    },

    /**
     * Создаёт профиль из **доступного** пресета (задача 12.1): пользователь выбирает
     * нишу из списка, а не вводит произвольное название. Каталог, лексикон и флаги
     * разделов появляются сразу — тот же путь, что при регистрации
     * (`onboardLocal` + `applyPreset`).
     *
     * @param {string} presetKey `bike` / `aquarium` / `hvac` / `auto`
     * @returns {Promise<string>} локальный id нового профиля
     */
    async createFromPreset(presetKey) {
      const preset = getPreset(presetKey)
      if (!preset) throw new Error(`Неизвестный пресет: ${presetKey}`)

      const id = crypto.randomUUID()

      // Метаданные профиля кладём сразу, чтобы они уехали тем же INSERT'ом.
      await this.add({
        id,
        name: preset.label,
        preset_key: preset.key,
        accent: preset.accent,
        features: serializeFeatures(preset.features),
        template_version: preset.version ?? null,
      })

      // Материализуем каталог: «профилей без пресета» больше не появляется (12.1).
      await this.applyPreset(id, preset.key)

      await this.select(id)

      return id
    },

    async update(id, changes) {
      const index = this.items.findIndex(s => s.id === id)
      if (index === -1) return

      const oldItem = { ...this.items[index] }
      this.items[index] = { ...oldItem, ...changes }

      try {
        // ⚠️ До Фазы 10 здесь стояло `specializationsRepo.update(id, changes)` —
        // двумя аргументами, тогда как репозиторий ждёт объект. Правка профиля
        // (пресет/архив/переименование, задачи 10.4/10.6/10.8) пошла по этому пути
        // впервые — сигнатуры сведены к одной.
        await specializationsRepo.update({ id, ...changes })
      } catch (err) {
        this.error = err
        this.items[index] = oldItem
        throw err
      }
    },

    async remove(id) {
      const oldList = [...this.items]
      this.items = this.items.filter(s => s.id !== id)
      try {
        await specializationsRepo.remove(id)
        if (this.selectedId === id) this._ensureSelection()
      } catch (err) {
        this.error = err
        this.items = oldList
      }
    },

    /**
     * Применяет пресет к профилю (задача 10.4): материализует каталог и записывает
     * метаданные UI (`preset_key`, `accent`, `features`, `template_version`).
     * Повторное применение идемпотентно — дублей не будет.
     *
     * @param {string} specializationId
     * @param {string} presetKey `bike` / `aquarium` / `hvac` / `auto`
     * @returns {Promise<object>} сводка `materializePreset`
     */
    async applyPreset(specializationId, presetKey) {
      // 10.7: контент берём из серверного кэша (если он есть), метаданные UI —
      // из клиентского пресета. Фолбэк на локальный JSON — офлайн-первый вход.
      const preset = await resolvePreset(presetKey)
      if (!preset) throw new Error(`Неизвестный пресет: ${presetKey}`)

      const result = await materializePreset({ preset, specializationId })

      await this.update(specializationId, {
        preset_key: preset.key,
        accent: preset.accent,
        features: serializeFeatures(preset.features),
        template_version: preset.version ?? null,
      })

      return result
    },

    /** Архивирует профиль (вместо удаления: у серверных FK `onDelete('cascade')`). */
    async archive(id) {
      await this.update(id, { archived: 1 })
      if (this.selectedId === id) this._ensureSelection()
    },

    /** Возвращает профиль из архива. */
    async unarchive(id) {
      await this.update(id, { archived: 0 })
    },

    /**
     * Онбординг после регистрации (задача 10.5): сервер при создании пользователя
     * уже создал специализации, поэтому кладём их локально **без** операции в
     * очередь (`applyServerRecord`), иначе они продублируются на сервере.
     *
     * @param {Array<object>} records специализации из ответа `/register`
     * @returns {Promise<string[]>} локальные id созданных записей
     */
    async onboardFromServer(records = []) {
      const localIds = []

      for (const record of records) {
        if (!record?.id) continue
        const localId = await specializationsRepo.applyServerRecord(record)
        if (localId) localIds.push(localId)
      }

      await this.load()
      if (localIds.length) this.selectedId = localIds[0]

      return localIds
    },

    /**
     * Локальный онбординг (фолбэк, если сервер не вернул специализации в ответе
     * регистрации): создаём профили в очереди синка. Поля профиля (`preset_key`,
     * `accent`, `features`) кладём сразу, чтобы они уехали тем же INSERT'ом.
     *
     * @param {Array<{name: string, preset_key?: string, accent?: string,
     *   features?: string, template_version?: number}>} defs
     * @returns {Promise<string[]>} локальные id
     */
    async onboardLocal(defs = []) {
      const localIds = []

      for (const def of defs) {
        const id = crypto.randomUUID()
        await this.add({ id, ...def })
        localIds.push(id)
      }

      return localIds
    }
  }
})
