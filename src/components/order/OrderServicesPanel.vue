<script setup>
// Задача 14.19: количество работы задаётся маленьким полем «кол-во» — но только у той
// работы, которая **уже выбрана в заказ**: «подкачать колесо» ×4 это одна строка с
// количеством 4 (на сервере связка дедуплицируется по паре заказ+работа, поэтому
// «несколько одинаковых» — это количество, а не несколько строк).
//
// ⚠️ В простом просмотре заказа (`editMode = false`) количество не меняется: поле
// показывается только в режиме правки, в просмотре — «× N».
import { computed } from 'vue'
import { useLexicon } from 'src/domain/lexicon.js'
import { normalizeQuantity } from 'src/utils/quantity.js'

const { t } = useLexicon()

const props = defineProps({
  categories: { type: Array, default: () => [] },
  selectedCategory: { type: [String, Number], default: null },
  services: { type: Array, default: () => [] },
  /** Уже выбранные в заказе работы — для подсветки и количества. */
  chosen: { type: Array, default: () => [] },
  /** Режим правки: только в нём доступно количество (в просмотре — чтение). */
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['update:selectedCategory', 'add', 'create', 'update-quantity'])

/** Строка заказа для работы из каталога (`null` — работа ещё не выбрана). */
const chosenLine = service => props.chosen.find(chosen => chosen.id === service.id) ?? null

const isChosen = service => chosenLine(service) != null

/** Количество выбранной работы для чтения: целое ≥ 1. */
const chosenQuantity = service => normalizeQuantity(chosenLine(service)?.quantity)

/**
 * Работа попадает в заказ одной штукой. Количество меняется полем у **выбранной**
 * работы: «сколько раз сделали» — это правка заказа, а не выбор позиции.
 */
const select = service => {
  if (isChosen(service)) return

  emit('add', { service })
}

/** Подсказка под кнопкой: в просмотре количество работ недоступно (только правка). */
const hint = computed(() =>
  props.editMode
    ? `Нажмите на ${t('service')} — она попадёт в заказ. Количество у выбранных работ правится в поле «кол-во».`
    : 'Просмотр: количество работ меняется при правке заказа («Редактировать»).'
)
</script>

<template>
  <!-- Панель вкладки живёт в `OrderDetailsPage.vue` (прямой ребёнок `q-tab-panels`). -->
  <div>
    <div class="lc-pad">
      <q-select
        :model-value="props.selectedCategory"
        :options="props.categories"
        option-label="category_name"
        option-value="id"
        emit-value
        map-options
        outlined
        dense
        :label="`категории: ${t('service')}`"
        placeholder="нет категорий"
        color="secondary"
        @update:model-value="value => emit('update:selectedCategory', value)"
      />

      <!-- Главное действие вкладки — заметная кнопка с «+». Работает и в режиме
           просмотра: страница сама включит правку (см. `openServiceDialog`). -->
      <q-btn
        class="full-width q-mt-md"
        unelevated
        no-caps
        color="secondary"
        text-color="black"
        icon="add"
        :label="`Новая ${t('service')}`"
        @click="emit('create')"
      />

      <div class="text-caption lc-mute q-mt-sm">
        {{ hint }}
      </div>
    </div>

    <div class="lc-linerow lc-linerow--head">
      <div class="lc-col-name">{{ t('service') }}</div>
      <div class="lc-col-num">цена</div>
      <div class="lc-col-qty">кол-во</div>
      <div class="lc-col-del"></div>
    </div>

    <div v-if="!props.services.length" class="text-caption lc-mute lc-pad">
      выберите категорию, чтобы увидеть список
    </div>

    <div
      v-for="service in props.services"
      :key="service.id"
      class="lc-linerow"
      :class="{ 'lc-linerow--selected': isChosen(service), 'cursor-pointer': !isChosen(service) }"
      @click="select(service)"
    >
      <div class="lc-col-name">
        <div class="ellipsis" :class="{ 'lc-accent': isChosen(service) }">
          {{ service.service }}
        </div>
        <div v-if="isChosen(service)" class="text-caption lc-mute">в заказе</div>
      </div>

      <div class="lc-col-num lc-money">{{ service.price }} р</div>

      <!-- Количество — только у выбранной работы и только в режиме правки.
           Клик по полю не должен «выбирать» работу (см. `@click.stop`). -->
      <div class="lc-col-qty" @click.stop>
        <q-input
          v-if="isChosen(service) && props.editMode"
          dense
          outlined
          type="number"
          min="1"
          step="1"
          inputmode="numeric"
          input-class="text-center"
          :model-value="chosenLine(service).quantity"
          @update:model-value="value => emit('update-quantity', { service, value })"
        />
        <template v-else-if="isChosen(service)">× {{ chosenQuantity(service) }}</template>
      </div>

      <div class="lc-col-del" @click.stop>
        <q-icon
          :name="isChosen(service) ? 'check_circle' : 'add_circle_outline'"
          :color="isChosen(service) ? 'positive' : 'secondary'"
          size="20px"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.lc-linerow--selected {
  background: var(--lc-accent-soft);
}
</style>
