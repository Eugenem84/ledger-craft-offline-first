// src/services/api.js

import axios from 'axios';

// моки
import mockClients from 'src/mocks/clients.json';
// import mockOrders from 'src/mocks/orders.json';
// import mockInvoices from 'src/mocks/invoices.json';

const API_URL = 'http://217.114.0.27/api';
const USE_MOCK = true;

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

    const res = await axios.post(`${API_URL}/sync-op`, operation);
    return res.data;
  },

  async fetchUpdates({ table, since }) {
    if (USE_MOCK) {
      console.log(`[MOCK] fetchUpdates for ${table}, since ${since}`);

      await new Promise(r => setTimeout(r, 300));

      switch (table) {
        case 'clients':
          return mockClients;

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

    return res.data;
  }
};
