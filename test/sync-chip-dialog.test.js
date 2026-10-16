// test/sync-chip-dialog.test.js
//
// Живой отчёт мастера 16.10.2026 (**боевой** контур, задача 14.33):
// «На вкладке заказ, в правом верхнем углу горит красным треугольник. И ничего не выдаёт
// при нажатии на него».
//
// Разбор: значок синка — «только значок», объяснение жило в `q-tooltip`, а на телефоне
// наведения нет; тап запускал синк, который «сдавшиеся» (`failed`) операции не отправляет
// вовсе — то есть не менялось ничего и молчание выглядело багом. Лечение «сдавшихся» и
// «заблокированных» жило только в «Режиме разработчика», куда мастер не ходит.
//
// Тесты структурные (как `pages-layout.test.js`): проверяем контракт — где живёт диалог,
// что он умеет и что тап не может закончиться молчанием.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

describe('14.33 тап по значку синка объясняет состояние', () => {
  it('значок открывает диалог в проблемных состояниях, а не молчит', () => {
    const bar = read('src/components/SyncStatusBar.vue')

    expect(bar).toContain('@click="onChipClick"')
    expect(bar).toContain('syncStatusNeedsAttention')
    expect(bar).toMatch(/if \(syncStatusNeedsAttention\(status\.value\)\) \{\s*dialogOpen\.value = true/)
    // Молчание — сама жалоба: обычный тап заканчивается всплывающим итогом.
    expect(bar).toContain('$q.notify({ ...syncStatusOutcome(syncService.getStatus())')
    // Диалог монтируется здесь же и после действий перечитывает счётчики.
    expect(bar).toContain('<SyncStatusDialog v-model="dialogOpen" :status="status" @changed="refreshStatus" />')
    expect(bar).toContain('status.value = await syncService.refreshStatus()')
  })

  it('подробности в тултипе и в диалоге — один и тот же текст (без второго формата)', () => {
    const bar = read('src/components/SyncStatusBar.vue')

    expect(bar).toContain('const details = computed(() => syncStatusDetails(status.value))')
  })

  it('диалог: состояние, «что не уехало» и кнопки оттуда же, из чистой функции', () => {
    const dialog = read('src/components/SyncStatusDialog.vue')

    expect(dialog).toContain("import LcDialogShell from 'src/components/ui/LcDialogShell.vue'")
    expect(dialog).toContain('syncStatusDetails(props.status)')
    expect(dialog).toContain('syncStatusActions(props.status)')
    expect(dialog).toContain('await syncService.listStuckOperations()')
    expect(dialog).toContain('describeOperation')
    // Причина отказа видна словами: «не отправлено: 1» ничего не объясняет.
    expect(dialog).toContain("row.lastError || 'причина не записана'")

    // Действия подписаны тем, что реально умеет сервис.
    expect(dialog).toContain('await syncService.retryFailedOperations()')
    expect(dialog).toContain('await syncService.repairQueue()')
    expect(dialog).toContain('await syncService.sync({ force: true })')
    expect(dialog).toContain("router.push('/login')")
    // Список операций обновляется после действия — иначе «что не уехало» врёт.
    expect(dialog).toMatch(/await loadStuck\(\)\s*\n\s*emit\('changed'\)/)
  })

  it('кнопки действий вынесены в отдельный слот диалога (не «Сохранить»)', () => {
    const dialog = read('src/components/SyncStatusDialog.vue')

    expect(dialog).toContain('<template #actions>')
    expect(dialog).toContain('v-for="action in actions"')
  })
})
