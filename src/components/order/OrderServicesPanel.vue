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
  <q-tab-panel name="servicesChoice" style="padding: 0">
    <q-select
      :model-value="props.selectedCategory"
      :options="props.categories"
      option-label="category_name"
      option-value="id"
      emit-value
      map-options
      outlined
      :label="`категории: ${t('service')}`"
      placeholder="нет категорий"
      label-color="grey"
      color="yellow"
      text-color="yellow"
      @update:model-value="value => emit('update:selectedCategory', value)"
    />

    <q-list bordered separator>
      <div class="text-center text-grey" style="letter-spacing: 0.3em">{{ t('service') }}</div>
      <q-item-label v-if="props.services.length === 0">Нет: {{ t('service') }}</q-item-label>
      <q-item
        v-for="service in props.services"
        :key="service.id"
        class="w-100 justify-between selectService"
        style="width: 100%"
        clickable
        v-ripple
        :class="{ 'text-yellow': isChosen(service) }"
        @click="emit('add', service)"
      >
        <q-item-section>
          <q-item-label class="text-left">
            {{ service.service }}
          </q-item-label>
        </q-item-section>

        <q-item-section>
          <q-item-label class="text-right">
            {{ service.price }}
          </q-item-label>
        </q-item-section>
      </q-item>
    </q-list>

    <q-btn
      icon="add"
      round
      class="fab bg-yellow text-black"
      @click="emit('create')"
      size="20px"
    />
  </q-tab-panel>
</template>

<style scoped>
/* Кнопка была в разметке страницы, где и жил класс `.fab` (scoped-стили родителя
   не достают до вложенных элементов дочерних компонентов) — 8.1. */
.fab {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
}
</style>
