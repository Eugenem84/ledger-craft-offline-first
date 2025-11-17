export default {
  async init() {
    throw new Error('init() not implemented')
  },
  execute(sql, params = []) {
    throw new Error('execute() not implemented')
  },
  query(sql, params = []) {
    throw new Error('query() not implemented')
  },
  async transaction(cb) {
    throw new Error('transaction() not implemented')
  },
  enqueueOperation(op) {
    throw new Error('enqueueOperation() not implemented')
  },
  dequeueOperations() {
    throw new Error('dequeueOperations() not implemented')
  }
}
