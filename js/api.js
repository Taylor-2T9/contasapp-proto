/* ═══════════════════════════════════════════════════
   js/api.js — Versão protótipo (localStorage)
   Dados salvos localmente no navegador.
   Sem backend, sem login, funciona offline.
   ═══════════════════════════════════════════════════ */

/* ── Storage helpers ─────────────────────────────── */
const DB = {
  get(key)      { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } },
  set(key, data){ localStorage.setItem(key, JSON.stringify(data)); },
  nextId(key) {
    const items = this.get(key);
    const max = items.length ? Math.max(...items.map(x => parseInt(x.id) || 0)) : 0;
    return String(max + 1);
  },
};

/* ── Reconciliação client-side ───────────────────── */
function _reconcile(clienteId) {
  const clients  = DB.get('fa_clients');
  const client   = clients.find(c => String(c.id) === String(clienteId));
  const payments = DB.get('fa_payments').filter(p => String(p.cliente_id) === String(clienteId))
                     .sort((a, b) => new Date(a.data) - new Date(b.data));

  const allPurchases = DB.get('fa_purchases');
  const purchases    = allPurchases.filter(p => String(p.cliente_id) === String(clienteId));

  // Lê configurações de juros do cliente
  const modalidade = client?.juros_modalidade || 'mensal';
  const jurosUnico = !!client?.juros_unico;

  // Reset
  const working = purchases.map(p => ({ ...p, status: 'pendente', abatido: 0 }));

  for (const payment of payments) {
    let rem = parseFloat(payment.valor);
    const pending = working.filter(p => p.status === 'pendente')
                           .sort((a, b) => new Date(a.data_compra) - new Date(b.data_compra));

    for (const p of pending) {
      if (rem <= 0) break;
      const todayStr = new Date().toISOString().split('T')[0];
      const days     = p.data_vencimento && todayStr > p.data_vencimento
        ? Math.floor((new Date(todayStr) - new Date(p.data_vencimento)) / 864e5) : 0;
      const rate     = parseFloat(client?.taxa_juros || 0);

      let interest = 0;
      if (days > 0 && rate > 0) {
        if (jurosUnico) {
          interest = p.valor_original * (rate / 100);
        } else {
          let periodos = modalidade === 'diario' ? days : modalidade === 'semanal' ? days / 7 : days / 30;
          interest = p.valor_original * (rate / 100) * periodos;
        }
      }

      const owed     = parseFloat(p.valor_original) + interest - (p.abatido || 0);

      if (rem >= owed) {
        p.status  = 'pago';
        p.abatido = parseFloat((p.abatido + owed).toFixed(2));
        rem       = parseFloat((rem - owed).toFixed(2));
      } else {
        p.abatido = parseFloat((p.abatido + rem).toFixed(2));
        rem = 0;
      }
    }
  }

  // Merge de volta
  for (const wp of working) {
    const i = allPurchases.findIndex(p => String(p.id) === String(wp.id));
    if (i >= 0) { allPurchases[i].status = wp.status; allPurchases[i].abatido = wp.abatido; }
  }
  DB.set('fa_purchases', allPurchases);
  return working;
}

/* ══════════════════════════════════════════════════
   Api — interface pública (espelha a versão real)
══════════════════════════════════════════════════ */
const Api = {

  /* ── CLIENTES ──────────────────────────────────── */

  async getClients() {
    return DB.get('fa_clients').filter(c => c.ativo !== false);
  },

  async getAllClients() {
    return DB.get('fa_clients');
  },

  async getClient(id) {
    return DB.get('fa_clients').find(c => String(c.id) === String(id)) ?? null;
  },

  async saveClient(client) {
    const all = DB.get('fa_clients');
    if (client.id) {
      const i = all.findIndex(c => String(c.id) === String(client.id));
      if (i >= 0) { all[i] = { ...all[i], ...client }; DB.set('fa_clients', all); return all[i]; }
      return null;
    }
    const novo = {
      ...client,
      id:         DB.nextId('fa_clients'),
      ativo:      true,
      bloqueado:  false,
      created_at: new Date().toISOString().split('T')[0],
    };
    all.push(novo);
    DB.set('fa_clients', all);
    return novo;
  },

  async patchClient(id, fields) {
    const all = DB.get('fa_clients');
    const i   = all.findIndex(c => String(c.id) === String(id));
    if (i < 0) return null;
    all[i] = { ...all[i], ...fields };
    DB.set('fa_clients', all);
    return all[i];
  },

  async setClientActive(id, ativo)      { return this.patchClient(id, { ativo }); },
  async setClientBlocked(id, bloqueado) { return this.patchClient(id, { bloqueado }); },

  /* ── COMPRAS ───────────────────────────────────── */

  async getPurchases(clienteId = null) {
    const all = DB.get('fa_purchases');
    return clienteId ? all.filter(p => String(p.cliente_id) === String(clienteId)) : all;
  },

  async createPurchase(purchase) {
    const nova = {
      ...purchase,
      id:      DB.nextId('fa_purchases'),
      status:  'pendente',
      abatido: 0,
    };
    const all = DB.get('fa_purchases');
    all.push(nova);
    DB.set('fa_purchases', all);
    return nova;
  },

  async deletePurchase(id) {
    const all     = DB.get('fa_purchases');
    const purchase = all.find(p => String(p.id) === String(id));
    DB.set('fa_purchases', all.filter(p => String(p.id) !== String(id)));
    if (purchase) _reconcile(purchase.cliente_id);
    return true;
  },

  /* ── PAGAMENTOS ────────────────────────────────── */

  async getPayments(clienteId = null) {
    const all = DB.get('fa_payments');
    return clienteId ? all.filter(p => String(p.cliente_id) === String(clienteId)) : all;
  },

  async createPaymentAndReconcile(clienteId, valor, data) {
    const payment = { id: DB.nextId('fa_payments'), cliente_id: clienteId, valor, data };
    const allPays = DB.get('fa_payments');
    allPays.push(payment);
    DB.set('fa_payments', allPays);
    const purchases = _reconcile(clienteId);
    return { payment, purchases };
  },

  async deletePaymentAndReconcile(paymentId) {
    const allPays = DB.get('fa_payments');
    const payment = allPays.find(p => String(p.id) === String(paymentId));
    DB.set('fa_payments', allPays.filter(p => String(p.id) !== String(paymentId)));
    const purchases = payment ? _reconcile(payment.cliente_id) : [];
    return { purchases };
  },

  /* ── CONFIGURAÇÕES ─────────────────────────────── */

  getSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem('fa_settings') || '{}');
      return { empresa: '', darkMode: false, ...stored };
    } catch {
      return { empresa: '', darkMode: false };
    }
  },

  saveSettings(data) {
    const merged = { ...this.getSettings(), ...data };
    localStorage.setItem('fa_settings', JSON.stringify(merged));
    return merged;
  },
};
