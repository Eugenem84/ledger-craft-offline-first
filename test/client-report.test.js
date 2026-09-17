// test/client-report.test.js
//
// Отчёт клиенту: как он собирается и что мастер может в него включить.
//
//   1. Формат — ссылка (её выдаёт сервер) или текст: часть клиентов боится переходить на
//      чужие сайты, а текст вставляется в мессенджер как есть и работает офлайн.
//   2. Состав (правка владельца 17.09.2026, вкладка «отчёты» в настройках) — по умолчанию
//      минимум («уместиться даже в одно SMS»): статус, позиции с ценами, итог и
//      комментарий. По выбору мастера добавляются имя клиента, телефон, модель техники и
//      раздельные итоги (за работы / за запчасти). Подпись с сайтом пока выключена
//      («сайт пока убери, добавим потом» — флаг `signature` в `REPORT_CONTENT_HIDDEN`).
//      Номера заказа, объекта и даты в отчёте нет, слова «оплачено» нет.
//
// Проверяем три слоя: чистый сборщик текста (`utils/reportText.js`), настройки устройства
// (`utils/reportSettings.js`) и данные, которые отдаёт стор заказа
// (`useOrderDraftStore.clientReport`). UI — структурно по исходникам `.vue`
// (в проекте нет @vue/test-utils), как в `profile-sections.test.js`.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { setupTestDb } from './helpers/testDb.js'
import storage from 'src/utils/storage.js'
import { useOrderDraftStore } from 'src/stores/useOrderDraftStore.js'
import {
  DEFAULT_REPORT_CONTENT,
  REPORT_CONTENT_HIDDEN,
  REPORT_CONTENT_HINTS,
  REPORT_CONTENT_KEY,
  REPORT_CONTENT_LABELS,
  REPORT_FORMAT_HINTS,
  REPORT_FORMAT_KEY,
  REPORT_FORMAT_LABELS,
  REPORT_FORMAT_LINK,
  REPORT_FORMAT_TEXT,
  getReportContent,
  getReportFormat,
  isReportTextMode,
  normalizeReportContent,
  normalizeReportFormat,
  setReportContent,
  setReportContentFlag,
  setReportFormat,
} from 'src/utils/reportSettings.js'
import {
  REPORT_SIGNATURE,
  buildOrderReportText,
  formatMoney,
  formatQuantity,
} from 'src/utils/reportText.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

beforeEach(async () => {
  await setupTestDb()
  setActivePinia(createPinia())
})

describe('17.09 отчёт клиенту: формат хранится на устройстве', () => {
  it('неизвестное значение приводится к «ссылке», а не к пустому режиму', () => {
    expect(normalizeReportFormat('магия')).toBe(REPORT_FORMAT_LINK)
    expect(normalizeReportFormat(null)).toBe(REPORT_FORMAT_LINK)
    expect(normalizeReportFormat(REPORT_FORMAT_TEXT)).toBe(REPORT_FORMAT_TEXT)
  })

  it('выбор переживает перезапуск (пишется в storage)', () => {
    setReportFormat(REPORT_FORMAT_TEXT)
    expect(getReportFormat()).toBe(REPORT_FORMAT_TEXT)
    expect(isReportTextMode()).toBe(true)
    expect(storage.getItem(REPORT_FORMAT_KEY)).toBe(REPORT_FORMAT_TEXT)

    setReportFormat(REPORT_FORMAT_LINK)
    expect(isReportTextMode()).toBe(false)
    expect(storage.getItem(REPORT_FORMAT_KEY)).toBe(REPORT_FORMAT_LINK)
  })

  it('у каждого режима есть подпись и пояснение для настроек', () => {
    for (const mode of [REPORT_FORMAT_LINK, REPORT_FORMAT_TEXT]) {
      expect(REPORT_FORMAT_LABELS[mode], `${mode}: label`).toBeTruthy()
      expect(REPORT_FORMAT_HINTS[mode], `${mode}: hint`).toBeTruthy()
    }
  })

  it('подпись-источник внизу отчёта указывает на ledgerCraft.ru', () => {
    expect(REPORT_SIGNATURE).toBe('ledgerCraft.ru')
  })
})

