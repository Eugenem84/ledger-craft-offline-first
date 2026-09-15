// test/app-version.test.js
//
// Правка владельца 15.09.2026: версия приложения видна в шапке рядом с индикатором
// синка. Источников два, и это не дублирование:
//   • нативная версия устройства (`@capacitor/app`) — что реально стоит на телефоне;
//   • версия, вшитая в сборку из `gradle.properties` (`build.env` в `quasar.config.js`) —
//     фолбэк для веб-сборки, где нативной части нет вовсе.
// Правила подписи — чистая функция `src/utils/appVersion.js`, поэтому проверяются
// обычным юнит-тестом (без моков и без `process.env`).
import { describe, it, expect } from 'vitest'
import { appVersionLabel } from 'src/utils/appVersion.js'

const build = { name: '1.14', code: '15' }

describe('версия приложения для шапки', () => {
  it('нативная версия устройства важнее вшитой в сборку', () => {
    // После OTA веб-слой может быть новее APK, поэтому «что стоит на телефоне» первично.
    expect(appVersionLabel({ versionName: '1.15', versionCode: 16 }, build)).toBe('v1.15')
  })

  it('нативной версии нет (браузер) — показываем вшитую в сборку', () => {
    expect(appVersionLabel({ versionName: null, versionCode: null }, build)).toBe('v1.14')
    expect(appVersionLabel(undefined, build)).toBe('v1.14')
  })

  it('без `versionName` подпись — по коду сборки', () => {
    expect(appVersionLabel({ versionCode: 12 }, {})).toBe('сборка 12')
    expect(appVersionLabel({}, build)).toBe('v1.14')
    expect(appVersionLabel({}, { code: '15' })).toBe('сборка 15')
  })

  it('версия неизвестна совсем — пусто (в шапке ничего не рисуем)', () => {
    expect(appVersionLabel()).toBe('')
    expect(appVersionLabel({}, {})).toBe('')
    expect(appVersionLabel({ versionName: '', versionCode: 0 }, { name: '', code: '' })).toBe('')
  })
})
