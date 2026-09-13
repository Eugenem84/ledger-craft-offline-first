<script setup>
// Вкладка «работы» (Фаза 8, задача 8.1): выбор категории и добавление работ в заказ.
// Раньше кнопка «+» (создать работу) стояла внутри `v-for` и рисовалась на каждой
// строке — вынесена из списка (найдено при 8.1).
// Подписи — из лексикона профиля (Фаза 10, задача 10.1).
import { useLexicon } from 'src/domain/lexicon.js'

const { t } = useLexicon()

const props = defineProps({
  categories: { type: Array, default: () => [] },
  selectedCategory: { type: [String, Number], default: null },
  services: { type: Array, default: () => [] },
  /** Уже выбранные в заказе работы — для подсветки. */
  chosen: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:selectedCategory', 'add', 'create'])

const isChosen = service => props.chosen.some(chosen => chosen.id === service.id)
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
        Или нажмите на {{ t('service') }} в списке ниже — она сразу попадёт в заказ.
      </div>
    </div>

    <div class="lc-linerow lc-linerow--head">
      <div class="lc-col-name">{{ t('service') }}</div>
      <div class="lc-col-num">цена</div>
      <div class="lc-col-del"></div>
    </div>

    <div v-if="!props.services.length" class="text-caption lc-mute lc-pad">
      выберите категорию, чтобы увидеть список
    </div>

    <div
      v-for="service in props.services"
      :key="service.id"
      class="lc-linerow cursor-pointer"
      :class="{ 'lc-linerow--selected': isChosen(service) }"
      @click="emit('add', service)"
    >
      <div class="lc-col-name ellipsis" :class="{ 'lc-accent': isChosen(service) }">
        {{ service.service }}
      </div>
      <div class="lc-col-num lc-money">{{ service.price }} р</div>
      <div class="lc-col-del">
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
