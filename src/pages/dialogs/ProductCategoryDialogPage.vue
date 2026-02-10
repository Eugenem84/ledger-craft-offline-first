<script setup>
import { ref, computed } from 'vue'
import { useProductCategoriesStore } from 'stores/useProductCategoriesStore.js'
import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'

const productCategoriesStore = useProductCategoriesStore()

const deleteConfirmPage = ref(null)
const emit = defineEmits(['product-category-saved'])

const currentCategory = ref(null)
const showDialog = ref(false)
const name = ref('')
const specializationId = ref(null)

const isEditing = computed(() => !!currentCategory.value?.id)

const open = (category, specId) => {
  currentCategory.value = category ? { ...category } : {}
  name.value = category?.name || ''
  specializationId.value = category?.specialization_id || specId
  showDialog.value = true
}

const saveProductCategory = async () => {
  try {
    const categoryData = {
      id: currentCategory.value.id,
      name: name.value,
      specialization_id: specializationId.value,
    }

    if (isEditing.value) {
      await productCategoriesStore.update(categoryData.id, categoryData)
    } else {
      await productCategoriesStore.add(categoryData)
    }

    emit('product-category-saved')
    showDialog.value = false
  } catch (err) {
    console.error('Ошибка сохранения категории:', err)
  }
}

const deleteCategory = async () => {
  if (!currentCategory.value?.id) return

  deleteConfirmPage.value.open(
    'Подтвердите удаление',
    `Вы уверены, что хотите удалить категорию "${currentCategory.value.name}"?`,
    async () => {
      try {
        await productCategoriesStore.remove(currentCategory.value.id)
        emit('product-category-saved')
        showDialog.value = false
      } catch (err) {
        console.error('Ошибка удаления категории:', err)
      }
    }
  )
}

defineExpose({ open })
</script>

<template>
  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 400px">
      <q-card-section class="row items-center">
        <span class="q-ml-sm text-h6">
          {{ isEditing ? 'Редактирование' : 'Новая категория' }}
        </span>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div class="q-gutter-y-md">
          <q-input
            v-model="name"
            outlined
            label="Название категории"
            placeholder="Введите название"
            class="q-mb-md"
            autofocus
          />
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn
          v-if="isEditing"
          label="Удалить"
          flat
          color="red"
          @click="deleteCategory"
        />
        <q-space v-if="isEditing" />

        <q-btn flat label="Отмена" color="grey" v-close-popup />
        <q-btn
          label="Сохранить"
          text-color="yellow"
          @click="saveProductCategory"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <DeleteConfirmPage ref="deleteConfirmPage" />
</template>

<style scoped></style>
