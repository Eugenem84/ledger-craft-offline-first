// src/services/logExport.js
//
// Выгрузка логов/диагностики в файл для отладки (Фаза 12, «Режим разработчика»).
//
// На Android нет консоли, поэтому единственный способ посмотреть, что происходило,
// — сохранить буфер логов файлом и переслать его. На устройстве пишем в документы
// (как бэкап, `backupService.js`), в браузере — обычное скачивание.
//
// Функция намеренно не бросает при недоступности публичной папки: пробуем Documents,
// затем приватную `Data` — файл должен сохраниться в любом случае.
import { Filesystem, Directory } from '@capacitor/filesystem'
import { isNativePlatform } from 'src/utils/platform.js'
import { logger } from 'src/utils/logger.js'

/** Метка времени для имени файла: `2026-09-12_09-44-10`. */
export function fileStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`

  return `${day}_${time}`
}

/**
 * Сохраняет текстовый файл в выбранном месте.
 *
 * @param {string} fileName имя без пути
 * @param {string} text содержимое
 * @returns {Promise<{ fileName: string, uri?: string, directory?: string, downloaded?: boolean }>}
 */
export async function exportTextFile(fileName, text) {
  if (isNativePlatform()) {
    try {
      const result = await Filesystem.writeFile({
        path: fileName,
        data: text,
        directory: Directory.Documents,
        recursive: true,
      })

      return { fileName, uri: result.uri, directory: 'Documents' }
    } catch (error) {
      logger.warn('[LogExport] Documents недоступна, пишу в приватную папку:', error?.message)

      const result = await Filesystem.writeFile({
        path: fileName,
        data: text,
        directory: Directory.Data,
        recursive: true,
      })

      return { fileName, uri: result.uri, directory: 'Data' }
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('[LogExport] В этой среде выгрузка файла недоступна')
  }

  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)

  return { fileName, downloaded: true }
}
