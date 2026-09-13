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
import m014 from './014_create_orders_table.js'
import m015 from './015_create_equipment_models_table.js'
import m020 from './020_create_order_service_table.js'
import m022 from './022_add_operations_status.js'
import m023 from './023_materials_order_lines.js'
import m024 from './024_order_lines_buy_price.js'
// Фаза 10 (мульти-профиль): поля профиля, пометка пресета, идентификатор объекта.
import m025 from './025_specialization_profile_fields.js'
import m026 from './026_template_key_columns.js'
import m027 from './027_order_equipment_identifier.js'
import m028 from './028_operations_attempts.js'
// Строгий фильтр каталога по профилю (Фаза 10/12): разовая привязка «ничьих» записей.
import m029 from './029_backfill_catalog_specialization.js'
import m030 from './030_create_feedback_reports_table.js'
// Диагностика очереди: счётчик откладываний и причина отказа (дефект 14.11).
import m031 from './031_operations_diagnostics.js'

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
  m013,
  m014,
  m015,
  m020,
  m022,
  m023,
  m024,
  m025,
  m026,
  m027,
  m028,
  m029,
  m030,
  m031,
]

export default migrations
