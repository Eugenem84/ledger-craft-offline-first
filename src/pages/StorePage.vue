<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useSpecializationsStore } from 'stores/useSpecializationsStore.js'
import { useProductCategoriesStore } from 'stores/useProductCategoriesStore.js'
import { useProductsStore } from 'stores/useProductsStore.js'
import ProductCategoryDialogPage from 'pages/dialogs/ProductCategoryDialogPage.vue'
import ProductDialogPage from 'pages/dialogs/ProductDialogPage.vue'
// Вкладка «движение товаров» (правка владельца 15.09.2026): история приходов и расходов
// по всем товарам профиля + правка приходов (`StoreHistoryPanel` → `EditArrivalDialogPage`).
import StoreHistoryPanel from 'src/components/store/StoreHistoryPanel.vue'
// Общие UI-элементы и лексикон профиля (переработка интерфейса).
import LcEmptyState from 'src/components/ui/LcEmptyState.vue'
import LcFab from 'src/components/ui/LcFab.vue'
import LcPageHeader from 'src/components/ui/LcPageHeader.vue'
import { useLexicon } from 'src/domain/lexicon.js'

const { t } = useLexicon()

const $q = useQuasar()

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

/** Вкладка раздела (правка владельца 15.09.2026): «товары» — как было, «движение товаров» — история. */
const tab = ref('goods');

onMounted(async () => {
  if (selectedSpecialization.value) {
    await productCategoriesStore.load(selectedSpecialization.value.id);
  }
  // Очищаем список товаров при монтировании, чтобы не показывать лишнего
  productsStore.clear();
});

// Переключение рабочего профиля (задача 10.8) меняет склад — перечитываем категории.
watch(selectedSpecialization, async (specialization) => {
  selectedProductCategory.value = null;
  productsStore.clear();
  await productCategoriesStore.load(specialization?.id);
});

// Следим за изменением выбранной категории
watch(selectedProductCategory, async (newCategory) => {
  if (newCategory && newCategory.id) {
    // Если выбрана новая категория, загружаем товары для нее
    await productsStore.loadByCategoryId(newCategory.id);
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

/**
 * Приход изменили на вкладке «движение товаров» (правка владельца 15.09.2026): остаток
 * мог измениться, поэтому перечитываем товары текущей категории — список и история
 * должны показывать одно и то же.
 */
const handleArrivalChanged = async () => {
  if (selectedProductCategory.value) {
    await productsStore.loadByCategoryId(selectedProductCategory.value.id);
  }
};
</script>

<template>
  <q-page class="lc-page lc-shell">
    <LcPageHeader
      :title="t('stock')"
      :subtitle="selectedSpecialization?.name"
      icon="inventory_2"
    />

    <!-- Две вкладки раздела (правка владельца 15.09.2026): «товары» — всё, что было раньше,
         и «движение товаров» — история приходов и расходов с правкой приходов. -->
    <q-tabs
      v-model="tab"
      dense
      no-caps
      align="justify"
      narrow-indicator
      active-color="secondary"
      indicator-color="secondary"
      class="q-mb-sm"
    >
      <q-tab name="goods" icon="inventory_2" :label="`товары · ${products.length}`" />
      <q-tab name="movements" icon="swap_vert" label="движение товаров" />
    </q-tabs>

    <!-- ⚠️ `q-tab-panel` обязан быть ПРЯМЫМ ребёнком `q-tab-panels` (см. docs/UI.md):
         иначе Quasar не соберёт список панелей и содержимое вкладок не отрисуется. -->
    <q-tab-panels v-model="tab" animated class="bg-transparent">
      <q-tab-panel name="goods" class="q-pa-none">
        <div class="row items-center no-wrap q-gutter-x-sm q-mb-sm">
          <q-select
            v-model="selectedProductCategory"
            :options="productCategories"
            option-label="name"
            label="категория товара"
            dense
            outlined
            clearable
            color="secondary"
            class="col"
          />

          <q-btn flat round dense icon="create_new_folder" color="secondary" @click="openAddProductCategoryDialog">
            <q-tooltip class="text-caption">новая категория</q-tooltip>
          </q-btn>
          <q-btn
            flat
            round
            dense
            icon="edit"
            color="secondary"
            :disable="!selectedProductCategory"
            @click="openEditProductCategoryDialog"
          >
            <q-tooltip class="text-caption">переименовать категорию</q-tooltip>
          </q-btn>
        </div>

        <!-- История склада (правка владельца 15.09.2026): приходы и расходы товара живут
             в карточке товара — тап по строке открывает её. -->
        <div class="text-caption lc-mute q-mb-sm">
          Тап по товару — карточка с ценами, ценой закупки и историей приходов и расходов.
        </div>

        <!-- Остаток и цены товаров (задача 9.3): `quantity` — из `product_stocks`,
             `buy_price` — из `buy_product_prices`, `last_sale_price` — из `sales_products_prices`. -->
        <div class="lc-card">
          <div class="lc-linerow lc-linerow--head">
            <div class="lc-col-name">товар</div>
            <div class="lc-col-num">остаток</div>
            <div class="lc-col-num lc-hide-sm">закупка</div>
            <div class="lc-col-num">продажа</div>
            <div class="lc-col-num lc-hide-sm">посл. прод.</div>
            <div class="lc-col-del"></div>
          </div>

          <LcEmptyState
            v-if="!products.length"
            icon="inventory_2"
            :title="selectedProductCategory ? 'В категории пока нет товаров' : 'Выберите категорию'"
            :hint="
              selectedProductCategory
                ? 'Добавьте товар кнопкой «+» внизу.'
                : 'Товары сгруппированы по категориям.'
            "
          />

          <div
            v-for="product in products"
            :key="product.id"
            class="lc-linerow cursor-pointer"
            @click="openDetailProductDialog(product)"
          >
            <div class="lc-col-name ellipsis">{{ product.name }}</div>

            <div
              class="lc-col-num lc-money"
              :class="Number(product.quantity) > 0 ? '' : 'text-negative'"
            >
              {{ product.quantity }}
            </div>

            <div class="lc-col-num lc-mute lc-hide-sm">{{ product.buy_price ?? '—' }}</div>

            <div class="lc-col-num lc-money">{{ product.base_sale_price }}</div>

            <div class="lc-col-num lc-mute lc-hide-sm">{{ product.last_sale_price ?? '—' }}</div>

            <div class="lc-col-del"><q-icon name="chevron_right" class="lc-mute" size="18px" /></div>
          </div>
        </div>
      </q-tab-panel>

      <q-tab-panel name="movements" class="q-pa-none">
        <StoreHistoryPanel
          :specialization-id="selectedSpecialization?.id ?? null"
          @changed="handleArrivalChanged"
        />
      </q-tab-panel>
    </q-tab-panels>

    <!-- Плавающая кнопка создания — только на вкладке товаров: на истории она не нужна. -->
    <LcFab
      v-if="tab === 'goods'"
      icon="add"
      label="новый товар"
      :disable="!selectedProductCategory"
      @click="openAddProductDialog"
    />

    <ProductDialogPage ref="productDialog" @product-saved="handleProductSaved" />
    <ProductCategoryDialogPage
      ref="productCategoryDialog"
      @product-category-saved="handleProductCategorySaved"
    />
  </q-page>
</template>
