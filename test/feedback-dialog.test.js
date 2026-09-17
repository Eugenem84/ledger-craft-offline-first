// test/feedback-dialog.test.js
//
// Фаза 14, задачи 14.1/14.5/14.7 — структурные проверки (как `profile-sections.test.js`):
// точка входа в настройках, состав диалога, boot-файл перехватчиков и инбокс репозитория.
// Логика отчёта и очереди покрыта отдельно (`feedback-report.test.js`, `feedback-queue.test.js`).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

describe('14.5 UI «Сообщить об ошибке»', () => {
  it('в настройках есть вкладка поддержки с кнопкой и счётчиком очереди', () => {
    // Настройки — модальное окно (`components/settings/SettingsDialog.vue`), вкладка
    // «поддержка»: страницы «ещё» больше нет (правка владельца 17.09.2026).
    const page = read('src/components/settings/SettingsDialog.vue')

    expect(page).toContain('Сообщить об ошибке')
    expect(page).toContain('openFeedback')
    expect(page).toContain('feedbackPending')
    expect(page).toContain('@changed="refreshFeedbackPending"')
    expect(page).toContain('<FeedbackDialogPage')
  })

  it('диалог спрашивает тип, текст, контакт и согласие на диагностику/логи', () => {
    const dialog = read('src/pages/dialogs/FeedbackDialogPage.vue')

    expect(dialog).toContain('attachDiagnostics')
    expect(dialog).toContain('includeLogs')
    expect(dialog).toContain('canSubmitFeedback')
    expect(dialog).toContain('feedbackService.submit')
    expect(dialog).toContain('copyReport')
    expect(dialog).toContain(':confirm-disable="!canSubmit"')
    expect(dialog).toContain('Заказы, клиенты и суммы в отчёт не попадают')
  })

  it('в настройках «отчётов в очереди» и диалог не блокируют интерфейс на сети', () => {
    const service = read('src/services/feedbackService.js')

    expect(service).toContain("apiClient.post('/feedback'")
    expect(service).toContain('startAutoFlush')
    expect(service).toContain('hasAuthToken')
    expect(read('src/App.vue')).toContain('feedbackService.startAutoFlush')
  })
})

describe('14.1/14.7 обвязка фазы', () => {
  it('boot-файл перехватчиков стоит первым и пишет в постоянный буфер', () => {
    const config = read('quasar.config.js')
    const bootList = config.slice(config.indexOf('boot: ['), config.indexOf('boot: [') + 400)

    expect(bootList).toContain("'errorLog'")
    expect(bootList.indexOf("'errorLog'")).toBeLessThan(bootList.indexOf("'axios'"))
    expect(read('src/boot/errorLog.js')).toContain('installErrorHandlers')
  })

  it('инбокс отчётов есть в репозитории, но сырые отчёты не коммитятся', () => {
    const gitignore = read('.gitignore')

    expect(gitignore).toContain('/feedback/INBOX.md')
    expect(gitignore).toContain('/feedback/inbox/')
    expect(read('feedback/README.md')).toContain('npm run feedback:pull')
    expect(read('package.json')).toContain('"feedback:pull"')
  })

  it('выгрузка читает pull-токен и раскладывает файлы в feedback/inbox', () => {
    const script = read('scripts/pull-feedback.mjs')

    expect(script).toContain('X-Feedback-Token')
    expect(script).toContain('FEEDBACK_PULL_TOKEN')
    expect(script).toContain('feedback/INBOX')
    expect(script).toContain("url.searchParams.set('limit', '200')")
  })
})
