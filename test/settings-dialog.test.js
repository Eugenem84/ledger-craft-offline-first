// test/settings-dialog.test.js
//
// Правка владельца 17.09.2026: раздел «ещё» переработан в **окно настроек**.
//
//   • из таббара ушла вкладка «ещё» — вместо неё узкая кнопка-шестерёнка без подписи
//     («сменить название, лучше без названия просто шестерёнку», «сделать уже кнопку, чтоб
//     случайно не тыкать»), а на настройки нельзя попасть свайпом;
//   • настройки — модальное окно на ≈90 % экрана с кнопками «Сохранить»/«Отмена»;
//   • содержимое разложено по вкладкам: специализация, разделы профиля, отчёты, обновление,
//     данные и синхронизация, поддержка, аккаунт, разработка.
//
// Структурные проверки (в проекте нет @vue/test-utils — та же практика, что в
// `profile-sections.test.js`), плюс поведение «настройки пишутся только по „Сохранить“».
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

/** Срез исходника между двумя маркерами (для проверок «где именно что вызывается»). */
const slice = (from, to) => dialog.slice(dialog.indexOf(from), dialog.indexOf(to))

describe('окно настроек: вкладки, размер, «Сохранить»/«Отмена»', () => {
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

  it('окно большое (≈90 % экрана) и модальное', () => {
    expect(dialog).toMatch(/\.lc-settings\s*\{[^}]*width: 92vw/)
    expect(dialog).toMatch(/\.lc-settings\s*\{[^}]*height: 90dvh/)
    expect(dialog).toContain('persistent')
  })

  it('кнопки «Сохранить» и «Отмена» видны на всех вкладках', () => {
    expect(dialog).toContain('label="Отмена"')
    expect(dialog).toContain('label="Сохранить"')
    expect(dialog).toContain('@click="save"')
    expect(dialog).toContain('@click="cancel"')

    // Шапка, лента вкладок и кнопки не прокручиваются вместе с содержимым.
    expect(dialog).toContain('.lc-settings > .q-card__actions')
    expect(dialog).toMatch(/\.lc-settings__body\s*\{[^}]*flex: 1 1 auto/)
  })
})

describe('настройки пишутся только по «Сохранить»', () => {
  it('в черновиках лежат профиль, разделы, отчёт и режим разработчика', () => {
    for (const marker of [
      'draftProfileId',
      'draftFeatures',
      'draftReportFormat',
      'draftReportContent',
      'draftDevMode',
    ]) {
      expect(dialog, `нет черновика ${marker}`).toContain(marker)
    }

    // Черновики пересобираются при каждом открытии окна — «Отмена» не оставляет следов.
    expect(dialog).toContain('resetDrafts')
  })

  it('«Сохранить» применяет черновики, «Отмена» — только закрывает окно', () => {
    const save = slice('const save = async () => {', '// --- Обновление приложения')
    const cancel = slice('const cancel = (', '// --- Сохранение')

    expect(save).toContain('setReportFormat(draftReportFormat.value)')
    expect(save).toContain('setReportContent(draftReportContent.value)')
    expect(save).toContain('setDevMode(draftDevMode.value)')
    expect(save).toContain('store.setFeatures(target.id, draftFeatures.value)')
    expect(save).toContain("emit('saved', { profileChanged })")

    expect(cancel).not.toContain('setReport')
    expect(cancel).not.toContain('setDevMode')
    expect(cancel).toContain('close()')
  })

  it('смена профиля в черновике подтягивает его разделы, а в БД уходит по «Сохранить»', () => {
    expect(dialog).toMatch(/watch\(draftProfileId, id => \{/)
    expect(dialog).toContain('if (profileChanged) await store.select(target.id)')
  })

  it('разделы не пишутся «на всякий случай»: сравнение с текущими флагами профиля', () => {
    expect(dialog).toContain('sameFeatures(draftFeatures.value, resolveFeatures(target))')
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
