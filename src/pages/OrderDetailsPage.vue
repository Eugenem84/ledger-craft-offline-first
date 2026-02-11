<script setup>
import {ref, computed, onMounted} from 'vue'
import {useOrderStore} from "stores/order.js";
import {api} from "boot/axios.js";
import {useSpecializationsStore} from "stores/specializations.js";
import {useRouter} from "vue-router";
import DeleteConfirmPage from "pages/DeleteConfirmPage.vue";

const deleteConfirmPage = ref(null)

import {useQuasar} from "quasar";
//import {data} from "autoprefixer";

const isLoading = ref(false)

const $q = useQuasar()

const router = useRouter()
const specializationsStore = useSpecializationsStore()
const selectedSpecializationId = specializationsStore.getSelectedSpecialization.id

const orderStore = useOrderStore()

const orderStatus = ref('waiting');
const paid = ref(false)

const order = ref(null)
const services = ref([])
const materials =ref([])

const storeProducts = ref([])
const products = ref([])
const productCategories = ref([])
const selectedStoreProduct = ref(null)
const selectedProductCategory = ref(null)


//const clientName = ref(null)
const client = ref({
  id:null,
  name: 'выберите клиента',
  phone: ''
})
const clientId = ref(null)
const modelId = ref(null)
const comments = ref(null)

const clients = ref([])

const filteredClients = ref([...clients.value])

const models = ref(null)

const model = ref({id: null, name: null})

const selectedServiceCategory = ref(null)

const serviceCategories = ref(null)
const servicesByCategory = ref(null)

const tab = ref('all')

const editMode = ref(false)
const isNewOrder = computed(() => !order.value?.id)

const showAddNewMaterialDialog = ref(false)
const showAddNewServiceDialog = ref(false)
const showAddNewClientDialog = ref(false)
const showAddNewModelDialog = ref(false)
const showAddProductFromStoreDialog = ref(false)

const newMaterial = ref({
  name: '',
  price: 0,
  amount: 0
})

const newService = ref({
  name: '',
  price: 0,
})

const newClient = ref({
  name: '',
  phone: '',
})

const newModel = ref({
  name: '',
})

const filterClients = (val, update) => {
  if (val === '') {
    update(() => {
      filteredClients.value = [...clients.value]
    })
    return
  }

  update(() => {
    filteredClients.value = clients.value.filter(client =>
      client.name.toLowerCase().includes(val.toLowerCase()) ||
      client.phone.toString().toLowerCase().includes(val.toLowerCase())
    )
  })
}

const getServices = async () => {
  try {
    const orderId = order.value.id
    const response = await api.get(`/get_services/${orderId}`)
    services.value = response.data
    console.log('services: ', services.value )
  }  catch (err) {
    console.error('ошибка загрузки сервисов', err)
    $q.notify({
      type: 'negative',
      message: 'ошибка загрузки сервисов: ',
      position: "top",
      timeout: "1000"
    })
  }
}

const switсhPaidStatus = async () => {
  const id = order.value.id
  try {
    const response = await api.put(`switch_paid_status/${id}`)
    if (response.status === 200) {
      paid.value = !paid.value
      console.log('статус оплаты изменен')
    }
  } catch (err) {
    console.log('ошибка смены статуса: ', err)
  }
}

const updateOrderStatus = async () => {
  try {
    const id = order.value.id
    const response = await api.put(`/update_order_status/${id}`, {
      status: orderStatus.value
    })
    if (response.status === 200) {
      console.log('статус ордера изменен на: ', orderStatus.value)
    } else {
      console.error('ошибка обновления статуса', response)}
  } catch (err) {
    console.error('ошибка запроса: ', err)
  }
}

const getMaterialsByOrder = async () => {
  try {
    const orderId = order.value.id
    const response = await api.get(`/get_materials_by_order/${orderId}`)

    materials.value = []
    products.value = []

    response.data.forEach(item => {
      if (item.product_id) {
        products.value.push({...item})
      } else {
        materials.value.push({...item})
      }
    })
    console.log('materials: ', materials.value)
    console.log('products: ', products.value)
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка загрузки материалов',
      position: "top",
      timeout: "1000"
    })
    console.error('ошибка получения материалов: ', err)
  }
}

