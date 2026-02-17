<script setup>
import {ref, computed, onMounted} from 'vue'
import {useOrdersStore} from "stores/useOrdersStore.js";
import {useSpecializationsStore} from "stores/useSpecializationsStore.js";
import {useRouter} from "vue-router";
import DeleteConfirmPage from "pages/dialogs/DeleteConfirmPage.vue";
import {useQuasar} from "quasar";

import * as orderServiceRepo from 'src/repositories/orderServiceRepo.js'
import * as orderMaterialRepo from 'src/repositories/orderMaterialRepo.js'
import * as orderProductRepo from 'src/repositories/orderProductRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'
// import * as modelsRepo from 'src/repositories/modelsRepo.js' // TODO: создать репозиторий для моделей

const deleteConfirmPage = ref(null)
const isLoading = ref(false)
const $q = useQuasar()
const router = useRouter()
const specializationsStore = useSpecializationsStore()
const selectedSpecializationId = specializationsStore.selectedSpecialization?.id
const ordersStore = useOrdersStore()

const order = ref(null)
const services = ref([])
const materials = ref([])
const products = ref([])

const orderStatus = ref('waiting');
const paid = ref(false)

const storeProducts = ref([])
const productCategories = ref([])
const selectedStoreProduct = ref(null)
const selectedProductCategory = ref(null)

const client = ref({ id: null, name: 'выберите клиента', phone: '' })
const comments = ref(null)

const clients = ref([])
const filteredClients = ref([])
const models = ref([])
const model = ref({ id: null, name: null })

const selectedServiceCategory = ref(null)
const serviceCategories = ref([])
const servicesByCategory = ref([])

const tab = ref('all')
const editMode = ref(false)
const isNewOrder = computed(() => !order.value?.id)

const showAddNewMaterialDialog = ref(false)
const showAddNewServiceDialog = ref(false)
const showAddNewClientDialog = ref(false)
const showAddNewModelDialog = ref(false)
const showAddProductFromStoreDialog = ref(false)

const newMaterial = ref({ name: '', price: 0, amount: 0 })
const newService = ref({ name: '', price: 0 })
const newClient = ref({ name: '', phone: '' })
const newModel = ref({ name: '' })

const filterClients = (val, update) => {
  if (val === '') {
    update(() => { filteredClients.value = [...clients.value] })
    return
  }
  update(() => {
    filteredClients.value = clients.value.filter(c =>
      c.name.toLowerCase().includes(val.toLowerCase()) ||
      (c.phone && c.phone.toString().toLowerCase().includes(val.toLowerCase()))
    )
  })
}

onMounted(async () => {
  const selectedOrder = ordersStore.getSelectedOrder;
  if (selectedOrder) {
    order.value = { ...selectedOrder };
    paid.value = !!order.value.paid;
    orderStatus.value = order.value.status;
    comments.value = order.value.comments;

    client.value = {
      id: order.value.client_id,
      name: order.value.client_name,
      phone: order.value.client_phone
    };

    // TODO: Загрузка модели
    // if (order.value.model_id) {
    //   const m = await modelsRepo.getById(order.value.model_id);
    //   if (m) {
    //     model.value = m;
    //   }
    // }

    services.value = await orderServiceRepo.getByOrderId(order.value.id)
    materials.value = await orderMaterialRepo.getByOrderId(order.value.id)
    products.value = await orderProductRepo.getByOrderId(order.value.id)

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
  }

  clients.value = await clientsRepo.getAll()
  filteredClients.value = [...clients.value]
  // models.value = await modelsRepo.getAll() // TODO:
  serviceCategories.value = await categoriesRepo.getBySpecializationId(selectedSpecializationId)
  productCategories.value = await productCategoriesRepo.getBySpecializationId(selectedSpecializationId)

  if (serviceCategories.value.length > 0) {
    selectedServiceCategory.value = serviceCategories.value[0].id
    await getServicesByCategory(selectedServiceCategory.value)
  }
});

const getServicesByCategory = async (categoryId) => {
  try {
    servicesByCategory.value = await servicesRepo.getByCategoryId(categoryId)
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Ошибка загрузки работ' })
    console.error(err)
  }
}

const getProductsByCategory = async (productCategoryId) => {
  selectedStoreProduct.value = null
  try {
    storeProducts.value = await productsRepo.getByCategoryId(productCategoryId)
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка загрузки товаров' })
    console.error(err)
  }
}

const switсhPaidStatus = async () => {
  paid.value = !paid.value
  if (!isNewOrder.value) {
    await ordersStore.update(order.value.id, { paid: paid.value })
  }
}

const updateOrderStatus = async () => {
  if (!isNewOrder.value) {
    await ordersStore.update(order.value.id, { status: orderStatus.value })
  }
}

const deleteOrder = async () => {
  deleteConfirmPage.value.open(
    'Подтвердите удаление',
    `Вы уверены, что хотите удалить ордер №"${order.value.server_id || order.value.id}"?`,
    async () => {
      try {
        await ordersStore.remove(order.value.id)
        $q.notify({ type: 'positive', message: `Ордер удален` })
        router.back()
      } catch (err) {
        $q.notify({ type: 'negative', message: 'Ошибка удаления ордера' })
        console.error(err);
      }
    }
  );
}

const activeEditMode = () => {
  editMode.value = true
}

const saveOrder = async () => {
  try {
    if (isNewOrder.value) {
      await createOrder()
    } else {
      await updateOrder()
    }
    $q.notify({ type: 'positive', message: 'Ордер сохранен' })
    router.back()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Ошибка сохранения ордера' })
    console.error(err)
  }
}

