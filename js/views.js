/* ═══════════════════════════════════════════════════
   js/views.js — Funções de renderização de telas

   Cada função async busca os dados necessários via Api
   e monta o HTML da respectiva view.
   ═══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   HOME — lista de clientes
══════════════════════════════════════════════════ */

async function renderHome(searchOverride = null) {
  setLoading(true);
  try {
    const searchId = State.homeView === 'compras' ? 'pur-search' : 'home-search';
    const searchVal = searchOverride ?? document.getElementById(searchId)?.value ?? '';

    const [clients, allPurchases] = await Promise.all([
      Api.getClients(),
      Api.getPurchases(),
    ]);

    const purchasesByClient = {};
    for (const p of allPurchases) {
      if (!purchasesByClient[p.cliente_id]) purchasesByClient[p.cliente_id] = [];
      purchasesByClient[p.cliente_id].push(p);
    }

    _renderOverviewCards(clients, purchasesByClient, allPurchases);

    if (State.homeView === 'compras') {
      _renderPurchaseListHome(allPurchases, clients, searchVal);
    } else {
      let filtered = clients;
      if (searchVal) {
        const q = searchVal.toLowerCase();
        filtered = clients.filter(c => c.nome.toLowerCase().includes(q));
      }
      filtered.sort((a, b) => {
        const pa = purchasesByClient[a.id] || [];
        const pb = purchasesByClient[b.id] || [];
        const ba = clientBalance(pa, a);
        const bb = clientBalance(pb, b);
        if (State.curSort === 'maior')  return bb - ba;
        if (State.curSort === 'menor')  return ba - bb;
        if (State.curSort === 'za')     return b.nome.localeCompare(a.nome, 'pt-BR');
        if (State.curSort === 'atraso') {
          const ao = hasOverduePurchases(pa), bo = hasOverduePurchases(pb);
          return ao === bo ? bb - ba : ao ? -1 : 1;
        }
        if (State.curSort === 'limite') {
          const as = clientStatus(ba, a.limite_credito) === 'over' ? 0 : 1;
          const bs = clientStatus(bb, b.limite_credito) === 'over' ? 0 : 1;
          return as - bs;
        }
        return a.nome.localeCompare(b.nome, 'pt-BR'); // 'az' default
      });
      _renderClientList(filtered, purchasesByClient);
    }
  } catch (e) {
    console.error(e);
    toast('Erro ao carregar dados', 'error');
    document.getElementById('client-list').innerHTML =
      `<div class="empty"><span class="ico">⚠️</span><p>Não foi possível carregar os dados.</p></div>`;
  } finally {
    setLoading(false);
  }
}

