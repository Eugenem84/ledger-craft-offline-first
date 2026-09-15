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
// Фильтр списка: прячем только «готово И оплачено» (дефект живого прогона, 11.6).
import { isOrderVisible } from 'src/utils/orderFilters.js'

const $q = useQuasar()

const orderStore = useOrdersStore()
const specializationsStore = useSpecializationsStore()
const { t } = useLexicon()
const router = useRouter()
const loading = ref(false)
const orders = computed(() => orderStore.items); // Orders now come from the store

// Тумблер «показывать готовые и оплаченные». Выключен — скрываем только заказы,
// у которых выполнены ОБА условия: статус «готово» И оплата. В БД `paid` — это 0/1,
// поэтому проверка живёт в `isOrderVisible` (строгое сравнение с `false` не работало).
const showCompleted = ref(false)

const filteredOrders = computed(() =>
  orders.value.filter(order => isOrderVisible(order, showCompleted.value))
)

/** Подпись «всего/показано» — честно отражает, сколько скрыл фильтр. */
const listSubtitle = computed(() =>
  filteredOrders.value.length === orders.value.length
    ? `всего: ${orders.value.length}`
    : `показано: ${filteredOrders.value.length} из ${orders.value.length}`
)


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
    <LcPageHeader :title="t('order')" :subtitle="listSubtitle" icon="receipt_long">
      <template #actions>
        <q-toggle v-model="showCompleted" dense color="secondary" icon="visibility" size="sm">
          <q-tooltip class="text-caption">показывать готовые и оплаченные</q-tooltip>
        </q-toggle>
      </template>
    </LcPageHeader>

    <!-- Список заказов: каждый заказ — своя карточка с отступом от соседей (правка
         владельца 15.09.2026: строки в общей рамке сливались в одно полотно).
         Пустое состояние — обычная карточка, у списка её роль играет сам заказ. -->
    <div v-if="!filteredOrders.length" class="lc-card">
      <LcEmptyState
        icon="receipt_long"
        :title="loading ? 'Загружаем заказы…' : 'Заказов пока нет'"
        :hint="
          orders.length
            ? 'Готовые и оплаченные заказы скрыты — включите тумблер в шапке.'
            : 'Нажмите «+», чтобы завести первый заказ.'
        "
      />
    </div>

    <q-list v-else class="lc-order-list q-py-xs">
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
              <!-- Итог = сумма позиций (как в карточке и «Аналитике»): `positions_total`
                   считает запрос списка, `total_amount` — только фолбэк для заказов
                   без позиций (разбор 15.09.2026: снапшот `total_amount` расходился
                   с карточкой после изменений строк в обход сохранения заказа). -->
              <div class="lc-money">{{ order.positions_total ?? order.total_amount ?? 0 }} р</div>
            </div>
          </div>
        </q-item-section>
      </q-item>
    </q-list>

    <LcFab icon="add" label="новый заказ" @click="goToNewOrder" />
  </q-page>
</template>