const getServiceCategories = async () => {
  const specializationStore = useSpecializationsStore()
  try {
    const specializationId = specializationStore.getSelectedSpecialization.id
    console.log('специализация: ', specializationId)
    const response = await api.get(`/get_categories/${specializationId}`)
    serviceCategories.value = response.data
    selectedServiceCategory.value = serviceCategories.value[0].id
    await getServicesByCategory(selectedServiceCategory.value)
    console.log('сервис категории: ', serviceCategories.value)
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка загрузки категорий сервисов',
      position: "top",
      timeout: "1000"
    })
    console.error('ошибка загрузки сервис категорий', err)
  }
}

const getServicesByCategory = async (categoryId) => {
  console.log('подгружаем сервисы категории: ', categoryId)
  console.log('selectedServiceCategory: ', selectedServiceCategory)
  try {
    const response = await api.get(`/get_service/${categoryId}`)
    servicesByCategory.value = response.data
    console.log('подгружены сервисы категории: ', servicesByCategory.value)
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка загрузки сервисов',
      position: "top",
      timeout: "1000"
    })
    console.error('ошибка загрузке сервисов данной категории: ', categoryId , err )
  }
}

const deleteOrder = async () => {

  deleteConfirmPage.value.open(
    'Подтвердите удаление',
    `Вы уверены, что хотите удалить ордер "${order.value.id}"?`,
    async () => {
      try {
        const response = await api.delete(`/delete_order/${order.value.id}`)
        if (response.status === 200) {
          $q.notify({
            type: 'positive',
            message: `ордер ${order.value.id} удален`,
            position: 'top',
            timeout: 500
          })
        }
      } catch (err) {
        $q.notify({
          type: 'negative',
          message: 'ошибка удаления ордера',
          position: "top",
          timeout: "1000"
        })
        console.error("Ошибка удаления ордера", err);
      } finally {
        router.back()
      }
    }
  );
}

onMounted(() => {
  if(orderStore.currentOrder){
    order.value = orderStore.currentOrder
    console.log('ордер: ', order.value)
    paid.value = order.value.paid
    orderStatus.value = order.value.status
    client.value.name = order.value.client_name
    client.value.phone = order.value.client_phone
    client.value.id = order.value.client_id
    clientId.value = order.value.client_id
    modelId.value = order.value.model_id
    model.value.name = order.value.model_name
    if (order.value.model_id){
      modelId.value = order.value.model_id
    }
    if (order.value.comments) {
      comments.value = order.value.comments
    }
    getServices()
    getMaterialsByOrder()
  } else {
    console.log('режим нового ордера')
    order.value = {
      status: 'waiting',
      paid: false,
      clientId: null,
      modelId: null,
      comments: ''
    }
    editMode.value = true
    getProductCategories()
  }
  getClients()
  getModels()
  getServiceCategories()
  console.log('client: ', client.value)
})

const getClients = async () => {
  try {
    const response = await api.get(`/get_clients/${selectedSpecializationId}`)
    clients.value = response.data
    console.log('clients: ', clients)
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка загрузки клиентов',
      position: "top",
      timeout: "1000"
    })
    console.error('ошибка получения клиентов: ', err)
  }
}

const getModels = async () => {
  try {
    const response = await api.get(`/get_equipment_models/${selectedSpecializationId}`)
    models.value = response.data
    console.log('models: ', models)
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка загрузки моделей',
      position: "top",
      timeout: "1000"
    })
    console.error('ошибка получения моделей: ', err)
  }
}

const getProductCategories = async () => {
  try {
    const response = await api.get(`/get_product_categories/${selectedSpecializationId}`)
    productCategories.value = response.data
    console.log('productCategories: ', productCategories.value)
  } catch (err){
    $q.notify({
      type: 'negative',
      message: 'ошибка загрузки категорий товаров',
      position: "top",
      timeout: "1000"
    })
    console.error(err)
  }
}