/* Renderiza o carrossel de visão geral no topo da home */
function _renderOverviewCards(clients, purchasesByClient, allPurchases) {
  const container = document.getElementById('overview-cards');
  if (!container) return;

  let totalAberto      = 0;
  let clientesEmAtraso = 0;
  let clientesNoLimite = 0;

  for (const c of clients) {
    const purchases = purchasesByClient[c.id] || [];
    const bal = clientBalance(purchases, c);
    totalAberto += bal;
    if (hasOverduePurchases(purchases))                 clientesEmAtraso++;
    if (clientStatus(bal, c.limite_credito) === 'over') clientesNoLimite++;
  }

  // Vendas do dia
  const t = today();
  const todayPurchases = allPurchases.filter(p => p.data_compra === t);
  const todayTotal     = todayPurchases.reduce((s, p) => s + p.valor_original, 0);
  const todayCount     = todayPurchases.length;

  const cards = [
    {
      color: 'green', icon: '💰',
      label: 'Dívida total',
      value: fmt(totalAberto),
      valueCls: 'green',
      sub: 'soma de todas as dívidas',
    },
    {
      color: todayCount > 0 ? 'green' : 'ink', icon: '🛒',
      label: 'Vendas hoje',
      value: fmt(todayTotal),
      valueCls: todayCount > 0 ? 'green' : '',
      sub: `${todayCount} compra${todayCount !== 1 ? 's' : ''} registrada${todayCount !== 1 ? 's' : ''}`,
    },
    {
      color: 'ink', icon: '👥',
      label: 'Clientes ativos',
      value: clients.length,
      valueCls: '',
      sub: clients.length === 1 ? 'cliente cadastrado' : 'clientes cadastrados',
    },
    {
      color: clientesEmAtraso > 0 ? 'red' : 'ink', icon: '⚠️',
      label: 'Em atraso',
      value: clientesEmAtraso,
      valueCls: clientesEmAtraso > 0 ? 'red' : '',
      sub: clientesEmAtraso === 1 ? 'cliente com parcela vencida' : 'clientes com parcela vencida',
    },
    {
      color: clientesNoLimite > 0 ? 'amber' : 'ink', icon: '🔴',
      label: 'Acima do limite',
      value: clientesNoLimite,
      valueCls: clientesNoLimite > 0 ? 'amber' : '',
      sub: clientesNoLimite === 1 ? 'cliente ultrapassou o limite' : 'clientes ultrapassaram o limite',
    },
  ];

  container.innerHTML = `
    <div class="carousel-wrap">
      <div class="carousel-track">
        <div class="carousel-inner" id="carousel-inner">
          ${cards.map(c => `
            <div class="ov-card ${c.color}">
              <span class="ov-card-icon">${c.icon}</span>
              <div class="ov-card-label">${c.label}</div>
              <div class="ov-card-value ${c.valueCls}">${c.value}</div>
              <div class="ov-card-sub">${c.sub}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="carousel-dots" id="carousel-dots">
        ${cards.map((_, i) => `<span class="c-dot${i === 0 ? ' on' : ''}" data-i="${i}"></span>`).join('')}
      </div>
    </div>`;

  _initCarousel(cards.length);
}

function _initCarousel(total) {
  const inner = document.getElementById('carousel-inner');
  const dots  = document.querySelectorAll('#carousel-dots .c-dot');
  if (!inner || total < 2) return;

  let current = 0;
  let startX  = 0;
  let dragging = false;

  function goTo(idx) {
    // Loop: após o último volta ao primeiro (e vice-versa)
    current = ((idx % total) + total) % total;
    inner.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('on', i === current));
  }

  // Toque
  inner.addEventListener('touchstart', e => {
    startX   = e.touches[0].clientX;
    dragging = true;
  }, { passive: true });

  inner.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) goTo(current + (diff > 0 ? 1 : -1));
  }, { passive: true });

  // Clique nos dots
  dots.forEach(d => {
    d.addEventListener('click', () => goTo(parseInt(d.dataset.i)));
  });
}

function _renderClientList(clients, purchasesByClient) {
  const list = document.getElementById('client-list');

  if (!clients.length) {
    const q = document.getElementById('home-search')?.value ?? '';
    list.innerHTML = `<div class="empty anim">
      <span class="ico">${q ? '🔍' : '👥'}</span>
      <p>${q
        ? `Nenhum resultado para "<strong>${q}</strong>"`
        : 'Nenhum cliente cadastrado.<br>Toque em <strong>+</strong> para adicionar.'
      }</p>
    </div>`;
    return;
  }

  list.innerHTML = clients.map(c => {
    const purchases = purchasesByClient[c.id] || [];
    const bal    = clientBalance(purchases, c);
    const lim    = parseFloat(c.limite_credito) || 0;
    const st     = clientStatus(bal, c.limite_credito);
    const ov     = hasOverduePurchases(purchases);
    const ratio  = lim ? Math.min(bal / lim, 1) : 0;
    const barC   = st === 'over' ? 'var(--red)' : st === 'warn' ? 'var(--amber)' : 'var(--green)';
    const dotCls = c.bloqueado ? 'blocked' : st;

    return `<div class="cc${c.bloqueado ? ' blocked' : ''} anim" data-cid="${c.id}">
      <div class="cc-name-row">
        <div class="cc-name">
          <span class="status-dot ${dotCls}"></span>
          <span>${c.nome}</span>
          ${c.bloqueado ? `<span class="blocked-badge" style="margin-left:4px">🔒</span>` : ''}
          ${ov && !c.bloqueado ? `<span style="font-size:11px;color:var(--red);font-weight:500;margin-left:2px"> · atraso</span>` : ''}
        </div>
        <button class="ctx-btn cc-ctx" data-cid="${c.id}" data-bloqueado="${c.bloqueado ? '1' : '0'}" data-tel="${c.telefone || ''}" data-bal="${bal}">···</button>
      </div>
      ${c.telefone ? `<div class="cc-phone">${c.telefone}</div>` : ''}
      <div class="cc-bottom" style="margin-top:10px">
        <div>
          <div class="cc-bal-label">Dívida atual</div>
          <div class="cc-bal-value ${st}">${fmt(bal)}</div>
        </div>
        <div style="text-align:right">
          <div class="cc-bal-label">Limite</div>
          <div class="cc-lim-v">${fmt(lim)}</div>
        </div>
      </div>
      ${lim ? `<div class="progress"><div class="progress-fill" style="width:${(ratio * 100).toFixed(1)}%;background:${barC}"></div></div>` : ''}
    </div>`;
  }).join('');

  list.querySelectorAll('.cc[data-cid]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.ctx-btn')) return;
      navigate('v-detail', { cid: el.dataset.cid });
    });
  });

  list.querySelectorAll('.cc-ctx').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const cid       = btn.dataset.cid;
      const bloqueado = btn.dataset.bloqueado === '1';
      const tel       = btn.dataset.tel;
      const bal       = parseFloat(btn.dataset.bal) || 0;
      showCtxMenu(btn, [
        { icon: '👤', label: 'Ver conta', action: () => navigate('v-detail', { cid }) },
        { icon: '✏️', label: 'Editar cliente', action: () => navigate('v-cf', { clientId: cid }) },
        ...(bal > 0 && tel ? [{ icon: '💬', label: 'Cobrar via WhatsApp', action: () => sendWhatsAppCobranca(cid) }] : []),
        { icon: bloqueado ? '🔓' : '🔒', label: bloqueado ? 'Desbloquear conta' : 'Bloquear conta',
          action: () => _quickToggleBlock(cid, bloqueado) },
      ]);
    });
  });
}

/* Lista de compras na home (modo "Compras") */
function _renderPurchaseListHome(allPurchases, clients, searchVal) {
  const clientMap = {};
  for (const c of clients) clientMap[c.id] = c;

  let list = [...allPurchases];

  if (searchVal) {
    const q = searchVal.toLowerCase();
    list = list.filter(p => {
      const c = clientMap[p.cliente_id];
      return c && c.nome.toLowerCase().includes(q);
    });
  }

  const sort = State.purchaseSort;
  list.sort((a, b) => {
    if (sort === 'recente') return new Date(b.data_compra) - new Date(a.data_compra);
    if (sort === 'antiga')  return new Date(a.data_compra) - new Date(b.data_compra);
    if (sort === 'maior')   return updatedVal(b, clientMap[b.cliente_id]) - updatedVal(a, clientMap[a.cliente_id]);
    if (sort === 'menor')   return updatedVal(a, clientMap[a.cliente_id]) - updatedVal(b, clientMap[b.cliente_id]);
    if (sort === 'atraso') {
      const ao = daysOverdue(a), bo = daysOverdue(b);
      return bo - ao;
    }
    if (sort === 'az') {
      const na = clientMap[a.cliente_id]?.nome || '';
      const nb = clientMap[b.cliente_id]?.nome || '';
      return na.localeCompare(nb, 'pt-BR');
    }
    return 0;
  });

  const container = document.getElementById('client-list');
  if (!list.length) {
    container.innerHTML = `<div class="empty anim"><span class="ico">🛒</span><p>${searchVal ? 'Nenhuma compra encontrada.' : 'Nenhuma compra registrada.'}</p></div>`;
    return;
  }

  container.innerHTML = list.map(p => {
    const c   = clientMap[p.cliente_id];
    const ov  = daysOverdue(p);
    const int = calcInterest(p, c);
    const upd = updatedVal(p, c);
    const paid = p.status === 'pago';
    return `<div class="pur-item${ov > 0 ? ' overdue' : ''}${paid ? ' paid' : ''} anim" data-pid="${p.id}" data-cid="${p.cliente_id}">
      <div class="pur-item-top">
        <span class="pur-item-name">${c ? c.nome : '—'}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="pur-item-val${int > 0 ? ' upd' : paid ? ' paid-v' : ''}">${fmt(upd)}</span>
          <button class="ctx-btn pur-ctx" data-pid="${p.id}" data-cid="${p.cliente_id}" data-paid="${paid ? '1' : '0'}">···</button>
        </div>
      </div>
      <div class="pur-item-meta">
        <span class="pur-item-date">${fmtD(p.data_compra)}</span>
        ${p.observacao ? `<span class="pur-item-obs">· ${p.observacao}</span>` : ''}
        ${ov > 0 ? `<span class="ov-tag" style="margin-left:auto">⚠ ${ov}d</span>` : ''}
        ${paid ? `<span class="paid-tag" style="margin-left:auto">✓ Pago</span>` : ''}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.pur-item[data-pid]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.ctx-btn')) return;
      navigate('v-purchase-detail', { pid: el.dataset.pid });
    });
  });

  container.querySelectorAll('.pur-ctx').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pid  = btn.dataset.pid;
      const cid  = btn.dataset.cid;
      const paid = btn.dataset.paid === '1';
      showCtxMenu(btn, [
        { icon: '📋', label: 'Ver compra', action: () => navigate('v-purchase-detail', { pid }) },
        { icon: '🧾', label: 'Gerar recibo', action: () => showPurchaseReceipt(pid) },
        ...(!paid ? [{ icon: '💳', label: 'Registrar pagamento', action: () => navigate('v-payment', { cid }) }] : []),
        ...(!paid ? [{ icon: '✕', label: 'Cancelar compra', danger: true,
            action: () => {
              const p = { id: pid, valor_original: 0, data_compra: '' };
              showModal('Cancelar compra', 'Cancelar esta compra?\n\nEsta ação não pode ser desfeita.',
                async () => { await Api.deletePurchase(pid); toast('Compra cancelada', 'success'); renderHome(); },
                'btn-danger', 'Sim, cancelar');
            }}] : []),
      ]);
    });
  });
}

