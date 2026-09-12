const routes = [
  {
    path: '/',
    redirect: '/orders',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      // `meta.feature` (Фаза 10, задача 10.3): раздел доступен, только если флаг
      // включён в активном профиле. Прямой переход по URL ведёт на доступный
      // раздел (`featureGuard`), а не на пустой экран.
      { path: 'orders', component: () => import('pages/OrdersPage.vue') },
      { path: 'store', component: () => import('pages/StorePage.vue'), meta: { feature: 'store' } },
      {
        path: 'analytic',
        component: () => import('pages/AnalyticPage.vue'),
        meta: { feature: 'analytics' },
      },
      { path: 'other', component: () => import('pages/OthersPage.vue') },
      { path: 'catalog', component: () => import('pages/CatalogPage.vue') },
    ],
  },
  {
    path: '/orders/:id',
    component: () => import('pages/OrderDetailsPage.vue'),
    meta: { hideFooter: true, requiredAuth: true}
  },
  {
    path: '/orders/new',
    component: () => import('pages/OrderDetailsPage.vue'),
    meta: { hideFooter: true, requiredAuth: true},
    name: 'new-order'
  },

  {
    path: '/login',
    component: () => import('pages/LoginPage.vue'),
    // Публичный маршрут (7.5): единственный, куда пускает auth-guard без входа.
    meta: { hideFooter: true, requiredAuth: false },
  },

  {
    // Само-регистрация (Фаза 10, задача 10.5): раньше экрана регистрации в клиенте
    // не было вовсе — публичным был только `/login`.
    path: '/register',
    component: () => import('pages/RegisterPage.vue'),
    meta: { hideFooter: true, requiredAuth: false },
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
