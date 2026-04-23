/* ═══════════════════════════════════════════════════
   js/ui.js — Utilitários de interface

   Toast, modal de confirmação, loading bar
   e funções utilitárias de formatação/data.
   ═══════════════════════════════════════════════════ */

/* ── Formatação ──────────────────────────────────── */

/** Formata número como moeda BRL: R$ 1.234,56 */
function fmt(value) {
  return 'R$\u00A0' + value.toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formata string ISO 'YYYY-MM-DD' como 'DD/MM/YYYY' */
function fmtD(str) {
  if (!str) return '–';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

/** Retorna a data de hoje no formato 'YYYY-MM-DD' */
function today() {
  return new Date().toISOString().split('T')[0];
}

/** Soma N dias a uma data ISO e retorna nova data ISO */
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

/** Diferença em dias entre duas datas ISO (b - a) */
function daysDiff(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / 864e5);
}

/** Gera um ID único simplificado */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ── Loading Bar ─────────────────────────────────── */

function setLoading(show) {
  document.getElementById('loading-bar').style.display = show ? 'block' : 'none';
}

/* ── Toast ───────────────────────────────────────── */

let _toastTimer;

/**
 * Exibe um toast temporário na parte inferior da tela.
 * @param {string} msg   - texto da mensagem
 * @param {string} type  - '' | 'success' | 'error'
 */
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ── Modal de confirmação ────────────────────────── */

/**
 * Exibe um bottom-sheet de confirmação.
 * @param {string}   title   - título do modal
 * @param {string}   body    - texto descritivo (suporta \n)
 * @param {Function} onOk    - callback executado ao confirmar
 * @param {string}   btnCls  - classe do botão de confirmação (padrão: btn-primary)
 * @param {string}   btnText - texto do botão de confirmação (opcional)
 */
function showModal(title, body, onOk, btnCls = 'btn-primary', btnText = null) {
  document.getElementById('ov-title').textContent = title;
  document.getElementById('ov-body').textContent  = body;

  const btn = document.getElementById('ov-ok');
  btn.className   = `btn ${btnCls}`;
  btn.textContent = btnText ?? (btnCls === 'btn-danger' ? 'Sim, confirmar' : 'Confirmar');
  btn.onclick     = () => { closeModal(); onOk(); };

  document.getElementById('overlay').classList.add('show');
}

function closeModal() {
  document.getElementById('overlay').classList.remove('show');
}
