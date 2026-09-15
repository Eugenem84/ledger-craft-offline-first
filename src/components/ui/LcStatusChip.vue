<script setup>
// Статус заказа одним «чипом»: иконка + слово + цвет.
//
// Слова берём из `ORDER_STATUSES`, иконки — из `ORDER_STATUS_ICONS`
// (`src/utils/analytics.js`), чтобы список заказов, карточка заказа и аналитика
// говорили одинаково. Той же картой иконок пользуются сегменты переключателя
// статуса в карточке заказа — чип и тумблер выглядят как одно (правка владельца
// 15.09.2026). Раньше статус был только иконкой (и мигающей), а подписи жили по
// месту («враб», «опл»).
import { computed } from 'vue'
import { ORDER_STATUSES, ORDER_STATUS_ICONS } from 'src/utils/analytics.js'

const props = defineProps({
  status: { type: String, default: 'waiting' },
  /** Ещё один «чип» для оплаты — статус и оплата отражаются независимо. */
  paid: { type: Boolean, default: false },
  /** Компактный режим: только иконка оплаты/статуса (для узких строк). */
  compact: { type: Boolean, default: false },
})

const meta = computed(
  () => ORDER_STATUSES.find(item => item.value === props.status) || { value: 'unknown', label: 'без статуса' }
)

const icon = computed(() => ORDER_STATUS_ICONS[meta.value.value] || ORDER_STATUS_ICONS.unknown)
</script>

<template>
  <span class="lc-status" :class="`lc-status--${meta.value}`">
    <q-icon :name="icon" size="14px" />
    <span v-if="!compact">{{ meta.label }}</span>
  </span>
</template>