/* Quick block toggle from context menu */
async function _quickToggleBlock(cid, currentlyBlocked) {
  setLoading(true);
  try {
    await Api.setClientBlocked(cid, !currentlyBlocked);
    toast(currentlyBlocked ? 'Conta desbloqueada' : 'Conta bloqueada', 'success');
    renderHome();
  } catch(e) {
    toast('Erro ao atualizar conta', 'error');
  } finally {
    setLoading(false);
  }
}

/* ══════════════════════════════════════════════════
   CLIENT FORM — cadastro / edição
══════════════════════════════════════════════════ */

async function setupClientForm(params = {}) {
  State.editClientId = params.clientId || null;
  const isEdit = !!State.editClientId;

  document.getElementById('cf-title').textContent   = isEdit ? 'Editar cliente' : 'Novo cliente';
  document.getElementById('cf-save').textContent    = isEdit ? 'Salvar alterações' : 'Salvar cliente';
  const ibtn = document.getElementById('cf-inativar');

  if (isEdit) {
    setLoading(true);
    try {
      const c = await Api.getClient(State.editClientId);
      if (c) {
        document.getElementById('cf-nome').value   = c.nome;
        document.getElementById('cf-tel').value    = c.telefone || '';
        document.getElementById('cf-limite').value = c.limite_credito;
        document.getElementById('cf-juros').value  = c.taxa_juros;
        document.getElementById('cf-tol').value    = c.dias_tolerancia;
        ibtn.style.display  = 'block';
        ibtn.textContent    = c.ativo === false ? 'Reativar cliente' : 'Inativar cliente';
        ibtn.dataset.ativo  = c.ativo === false ? 'false' : 'true';

        const bbtn = document.getElementById('cf-bloquear');
        bbtn.style.display = 'block';
        bbtn.textContent   = c.bloqueado ? '🔓 Desbloquear conta' : '🔒 Bloquear conta';
        bbtn.dataset.bloqueado = c.bloqueado ? 'true' : 'false';
      }
    } catch (e) {
      toast('Erro ao carregar cliente', 'error');
    } finally {
      setLoading(false);
    }
  } else {
    document.getElementById('cf-nome').value   = '';
    document.getElementById('cf-tel').value    = '';
    document.getElementById('cf-limite').value = '';
    document.getElementById('cf-juros').value  = '5';
    document.getElementById('cf-tol').value    = '30';
    ibtn.style.display = 'none';
    document.getElementById('cf-bloquear').style.display = 'none';
  }
}

async function saveClient() {
  const nome   = document.getElementById('cf-nome').value.trim();
  const tel    = document.getElementById('cf-tel').value.trim();
  const lim    = parseFloat(document.getElementById('cf-limite').value);
  const juros  = parseFloat(document.getElementById('cf-juros').value) || 0;
  const tol    = parseInt(document.getElementById('cf-tol').value) || 30;

  if (!nome)              { toast('Informe o nome do cliente', 'error'); return; }
  if (isNaN(lim) || lim < 0) { toast('Informe o limite de crédito', 'error'); return; }

  setLoading(true);
  try {
    await Api.saveClient({
      id: State.editClientId || undefined,
      nome, telefone: tel,
      limite_credito: lim,
      taxa_juros: juros,
      dias_tolerancia: tol,
    });
    toast(State.editClientId ? 'Cliente atualizado' : 'Cliente cadastrado', 'success');
    goBack();
  } catch (e) {
    toast('Erro ao salvar cliente', 'error');
  } finally {
    setLoading(false);
  }
}

async function toggleClientActive() {
  const ibtn     = document.getElementById('cf-inativar');
  const ativoNow = ibtn.dataset.ativo !== 'false';
  const novoAtivo = !ativoNow;
  const label    = ativoNow ? 'inativar' : 'reativar';

  const c = await Api.getClient(State.editClientId).catch(() => null);
  if (!c) return;

  showModal(
    ativoNow ? 'Inativar cliente' : 'Reativar cliente',
    `Deseja ${label} o cliente "${c.nome}"?`,
    async () => {
      setLoading(true);
      try {
        await Api.setClientActive(State.editClientId, novoAtivo);
        toast(`Cliente ${ativoNow ? 'inativado' : 'reativado'}`, 'success');
        goBack();
      } catch (e) {
        toast('Erro ao atualizar cliente', 'error');
      } finally {
        setLoading(false);
      }
    },
    ativoNow ? 'btn-danger' : 'btn-primary',
  );
}

async function toggleClientBlocked() {
  const bbtn        = document.getElementById('cf-bloquear');
  const bloqNow     = bbtn.dataset.bloqueado === 'true';
  const novoBloq    = !bloqNow;

  const c = await Api.getClient(State.editClientId).catch(() => null);
  if (!c) return;

  showModal(
    bloqNow ? 'Desbloquear conta' : 'Bloquear conta',
    bloqNow
      ? `Desbloquear a conta de "${c.nome}"?\n\nEle voltará a poder fazer compras.`
      : `Bloquear a conta de "${c.nome}"?\n\nNão será possível registrar novas compras para este cliente enquanto estiver bloqueado.`,
    async () => {
      setLoading(true);
      try {
        await Api.setClientBlocked(State.editClientId, novoBloq);
        toast(`Conta ${novoBloq ? 'bloqueada' : 'desbloqueada'}`, 'success');
        goBack();
      } catch (e) {
        toast('Erro ao atualizar conta', 'error');
      } finally {
        setLoading(false);
      }
    },
    novoBloq ? 'btn-danger' : 'btn-primary',
  );
}

