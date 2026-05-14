/* ═══════════════════════════════════════════════════
   js/receipt.js — Recibo como imagem PNG + WhatsApp

   Gera um recibo visual usando Canvas API.
   Permite baixar como PNG ou compartilhar via WhatsApp.
   ═══════════════════════════════════════════════════ */

/* ── Constantes visuais do recibo ─────────────────── */
const RC = {
  W: 600, PAD: 40,
  BG: '#FFFFFF', INK: '#111827',
  INK2: '#6B7280', INK3: '#9CA3AF',
  GREEN: '#059669', RED: '#DC2626', AMBER: '#D97706',
  BORDER: '#E5E7EB',
};

/**
 * Gera e exibe o recibo de uma compra específica.
 * Busca os dados da compra e cliente via API.
 *
 * @param {string} purchaseId
 */
async function showPurchaseReceipt(purchaseId) {
  setLoading(true);
  try {
    const purchases = await Api.getPurchases();
    const p = purchases.find(x => x.id === purchaseId);
    if (!p) { toast('Compra não encontrada', 'error'); return; }
    const c = await Api.getClient(p.cliente_id);
    if (!c) { toast('Cliente não encontrado', 'error'); return; }
    await _showReceiptSheet('purchase', p, c);
  } catch(e) {
    toast('Erro ao gerar recibo', 'error');
  } finally {
    setLoading(false);
  }
}

/**
 * Gera e exibe recibo de cobrança para um cliente.
 */
async function sendWhatsAppCobranca(clientId) {
  setLoading(true);
  try {
    const [c, purchases] = await Promise.all([
      Api.getClient(clientId),
      Api.getPurchases(clientId),
    ]);
    if (!c) return;
    const divida   = clientBalance(purchases, c);
    const vencidas = purchases.filter(p => p.status === 'pendente' && daysOverdue(p) > 0).length;
    const juros    = purchases.filter(p => p.status === 'pendente').reduce((s, p) => s + calcInterest(p, c), 0);
    await _showReceiptSheet('cobranca', { divida, vencidas, juros }, c);
  } catch(e) {
    toast('Erro ao gerar cobrança', 'error');
  } finally {
    setLoading(false);
  }
}

/**
 * Exibe o bottom sheet do recibo com preview + botões.
 */
async function _showReceiptSheet(type, data, client) {
  window.__receiptPurchases = await Api.getPurchases(client.id);
  const dataUrl = _drawReceipt(type, data, client);
  const overlay = document.getElementById('receipt-overlay');
  const content = document.getElementById('receipt-content');

  const hasWa = !!client.telefone;
  const fname = `recibo_${client.nome.split(' ')[0].toLowerCase()}_${today()}.png`;

  content.innerHTML = `
    <div style="padding:0">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 18px 12px;border-bottom:1px solid var(--border)">
        <span style="font-size:15px;font-weight:700;letter-spacing:-.3px">Recibo</span>
        <button id="receipt-close" style="background:none;border:none;cursor:pointer;color:var(--ink-3);font-size:18px;padding:0;line-height:1">✕</button>
      </div>
      <div style="padding:14px 18px">
        <img src="${dataUrl}" style="width:100%;border-radius:8px;border:1px solid var(--border);display:block;margin-bottom:12px" alt="Recibo">
        <div style="display:flex;flex-direction:column;gap:8px">
          <a href="${dataUrl}" download="${fname}" class="btn btn-primary" style="text-align:center;text-decoration:none;display:block">
            ⬇ Baixar recibo (PNG)
          </a>
          ${hasWa
            ? `<button id="receipt-wa" class="btn-wa">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Enviar por WhatsApp
              </button>`
            : `<p style="font-size:12px;color:var(--ink-3);text-align:center">Sem telefone cadastrado</p>`
          }
          <button id="receipt-close2" class="btn btn-secondary">Fechar</button>
        </div>
      </div>
    </div>`;

  overlay.classList.add('show');
  overlay.onclick = e => { if (e.target === overlay) closeReceipt(); };

  document.getElementById('receipt-close')?.addEventListener('click', closeReceipt);
  document.getElementById('receipt-close2')?.addEventListener('click', closeReceipt);
  document.getElementById('receipt-wa')?.addEventListener('click', () => {
    _openWhatsApp(client, _buildWaMessage(type, data, client));
  });
}

