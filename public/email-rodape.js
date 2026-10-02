// E-mail > Rodapé — textos fixos que o layout coloca no fim de todo e-mail
// (aviso de "não precisa responder", por que recebeu a notificação e onde
// desativar em cada produto). Ver routes/admin-email.js.

const conteudo = document.getElementById('conteudo');

const CAMPOS = [
  { chave: 'rodape_nao_responda', rotulo: 'Aviso de e-mail automático', ajuda: 'Aparece em todos os e-mails.' },
  { chave: 'rodape_notificacao', rotulo: 'Por que recebeu (notificações)', ajuda: '<code>{{notificacao}}</code> = nome do alerta (ex.: "Novo agendamento").' },
  { chave: 'rodape_desativar', rotulo: 'Como desativar (notificações)', ajuda: '<code>{{caminho}}</code> é obrigatório — vira o caminho do produto abaixo, com link.' },
  { chave: 'caminho_notificacoes_studio', rotulo: 'Studio — caminho no menu', ajuda: 'Como o cliente chega na tela de notificações do Studio.' },
  { chave: 'caminho_notificacoes_studio_url', rotulo: 'Studio — link da tela', ajuda: 'Começa com https://' },
  { chave: 'caminho_notificacoes_crm', rotulo: 'CRM — caminho no menu', ajuda: 'Como o cliente chega na tela de notificações do CRM.' },
  { chave: 'caminho_notificacoes_crm_url', rotulo: 'CRM — link da tela', ajuda: 'Começa com https://' },
];

// Modelo fictício só pra prévia do rodapé de notificação.
const MODELO_PREVIA = {
  produto: 'studio', chave: 'notificacao', tipo: 'notificacao',
  assunto: 'Novo agendamento: Ana Souza', titulo: 'Novo agendamento: Ana Souza',
  corpo: 'Corte + escova, sex 03/10 às 14:30', cta_texto: 'Abrir no Studio',
  variaveis: [{ nome: 'notificacao', exemplo: 'Novo agendamento' }],
};

let timer = null;

async function carregar() {
  conteudo.innerHTML = '<div class="vazio">Carregando...</div>';
  const r = await api('/api/email/configuracoes');
  if (!r) return;
  if (r.__erro) { conteudo.innerHTML = `<div class="vazio">${escapeHtml(r.__erro)}</div>`; return; }
  conteudo.innerHTML = `
    <h2 class="titulo-detalhe">Rodapé dos e-mails</h2>
    <p class="vazio-inline">Textos que entram automaticamente no fim dos e-mails. Valem para todos os modelos em até 1 minuto depois de salvar.</p>
    <div style="display:grid;grid-template-columns:minmax(320px,1fr) minmax(320px,1.1fr);gap:20px;align-items:start;margin-top:12px" id="rodape-grid">
      <section class="secao-detalhe">
        ${CAMPOS.map((c) => `
          <label for="cfg-${c.chave}" style="display:block;margin-top:14px;font-weight:600">${escapeHtml(c.rotulo)}</label>
          <input type="text" id="cfg-${c.chave}" data-chave="${c.chave}" maxlength="500" value="${escapeHtml(r.config[c.chave] || '')}">
          <div class="vazio-inline" style="font-size:12.5px;margin-top:4px">${c.ajuda}</div>`).join('')}
        <button class="btn-primario btn-auto" id="btn-salvar" style="margin-top:20px">Salvar</button>
      </section>
      <section class="secao-detalhe" style="position:sticky;top:16px">
        <div style="font-weight:600;margin-bottom:8px">Prévia (notificação do Studio)</div>
        <iframe id="previa" title="Prévia" sandbox="" style="width:100%;height:640px;border:1px solid var(--border);border-radius:10px;background:#F8F9FC"></iframe>
      </section>
    </div>
  `;
  if (window.matchMedia('(max-width: 900px)').matches) document.getElementById('rodape-grid').style.gridTemplateColumns = '1fr';
  conteudo.querySelectorAll('[data-chave]').forEach((el) => el.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(previa, 450);
  }));
  document.getElementById('btn-salvar').addEventListener('click', salvar);
  previa();
}

function lerValores() {
  const out = {};
  conteudo.querySelectorAll('[data-chave]').forEach((el) => { out[el.dataset.chave] = el.value.trim(); });
  return out;
}

async function previa() {
  const r = await api('/api/email/preview', { method: 'POST', body: JSON.stringify({ modelo: MODELO_PREVIA, config: lerValores() }) });
  if (!r) return;
  document.getElementById('previa').srcdoc = r.__erro
    ? `<p style="font-family:Arial;padding:24px;color:#B42318">${escapeHtml(r.__erro)}</p>`
    : r.html;
}

async function salvar() {
  const btn = document.getElementById('btn-salvar');
  btn.disabled = true;
  const r = await api('/api/email/configuracoes', { method: 'PUT', body: JSON.stringify(lerValores()) });
  btn.disabled = false;
  if (!r) return;
  if (r.__erro) { avisar(r.__erro, true); return; }
  avisar('Rodapé salvo. Vale no próximo envio, em até 1 minuto.');
}

carregar();
