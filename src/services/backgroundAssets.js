// src/services/backgroundAssets.js
//
// Подключение картинок-фонов к сборке (правка владельца 17.09.2026).
//
// Файлы кладутся в `src/assets/backgrounds/<preset_key>.<ext>` (см. README рядом) и
// подхватываются `import.meta.glob` — то есть картинки попадают в бандл (офлайн-первый
// запуск и OTA-обновление веб-слоя), получают хеш в имени, а приложение **заранее знает,
// какие картинки есть**: отсутствующий файл не даёт 404 и не мигает пустым фоном.
//
// Без картинок (папка пуста) модуль возвращает пустую карту — приложение выглядит как
// раньше: чёрный фон, сплошные поверхности. Это важно: фон можно добавлять постепенно.
import { resolveBackgroundKey } from 'src/domain/backgrounds.js'

/**
 * Расширения, которые подхватываем. WebP — рекомендуемый формат (см. README),
 * остальные — запас: владелец может положить PNG/JPEG, и они заработают без правок.
 */
const FILES = import.meta.glob('../assets/backgrounds/*.{webp,avif,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** `../assets/backgrounds/auto.webp` → `auto`. */
function keyFromPath(filePath) {
  const name = filePath.split('/').pop() ?? ''

  return name.replace(/\.[^.]+$/, '').toLowerCase()
}

/** Карта `ключ → URL` (URL отдаёт сборщик: с хешем и корректной базой). */
const BY_KEY = Object.freeze(
  Object.fromEntries(Object.entries(FILES).map(([filePath, url]) => [keyFromPath(filePath), url])),
)

/** Какие картинки есть в сборке (для тестов и диагностики). */
export const BACKGROUND_KEYS = Object.freeze(Object.keys(BY_KEY))

/** Есть ли хоть одна картинка — от этого зависит «стеклянный» вид поверхностей. */
export function hasBackgrounds() {
  return BACKGROUND_KEYS.length > 0
}

/**
 * URL картинки по ключу.
 *
 * @param {string} key ключ (`auto`, `bike`, `default`, …)
 * @returns {string|null} URL или `null`, если картинки нет
 */
export function backgroundUrl(key) {
  if (typeof key !== 'string' || key === '') return null

  return BY_KEY[key] ?? null
}

/**
 * URL картинки-фона активного профиля.
 *
 * @param {{ preset_key?: string|null }} [specialization] рабочий профиль
 * @returns {string|null} URL или `null` (фон — обычный чёрный)
 */
export function resolveBackgroundUrl(specialization) {
  return backgroundUrl(resolveBackgroundKey(specialization))
}
