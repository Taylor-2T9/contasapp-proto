/* ═══════════════════════════════════════════════════
   js/export.js — Exportação para Excel (SheetJS)

   Gera um arquivo .xlsx com 4 abas:
     1. Clientes     — cadastro completo
     2. Compras      — todas as compras com status e juros
     3. Pagamentos   — todos os pagamentos
     4. Resumo       — totais consolidados por cliente
   ═══════════════════════════════════════════════════ */

async function exportToExcel() {
  setLoading(true);
  try {
    /* ── 1. Busca todos os dados ─────────────────── */
    const [clients, purchases, payments] = await Promise.all([
      Api.getAllClients(),
      Api.getPurchases(),
      Api.getPayments(),
    ]);

    /* ── 2. Monta lookup nome por id ─────────────── */
    const clientMap = {};
    for (const c of clients) clientMap[c.id] = c;

    const wb = XLSX.utils.book_new();

    /* ══════════════════════════════════════════════
       ABA 1 — CLIENTES
    ══════════════════════════════════════════════ */
    const clientRows = clients.map(c => ({
      'ID':                c.id,
      'Nome':              c.nome,
      'Telefone':          c.telefone || '—',
      'Limite (R$)':       parseFloat(c.limite_credito) || 0,
      'Juros mensal (%)':  parseFloat(c.taxa_juros)     || 0,
      'Carência (dias)':   parseInt(c.dias_tolerancia)  || 30,
      'Status':            c.ativo === false ? 'Inativo' : c.bloqueado ? 'Bloqueado' : 'Ativo',
      'Cadastro':          fmtD(c.created_at),
    }));

    const wsClientes = XLSX.utils.json_to_sheet(clientRows);
    _styleSheet(wsClientes, [20, 22, 16, 14, 16, 16, 12, 14]);
    XLSX.utils.book_append_sheet(wb, wsClientes, 'Clientes');

    /* ══════════════════════════════════════════════
       ABA 2 — COMPRAS
    ══════════════════════════════════════════════ */
    const purchaseRows = purchases
      .sort((a, b) => new Date(b.data_compra) - new Date(a.data_compra))
      .map(p => {
        const c       = clientMap[p.cliente_id];
        const int     = calcInterest(p, c);
        const upd     = updatedVal(p, c);
        const net     = netVal(p, c);
        const ov      = daysOverdue(p);
        return {
          'ID':                   p.id,
          'Cliente':              c ? c.nome : '—',
          'Data da compra':       fmtD(p.data_compra),
          'Vencimento':           fmtD(p.data_vencimento),
          'Valor original (R$)':  p.valor_original,
          'Juros acum. (R$)':     parseFloat(int.toFixed(2)),
          'Valor total (R$)':     parseFloat(upd.toFixed(2)),
          'Abatido (R$)':         parseFloat((p.abatido || 0).toFixed(2)),
          'Restante (R$)':        parseFloat(net.toFixed(2)),
          'Dias em atraso':       ov,
          'Status':               p.status === 'pago' ? 'Pago' : ov > 0 ? 'Em atraso' : 'Pendente',
          'Observação':           p.observacao || '—',
        };
      });

    const wsCompras = XLSX.utils.json_to_sheet(purchaseRows.length ? purchaseRows : [{}]);
    _styleSheet(wsCompras, [20, 22, 16, 14, 18, 16, 16, 14, 14, 14, 12, 28]);
    XLSX.utils.book_append_sheet(wb, wsCompras, 'Compras');

    /* ══════════════════════════════════════════════
       ABA 3 — PAGAMENTOS
    ══════════════════════════════════════════════ */
    const paymentRows = payments
      .sort((a, b) => new Date(b.data) - new Date(a.data))
      .map(p => {
        const c = clientMap[p.cliente_id];
        return {
          'ID':           p.id,
          'Cliente':      c ? c.nome : '—',
          'Data':         fmtD(p.data),
          'Valor (R$)':   p.valor,
        };
      });

    const wsPagamentos = XLSX.utils.json_to_sheet(paymentRows.length ? paymentRows : [{}]);
    _styleSheet(wsPagamentos, [20, 22, 14, 14]);
    XLSX.utils.book_append_sheet(wb, wsPagamentos, 'Pagamentos');

    /* ══════════════════════════════════════════════
       ABA 4 — RESUMO POR CLIENTE
    ══════════════════════════════════════════════ */
    const resumoRows = clients.map(c => {
      const ps          = purchases.filter(p => p.cliente_id === c.id);
      const bal         = clientBalance(ps, c);
      const totalInt    = ps.filter(p => p.status === 'pendente').reduce((s, p) => s + calcInterest(p, c), 0);
      const totalComp   = ps.reduce((s, p) => s + p.valor_original, 0);
      const totalPago   = payments.filter(p => p.cliente_id === c.id).reduce((s, p) => s + p.valor, 0);
      const emAtraso    = ps.filter(p => p.status === 'pendente' && daysOverdue(p) > 0).length;
      const st          = clientStatus(bal, c.limite_credito);
      const lim         = parseFloat(c.limite_credito) || 0;

      return {
        'Cliente':                c.nome,
        'Dívida atual (R$)':      parseFloat(bal.toFixed(2)),
        'Juros acumulados (R$)':  parseFloat(totalInt.toFixed(2)),
        'Limite (R$)':            lim,
        'Saldo disponível (R$)':  parseFloat(Math.max(0, lim - bal).toFixed(2)),
        'Total comprado (R$)':    parseFloat(totalComp.toFixed(2)),
        'Total recebido (R$)':    parseFloat(totalPago.toFixed(2)),
        'Compras pendentes':      ps.filter(p => p.status === 'pendente').length,
        'Compras quitadas':       ps.filter(p => p.status === 'pago').length,
        'Em atraso (qtd)':        emAtraso,
        'Situação':               st === 'over' ? 'Acima do limite' : st === 'warn' ? 'Quase no limite' : 'Regular',
        'Status':                 c.ativo === false ? 'Inativo' : c.bloqueado ? 'Bloqueado' : 'Ativo',
      };
    }).sort((a, b) => b['Dívida atual (R$)'] - a['Dívida atual (R$)']);

    const wsResumo = XLSX.utils.json_to_sheet(resumoRows.length ? resumoRows : [{}]);
    _styleSheet(wsResumo, [22, 18, 20, 14, 20, 18, 18, 18, 16, 16, 16, 12]);
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

    /* ── 3. Baixa o arquivo ──────────────────────── */
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `ContasApp_${date}.xlsx`);

    toast('Planilha exportada com sucesso!', 'success');
  } catch (e) {
    console.error(e);
    toast('Erro ao gerar a planilha', 'error');
  } finally {
    setLoading(false);
  }
}

