// vitest.config.js
//
// Тест-раннер (задача 5.1). Настроек мало, потому что тесты не поднимают
// браузер: репозитории и синк проверяются на **настоящем** sql.js в памяти
// (см. test/helpers/testDb.js), а сеть подменяется фейковым сервером.
//
// Важное здесь — алиасы: в исходниках импорты идут и как `src/...`, и как
// `stores/...`/`pages/...`/`components/...` (такие алиасы даёт Quasar app-vite).
// Тесты должны резолвить те же пути, иначе модуль приложения не найдётся.
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))

/** Алиасы Quasar (`@quasar/app-vite`): папки приложения видны по короткому имени. */
const quasarFolders = ['assets', 'boot', 'components', 'layouts', 'pages', 'stores']

export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(root, 'src'),
      ...Object.fromEntries(
        quasarFolders.map(folder => [folder, path.resolve(root, 'src', folder)])
      ),
    },
  },
  test: {
    // Браузерные API, которые читают модули (localStorage, navigator.onLine),
    // подменяются в setup-файле — DOM для этих тестов не нужен.
    environment: 'node',
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup.js'],
    // Репозитории и syncService логируют каждый шаг через `logger` (DEV-режим):
    // «прошедшие» тесты вывод не засоряют, а упавшие — показывают.
    silent: 'passed-only',
  },
})
