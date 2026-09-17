// test/settings-dialog.test.js
//
// Правка владельца 17.09.2026: раздел «ещё» переработан в **окно настроек**.
//
//   • из таббара ушла вкладка «ещё» — вместо неё узкая кнопка-шестерёнка без подписи
//     («сменить название, лучше без названия просто шестерёнку», «сделать уже кнопку, чтоб
//     случайно не тыкать»), а на настройки нельзя попасть свайпом;
//   • настройки — окно на ≈90 % экрана **без кнопок «Сохранить»/«Отмена»**: правка владельца
//     «кнопки отмена и сохранить вообще не надо» — настройка применяется в момент изменения;
//   • содержимое разложено по вкладкам: специализация, разделы профиля, отчёты, обновление,
//     данные и синхронизация, поддержка, аккаунт, разработка.
//
// Структурные проверки (в проекте нет @vue/test-utils — та же практика, что в
// `profile-sections.test.js`), плюс поведение «настройки применяются сразу».
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  closeSettings,
  openSettings,
  settingsDialogOpen,
  settingsDialogTab,
} from 'src/utils/settingsDialog.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

const dialog = read('src/components/settings/SettingsDialog.vue')
const layout = read('src/layouts/MainLayout.vue')
const routes = read('src/router/routes.js')

describe('окно настроек: вкладки, размер, закрытие', () => {
  it('вкладки идут в заказанном владельцем порядке и с его подписями', () => {
    const expected = [
      "name: 'specialization', label: 'специализация'",
      "name: 'sections', label: 'разделы профиля'",
      "name: 'reports', label: 'отчеты'",
      "name: 'updates', label: 'обновление'",
      "name: 'data', label: 'данные и синхронизация'",
      "name: 'support', label: 'поддержка'",
      "name: 'account', label: 'аккаунт'",
      "name: 'dev', label: 'разработка'",
    ]

    let cursor = -1
    for (const marker of expected) {
      const at = dialog.indexOf(marker)

      expect(at, `нет вкладки «${marker}»`).toBeGreaterThan(-1)
      expect(at, `вкладка «${marker}» не по порядку`).toBeGreaterThan(cursor)
      cursor = at
    }

    // Панели — прямые дети `q-tab-panels` и совпадают с вкладками (иначе Quasar не
    // отрисует содержимое — ловушка в `docs/UI.md` §4).
    for (const name of [
      'specialization',
      'sections',
      'reports',
      'updates',
      'data',
      'support',
      'account',
      'dev',
    ]) {
      expect(dialog, `нет панели «${name}»`).toContain(`<q-tab-panel name="${name}"`)
    }
  })

  it('окно большое (≈90 % экрана) и закрывается без кнопок сохранения', () => {
    expect(dialog).toMatch(/\.lc-settings\s*\{[^}]*width: 92vw/)
    expect(dialog).toMatch(/\.lc-settings\s*\{[^}]*height: 90dvh/)

    // Правка владельца 17.09.2026: «кнопки отмена и сохранить вообще не надо» — ни блока
    // действий, ни `persistent` (закрыть можно крестиком или тапом по фону: терять нечего).
    expect(dialog).not.toContain('q-card-actions')
    expect(dialog).not.toContain('label="Отмена"')
    expect(dialog).not.toContain('label="Сохранить"')
    expect(dialog).not.toContain('persistent')
    expect(dialog).toContain('@click="close"')

    // Пояснение про кнопки тоже убрано из шапки окна.
    expect(dialog).not.toContain('Изменения применяются кнопкой')

    // Шапка и лента вкладок не прокручиваются вместе с содержимым.
    expect(dialog).toContain('.lc-settings > .q-card__section')
    expect(dialog).toMatch(/\.lc-settings__body\s*\{[^}]*flex: 1 1 auto/)
  })

  it('подписи и иконки вкладок мелкие, чтобы лента влезала целиком', () => {
    expect(dialog).toMatch(/\.lc-settings__tabs \.q-tab__label\s*\{[^}]*font-size: 10px/)
    expect(dialog).toMatch(/\.lc-settings__tabs \.q-icon\s*\{[^}]*font-size: 15px/)
    expect(dialog).toMatch(/\.lc-settings__tabs \.q-tab\s*\{[^}]*min-height: 40px/)
  })
})

