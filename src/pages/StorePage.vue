<script setup>
import { onMounted, ref, computed, watch } from "vue";
import { useQuasar } from "quasar";
import { useSpecializationsStore } from "stores/useSpecializationsStore.js";
import { useProductCategoriesStore } from "stores/useProductCategoriesStore.js";
import { useProductsStore } from "stores/useProductsStore.js";
import ProductCategoryDialogPage from "pages/dialogs/ProductCategoryDialogPage.vue";
import ProductDialogPage from "pages/dialogs/ProductDialogPage.vue";
import { logAllProductsForDebugging } from "src/repositories/productsRepo.js";

const $q = useQuasar();

const specializationStore = useSpecializationsStore();
const productCategoriesStore = useProductCategoriesStore();
const productsStore = useProductsStore();

const selectedSpecialization = computed(() => specializationStore.getSelectedSpecialization);

const productCategories = computed(() => productCategoriesStore.items);
const products = computed(() => productsStore.items);

const selectedProductCategory = ref(null);
const selectedProduct = ref(null);

const productDialog = ref(null);
const productCategoryDialog = ref(null);

onMounted(async () => {
  if (selectedSpecialization.value) {
    await productCategoriesStore.load(selectedSpecialization.value.id);
  }
  // Очищаем список товаров при монтировании, чтобы не показывать лишнего
  productsStore.clear();
});

// Следим за изменением выбранной категории
watch(selectedProductCategory, async (newCategory) => {
  if (newCategory && newCategory.id) {
    // Если выбрана новая категория, загружаем товары для нее
    await productsStore.loadByCategoryId(newCategory.id);
    // Для отладки выводим в консоль все товары из локальной таблицы
    await logAllProductsForDebugging();
  } else {
    // Если категория сброшена, очищаем список товаров
    productsStore.clear();
  }
});

const openAddProductCategoryDialog = () => {
  if (!selectedSpecialization.value) {
    $q.notify({ type: 'negative', message: 'Сначала выберите специализацию' });
    return;
  }
  productCategoryDialog.value.open(null, selectedSpecialization.value.id);
};

const openEditProductCategoryDialog = () => {
  if (!selectedProductCategory.value) return;
  productCategoryDialog.value.open(selectedProductCategory.value);
};

const openAddProductDialog = () => {
  if (!selectedProductCategory.value) {
    $q.notify({ type: 'negative', message: 'Сначала выберите категорию товара' });
    return;
  }
  selectedProduct.value = null;
  productDialog.value.open(null, selectedProductCategory.value, false);
};

const openDetailProductDialog = (product) => {
  selectedProduct.value = product;
  productDialog.value.open(product, null, true);
};

const handleProductCategorySaved = async () => {
  if (selectedSpecialization.value) {
    await productCategoriesStore.load(selectedSpecialization.value.id);
  }
  selectedProductCategory.value = null;
};

const handleProductSaved = async () => {
  // Перезагружаем только товары текущей категории
  if (selectedProductCategory.value) {
    await productsStore.loadByCategoryId(selectedProductCategory.value.id);
  }
  selectedProduct.value = null;
};
</script>

<template>
  <div class="row items-center">
    <q-select v-model="selectedProductCategory"
              :options="productCategories"
              option-label="name"
              label="Категория товара"
              dense
              clearable
              class="col-9"
              outlined
    />

    <div class="col-auto self-end">
      <q-btn class="col-1 text-yellow" @click="openAddProductCategoryDialog">+</q-btn>
    </div>

    <div class="col-auto self-end">
      <q-btn class="col-1 text-yellow" @click="openEditProductCategoryDialog" icon="edit" />
    </div>

  </div>

  <q-list bordered separator>
    <q-item-label header v-if="!products.length && selectedProductCategory">Нет товаров в этой категории</q-item-label>
    <q-item-label header v-if="!selectedProductCategory">Выберите категорию для просмотра товаров</q-item-label>
    <!-- ИСПОЛЬЗУЕМ products ВМЕСТО filteredProducts -->
    <q-item v-for="product in products"
            :key="product.id"
            class="w-100 justify-between"
            style="width: 100%"
            clickable
            v-ripple
            @click="openDetailProductDialog(product)"
    >
      <q-item-section class="col-8">
        <q-item-label class="text-left">
          {{ product.name }}
        </q-item-label>
      </q-item-section>


      <q-item-section class="col-1">
        <q-item-label class="text-center">
          {{ product.quantity }}
        </q-item-label>
      </q-item-section>

      <q-item-section class="col-2">
        <q-item-label class="text-right">
          {{product.base_sale_price}}
        </q-item-label>
      </q-item-section>

    </q-item>

  </q-list>

  <q-btn
    icon="add"
    round
    class="fab bg-yellow text-black"
    @click="openAddProductDialog"
    size="20px"
    :disable="!selectedProductCategory"
  />

  <ProductDialogPage ref="productDialog"  @product-saved="handleProductSaved" />
  <ProductCategoryDialogPage ref="productCategoryDialog" @product-category-saved="handleProductCategorySaved"  />

</template>

<style scoped>

.fab {
  position: fixed;
  bottom: 70px;
  right: 16px;
  z-index: 1000; /* чтобы кнопка была поверх остальных элементов */
}

</style>
