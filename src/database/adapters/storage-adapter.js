import { logger } from 'src/utils/logger'
export default {
  async init() {
    throw new Error('init() not implemented')
  },
  execute(sql, _params = []) {
    throw new Error('execute() not implemented')
  },
  query(sql, _params = []) {
    throw new Error('query() not implemented')
  },
  async transaction(_cb) {
    throw new Error('transaction() not implemented')
  },
  enqueueOperation(_op) {
    throw new Error('enqueueOperation() not implemented')
  },
  dequeueOperations() {
    throw new Error('dequeueOperations() not implemented')
  },
  /**
   * Очищает постоянное хранилище (например, localStorage).
   */
  clear() {
    // Используем тот же ключ, что и в sqljs-web-adapter
    localStorage.removeItem('sqljs_db');
    logger.log('[StorageAdapter] Local storage cleared.');
  }
}
