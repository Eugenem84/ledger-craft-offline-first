<template>
  <q-page class="flex flex-center">
    test2

      <div>
        <button @click="load">Загрузить клиентов</button>
        <ul>
          <li v-for="c in clientsStore.clients" :key="c.id">{{ c.id }} — {{ c.name }}</li>
        </ul>
      </div>

  </q-page>
</template>

<script setup>
import { useClientsStore} from "stores/useClientsStore.js";
import { onMounted } from "vue";

const clientsStore = useClientsStore()
const load = async () => {
  await clientsStore.loadClients()
  console.log(clientsStore.clients)
}

onMounted(async () => {
  await load()
})
</script>