describe('настройки применяются сразу — ни «Сохранить», ни «Отмена» не нужны', () => {
  it('черновиков нет: значения читаются из хранилищ напрямую', () => {
    for (const marker of [
      'draftProfileId',
      'draftFeatures',
      'draftReportFormat',
      'draftReportContent',
      'draftDevMode',
    ]) {
      expect(dialog, `остался черновик ${marker}`).not.toContain(marker)
    }

    for (const marker of ['const save =', 'const cancel =', 'const saving =']) {
      expect(dialog, `остался ${marker}`).not.toContain(marker)
    }
  })

  it('профиль, разделы, отчёт и режим разработчика пишутся в момент изменения', () => {
    // Профиль — computed с записью: выбор сразу меняет рабочий контекст.
    expect(dialog).toMatch(/const selectedProfileId = computed\(\{/)
    expect(dialog).toContain('await store.select(id)')

    // Разделы профиля — тумблер пишет флаги текущего профиля (не теряя остальные).
    expect(dialog).toMatch(
      /await store\.setFeatures\(specialization\.id, \{ \.\.\.activeFeatures\.value, \[flag\]: value === true \}\)/
    )
    expect(dialog).toContain(':model-value="activeFeatures[flag] !== false"')
    expect(dialog).toContain('@update:model-value="value => setFeature(flag, value)"')

    // Отчёт и режим разработчика — те же правила «настройка устройства».
    expect(dialog).toMatch(/const reportFormat = computed\(\{/)
    expect(dialog).toContain('set: value => setReportFormat(value)')
    expect(dialog).toContain('set: value => setReportContent(value)')
    expect(dialog).toContain('v-model:format="reportFormat"')
    expect(dialog).toContain('v-model:content="reportContent"')

    expect(dialog).toMatch(/const devMode = computed\(\{/)
    expect(dialog).toContain('set: value => setDevMode(value)')
    expect(dialog).toContain('<q-toggle v-model="devMode"')
    expect(dialog).toContain('<component :is="DeveloperPanel" v-if="devMode" />')
  })

  it('смена/добавление/архивация профиля сообщают каркасу, что контекст изменился', () => {
    // Событие `saved` больше не «сохранение по кнопке», а «профиль применился»: каркас должен
    // увести с раздела, который новым профилем скрыт.
    expect(dialog.match(/emit\('saved', \{ profileChanged: true \}\)/g)).toHaveLength(3)
    expect(dialog).toContain('emit(\'saved\', { profileChanged: true })')
  })

  it('при открытии сбрасываются только «детские» диалоги, а не настройки', () => {
    expect(dialog).toContain('resetTemporaryUi')
    expect(dialog).toContain('newProfileDialogOpen.value = false')
    expect(dialog).toContain('restoreOpen.value = false')
  })
})

describe('состояние окна настроек живёт в `utils/settingsDialog.js`', () => {
  it('openSettings открывает окно на нужной вкладке, closeSettings закрывает', () => {
    closeSettings()
    expect(settingsDialogOpen.value).toBe(false)

    openSettings('reports')
    expect(settingsDialogOpen.value).toBe(true)
    expect(settingsDialogTab.value).toBe('reports')

    // Значение по умолчанию — «специализация»: так его открывает шестерёнка в таббаре.
    openSettings()
    expect(settingsDialogTab.value).toBe('specialization')

    closeSettings()
    expect(settingsDialogOpen.value).toBe(false)
  })

  it('настройки открываются из каталога тем же окном, а не переходом на старую страницу', () => {
    const catalog = read('src/pages/CatalogPage.vue')

    expect(catalog).toContain("openSettings('specialization')")
    expect(catalog).not.toContain("router.push('/other')")
    expect(layout).toContain("from 'src/utils/settingsDialog.js'")
  })
})

describe('настройки — окно поверх приложения, а не раздел', () => {
  it('страницы настроек больше нет, а старый путь оставлен редиректом', () => {
    expect(routes).toContain("{ path: 'other', redirect: '/orders' }")
    expect(routes).not.toContain('OthersPage.vue')
  })

  it('в шапке и таббаре настройки открываются окном', () => {
    expect(layout).toContain('<SettingsDialog v-model="settingsOpen"')
    expect(layout).toContain(':initial-tab="settingsTab"')
    expect(layout).toContain('@saved="onSettingsSaved"')
  })

  it('если после смены профиля текущий раздел скрылся — уводим на доступный', () => {
    expect(layout).toContain('const feature = route.meta?.feature')
    expect(layout).toContain("router.replace('/orders')")
  })
})
