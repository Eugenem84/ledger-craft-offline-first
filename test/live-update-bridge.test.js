// test/live-update-bridge.test.js
//
// Дефект живой сборки 1.11–1.12 (отчёт мастера от 15.09.2026:
// `"LiveUpdate.then()" is not implemented on android`): прокси плагина Capacitor на незнакомое
// свойство отвечает ошибкой, а `then` — ровно такое свойство. Промис, который «оседает» на
// самом прокси, из-за этого не завершается никогда, и любой `await` висит вечно: молчали
// `ready()`, текущий бандл и версия из плагина, а вместе с ними «повисала» проверка обновлений.
//
// Здесь плагин подменён таким же «строгим» прокси: если мост снова начнёт отдавать наружу сам
// прокси, тесты повиснут (и упадут по таймауту), а не тихо пройдут.
import { describe, it, expect, vi } from 'vitest'

vi.mock('src/utils/platform.js', async () => {
  const actual = await vi.importActual('src/utils/platform.js')

  return { ...actual, isNativePlatform: vi.fn(() => true) }
})

/** Методы, объявленные у плагина (как в `LiveUpdatePlugin`). */
const methods = {
  ready: vi.fn(async () => ({ currentBundleId: null, previousBundleId: null, rollback: false })),
  getCurrentBundle: vi.fn(async () => ({ bundleId: null })),
  getVersionCode: vi.fn(async () => ({ versionCode: '13' })),
  getVersionName: vi.fn(async () => ({ versionName: '1.12' })),
  downloadBundle: vi.fn(async () => ({})),
  setNextBundle: vi.fn(async () => undefined),
  reload: vi.fn(async () => undefined),
  reset: vi.fn(async () => undefined),
  addListener: vi.fn(async () => ({ remove: async () => undefined })),
}

vi.mock('@capawesome/capacitor-live-update', () => ({
  // Поведение прокси Capacitor: известные методы есть, незнакомое свойство (в том числе
  // `then`) — ошибка «не реализовано», из-за которой промис остаётся в ожидании навсегда.
  LiveUpdate: new Proxy(methods, {
    get(target, prop) {
      if (prop in target) return target[prop]

      throw new Error(`"LiveUpdate.${String(prop)}()" is not implemented on android`)
    },
  }),
}))

import {
  getAppVersionCode,
  getAppVersionName,
  getCurrentBundleId,
  hasLiveUpdatePlugin,
  ready,
} from 'src/utils/liveUpdate.js'

describe('15.14 мост к плагину OTA: наружу отдаём обёртку, а не прокси', () => {
  it('текущий бандл читается (промис не висит на `then` прокси)', async () => {
    await expect(getCurrentBundleId()).resolves.toBeNull()
  })

  it('ready() и версия приложения тоже проходят через обёртку', async () => {
    await expect(ready()).resolves.toBe(true)
    await expect(getAppVersionCode()).resolves.toBe('13')
    await expect(getAppVersionName()).resolves.toBe('1.12')
  })

  it('плагин считается доступным, если его методы отвечают', async () => {
    await expect(hasLiveUpdatePlugin()).resolves.toBe(true)
  })
})