/* ══════════════════════════════════════════════════
   CLIENT DETAIL — visão geral do cliente
══════════════════════════════════════════════════ */

async function renderDetail(cid) {
  if (cid) State.curClientId = cid;

  const imgInput = document.getElementById('pur-image');
  const imgPreview = document.getElementById('pur-image-preview');
  if (imgInput) {
    imgInput.value = '';
    imgInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) { imgPreview.style.display='none'; return; }
      const base64 = await fileToBase64(file);
      imgPreview.src = base64;
      imgPreview.style.display = 'block';
    };
  }

  setLoading(true);
  try {
    const [c, purchases, payments] = await Promise.all([
      Api.getClient(State.curClientId),
      Api.getPurchases(State.curClientId),
      Api.getPayments(State.curClientId),
    ]);
    if (!c) { goBack(); return; }

    document.getElementById('detail-name').textContent = c.nome;
    document.getElementById('detail-edit').dataset.cid = c.id;

    const bal           = clientBalance(purchases, c);
    const lim           = parseFloat(c.limite_credito) || 0;
    const st            = clientStatus(bal, c.limite_credito);
    const overdueList   = purchases.filter(p => p.status === 'pendente' && daysOverdue(p) > 0);
    const totalInterest = purchases.filter(p => p.status === 'pendente').reduce((s, p) => s + calcInterest(p, c), 0);
    const totalPaid     = payments.reduce((s, p) => s + p.valor, 0);

    const sortedPurchases = [...purchases].sort((a, b) => new Date(b.data_compra) - new Date(a.data_compra));
    const sortedPayments  = [...payments].sort((a, b) => new Date(b.data) - new Date(a.data));

    let html = '';

    // ── Cartão de dívida ──────────────────────────
    html += `<div class="bal-card ${st === 'over' ? 'danger' : st === 'warn' ? 'warn' : ''}">
      <div class="bal-card-watermark">${c.nome.split(' ')[0].toUpperCase()}</div>
      <div class="bal-lbl">Dívida atual</div>
      <div class="bal-big">${fmt(bal)}</div>
      <div class="bal-meta">
        <div class="bm"><div class="bm-l">Limite</div><div class="bm-v">${fmt(lim)}</div></div>
        <div class="bm"><div class="bm-l">Saldo</div><div class="bm-v">${fmt(Math.max(0, lim - bal))}</div></div>
        <div class="bm"><div class="bm-l">Juros acum.</div><div class="bm-v">${fmt(totalInterest)}</div></div>
      </div>
      ${lim ? `<div class="prog-bar"><div class="prog-fill" style="width:${Math.min(100, bal / lim * 100).toFixed(1)}%;background:${st === 'over' ? 'var(--red)' : st === 'warn' ? 'var(--amber)' : 'var(--green)'}"></div></div>` : ''}
    </div>`;

    if (overdueList.length)
      html += `<div class="alert-row danger">⚠️ ${overdueList.length} compra${overdueList.length > 1 ? 's' : ''} em atraso</div>`;
    if (st === 'over')
      html += `<div class="alert-row warn">🔴 Limite de crédito ultrapassado</div>`;
    if (c.bloqueado)
      html += `<div class="alert-row blocked">🔒 Conta bloqueada — novas compras desativadas</div>`;

    // ── Botões de ação ───────────────────────────
    html += `<div class="act-row">
      <button class="act-btn" id="btn-nova-compra" ${c.bloqueado ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}>
        <div class="a-ico">🛒</div><div class="a-lbl">Nova compra</div>
        <div class="a-sub">${c.bloqueado ? 'Conta bloqueada' : 'Registrar na conta'}</div>
      </button>
      <button class="act-btn" id="btn-registrar-pag">
        <div class="a-ico">💳</div><div class="a-lbl">Receber pagamento</div><div class="a-sub">Abater dívida</div>
      </button>
    </div>`;

    // WhatsApp cobrança (linha separada, só se tiver telefone)
    if (c.telefone && bal > 0) {
      html += `<button class="btn-wa" id="btn-cobrar-wa" style="width:100%;margin-bottom:14px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Enviar cobrança por WhatsApp
      </button>`;
    }

    // ── Abas ─────────────────────────────────────
    html += `<div class="tabs">
      <div class="tab${State.activeTab === 'compras'    ? ' on' : ''}" data-tab="compras">Compras (${sortedPurchases.length})</div>
      <div class="tab${State.activeTab === 'pagamentos' ? ' on' : ''}" data-tab="pagamentos">Pagamentos (${sortedPayments.length})</div>
      <div class="tab${State.activeTab === 'resumo'     ? ' on' : ''}" data-tab="resumo">Resumo</div>
    </div>`;

    // ── Conteúdo da aba ──────────────────────────
    html += '<div id="tab-content">';

    if (State.activeTab === 'compras') {
      if (!sortedPurchases.length) {
        html += `<div class="empty"><span class="ico">🛒</span><p>Nenhuma compra registrada ainda.</p></div>`;
      } else {
        html += sortedPurchases.map(p => _renderPurchaseItem(p, c)).join('');
      }
    } else if (State.activeTab === 'pagamentos') {
      if (!sortedPayments.length) {
        html += `<div class="empty"><span class="ico">💳</span><p>Nenhum pagamento registrado ainda.</p></div>`;
      } else {
        html += `<div style="padding:2px 0 12px;font-size:13px;color:var(--ink-2)">Total recebido: <strong style="color:var(--green)">${fmt(totalPaid)}</strong></div>`;
        html += sortedPayments.map(p => _renderPaymentItem(p)).join('');
      }
    } else {
      html += _renderMonthlyResume(purchases);
    }

    html += '</div>';

    // ── Rodapé com metadados do cliente ──────────
    html += `<div class="divider"></div>
    <div class="client-meta-row">
      <span class="meta-chip">Juros: ${c.taxa_juros || 0}% a.m.</span>
      <span class="meta-chip">Carência: ${c.dias_tolerancia || 30} dias</span>
      ${c.telefone ? `<span class="meta-chip">📞 ${c.telefone}</span>` : ''}
    </div>
    <div style="height:24px"></div>`;

    document.getElementById('detail-content').innerHTML = html;

    // ── Eventos internos da view ─────────────────
    document.getElementById('btn-nova-compra')?.addEventListener('click', () => navigate('v-purchase', { cid: State.curClientId }));
    document.getElementById('btn-registrar-pag')?.addEventListener('click', () => navigate('v-payment', { cid: State.curClientId }));
    document.getElementById('btn-cobrar-wa')?.addEventListener('click', () => sendWhatsAppCobranca(State.curClientId));

    document.querySelectorAll('.tab[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        State.activeTab = tab.dataset.tab;
        renderDetail(null);
      });
    });

    // Chips de período do resumo
    document.querySelectorAll('.resume-chip[data-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        State.resumePeriod = btn.dataset.period;
        renderDetail(null);
      });
    });

    document.querySelectorAll('.del-purchase-btn[data-pid]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); confirmDeletePurchase(btn.dataset.pid, c); });
    });

    // Click on purchase item → purchase detail
    document.querySelectorAll('.pi[data-pid]').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.del-btn') || e.target.closest('.ctx-btn')) return;
        navigate('v-purchase-detail', { pid: el.dataset.pid });
      });
    });

    document.querySelectorAll('.det-pur-ctx[data-pid]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const pid = btn.dataset.pid;
        showCtxMenu(btn, [
          { icon: '📋', label: 'Ver compra', action: () => navigate('v-purchase-detail', { pid }) },
          { icon: '🧾', label: 'Gerar recibo', action: () => showPurchaseReceipt(pid) },
          { icon: '💳', label: 'Registrar pagamento', action: () => navigate('v-payment', { cid: State.curClientId }) },
          { icon: '✕', label: 'Cancelar compra', danger: true, action: () => confirmDeletePurchase(pid, c) },
        ]);
      });
    });

    document.querySelectorAll('.del-payment-btn[data-pmid]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); confirmDeletePayment(btn.dataset.pmid, c); });
    });

  } catch (e) {
    console.error(e);
    toast('Erro ao carregar detalhes', 'error');
  } finally {
    setLoading(false);
  }
}

