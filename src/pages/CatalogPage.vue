<script setup>
import {onMounted, ref, watch} from 'vue'
import {useQuasar} from "quasar";
import DeleteConfirmPage from "pages/dialogs/DeleteConfirmPage.vue";
import NewClientDialogPage from "pages/dialogs/NewClientDialogPage.vue";
import NewServiceDialogPage from "pages/dialogs/NewServiceDialogPage.vue";
import NewServiceCategoryDialogPage from "pages/dialogs/NewServiceCategoryDialogPage.vue";

import { useClientsStore } from 'stores/useClientsStore.js'
import { useCategoriesStore } from 'stores/useCategoriesStore.js'
import { useServicesStore } from 'stores/useServicesStore.js'

const $q = useQuasar()

const clientsStore = useClientsStore()
const categoriesStore = useCategoriesStore()
const servicesStore = useServicesStore()

const newClientDialog = ref(null)
const newServiceDialog = ref(null)
const newServiceCategoryDialog = ref(null)

const confirmDialog = ref(null)

const tab = ref('services')

const editClientMode = ref(false)
const editServiceMode = ref(false)
const editCategoryMode = ref(false)

const selectedClient = ref(null)
const selectedService = ref(null)
const selectedServiceCategory = ref(null)

const showClientsDetails = ref(false)
const showServiceDetails = ref(false)
const showCategoryDetails = ref(false)

onMounted(async () => {
  await clientsStore.load()
  await categoriesStore.load()
})

watch(selectedServiceCategory, (newCategory) => {
  servicesStore.load(newCategory?.id)
});

function handleDelete(){
  if (showClientsDetails.value) {
    confirmDialog.value.open('Удаление клиента', `Вы уверены что хотите удалить клиента "${selectedClient.value.name}" ?`, deleteClient)
  } else if (showServiceDetails.value){
    confirmDialog.value.open('Удаление услуги', `Вы уверены что хотите удалить сервис "${selectedService.value.service}"`, deleteService)
  } else if (showCategoryDetails.value) {
    confirmDialog.value.open('Удаление категории', `Вы уверены что хотите удалить категорию "${selectedServiceCategory.value.category_name}" ?`, deleteCategory)
  }
}

