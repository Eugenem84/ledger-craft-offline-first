<script setup>
import {onMounted, ref} from 'vue'
import {api} from "boot/axios.js";
import {useQuasar} from "quasar";
//import DeleteConfirmPage from "pages/DeleteConfirmPage.vue";
import NewClientDialogPage from "pages/dialogs/NewClientDialogPage.vue";
//import NewServiceDialogPage from "pages/dialogs/NewServiceDialogPage.vue";
//import NewServiceCategoryDialogPage from "pages/dialogs/NewServiceCategoryDialogPage.vue";
//import EditServiceCategoryDialogPage from "pages/dialogs/EditServiceCategoryDialogPage.vue";

import { useClientsStore } from 'stores/useClientsStore.js'
import { useSpecializationsStore } from 'stores/useSpecializationsStore.js';

const $q = useQuasar()

const clientsStore = useClientsStore()
//const specializationsStore = useSpecializationsStore()


const newClientDialog = ref(null)
const newServiceDialog = ref(null)
const newServiceCategoryDialog = ref(null)
const editServiceCategoryDialog = ref(null)

const confirmDialog = ref(null)

const tab = ref('services')

const editClientMode = ref(false)
const editServiceMode = ref(false)

const clients = ref([])
const services = ref([])
const serviceCategories = ref([])
const selectedClient = ref(null)
const selectedService = ref(null)
const selectedServiceCategory = ref(null)

//const selectedSpecializationId = specializationsStore.getSelectedSpecialization.id

const showClientsDetails = ref(false)
const showServiceDetails = ref(false)

onMounted(async () => {
  console.log('onMounted CatalogPage.vue')
  await clientsStore.loadClients()
  console.log('clientsStore.clients: ', clientsStore.clients)
  //getServiceCategories()
  //getServicesByCategory()
})

// function handleDelete(){
//   if (showClientsDetails.value) {
//     confirmDialog.value.open(
//       'Удаление клиента',
//       `Вы уверены что хотите удалить клиента "${selectedClient.value.name}" ?`,
//       () => {deleteClient()}
//     )
//   } else if (showServiceDetails.value){
//     confirmDialog.value.open(
//       'Удаление услуги',
//       `Вы уврены что хотите удалить сервис "${selectedService.value.service}"`,
//       () => {deleteService()}
//     )
//   }
// }

// const getClients = async () => {
//   try {
//     const response = await api.get(`/get_clients/${selectedSpecializationId}`)
//     clients.value = response.data
//     console.log('clients: ', clients.value)
//   } catch (err) {
//     $q.notify({
//       type: 'negative',
//       message: 'ошибка загрузки клиентов',
//       position: "top",
//       timeout: "1000"
//     })
//     console.error('ошибка получения клиентов: ', err)
//   }
// }

const getServiceCategories = async () => {
  const specializationStore = useSpecializationsStore()
  try {
    const specializationId = specializationStore.getSelectedSpecialization.id
    console.log('специализация: ', specializationId)
    const response = await api.get(`/get_categories/${specializationId}`)
    serviceCategories.value = response.data
    console.log('сервис категории: ', serviceCategories.value)
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'ошибка загрузки категорий работ',
      position: "top",
      timeout: "1000"
    })
    console.error('ошибка загрузки сервис категорий', err)
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

// const editClient = async () => {
//   try {
//     console.log('отправление запроса на редактирование')
//     const response = await api.post(`/edit_client`, {
//       id: selectedClient.value.id,
//       name: selectedClient.value.name,
//       phone: selectedClient.value.phone
//     })
//     console.log('response: ', response)
//     await getClients()
//     editClientMode.value = false
//     showClientsDetails.value = false
//     $q.notify({
//       type: 'positive',
//       message: 'клиент изменен',
//       position: "top",
//       timeout: "1000"
//     })
//   } catch (err){
//     $q.notify({
//       type: 'negative',
//       message: 'ошибка редактирования клиента',
//       position: "top",
//       timeout: "1000"
//     })
//     console.error(err)
//   }
// }

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

// const deleteClient = async () => {
//   try {
//     const response = await api.post(`/delete_client`, {
//       clientId: selectedClient.value.id
//     })
//     console.log('response', response)
//     await getClients()
//     editClientMode.value = false
//     showClientsDetails.value = false
//     $q.notify({
//       type: 'positive',
//       message: 'клиент удален',
//       position: "top",
//       timeout: "1000"
//     })
//   } catch (err){
//     $q.notify({
//       type: 'negative',
//       message: 'ошибка удаления клиента',
//       position: "top",
//       timeout: "1000"
//     })
//     console.error(err)
//   }
// }

