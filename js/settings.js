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
  const jurosModo = document.getElementById('s-juros-modo');
  const jurosUmaVez = document.getElementById('s-juros-uma-vez');

  if (inp) inp.value   = s.empresa   || '';
  if (tog) tog.checked = !!s.darkMode;
  if (jurosModo) jurosModo.value = s.jurosModo || 'mensal';
  if (jurosUmaVez) jurosUmaVez.checked = !!s.jurosUmaVez;
}

function saveSettings() {
  const empresa  = document.getElementById('s-empresa')?.value.trim()  ?? '';
  const darkMode = document.getElementById('s-dark-mode')?.checked      ?? false;
  const jurosModo = document.getElementById('s-juros-modo')?.value || 'mensal';
  const jurosUmaVez = document.getElementById('s-juros-uma-vez')?.checked || false;
  Settings.save({ empresa, darkMode, jurosModo, jurosUmaVez });
  toast('Configurações salvas', 'success');
  goBack();
}
