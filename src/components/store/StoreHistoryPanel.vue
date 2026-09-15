<script setup>
// Вкладка «движение товаров» на складе (правка владельца 15.09.2026: «сам склад вообще
// оставить как есть, просто внутри разделить на две вкладки: "товары" … и плюс вкладка
// движение по складу … там новый функционал для просмотра истории движения по складу
// и редактирование»).
//
// Показывает движения (приходы «+» и расходы «−») **всех** товаров профиля одной лентой,
// с фильтром и правкой прихода: правка живёт в `EditArrivalDialogPage`, а после неё
// перечитываются и история, и список товаров (`emit('changed')` → `StorePage`).
import { computed, onMounted, ref, watch } from 'vue'
import { useStockHistoryStore } from 'src/stores/useStockHistoryStore.js'
import EditArrivalDialogPage from 'src/pages/dialogs/EditArrivalDialogPage.vue'
import StockMovementsList from 'src/components/store/StockMovementsList.vue'

const props = defineProps({
  /** Профиль, по товарам которого строится история (`specializations.id`). */
  specializationId: { type: String, default: null },
})

const emit = defineEmits(['changed'])

const history = useStockHistoryStore()
const editArrivalDialog = ref(null)
/** Фильтр ленты: все движения / только приходы / только расходы. */
const filter = ref('all')

const inCount = computed(
  () => history.movements.filter(movement => movement.kind === 'in').length
)
const outCount = computed(
  () => history.movements.filter(movement => movement.kind === 'out').length
)

const filterOptions = computed(() => [
  { label: `все · ${history.movements.length}`, value: 'all' },
  { label: `приходы · ${inCount.value}`, value: 'in' },
  { label: `расходы · ${outCount.value}`, value: 'out' },
])

const visible = computed(() =>
  filter.value === 'all'
    ? history.movements
    : history.movements.filter(movement => movement.kind === filter.value)
)

const load = () => history.loadAll(props.specializationId)

onMounted(load)
// Сменили рабочий профиль (10.8) — история другого склада.
watch(() => props.specializationId, load)

const openEdit = movement => editArrivalDialog.value?.open(movement)

/** Приход изменился: перечитываем ленту и просим страницу обновить список товаров. */
const handleSaved = async () => {
  await load()
  emit('changed')
}
</script>

<template>
  <div>
    <div class="row items-center no-wrap q-mb-sm">
      <div class="col">
        <div class="lc-eyebrow">движение по складу</div>
        <div class="text-caption lc-mute">
          приходы «+» и расходы «−» по всем товарам профиля, свежие сверху
        </div>
      </div>
      <q-btn
        flat
        round
        dense
        icon="refresh"
        color="secondary"
        :loading="history.loading"
        @click="load"
      >
        <q-tooltip class="text-caption">обновить</q-tooltip>
      </q-btn>
    </div>

    <q-btn-toggle
      v-model="filter"
      class="q-mb-sm full-width"
      dense
      no-caps
      spread
      unelevated
      color="grey-9"
      text-color="grey-5"
      toggle-color="secondary"
      toggle-text-color="black"
      :options="filterOptions"
    />

    <div class="lc-card">
      <StockMovementsList
        :movements="visible"
        :loading="history.loading"
        :error="history.error"
        empty-hint="движений пока нет — приходуйте товар кнопкой «Поступление» в карточке товара"
        @edit="openEdit"
      />
    </div>

    <!-- Лимит ленты (`stockHistoryRepo.HISTORY_LIMIT`): говорим об этом честно. -->
    <div v-if="history.truncated" class="text-caption lc-mute q-mt-sm">
      Показаны последние {{ history.movements.length }} движений — полная история товара
      в его карточке (вкладка «товары»).
    </div>

    <EditArrivalDialogPage ref="editArrivalDialog" @saved="handleSaved" />
  </div>
</template>
