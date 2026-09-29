<script setup>
// Выбор источника позиции (правка владельца 29.09.2026): один вход «Добавить» на вкладке
// «товары» сначала спрашивает — взять **товар со склада** или оформить **разовую покупку
// («вне склада»)**, которую мастер сделал только для этого ремонта (учёт склада не ведётся).
// Оболочка — общая `LcDialogShell`.
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'
import { useLexicon } from 'src/domain/lexicon.js'

const { t } = useLexicon()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** Раздел «склад» профиля (10.3): без него доступен только источник «покупка». */
  showStore: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'choose'])

const close = () => emit('update:modelValue', false)

const choose = source => {
  emit('choose', source)
  close()
}
</script>

<template>
  <LcDialogShell
    :model-value="props.modelValue"
    title="Добавить в заказ"
    subtitle="Откуда взять позицию?"
    @update:model-value="value => emit('update:modelValue', value)"
  >
    <div class="q-gutter-y-sm">
      <q-btn
        v-if="props.showStore"
        class="full-width"
        unelevated
        no-caps
        color="secondary"
        text-color="black"
        icon="inventory_2"
        :label="`${t('part')} ${t('fromStock')}`"
        @click="choose('store')"
      />

      <q-btn
        class="full-width"
        :outline="props.showStore"
        :unelevated="!props.showStore"
        no-caps
        color="secondary"
        :text-color="props.showStore ? undefined : 'black'"
        icon="shopping_bag"
        :label="t('purchase')"
        @click="choose('purchase')"
      />
    </div>

    <template #actions>
      <q-btn flat no-caps color="grey-5" label="Отмена" @click="close" />
    </template>
  </LcDialogShell>
</template>
