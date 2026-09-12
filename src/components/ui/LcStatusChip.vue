<script setup>
// Статус заказа одним «чипом»: иконка + слово + цвет.
//
// Слова берём из `ORDER_STATUSES` (`src/utils/analytics.js`), чтобы список заказов,
// карточка заказа и аналитика говорили одинаково. Раньше статус был только иконкой
// (и мигающей), а подписи жили по месту («враб», «опл»).
import { computed } from 'vue'
import { ORDER_STATUSES } from 'src/utils/analytics.js'

const props = defineProps({
  status: { type: String, default: 'waiting' },
  /** Ещё один «чип» для оплаты — статус и оплата отражаются независимо. */
  paid: { type: Boolean, default: false },
  /** Компактный режим: только иконка оплаты/статуса (для узких строк). */
  compact: { type: Boolean, default: false },
})

const ICONS = { waiting: 'schedule', process: 'build', done: 'check_circle', unknown: 'help' }

const meta = computed(
  () => ORDER_STATUSES.find(item => item.value === props.status) || { value: 'unknown', label: 'без статуса' }
)

const icon = computed(() => ICONS[meta.value.value] || ICONS.unknown)
</script>

<template>
  <span class="lc-status" :class="`lc-status--${meta.value}`">
    <q-icon :name="icon" size="14px" />
    <span v-if="!compact">{{ meta.label }}</span>
  </span>
</template>