/* Renderiza um item de compra com breakdown de juros */
function _renderPurchaseItem(p, client) {
  const int      = calcInterest(p, client);
  const upd      = updatedVal(p, client);
  const net      = netVal(p, client);
  const ov       = daysOverdue(p);
  const paid     = p.status === 'pago';
  const abatido  = p.abatido || 0;
  const hasPartial = !paid && abatido > 0;

  // Breakdown: principal + juros
  const breakdown = !paid && int > 0
    ? `<div class="interest-breakdown">
        <span class="ib-chip ib-principal">Principal: ${fmt(p.valor_original)}</span>
        <span class="ib-chip ib-interest">Juros: +${fmt(int)}</span>
       </div>`
    : '';

  let footer = '';
  if (paid) {
    footer = `<div class="pi-footer"><span class="paid-tag">✓ Quitada</span></div>`;
  } else if (ov > 0) {
    footer = `<div class="pi-footer">
      <span class="ov-tag">⚠ ${ov} dia${ov > 1 ? 's' : ''} em atraso</span>
      <span class="due-txt">Vence em ${fmtD(p.data_vencimento)}</span>
    </div>`;
  } else if (p.data_vencimento) {
    footer = `<div class="pi-footer"><span class="due-txt">Vence em ${fmtD(p.data_vencimento)}</span></div>`;
  }

  if (hasPartial) {
    footer += `<div class="pi-footer no-border">
      <span style="font-size:12px;color:var(--green);font-weight:600">Abatido: ${fmt(abatido)}</span>
      <span style="font-size:12px;color:var(--ink-2)">Restante: <strong>${fmt(net)}</strong></span>
    </div>`;
  }

  return `<div class="pi${ov > 0 && !paid ? ' overdue' : ''}${paid ? ' paid' : ''}" data-pid="${p.id}" style="cursor:pointer">
    <div class="pi-row">
      <div style="flex:1;min-width:0;margin-right:10px">
        <div class="pi-date">${fmtD(p.data_compra)}</div>
        ${p.observacao ? `<div class="pi-obs">${p.observacao}</div>` : ''}
        ${p.imagem ? `<img src="${p.imagem}" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;margin-top:8px">` : ''}
        ${breakdown}
      </div>
      <div style="text-align:right;margin-right:8px">
        <div class="pi-val${paid ? ' paid-v' : int > 0 ? ' upd' : ''}">
          ${paid ? '✓ ' + fmt(p.valor_original) : fmt(upd)}
        </div>
      </div>
      ${!paid ? `<button class="del-btn del-purchase-btn" data-pid="${p.id}" title="Excluir compra">✕</button>
               <button class="ctx-btn det-pur-ctx" data-pid="${p.id}" style="margin-left:4px">···</button>` : ''}
    </div>
    ${footer}
  </div>`;
}

/* Renderiza o resumo com filtro de período */
function _renderMonthlyResume(purchases) {
  const now = new Date();

  // Gera lista dos últimos 12 meses (mais recente primeiro)
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    months.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }

  const sel = State.resumePeriod;

  // Filtra compras pelo período selecionado
  const filtered = sel === 'all'
    ? purchases
    : purchases.filter(p => p.data_compra && p.data_compra.startsWith(sel));

  // Calcula estatísticas
  const total      = filtered.reduce((s, p) => s + p.valor_original, 0);
  const count      = filtered.length;
  const emAberto   = filtered
    .filter(p => p.status === 'pendente')
    .reduce((s, p) => s + (p.valor_original - (p.abatido || 0)), 0);
  const recebido   = filtered
    .filter(p => p.status === 'pago')
    .reduce((s, p) => s + p.valor_original, 0)
    + filtered
    .filter(p => p.status === 'pendente' && (p.abatido || 0) > 0)
    .reduce((s, p) => s + (p.abatido || 0), 0);
  const countPendente = filtered.filter(p => p.status === 'pendente').length;
  const countPago     = filtered.filter(p => p.status === 'pago').length;

  // Chips do filtro
  const chips = [
    { key: 'all', label: 'Todo o período' },
    ...months,
  ].map(({ key, label }) =>
    `<button class="chip resume-chip${sel === key ? ' on' : ''}" data-period="${key}">${label}</button>`
  ).join('');

  // Bloco de estatísticas
  const statsHtml = count === 0
    ? `<div style="font-size:13px;color:var(--ink-3);padding:12px 0">Nenhuma compra neste período.</div>`
    : `<div class="month-grid">
        <div class="month-stat">
          <div class="ms-lbl">Total comprado</div>
          <div class="ms-val">${fmt(total)}</div>
          <div class="ms-sub">${count} compra${count !== 1 ? 's' : ''}</div>
        </div>
        <div class="month-stat">
          <div class="ms-lbl">Em aberto</div>
          <div class="ms-val${emAberto > 0 ? ' green' : ''}">${fmt(emAberto)}</div>
          <div class="ms-sub">${countPendente} pendente${countPendente !== 1 ? 's' : ''}</div>
        </div>
        <div class="month-stat">
          <div class="ms-lbl">Recebido</div>
          <div class="ms-val">${fmt(recebido)}</div>
          <div class="ms-sub">${countPago} quitada${countPago !== 1 ? 's' : ''}${countPendente > 0 && recebido > 0 ? ' + parcial' : ''}</div>
        </div>
      </div>`;

  return `
    <div class="sort-row" id="resume-filter" style="margin-bottom:14px">${chips}</div>
    <div class="month-section">${statsHtml}</div>`;
}

/* Renderiza um item de pagamento */
function _renderPaymentItem(p) {
  return `<div class="pay-item">
    <div class="pay-item-left">
      <div class="pay-val">${fmt(p.valor)}</div>
      <div class="pay-date">${fmtD(p.data)}</div>
    </div>
    <button class="del-btn del-payment-btn" data-pmid="${p.id}" title="Excluir pagamento">✕</button>
  </div>`;
}

/* ── Exclusão de compra ──────────────────────────── */
function confirmDeletePurchase(pid, client) {
  const purchases = [];  // não precisamos aqui, buscamos só para exibir info
  // busca o dado em memória via re-fetch seria custoso; podemos manter inline
  showModal(
    'Excluir compra',
    'Confirmar exclusão desta compra?\n\nEsta ação não pode ser desfeita.',
    async () => {
      setLoading(true);
      try {
        await Api.deletePurchase(pid);
        toast('Compra excluída', 'success');
        renderDetail(null);
      } catch (e) {
        toast('Erro ao excluir compra', 'error');
      } finally {
        setLoading(false);
      }
    },
    'btn-danger',
    'Sim, excluir',
  );
}

/* ── Exclusão de pagamento + reconciliação ───────── */
function confirmDeletePayment(pmid, client) {
  showModal(
    'Excluir pagamento',
    'Confirmar exclusão deste pagamento?\n\nAs compras serão recalculadas automaticamente.',
    async () => {
      setLoading(true);
      try {
        await Api.deletePaymentAndReconcile(pmid);
        toast('Pagamento excluído e dívida recalculada', 'success');
        renderDetail(null);
      } catch (e) {
        console.error(e);
        toast('Erro ao excluir pagamento', 'error');
      } finally {
        setLoading(false);
      }
    },
    'btn-danger',
    'Sim, excluir',
  );
}


function formatCurrencyDigits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const amount = (parseInt(digits || '0', 10) / 100);
  return amount.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseCurrencyInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return parseInt(digits || '0', 10) / 100;
}

function attachCurrencyMask(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener('input', () => {
    input.value = formatCurrencyDigits(input.value);
  });

  input.addEventListener('focus', () => {
    if (!input.value) input.value = '0,00';
  });
}

/* ══════════════════════════════════════════════════
   PURCHASE FORM — calculadora de compras
══════════════════════════════════════════════════ */

async function setupPurchaseForm(cid) {
  State.curClientId = cid;

  const imgInput = document.getElementById('pur-image');
  const imgPreview = document.getElementById('pur-image-preview');
  if (imgInput) {
    imgInput.value = '';
    imgInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) { imgPreview.style.display='none'; return; }
      const base64 = await fileToBase64(file);
      imgPreview.src = base64;
      imgPreview.style.display = 'block';
    };
  }
  State.calcArr     = [];
  renderCalc();

  document.getElementById('pur-obs').value    = '';
  document.getElementById('calc-in').value    = '0,00';
  document.getElementById('pur-date').value   = today();
  document.getElementById('pur-balance-preview').innerHTML = '';

  attachCurrencyMask('calc-in');

  setLoading(true);
  try {
    const [c, purchases] = await Promise.all([
      Api.getClient(cid),
      Api.getPurchases(cid),
    ]);
    const bal = clientBalance(purchases, c);
    const lim = parseFloat(c?.limite_credito) || 0;

    // Guard: blocked client
    if (c?.bloqueado) {
      document.getElementById('pur-info').innerHTML = `
        <div class="alert-row blocked" style="margin-bottom:16px">
          🔒 A conta de <strong>${c.nome}</strong> está bloqueada. Desbloqueie antes de registrar compras.
        </div>`;
      document.getElementById('pur-confirm').disabled = true;
      document.getElementById('pur-confirm').style.opacity = '.4';
      return;
    }

    document.getElementById('pur-confirm').disabled = false;
    document.getElementById('pur-confirm').style.opacity = '';

    // Store current balance for preview updates
    State._curBal = bal;
    State._curLim = lim;
    State._curClient = c;

    document.getElementById('pur-info').innerHTML = c
      ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:13px;margin-bottom:16px;box-shadow:var(--sh)">
           <div style="font-size:15px;font-weight:600;margin-bottom:7px">${c.nome}</div>
           <div style="display:flex;gap:16px;font-size:13px;color:var(--ink-2)">
             <span>Dívida atual: <strong style="color:var(--ink)">${fmt(bal)}</strong></span>
             <span>Saldo: <strong style="color:${bal > lim ? 'var(--red)' : 'var(--green)'}">${fmt(Math.max(0, lim - bal))}</strong></span>
           </div>
         </div>`
      : '';
  } catch (e) {
    document.getElementById('pur-info').innerHTML = '';
  } finally {
    setLoading(false);
    setTimeout(() => document.getElementById('calc-in').focus(), 250);
  }
}