describe('17.09 отчёт клиенту: состав отчёта хранится на устройстве', () => {
  it('умолчание — минимальный отчёт: все необязательные строки выключены', () => {
    for (const [flag, value] of Object.entries(DEFAULT_REPORT_CONTENT)) {
      expect(value, `${flag}: умолчание`).toBe(false)
    }

    expect(getReportContent()).toEqual({ ...DEFAULT_REPORT_CONTENT })
  })

  it('мусор и частичные данные не ломают состав', () => {
    expect(normalizeReportContent('не json')).toEqual({ ...DEFAULT_REPORT_CONTENT })
    expect(normalizeReportContent(['clientName'])).toEqual({ ...DEFAULT_REPORT_CONTENT })

    // Неизвестные ключи игнорируем, известные приводим строго к boolean.
    expect(normalizeReportContent({ clientName: 1, мусор: true })).toEqual({
      ...DEFAULT_REPORT_CONTENT,
      clientName: true,
    })
    expect(normalizeReportContent({ model: '0' }).model).toBe(false)
  })

  it('выбор переживает перезапуск (пишется в storage)', () => {
    setReportContentFlag('clientPhone', true)

    expect(getReportContent().clientPhone).toBe(true)
    expect(storage.getItem(REPORT_CONTENT_KEY)).toContain('"clientPhone":true')

    // Частичный набор не сбрасывает уже выбранные флаги.
    setReportContent({ partsTotal: true })
    expect(getReportContent()).toMatchObject({ clientPhone: true, partsTotal: true })

    // И читается обратно тем же нормализатором, что и при старте приложения.
    expect(normalizeReportContent(storage.getItem(REPORT_CONTENT_KEY))).toMatchObject({
      clientPhone: true,
      partsTotal: true,
    })

    setReportContent(DEFAULT_REPORT_CONTENT)
    expect(getReportContent()).toEqual({ ...DEFAULT_REPORT_CONTENT })
  })

  it('неизвестный флаг не создаёт «фантомной» настройки', () => {
    expect(setReportContentFlag('site', true)).toBeUndefined()
    expect(getReportContent()).not.toHaveProperty('site')
  })

  it('у каждого флага есть подпись и пояснение, а «сайт» пока спрятан', () => {
    for (const flag of Object.keys(DEFAULT_REPORT_CONTENT)) {
      expect(REPORT_CONTENT_LABELS[flag], `${flag}: label`).toBeTruthy()
      expect(REPORT_CONTENT_HINTS[flag], `${flag}: hint`).toBeTruthy()
    }

    // «сайт пока убери, добавим потом»: флаг жив (логика подписи не удалена), но тумблера
    // в интерфейсе нет — состав тумблеров собирается с учётом этого списка.
    expect(REPORT_CONTENT_HIDDEN).toContain('signature')
  })
})

describe('17.09 отчёт клиенту: форматирование денег и количества', () => {
  it('деньги — целые без копеек, тысячные разряды через пробел', () => {
    expect(formatMoney(0)).toBe('0')
    expect(formatMoney(500)).toBe('500')
    expect(formatMoney(1100)).toBe('1 100')
    expect(formatMoney(1234.5)).toBe('1 234.5')
    expect(formatMoney(1234567.89)).toBe('1 234 567.89')
    expect(formatMoney(-50)).toBe('-50')
    // Мусор не превращается в `NaN` в сообщении клиенту.
    expect(formatMoney(null)).toBe('0')
    expect(formatMoney('abc')).toBe('0')
  })

  it('количество — как в заказе, без лишних нулей', () => {
    expect(formatQuantity(1)).toBe('1')
    expect(formatQuantity('3')).toBe('3')
    expect(formatQuantity(2.5)).toBe('2.5')
    expect(formatQuantity(null)).toBe('0')
  })
})

