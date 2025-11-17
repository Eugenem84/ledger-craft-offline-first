<script setup>
  import {ref} from 'vue'
  const tab = ref('/orders')
</script>

<template>
  <q-layout view="lHh Lpr lFf " class="bg-black">

    <q-page-container>
      <router-view>
      </router-view>
    </q-page-container>

    <q-footer v-if="!$route.meta.hideFooter" elevated class="bg-primary text-white">
      <q-separator color="grey" />

      <q-tabs
        v-model="tab"
        dense
        :class="$q.dark.isActive ? 'bg-black' : 'bg-black' "
        align="justify"
        narrow-indicator
        class="tabs"
        indicator-color="yellow"
      >
        <q-route-tab to="/orders"
                     name="orders"
                     label="ордеры"
                     icon="list"
                     class="flex-grow col-3 text-caption"
        ></q-route-tab>

        <q-route-tab to="/store"
                     name="store"
                     label="склад"
                     icon="storage"
                     class="flex-grow col-2 text-caption"
        ></q-route-tab>

        <q-route-tab to="/catalog"
                     name="catalog"
                     label="Каталог"
                     icon="folder"
                     class="flex-grow col-3 text-caption"
        ></q-route-tab>

        <q-route-tab to="/analytic"
                     name="analytic"
                     label="аналитика"
                     icon="bar_chart"
                     class="flex-grow col-3 text-caption"
        ></q-route-tab>

        <q-route-tab to="/other"
                     name="other"
                     label="другие"
                     icon="more_horiz"
                     class="flex-grow col-1 text-caption"
        ></q-route-tab>

      </q-tabs>

    </q-footer>

  </q-layout>
</template>

<style scoped></style>
