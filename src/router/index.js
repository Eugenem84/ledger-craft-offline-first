import { defineRouter } from '#q-app/wrappers'
import {
  createRouter,
  createMemoryHistory,
  createWebHistory,
  createWebHashHistory,
} from 'vue-router'
import routes from './routes'
import { createAuthGuard, createFeatureGuard } from './authGuard.js'

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default defineRouter(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(process.env.VUE_ROUTER_BASE),
  })

  // Задача 7.5: без входа (а если PIN установлен — без разблокировки) защищённые
  // маршруты недоступны. Публичные помечаются `meta.requiredAuth: false`.
  Router.beforeEach(createAuthGuard())

  // Фаза 10 (10.3): разделы, скрытые пресетом активного профиля, по прямому URL
  // не открываются — ведём на доступный раздел.
  Router.beforeEach(createFeatureGuard())

  return Router
})
