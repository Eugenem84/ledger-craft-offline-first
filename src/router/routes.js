const routes = [
  {
    path: '/',
    redirect: '/orders',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: 'orders', component: () => import('pages/OrdersPage.vue') },
      { path: 'store', component: () => import('pages/StorePage.vue') },
      { path: 'analytic', component: () => import('pages/AnalyticPage.vue') },
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


  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
