/* ═══════════════════════════════════════════════════
   js/settings.js — Configurações do app

   Delegam para Api.getSettings() / Api.saveSettings()
   que persistem localmente (por dispositivo).
   ═══════════════════════════════════════════════════ */

const Settings = {
  get()          { return Api.getSettings(); },
  save(data)     { const s = Api.saveSettings(data); this.apply(s); return s; },

  apply(s = null) {
    const settings = s ?? this.get();
    document.documentElement.classList.toggle('dark', !!settings.darkMode);
  },
};

/* Renderiza a tela de configurações */
function setupSettingsView() {
  const s = Settings.get();
  const inp = document.getElementById('s-empresa');
  const tog = document.getElementById('s-dark-mode');
  if (inp) inp.value   = s.empresa   || '';
  if (tog) tog.checked = !!s.darkMode;

  // Modalidade de juros
  const mod = document.getElementById('s-juros-modalidade');
  if (mod) mod.value = s.juros_modalidade || 'mensal';

  // Juros único
  const uni = document.getElementById('s-juros-unico');
  if (uni) uni.checked = !!s.juros_unico;
}

function saveSettings() {
  const empresa        = document.getElementById('s-empresa')?.value.trim()          ?? '';
  const darkMode       = document.getElementById('s-dark-mode')?.checked              ?? false;
  const juros_modalidade = document.getElementById('s-juros-modalidade')?.value      || 'mensal';
  const juros_unico    = document.getElementById('s-juros-unico')?.checked            ?? false;
  Settings.save({ empresa, darkMode, juros_modalidade, juros_unico });
  toast('Configurações salvas', 'success');
  goBack();
}