function addCalcItem() {
  const inp = document.getElementById('calc-in');
  const v   = parseCurrencyInput(inp.value);
  if (isNaN(v) || v <= 0) { toast('Digite um valor válido', 'error'); return; }
  State.calcArr.push(v);
  inp.value = '0,00';
  renderCalc();
  inp.focus();
}

function removeCalcItem(index) {
  State.calcArr.splice(index, 1);
  renderCalc();
}


function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clearCalc() {
  State.calcArr = [];
  document.getElementById('calc-in').value = '0,00';
  renderCalc();
}

function renderCalc() {
  const box   = document.getElementById('calc-items');
  const total = State.calcArr.reduce((s, v) => s + v, 0);

  if (!State.calcArr.length) {
    box.innerHTML = `<div class="empty" style="padding:10px 0"><p>Adicione valores para somar</p></div>`;
  } else {
    box.innerHTML = State.calcArr.map((v, i) =>
      `<div class="calc-item">
        <span>${fmt(v)}</span>
        <button class="c-rm" data-idx="${i}">✕</button>
      </div>`
    ).join('');

    box.querySelectorAll('.c-rm[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => removeCalcItem(parseInt(btn.dataset.idx)));
    });
  }

  document.getElementById('calc-total').textContent = fmt(total);
  _updateBalancePreview(total);
}