describe('17.09 отчёт клиенту: сборка текста', () => {
  /** Заказ-образец: поля, которых в тексте быть не должно, передаём намеренно. */
  const SAMPLE = {
    number: 42,
    client: { name: 'Иван Петров', phone: '+7 999 000-00-00' },
    model: 'Trek Marlin 5',
    equipmentIdentifier: 'WTU-123',
    statusLabel: 'готово',
    paid: true,
    services: [{ name: 'Замена камеры', quantity: 1, unitPrice: 500 }],
    materials: [{ name: 'Камера 26', quantity: 2, unitPrice: 300 }],
    products: [],
    servicesTotal: 500,
    partsTotal: 600,
    total: 1100,
    comments: 'Проверить тормоза',
    date: new Date(2026, 8, 17),
  }

  it('по умолчанию — минимальный отчёт: статус, позиции, итог и комментарий', () => {
    const text = buildOrderReportText(SAMPLE)

    // Точный ожидаемый текст: формат рассчитан на одно SMS, лишнего слова быть не должно.
    expect(text).toBe(
      [
        'готово',
        '',
        'Работы:',
        '• Замена камеры 1×500',
        '',
        'Материалы и товары:',
        '• Камера 26 2×300',
        '',
        'Итого: 1 100 р',
        '',
        'Проверить тормоза',
      ].join('\n')
    )

    // Клиента, модели и подписи с сайтом в умолчании нет («сайт пока убери, добавим потом»).
    expect(text).not.toContain('Иван')
    expect(text).not.toContain('Trek')
    expect(text).not.toContain('Отчёт сформирован')
    // «Итого» — ровно один раз: разбивка по работам/запчастям включается тумблерами.
    expect(text.match(/Итого/g)).toHaveLength(1)

    // «Оплачено» в отчёте нет (правка владельца), хотя заказ оплачен.
    expect(text).not.toContain('оплачено')
    // Дату тоже не печатаем, даже если её передали.
    expect(text).not.toContain('17.09.2026')

    // Короткое сообщение: «уместиться даже в одно SMS» — цель правки владельца.
    expect(text.length).toBeLessThan(210)
  })

  it('выбранные строки добавляются сверху и в итогах, общий итог остаётся последним', () => {
    const text = buildOrderReportText(SAMPLE, {
      content: {
        clientName: true,
        clientPhone: true,
        model: true,
        servicesTotal: true,
        partsTotal: true,
      },
    })

    expect(text.startsWith(['Иван Петров', '+7 999 000-00-00', 'Trek Marlin 5'].join('\n'))).toBe(
      true
    )
    expect(text).toContain('Итого за работы: 500 р')
    expect(text).toContain('Итого за запчасти: 600 р')
    expect(text).toContain('Итого: 1 100 р')
    expect(text.indexOf('Итого за работы')).toBeLessThan(text.indexOf('Итого: 1 100'))
  })

  it('флаги независимы: только телефон и только итог за запчасти', () => {
    const text = buildOrderReportText(SAMPLE, { content: { clientPhone: true, partsTotal: true } })

    expect(text.startsWith('+7 999 000-00-00')).toBe(true)
    expect(text).not.toContain('Иван')
    expect(text).not.toContain('Trek')
    expect(text).toContain('Итого за запчасти: 600 р')
    expect(text).not.toContain('Итого за работы')
  })

  it('подпись с сайтом вернётся вместе с флагом `signature`', () => {
    const text = buildOrderReportText(SAMPLE, { content: { signature: true } })

    expect(text).toContain(`Отчёт сформирован в ${REPORT_SIGNATURE}`)
    expect(text.endsWith(REPORT_SIGNATURE)).toBe(true)
  })

  it('пустой заказ не показывает «undefined», и пустые строки не печатаются', () => {
    const text = buildOrderReportText(
      { services: [], materials: [], products: [], total: 0, client: null, model: '' },
      { content: { clientName: true, clientPhone: true, model: true, signature: true } }
    )

    expect(text).toContain('Позиции не добавлены.')
    expect(text).toContain('Итого: 0 р')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('null')
    // Пустое имя клиента не оставляет «пустой» первой строки — отчёт начинается с итога.
    expect(text.startsWith('Итого')).toBe(false)
    expect(text.startsWith('Позиции')).toBe(true)
  })

  it('в отчёте нет номера заказа, объекта, даты и слова «оплачено»', () => {
    const text = buildOrderReportText(SAMPLE, { content: { clientName: true, model: true } })

    expect(text).not.toContain('42')
    expect(text).not.toContain('WTU')
    expect(text).not.toContain('Клиент')
    expect(text).not.toContain('оплачено')
    expect(text).not.toMatch(/\d{2}\.\d{2}\.\d{4}/)
  })
})