function closeReceipt() {
  document.getElementById('receipt-overlay').classList.remove('show');
}

/* ── Canvas receipt renderer ──────────────────────── */
function _drawReceipt(type, data, client) {
  const W = RC.W, PAD = RC.PAD;
  const canvas = document.createElement('canvas');

  // Calcula linhas de conteúdo
  const lines = _buildLines(type, data, client);
  const H = 80 + 64 + (lines.length * 36) + 80 + 80;

  canvas.width  = W;
  canvas.height = H;
  canvas.style.imageRendering = 'crisp-edges';

  const ctx = canvas.getContext('2d');

  // Fundo
  ctx.fillStyle = RC.BG;
  ctx.fillRect(0, 0, W, H);

  let y = 0;

  // ── Topo colorido ──────────────────────
  const topH = 80;
  ctx.fillStyle = type === 'payment' ? RC.GREEN : type === 'cobranca' ? RC.AMBER : RC.INK;
  ctx.fillRect(0, 0, W, topH);

  // Nome do estabelecimento
  const empresa = (typeof Settings !== 'undefined' ? Settings.get().empresa : '') || 'Meu Estabelecimento';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 22px Inter, system-ui, sans-serif';
  ctx.fillText(empresa, PAD, topH / 2 + 4);

  // Tipo à direita
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  const typeLabel = type === 'purchase' ? 'RECIBO DE COMPRA' : type === 'payment' ? 'RECIBO DE PAGAMENTO' : 'COBRANÇA';
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  ctx.fillText(typeLabel, W - PAD, topH / 2 + 4);
  ctx.textAlign = 'left';

  y = topH;

  // ── Valor principal ────────────────────
  const totalVal = type === 'purchase' ? data.valor_original
                 : type === 'payment'  ? data.valor
                 : data.divida;

  const valH = 64;
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, y, W, valH);
  _hLine(ctx, y, W);
  _hLine(ctx, y + valH, W);

  ctx.fillStyle = RC.INK3;
  ctx.font = '600 10px Inter, system-ui, sans-serif';
  ctx.fillText('VALOR', PAD, y + 20);

  ctx.fillStyle = RC.INK;
  ctx.font = '800 28px Inter, system-ui, sans-serif';
  ctx.fillText(fmt(totalVal), PAD, y + 52);

  // Data no canto direito
  const ts = _timestamp();
  ctx.fillStyle = RC.INK3;
  ctx.font = '500 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(ts, W - PAD, y + 20);
  ctx.textAlign = 'left';

  y += valH;

  // ── Linhas de detalhe ──────────────────
  const rowH = 36;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const ry = y + i * rowH;
    if (i % 2 === 1) {
      ctx.fillStyle = '#F9FAFB';
      ctx.fillRect(0, ry, W, rowH);
    }
    ctx.fillStyle = RC.INK2;
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.fillText(L.label, PAD, ry + 23);

    ctx.fillStyle = L.color || RC.INK;
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(L.value, W - PAD, ry + 23);
    ctx.textAlign = 'left';
  }
  _hLine(ctx, y + lines.length * rowH, W);

  y += lines.length * rowH;

  // ── Rodapé ─────────────────────────────
  const footH = 80;
  ctx.fillStyle = RC.BG;
  ctx.fillRect(0, y, W, footH);

  ctx.fillStyle = RC.INK3;
  ctx.font = '400 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Caderneta Digital', W / 2, y + 40);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}