function _updateBalancePreview(total) {
  const preview = document.getElementById('pur-balance-preview');
  if (!preview) return;
  const bal = State._curBal ?? 0;
  const lim = State._curLim ?? 0;
  if (total <= 0) { preview.innerHTML = ''; return; }
  const newBal   = bal + total;
  const st       = lim ? (newBal >= lim ? 'new-over' : newBal >= lim * 0.8 ? 'new-warn' : '') : '';
  preview.innerHTML = `
    <div class="bal-preview">
      <div class="bp-item">
        <div class="bp-lbl">Dívida atual</div>
        <div class="bp-val">${fmt(bal)}</div>
      </div>
      <span class="bp-arrow">→</span>
      <div class="bp-item">
        <div class="bp-lbl">Esta compra</div>
        <div class="bp-val">+ ${fmt(total)}</div>
      </div>
      <span class="bp-arrow">=</span>
      <div class="bp-item">
        <div class="bp-lbl">Nova dívida</div>
        <div class="bp-val ${st}">${fmt(newBal)}</div>
      </div>
    </div>`;
}

async function confirmPurchase() {
  const total = State.calcArr.reduce((s, v) => s + v, 0);
  if (total <= 0) { toast('Adicione pelo menos um item', 'error'); return; }

  const obs     = document.getElementById('pur-obs').value.trim();
  const purDate = document.getElementById('pur-date').value || today();
  const imageFile = document.getElementById('pur-image')?.files?.[0];
  const imagem = imageFile ? await fileToBase64(imageFile) : null;

  setLoading(true);
  let c, bal, lim;
  try {
    c         = await Api.getClient(State.curClientId);
    const ps  = await Api.getPurchases(State.curClientId);
    bal = clientBalance(ps, c);
    lim = parseFloat(c?.limite_credito) || 0;
  } catch (e) {
    toast('Erro ao verificar dívida', 'error');
    setLoading(false);
    return;
  } finally {
    setLoading(false);
  }

  const tol  = parseInt(c?.dias_tolerancia) || 30;
  const venc = addDays(purDate, tol);

  const doSave = async () => {
    setLoading(true);
    try {
      await Api.createPurchase({
        cliente_id:      State.curClientId,
        valor_original:  total,
        data_compra:     purDate,
        data_vencimento: venc,
        observacao:      obs,
        imagem,
      });
      State.calcArr = [];
      goBack();
      setTimeout(() => showReceipt('purchase', {
        valor_original:  total,
        data_compra:     purDate,
        data_vencimento: venc,
        observacao:      obs,
        imagem,
      }, c), 120);
    } catch (e) {
      toast('Erro ao registrar compra', 'error');
    } finally {
      setLoading(false);
    }
  };

  const newBal = bal + total;
  if (lim && newBal > lim) {
    showModal(
      'Limite ultrapassado',
      `Esta compra de ${fmt(total)} aumentará a dívida de ${fmt(bal)} para ${fmt(newBal)}, acima do limite de ${fmt(lim)}.\n\nDeseja confirmar mesmo assim?`,
      doSave, 'btn-danger', 'Sim, registrar',
    );
  } else {
    showModal(
      'Confirmar compra',
      `Registrar compra de ${fmt(total)} para ${c?.nome}?\n\nDívida atual: ${fmt(bal)}\nNova dívida: ${fmt(newBal)}\nVencimento:  ${fmtD(venc)}`,
      doSave,
    );
  }
}

/* ══════════════════════════════════════════════════
   PAYMENT FORM — registro de pagamento
══════════════════════════════════════════════════ */

async function setupPaymentForm(cid) {
  State.curClientId = cid;

  const imgInput = document.getElementById('pur-image');
  const imgPreview = document.getElementById('pur-image-preview');
  if (imgInput) {
    imgInput.value = '';
    imgInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) { imgPreview.style.display='none'; return; }
      const base64 = await fileToBase64(file);
      imgPreview.src = base64;
      imgPreview.style.display = 'block';
    };
  }
  document.getElementById('pay-val').value  = '0,00';
  document.getElementById('pay-date').value = today();

  attachCurrencyMask('pay-val');

  setLoading(true);
  try {
    const [c, purchases] = await Promise.all([
      Api.getClient(cid),
      Api.getPurchases(cid),
    ]);
    const bal = clientBalance(purchases, c);

    document.getElementById('pay-info').innerHTML = `
      <div style="background:var(--glt);border:1px solid var(--gmd);border-radius:var(--rs);padding:14px 15px;margin-bottom:18px">
        <div style="font-size:11px;color:var(--green);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px">
          Dívida a receber — ${c?.nome}
        </div>
        <div style="font-size:32px;font-weight:700;color:var(--ink);letter-spacing:-.6px">${fmt(bal)}</div>
      </div>`;

    document.getElementById('pay-val').placeholder = bal > 0 ? bal.toFixed(2) : '0,00';
  } catch (e) {
    document.getElementById('pay-info').innerHTML = '';
  } finally {
    setLoading(false);
  }
}

async function confirmPayment() {
  const v = parseCurrencyInput(document.getElementById('pay-val').value);
  const d = document.getElementById('pay-date').value;

  if (isNaN(v) || v <= 0) { toast('Informe o valor do pagamento', 'error'); return; }
  if (!d)                  { toast('Informe a data', 'error'); return; }

  setLoading(true);
  let c;
  try {
    c = await Api.getClient(State.curClientId);
  } catch (e) { /* segue */ } finally { setLoading(false); }

  showModal(
    'Confirmar pagamento',
    `Registrar recebimento de ${fmt(v)} de ${c?.nome} em ${fmtD(d)}?`,
    () => applyPayment(State.curClientId, v, d),
  );
}

async function applyPayment(cid, amount, date) {
  setLoading(true);
  try {
    const { payment, purchases: reconciled } =
      await Api.createPaymentAndReconcile(cid, amount, date);

    const c        = await Api.getClient(cid);
    const novoSaldo = clientBalance(reconciled, c);

    goBack();
    setTimeout(() => showReceipt('payment', { valor: amount, data: date, _novoSaldo: novoSaldo }, c), 120);
  } catch (e) {
    console.error(e);
    toast('Erro ao registrar pagamento', 'error');
  } finally {
    setLoading(false);
  }
}

/* ══════════════════════════════════════════════════
   PURCHASE DETAIL PAGE
══════════════════════════════════════════════════ */