// const deleteService = async () => {
//   try {
//     const response = await api.post(`/delete_service`, {
//       serviceId: selectedService.value.id
//     })
//     console.log('response', response)
//     await getServicesByCategory()
//     editServiceMode.value = false
//     showServiceDetails.value = false
//     $q.notify({
//       type: 'positive',
//       message: 'работа удалена',
//       position: "top",
//       timeout: "1000"
//     })
//   } catch (err){
//     $q.notify({
//       type: 'negative',
//       message: 'ошибка удаления работы',
//       position: "top",
//       timeout: "1000"
//     })
//     console.error(err)
//   }
// }

const openNewClientDialog = () => {
  newClientDialog.value.open()
}

const openNewServiceDialog = () => {
  newServiceDialog.value.open()
}

const openNewServiceCategoryDialog = () => {
  newServiceCategoryDialog.value.open()
}

const openEditServiceCategoryDialog = () => {
  editServiceCategoryDialog.value.open()
}

const handleClientAdded = (newClientData) => {
  clients.value.push(newClientData.client)
  console.log('newClientData', newClientData.client)
  console.log('clients', clients.value)
}

const handleServiceAdded = () => {
  getServicesByCategory()
  console.log('services: ', services)
}

const handleServiceCategoryAdded = () => {
  getServiceCategories()
}

const handleServiceCategoryEdited = () => {
  serviceCategories.value = null
  selectedServiceCategory.value = null
  getServiceCategories()
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

          <div class="row items-center" >

            <q-select v-model="selectedServiceCategory"
                      :options="serviceCategories"
                      option-label="category_name"
                      emit-value
                      map-options
                      label="категории работ"
                      dense
                      placeholder="нет категорий"
                      label-color="grey"
                      color="yellow"
                      class="col-9"
                      outlined
                      @update:model-value="getServicesByCategory"
            />

            <div class="col-auto self-end">
              <q-btn class="col-1 text-yellow" @click="openNewServiceCategoryDialog">+</q-btn>
            </div>
            <div class="col-auto self-end">
              <q-btn class="col-1 text-yellow" icon="edit" @click="openEditServiceCategoryDialog" />
            </div>

          </div>

          <q-list bordered separator >
            <q-item-label v-if="!services">Нет сервисов</q-item-label>
            <q-item v-for="service in services"
                    :key="service"
                    class="w-100 justify-between selectService"
                    style="width: 100%"
                    clickable
                    v-ripple
                    @click="openServiceDialog(service)"
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
                @click="console.log('не реализовано')"
                size="20px"
              />

            </q-item>
          </q-list>

          <!-- Плавающая кнопка добавления нового сервиса -->
          <q-btn
            icon="add"
            round
            class="fab bg-yellow text-black"
            @click="openNewServiceDialog"
            size="20px"
          />
        </q-tab-panel>

        <q-tab-panel name="clients" style="padding: 0">

          <!-- отображение списка клиентов -->
          <q-list bordered separator >

            <q-item-label v-if="!clients">Нет материалов</q-item-label>
            <q-item v-for="client in clientsStore.clients"
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

    <q-dialog v-model="showServiceDetails" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">сервис</div>
          <q-input :disable="!editServiceMode"
                   v-model="selectedService.service"
                   label-color="yellow"
                   color="yellow"
                   label="название сервиса"
                   outlined
                   class="q-mb-md"
          />
          <q-input :disable="!editServiceMode"
                   v-model="selectedService.price"
                   label-color="yellow"
                   color="yellow"
                   label="цена"
                   outlined class="q-mb-md"
          />

        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-if="editServiceMode" flat label="отмена" color="yellow" @click="editServiceMode = false" />
          <q-btn v-if="!editServiceMode" flat label="закрыть" color="yellow" @click="showServiceDetails = false" />
          <q-btn v-if="!editServiceMode" flat label="редактировать" color="yellow" @click="editServiceMode = true" />
          <q-btn v-if="editServiceMode" flat label="сохранить" color="yellow" @click="editService" />
          <q-btn v-if="!editServiceMode" flat label="удалить" color="yellow" @click="handleDelete" />
        </q-card-actions>
      </q-card>

    </q-dialog>

    <DeleteConfirmPage ref="confirmDialog"/>

    <NewClientDialogPage ref="newClientDialog" @client-added="handleClientAdded" />
    <NewServiceDialogPage ref="newServiceDialog" @service-added="handleServiceAdded" :data="selectedServiceCategory" />
    <NewServiceCategoryDialogPage ref="newServiceCategoryDialog" @service_category-added="handleServiceCategoryAdded" />
    <EditServiceCategoryDialogPage ref="editServiceCategoryDialog"
                                   @service_category-edited="handleServiceCategoryEdited"
                                   :data="selectedServiceCategory"
    />
  </div>

</template>

<style scoped></style>
