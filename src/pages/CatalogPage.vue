<script setup>
import {onMounted, ref} from 'vue'
import {api} from "boot/axios.js";
import {useQuasar} from "quasar";
import DeleteConfirmPage from "pages/dialogs/DeleteConfirmPage.vue";
import NewClientDialogPage from "pages/dialogs/NewClientDialogPage.vue";
import NewServiceCategoryDialogPage from "pages/dialogs/NewServiceCategoryDialogPage.vue";

import { useClientsStore } from 'stores/useClientsStore.js'
import { useCategoriesStore } from 'stores/useCategoriesStore.js'

const $q = useQuasar()

const clientsStore = useClientsStore()
const categoriesStore = useCategoriesStore()

const newClientDialog = ref(null)
const newServiceDialog = ref(null)
const newServiceCategoryDialog = ref(null)

const confirmDialog = ref(null)

const tab = ref('services')

const editClientMode = ref(false)
const editServiceMode = ref(false)
const editCategoryMode = ref(false)


const services = ref([])
const selectedClient = ref(null)
const selectedService = ref(null)
const selectedServiceCategory = ref(null)

const showClientsDetails = ref(false)
const showServiceDetails = ref(false)
const showCategoryDetails = ref(false)


onMounted(async () => {
  console.log('onMounted CatalogPage.vue')
  await clientsStore.load()
  await categoriesStore.load()
})

function handleDelete(){
  if (showClientsDetails.value) {
    confirmDialog.value.open(
      'Удаление клиента',
      `Вы уверены что хотите удалить клиента "${selectedClient.value.name}" ?`,
      () => {deleteClient()}
    )
  } else if (showServiceDetails.value){
    confirmDialog.value.open(
      'Удаление услуги',
      `Вы уврены что хотите удалить сервис "${selectedService.value.service}"`,
      () => {deleteService()}
    )
  }
}

const deleteClient = async () => {
  try {
    await clientsStore.remove(selectedClient.value.id)
    showClientsDetails.value = false
    $q.notify({
      type: 'positive',
      message: 'клиент удален',
      position: "top",
      timeout: "1000"
    })
  } catch (err){
    $q.notify({
      type: 'negative',
      message: 'ошибка удаления клиента',
      position: "top",
      timeout: "1000"
    })
    console.error(err)
  }
}

const deleteCategory = async () => {
  try {
    await categoriesStore.remove(selectedServiceCategory.value.id)
    showCategoryDetails.value = false
    $q.notify({
      type: 'positive',
      message: 'Категория удалена',
      position: "top",
      timeout: "1000"
    })
  } catch (err){
    $q.notify({
      type: 'negative',
      message: 'ошибка удаления категории',
      position: "top",
      timeout: "1000"
    })
    console.error(err)
  }
}

const getServicesByCategory = async (categoryId) => {
  console.log('подгружаем сервисы категории: ', categoryId)
  console.log('selectedServiceCategory: ', selectedServiceCategory.value)
  try {
    const response = await api.get(`/get_service/${selectedServiceCategory.value.id}`)
    services.value = response.data
    console.log('подгружены сервисы категории: ', services.value)
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка загрузки работ',
      position: "top",
      timeout: "1000"
    })
    console.error('ошибка загрузке сервисов данной категории: ', categoryId , err )
  }
}

const openClientDialog = (client) => {
  selectedClient.value = {...client}
  showClientsDetails.value = true
}

const openServiceDialog = (service) => {
  console.log('selectedService: ', selectedService.value)
  selectedService.value = {...service}
  showServiceDetails.value = true
}

const openCategoryDialog = (category) => {
  selectedServiceCategory.value = {...category}
  showCategoryDetails.value = true
}

const editClient = async () => {
  try {
    await clientsStore.update(selectedClient.value.id, {
      name: selectedClient.value.name,
      phone: selectedClient.value.phone
    })
    editClientMode.value = false
    showClientsDetails.value = false
    $q.notify({
      type: 'positive',
      message: 'клиент изменен',
      position: "top",
      timeout: "1000"
    })
  } catch (err){
    $q.notify({
      type: 'negative',
      message: 'ошибка редактирования клиента',
      position: "top",
      timeout: "1000"
    })
    console.error(err)
  }
}

const editCategory = async () => {
  try {
    await categoriesStore.update(selectedServiceCategory.value.id, {
      category_name: selectedServiceCategory.value.category_name,
    })
    editCategoryMode.value = false
    showCategoryDetails.value = false
    $q.notify({
      type: 'positive',
      message: 'Категория изменена',
      position: "top",
      timeout: "1000"
    })
  } catch (err){
    $q.notify({
      type: 'negative',
      message: 'ошибка редактирования категории',
      position: "top",
      timeout: "1000"
    })
    console.error(err)
  }
}

const editService = async () => {
  try {
    console.log('отправление запроса на редактирование')
    console.log('selectedService',selectedService.value)
    const response = await api.post(`/edit_service`, {
      id: selectedService.value.id,
      service: selectedService.value.service,
      price: selectedService.value.price
    })
    console.log('response: ', response)
    console.log('selectedServiceCategory', selectedServiceCategory.value)
    await getServicesByCategory(selectedServiceCategory.value)
    editServiceMode.value = false
    showServiceDetails.value = false
    $q.notify({
      type: 'positive',
      message: 'работа изменена',
      position: "top",
      timeout: "1000"
    })
  } catch (err){
    $q.notify({
      type: 'negative',
      message: 'ошибка изменения сервиса',
      position: "top",
      timeout: "1000"
    })
    console.error(err)
  }
}

