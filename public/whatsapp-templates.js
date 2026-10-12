// Área admin > WhatsApp > Templates — pedido do Bruno: "já temos alguns
// aprovados, quero ver pela Kyvvo, não Meta". Consome GET
// /api/whatsapp/templates, que agrega message_templates de todas as WABAs
// que a Kyvvo gerencia, ao vivo — não existe tabela local de templates aqui
// (isso é o catálogo próprio da Fase 2 de Automações, outra frente,
// ver lib/automacoes.js no kyvvo-studio; isto aqui é só espelho de leitura
// do que já está cadastrado/aprovado do lado da Meta).

// token / identificação do admin / dropdown "Sair" vivem em shell.js (US53),
// carregado antes deste script.

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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

// Duplicado intencionalmente do app.js do painel admin (mesmo raciocínio de
// isolamento entre as telas admin — ver comentário em admin/app.js).
function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

const STATUS_CLASSES = {
  APPROVED: 'badge-status-ativo',
  PENDING: 'badge-status-nao-ativado',
  IN_APPEAL: 'badge-status-nao-ativado',
  REJECTED: 'badge-status-inadimplente',
  DISABLED: 'badge-status-inadimplente',
  PAUSED: 'badge-status-suspenso',
};
function badgeStatus(valor) {
  if (!valor) return '<span class="badge badge-status badge-status-inativo">—</span>';
  return `<span class="badge badge-status ${STATUS_CLASSES[valor] || 'badge-status-inativo'}">${escapeHtml(valor)}</span>`;
}

let estado = { busca: '', status: '' };
let templatesTodos = [];
let errosPorWaba = [];
let carregando = false;

async function carregar() {
  if (carregando) return;
  carregando = true;
  conteudo.innerHTML = '<div class="vazio">Consultando templates na Meta...</div>';
  const dados = await api('/api/whatsapp/templates');
  carregando = false;
  if (!dados) return;
  templatesTodos = dados.configurado ? dados.templates : [];
  errosPorWaba = dados.errosPorWaba || [];
  render(dados.configurado);
}

function templatesFiltrados() {
  return templatesTodos.filter((t) => {
    if (estado.status && t.status !== estado.status) return false;
    if (estado.busca) {
      const alvo = `${t.nome} ${t.tenantNome || ''}`.toLowerCase();
      if (!alvo.includes(estado.busca.toLowerCase())) return false;
    }
    return true;
  });
}

function renderLinha(t) {
  return `
    <tr>
      <td>${escapeHtml(t.nome)}</td>
      <td>${badgeStatus(t.status)}</td>
      <td>${escapeHtml(t.categoria || '—')}</td>
      <td>${escapeHtml(t.idioma || '—')}</td>
      <td>${t.tenantNome ? escapeHtml(t.tenantNome) : `<code>${escapeHtml(t.wabaId)}</code>`}</td>
      <td>${t.motivoRejeicao ? escapeHtml(t.motivoRejeicao) : '—'}</td>
    </tr>
  `;
}

function render(configurado) {
  if (!configurado) {
    conteudo.innerHTML = `
      <h2 class="titulo-detalhe">Templates</h2>
      <div class="vazio">META_WHATSAPP_TOKEN não configurado no servidor — sem credencial não dá pra consultar a Meta.</div>
    `;
    return;
  }

  const buscaTinhaFoco = document.activeElement && document.activeElement.id === 'busca-templates';
  const filtrados = templatesFiltrados();
  const statusDisponiveis = [...new Set(templatesTodos.map((t) => t.status).filter(Boolean))].sort();

  conteudo.innerHTML = `
    <h2 class="titulo-detalhe">Templates</h2>
    <p class="vazio-inline">Templates de mensagem cadastrados na Meta, de todas as WABAs que a Kyvvo gerencia — status sempre ao vivo, nunca de cópia local.</p>
    ${errosPorWaba.length ? `<p class="modal-erro">Falha ao buscar templates de ${errosPorWaba.map((e) => escapeHtml(e.wabaNome || e.wabaId)).join(', ')}.</p>` : ''}
    <div class="clientes-filtros">
      <input type="search" id="busca-templates" placeholder="Buscar por nome ou salão..." value="${escapeHtml(estado.busca)}">
      <select id="filtro-status-template">
        <option value="">Todos os status</option>
        ${statusDisponiveis.map((s) => `<option value="${escapeHtml(s)}" ${estado.status === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
      </select>
      <button class="btn-primario btn-tabela" id="btn-atualizar">🔄 Atualizar</button>
    </div>
    <div class="tabela-wrapper">
      <table class="tabela-tenants">
        <thead>
          <tr><th>Nome</th><th>Status</th><th>Categoria</th><th>Idioma</th><th>Salão / WABA</th><th>Motivo (se rejeitado)</th></tr>
        </thead>
        <tbody>
          ${filtrados.length ? filtrados.map(renderLinha).join('') : `<tr><td colspan="6">${templatesTodos.length ? 'Nenhum template bate com o filtro.' : 'Nenhum template cadastrado ainda.'}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('btn-atualizar').addEventListener('click', carregar);
  const inputBusca = document.getElementById('busca-templates');
  inputBusca.addEventListener('input', (e) => { estado.busca = e.target.value; render(true); });
  document.getElementById('filtro-status-template').addEventListener('change', (e) => { estado.status = e.target.value; render(true); });
  if (buscaTinhaFoco) {
    inputBusca.focus();
    inputBusca.setSelectionRange(inputBusca.value.length, inputBusca.value.length);
  }
}

carregar();