function _buildLines(type, data, client) {
  const purchases = window.__receiptPurchases || [];
  const balance = clientBalance(purchases, client);
  const limite = parseFloat(client.limite_credito || 0);
  const disponivel = Math.max(0, limite - balance);

  if (type === 'purchase') {
    const rows = [
      { label: 'Cliente',     value: client.nome },
      { label: 'Data',        value: fmtD(data.data_compra) },
      { label: 'Vencimento',  value: fmtD(data.data_vencimento) },
      { label: 'Crédito disponível', value: fmt(disponivel), color: RC.GREEN },
    ];
    if (data.observacao) rows.push({ label: 'Descrição', value: data.observacao });
    rows.push({ label: 'Valor original', value: fmt(data.valor_original) });
    return rows;
  }
  if (type === 'payment') {
    return [
      { label: 'Cliente',         value: client.nome },
      { label: 'Data',            value: fmtD(data.data) },
      { label: 'Valor pago',      value: fmt(data.valor), color: RC.GREEN },
      ...(data._novoSaldo !== undefined
        ? [{ label: 'Saldo restante', value: fmt(data._novoSaldo), color: data._novoSaldo > 0 ? RC.AMBER : RC.GREEN }]
        : []),
    ];
  }
  // cobrança
  return [
    { label: 'Cliente', value: client.nome },
    { label: 'Limite restante', value: fmt(disponivel), color: RC.GREEN },
    { label: 'Cliente',         value: client.nome },
    { label: 'Dívida atual',    value: fmt(data.divida), color: RC.RED },
    ...(data.vencidas > 0 ? [{ label: 'Compras vencidas', value: `${data.vencidas}`, color: RC.RED }] : []),
    ...(data.juros > 0    ? [{ label: 'Juros acumulados', value: fmt(data.juros), color: RC.AMBER }] : []),
  ];
}

function _hLine(ctx, y, W) {
  ctx.beginPath();
  ctx.strokeStyle = RC.BORDER;
  ctx.lineWidth = 1;
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
}

function _timestamp() {
  const now = new Date();
  const d   = fmtD(today());
  const h   = now.getHours().toString().padStart(2,'0');
  const m   = now.getMinutes().toString().padStart(2,'0');
  return `${d} ${h}:${m}`;
}

/* ── WhatsApp ─────────────────────────────────────── */
function _buildWaMessage(type, data, client) {
  const nome = client.nome.split(' ')[0];
  if (type === 'purchase') {
    return `Olá ${nome}! 👋\n\nRegistrei uma compra de *${fmt(data.valor_original)}* em ${fmtD(data.data_compra)}.\n${data.observacao ? `Descrição: ${data.observacao}\n` : ''}Vencimento: ${fmtD(data.data_vencimento)}.\n\n_Caderneta Digital_`;
  }
  if (type === 'payment') {
    const resto = data._novoSaldo !== undefined ? `\nSaldo restante: *${fmt(data._novoSaldo)}*` : '';
    return `Olá ${nome}! ✅\n\nPagamento de *${fmt(data.valor)}* recebido em ${fmtD(data.data)}.${resto}\n\nObrigado! 🙏\n\n_Caderneta Digital_`;
  }
  const ov = data.vencidas > 0 ? `\n⚠️ *${data.vencidas}* compra${data.vencidas > 1 ? 's' : ''} vencida${data.vencidas > 1 ? 's' : ''}.` : '';
  const jr = data.juros > 0   ? `\nJuros: *${fmt(data.juros)}*` : '';
  return `Olá ${nome}! 👋\n\nSeu saldo em aberto é de *${fmt(data.divida)}*.${ov}${jr}\n\nQualquer dúvida, estou à disposição! 😊\n\n_Caderneta Digital_`;
}

function _openWhatsApp(client, message) {
  if (!client.telefone) { toast('Cliente sem telefone cadastrado', 'error'); return; }
  const digits = client.telefone.replace(/\D/g, '');
  const phone  = digits.startsWith('55') ? digits : '55' + digits;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
}

/* ── Recibo pós-confirmação (chamado internamente) ─── */
async function showReceipt(type, data, client) {
  _showReceiptSheet(type, data, client);
}