const openNewClientDialog = () => {
  newClientDialog.value.open()
}

const openNewServiceDialog = () => {
  newServiceDialog.value.open()
}

const openNewServiceCategoryDialog = () => {
  newServiceCategoryDialog.value.open()
}

</script>

<template>
  <q-page class="q-pa-none">
    <q-card>
      <q-tabs
        v-model="tab"
        dense
        class="text-grey sticky-tabs"
        active-color="yellow"
        indicator-color="yellow"
        align="justify"
        narrow-indicator
      >
        <q-tab name="services" label="работы" />
        <q-tab name="clients" label="клиенты" />
      </q-tabs>

      <q-separator/>

      <q-tab-panels v-model="tab" animated>

        <q-tab-panel name="services" style="padding: 0">

          <q-list bordered separator >
            <q-item-label v-if="!categoriesStore.items">Нет категорий</q-item-label>
            <q-item v-for="category in categoriesStore.items"
                    :key="category.id"
                    class="w-100 justify-between selectService"
                    style="width: 100%"
                    clickable
                    v-ripple
                    @click="openCategoryDialog(category)"
            >

              <q-item-section >
                <q-item-label class="text-left">
                  {{ category.category_name }}
                </q-item-label>
              </q-item-section>

            </q-item>
          </q-list>

          <!-- Плавающая кнопка добавления нового сервиса -->
          <q-btn
            icon="add"
            round
            class="fab bg-yellow text-black"
            @click="openNewServiceCategoryDialog"
            size="20px"
          />
        </q-tab-panel>

        <q-tab-panel name="clients" style="padding: 0">

          <!-- отображение списка клиентов -->
          <q-list bordered separator >

            <q-item-label v-if="!clientsStore.items">Нет клиентов</q-item-label>
            <q-item v-for="client in clientsStore.items"
                    :key="client.id"
                    class="w-100 justify-between row"
                    style="width: 100%"
                    clickable
                    @click="openClientDialog(client)"
            >

              <q-item-section class="col-auto">
                <q-item-label class="text-left">
                  {{ client.name }}
                </q-item-label>
              </q-item-section>


              <q-item-section class="col-auto">
                <q-item-label class="text-right">
                  {{ client.phone }}
                </q-item-label>
              </q-item-section>

            </q-item>

          </q-list>

          <!-- Плавающая кнопка добавления нового клиента -->
          <q-btn
            icon="add"
            round
            class="fab bg-yellow text-black"
            @click="openNewClientDialog"
            size="20px"
          />

        </q-tab-panel>

      </q-tab-panels>

    </q-card>

  </q-page>

  <div>
    <q-dialog v-model="showClientsDetails" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">клиент</div>
          <q-input :disable="!editClientMode"
                   v-model="selectedClient.name"
                   label-color="yellow"
                   color="yellow"
                   label="Имя клиента"
                   outlined
                   class="q-mb-md"
          />
          <q-input :disable="!editClientMode"
                   v-model="selectedClient.phone"
                   label-color="yellow"
                   color="yellow"
                   label="телефон"
                   outlined class="q-mb-md"
          />

        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-if="editClientMode" flat label="отмена" color="yellow" @click="editClientMode = false" />
          <q-btn v-if="!editClientMode" flat label="закрыть" color="yellow" @click="showClientsDetails = false" />
          <q-btn v-if="!editClientMode" flat label="редактировать" color="yellow" @click="editClientMode = true" />
          <q-btn v-if="editClientMode" flat label="сохранить" color="yellow" @click="editClient" />
          <q-btn v-if="!editClientMode" flat label="удалить" color="yellow" @click="handleDelete" />
        </q-card-actions>
      </q-card>

    </q-dialog>

    <q-dialog v-model="showCategoryDetails" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">Категория</div>
          <q-input :disable="!editCategoryMode"
                   v-model="selectedServiceCategory.category_name"
                   label-color="yellow"
                   color="yellow"
                   label="Название категории"
                   outlined
                   class="q-mb-md"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-if="editCategoryMode" flat label="отмена" color="yellow" @click="editCategoryMode = false" />
          <q-btn v-if="!editCategoryMode" flat label="закрыть" color="yellow" @click="showCategoryDetails = false" />
          <q-btn v-if="!editCategoryMode" flat label="редактировать" color="yellow" @click="editCategoryMode = true" />
          <q-btn v-if="editCategoryMode" flat label="сохранить" color="yellow" @click="editCategory" />
          <q-btn v-if="!editCategoryMode" flat label="удалить" color="yellow" @click="deleteCategory" />
        </q-card-actions>
      </q-card>

    </q-dialog>

    <DeleteConfirmPage ref="confirmDialog"/>

    <NewClientDialogPage ref="newClientDialog" />
    <NewServiceCategoryDialogPage ref="newServiceCategoryDialog" />
  </div>

</template>

<style scoped></style>
