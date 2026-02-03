<script setup>
import {ref, computed} from 'vue'
import {api} from 'boot/axios.js'
import {useSpecializationsStore} from "stores/specializations.js";
import DeleteConfirmPage from "pages/DeleteConfirmPage.vue";

const deleteConfirmPage = ref(null)

const specializationStore = useSpecializationsStore()

const emit = defineEmits(['product-saved'])

const currentCategory = ref(null)

const showDialog = ref(false)

const name = ref(null)

const editMode = computed(() => !!currentCategory.value)

const open = (category) => {
  currentCategory.value = category ? {...category} : null
  name.value = category?.name || ''
  showDialog.value = true
}

const saveProductCategory = async () => {
  try {
    //console.log('currentCategoryId: ', currentCategory.value.id)
    if (editMode.value){
      console.log('редактирование продукта не реализовано')
      await api.post(`/edit_product_category`, {
        id: currentCategory.value.id,
        name: name.value,
        specialization_id: specializationStore.getSelectedSpecialization.id
      })
      showDialog.value = false
      emit('product-category-saved')
    } else {
      console.log('создаем новый продукт')
      await api.post(`/add_product_category`, {
        name: name.value,
        specialization_id: specializationStore.getSelectedSpecialization.id
      })
      showDialog.value = false
      emit('product-category-saved')
    }
  } catch (err){
    console.error(err)
    currentCategory.value = null
    close()
  }
}

const deleteCategory = async () => {
  if (!currentCategory.value) return

  // Показываем диалог подтверждения
  deleteConfirmPage.value.open(
    'Подтвердите удаление',
    `Вы уверены, что хотите удалить категорию "${currentCategory.value.name}"?`,
    async () => {
      try {
        await api.post(`/delete_product_category`, {
          productCategoryId: currentCategory.value.id
        });
        emit('product-category-saved'); // Обновляем список
        showDialog.value = false; // Закрываем диалог редактирования
      } catch (err) {
        console.error("Ошибка удаления категории", err);
      }
    }
  );
};

defineExpose({open})

</script>

<template>

  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 400px">
      <q-card-section class="row items-center">
        <span class="q-ml-sm text-h6">
          {{ editMode ? 'Редактирование' : 'Новая категория'}}
        </span>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div class="q-gutter-y-md">
          <q-input v-model="name"
                   outlined
                   label="название категории"
                   placeholder="Введите название"
                   class="q-mb-md"
          />
        </div>
      </q-card-section>

      <q-card-actions align="right">

        <q-btn flat
               label="Отмена"
               color="yellow"
               v-close-popup
        />

        <q-btn label="Сохранить"
               text-color="yellow"
               @click="saveProductCategory"
        />

        <q-btn label="Удалить"
               flat
               color="yellow"
               @click="deleteCategory"
               v-if="currentCategory"
        />

      </q-card-actions>


    </q-card>
  </q-dialog>

  <DeleteConfirmPage ref="deleteConfirmPage" />

</template>

<style scoped>

</style>
