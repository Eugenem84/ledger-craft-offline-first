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
  <q-tab-panel name="servicesChoice" class="q-pa-none">
    <div class="q-pa-md">
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

      <div class="row items-center no-wrap q-mt-sm">
        <div class="text-caption lc-mute col">
          выберите {{ t('service') }} — она добавится в заказ
        </div>
        <q-btn
          dense
          no-caps
          outline
          color="secondary"
          icon="add"
          :label="`новая ${t('service')}`"
          @click="emit('create')"
        />
      </div>
    </div>

    <div class="lc-linerow lc-linerow--head">
      <div class="lc-col-name">{{ t('service') }}</div>
      <div class="lc-col-num">цена</div>
      <div class="lc-col-del"></div>
    </div>

    <div v-if="!props.services.length" class="text-caption lc-mute q-pa-md">
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
  </q-tab-panel>
</template>

<style scoped>
.lc-linerow--selected {
  background: var(--lc-accent-soft);
}
</style>
