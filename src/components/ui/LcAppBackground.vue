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
//   • при свайпе по вкладкам она едет: вкладки идут в одну сторону, «дальний план»
//     отстаёт (`shift` от +8% до -8% ширины);
//   • файла нет — ничего не рисуется, фон остаётся чёрным, как раньше.
//
// Компонент намеренно «глупый»: URL считает `services/backgroundAssets.js`, сдвиг —
// `utils/tabSwipe.js`, а «стеклянный» вид поверхностей включает класс `.lc-has-bg`
// в `layouts/MainLayout.vue`. Здесь только разметка и CSS.
import { computed } from 'vue'

/**
 * Запас по размеру картинки под параллакс: изображение шире вьюпорта на 25%, поэтому
 * сдвиг ±8% (и даже ±12%) не оголяет край. Отсюда же требование к ТЗ картинки —
 * «сюжет в центральных 80% ширины, по 10% с боков — расходный материал».
 */
const PARALLAX_RESERVE = 1.25

const props = defineProps({
  /** URL картинки активного профиля; пусто — фон не рисуется. */
  url: { type: String, default: '' },
  /** Сдвиг картинки для текущей вкладки, % ширины (см. `backgroundShift`). */
  shift: { type: Number, default: 0 },
})

const imageStyle = computed(() => ({
  transform: `translate3d(${Number(props.shift).toFixed(2)}%, 0, 0) scale(${PARALLAX_RESERVE})`,
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
      <img :key="url" class="lc-appbg__image" :src="url" :style="imageStyle" alt="" />
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
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
