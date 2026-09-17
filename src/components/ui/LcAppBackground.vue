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
//     Картинка показана **ровно по ширине экрана и не обрезается по бокам** (правка
//     владельца: «обрезается слева и справа» — так выглядел `object-fit: cover` у квадрата:
//     видно было только центральные 45 % ширины). Движение считает `backgroundLayout()`:
//     у кадра шире экрана (квадрат) остаётся свободная полоса сверху и снизу — по ней
//     фон и едет; у кадра ровно в пропорциях экрана свободного места нет, и фон стоит
//     (увеличивать нельзя — это и была бы обрезка по бокам);
//   • файла нет — ничего не рисуется, фон остаётся чёрным, как раньше.
//
// Компонент намеренно «глупый»: URL считает `services/backgroundAssets.js`, арифметику —
// `utils/tabSwipe.js`, а «стеклянный» вид поверхностей включает класс `.lc-has-bg`
// в `layouts/MainLayout.vue`. Здесь только замер картинки, разметка и CSS.
import { computed, ref } from 'vue'
import { useQuasar } from 'quasar'
import { backgroundLayout } from 'src/utils/tabSwipe.js'

const props = defineProps({
  /** URL картинки активного профиля; пусто — фон не рисуется. */
  url: { type: String, default: '' },
  /** Положение активной вкладки: -1 первая, 0 середина, +1 последняя. */
  offset: { type: Number, default: 0 },
})

const $q = useQuasar()

/**
 * Натуральный размер картинки — из `@load`. Без него неизвестен запас для параллакса:
 * у квадрата он больше, чем нужно, у кадра ровно 9:20 — нулевой (см. `backgroundLayout`).
 */
const natural = ref(null)

function onImageLoad(event) {
  const image = event?.target
  if (!image) return

  natural.value = { width: image.naturalWidth, height: image.naturalHeight }
}

/** Сдвиг фона: от вьюпорта (реагирует на поворот экрана) и пропорций картинки. */
const layout = computed(() =>
  backgroundLayout({
    viewportWidth: $q.screen.width,
    viewportHeight: $q.screen.height,
    imageWidth: natural.value?.width,
    imageHeight: natural.value?.height,
    offset: props.offset,
  }),
)

const imageStyle = computed(() => ({
  // `-50%` центрирует полосу картинки по вертикали, `shiftY` везёт её по свободному месту.
  transform: `translate3d(${layout.value.shiftX}px, calc(-50% + ${layout.value.shiftY}px), 0)`,
}))
</script>

<template>
  <!--
    Слой `fixed` + `z-index: -1`: картинка лежит **под** контентом приложения (страницы
    и карточки полупрозрачные только при наличии картинки, см. `.lc-has-bg`), но выше
    чёрного фона `body`. `pointer-events: none` — слой не перехватывает касания, свайп
    по вкладкам работает поверх него.
  -->
  <div v-if="url" class="lc-appbg" aria-hidden="true">
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
  top: 50%;
  left: 0;
  /*
    Ровно по ширине экрана: `height: auto` держит пропорции кадра, поэтому **по бокам ничего
    не обрезается** (раньше был `object-fit: cover`, и квадратный кадр на портретном экране
    показывал только центральные 45 % ширины). Высокий кадр при этом выходит за экран
    сверху/снизу — это нормально, края срезает `.lc-appbg` (`overflow: hidden`).
  */
  width: 100%;
  height: auto;
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