const getProductsByCategory = async (selectedProductCategory) => {
  selectedStoreProduct.value = null
  try {
    const response = await api.get(`/get_products/${selectedProductCategory.id}`)
    storeProducts.value = response.data
    console.log('products: ', products.value)
  } catch (err){
    $q.notify({
      type: 'negative',
      message: 'ошибка загрузки продуктов',
      position: "top",
      timeout: "1000"
    })
    console.error(err)
  }
}

const activeEditMode = async () => {
  console.log('активен режим редактора ордера')
  await getClients()
  console.log('client_id: ', order.value.client_id)
  client.value.id = order.value.client_id
  await getModels()
  console.log('model_id: ', order.value.model_id)
  model.value.id = order.value.model_id
  editMode.value = true
  await getProductCategories()
}

const saveOrder = async () => {
  try {
    if(isNewOrder.value){
      await createOrder()
    } else {
      await updateOrder()
    }
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка сохранения заказа'
    })
    console.error('ошибка сохранения заказа: ', err)
  }

}

const createOrder = async () => {
  const token = localStorage.getItem('authToken')
  console.log('token: ', token)
  console.log('сохроняем новый ордер')
  console.log('services', services.value.map(service => service.id))
  console.log('addedMaterials: ', materials.value)
  try {
    const response = await api.post(`/save_order`, {
      clientId: client.value.id,
      modelId: model.value.id,
      specializationId: selectedSpecializationId,
      totalAmount: totalSumProducts.value + totalSumMaterials.value + totalSumServices.value,
      addedMaterials: materials.value,
      addedProducts: products.value,
      servicesId: services.value.map(service => service.id),
      comments: comments.value,
      paid: paid.value,
      userOrderNumber: '',
      status: orderStatus.value,
    }, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    console.log('response: ', response)
    $q.notify({
      type: 'positive',
      message: 'ордер создан',
      position: "top",
      timeout: "1000"
    })
    router.back()
  } catch (err){
    $q.notify({
      type: 'negative',
      message: 'ошибка создания ордера',
      position: "top",
      timeout: "1000"
    })
    console.error(err)
  }
}

const updateOrder = async () => {
  console.log('обновляем ордер на сервере')
  console.log('cервисы для сохранения: ', services.value)
  try {
    const totalAmount = totalSumServices.value + totalSumMaterials.value + totalSumProducts.value
    console.log('client_id: ', client.value.id)
    console.log('model_id', model.value.id)
    const response = await api.post('/update_order', {
      id: order.value.id,
      client_id: client.value.id,
      model_id: model.value.id,
      specialization_id: selectedSpecializationId,
      user_order_number: '',
      total_amount: totalAmount,
      materials: materials.value,
      products: products.value,
      comments: comments.value,
      services: services.value.map(service => service.id),
      paid: paid.value
    })
    console.log('данные для передачи: ', response)
    console.log('данные ордера обновлены')
    $q.notify({
      type: 'positive',
      message: 'ордер обновлен',
      position: "top",
      timeout: "1000"
    })
    router.back()
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка ошибка обновления ордера',
      position: "top",
      timeout: "1000"
    })
    console.error('ошибка обновления ордера', err)
  }
}

// Вычисляемая сумма материалов
const totalSumServices = computed(() => {
  if (!services.value) return 0;
  return services.value.reduce((sum, service) => {
    const price = Number(service.price) || 0;
    return sum + price
  }, 0);
})

// Вычисляемая сумма материалов
const totalSumMaterials = computed(() => {
  if (!materials.value) return 0;
  return materials.value.reduce((sum, material) => {
    const price = Number(material.price) || 0;
    const amount = Number(material.amount) || 0;
    return sum + price * amount;
  }, 0);
})

const totalSumProducts = computed(() => {
  if (!products.value) return 0
  return products.value.reduce((sum, product) => {
    const price = Number(product.price) || 0
    const amount = Number(product.amount) || 0
    return sum + price * amount
  }, 0)
})

