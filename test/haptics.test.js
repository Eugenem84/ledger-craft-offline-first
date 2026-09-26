// test/haptics.test.js
//
// Виброотклик по приложению (правка владельца 26.09.2026: «при смене вкладок туда-сюда
// характерные щелчки, при сохранении вибро… и сам подумай куда ещё напихать»).
//
// Плагин `@capacitor/haptics` нативный: в браузере и в тестах он не грузится, а все
// функции молча возвращают `false`. Это и проверяем — плюс то, что отклик прикручен к
// нужным местам (разделы, тумблеры, карусель, подтверждение удаления) и к уведомлениям
// через boot-файл.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import bootHaptics from 'src/boot/haptics.js'
import {
  HAPTIC_BY_NOTIFY_TYPE,
  errorHaptic,
  isHapticsSupported,
  selectionHaptic,
  successHaptic,
  tickHaptic,
  warningHaptic,
} from 'src/utils/haptics.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

describe('26.09.2026 виброотклик', () => {
  it('вне телефона плагин не грузится: отклики молча возвращают false', async () => {
    // В тестах Capacitor считает платформу веб-платформой → нативный плагин не нужен.
    expect(isHapticsSupported()).toBe(false)

    await expect(selectionHaptic()).resolves.toBe(false)
    await expect(tickHaptic()).resolves.toBe(false)
    await expect(successHaptic()).resolves.toBe(false)
    await expect(warningHaptic()).resolves.toBe(false)
    await expect(errorHaptic()).resolves.toBe(false)
  })

  it('у щелчка карусели есть минимальный интервал — иначе вибро слилось бы в гул', () => {
    const source = read('src/utils/haptics.js')

    // Щелчок — очень короткая вибрация плюс «не чаще, чем раз в N мс».
    expect(source).toContain('TICK_DURATION_MS')
    expect(source).toContain('TICK_MIN_GAP_MS')
    expect(source).toContain("runHaptic('vibrate'")
  })

  it('тип уведомления решает отклик, «info» — молчит', () => {
    expect(HAPTIC_BY_NOTIFY_TYPE.positive).toBe(successHaptic)
    expect(HAPTIC_BY_NOTIFY_TYPE.negative).toBe(errorHaptic)
    expect(HAPTIC_BY_NOTIFY_TYPE.warning).toBe(warningHaptic)
    expect(HAPTIC_BY_NOTIFY_TYPE.info).toBeUndefined()
  })

  it('boot-файл вешает отклик на `$q.notify`, не ломая сам notify', () => {
    const calls = []
    const setDefaults = () => 'defaults'
    const notify = options => {
      calls.push(options)
      return 'shown'
    }
    notify.setDefaults = setDefaults
    notify.registerType = () => 'registered'

    const $q = { notify }

    bootHaptics({ app: { config: { globalProperties: { $q } } } })

    // Ссылку подменили (иначе вибро не подключилось бы)…
    expect($q.notify).not.toBe(notify)
    // …но уведомление по-прежнему доходит до Quasar как раньше.
    expect($q.notify({ type: 'positive', message: 'Ордер сохранен' })).toBe('shown')
    expect(calls).toHaveLength(1)
    // Сервисные свойства функции не потерялись при подмене.
    expect($q.notify.setDefaults).toBe(setDefaults)
    expect($q.notify.registerType).toBe(notify.registerType)
  })

  it('boot-файл подключён вторым — до тех, кто пишет уведомления при старте', () => {
    const config = read('quasar.config.js')
    const bootList = config.slice(config.indexOf('boot: ['), config.indexOf('boot: [') + 400)

    expect(bootList).toContain("'haptics'")
    expect(bootList.indexOf("'haptics'")).toBeGreaterThan(bootList.indexOf("'errorLog'"))
    expect(bootList.indexOf("'haptics'")).toBeLessThan(bootList.indexOf("'axios'"))
  })

  it('щелчок стоит на смене раздела, тумблерах и подтверждении удаления', () => {
    const layout = read('src/layouts/MainLayout.vue')
    const header = read('src/components/order/OrderHeaderActions.vue')
    const confirm = read('src/pages/dialogs/DeleteConfirmPage.vue')
    const select = read('src/components/ui/LcQuantitySelect.vue')

    // Разделы: слушаем индекс вкладки — один код на тап по таббару и на свайп.
    expect(layout).toContain('tickHaptic')
    expect(layout).toContain('watch(tabIndex')

    // Тумблеры статуса/оплаты: щелчок только на настоящее переключение.
    expect(header).toContain('tickHaptic')
    expect(header).toContain('const setStatus = value =>')
    expect(header).toContain('const setPaid = value =>')

    // Необратимое действие — «внимание».
    expect(confirm).toContain('warningHaptic')

    // Количество — карусель (её щелчки живут в `LcWheelPicker`).
    expect(select).toContain('<LcWheelPicker')
  })
})
