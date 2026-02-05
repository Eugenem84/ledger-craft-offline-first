// src/services/api.js

import axios from 'axios';

// моки
import mockClients from 'src/mocks/clients.json';
import mockSpecializations from 'src/mocks/specializations.json';
// import mockOrders from 'src/mocks/orders.json';
// import mockInvoices from 'src/mocks/invoices.json';

const API_URL = 'https://dev.medovf2h.beget.tech/api';
const USE_MOCK = false;

// --- Уникальный ID клиента для синхронизации ---
// Пытаемся получить ID из localStorage
let syncId = localStorage.getItem('sync_id');
if (!syncId) {
  // Если его нет, генерируем новый и сохраняем
  syncId = crypto.randomUUID();
  localStorage.setItem('sync_id', syncId);
}
console.log(`[API] Sync ID: ${syncId}`);

// Создаем экземпляр axios с преднастроенными заголовками
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Sync-ID': syncId // Добавляем ID в заголовки по умолчанию
  }
});


export default {
  async send(operation) {
    if (USE_MOCK) {
      console.log('[MOCK] send:', operation);
      await new Promise(r => setTimeout(r, 200));

      // В моках возвращаем структуру, похожую на серверную
      const results = {
        synced: [],
        errors: []
      };
      operation.operations.forEach(op => {
        results.synced.push({
          type: op.type,
          local_id: op.type === 'insert' ? op.payload.local_id : op.id,
          server_id: Math.floor(Math.random() * 100000)
        });
      });
      return results;
    }

    const res = await apiClient.post('/sync', operation);
    return res.data;
  },

  async fetchUpdates({ table, since }) {
    if (USE_MOCK) {
      console.log(`[MOCK] fetchUpdates for ${table}, since ${since}`);
      await new Promise(r => setTimeout(r, 300));
      let data = [];
      switch (table) {
        case 'clients':
          data = mockClients;
          break;
        case 'specializations':
          data = mockSpecializations;
          break;
        default:
          data = [];
      }
      return { table, count: data.length, records: data };
    }

    const res = await apiClient.get('/sync-updates', {
      params: { table, since }
    });

    const serverData = res.data;

    if (Array.isArray(serverData?.records)) {
      serverData.records = serverData.records.map(record => {
        if (table === 'specializations' && record.specializationName) {
          record.name = record.specializationName;
          delete record.specializationName;
        }
        return record;
      });
    }

    return serverData;
  }
};
