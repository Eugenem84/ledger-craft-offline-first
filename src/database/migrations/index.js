import m001 from './001_create_clients_table.js'
import m002 from './002_create_operations.js'
import m003 from './003_create_meta.js'
import m004 from './004_create_specializations_table.js'
import m005 from './005_create_categories_table.js'
import m006 from './006_create_services_table.js'
import m007 from './007_create_products_table.js'
import m008 from './008_create_product_stocks_table.js'
import m009 from './009_create_buy_product_prices_table.js'
import m010 from './010_create_sales_products_prices_table.js'
import m011 from './011_create_product_categories_table.js'
import m012 from './012_create_incoming_products_table.js'
import m013 from './013_create_order_product_table.js'

const migrations = [
  m001,
  m002,
  m003,
  m004,
  m005,
  m006,
  m007,
  m008,
  m009,
  m010,
  m011,
  m012,
  m013
]

export default migrations
