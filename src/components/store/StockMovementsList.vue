<script setup>
// Строки истории склада (правка владельца 15.09.2026): приход «+», расход «−».
//
// Один список на два места: вкладка «движение товаров» на складе
// (`StoreHistoryPanel.vue`) и история в карточке товара (`ProductDialogPage.vue`).
// Различия — только колонка «товар» (`showProduct`) и кнопка правки прихода
// (`editableArrivals`): в карточке товара название повторять не нужно, а правка —
// та же (правка прихода уезжает в `useProductsStore.updateArrival`).
import { formatDayLabel } from 'src/utils/formatDate.js'

const props = defineProps({
  movements: { type: Array, default: () => [] },
  /** Показывать название товара (в истории профиля — обязательно). */
  showProduct: { type: Boolean, default: true },
  /** Кнопка «изменить» у приходов. */
  editableArrivals: { type: Boolean, default: true },
  emptyHint: { type: String, default: 'движений пока нет' },
  loading: { type: Boolean, default: false },
  error: { type: [Object, String], default: null },
})

const emit = defineEmits(['edit'])

/** Знак движения: приход — «+», расход — «−». */
const sign = movement => (movement.kind === 'in' ? '+' : '−')
</script>

<template>
  <div>
    <div class="lc-linerow lc-linerow--head">
      <div class="lc-col-name">{{ props.showProduct ? 'товар' : 'операция' }}</div>
      <div class="lc-col-num">цена</div>
      <div class="lc-col-qty">кол-во</div>
      <div v-if="props.editableArrivals" class="lc-col-del"></div>
    </div>

    <div v-if="props.loading" class="text-caption lc-mute lc-pad">считаем…</div>
    <div v-else-if="props.error" class="text-caption text-negative lc-pad">
      не удалось прочитать историю склада
    </div>
    <div v-else-if="!props.movements.length" class="text-caption lc-mute lc-pad">
      {{ props.emptyHint }}
    </div>

    <div v-for="movement in props.movements" :key="movement.id" class="lc-linerow">
      <div class="lc-col-name">
        <div class="ellipsis">
          {{ props.showProduct ? movement.productName || 'товар удалён' : movement.title }}
        </div>
        <div class="text-caption lc-mute">
          {{ formatDayLabel(movement.createdAt) }}
          <template v-if="props.showProduct"> · {{ movement.title }}</template>
          <template v-if="movement.kind === 'in' && !movement.synced"> · не отправлен</template>
        </div>
      </div>

      <div class="lc-col-num lc-money">{{ movement.price }} р</div>

      <div
        class="lc-col-qty lc-money"
        :class="movement.kind === 'in' ? 'text-positive' : 'text-negative'"
      >
        {{ sign(movement) }}{{ movement.quantity }}
      </div>

      <div v-if="props.editableArrivals" class="lc-col-del">
        <q-btn
          v-if="movement.kind === 'in'"
          flat
          round
          dense
          icon="edit"
          color="secondary"
          @click="emit('edit', movement)"
        >
          <q-tooltip class="text-caption">изменить приход</q-tooltip>
        </q-btn>
      </div>
    </div>
  </div>
</template>
