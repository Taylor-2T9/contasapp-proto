/* ═══════════════════════════════════════════════════
   js/main.js — Inicialização, navegação e PWA

   Carregado por último. Aqui ficam:
   - Roteamento entre views
   - Vinculação de eventos globais (header, forms, etc.)
   - Configuração do PWA (manifest, service worker)
   - Seed de dados de demonstração (mock)
   ═══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   NAVEGAÇÃO
══════════════════════════════════════════════════ */

/**
 * Navega para uma view, empilhando a atual no histórico.
 * @param {string} viewId - ID do elemento da view
 * @param {Object} params - parâmetros opcionais { cid, clientId, ... }
 */
function navigate(viewId, params = {}) {
  if (State.curView !== viewId) {
    State.navHistory.push(State.curView);
  }

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  State.curView = viewId;

  document.querySelector('.view.active .content')?.scrollTo(0, 0);

  // Inicializa a view conforme necessário
  switch (viewId) {
    case 'v-home':            renderHome();                              break;
    case 'v-cf':              setupClientForm(params);                   break;
    case 'v-detail':          renderDetail(params.cid || null);          break;
    case 'v-purchase':        setupPurchaseForm(params.cid);             break;
    case 'v-payment':         setupPaymentForm(params.cid);              break;
    case 'v-purchase-detail': renderPurchaseDetail(params.pid || null);  break;
    case 'v-settings':        setupSettingsView();                       break;
  }
}

function goBack() {
  const prev = State.navHistory.length
    ? State.navHistory.pop()
    : 'v-home';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(prev).classList.add('active');
  State.curView = prev;

  switch (prev) {
    case 'v-home':            renderHome();                                        break;
    case 'v-detail':          renderDetail(null);                                  break;
    case 'v-purchase':        setupPurchaseForm(State.curClientId);                break;
    case 'v-payment':         setupPaymentForm(State.curClientId);                 break;
    case 'v-cf':              setupClientForm({ clientId: State.editClientId });   break;
    case 'v-purchase-detail': renderPurchaseDetail(null);                          break;
    case 'v-settings':        setupSettingsView();                                 break;
  }
}

/* ══════════════════════════════════════════════════
   EVENTOS GLOBAIS
══════════════════════════════════════════════════ */

function bindEvents() {
  // ── Botão "Novo cliente" (home) ──────────────
  document.getElementById('btn-new-client')
    .addEventListener('click', () => navigate('v-cf', { mode: 'add' }));

  // ── Botão Exportar ───────────────────────────
  document.getElementById('btn-export')
    .addEventListener('click', exportToExcel);

  // ── Botão Configurações ──────────────────────
  document.getElementById('btn-settings')
    .addEventListener('click', () => navigate('v-settings'));

  // ── Toggle Clientes / Compras ────────────────
  document.querySelectorAll('.vt-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vt-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      State.homeView = btn.dataset.view;
      // swap toolbars
      document.getElementById('home-toolbar').style.display     = State.homeView === 'clientes' ? 'flex' : 'none';
      document.getElementById('purchase-toolbar').style.display = State.homeView === 'compras'  ? 'flex' : 'none';
      renderHome();
    });
  });

  // ── Busca na home ────────────────────────────
  document.getElementById('home-search')
    .addEventListener('input', e => renderHome(e.target.value));
  document.getElementById('pur-search')
    .addEventListener('input', e => renderHome(e.target.value));
  // ── Sort selects ─────────────────────────────
  document.getElementById('home-sort-select').addEventListener('change', e => {
    State.curSort = e.target.value; renderHome();
  });
  document.getElementById('pur-sort-select').addEventListener('change', e => {
    State.purchaseSort = e.target.value; renderHome();
  });

  // ── Botões Voltar ────────────────────────────
  ['cf-back', 'detail-back', 'pur-back', 'pay-back', 'pd-back', 'settings-back'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', goBack);
  });

  // ── Configurações: salvar / sair ────────────
  document.getElementById('settings-save')
    .addEventListener('click', saveSettings);
  // ── Editar cliente (detalhe) ─────────────────
  document.getElementById('detail-edit')
    .addEventListener('click', () => navigate('v-cf', { clientId: State.curClientId }));

  // ── Salvar cliente ───────────────────────────
  document.getElementById('cf-save')
    .addEventListener('click', saveClient);

  // ── Inativar / Reativar cliente ──────────────
  document.getElementById('cf-inativar')
    .addEventListener('click', toggleClientActive);

  // ── Bloquear / Desbloquear cliente ───────────
  document.getElementById('cf-bloquear')
    .addEventListener('click', toggleClientBlocked);

  // ── Calculadora: adicionar item ──────────────
  document.getElementById('calc-add-btn')
    .addEventListener('click', addCalcItem);

  document.getElementById('calc-in')
    .addEventListener('keydown', e => { if (e.key === 'Enter') addCalcItem(); });

  // ── Calculadora: limpar / confirmar ─────────
  document.getElementById('pur-clear')
    .addEventListener('click', clearCalc);

  document.getElementById('pur-confirm')
    .addEventListener('click', confirmPurchase);

  // ── Pagamento: confirmar ─────────────────────
  document.getElementById('pay-confirm')
    .addEventListener('click', confirmPayment);

  // ── Modal: fechar ao clicar no overlay ───────
  document.getElementById('overlay')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

  document.getElementById('ov-cancel')
    .addEventListener('click', closeModal);

  // ── Recibo: fechar ao clicar fora ────────────
  document.getElementById('receipt-overlay')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeReceipt(); });
}

/* ══════════════════════════════════════════════════
   PWA — Service Worker + Manifest
══════════════════════════════════════════════════ */

function setupPWA() {
  // Service Worker (inline como blob para funcionar sem servidor dedicado)
  if ('serviceWorker' in navigator) {
    const swCode = `
      const CACHE = 'contasapp-v1';
      self.addEventListener('install', () => self.skipWaiting());
      self.addEventListener('activate', e => {
        e.waitUntil(
          caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
          )
        );
        self.clients.claim();
      });
      self.addEventListener('fetch', e => {
        e.respondWith(
          caches.match(e.request).then(cached => cached || fetch(e.request))
        );
      });
    `;
    const swBlob = new Blob([swCode], { type: 'application/javascript' });
    navigator.serviceWorker
      .register(URL.createObjectURL(swBlob))
      .catch(() => { /* silencioso em dev */ });
  }

  // Manifest inline
  const manifest = {
    name: 'ContasApp – Mercadinho',
    short_name: 'ContasApp',
    start_url: '/',
    display: 'standalone',
    background_color: '#F4F4F1',
    theme_color: '#ffffff',
    icons: [{
      src: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23111827'/><text y='.9em' font-size='66' x='14'>🛒</text></svg>`,
      sizes: '192x192',
      type: 'image/svg+xml',
    }],
  };
  const link = document.createElement('link');
  link.rel   = 'manifest';
  link.href  = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  document.head.appendChild(link);

  // Banner "Instalar app"
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    State.dip = e;
    document.getElementById('install-wrap').innerHTML = `
      <div class="install-banner">
        <span>📲 Instale o ContasApp na sua tela inicial</span>
        <button id="install-btn">Instalar</button>
      </div>`;
    document.getElementById('install-btn').addEventListener('click', () => {
      State.dip.prompt();
      State.dip.userChoice.then(() => {
        State.dip = null;
        document.getElementById('install-wrap').innerHTML = '';
      });
    });
  });
}

/* ══════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  Settings.apply();
  setupPWA();
  bindEvents();
  document.getElementById('purchase-toolbar').style.display = 'none';
  renderHome();
});
