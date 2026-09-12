// vitest.config.js
//
// Тест-раннер (задача 5.1). Настроек мало, потому что тесты не поднимают
// браузер: репозитории и синк проверяются на **настоящем** sql.js в памяти
// (см. test/helpers/testDb.js), а сеть подменяется фейковым сервером.
//
// Важное здесь — только алиас `src`: в исходниках всё импортируется как
// `src/...` (так настроен Quasar/Vite), и vitest должен резолвить те же пути,
// иначе тесты не увидят модули приложения.
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(root, 'src'),
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
