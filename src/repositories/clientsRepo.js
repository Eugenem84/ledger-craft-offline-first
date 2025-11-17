import dbAdapter from 'src/adapters/sqljs-web-adapter'
// import dbAdapter from 'src/adapters/sqlite-capacitor-adapter'

export async function getAll() {
  return dbAdapter.query('SELECT * FROM clients')
}

export async function save(client) {
  dbAdapter.execute(
    'INSERT INTO clients (id, name) VALUES (?, ?)',
    [client.id, client.name]
  )
}