const deleteClient = async () => {
  try {
    await clientsStore.remove(selectedClient.value.id)
    showClientsDetails.value = false
    $q.notify({ type: 'positive', message: 'Клиент удален', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка удаления клиента', position: "top", timeout: 1000 })
    console.error(err)
  }
}

const deleteCategory = async () => {
  try {
    await categoriesStore.remove(selectedServiceCategory.value.id)
    showCategoryDetails.value = false
    selectedServiceCategory.value = null
    $q.notify({ type: 'positive', message: 'Категория удалена', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка удаления категории', position: "top", timeout: 1000 })
    console.error(err)
  }
}

const deleteService = async () => {
  try {
    await servicesStore.remove(selectedService.value.id)
    showServiceDetails.value = false
    $q.notify({ type: 'positive', message: 'Услуга удалена', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка удаления услуги', position: "top", timeout: 1000 })
    console.error(err)
  }
}

const openClientDialog = (client) => {
  selectedClient.value = {...client}
  showClientsDetails.value = true
}

const openServiceDialog = (service) => {
  selectedService.value = {...service}
  showServiceDetails.value = true
}

const openCategoryDialog = () => {
  if (selectedServiceCategory.value) {
    showCategoryDetails.value = true
  } else {
    $q.notify({ type: 'info', message: 'Сначала выберите категорию', position: "top", timeout: 1000 })
  }
}

const editClient = async () => {
  try {
    await clientsStore.update(selectedClient.value.id, { name: selectedClient.value.name, phone: selectedClient.value.phone })
    editClientMode.value = false
    showClientsDetails.value = false
    $q.notify({ type: 'positive', message: 'Клиент изменен', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка редактирования клиента', position: "top", timeout: 1000 })
    console.error(err)
  }
}

const editCategory = async () => {
  try {
    await categoriesStore.update(selectedServiceCategory.value.id, { category_name: selectedServiceCategory.value.category_name })
    editCategoryMode.value = false
    showCategoryDetails.value = false
    $q.notify({ type: 'positive', message: 'Категория изменена', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка редактирования категории', position: "top", timeout: 1000 })
    console.error(err)
  }
}

const editService = async () => {
  try {
    await servicesStore.update(selectedService.value.id, { service: selectedService.value.service, price: selectedService.value.price })
    editServiceMode.value = false
    showServiceDetails.value = false
    $q.notify({ type: 'positive', message: 'Услуга изменена', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка изменения услуги', position: "top", timeout: 1000 })
    console.error(err)
  }
}

const openNewClientDialog = () => {
  newClientDialog.value.open()
}

const openNewServiceDialog = () => {
  if (selectedServiceCategory.value) {
    newServiceDialog.value.open(selectedServiceCategory.value)
  } else {
    $q.notify({ type: 'info', message: 'Сначала выберите категорию', position: "top", timeout: 1000 })
  }
}

const openNewServiceCategoryDialog = () => {
  newServiceCategoryDialog.value.open()
}

</script>

<template>
  <q-page class="q-pa-none">
    <q-card>
      <q-tabs v-model="tab" dense class="text-grey sticky-tabs" active-color="yellow" indicator-color="yellow" align="justify" narrow-indicator>
        <q-tab name="services" label="работы" />
        <q-tab name="clients" label="клиенты" />
      </q-tabs>

      <q-separator/>

      <q-tab-panels v-model="tab" animated>
        <q-tab-panel name="services" style="padding: 0">
          <div class="row items-center q-pa-sm" >
            <q-select v-model="selectedServiceCategory" :options="categoriesStore.items" option-label="category_name" label="Категории работ" dense clearable label-color="grey" color="yellow" class="col-9" outlined />
            <div class="col-auto self-end">
              <q-btn class="col-1 text-yellow" icon="add" @click="openNewServiceCategoryDialog" />
            </div>
            <div class="col-auto self-end">
              <q-btn class="col-1 text-yellow" icon="edit" @click="openCategoryDialog" />
            </div>
          </div>

          <q-list bordered separator >
            <q-item-label v-if="!servicesStore.items.length && selectedServiceCategory" header>Нет услуг в этой категории</q-item-label>
            <q-item-label v-if="!selectedServiceCategory" header>Выберите категорию для просмотра услуг</q-item-label>
            <q-item v-for="service in servicesStore.items" :key="service.id" class="w-100 justify-between" clickable v-ripple @click="openServiceDialog(service)">
              <q-item-section>
                <q-item-label class="text-left">{{ service.service }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-item-label class="text-right">{{ service.price }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>

          <q-btn icon="add" round class="fab bg-yellow text-black" @click="openNewServiceDialog" size="20px" />
        </q-tab-panel>

        <q-tab-panel name="clients" style="padding: 0">
          <q-list bordered separator >
            <q-item-label v-if="!clientsStore.items">Нет клиентов</q-item-label>
            <q-item v-for="client in clientsStore.items" :key="client.id" class="w-100 justify-between row" style="width: 100%" clickable @click="openClientDialog(client)">
              <q-item-section class="col-auto">
                <q-item-label class="text-left">{{ client.name }}</q-item-label>
              </q-item-section>
              <q-item-section class="col-auto">
                <q-item-label class="text-right">{{ client.phone }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
          <q-btn icon="add" round class="fab bg-yellow text-black" @click="openNewClientDialog" size="20px" />
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-page>

  <div>
    <q-dialog v-model="showClientsDetails" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">Клиент</div>
          <q-input :disable="!editClientMode" v-model="selectedClient.name" label-color="yellow" color="yellow" label="Имя клиента" outlined class="q-mb-md" />
          <q-input :disable="!editClientMode" v-model="selectedClient.phone" label-color="yellow" color="yellow" label="Телефон" outlined class="q-mb-md" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-if="editClientMode" flat label="Отмена" color="yellow" @click="editClientMode = false" />
          <q-btn v-if="!editClientMode" flat label="Закрыть" color="yellow" @click="showClientsDetails = false" />
          <q-btn v-if="!editClientMode" flat label="Редактировать" color="yellow" @click="editClientMode = true" />
          <q-btn v-if="editClientMode" flat label="Сохранить" color="yellow" @click="editClient" />
          <q-btn v-if="!editClientMode" flat label="Удалить" color="yellow" @click="handleDelete" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showCategoryDetails" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">Категория</div>
          <q-input :disable="!editCategoryMode" v-model="selectedServiceCategory.category_name" label-color="yellow" color="yellow" label="Название категории" outlined class="q-mb-md" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-if="editCategoryMode" flat label="Отмена" color="yellow" @click="editCategoryMode = false" />
          <q-btn v-if="!editCategoryMode" flat label="Закрыть" color="yellow" @click="showCategoryDetails = false" />
          <q-btn v-if="!editCategoryMode" flat label="Редактировать" color="yellow" @click="editCategoryMode = true" />
          <q-btn v-if="editCategoryMode" flat label="Сохранить" color="yellow" @click="editCategory" />
          <q-btn v-if="!editCategoryMode" flat label="Удалить" color="yellow" @click="handleDelete" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showServiceDetails" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">Услуга</div>
          <q-input :disable="!editServiceMode" v-model="selectedService.service" label-color="yellow" color="yellow" label="Название услуги" outlined class="q-mb-md" />
          <q-input :disable="!editServiceMode" v-model="selectedService.price" label-color="yellow" color="yellow" label="Цена" outlined class="q-mb-md" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-if="editServiceMode" flat label="Отмена" color="yellow" @click="editServiceMode = false" />
          <q-btn v-if="!editServiceMode" flat label="Закрыть" color="yellow" @click="showServiceDetails = false" />
          <q-btn v-if="!editServiceMode" flat label="Редактировать" color="yellow" @click="editServiceMode = true" />
          <q-btn v-if="editServiceMode" flat label="Сохранить" color="yellow" @click="editService" />
          <q-btn v-if="!editServiceMode" flat label="Удалить" color="yellow" @click="handleDelete" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <DeleteConfirmPage ref="confirmDialog"/>
    <NewClientDialogPage ref="newClientDialog" />
    <NewServiceDialogPage ref="newServiceDialog" />
    <NewServiceCategoryDialogPage ref="newServiceCategoryDialog" />
  </div>
</template>

<style scoped>
.fab {
  position: absolute;
  bottom: 16px;
  right: 16px;
}
</style>
