<script setup>
import { logger } from 'src/utils/logger'
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useOrdersStore } from 'stores/useOrdersStore.js'
import { useQuasar } from 'quasar'
// Фаза 10: лексикон ниши (10.1) и перезагрузка списка при смене профиля (10.8).
import { useSpecializationsStore } from 'stores/useSpecializationsStore.js'
import { useLexicon } from 'src/domain/lexicon.js'
// Общие UI-элементы (переработка интерфейса): заголовок, статус, пустое состояние, FAB.
import LcEmptyState from 'src/components/ui/LcEmptyState.vue'
import LcFab from 'src/components/ui/LcFab.vue'
import LcPageHeader from 'src/components/ui/LcPageHeader.vue'
import LcStatusChip from 'src/components/ui/LcStatusChip.vue'

const $q = useQuasar()

const orderStore = useOrdersStore()
const specializationsStore = useSpecializationsStore()
const { t } = useLexicon()
const router = useRouter()
const loading = ref(false)
const orders = computed(() => orderStore.items); // Orders now come from the store

const filterDone = ref(false) // Стейт для фильтрации завершенных заказов

const filteredOrders = computed(() => {
  return orders.value.filter(
    order => filterDone.value || order.status !== 'done' || order.paid === false
  )
})


function formatDate(dateInput) {
  if (!dateInput) return '---';

  let date;
  // Check if the input is a Unix timestamp (number) or a date string
  if (typeof dateInput === 'number') {
    date = new Date(dateInput * 1000);
  } else if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  } else {
    return '---';
  }

  if (isNaN(date.getTime())) {
    return '---';
  }

  const now = new Date();

  // Опции для дня и месяца словами
  const options = { day: '2-digit', month: 'long' };
  let formatted = date.toLocaleDateString('ru-RU', options);

  if (date.getFullYear() !== now.getFullYear()) {
    // Добавляем двухзначный год
    const year = String(date.getFullYear()).slice(-2);
    formatted += ` ${year}`;
  }

  return formatted;
}



/** Полоса статуса слева (`.lc-order-row--*` вместо прежних «неоновых» теней). */
const statusRowClass = status => {
  if (status === 'waiting') return 'lc-order-row--waiting'
  if (status === 'done') return 'lc-order-row--done'
  if (status === 'process') return 'lc-order-row--process'
  return ''
}

const goToOrderDetails = (order) => {
  logger.log('переходим на ордер', order.id)
  orderStore.select(order.id)
  router.push(`/orders/${order.id}`)
}

const goToNewOrder = () => {
  router.push({ name: 'new-order' })
}

const getOrders = async () => {
  loading.value = true
  try {
    await orderStore.load(); // Load orders using the store action
    logger.log('ордеры: ', orders.value)
    logger.table(JSON.parse(JSON.stringify(orders.value)))
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка загрузки ордеров',
      position: "top",
      timeout: "1000"
    })
    console.error('Ошибка загрузки ордеров: ', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  getOrders()
})

// Переключение рабочего профиля (задача 10.8) меняет список заказов — перечитываем.
watch(
  () => specializationsStore.selectedId,
  () => {
    getOrders()
  }
)

</script>

<template>
  <q-page class="lc-page lc-shell">
    <LcPageHeader
      :title="t('order')"
      :subtitle="`всего: ${filteredOrders.length}`"
      icon="receipt_long"
    >
      <template #actions>
        <q-toggle v-model="filterDone" dense color="secondary" icon="visibility" size="sm">
          <q-tooltip class="text-caption">показывать готовые и оплаченные</q-tooltip>
        </q-toggle>
      </template>
    </LcPageHeader>

    <div class="lc-card">
      <LcEmptyState
        v-if="!filteredOrders.length"
        icon="receipt_long"
        :title="loading ? 'Загружаем заказы…' : 'Заказов пока нет'"
        :hint="
          filterDone
            ? 'Включён фильтр — снимите его, чтобы увидеть завершённые.'
            : 'Нажмите «+», чтобы завести первый заказ.'
        "
      />

      <q-list v-else class="q-py-xs">
        <q-item
          v-for="order in filteredOrders"
          :key="order.id"
          clickable
          v-ripple
          :class="['lc-order-row', statusRowClass(order.status)]"
          @click="goToOrderDetails(order)"
        >
          <q-item-section>
            <div class="row items-center no-wrap">
              <div class="col ellipsis">
                <div class="row items-baseline no-wrap q-gutter-x-sm">
                  <span class="lc-money text-body2">№ {{ order.server_id ?? '—' }}</span>
                  <span class="text-caption lc-mute">{{ formatDate(order.created_at) }}</span>
                </div>
                <div class="text-body2 ellipsis lc-muted">
                  {{ order.client_name || 'без клиента' }}
                </div>
              </div>

              <div class="col-auto column items-end q-gutter-y-xs q-mx-md">
                <LcStatusChip :status="order.status" />
                <span v-if="order.paid" class="lc-status lc-status--paid">
                  <q-icon name="paid" size="14px" />
                  оплачено
                </span>
              </div>

              <div class="col-auto text-right">
                <div class="lc-money">{{ order.total_amount ?? 0 }} р</div>
              </div>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </div>

    <LcFab icon="add" label="новый заказ" @click="goToNewOrder" />
  </q-page>
</template>