const computedToggleColor = computed(() => {
  switch (orderStatus.value) {
    case 'waiting':
      return 'orange'
    case 'process':
      return 'red'
    case 'done':
      return 'green'
    default:
      return 'yellow'
  }
})

const closeDialog = () => {
  showAddNewClientDialog.value = false
  showAddNewMaterialDialog.value = false
  showAddNewServiceDialog.value = false
  showAddNewModelDialog.value = false
  newMaterial.value = { name: '', price: 0, amount: 0 }
}

const addNewService = async () => {
  try {
    console.log('selected category_id: ', selectedServiceCategory.value)
    const response = await api.post('/add_service', {
      service: newService.value.name,
      price: newService.value.price,
      category_id: selectedServiceCategory.value
    })
    console.log('response: ', response)
    $q.notify({
      type: 'positive',
      message: 'работа ' + newService.value.name + ' успешно создана',
      position: "top",
      timeout: "1000"
    })
    await getServicesByCategory(selectedServiceCategory.value)
    closeDialog()
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка создании работы',
      position: "top",
      timeout: "1000"
    })
    console.error('ошибка создание нового сервиса:  ',err)
  }
}

const addMaterial = () => {
  if (
    newMaterial.value.name.trim() !== '' &&
    newMaterial.value.price > 0 &&
    newMaterial.value.amount > 0
  ) {
    console.log('Добавление нового материала:', { ...newMaterial.value })
    materials.value.push(newMaterial.value)
    newMaterial.value = { name: '', price: 0, amount: 0 }
    showAddNewMaterialDialog.value = false
    console.log('materials: ', materials.value)
  } else {
    console.error('Введите корректные данные')
  }
}

const addNewClient = async () => {
  try {
    const response = await api.post('/add_client', {
      name: newClient.value.name,
      phone: newClient.value.phone,
      specialization_id: selectedSpecializationId
    })
    showAddNewClientDialog.value = false
    getClients()
    client.value = response.data.client
    $q.notify({
      type: 'positive',
      message: 'новый клиент "' + newClient.value.name + '" добавлен',
      position: "top",
      timeout: "1000"
    })
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка добавления клиента',
      position: "top",
      timeout: "1000"
    })
    console.error('ошибка добавления клиента: ', err)
  }
}

const addNewModel = async () => {
  try {
    const response = await api.post('/add_equipment_model', {
      name: newModel.value.name,
      specialization_id: selectedSpecializationId
    })
    showAddNewModelDialog.value = false
    getModels()
    model.value = response.data.model
    $q.notify({
      type: 'positive',
      message: 'модель добавлена',
      position: "top",
      timeout: "1000"
    })
  } catch (err){
    $q.notify({
      type: 'negative',
      message: 'ошибка добавления модели',
      position: "top",
      timeout: "1000"
    })
    console.error(err)
  }
}

const addProductFromStore = () => {
  console.log('selectedStoreProduct: ', selectedStoreProduct.value)
  const product = {
    product_id: selectedStoreProduct.value.id,
    name: selectedStoreProduct.value.name,
    price: selectedStoreProduct.value.base_sale_price,
    amount: 1
  }
  products.value.push(product)
  console.log('products: ', products.value)
  showAddProductFromStoreDialog.value = false
}

const deleteMaterialFromOrder = (index) => {
  console.log('index: ', index)
  materials.value.splice(index, 1)
}

const clearOrder = () => {
  console.log("очищаем текущий ордер...")
  client.value = null
  model.value = null
  services.value = []
  materials.value = []
  products.value = []
}

const generateAndCopyLink = async () => {
  isLoading.value = true

  try {
    // 1. Запрашиваем ссылку у сервера
    const { data } = await api.post(`/order-report/${order.value.id}/share-link`)

    // 2. Копируем в буфер обмена
    await copyToClipboard(data.url)

    // 3. Показываем уведомление
    $q.notify({
      type: 'positive',
      message: 'ссылка скопирована в буфер обмена',
      position: "top",
      timeout: "1000"
    })
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: 'ошибка копирования ссылки',
      position: "top",
      timeout: "1000"
    })
    console.error('Ошибка:', error)
  } finally {
    isLoading.value = false
  }
}