describe('17.09 отчёт клиенту: данные из стора заказа', () => {
  it('clientReport отдаёт позиции, итоги и шапку — без номера заказа и оплаты', () => {
    const draft = useOrderDraftStore()
    draft.order = { id: 'local-1', server_id: 7 }
    draft.client = { id: 1, name: 'Иван Петров', phone: '+7 999 000-00-00' }
    draft.model = { id: 3, name: 'Trek Marlin 5' }
    draft.equipmentIdentifier = 'WTU-123'
    draft.status = 'done'
    draft.paid = true
    draft.comments = 'Проверить тормоза'
    // Работа: количество в `quantity`, ручная позиция — в `amount` (как в сторе).
    draft.services = [{ id: 's1', name: 'Замена камеры', price: 500, quantity: 1 }]
    draft.materials = [{ id: 'm1', name: 'Камера 26', price: 300, amount: 2 }]

    const report = draft.clientReport

    expect(report.statusLabel).toBe('готово')
    expect(report.services).toEqual([{ name: 'Замена камеры', quantity: 1, unitPrice: 500 }])
    expect(report.materials).toEqual([{ name: 'Камера 26', quantity: 2, unitPrice: 300 }])
    expect(report.servicesTotal).toBe(500)
    // Запчасти — материалы и товары вместе: в отчёте это одна строка «Итого за запчасти».
    expect(report.partsTotal).toBe(600)
    expect(report.total).toBe(1100)

    // Шапку стор отдаёт целиком, а печатает её сборщик — по флагам состава.
    expect(report.client).toEqual({ name: 'Иван Петров', phone: '+7 999 000-00-00' })
    expect(report.model).toBe('Trek Marlin 5')

    // Номера заказа, объекта и оплаты в данных отчёта нет.
    expect(report.number).toBeUndefined()
    expect(report.equipmentIdentifier).toBeUndefined()
    expect(report.paid).toBeUndefined()

    // Умолчание — минимум: клиента и модели в тексте нет, даже если они есть в заказе.
    const minimal = buildOrderReportText(report)
    expect(minimal).not.toContain('Иван')
    expect(minimal).not.toContain('Trek')
    expect(minimal).toContain('Итого: 1 100 р')

    // А включённые тумблеры печатают ровно те строки, которые мастер выбрал.
    const full = buildOrderReportText(report, {
      content: { clientName: true, clientPhone: true, model: true, partsTotal: true },
    })
    expect(full).toContain('Иван Петров')
    expect(full).toContain('+7 999 000-00-00')
    expect(full).toContain('Trek Marlin 5')
    expect(full).toContain('Итого за запчасти: 600 р')
  })

  it('новый заказ: отчёт всё равно собирается и не печатает служебных слов', () => {
    const draft = useOrderDraftStore()
    draft.order = { status: 'waiting', paid: false, clientId: null, modelId: null, comments: '' }

    // У пустого клиента в сторе подпись «выберите клиента» — в отчёт она не попадает,
    // даже если тумблеры шапки включены.
    expect(draft.clientReport.client).toBeNull()

    const text = buildOrderReportText(draft.clientReport, {
      content: { clientName: true, clientPhone: true, model: true },
    })

    expect(text).toContain('ожидает')
    expect(text).toContain('Позиции не добавлены.')
    expect(text).toContain('Итого: 0 р')
    expect(text).not.toContain('выберите клиента')
  })
})

describe('17.09 отчёт клиенту: UI', () => {
  const order = read('src/pages/OrderDetailsPage.vue')
  const panel = read('src/components/settings/ReportSettingsPanel.vue')
  const dialog = read('src/components/settings/SettingsDialog.vue')
  const header = read('src/components/order/OrderHeaderActions.vue')

  it('уведомление о копировании появляется внизу, а не сверху', () => {
    expect(order).toContain(
      "const notify = (type, message) => $q.notify({ type, message, position: 'bottom' })"
    )
  })

  it('карточка заказа умеет оба формата: ссылку и текст', () => {
    expect(order).toContain('isReportTextMode')
    expect(order).toContain('buildOrderReportText')
    expect(order).toContain('generateShareLink')
    expect(order).toContain('copyClientReportText')
    expect(order).toContain('copyClientReportLink')
    // Состав отчёта карточка берёт из настроек устройства, а не из своих констант.
    expect(order).toContain('getReportContent')
  })

  it('вкладка «отчёты» настраивает формат и состав, а состав — тумблерами', () => {
    // Формат: ссылка или текст (тот же сегмент-переключатель, что в остальных настройках).
    expect(panel).toContain('REPORT_FORMAT_HINTS')
    expect(panel).toMatch(/<q-btn-toggle[\s\S]{0,400}:model-value="props.format"/)

    // Состав: тумблеры по списку `REPORT_CONTENT_LABELS`, без флагов из `REPORT_CONTENT_HIDDEN`.
    expect(panel).toContain('REPORT_CONTENT_LABELS')
    expect(panel).toContain('REPORT_CONTENT_HIDDEN')
    expect(panel).toMatch(/v-for="flag in contentFlags"/)
    expect(panel).toContain(':model-value="props.content?.[flag] === true"')

    // Живой образец: показывает результат той же сборкой, что и карточка заказа.
    expect(panel).toContain('buildOrderReportText')
    expect(panel).toContain('lc-report-preview')

    // Панель подключена именно к вкладке «отчёты» окна настроек: пишет настройки сразу.
    expect(dialog).toContain('ReportSettingsPanel')
    expect(dialog).toMatch(/v-model:format="reportFormat"/)
    expect(dialog).toMatch(/v-model:content="reportContent"/)
  })

  it('подсказка кнопки не обещает только ссылку', () => {
    expect(header).toContain('скопировать отчёт клиенту')
  })
})
