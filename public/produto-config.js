// Produtos > Studio / Produtos > People — Plano e cobranças, Bloqueios,
// Mensagens, Configurações gerais, tudo por produto (pedido do Bruno:
// "todo o que for relacionado ao produto ser separado... People deve ter
// suas configurações apartada de Studio, são públicos diferentes").
// Arquivo compartilhado entre produtos-studio.html e produtos-people.html —
// cada um seta `window.PRODUTO` ('studio'/'people') antes deste script, pra
// não duplicar toda a lógica de abas/modal em dois arquivos quase iguais
// (mesmo raciocínio de fonte única do shell.js pro menu).

const PRODUTO = window.PRODUTO;
const PRODUTO_LABEL = { studio: 'Studio', people: 'People', crm: 'CRM' }[PRODUTO];

// token / identificação do admin / dropdown "Sair" vivem em shell.js (US53),
// carregado antes deste script.

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('kyvvo_admin_token');
    window.location.href = '/login.html';
    return null;
  }
  return res.json();
}

const conteudo = document.getElementById('conteudo');

// ---------- Modal genérico + toast (duplicado intencionalmente, ver comentário acima sobre isolamento entre telas admin) ----------
function escFecharModal(e) {
  if (e.key === 'Escape') fecharModal();
}
function fecharModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', escFecharModal);
}
function abrirModal(tituloHtml, conteudoHtml, { larga = false } = {}) {
  fecharModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card${larga ? ' modal-card-larga' : ''}">
      <button class="modal-close" id="modal-close" aria-label="Fechar">✕</button>
      ${tituloHtml}
      ${conteudoHtml}
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('modal-close').addEventListener('click', fecharModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); });
  document.addEventListener('keydown', escFecharModal);
  return overlay;
}
function mostrarToast(mensagem, tipo = 'sucesso') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = (tipo === 'sucesso' ? '✅ ' : '❌ ') + mensagem;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-saindo');
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}
function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function formatarPreco(preco) {
  return preco != null ? `R$ ${Number(preco).toFixed(2).replace('.', ',')}` : '—';
}
function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
function formatarLimiteAdmin(valor) {
  return valor == null ? 'Ilimitado' : String(valor);
}

// US67/CA04 — rótulos dos eixos estruturais do Studio (somente leitura).
const TECNOLOGIA_LABELS = { bot: 'Bot', ia: 'IA' };
const TIPO_NUMERO_LABELS = { proprio: 'Número próprio', kyvvo: 'Número Kyvvo' };
const PLANO_LIMITE_CHAVES = ['conversas_mes', 'profissionais', 'unidades'];
const PLANO_LIMITE_ROTULOS = { conversas_mes: 'Conversas/mês', profissionais: 'Profissionais', unidades: 'Unidades' };
const PLANO_LIMITE_CHAVES_PEOPLE = ['vagas_ativas', 'candidatos_notificados_mes'];
const PLANO_LIMITE_ROTULOS_PEOPLE = { vagas_ativas: 'Vagas ativas simultâneas', candidatos_notificados_mes: 'Candidatos notificados/mês (WhatsApp)' };

// "Bloqueios" — só carência de inadimplência por enquanto (o único
// bloqueio que existe hoje). Resto de config geral vai na aba própria.
const CONFIG_BLOQUEIOS = ['carencia_dias_inadimplencia'];
const CONFIG_GERAL_ORDEM = [
  'trial_dias', 'max_tentativas_reenvio_token', 'email_suporte', 'whatsapp_suporte',
  'whatsapp_horario_inicio', 'whatsapp_horario_fim', 'whatsapp_dias_uteis',
];
const CONFIG_SISTEMA_LABELS = {
  trial_dias: 'Dias de trial',
  carencia_dias_inadimplencia: 'Dias de carência após inadimplência',
  max_tentativas_reenvio_token: 'Máximo de tentativas de reenvio de token',
  email_suporte: 'E-mail de suporte exibido no portal',
  whatsapp_suporte: 'WhatsApp de suporte',
  whatsapp_horario_inicio: 'Início do horário comercial (WhatsApp, HH:MM)',
  whatsapp_horario_fim: 'Fim do horário comercial (WhatsApp, HH:MM)',
  whatsapp_dias_uteis: 'Dias úteis (WhatsApp, 1=seg...7=dom, separado por vírgula)',
};
const CONFIG_SISTEMA_NUMERICAS = new Set(['trial_dias', 'carencia_dias_inadimplencia', 'max_tentativas_reenvio_token']);

const SEVERIDADE_LABELS = { info: 'Info', aviso: 'Aviso', erro: 'Erro' };
const SEVERIDADE_CLASSES = { info: 'badge-status-ativo', aviso: 'badge-status-nao-ativado', erro: 'badge-status-inadimplente' };

// Catálogo de eventos obrigatórios (Handoff v2 do People, Parte 5.2) — só
// existe pro People; Studio/CRM não têm esse conceito ainda.
const TEMPLATE_STATUS_LABELS = { pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };
// Estimativa de referência (Meta Cloud API, categoria Utility) — não é
// tabela oficial, é só pra dar noção de ordem de grandeza do COGS por
// candidatura antes de marcar um evento como obrigatório (Parte 5.2:
// "o admin exibe o impacto estimado de custo"). Ajustar aqui conforme a
// tabela vigente da Meta, sem precisar mexer em mais nada.
const CUSTO_ESTIMADO_UTILITY_BRL = 0.15;

let dados = null;
let mensagens = [];
let eventosCatalogo = [];
const sistemaEmEdicao = new Set();
let estado = { aba: 'plano' };

async function carregar() {
  conteudo.innerHTML = '<div class="vazio">Carregando...</div>';
  const chamadas = [
    api(`/api/configuracoes/${PRODUTO}`),
    api(`/api/mensagens?produto=${PRODUTO}`),
  ];
  if (PRODUTO === 'people') chamadas.push(api('/api/eventos-catalogo'));
  const [config, mensagensResp, eventosResp] = await Promise.all(chamadas);
  if (!config) return;
  dados = config;
  mensagens = (mensagensResp && mensagensResp.mensagens) || [];
  eventosCatalogo = (eventosResp && eventosResp.eventos) || [];
  render();
}