const copyToClipboard = async (text) => {
  try {
    // Современный API
    await navigator.clipboard.writeText(text)
  } catch {
    // Фолбэк для старых браузеров
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

</script>

<template>

  <div class="row justify-between">
    <q-btn flat
           v-if="!editMode"
           color="yellow"
           label="НАЗАД"
           @click="$router.back()"
           size="md"
           class="btn-flex"
    />

    <q-btn flat
           v-if="editMode"
           color="yellow"
           label="отмена"
           @click="$router.back()"
           size="md"
           class="btn-flex"
    />

    <q-btn
      color="black"
      icon="link"
      text-color="yellow"
      @click="generateAndCopyLink"
      :loading="loading"
      class="btn-flex"
    />

    <q-btn v-if="editMode"
           flat
           size="md"
           color="yellow"
           label="очистить"
           @click="clearOrder"
    />

    <div v-if="order && !isNewOrder">
      <a style="color:grey; font-size:12px ">№</a>
      <a style="color: yellow; font-size: 17px; padding-top: 5px; display: inline-block">
        {{order.id}}
      </a>
    </div>

    <div>

      <q-btn flat
             v-if="!editMode"
             size="md"
             color="yellow"
             class="justify-end"
             icon="delete_forever"
             @click="deleteOrder"
      />

      <q-btn flat
             v-if="!editMode"
             size="md"
             color="yellow"
             label="РЕД"
             @click="activeEditMode"
      />
      <q-btn flat
             v-if="editMode"
             size="md"
             color="yellow"
             label="сохр"
             @click="saveOrder"
      />

    </div>

    <div class="items-center row q-gutter-x-md">

      <q-btn-toggle
        v-model="orderStatus"
        size="md"
        outline
        glossy
        :toggle-color="computedToggleColor"
        color="grey"
        @update:model-value="updateOrderStatus"
        :options="[
    { label: 'ожид', value: 'waiting' },
    { label: 'враб', value: 'process' },
    { label: 'готово', value: 'done' }
  ]"
      >
      </q-btn-toggle>

      <q-btn outline
             size="md"
             @click="switсhPaidStatus"
             :color="paid ? 'green' : 'grey'"
             glossy
             label="опл"
      />

    </div>

  </div>

  <div class="row items-center q-col-gutter-md">
    <!-- Клиент -->
    <div class="col">
      <!-- Режим редактирования -->
      <q-select v-model="client"
                :options="filteredClients"
                v-if="editMode"
                option-value="id"
                :option-label="client => client ? `${client.name} ${client.phone}` : 'Выберите клиента'"
                label="Клиент"
                color="yellow"
                use-input
                fill-input
                hide-selected
                input-debounce="300"
                behavior="menu"
                map-options
                @filter="filterClients"
                placeholder="Выберите клиента"
                outlined
      >
      </q-select>

      <!-- Режим просмотра -->
      <q-field v-if="!editMode"
               label="Клиент"
               stack-label
               tabindex="-1"
               style="pointer-events: auto"
               label-color="grey"
      >
        <div class="column">
          <div class="text-subtitle1 text-yellow">{{ client?.name }}</div>
          <a v-if="client?.phone" :href="'tel:' + client.phone" class="text-yellow text-bold text-body2">
            {{ client.phone }}
          </a>
        </div>
      </q-field>
    </div>

    <!-- Кнопка для добавления клиента (если в режиме редактирования) -->
    <div class="col-auto" v-if="editMode">
      <q-btn class="text-yellow" @click="showAddNewClientDialog = true">+</q-btn>
    </div>

    <!-- Модель -->
    <div class="col">
      <!-- Режим редактирования -->
      <q-select v-model="model"
                :options="models"
                v-if="editMode"
                outlined
                option-value="id"
                option-label="name"
                label="Модель"
                color="yellow"
      />

      <!-- Режим просмотра -->
      <q-field v-if="!editMode" label="Модель" stack-label tabindex="-1" style="pointer-events: none">
        <div class="text-subtitle1 text-yellow">{{ model?.name || '—' }}</div>
      </q-field>
    </div>

    <!-- Кнопка для добавления модели (если в режиме редактирования) -->
    <div class="col-auto" v-if="editMode">
      <q-btn class="text-yellow" @click="showAddNewModelDialog = true">+</q-btn>
    </div>
  </div>


  <div>
    <q-card>
      <q-tabs
        v-show="editMode"
        v-model="tab"
        dense
        class="text-grey"
        active-color="yellow"
        indicator-color="yellow"
        align="justify"
        narrow-indicator
      >
        <q-tab name="all"
               :label="`работ: ${(services?.length || 0)} материалов: ${(materials?.length || 0) + (products?.length || 0)}`"
        />
        <q-tab name="servicesChoice" v-if="editMode" label="работы" />
        <q-tab name="materialsChoice" v-if="editMode" label="материалы" />
      </q-tabs>

      <q-separator />

      <q-tab-panels v-model="tab" animated>

        <!-- панель отображения выбранных сервисов и материалов -->
        <q-tab-panel name="all" style="padding: 0">
          <div>

            <div class="text-center text-grey">работы:</div>

            <q-list bordered separator >

              <q-item-label v-if="!services">Нет сервисов</q-item-label>
              <q-item v-for="(service, index) in services"
                      :key="index"
                      class="w-100 justify-between"
                      style="width: 100%"
              >
                <!-- сервисы -->
                <q-item-section >
                  <q-item-label class="text-left">
                    {{ service.service }}
                  </q-item-label>
                </q-item-section>


                <q-item-section >
                  <q-item-label class="text-right">
                    {{ service.price }}р
                  </q-item-label>
                </q-item-section>


                <q-item-section class="col-auto" v-if="editMode">
                  <q-btn icon="delete_forever" @click="services.splice(index, 1)" color="red" flat round />
                </q-item-section>

              </q-item>
            </q-list>



            <div class="text-grey text-left" v-show="totalSumMaterials > 0 || totalSumProducts > 0" >
              всего по работе : {{totalSumServices}}р
            </div>



            <div v-if="products.length > 0 || materials.length > 0" class="text-center text-grey">
              материалы:
            </div>
            <!-- отображение списка материалов -->
            <q-list bordered separator >

              <q-item-label v-if="!materials">Нет материалов</q-item-label>
              <q-item v-for="(material, index) in materials"
                      :key="material.id"
                      class="w-100 justify-between row"
                      style="width: 100%"
              >

                <q-item-section class="col-7">
                  <q-item-label class="text-left">
                    {{ material.name }}
                  </q-item-label>
                </q-item-section>

                <q-item-section class="col-1">
                  <q-item-label class="text-right">
                    {{ material.price }}р
                  </q-item-label>
                </q-item-section>

                <q-item-section class="col-1">
                  <q-item-label class="text-center">
                    х{{material.amount}}
                  </q-item-label>
                </q-item-section>

                <q-item-section class="col-1">
                  <q-item-label class="text-right">
                    {{material.price * material.amount}}р
                  </q-item-label>
                </q-item-section>

                <q-item-section class="col-auto" v-if="editMode">
                  <q-btn icon="delete_forever" @click="deleteMaterialFromOrder(index)" color="red" flat round />
                </q-item-section>

              </q-item>
            </q-list>

            <!-- отображение списка продуктов -->
            <q-list bordered separator >

              <q-item-label v-if="!products">Нет материалов</q-item-label>
              <q-item v-for="product in products"
                      :key="product"
                      class="w-100 justify-between row"
                      style="width: 100%"
              >

                <q-item-section class="col-7">
                  <q-item-label class="text-left">
                    {{ product.name }}
                  </q-item-label>
                </q-item-section>


                <q-item-section class="col-1">
                  <q-item-label class="text-right">
                    {{ product.price }}р
                  </q-item-label>
                </q-item-section>

                <q-item-section class="col-1">
                  <q-item-label class="text-center">
                    х{{product.amount}}
                  </q-item-label>
                </q-item-section>

                <q-item-section class="col-1">
                  <q-item-label class="text-right">
                    {{product.price * product.amount}}р
                  </q-item-label>
                </q-item-section>

                <q-item-section class="col-auto" v-if="editMode">
                  <q-btn icon="delete_forever" @click="products.splice(index, 1)" color="red" flat round />
                </q-item-section>

              </q-item>
            </q-list>

            <div class="text-grey text-left" v-show="totalSumMaterials > 0 || totalSumProducts > 0">
              всего по материалам: {{totalSumMaterials + totalSumProducts}}р
            </div>

            <div class="text-grey text-center display: flex" >
              <div>
                всего к оплате:
              </div>

              <div class="text-green">
                {{totalSumMaterials + totalSumProducts + totalSumServices}}
              </div>
              р
            </div>

          </div>

          <q-input type="textarea"
                   v-model="comments"
                   label="комментарии"
                   label-color="yellow"
                   color="yellow"
                   autogrow
                   placeholder="Коментариев нет"
                   :disable="!editMode"
          />



        </q-tab-panel>

        <!-- панель выбора сервисов -->
        <q-tab-panel name="servicesChoice" style="padding: 0">
          <q-select v-model="selectedServiceCategory"
                    :options="serviceCategories"
                    option-label="category_name"
                    option-value="id"
                    emit-value
                    map-options
                    outlined
                    label="категории работ"
                    placeholder="нет категорий"
                    label-color="grey"
                    color="yellow"
                    text-color="yellow"
                    @update:model-value="getServicesByCategory"
          />

          <q-list bordered separator >
            <div class="text-center text-grey">р а б о т ы</div>
            <q-item-label v-if="!servicesByCategory">Нет сервисов</q-item-label>
            <q-item v-for="service in servicesByCategory"
                    :key="service"
                    class="w-100 justify-between selectService"
                    style="width: 100%"
                    clickable
                    v-ripple
                    @click="services.push({ ...service })"
                    :q-item
                    :class="{
                      'text-yellow': services.some(s => s.id === service.id),
                     }"
            >

              <q-item-section >
                <q-item-label class="text-left">
                  {{ service.service }}
                </q-item-label>
              </q-item-section>

              <q-item-section >
                <q-item-label class="text-right">
                  {{ service.price }}
                </q-item-label>
              </q-item-section>

              <q-btn
                icon="add"
                round
                class="fab bg-yellow text-black"
                @click="showAddNewServiceDialog = true"
                size="20px"
              />

            </q-item>
          </q-list>

        </q-tab-panel>

        <!-- панель выбора материалов -->
        <q-tab-panel name="materialsChoice" style="padding: 0">

          <div class="text-center text-grey">материалы: {{totalSumMaterials}}р</div>
          <!-- отображение материалов -->
          <q-list bordered separator>
            <q-item-label v-if="!materials"> нет материалов</q-item-label>
            <q-item v-for="(material, index) in materials"
                    :key="index"
                    class="w-100 justify-between row"
            >

              <q-item-section class="col-7">
                <q-input v-model="material.name" />
              </q-item-section>

              <q-item-section class="col-1">
                <q-input v-model="material.price" input-class="text-right"/>
              </q-item-section>

              <q-item-section class="col-1">
                <q-input v-model="material.amount" input-class="text-right" prefix="x" />
              </q-item-section>

              <q-item-section class="col-1" disabled="disabled" input-class="text-right" >
                <q-input :model-value="material.price * material.amount" />
              </q-item-section>

              <q-item-section class="col-auto">
                <q-btn icon="delete_forever" @click="materials.splice(index, 1)" color="red" flat round />
              </q-item-section>

            </q-item>

          </q-list>

          <div class="text-center text-grey">продукты: {{totalSumProducts}} р</div>

          <!-- отображение продуктов -->
          <q-list bordered separator>
            <q-item-label v-if="!products"> нет материалов</q-item-label>
            <q-item v-for="(product, index) in products"
                    :key="index"
                    class="w-100 justify-between row"
            >

              <q-item-section class="col-7">
                <q-input v-model="product.name" />
              </q-item-section>


              <q-item-section class="col-1">
                <q-input v-model="product.price" input-class="text-right"/>
              </q-item-section>

              <q-item-section class="col-1">
                <q-input v-model="product.amount" input-class="text-right" prefix="x" />
              </q-item-section>

              <q-item-section class="col-1" disabled="disabled" input-class="text-right" >
                <q-input :model-value="product.price * product.amount" />
              </q-item-section>

              <q-item-section class="col-auto">
                <q-btn icon="delete_forever" @click="products.splice(index, 1)" color="red" flat round />
              </q-item-section>

            </q-item>

          </q-list>

          <!-- Плавающая кнопка добавления нового материала -->
          <q-btn
            icon="add"
            round
            class="fab bg-yellow text-black"
            @click="showAddNewMaterialDialog = true"
            size="20px"
          />

          <q-btn
            icon="storage"
            round
            class="bg-yellow text-black"
            size="18"
            @click="showAddProductFromStoreDialog = true"
            style="position: fixed; bottom: 100px; right: 16px; z-index: 1000"
          />


        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </div>

  <div>
    <q-dialog v-model="showAddNewMaterialDialog" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">Добавление материала</div>
          <q-input v-model="newMaterial.name" label-color="yellow" color="yellow" label="Название" outlined class="q-mb-md" />
          <q-input v-model.number="newMaterial.price" label="Цена" label-color="yellow" color="yellow" type="number" outlined class="q-mb-md" />
          <q-input v-model.number="newMaterial.amount" label="Количество" label-color="yellow" color="yellow" type="number" outlined />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Отмена" color="yellow" @click="closeDialog" />
          <q-btn flat label="Добавить" color="yellow" @click="addMaterial" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>

  <div>
    <q-dialog v-model="showAddNewServiceDialog" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">Добавление сервиса</div>
          <q-input v-model="newService.name" label-color="yellow" color="yellow" label="Название" outlined class="q-mb-md" />
          <q-input v-model.number="newService.price" label="Цена" label-color="yellow" color="yellow" type="number" outlined class="q-mb-md" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Отмена" color="yellow" @click="closeDialog" />
          <q-btn flat label="Добавить" color="yellow" @click="addNewService" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>

  <div>
    <q-dialog v-model="showAddNewClientDialog" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">Добавление клиента</div>
          <q-input v-model="newClient.name" label-color="yellow" color="yellow" label="Имя клиента" outlined class="q-mb-md" />
          <q-input v-model.number="newClient.phone" label="телефон" label-color="yellow" color="yellow" type="text" outlined class="q-mb-md" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Отмена" color="yellow" @click="closeDialog" />
          <q-btn flat label="Добавить" color="yellow" @click="addNewClient" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>

  <div>
    <q-dialog v-model="showAddNewModelDialog" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">Добавление модели</div>
          <q-input v-model="newModel.name" label-color="yellow" color="yellow" label="Название модели" outlined class="q-mb-md" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Отмена" color="yellow" @click="closeDialog" />
          <q-btn flat label="Добавить" color="yellow" @click="addNewModel" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>

  <div>
    <q-dialog v-model="showAddProductFromStoreDialog" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">Добавление товара со склада</div>
          <q-select v-model="selectedProductCategory"
                    :options="productCategories"
                    option-label="name"
                    label="Выберите категорию"
                    @update:model-value="getProductsByCategory"
                    label-color="yellow"
          />
          <q-select v-model="selectedStoreProduct"
                    :options="storeProducts"
                    option-label="name"
                    label="выберите товар"
                    label-color="yellow"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="отмена" color="yellow" @click="showAddProductFromStoreDialog=false" />
          <q-btn flat label="добавить" color="yellow" @click="addProductFromStore" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>

  <DeleteConfirmPage ref="deleteConfirmPage" />

</template>

<style scoped>

.row {
  background-color: black;
}

.fab {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 1000; /* чтобы кнопка была поверх остальных элементов */
}

</style>
