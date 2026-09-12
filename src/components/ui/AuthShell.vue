<script setup>
// Каркас экранов входа и регистрации.
//
// Маршруты `/login` и `/register` — публичные и живут вне `MainLayout`, поэтому
// QLayout объявляется здесь (QPage обязан быть внутри QLayout, иначе Quasar
// бросает «QPage needs to be a deep child of QLayout»).
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
})
</script>

<template>
  <q-layout view="hHh lpR fFf" class="bg-black">
    <q-page-container>
      <q-page class="auth-page column flex-center q-pa-md">
        <div class="column items-center q-mb-lg">
          <div class="auth-mark">LC</div>
          <div class="text-subtitle1 q-mt-sm text-weight-medium">Ledger Craft</div>
          <div class="text-caption lc-mute">учёт работ и запчастей</div>
        </div>

        <q-card class="auth-card" flat>
          <q-card-section class="q-pb-none">
            <div class="text-subtitle1">{{ title }}</div>
            <div v-if="subtitle" class="text-caption lc-mute">{{ subtitle }}</div>
          </q-card-section>
          <q-card-section>
            <slot />
          </q-card-section>
        </q-card>

        <div class="text-caption lc-mute q-mt-md">работает офлайн · синхронизируется само</div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
}

.auth-mark {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--lc-accent);
  color: var(--lc-accent-ink);
  font-weight: 800;
  font-size: 20px;
  letter-spacing: 0.04em;
}

.auth-card {
  width: 100%;
  max-width: 400px;
  background: var(--lc-surface-2);
  border: 1px solid var(--lc-border);
}
</style>
