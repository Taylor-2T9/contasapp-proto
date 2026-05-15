/* ═══════════════════════════════════════════════════
   js/engine.js — Lógica de negócio (cálculos puros)

   Todas as funções são síncronas e recebem os dados
   como parâmetro. Nenhuma chamada de API aqui.
   ═══════════════════════════════════════════════════ */

/**
 * Retorna quantos dias a compra está em atraso (0 se não estiver).
 */
function daysOverdue(purchase) {
  if (purchase.status === 'pago') return 0;
  const t = today();
  if (!purchase.data_vencimento || t <= purchase.data_vencimento) return 0;
  return daysDiff(purchase.data_vencimento, t);
}

/**
 * Calcula os juros acumulados de uma compra.
 *
 * Leva em conta as configurações por cliente:
 *   - client.juros_modalidade: 'diario' | 'semanal' | 'mensal' (padrão: 'mensal')
 *   - client.juros_unico: true  → aplica a taxa UMA única vez quando entrar em atraso,
 *                                 nunca volta a crescer depois disso.
 *                         false → juros crescem proporcionalmente com o tempo.
 *
 * @param {Object} purchase - objeto da compra
 * @param {Object} client   - objeto do cliente (taxa_juros, juros_modalidade, juros_unico)
 */
function calcInterest(purchase, client) {
  const days = daysOverdue(purchase);
  if (days <= 0 || !client) return 0;

  const rate = parseFloat(client.taxa_juros) || 0;
  if (rate <= 0) return 0;

  const modalidade = client.juros_modalidade || 'mensal';
  const jurosUnico = !!client.juros_unico;

  // Se juros único: aplica a taxa uma única vez, independente dos dias
  if (jurosUnico) {
    return purchase.valor_original * (rate / 100);
  }

  // Juros proporcional conforme modalidade
  let periodos;
  if (modalidade === 'diario') {
    periodos = days;
  } else if (modalidade === 'semanal') {
    periodos = days / 7;
  } else {
    periodos = days / 30;
  }

  return purchase.valor_original * (rate / 100) * periodos;
}

/**
 * Valor total da compra com juros.
 */
function updatedVal(purchase, client) {
  return purchase.valor_original + calcInterest(purchase, client);
}

/**
 * Valor ainda devido na compra, descontando o que já foi abatido.
 */
function netVal(purchase, client) {
  return Math.max(0, updatedVal(purchase, client) - (purchase.abatido || 0));
}

/**
 * Saldo devedor total de um cliente (apenas compras pendentes).
 */
function clientBalance(purchases, client) {
  return purchases
    .filter(p => p.status === 'pendente')
    .reduce((sum, p) => sum + netVal(p, client), 0);
}

/**
 * Retorna 'ok', 'warn' (≥80% do limite) ou 'over' (≥100% do limite).
 */
function clientStatus(balance, limiteCreditoStr) {
  const limite = parseFloat(limiteCreditoStr) || 0;
  if (!limite) return 'ok';
  const ratio = balance / limite;
  return ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
}

/**
 * Verifica se o cliente tem alguma compra em atraso.
 */
function hasOverduePurchases(purchases) {
  return purchases.some(p => p.status === 'pendente' && daysOverdue(p) > 0);
}

/**
 * Reconstrói os campos status/abatido de todas as compras
 * de um cliente a partir do zero, repassando os pagamentos
 * em ordem cronológica (o mais antigo primeiro).
 *
 * Útil após excluir um pagamento, para garantir consistência.
 *
 * @param {Array}  purchases - compras do cliente
 * @param {Array}  payments  - pagamentos do cliente (já sem o excluído)
 * @param {Object} client    - cliente (para cálculo de juros)
 * @returns {Array} cópia das compras com status e abatido recalculados
 */
function reconcilePurchases(purchases, payments, client) {
  // Reseta todas as compras para pendente/abatido=0
  const working = purchases.map(p => ({ ...p, status: 'pendente', abatido: 0 }));

  // Ordena pagamentos do mais antigo para o mais recente
  const sorted = [...payments].sort((a, b) => new Date(a.data) - new Date(b.data));

  for (const payment of sorted) {
    let remaining = payment.valor;

    // Compras pendentes ordenadas pela data de compra (mais antiga primeiro)
    const pending = working
      .filter(p => p.status === 'pendente')
      .sort((a, b) => new Date(a.data_compra) - new Date(b.data_compra));

    for (const p of pending) {
      if (remaining <= 0) break;

      const owed = updatedVal(p, client) - (p.abatido || 0);

      if (remaining >= owed) {
        // Pagamento quita esta compra integralmente
        p.status  = 'pago';
        p.abatido = (p.abatido || 0) + owed;
        remaining -= owed;
      } else {
        // Pagamento parcial: abate mas não quita
        p.abatido = (p.abatido || 0) + remaining;
        remaining = 0;
      }
    }
  }

  return working;
}