const ABAS = [
  { id: 'plano', label: 'Plano e cobranças' },
  { id: 'bloqueios', label: 'Bloqueios' },
  { id: 'mensagens', label: 'Mensagens' },
  { id: 'geral', label: 'Configurações gerais' },
  // Catálogo de eventos obrigatórios só existe pro People (Handoff v2,
  // Parte 5.2) — Studio/CRM não têm essa engrenagem ainda.
  ...(PRODUTO === 'people' ? [{ id: 'eventos', label: 'Eventos' }] : []),
];

function render() {
  conteudo.innerHTML = `
    <h2 class="titulo-detalhe">${PRODUTO_LABEL}</h2>
    <div class="subtabs">
      ${ABAS.map((a) => `<div class="tab ${estado.aba === a.id ? 'active' : ''}" data-aba="${a.id}">${a.label}</div>`).join('')}
    </div>
    <div id="conteudo-aba"></div>
  `;
  conteudo.querySelectorAll('[data-aba]').forEach((el) => {
    el.addEventListener('click', () => { estado.aba = el.dataset.aba; render(); });
  });
  renderAba();
}

function renderAba() {
  const alvo = document.getElementById('conteudo-aba');
  if (estado.aba === 'plano') {
    alvo.innerHTML = renderAbaPlano();
    wireEventosPlano();
  } else if (estado.aba === 'bloqueios') {
    alvo.innerHTML = renderAbaConfigLista(CONFIG_BLOQUEIOS, 'Nenhuma regra de bloqueio configurada.');
    wireEventosConfigGeral();
  } else if (estado.aba === 'mensagens') {
    alvo.innerHTML = renderAbaMensagens();
    wireEventosMensagens();
  } else if (estado.aba === 'geral') {
    alvo.innerHTML = `
      ${renderAbaConfigLista(CONFIG_GERAL_ORDEM, 'Nenhuma configuração geral.')}
      ${renderLogAuditoria()}
    `;
    wireEventosConfigGeral();
  } else if (estado.aba === 'eventos') {
    alvo.innerHTML = renderAbaEventosCatalogo();
    wireEventosEventosCatalogo();
  }
}

