<script setup>
import { ref, computed } from 'vue'
import { useProductCategoriesStore } from 'stores/useProductCategoriesStore.js'
import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

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
  <LcDialogShell
    :model-value="showDialog"
    :title="isEditing ? 'Редактирование категории' : 'Новая категория'"
    confirm-label="Сохранить"
    @update:model-value="showDialog = $event"
    @confirm="saveProductCategory"
  >
    <q-input
      v-model="name"
      outlined
      dense
      label="Название категории"
      placeholder="Введите название"
      autofocus
    />

    <template v-if="isEditing" #actions>
      <q-btn flat no-caps color="negative" icon="delete" label="Удалить" @click="deleteCategory" />
      <q-space />
      <q-btn flat no-caps color="grey-5" label="Отмена" @click="showDialog = false" />
      <q-btn
        unelevated
        no-caps
        color="secondary"
        text-color="black"
        label="Сохранить"
        @click="saveProductCategory"
      />
    </template>
  </LcDialogShell>

  <DeleteConfirmPage ref="deleteConfirmPage" />
</template>

<style scoped></style>
