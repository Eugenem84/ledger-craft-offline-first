import m001 from './001_create_clients_table.js'
import m002 from './002_create_operations.js'
import m003 from './003_create_meta.js'
import m004 from './004_create_specializations_table.js'
import m005 from './005_create_categories_table.js'

const migrations = [
  m001,
  m002,
  m003,
  m004,
  m005
]

export default migrations