// ---------- Plano e cobranças ----------
function renderAbaPlano() {
  if (PRODUTO === 'people') {
    return `
      <section class="secao-detalhe">
        <h3>Preços dos planos — People</h3>
        <div class="tabela-wrapper">
          <table class="tabela-tenants">
            <thead><tr><th>Plano</th><th>Preço/mês</th><th>Vagas ativas</th><th>Notificados/mês</th><th>Ativo</th><th></th></tr></thead>
            <tbody>${dados.planos.map(renderLinhaPlanoPeople).join('') || '<tr><td colspan="6">Nenhum plano cadastrado.</td></tr>'}</tbody>
          </table>
        </div>
      </section>
    `;
  }
  if (PRODUTO === 'crm') {
    return `
      <section class="secao-detalhe">
        <h3>Preços dos planos — CRM</h3>
        <div class="tabela-wrapper">
          <table class="tabela-tenants">
            <thead><tr><th>Plano</th><th>Descrição</th><th>Preço/mês</th><th>Ativo</th><th></th></tr></thead>
            <tbody>${dados.planos.map(renderLinhaPlanoCrm).join('') || '<tr><td colspan="5">Nenhum plano cadastrado.</td></tr>'}</tbody>
          </table>
        </div>
      </section>
    `;
  }
  return `
    <section class="secao-detalhe">
      <h3>Preços dos planos — Studio</h3>
      <div class="tabela-wrapper">
        <table class="tabela-tenants">
          <thead><tr><th>Plano</th><th>Descrição</th><th>Destaque</th><th>Ativo</th><th></th></tr></thead>
          <tbody>${dados.planos.map(renderLinhaPlano).join('') || '<tr><td colspan="5">Nenhum plano cadastrado.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderLinhaPlano(plano) {
  const toggleAtivoClasse = plano.ativo ? 'toggle-on' : 'toggle-off';
  const toggleDestaqueClasse = plano.destaque ? 'toggle-on' : 'toggle-off';
  return `
    <tr data-plano="${plano.chave}">
      <td>${escapeHtml(plano.nome)}</td>
      <td>${escapeHtml(plano.descricao || '—')}</td>
      <td><span class="toggle-readonly ${toggleDestaqueClasse}" title="${plano.destaque ? 'Em destaque' : 'Sem destaque'}"></span></td>
      <td><span class="toggle-readonly ${toggleAtivoClasse}" title="${plano.ativo ? 'Ativo' : 'Inativo'}"></span></td>
      <td class="celula-acoes-plano"><button class="btn-secundario btn-tabela" data-acao="editar-plano" data-chave="${plano.chave}">Editar</button></td>
    </tr>
  `;
}

function renderLinhaPlanoPeople(plano) {
  const toggleAtivoClasse = plano.ativo ? 'toggle-on' : 'toggle-off';
  const limites = plano.limites || {};
  return `
    <tr data-plano="${plano.chave}">
      <td>${escapeHtml(plano.nome)}</td>
      <td>${formatarPreco(plano.preco_mensal)}</td>
      <td>${formatarLimiteAdmin(limites.vagas_ativas)}</td>
      <td>${formatarLimiteAdmin(limites.candidatos_notificados_mes)}</td>
      <td><span class="toggle-readonly ${toggleAtivoClasse}" title="${plano.ativo ? 'Ativo' : 'Inativo'}"></span></td>
      <td class="celula-acoes-plano"><button class="btn-secundario btn-tabela" data-acao="editar-plano-people" data-chave="${plano.chave}">Editar</button></td>
    </tr>
  `;
}

function wireEventosPlano() {
  conteudo.querySelectorAll('[data-acao="editar-plano"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalEditarPlano(btn.dataset.chave));
  });
  conteudo.querySelectorAll('[data-acao="editar-plano-people"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalEditarPlanoPeople(btn.dataset.chave));
  });
  conteudo.querySelectorAll('[data-acao="editar-plano-crm"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalEditarPlanoCrm(btn.dataset.chave));
  });
}

function renderLinhaPlanoCrm(plano) {
  const toggleAtivoClasse = plano.ativo ? 'toggle-on' : 'toggle-off';
  return `
    <tr data-plano="${plano.chave}">
      <td>${escapeHtml(plano.nome)}</td>
      <td>${escapeHtml(plano.descricao || '—')}</td>
      <td>${formatarPreco(plano.preco_mensal)}</td>
      <td><span class="toggle-readonly ${toggleAtivoClasse}" title="${plano.ativo ? 'Ativo' : 'Inativo'}"></span></td>
      <td class="celula-acoes-plano"><button class="btn-secundario btn-tabela" data-acao="editar-plano-crm" data-chave="${plano.chave}">Editar</button></td>
    </tr>
  `;
}

function abrirModalEditarPlanoCrm(chave) {
  const plano = dados.planos.find((p) => p.chave === chave);
  if (!plano) return;
  abrirModal(
    '<h3>Editar plano CRM</h3>',
    `
      <div class="modal-erro" id="plano-crm-erro"></div>
      <form id="form-editar-plano-crm">
        <label for="plano-crm-nome">Nome *</label>
        <input type="text" id="plano-crm-nome" value="${escapeHtml(plano.nome)}">
        <label for="plano-crm-descricao">Descrição</label>
        <input type="text" id="plano-crm-descricao" value="${escapeHtml(plano.descricao || '')}">
        <label for="plano-crm-preco">Preço mensal *</label>
        <input type="number" step="0.01" min="1" id="plano-crm-preco" value="${plano.preco_mensal}">
        <label class="toggle-linha"><span class="toggle-switch"><input type="checkbox" id="plano-crm-ativo" ${plano.ativo ? 'checked' : ''}><span class="toggle-switch-trilho"></span></span> Ativo</label>
        <p class="modal-texto">⚠️ Alterações de preço afetam apenas novas assinaturas.</p>
        <div class="modal-acoes">
          <button type="button" class="btn-secundario" id="btn-sair-editar-plano-crm">Sair</button>
          <button type="submit" class="btn-primario" id="btn-salvar-editar-plano-crm">Salvar</button>
        </div>
      </form>
    `
  );
  document.getElementById('btn-sair-editar-plano-crm').addEventListener('click', fecharModal);
  document.getElementById('form-editar-plano-crm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await salvarPlanoCrm(chave);
  });
}

async function salvarPlanoCrm(chave) {
  const nome = document.getElementById('plano-crm-nome').value.trim();
  const descricao = document.getElementById('plano-crm-descricao').value.trim();
  const precoMensal = document.getElementById('plano-crm-preco').value;
  const ativo = document.getElementById('plano-crm-ativo').checked;
  const erroEl = document.getElementById('plano-crm-erro');
  erroEl.textContent = '';
  if (!nome) { erroEl.textContent = 'Nome do plano não pode ficar em branco.'; return; }
  if (!(Number(precoMensal) >= 1)) { erroEl.textContent = 'Preço mensal deve ser no mínimo R$ 1,00.'; return; }

  const resultado = await api(`/api/configuracoes/planos/${chave}`, {
    method: 'PATCH',
    body: JSON.stringify({ nome, descricao, preco_mensal: Number(precoMensal), ativo }),
  });
  if (resultado && !resultado.error) {
    fecharModal();
    mostrarToast('Plano atualizado com sucesso.', 'sucesso');
    await carregar();
  } else {
    erroEl.textContent = (resultado && resultado.error) || 'Erro ao salvar plano.';
  }
}

function abrirModalEditarPlanoPeople(chave) {
  const plano = dados.planos.find((p) => p.chave === chave);
  if (!plano) return;
  const limites = plano.limites || {};
  const camposLimites = PLANO_LIMITE_CHAVES_PEOPLE.map((chaveLimite) => `
    <div>
      <label for="plano-people-limite-${chaveLimite}">${PLANO_LIMITE_ROTULOS_PEOPLE[chaveLimite]}</label>
      <input type="number" min="0" id="plano-people-limite-${chaveLimite}" value="${limites[chaveLimite] ?? ''}" placeholder="ilimitado">
    </div>
  `).join('');

  abrirModal(
    '<h3>Editar plano People</h3>',
    `
      <div class="modal-erro" id="plano-people-erro"></div>
      <form id="form-editar-plano-people">
        <label for="plano-people-nome">Nome *</label>
        <input type="text" id="plano-people-nome" value="${escapeHtml(plano.nome)}">
        <label for="plano-people-descricao">Descrição</label>
        <input type="text" id="plano-people-descricao" value="${escapeHtml(plano.descricao || '')}">
        <label for="plano-people-preco">Preço mensal *</label>
        <input type="number" step="0.01" min="1" id="plano-people-preco" value="${plano.preco_mensal}">
        <label>Limites de uso</label>
        <div class="pagamento-grid-2col">${camposLimites}</div>
        <label for="plano-people-limite-disparos">Limite de disparos de automação (WhatsApp)</label>
        <input type="number" step="1" min="0" id="plano-people-limite-disparos" value="${plano.limite_disparos ?? ''}" placeholder="ilimitado">
        <div class="ajuda" style="color:var(--muted-strong);font-size:12px;margin-top:-8px;margin-bottom:12px">Diferente de "Candidatos notificados/mês" acima — este é o limite mensal das mensagens automáticas do fluxo de vaga (Automações &gt; Disparos), a mesma trava usada no Studio.</div>
        <label class="toggle-linha"><span class="toggle-switch"><input type="checkbox" id="plano-people-ativo" ${plano.ativo ? 'checked' : ''}><span class="toggle-switch-trilho"></span></span> Ativo</label>
        <p class="modal-texto">⚠️ Alterações de preço afetam apenas novas assinaturas.</p>
        <div class="modal-acoes">
          <button type="button" class="btn-secundario" id="btn-sair-editar-plano-people">Sair</button>
          <button type="submit" class="btn-primario" id="btn-salvar-editar-plano-people">Salvar</button>
        </div>
      </form>
    `
  );
  document.getElementById('btn-sair-editar-plano-people').addEventListener('click', fecharModal);
  document.getElementById('form-editar-plano-people').addEventListener('submit', async (e) => {
    e.preventDefault();
    await salvarPlanoPeople(chave);
  });
}

async function salvarPlanoPeople(chave) {
  const nome = document.getElementById('plano-people-nome').value.trim();
  const descricao = document.getElementById('plano-people-descricao').value.trim();
  const precoMensal = document.getElementById('plano-people-preco').value;
  const ativo = document.getElementById('plano-people-ativo').checked;
  const limites = Object.fromEntries(PLANO_LIMITE_CHAVES_PEOPLE.map((c) => {
    const v = document.getElementById(`plano-people-limite-${c}`).value.trim();
    return [c, v === '' ? null : Number(v)];
  }));
  const limiteDisparosBruto = document.getElementById('plano-people-limite-disparos').value.trim();
  const erroEl = document.getElementById('plano-people-erro');
  erroEl.textContent = '';
  if (!nome) { erroEl.textContent = 'Nome do plano não pode ficar em branco.'; return; }
  if (!(Number(precoMensal) >= 1)) { erroEl.textContent = 'Preço mensal deve ser no mínimo R$ 1,00.'; return; }

  const resultado = await api(`/api/configuracoes/planos/${chave}`, {
    method: 'PATCH',
    body: JSON.stringify({
      nome, descricao, preco_mensal: Number(precoMensal), ativo, limites,
      limite_disparos: limiteDisparosBruto === '' ? null : Number(limiteDisparosBruto),
    }),
  });
  if (resultado && !resultado.error) {
    fecharModal();
    mostrarToast('Plano atualizado com sucesso.', 'sucesso');
    await carregar();
  } else {
    erroEl.textContent = (resultado && resultado.error) || 'Erro ao salvar plano.';
  }
}

function abrirModalEditarPlano(chave) {
  const plano = dados.planos.find((p) => p.chave === chave);
  if (!plano) return;
  const features = plano.features || [];
  const limites = plano.limites || {};
  const camposFeatures = [0, 1, 2].map((i) => `
    <div><input type="text" id="plano-editar-feature-${i}" value="${escapeHtml(features[i] ? features[i].label : '')}" placeholder="Diferencial ${i + 1}"></div>
  `).join('');
  const camposLimites = PLANO_LIMITE_CHAVES.map((chaveLimite) => `
    <div>
      <label for="plano-editar-limite-${chaveLimite}">${PLANO_LIMITE_ROTULOS[chaveLimite]}</label>
      <input type="number" min="0" id="plano-editar-limite-${chaveLimite}" value="${limites[chaveLimite] ?? ''}" placeholder="ilimitado">
    </div>
  `).join('');

  abrirModal(
    '<h3>Editar plano</h3>',
    `
      <div class="modal-erro" id="plano-editar-erro"></div>
      <form id="form-editar-plano">
        <label for="plano-editar-nome">Nome *</label>
        <input type="text" id="plano-editar-nome" value="${escapeHtml(plano.nome)}">
        <label for="plano-editar-descricao">Descrição</label>
        <input type="text" id="plano-editar-descricao" value="${escapeHtml(plano.descricao || '')}">
        <label for="plano-editar-headline">Headline (diferencial)</label>
        <input type="text" id="plano-editar-headline" value="${escapeHtml(plano.headline_diferencial || '')}">
        <div class="contador-caracteres" id="plano-editar-headline-contador"></div>
        <label for="plano-editar-frase">Frase de benefício</label>
        <input type="text" id="plano-editar-frase" value="${escapeHtml(plano.frase_beneficio || '')}">
        <div class="contador-caracteres" id="plano-editar-frase-contador"></div>
        <label>Diferenciais (até 3)</label>
        <div class="pagamento-grid-3col">${camposFeatures}</div>
        <label>Limites de uso</label>
        <div class="pagamento-grid-3col">${camposLimites}</div>
        <div class="pagamento-grid-2col">
          <div><label for="plano-editar-preco">Preço mensal *</label><input type="number" step="0.01" min="1" id="plano-editar-preco" value="${plano.preco_mensal}"></div>
          <div><label for="plano-editar-limite-disparos">Limite de disparos</label><input type="number" step="1" min="0" id="plano-editar-limite-disparos" value="${plano.limite_disparos ?? ''}" placeholder="ilimitado"></div>
        </div>
        <label for="plano-editar-badge">Badge</label>
        <input type="text" id="plano-editar-badge" value="${escapeHtml(plano.badge || '')}" placeholder="ex: Mais popular">
        <div class="pagamento-grid-2col">
          <div><label class="toggle-linha"><span class="toggle-switch"><input type="checkbox" id="plano-editar-destaque" ${plano.destaque ? 'checked' : ''}><span class="toggle-switch-trilho"></span></span> Destaque</label></div>
          <div><label class="toggle-linha"><span class="toggle-switch"><input type="checkbox" id="plano-editar-ativo" ${plano.ativo ? 'checked' : ''}><span class="toggle-switch-trilho"></span></span> Ativo</label></div>
        </div>
        <p class="modal-texto">
          <strong>Slug:</strong> ${escapeHtml(plano.slug || plano.chave)} ·
          <strong>Tecnologia:</strong> ${escapeHtml(TECNOLOGIA_LABELS[plano.tecnologia] || plano.tecnologia || '—')} ·
          <strong>Tipo de número:</strong> ${escapeHtml(TIPO_NUMERO_LABELS[plano.tipo_numero] || plano.tipo_numero || '—')}
        </p>
        <p class="modal-texto">⚠️ Alterações de preço afetam apenas novas assinaturas.</p>
        <div class="modal-acoes">
          <button type="button" class="btn-secundario" id="btn-sair-editar-plano">Sair</button>
          <button type="submit" class="btn-primario" id="btn-salvar-editar-plano">Salvar</button>
        </div>
      </form>
    `,
    { larga: true }
  );

  document.getElementById('btn-sair-editar-plano').addEventListener('click', fecharModal);
  const headlineEl = document.getElementById('plano-editar-headline');
  const fraseEl = document.getElementById('plano-editar-frase');
  const erroEl = document.getElementById('plano-editar-erro');
  const salvarBtn = document.getElementById('btn-salvar-editar-plano');
  function validarLimitesCopyPlano() {
    document.getElementById('plano-editar-headline-contador').textContent = `${headlineEl.value.length}/120`;
    document.getElementById('plano-editar-frase-contador').textContent = `${fraseEl.value.length}/120`;
    const acimaDoLimite = headlineEl.value.length > 120 || fraseEl.value.length > 120;
    if (acimaDoLimite) {
      erroEl.textContent = 'Headline e frase de benefício têm o máximo de 120 caracteres.';
      salvarBtn.disabled = true;
    } else if (erroEl.textContent.startsWith('Headline e frase')) {
      erroEl.textContent = '';
      salvarBtn.disabled = false;
    }
  }
  headlineEl.addEventListener('input', validarLimitesCopyPlano);
  fraseEl.addEventListener('input', validarLimitesCopyPlano);
  validarLimitesCopyPlano();

  document.getElementById('form-editar-plano').addEventListener('submit', async (e) => {
    e.preventDefault();
    await salvarPlano(chave);
  });
}

async function salvarPlano(chave) {
  const nome = document.getElementById('plano-editar-nome').value.trim();
  const descricao = document.getElementById('plano-editar-descricao').value.trim();
  const headlineDiferencial = document.getElementById('plano-editar-headline').value.trim();
  const fraseBeneficio = document.getElementById('plano-editar-frase').value.trim();
  const precoMensal = document.getElementById('plano-editar-preco').value;
  const limiteBruto = document.getElementById('plano-editar-limite-disparos').value.trim();
  const badge = document.getElementById('plano-editar-badge').value.trim();
  const destaque = document.getElementById('plano-editar-destaque').checked;
  const ativo = document.getElementById('plano-editar-ativo').checked;
  const features = [0, 1, 2].map((i) => document.getElementById(`plano-editar-feature-${i}`).value.trim()).filter(Boolean);
  const limites = Object.fromEntries(PLANO_LIMITE_CHAVES.map((c) => {
    const v = document.getElementById(`plano-editar-limite-${c}`).value.trim();
    return [c, v === '' ? null : Number(v)];
  }));
  const erroEl = document.getElementById('plano-editar-erro');
  erroEl.textContent = '';
  if (!nome) { erroEl.textContent = 'Nome do plano não pode ficar em branco.'; return; }
  if (headlineDiferencial.length > 120 || fraseBeneficio.length > 120) { erroEl.textContent = 'Headline e frase de benefício têm o máximo de 120 caracteres.'; return; }
  if (!(Number(precoMensal) >= 1)) { erroEl.textContent = 'Preço mensal deve ser no mínimo R$ 1,00.'; return; }

  const resultado = await api(`/api/configuracoes/planos/${chave}`, {
    method: 'PATCH',
    body: JSON.stringify({
      nome, descricao, headline_diferencial: headlineDiferencial, frase_beneficio: fraseBeneficio,
      preco_mensal: Number(precoMensal), limite_disparos: limiteBruto === '' ? null : Number(limiteBruto),
      badge: badge === '' ? null : badge, destaque, ativo, features, limites,
    }),
  });
  if (resultado && !resultado.error) {
    fecharModal();
    mostrarToast('Plano atualizado com sucesso.', 'sucesso');
    await carregar();
  } else {
    erroEl.textContent = (resultado && resultado.error) || 'Erro ao salvar plano.';
  }
}

// ---------- Bloqueios / Configurações gerais (mesmo mecanismo, chaves diferentes) ----------
function renderAbaConfigLista(chaves, vazioTexto) {
  return `
    <section class="secao-detalhe">
      <div class="tabela-wrapper">
        <table class="tabela-tenants">
          <thead><tr><th>Configuração</th><th>Valor</th><th></th></tr></thead>
          <tbody>${chaves.length ? chaves.map(renderLinhaSistema).join('') : `<tr><td colspan="3">${vazioTexto}</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderLinhaSistema(chave) {
  const editando = sistemaEmEdicao.has(chave);
  const valorAtual = dados.sistema[chave] ?? '';
  const tipoInput = CONFIG_SISTEMA_NUMERICAS.has(chave) ? 'number' : chave === 'email_suporte' ? 'email' : 'text';
  if (editando) {
    return `
      <tr data-config="${chave}">
        <td>${escapeHtml(CONFIG_SISTEMA_LABELS[chave] || chave)}</td>
        <td>
          <input type="${tipoInput}" class="input-config-valor" ${tipoInput === 'number' ? 'min="1" step="1"' : ''} value="${escapeHtml(valorAtual)}">
          <div class="modal-erro" data-erro-config="${chave}"></div>
        </td>
        <td class="celula-acoes-plano">
          <button class="btn-secundario btn-tabela" data-acao="cancelar-config" data-chave="${chave}">Cancelar</button>
          <button class="btn-primario btn-tabela" data-acao="salvar-config" data-chave="${chave}">Salvar</button>
        </td>
      </tr>
    `;
  }
  return `
    <tr data-config="${chave}">
      <td>${escapeHtml(CONFIG_SISTEMA_LABELS[chave] || chave)}</td>
      <td>${escapeHtml(valorAtual)}</td>
      <td class="celula-acoes-plano"><button class="btn-secundario btn-tabela" data-acao="editar-config" data-chave="${chave}">Editar</button></td>
    </tr>
  `;
}

function wireEventosConfigGeral() {
  conteudo.querySelectorAll('[data-acao="editar-config"]').forEach((btn) => {
    btn.addEventListener('click', () => { sistemaEmEdicao.add(btn.dataset.chave); renderAba(); });
  });
  conteudo.querySelectorAll('[data-acao="cancelar-config"]').forEach((btn) => {
    btn.addEventListener('click', () => { sistemaEmEdicao.delete(btn.dataset.chave); renderAba(); });
  });
  conteudo.querySelectorAll('[data-acao="salvar-config"]').forEach((btn) => {
    btn.addEventListener('click', () => salvarConfigSistema(btn.dataset.chave));
  });
}

async function salvarConfigSistema(chave) {
  const linha = conteudo.querySelector(`tr[data-config="${chave}"]`);
  const valor = linha.querySelector('.input-config-valor').value.trim();
  const erroEl = linha.querySelector(`[data-erro-config="${chave}"]`);
  erroEl.textContent = '';
  if (CONFIG_SISTEMA_NUMERICAS.has(chave) && !(Number.isInteger(Number(valor)) && Number(valor) > 0)) {
    erroEl.textContent = 'Deve ser um número inteiro maior que zero.';
    return;
  }
  if (chave === 'email_suporte' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
    erroEl.textContent = 'Informe um e-mail válido.';
    return;
  }

  const resultado = await api(`/api/configuracoes/${PRODUTO}/sistema`, {
    method: 'PATCH',
    body: JSON.stringify({ [chave]: valor }),
  });
  if (resultado && !resultado.error) {
    sistemaEmEdicao.delete(chave);
    mostrarToast('Configuração atualizada com sucesso.', 'sucesso');
    await carregar();
  } else {
    erroEl.textContent = (resultado && resultado.error) || 'Erro ao salvar configuração.';
  }
}

function renderLogAuditoria() {
  return `
    <section class="secao-detalhe">
      <h3>Log de auditoria — últimas ${dados.log.length}</h3>
      <div class="tabela-wrapper">
        <table class="tabela-tenants">
          <thead><tr><th>Campo</th><th>Valor anterior</th><th>Valor novo</th><th>Alterado por</th><th>Data</th></tr></thead>
          <tbody>
            ${dados.log.length ? dados.log.map((l) => `
              <tr>
                <td>${escapeHtml(l.campo)}</td>
                <td>${escapeHtml(l.valor_anterior ?? '—')}</td>
                <td>${escapeHtml(l.valor_novo ?? '—')}</td>
                <td>${escapeHtml(l.alterado_por_nome || '—')}</td>
                <td>${formatarDataHora(l.alterado_em)}</td>
              </tr>
            `).join('') : '<tr><td colspan="5">Nenhuma alteração registrada ainda.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

// ---------- Mensagens ----------
function renderAbaMensagens() {
  return `
    <section class="secao-detalhe">
      <p class="vazio-inline">Avisos/banners exibidos no topo do painel de ${PRODUTO_LABEL}. Mensagens sem produto marcado aparecem pra todos os produtos da Kyvvo (gerencie essas em Sistema).</p>
      <button class="btn-primario btn-tabela" id="btn-nova-mensagem" style="margin: 8px 0 16px;">+ Nova mensagem</button>
      <div class="tabela-wrapper">
        <table class="tabela-tenants">
          <thead><tr><th>Texto</th><th>Severidade</th><th>Escopo</th><th>Status</th><th>Expira em</th><th></th></tr></thead>
          <tbody>${mensagens.length ? mensagens.map(renderLinhaMensagem).join('') : '<tr><td colspan="6">Nenhuma mensagem cadastrada.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderLinhaMensagem(m) {
  return `
    <tr data-mensagem="${m.id}">
      <td>${escapeHtml(m.texto)}</td>
      <td><span class="badge badge-status ${SEVERIDADE_CLASSES[m.severidade]}">${SEVERIDADE_LABELS[m.severidade]}</span></td>
      <td>${m.produto ? escapeHtml({ studio: 'Studio', people: 'People', crm: 'CRM' }[m.produto] || m.produto) : 'Kyvvo inteira'}</td>
      <td><span class="badge ${m.ativo ? 'badge-status-ativo' : 'badge-status-inativo'}">${m.ativo ? 'Ativa' : 'Desativada'}</span></td>
      <td>${m.expira_em ? formatarDataHora(m.expira_em) : '—'}</td>
      <td class="celula-acoes-plano">
        <button class="btn-secundario btn-tabela" data-acao="toggle-mensagem" data-id="${m.id}" data-ativo="${m.ativo}">${m.ativo ? 'Desativar' : 'Reativar'}</button>
        <button class="btn-secundario btn-tabela" data-acao="excluir-mensagem" data-id="${m.id}">Excluir</button>
      </td>
    </tr>
  `;
}

function wireEventosMensagens() {
  document.getElementById('btn-nova-mensagem').addEventListener('click', abrirModalNovaMensagem);
  conteudo.querySelectorAll('[data-acao="toggle-mensagem"]').forEach((btn) => {
    btn.addEventListener('click', () => alterarAtivoMensagem(btn.dataset.id, btn.dataset.ativo !== 'true'));
  });
  conteudo.querySelectorAll('[data-acao="excluir-mensagem"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalConfirmarExcluirMensagem(btn.dataset.id));
  });
}

function abrirModalNovaMensagem() {
  abrirModal(
    `<h3>Nova mensagem — ${PRODUTO_LABEL}</h3>`,
    `
      <div class="modal-erro" id="mensagem-erro"></div>
      <label for="mensagem-texto">Texto *</label>
      <input type="text" id="mensagem-texto" placeholder="Ex.: Estamos com instabilidade no pagamento, tente novamente mais tarde.">
      <div class="pagamento-grid-2col">
        <div>
          <label for="mensagem-severidade">Severidade</label>
          <select id="mensagem-severidade">
            <option value="info">Info</option>
            <option value="aviso">Aviso</option>
            <option value="erro">Erro</option>
          </select>
        </div>
        <div>
          <label for="mensagem-expira">Expira em (opcional)</label>
          <input type="datetime-local" id="mensagem-expira">
        </div>
      </div>
      <label class="toggle-linha"><span class="toggle-switch"><input type="checkbox" id="mensagem-geral"><span class="toggle-switch-trilho"></span></span> Mostrar em todos os produtos (Kyvvo inteira), não só ${PRODUTO_LABEL}</label>
      <div class="modal-acoes">
        <button type="button" class="btn-secundario" id="btn-sair-mensagem">Sair</button>
        <button type="submit" class="btn-primario" id="btn-salvar-mensagem">Publicar</button>
      </div>
    `
  );
  document.getElementById('btn-sair-mensagem').addEventListener('click', fecharModal);
  document.getElementById('btn-salvar-mensagem').addEventListener('click', salvarNovaMensagem);
}

async function salvarNovaMensagem() {
  const texto = document.getElementById('mensagem-texto').value.trim();
  const severidade = document.getElementById('mensagem-severidade').value;
  const expiraBruto = document.getElementById('mensagem-expira').value;
  const geral = document.getElementById('mensagem-geral').checked;
  const erroEl = document.getElementById('mensagem-erro');
  erroEl.textContent = '';

  if (!texto) {
    erroEl.textContent = 'Informe o texto da mensagem.';
    return;
  }

  const resultado = await api('/api/mensagens', {
    method: 'POST',
    body: JSON.stringify({
      produto: geral ? null : PRODUTO,
      texto,
      severidade,
      expira_em: expiraBruto ? new Date(expiraBruto).toISOString() : null,
    }),
  });
  if (resultado && !resultado.error) {
    fecharModal();
    mostrarToast('Mensagem publicada.', 'sucesso');
    await carregar();
  } else {
    erroEl.textContent = (resultado && resultado.error) || 'Erro ao publicar mensagem.';
  }
}

async function alterarAtivoMensagem(id, ativo) {
  const resultado = await api(`/api/mensagens/${id}`, { method: 'PATCH', body: JSON.stringify({ ativo }) });
  if (resultado && !resultado.error) {
    mostrarToast(ativo ? 'Mensagem reativada.' : 'Mensagem desativada.', 'sucesso');
    await carregar();
  } else {
    mostrarToast((resultado && resultado.error) || 'Erro ao atualizar mensagem.', 'erro');
  }
}

function abrirModalConfirmarExcluirMensagem(id) {
  abrirModal(
    '<h3>Excluir mensagem</h3>',
    `
      <p>Excluir esta mensagem definitivamente? Não dá pra desfazer.</p>
      <div class="modal-acoes">
        <button type="button" class="btn-secundario" id="btn-cancelar-excluir-mensagem">Cancelar</button>
        <button type="button" class="btn-primario" id="btn-confirmar-excluir-mensagem">Excluir</button>
      </div>
    `
  );
  document.getElementById('btn-cancelar-excluir-mensagem').addEventListener('click', fecharModal);
  document.getElementById('btn-confirmar-excluir-mensagem').addEventListener('click', async () => {
    const resultado = await api(`/api/mensagens/${id}`, { method: 'DELETE' });
    if (resultado && !resultado.error) {
      fecharModal();
      mostrarToast('Mensagem excluída.', 'sucesso');
      await carregar();
    } else {
      mostrarToast((resultado && resultado.error) || 'Erro ao excluir mensagem.', 'erro');
    }
  });
}

// ---------- Catálogo de eventos obrigatórios (People, Handoff v2 Parte 5.2) ----------
function renderAbaEventosCatalogo() {
  return `
    <section class="secao-detalhe">
      <p class="vazio-inline">Eventos obrigatórios do Kyvvo People (confirmação de candidatura, encerramento de vaga) — o recrutador nunca pode desativar um evento marcado como obrigatório aqui. Um evento só pode virar obrigatório com template aprovado na Meta.</p>
      <div class="tabela-wrapper">
        <table class="tabela-tenants">
          <thead><tr><th>Código</th><th>Canal</th><th>Template</th><th>Status do template</th><th>Obrigatório</th><th>Ativo</th><th>Versão</th><th>Custo estimado/candidatura</th><th></th></tr></thead>
          <tbody>${eventosCatalogo.length ? eventosCatalogo.map(renderLinhaEventoCatalogo).join('') : '<tr><td colspan="9">Nenhum evento no catálogo ainda.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderLinhaEventoCatalogo(e) {
  return `
    <tr data-evento="${e.codigo}">
      <td>${escapeHtml(e.codigo)}</td>
      <td>${escapeHtml(e.canal)}</td>
      <td>${e.template_meta_nome ? escapeHtml(e.template_meta_nome) : '—'}</td>
      <td><span class="badge badge-status ${e.template_status === 'aprovado' ? 'badge-status-ativo' : e.template_status === 'rejeitado' ? 'badge-status-inadimplente' : 'badge-status-nao-ativado'}">${TEMPLATE_STATUS_LABELS[e.template_status] || e.template_status}</span></td>
      <td><span class="badge badge-status ${e.obrigatorio ? 'badge-status-ativo' : 'badge-status-inativo'}">${e.obrigatorio ? 'Obrigatório' : 'Opcional'}</span></td>
      <td><span class="badge badge-status ${e.ativo ? 'badge-status-ativo' : 'badge-status-inativo'}">${e.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td>v${e.versao}</td>
      <td>${e.obrigatorio ? `≈ R$ ${CUSTO_ESTIMADO_UTILITY_BRL.toFixed(2).replace('.', ',')}` : '—'}</td>
      <td class="celula-acoes-plano">
        <button class="btn-secundario btn-tabela" data-acao="editar-evento" data-codigo="${e.codigo}">Editar</button>
        <button class="btn-secundario btn-tabela" data-acao="auditoria-evento" data-codigo="${e.codigo}">Histórico</button>
      </td>
    </tr>
  `;
}

function wireEventosEventosCatalogo() {
  conteudo.querySelectorAll('[data-acao="editar-evento"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalEditarEvento(btn.dataset.codigo));
  });
  conteudo.querySelectorAll('[data-acao="auditoria-evento"]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalAuditoriaEvento(btn.dataset.codigo));
  });
}

function abrirModalEditarEvento(codigo) {
  const evento = eventosCatalogo.find((e) => e.codigo === codigo);
  if (!evento) return;
  abrirModal(
    `<h3>Editar evento — ${escapeHtml(codigo)}</h3>`,
    `
      <div class="modal-erro" id="evento-erro"></div>
      <label for="evento-template-nome">Nome do template aprovado na Meta</label>
      <input type="text" id="evento-template-nome" value="${escapeHtml(evento.template_meta_nome || '')}" placeholder="Ex.: people_confirma_cadidatura_1">
      <div class="pagamento-grid-2col">
        <div>
          <label for="evento-template-status">Status do template</label>
          <select id="evento-template-status">
            <option value="pendente" ${evento.template_status === 'pendente' ? 'selected' : ''}>Pendente</option>
            <option value="aprovado" ${evento.template_status === 'aprovado' ? 'selected' : ''}>Aprovado</option>
            <option value="rejeitado" ${evento.template_status === 'rejeitado' ? 'selected' : ''}>Rejeitado</option>
          </select>
        </div>
        <div>
          <label for="evento-canal">Canal</label>
          <select id="evento-canal">
            <option value="whatsapp" ${evento.canal === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
            <option value="email" ${evento.canal === 'email' ? 'selected' : ''}>E-mail</option>
          </select>
        </div>
      </div>
      <label class="toggle-linha"><span class="toggle-switch"><input type="checkbox" id="evento-obrigatorio" ${evento.obrigatorio ? 'checked' : ''}><span class="toggle-switch-trilho"></span></span> Obrigatório (recrutador nunca pode desativar) — exige template aprovado</label>
      <label class="toggle-linha"><span class="toggle-switch"><input type="checkbox" id="evento-ativo" ${evento.ativo ? 'checked' : ''}><span class="toggle-switch-trilho"></span></span> Ativo no catálogo</label>
      <label for="evento-justificativa" style="margin-top:10px; display:block">Justificativa (obrigatória)</label>
      <textarea id="evento-justificativa" rows="3" placeholder="Por que essa mudança está sendo feita agora?"></textarea>
      <div class="modal-acoes">
        <button type="button" class="btn-secundario" id="btn-sair-evento">Sair</button>
        <button type="button" class="btn-primario" id="btn-salvar-evento">Salvar</button>
      </div>
    `
  );
  document.getElementById('btn-sair-evento').addEventListener('click', fecharModal);
  document.getElementById('btn-salvar-evento').addEventListener('click', () => salvarEvento(codigo));
}

async function salvarEvento(codigo) {
  const erroEl = document.getElementById('evento-erro');
  erroEl.textContent = '';
  const templateMetaNome = document.getElementById('evento-template-nome').value.trim();
  const templateStatus = document.getElementById('evento-template-status').value;
  const canal = document.getElementById('evento-canal').value;
  const obrigatorio = document.getElementById('evento-obrigatorio').checked;
  const ativo = document.getElementById('evento-ativo').checked;
  const justificativa = document.getElementById('evento-justificativa').value.trim();

  if (!justificativa) {
    erroEl.textContent = 'Justificativa é obrigatória.';
    return;
  }
  if (obrigatorio && templateStatus !== 'aprovado') {
    erroEl.textContent = 'Não é possível marcar como obrigatório sem template aprovado na Meta.';
    return;
  }

  const resultado = await api(`/api/eventos-catalogo/${codigo}`, {
    method: 'PATCH',
    body: JSON.stringify({ template_meta_nome: templateMetaNome || null, template_status: templateStatus, canal, obrigatorio, ativo, justificativa }),
  });
  if (resultado && !resultado.error) {
    fecharModal();
    mostrarToast('Evento atualizado.', 'sucesso');
    await carregar();
  } else {
    erroEl.textContent = (resultado && resultado.error) || 'Erro ao salvar evento.';
  }
}

function abrirModalAuditoriaEvento(codigo) {
  abrirModal(`<h3>Histórico — ${escapeHtml(codigo)}</h3>`, '<div id="evento-auditoria-conteudo">Carregando...</div>', { larga: true });
  carregarAuditoriaEvento(codigo);
}

async function carregarAuditoriaEvento(codigo) {
  const resultado = await api(`/api/eventos-catalogo/${codigo}/auditoria`);
  const alvo = document.getElementById('evento-auditoria-conteudo');
  if (!alvo) return; // modal já foi fechado antes da resposta chegar
  const log = (resultado && resultado.log) || [];
  alvo.innerHTML = `
    <div class="tabela-wrapper">
      <table class="tabela-tenants">
        <thead><tr><th>Justificativa</th><th>Alterado por</th><th>Data</th></tr></thead>
        <tbody>
          ${log.length ? log.map((l) => `
            <tr>
              <td>${escapeHtml(l.justificativa)}</td>
              <td>${escapeHtml(l.alterado_por_nome || '—')}</td>
              <td>${formatarDataHora(l.alterado_em)}</td>
            </tr>
          `).join('') : '<tr><td colspan="3">Nenhuma alteração registrada ainda.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

carregar();
