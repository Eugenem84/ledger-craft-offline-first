// test/client-report.test.js
//
// Правка владельца 17.09.2026: отчёт клиенту можно отдать двумя способами.
//
//   1. Ссылкой — как раньше (задача 9.4): её выдаёт сервер, нужен интернет и синк.
//   2. Текстом — клиенты боятся переходить на чужие сайты, а текст вставляется в мессенджер
//      как есть, работает офлайн и намеренно **минимален** («уместиться даже в одно SMS»):
//      статус, позиции с ценами, итог, комментарий и подпись «Отчёт сформирован в
//      ledgerCraft.ru». Номера заказа, клиента, объекта и даты в нём нет (клиент знает их
//      сам, а время сообщения показывает мессенджер), слова «оплачено» тоже нет.
//
// Проверяем три слоя: чистый сборщик текста (`utils/reportText.js`), настройку
// устройства (`utils/reportSettings.js`) и данные, которые отдаёт стор заказа
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
  REPORT_FORMAT_HINTS,
  REPORT_FORMAT_KEY,
  REPORT_FORMAT_LABELS,
  REPORT_FORMAT_LINK,
  REPORT_FORMAT_TEXT,
  getReportFormat,
  isReportTextMode,
  normalizeReportFormat,
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
  it('минимальный отчёт: позиции, итог, комментарий и подпись', () => {
    const text = buildOrderReportText({
      // Поля, которых в тексте быть не должно, передаём намеренно — проверяем ниже.
      number: 7,
      client: { name: 'Иван Петров', phone: '+7 999 000-00-00' },
      model: 'Trek Marlin 5',
      equipmentIdentifier: 'WTU-123',
      statusLabel: 'готово',
      paid: true,
      services: [{ name: 'Замена камеры', quantity: 1, unitPrice: 500 }],
      materials: [{ name: 'Камера 26', quantity: 2, unitPrice: 300 }],
      products: [],
      total: 1100,
      comments: 'Проверить тормоза',
      date: new Date(2026, 8, 17),
    })

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
        '',
        'Отчёт сформирован в ledgerCraft.ru',
      ].join('\n')
    )

    // «Оплачено» в отчёте нет (правка владельца), хотя заказ оплачен.
    expect(text).not.toContain('оплачено')
    // Дату тоже не печатаем, даже если её передали.
    expect(text).not.toContain('17.09.2026')

    // Короткое сообщение: «уместиться даже в одно SMS» — цель правки владельца.
    expect(text.length).toBeLessThan(210)
  })

  it('пустой заказ не показывает «undefined» и всё равно подписан', () => {
    const text = buildOrderReportText({ services: [], materials: [], products: [], total: 0 })

    expect(text).toContain('Позиции не добавлены.')
    expect(text).toContain('Итого: 0 р')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('null')
    expect(text.endsWith(REPORT_SIGNATURE)).toBe(true)
  })

  it('в отчёте нет номера заказа, клиента, объекта, даты и слова «оплачено»', () => {
    const text = buildOrderReportText({
      number: 42,
      client: { name: 'Иван Петров', phone: '+7 999 000-00-00' },
      model: 'Trek Marlin 5',
      equipmentIdentifier: 'WTU-123',
      statusLabel: 'ожидает',
      paid: true,
      services: [],
      materials: [],
      products: [],
      total: 0,
      date: new Date(2026, 8, 17),
    })

    expect(text).not.toContain('42')
    expect(text).not.toContain('Иван')
    expect(text).not.toContain('Trek')
    expect(text).not.toContain('WTU')
    expect(text).not.toContain('Клиент')
    expect(text).not.toContain('оплачено')
    expect(text).not.toMatch(/\d{2}\.\d{2}\.\d{4}/)
    // Подпись на месте — в ней есть слово «Отчёт», поэтому проверяем именно формулировку.
    expect(text).toContain('Отчёт сформирован в ledgerCraft.ru')
    // «Итого» — ровно один раз: разбивка по работам/материалам тоже убрана.
    expect(text.match(/Итого/g)).toHaveLength(1)
  })
})

describe('17.09 отчёт клиенту: данные из стора заказа', () => {
  it('clientReport собирает статус, позиции и итог — без клиента и номера заказа', () => {
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
    expect(report.total).toBe(1100)

    // Ни номера заказа, ни клиента, ни объекта, ни оплаты: клиент знает их сам (минимум текста).
    expect(report.number).toBeUndefined()
    expect(report.client).toBeUndefined()
    expect(report.model).toBeUndefined()
    expect(report.equipmentIdentifier).toBeUndefined()
    expect(report.paid).toBeUndefined()

    const text = buildOrderReportText(report)
    expect(text).not.toContain('Иван')
    expect(text).not.toContain('Trek')
    expect(text).toContain('Итого: 1 100 р')
    expect(text.endsWith(REPORT_SIGNATURE)).toBe(true)
  })

  it('новый заказ: отчёт всё равно собирается и не печатает служебных слов', () => {
    const draft = useOrderDraftStore()
    draft.order = { status: 'waiting', paid: false, clientId: null, modelId: null, comments: '' }

    const text = buildOrderReportText(draft.clientReport)

    expect(text).toContain('ожидает')
    expect(text).toContain('Позиции не добавлены.')
    expect(text).toContain('Итого: 0 р')
    expect(text).not.toContain('выберите клиента')
  })
})

describe('17.09 отчёт клиенту: UI', () => {
  const order = read('src/pages/OrderDetailsPage.vue')
  const others = read('src/pages/OthersPage.vue')
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
  })

  it('в «Ещё» есть переключатель «ссылка / текст отчёта»', () => {
    expect(others).toContain('reportFormatOptions')
    expect(others).toContain('REPORT_FORMAT_HINTS')
    expect(others).toContain('setReportFormat')
    expect(others).toMatch(/<q-btn-toggle[\s\S]{0,400}v-model="reportFormat"/)
  })

  it('подсказка кнопки не обещает только ссылку', () => {
    expect(header).toContain('скопировать отчёт клиенту')
  })
})