const createOrder = async () => {
  const newOrderData = {
    specialization_id: selectedSpecializationId,
    client_id: client.value?.id,
    model_id: model.value?.id,
    total_amount: totalSumProducts.value + totalSumMaterials.value + totalSumServices.value,
    comments: comments.value,
    paid: paid.value,
    status: orderStatus.value,
  };
  const newOrderId = await ordersStore.add(newOrderData);

  // Сохраняем связанные сущности
  for (const service of services.value) {
    await orderServiceRepo.add(newOrderId, service.id);
  }
  for (const material of materials.value) {
    await orderMaterialRepo.add(newOrderId, material.id, material.amount, material.price);
  }
  for (const product of products.value) {
    await orderProductRepo.add(newOrderId, product.id, product.amount, product.price);
  }
}

const updateOrder = async () => {
  const updatedOrderData = {
    client_id: client.value?.id,
    model_id: model.value?.id,
    total_amount: totalSumProducts.value + totalSumMaterials.value + totalSumServices.value,
    comments: comments.value,
    paid: paid.value,
    status: orderStatus.value,
  };
  await ordersStore.update(order.value.id, updatedOrderData);

  // Обновляем связанные сущности (простой вариант: удалить все и добавить заново)
  await orderServiceRepo.removeByOrderId(order.value.id);
  for (const service of services.value) {
    await orderServiceRepo.add(order.value.id, service.id);
  }

  await orderMaterialRepo.removeByOrderId(order.value.id);
  for (const material of materials.value) {
    await orderMaterialRepo.add(order.value.id, material.id, material.amount, material.price);
  }

  await orderProductRepo.removeByOrderId(order.value.id);
  for (const product of products.value) {
    await orderProductRepo.add(order.value.id, product.id, product.amount, product.price);
  }
}

const totalSumServices = computed(() => services.value.reduce((sum, service) => sum + Number(service.price || 0), 0));
const totalSumMaterials = computed(() => materials.value.reduce((sum, material) => sum + Number(material.price || 0) * Number(material.amount || 0), 0));
const totalSumProducts = computed(() => products.value.reduce((sum, product) => sum + Number(product.price || 0) * Number(product.amount || 0), 0));

const computedToggleColor = computed(() => {
  switch (orderStatus.value) {
    case 'waiting': return 'orange'
    case 'process': return 'red'
    case 'done': return 'green'
    default: return 'yellow'
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
    const newServiceData = {
      service: newService.value.name,
      price: newService.value.price,
      category_id: selectedServiceCategory.value
    }
    await servicesRepo.save(newServiceData)
    $q.notify({ type: 'positive', message: 'Работа добавлена' })
    await getServicesByCategory(selectedServiceCategory.value)
    closeDialog()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Ошибка добавления работы' })
    console.error(err)
  }
}

const addMaterial = () => {
  if (newMaterial.value.name.trim() && newMaterial.value.price > 0 && newMaterial.value.amount > 0) {
    materials.value.push({ ...newMaterial.value, id: crypto.randomUUID() }); // Добавляем временный ID
    newMaterial.value = { name: '', price: 0, amount: 0 };
    showAddNewMaterialDialog.value = false;
  } else {
    $q.notify({ type: 'warning', message: 'Введите корректные данные' })
  }
}

const addNewClient = async () => {
  try {
    const newClientId = await clientsRepo.save({
      name: newClient.value.name,
      phone: newClient.value.phone,
      specialization_id: selectedSpecializationId
    })
    const newClientData = await clientsRepo.getById(newClientId)
    clients.value.push(newClientData)
    client.value = newClientData
    $q.notify({ type: 'positive', message: 'Клиент добавлен' })
    closeDialog()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Ошибка добавления клиента' })
    console.error(err)
  }
}

const addNewModel = async () => {
  // try {
  //   const newModelId = await modelsRepo.save({
  //     name: newModel.value.name,
  //     specialization_id: selectedSpecializationId
  //   })
  //   const newModelData = await modelsRepo.getById(newModelId)
  //   models.value.push(newModelData)
  //   model.value = newModelData
  //   $q.notify({ type: 'positive', message: 'Модель добавлена' })
  //   closeDialog()
  // } catch (err){
  //   $q.notify({ type: 'negative', message: 'Ошибка добавления модели' })
  //   console.error(err)
  // }
}

const addProductFromStore = () => {
  if (selectedStoreProduct.value) {
    const productToAdd = {
      ...selectedStoreProduct.value,
      product_id: selectedStoreProduct.value.id,
      price: selectedStoreProduct.value.base_sale_price,
      amount: 1
    }
    products.value.push(productToAdd)
    showAddProductFromStoreDialog.value = false
  }
}

const deleteMaterialFromOrder = (index) => {
  materials.value.splice(index, 1)
}

const clearOrder = () => {
  client.value = { id: null, name: 'выберите клиента', phone: '' }
  model.value = { id: null, name: null }
  services.value = []
  materials.value = []
  products.value = []
  comments.value = ''
}

const generateAndCopyLink = async () => {
  // Эта функция требует онлайн-взаимодействия, оставляем как есть,
  // но в идеале нужно проверять статус сети
  if (!order.value?.server_id) {
    $q.notify({ type: 'warning', message: 'Сначала нужно синхронизировать ордер' })
    return;
  }
  isLoading.value = true
  try {
    const { data } = await api.post(`/order-report/${order.value.server_id}/share-link`)
    await navigator.clipboard.writeText(data.url)
    $q.notify({ type: 'positive', message: 'Ссылка скопирована' })
  } catch (error) {
    $q.notify({ type: 'negative', message: 'Ошибка копирования ссылки' })
    console.error('Ошибка:', error)
  } finally {
    isLoading.value = false
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
        {{order.server_id || order.id}}
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
