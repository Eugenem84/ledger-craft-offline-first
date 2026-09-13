// scripts/serve-landing.mjs
//
// Крошечный статический сервер для промо-страницы (`landing/`). Нужен, чтобы
// посмотреть её локально так же, как она будет отдаваться с сервера:
//
//   npm run landing:serve   # → http://localhost:8090
//
// Без зависимостей: только `node:http`/`node:fs`. Для проверки скачивания APK
// страница ходит на `window.LEDGER_CRAFT_API` из `landing/index.html` — поменяйте
// адрес на свой контур (или на локальный `http://localhost:8000/api`).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'landing')
const port = Number(process.env.PORT || 8090)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '')
    const filePath = join(root, relative === '/' || relative === '.' ? 'index.html' : relative)

    if (!filePath.startsWith(root)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('forbidden')
      return
    }

    const body = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
    })
    response.end(body)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('not found')
  }
}).listen(port, () => {
  console.log(`Промо-страница Ledger Craft: http://localhost:${port}`)
})
