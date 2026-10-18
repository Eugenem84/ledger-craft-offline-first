// test/update-notice.test.js
//
// Правка владельца 19.10.2026 (задача 14.37): «нормальное большое пуш оповещение сверху
// о том что появилось обновление и прям в пуше заметка что нового… и в пуше сразу кнопка
// типа установить или позднее».
//
// Проверяем чистую модель «пуша» (`updateNoticeView`) на всех состояниях обновления и
// структуру компонента: уведомление живёт в `App.vue`, «Позже» — это `update.dismiss()`,
// «Установить» ведёт в те же сценарии сервиса, что и диалог.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { updateNoticeView } from 'src/utils/updateNotice.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

/** Ответ контура: тот же APK, но новый бандл веб-слоя с примечаниями. */
const OTA_STATUS = {
  available: false,
  bundleAvailable: true,
  bundleReady: false,
  bundleDismissed: false,
  current: { versionCode: 22, versionName: '1.21' },
  release: {
    versionCode: 22,
    versionName: '1.21',
    notes: 'общие примечания релиза',
    bundle: {
      version: '1.21.7.261019-0300',
      url: 'https://example.test/bundle.zip',
      notes: 'Наименования видны полностью; Отчёт не теряется без сети',
    },
  },
}

describe('14.37 «пуш» об обновлении: что нового и кнопки', () => {
  it('OTA: заголовок, версия бандла и заметки прямо в уведомлении', () => {
    const notice = updateNoticeView(OTA_STATUS)

    expect(notice).toMatchObject({
      visible: true,
      kind: 'ota',
      title: 'Доступно обновление',
      subtitle: 'без установки · 1.21.7.261019-0300',
      canDismiss: true,
      actionLabel: 'Установить',
      actionIcon: 'cloud_download',
    })
    expect(notice.notes).toEqual([
      'Наименования видны полностью',
      'Отчёт не теряется без сети',
    ])
  })

  it('OTA: скачанный бандл — кнопка становится «Перезапустить», «Позже» уже нет', () => {
    const notice = updateNoticeView({ ...OTA_STATUS, bundleReady: true })

    expect(notice).toMatchObject({
      kind: 'ota_ready',
      title: 'Обновление готово к запуску',
      canDismiss: false,
      actionLabel: 'Перезапустить',
      actionIcon: 'restart_alt',
    })
  })

  it('APK: обязательное обновление не прячется — «Позже» отсутствует', () => {
    const notice = updateNoticeView({
      available: true,
      mandatory: true,
      current: { versionCode: 22, versionName: '1.21' },
      release: { versionCode: 23, versionName: '1.22', notes: 'Чиним склад', bundle: null },
    })

    expect(notice).toMatchObject({
      kind: 'mandatory',
      title: 'Нужно обновить приложение',
      subtitle: 'версия 1.22',
      canDismiss: false,
      actionLabel: 'Установить',
      actionIcon: 'system_update_alt',
    })
    expect(notice.notes).toEqual(['Чиним склад'])
  })

  it('APK: необязательное обновление можно отложить', () => {
    const notice = updateNoticeView({
      available: true,
      mandatory: false,
      current: { versionCode: 22, versionName: '1.21' },
      release: { versionCode: 23, versionName: '1.22', notes: '', bundle: null },
    })

    expect(notice).toMatchObject({
      kind: 'optional',
      canDismiss: true,
      actionLabel: 'Установить',
    })
    expect(notice.notes).toEqual([])
  })

  it('обновления нет или «позже» нажато — уведомления нет', () => {
    expect(updateNoticeView({ available: false, current: {}, release: null }).visible).toBe(false)
    expect(updateNoticeView({ ...OTA_STATUS, bundleDismissed: true }).visible).toBe(false)
    expect(updateNoticeView(null).visible).toBe(false)
  })
})

describe('14.37 «пуш» встроен в приложение и ведёт в сценарии обновления', () => {
  it('уведомление смонтировано рядом с чипом в App.vue', () => {
    const app = read('src/App.vue')

    expect(app).toContain("import UpdateNotice from 'src/components/UpdateNotice.vue'")
    expect(app).toContain('<UpdateNotice />')
  })

  it('кнопки: «Позже» — dismiss(), «Установить» — OTA-бандл или установщик APK', () => {
    const component = read('src/components/UpdateNotice.vue')

    expect(component).toContain('const postpone = () => update.dismiss()')
    expect(component).toContain('await update.applyBundle()')
    expect(component).toContain('await update.restartNow()')
    expect(component).toContain('await update.install()')
    expect(component).toMatch(/label="Позже"/)
    expect(component).toContain(':label="notice.actionLabel"')
  })

  it('«Позже» показывается только когда обновление можно отложить', () => {
    const component = read('src/components/UpdateNotice.vue')

    expect(component).toMatch(/v-if="notice\.canDismiss"[\s\S]*?label="Позже"/)
  })
})