async function renderPurchaseDetail(pid) {
  if (pid) State.curPurchaseId = pid;
  setLoading(true);
  try {
    const purchases = await Api.getPurchases();
    const p = purchases.find(x => String(x.id) === String(State.curPurchaseId));
    if (!p) { goBack(); return; }
    const c = await Api.getClient(p.cliente_id);
    const int = calcInterest(p, c);
    const upd = updatedVal(p, c);
    const net = netVal(p, c);
    const ov  = daysOverdue(p);
    const paid = p.status === 'pago';

    const hdCls = paid ? 'paid' : ov > 0 ? 'overdue' : '';
    const displayVal = paid ? p.valor_original : upd;

    let html = `
      <div class="pd-header ${hdCls}">
        <div class="pd-lbl">${paid ? 'COMPRA QUITADA' : ov > 0 ? 'EM ATRASO' : 'COMPRA PENDENTE'}</div>
        <div class="pd-val">${fmt(displayVal)}</div>
        <div class="pd-meta">
          <span class="pd-chip">${fmtD(p.data_compra)}</span>
          ${c ? `<span class="pd-chip">${c.nome}</span>` : ''}
          ${ov > 0 ? `<span class="pd-chip" style="border-color:rgba(239,68,68,.4);color:#FCA5A5">⚠ ${ov} dia${ov>1?'s':''} em atraso</span>` : ''}
        </div>
      </div>

      <div class="pd-card">
        <div class="pd-section">
          <div class="pd-row">
            <span class="pd-row-label">Valor original</span>
            <span class="pd-row-value">${fmt(p.valor_original)}</span>
          </div>
          ${int > 0 ? `<div class="pd-row">
            <span class="pd-row-label">Juros acumulados</span>
            <span class="pd-row-value amber">+ ${fmt(int)}</span>
          </div>
          <div class="pd-row">
            <span class="pd-row-label">Total atualizado</span>
            <span class="pd-row-value red">${fmt(upd)}</span>
          </div>` : ''}
          ${p.abatido > 0 ? `<div class="pd-row">
            <span class="pd-row-label">Já abatido</span>
            <span class="pd-row-value green">- ${fmt(p.abatido)}</span>
          </div>
          <div class="pd-row">
            <span class="pd-row-label">Restante a pagar</span>
            <span class="pd-row-value">${fmt(net)}</span>
          </div>` : ''}
          <div class="pd-row">
            <span class="pd-row-label">Data da compra</span>
            <span class="pd-row-value">${fmtD(p.data_compra)}</span>
          </div>
          <div class="pd-row">
            <span class="pd-row-label">Vencimento</span>
            <span class="pd-row-value${ov > 0 ? ' red' : ''}">${fmtD(p.data_vencimento)}</span>
          </div>
          ${p.imagem ? `<div class="pd-row" style="justify-content:center"><img src="${p.imagem}" style="width:100%;border-radius:12px;max-height:280px;object-fit:cover"></div>` : ''}${p.observacao ? `<div class="pd-row">
            <span class="pd-row-label">Descrição</span>
            <span class="pd-row-value" style="max-width:60%;text-align:right">${p.observacao}</span>
          </div>` : ''}
          <div class="pd-row">
            <span class="pd-row-label">Status</span>
            <span class="pd-row-value ${paid ? 'green' : ov > 0 ? 'red' : ''}">${paid ? '✓ Quitada' : ov > 0 ? 'Em atraso' : 'Pendente'}</span>
          </div>
        </div>
      </div>`;

    // Ações
    html += `<div class="pd-actions">
      <button class="btn btn-primary" id="pd-receipt-btn">⬇ Gerar recibo</button>`;

    if (c?.telefone) {
      html += `<button class="btn-wa" id="pd-wa-btn" style="width:100%;justify-content:center">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Enviar recibo por WhatsApp
      </button>`;
    }

    if (!paid) {
      html += `<button class="btn btn-secondary" id="pd-pay-btn">💳 Registrar pagamento</button>
               <button class="btn btn-danger" id="pd-del-btn">Cancelar compra</button>`;
    }

    html += `</div><div style="height:20px"></div>`;

    document.getElementById('pd-content').innerHTML = html;

    document.getElementById('pd-receipt-btn')?.addEventListener('click', () => showPurchaseReceipt(p.id));
    document.getElementById('pd-pay-btn')?.addEventListener('click', () => navigate('v-payment', { cid: p.cliente_id }));
    document.getElementById('pd-del-btn')?.addEventListener('click', () => _confirmCancelPurchase(p));
    document.getElementById('pd-wa-btn')?.addEventListener('click', () => showPurchaseReceipt(p.id));

  } catch(e) {
    console.error(e);
    toast('Erro ao carregar compra', 'error');
  } finally {
    setLoading(false);
  }
}

function _confirmCancelPurchase(p) {
  showModal(
    'Cancelar compra',
    `Cancelar a compra de ${fmt(p.valor_original)} registrada em ${fmtD(p.data_compra)}?\n\nEsta ação não pode ser desfeita.`,
    async () => {
      setLoading(true);
      try {
        await Api.deletePurchase(p.id);
        toast('Compra cancelada', 'success');
        goBack();
      } catch(e) {
        toast('Erro ao cancelar compra', 'error');
      } finally {
        setLoading(false);
      }
    },
    'btn-danger', 'Sim, cancelar'
  );
}

/* ══════════════════════════════════════════════════
   CONTEXT MENU
══════════════════════════════════════════════════ */

let _ctxActive = null;

function showCtxMenu(anchorEl, items) {
  closeCtxMenu();

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.id = 'ctx-menu';

  menu.innerHTML = items.map((item, i) =>
    `<button class="ctx-item${item.danger ? ' danger' : ''}" data-idx="${i}">
      <span class="ctx-ico">${item.icon}</span>
      ${item.label}
    </button>`
  ).join('');

  document.body.appendChild(menu);

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  const mW = 200;
  let left = rect.right - mW;
  let top  = rect.bottom + 6;
  if (left < 8) left = 8;
  if (top + 160 > window.innerHeight) top = rect.top - 160;
  menu.style.left = left + 'px';
  menu.style.top  = top  + 'px';
  menu.style.width = mW + 'px';

  menu.querySelectorAll('.ctx-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      closeCtxMenu();
      items[idx].action();
    });
  });

  _ctxActive = menu;

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', _closeCtxOnOutside, { once: true });
  }, 10);
}

function _closeCtxOnOutside(e) {
  if (_ctxActive && !_ctxActive.contains(e.target)) closeCtxMenu();
}

function closeCtxMenu() {
  if (_ctxActive) { _ctxActive.remove(); _ctxActive = null; }
  document.removeEventListener('click', _closeCtxOnOutside);
}
