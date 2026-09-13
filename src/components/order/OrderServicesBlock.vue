<script setup>
// Список выбранных работ в заказе (Фаза 8, задача 8.1).
// Подпись «работа/услуга» — из лексикона профиля (10.1).
import { useLexicon } from 'src/domain/lexicon.js'

const { t } = useLexicon()

const props = defineProps({
  services: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['remove'])
</script>

<template>
  <div>
    <div v-if="!props.services.length" class="text-caption lc-mute lc-pad">
      работ пока нет — добавьте их на вкладке «{{ t('service') }}»
    </div>

    <template v-else>
      <div class="lc-linerow lc-linerow--head">
        <div class="lc-col-name">{{ t('service') }}</div>
        <div class="lc-col-num">цена</div>
        <div v-if="props.editMode" class="lc-col-del"></div>
      </div>

      <div
        v-for="(service, index) in props.services"
        :key="service.id ?? index"
        class="lc-linerow"
      >
        <div class="lc-col-name ellipsis">{{ service.service }}</div>
        <div class="lc-col-num lc-money">{{ service.price }} р</div>
        <div v-if="props.editMode" class="lc-col-del">
          <q-btn
            flat
            round
            dense
            icon="close"
            color="negative"
            @click="emit('remove', index)"
          >
            <q-tooltip class="text-caption">убрать</q-tooltip>
          </q-btn>
        </div>
      </div>
    </template>
  </div>
</template>
