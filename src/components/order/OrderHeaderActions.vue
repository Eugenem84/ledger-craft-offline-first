<script setup>
// Шапка страницы заказа (Фаза 8, задача 8.1): кнопки действий, номер заказа,
// переключатели статуса и «оплачено». Логика — в `useOrderDraftStore`, здесь только события.
//
// Переработка UI: вместо ряда мелких подписей («НАЗАД», «РЕД», «сохр», «опл»)
//   • назад / правка / сохранение — иконки с подсказками;
//   • второстепенные действия (ссылка, очистка, удаление) — в меню «⋮»;
//   • статус — сегментированный переключатель со словами, оплата — отдельной кнопкой.
import { computed } from 'vue'
import { ORDER_STATUSES } from 'src/utils/analytics.js'
import LcStatusChip from 'src/components/ui/LcStatusChip.vue'

// Пропсы только читаются из шаблона — присваивание не нужно.
defineProps({
  editMode: { type: Boolean, default: false },
  isNewOrder: { type: Boolean, default: false },
  orderNumber: { type: [String, Number], default: null },
  status: { type: String, default: 'waiting' },
  paid: { type: Boolean, default: false },
  /** Блокировка кнопки share-ссылки, пока идёт запрос. */
  busy: { type: Boolean, default: false },
})

const emit = defineEmits([
  'back',
  'share',
  'clear',
  'remove',
  'edit',
  'save',
  'update:status',
  'update:paid',
])

/** Подписи статусов — общий словарь (`src/utils/analytics.js`). */
const statusOptions = computed(() => ORDER_STATUSES.map(item => ({ label: item.label, value: item.value })))
</script>

<template>
  <div class="lc-orderbar">
    <div class="row items-center no-wrap q-gutter-x-sm">
      <q-btn flat round dense icon="arrow_back" color="secondary" @click="emit('back')">
        <q-tooltip class="text-caption">{{ editMode ? 'отменить правку' : 'назад' }}</q-tooltip>
      </q-btn>

      <div class="col ellipsis">
        <div class="row items-baseline no-wrap q-gutter-x-sm">
          <span class="lc-eyebrow">заказ</span>
          <span class="lc-money text-subtitle2">№ {{ orderNumber ?? '—' }}</span>
          <span v-if="isNewOrder" class="text-caption lc-mute">не сохранён</span>
        </div>
        <div class="row items-center no-wrap q-gutter-x-sm q-mt-xs">
          <LcStatusChip :status="status" />
          <span v-if="paid" class="lc-status lc-status--paid">
            <q-icon name="paid" size="14px" />
            оплачено
          </span>
        </div>
      </div>

      <!-- Вход в правку подписан словом: раньше была только иконка-карандаш,
           и разделы «работа/материалы» выглядели недоступными. -->
      <q-btn
        v-if="!editMode"
        dense
        no-caps
        outline
        color="secondary"
        icon="edit"
        label="Изменить"
        @click="emit('edit')"
      />

      <q-btn
        v-else
        dense
        no-caps
        unelevated
        color="secondary"
        text-color="black"
        icon="save"
        label="Сохранить"
        @click="emit('save')"
      />

      <q-btn flat round dense icon="share" color="secondary" :loading="busy" @click="emit('share')">
        <q-tooltip class="text-caption">скопировать ссылку на отчёт</q-tooltip>
      </q-btn>

      <q-btn flat round dense icon="more_vert" color="secondary">
        <q-tooltip class="text-caption">ещё</q-tooltip>
        <q-menu dark auto-close>
          <q-list dense style="min-width: 220px">
            <q-item v-if="editMode" clickable @click="emit('clear')">
              <q-item-section avatar><q-icon name="cleaning_services" /></q-item-section>
              <q-item-section>очистить позиции</q-item-section>
            </q-item>
            <q-separator dark />
            <q-item clickable class="text-negative" @click="emit('remove')">
              <q-item-section avatar><q-icon name="delete_forever" /></q-item-section>
              <q-item-section>удалить заказ</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </div>

    <div class="row items-center no-wrap q-gutter-x-sm q-mt-sm">
      <q-btn-toggle
        :model-value="status"
        class="col lc-statustoggle"
        spread
        no-caps
        unelevated
        color="grey-9"
        text-color="grey-5"
        toggle-color="secondary"
        toggle-text-color="black"
        :options="statusOptions"
        @update:model-value="value => emit('update:status', value)"
      />

      <q-btn
        no-caps
        unelevated
        :outline="!paid"
        :color="paid ? 'positive' : 'grey-8'"
        :text-color="paid ? 'white' : 'grey-4'"
        icon="paid"
        label="оплачено"
        @click="emit('update:paid', !paid)"
      />
    </div>
  </div>
</template>

<style scoped>
.lc-orderbar {
  background: var(--lc-surface);
  border: 1px solid var(--lc-border);
  border-radius: var(--lc-radius);
  padding: 10px 12px;
}

.lc-statustoggle {
  border-radius: var(--lc-radius-sm);
  overflow: hidden;
}
</style>

