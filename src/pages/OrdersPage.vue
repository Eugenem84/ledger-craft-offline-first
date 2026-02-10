<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from "vue-router";
import { useOrdersStore } from "stores/useOrdersStore.js"; // Updated import
import { useQuasar } from "quasar";
import DeleteConfirmPage from "pages/dialogs/DeleteConfirmPage.vue"; // Corrected import path
import { useSpecializationsStore } from "stores/useSpecializationsStore.js";

const $q = useQuasar()

const deleteConfirmPage = ref(null)

const orderStore = useOrdersStore()
const router = useRouter()
const loading = ref(false)
const orders = computed(() => orderStore.items); // Orders now come from the store

const filterDone = ref(false) // Стейт для фильтрации завершенных заказов

const filteredOrders = computed(() => {
  return orders.value.filter(order =>
    (filterDone.value || order.status !== 'done') || (order.paid === false)
  )
})


function formatDate(timestamp) {
  const date = new Date(timestamp * 1000); // Convert Unix timestamp to milliseconds
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



const statusBorderClass = (status) => {
  return {
    'border-waiting': status ==='waiting',
    'border-done': status === 'done',
    'border-process': status === 'process'
  }
}

const goToOrderDetails = (order) => {
  console.log('переходим на ордер', order.id)
  orderStore.select(order.id)
  router.push(`/orders/${order.id}`)
}

const goToNewOrder = () => {
  console.log('не реализовано')
  // Removed orderStore.clearCurrentOrder() as it's not part of the new store's API
  router.push({ name: `new-order`})
}

const getOrders = async () => {
  loading.value = true
  try {
    await orderStore.load(); // Load orders using the store action
    console.log('ордеры: ', orders.value)
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

</script>

<template>
  <div class="text-center" style="color: gray; font-size: 80% ; background-color: #1c1c1c" >
    <span>о р д е р ы</span>
  </div>

  <div class="row items-center no-wrap">
    <q-checkbox
      v-model="filterDone"
      dense
      size="sm"
      color="black"
      class="q-mr-xs"
    />
    <span class="text-body2 text-grey-8 cursor-pointer"
          :class="{ 'text-green': filterDone }"
          @click="filterDone = !filterDone">
    показывать готовые и оплаченые
  </span>
  </div>

  <q-page class="q-pa-none" style="padding: 0">
    <q-list bordered separator>
      <q-item-label v-if="filteredOrders.length === 0">Нет данных</q-item-label>
      <q-item v-for="order in filteredOrders"
              :key="order.id"
              clickable
              v-ripple
              @click="goToOrderDetails(order)"
              class="flex-direction: column"
              style="height: 20px"
              :class="statusBorderClass(order.status)"
      >
        <!-- Первый ряд (3 колонки) -->
        <q-item-section class="col-12">
          <div class="row no-wrap items-center q-pa-none">
            <div class="col-2 text-left q-pa-none">
              <q-item-label style="white-space: nowrap;">
                {{ formatDate(order.created_at) }}
              </q-item-label>

              <q-item-label name="order-number" class="q-ml-sm" style="white-space: nowrap; color: white">
                №: {{order.id}}
              </q-item-label>
            </div>
            <div class="col-6 text-center">
              <q-item-label style="white-space: normal; word-break: break-word">
                {{ order.client_name }}
              </q-item-label>
            </div>

            <div class="col-1">
              <div>
                <q-item-label v-if="order.status === `waiting`">
                  <q-icon name="hourglass_empty" spin color="yellow" class="q-ml-sm" />
                </q-item-label>


                <q-item-label v-if="order.status === `done`">
                  <q-icon name="done" color="green" class="q-ml-sm" />
                </q-item-label>

                <q-item-label v-if="order.status === `process`">
                  <q-icon name="build" spin color="red" class-ml-sm />
                </q-item-label>

              </div>
            </div>

            <div class="col-1 text-right">
              <div v-if="order.paid"
                   class="q-ml-sm"
                   style="display:flex; flex-direction: column" align="center">
                <q-item-label>
                  <q-icon name="verified" color="green" class-ml-sm />
                  <span class="text-caption text-green" style="font-size: 9px">оплачено</span>
                </q-item-label>
              </div>
            </div>
            <div class="col-2 text-right">
              <q-item-label class="text-body1">
                {{ order.total_amount }}
              </q-item-label>
            </div>
          </div>
        </q-item-section>

      </q-item>

    </q-list>

    <!-- Плавающая кнопка добавления нового ордера -->
    <q-btn
      icon="add"
      round
      class="fab bg-yellow text-black"
      @click="goToNewOrder"
      size="20px"
    />

  </q-page>

  <DeleteConfirmPage ref="deleteConfirmPage" />

</template>

<style scoped>

.fab {
  position: fixed;
  bottom: 70px;
  right: 16px;
  z-index: 1000; /* чтобы кнопка была поверх остальных элементов */
}

.border-waiting {
  box-shadow: inset 0 0 15px rgba(255, 255, 0, 0.2);
}

.border-done {
  box-shadow: inset 0 0 15px rgba(0, 255, 0, 0.1);;
}

.border-process {
  border-right: 1px solid red;
  border-left: 1px solid red;
  box-shadow: inset 0 0 15px rgba(255, 0, 0, 0.5);;

}

</style>