/* ── Aplica largura de colunas e estilo de cabeçalho ─ */
function _styleSheet(ws, colWidths) {
  /* Larguras */
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  /* Estilo do cabeçalho (linha 1) */
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cell = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cell]) continue;
    ws[cell].s = {
      font:      { bold: true, color: { rgb: 'FFFFFF' }, name: 'Arial', sz: 10 },
      fill:      { fgColor: { rgb: '111111' }, patternType: 'solid' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border:    {
        bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
        right:  { style: 'thin', color: { rgb: 'FFFFFF' } },
      },
    };
  }

  /* Estilo das linhas de dados */
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const isEven = row % 2 === 0;
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = XLSX.utils.encode_cell({ r: row, c: col });
      if (!ws[cell]) continue;
      ws[cell].s = {
        font:      { name: 'Arial', sz: 10 },
        fill:      isEven
          ? { fgColor: { rgb: 'F4F4F1' }, patternType: 'solid' }
          : { fgColor: { rgb: 'FFFFFF' }, patternType: 'solid' },
        alignment: { vertical: 'center' },
        border:    {
          bottom: { style: 'hair', color: { rgb: 'E4E4DF' } },
          right:  { style: 'hair', color: { rgb: 'E4E4DF' } },
        },
      };
    }
  }

  /* Congela a linha do cabeçalho */
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
}
