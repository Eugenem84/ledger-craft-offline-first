// src/services/api.js

import axios from 'axios';

// моки
import mockClients from 'src/mocks/clients.json';
import mockSpecializations from 'src/mocks/specializations.json';
// import mockOrders from 'src/mocks/orders.json';
// import mockInvoices from 'src/mocks/invoices.json';

const API_URL = 'https://dev.medovf2h.beget.tech/api';
const USE_MOCK = false;

export default {
  async send(operation) {
    if (USE_MOCK) {
      console.log('[MOCK] send:', operation);
      await new Promise(r => setTimeout(r, 200));

      return {
        server_id: Math.floor(Math.random() * 100000),
        updated_at: Date.now()
      };
    }

    const res = await axios.post(`${API_URL}/sync`, operation);
    return res.data;
  },

  async fetchUpdates({ table, since }) {
    if (USE_MOCK) {
      console.log(`[MOCK] fetchUpdates for ${table}, since ${since}`);

      await new Promise(r => setTimeout(r, 300));

      switch (table) {
        case 'clients':
          return mockClients;

        case 'specializations':
          return mockSpecializations;

        // case 'orders':
        //   return mockOrders;

        // case 'invoices':
        //   return mockInvoices;

        default:
          return [];
      }
    }

    const res = await axios.get(`${API_URL}/sync-updates`, {
      params: { table, since }
    });

    // Получаем "сырые" данные от сервера
    const serverData = res.data;

    // Если это массив записей, трансформируем его
    if (Array.isArray(serverData?.records)) {
      serverData.records = serverData.records.map(record => {
        // Для таблицы специализаций переименовываем specializationName -> name
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
