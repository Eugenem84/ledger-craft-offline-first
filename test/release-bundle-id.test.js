// test/release-bundle-id.test.js
//
// Задача 15.21: счётчик веб-релизов в идентификаторе OTA-бандла.
//
// Идентификатор бандла — `<APP_VERSION_NAME>.<номер>.<ддммгг-ччмм>`, например
// `1.14.7.260915-1440`: префикс — версия APK-линии (растёт только нативным релизом),
// номер — какой это по счёту выкат веб-слоя. Скрипт релиза берёт следующий номер
// от контура; `APP_BUNDLE_BUILD` в gradle.properties — только пол на случай
// недоступного манифеста.
//
// Клиент этот идентификатор как версию не разбирает (`parseBundleVersion` лишь тримит
// строку, а «какой бандл актуальный» решает сервер), поэтому проверяем две стороны:
// скрипт релиза действительно собирает такой id, а клиент принимает его как есть —
// включая случай «номер меньше» (это по-прежнему обновление: верим манифесту).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { isBundleUpdateAvailable, parseBundleVersion } from 'src/utils/appUpdateView.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

const script = read('scripts/release-web.sh')
const gradle = read('src-capacitor/android/gradle.properties')

/** Бандл манифеста: для правил клиента важны `version`, `url` и `minNativeVersionCode`. */
const bundle = version => ({
  version,
  url: `https://ledgercraft.dev.medovf2h.beget.tech/api/download-bundle?version=${version}`,
  minNativeVersionCode: 15,
})

describe('15.21 идентификатор бандла: счётчик веб-релизов', () => {
  it('в gradle.properties есть числовой APP_BUNDLE_BUILD с описанием конвенции', () => {
    expect(gradle).toMatch(/^APP_BUNDLE_BUILD=\d+$/m)
    expect(gradle).toContain('`1.14.7.260915-1440`')
    expect(gradle).toContain('APK при этом не меняется')
  })

  it('скрипт собирает `<версия APK>.<номер>.<дата-время>`', () => {
    expect(script).toContain('BUNDLE_VERSION="$VERSION_NAME.$NEXT_BUILD.$(date +%y%m%d-%H%M)"')
    expect(script).toContain('LAST_BUILD="$(read_prop APP_BUNDLE_BUILD)"')
  })

  it('номер считает от максимума: контур важнее локального поля', () => {
    // Номер из манифеста (`1.14.7.260915-1440` → 7) и `APP_BUNDLE_BUILD` сравниваются,
    // берётся больший плюс один — поэтому забытое локальное значение не даёт дубль id.
    expect(script).toContain("awk -F. 'NF>=4 && $(NF-1) ~ /^[0-9]+$/ { print $(NF-1) }'")
    expect(script).toContain('if [ "$CONTOUR_BUILD" -gt "$LAST_BUILD" ]; then')
    expect(script).toContain('NEXT_BUILD=$((CONTOUR_BUILD + 1))')
    expect(script).toContain('NEXT_BUILD=$((LAST_BUILD + 1))')
  })

  it('счётчик ведётся в пределах APK-линии (номер чужой линии не перенимается)', () => {
    // `1.14.7.…` при VERSION_NAME=1.14 даёт 7, при 1.15 — ноль: иначе новая APK-линия
    // продолжила бы нумерацию старой.
    expect(script).toMatch(/case "\$CONTOUR_BUNDLE_ID" in[\s\S]{0,200}?"\$VERSION_NAME"\.\*\)/)
    expect(gradle).toContain('обнулите поле')
  })

  it('ручной `--version` по-прежнему важнее авто-идентификатора', () => {
    expect(script).toMatch(/--version\) BUNDLE_VERSION="\$\{2:-\}"; shift 2 ;;/)
    expect(script).toContain('if [ -z "$BUNDLE_VERSION" ]; then')
  })

  it('справка и шапка описывают формат, а не «versionName + дата сборки»', () => {
    expect(script).toContain('versionName.номер веб-релиза.ддммгг-ччмм')
    expect(script).toContain('<APP_VERSION_NAME>.<номер веб-релиза>.<ддммгг-ччмм>')
    expect(script).not.toContain('по умолчанию: versionName + дата сборки')
  })
})

describe('15.21 клиент принимает новый идентификатор как есть', () => {
  it('идентификатор — строка, а не версия для сравнения', () => {
    expect(parseBundleVersion('1.14.7.260915-1440')).toBe('1.14.7.260915-1440')

    // Номер не сравнивается как число: даже «меньший» номер сервер может отдать
    // как актуальный (он и решает, какой бандл настоящий) — клиент верит манифесту.
    expect(
      isBundleUpdateAvailable({
        currentBundleId: '1.14.10.260915-1500',
        bundle: bundle('1.14.9.260915-1600'),
        currentVersionCode: 15,
      })
    ).toBe(true)
  })

  it('свой бандл не предлагается; чужой (в том числе старый формат без номера) — предлагается', () => {
    expect(
      isBundleUpdateAvailable({
        currentBundleId: '1.14.1.260915-1500',
        bundle: bundle('1.14.1.260915-1500'),
        currentVersionCode: 15,
      })
    ).toBe(false)

    // Устройство уже на бандле без счётчика — новый (с номером) считается обновлением.
    expect(
      isBundleUpdateAvailable({
        currentBundleId: '1.14.260915-1440',
        bundle: bundle('1.14.1.260915-1500'),
        currentVersionCode: 15,
      })
    ).toBe(true)
  })

  it('правило «бандл собран под другой APK» продолжает работать', () => {
    expect(
      isBundleUpdateAvailable({
        currentBundleId: null,
        bundle: bundle('1.14.1.260915-1500'),
        currentVersionCode: 14,
      })
    ).toBe(false)
  })
})
