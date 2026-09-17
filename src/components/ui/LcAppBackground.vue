<script setup>
// src/components/ui/LcAppBackground.vue
//
// Фон приложения — картинка активного рабочего профиля (правка владельца 17.09.2026:
// «у приложения будет фоновая картинка, у каждой специализации своя, и при свайпе она
// двигается»).
//
//   • одна картинка на специализацию: `src/assets/backgrounds/<preset_key>.webp`
//     (см. README рядом с папкой и ТЗ в `docs/UI.md` §7);
//   • при переключении профиля картинка меняется кроссфейдом (ключ по URL);
//   • при свайпе по вкладкам она едет: вкладки уходят в сторону, «дальний план» отстаёт.
//     Картинка **заполняет экран целиком** (`object-fit: cover`), а движение — по горизонтали:
//     запас для него — «лишняя» ширина кадра (у квадрата на портретном экране это по 28 % с
//     каждой стороны). Сколько именно ехать, считает `backgroundLayout()`: доля этого запаса,
//     но не меньше минимума и не больше предела (у кадра ровно в пропорциях экрана запаса нет,
//     и он получает небольшое увеличение — иначе движения не будет вовсе);
//   • файла нет — ничего не рисуется, фон остаётся чёрным, как раньше.
//
// Компонент намеренно «глупый»: URL считает `services/backgroundAssets.js`, арифметику —
// `utils/tabSwipe.js`, а «стеклянный» вид поверхностей включает класс `.lc-has-bg`
// в `layouts/MainLayout.vue`. Здесь только замер картинки, разметка и CSS.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { backgroundLayout, contentBounds } from 'src/utils/tabSwipe.js'
import { logger } from 'src/utils/logger'

const props = defineProps({
  /** URL картинки активного профиля; пусто — фон не рисуется. */
  url: { type: String, default: '' },
  /** Положение активной вкладки: -1 первая, 0 середина, +1 последняя. */
  offset: { type: Number, default: 0 },
})

/** Слой фона: его размер и есть вьюпорт — меряем в DOM, а не берём из `$q.screen`. */
const box = ref(null)
const boxSize = ref({ width: 0, height: 0 })

/** Натуральный размер картинки (из `@load`) и границы её контента. */
const natural = ref(null)
const content = ref(null)

function measureBox() {
  const rect = box.value?.getBoundingClientRect?.()

  if (rect && rect.width > 0 && rect.height > 0) {
    boxSize.value = { width: rect.width, height: rect.height }
  }
}

/**
 * Где в картинке «непустая» часть: рисуем её на маленьком canvas (48×48) и берём границы по
 * колонкам. Нужно, чтобы окно обзора не заезжало в пустые поля кадра — иначе на экране
 * появлялась чёрная полоса и выглядело так, будто картинка «обрезана».
 */
function measureContent(image) {
  try {
    const size = 48
    const canvas = document.createElement('canvas')

    canvas.width = size
    canvas.height = size

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null

    ctx.drawImage(image, 0, 0, size, size)

    const { data } = ctx.getImageData(0, 0, size, size)
    const columns = []

    for (let x = 0; x < size; x += 1) {
      let sum = 0

      for (let y = 0; y < size; y += 1) {
        const p = (y * size + x) * 4

        sum += 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
      }

      columns.push(sum / size)
    }

    return contentBounds(columns)
  } catch {
    // Картинка не далась (canvas недоступен) — работаем как раньше: считаем контентом весь кадр.
    return null
  }
}

/** Размеры и позиция картинки в px: элемент шире экрана, края скрыты за вьюпортом. */
const layout = computed(() =>
  backgroundLayout({
    viewportWidth: boxSize.value.width,
    viewportHeight: boxSize.value.height,
    imageWidth: natural.value?.width,
    imageHeight: natural.value?.height,
    content: content.value,
    offset: props.offset,
  }),
)

const imageStyle = computed(() => ({
  width: `${layout.value.width}px`,
  height: `${layout.value.height}px`,
  left: `${layout.value.left}px`,
  top: `${layout.value.top}px`,
  transform: `translate3d(${layout.value.shiftX}px, 0, 0)`,
}))

function onImageLoad(event) {
  const image = event?.target
  if (!image) return

  natural.value = { width: image.naturalWidth, height: image.naturalHeight }
  content.value = measureContent(image)
  measureBox()

  // Геометрия фона в лог: по этим числам видно, сколько места нашлось для хода
  // (в production-сборке `logger.log` молчит, в dev — помогает разбирать раскладку).
  logger.log('[bg] фон собран', {
    box: boxSize.value,
    image: natural.value,
    content: content.value,
    layout: layout.value,
  })
}

onMounted(() => {
  measureBox()
  window.addEventListener('resize', measureBox)
  window.addEventListener('orientationchange', measureBox)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measureBox)
  window.removeEventListener('orientationchange', measureBox)
})
</script>

<template>
  <!--
    Слой `fixed` + `z-index: -1`: картинка лежит **под** контентом приложения (страницы
    и карточки полупрозрачные только при наличии картинки, см. `.lc-has-bg`), но выше
    чёрного фона `body`. `pointer-events: none` — слой не перехватывает касания, свайп
    по вкладкам работает поверх него.
  -->
  <div v-if="url" ref="box" class="lc-appbg" aria-hidden="true">
    <Transition name="lc-appbg-fade" appear>
      <img
        :key="url"
        class="lc-appbg__image"
        :src="url"
        :style="imageStyle"
        alt=""
        @load="onImageLoad"
      />
    </Transition>
  </div>
</template>

<style scoped>
.lc-appbg {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}

.lc-appbg__image {
  position: absolute;
  /*
    Размеры и позиция приходят из раскладки в px (`backgroundLayout`): элемент **шире экрана**,
    поэтому его края скрыты за вьюпортом и сдвиг показывает продолжение рисунка. Так же это
    лечит главную ловушку: у `<img>` с `object-fit: cover` содержимое обрезается по границам
    элемента, и «запас» существовал бы только на бумаге — при сдвиге уехавший край обнажал
    чёрный фон (живой прогон 17.09.2026: «картинка срезана по краям»).
  */
  max-width: none;
  max-height: none;
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}

/* Смена специализации: старая картинка гаснет, новая проявляется (обе — `absolute`). */
.lc-appbg-fade-enter-active,
.lc-appbg-fade-leave-active {
  transition: opacity 0.32s ease;
}

.lc-appbg-fade-enter-from,
.lc-appbg-fade-leave-to {
  opacity: 0;
}
</style>
