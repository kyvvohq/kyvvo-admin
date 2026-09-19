// Produtos > WhatsApp > Disparos (pedido do Bruno, 2026-09-19): total de
// disparos, quantidade realizada e histórico (número, template/modelo, data
// e hora, status), cross-produto Studio+People. Consome
// GET /api/whatsapp/disparos — ver routes/admin-whatsapp-disparos.js.

// token / identificação do admin / dropdown "Sair" vivem em shell.js (US53),
// carregado antes deste script em todas as páginas admin.

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

// Duplicado intencionalmente (mesmo raciocínio de isolamento entre telas
// admin — ver comentário em admin/app.js e nos outros whatsapp-*.js).
function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${data} ${hora}`;
}

const PRODUTO_LABELS = { studio: 'Studio', people: 'People' };
const STATUS_LABELS = {
  enviado: 'Enviado',
  erro: 'Erro no envio',
  bloqueado_optout: 'Bloqueado (opt-out)',
  bloqueado_24h: 'Bloqueado (24h)',
};
const STATUS_CLASSES = {
  enviado: 'badge-status-ativo',
  erro: 'badge-status-inadimplente',
  bloqueado_optout: 'badge-status-inativo',
  bloqueado_24h: 'badge-status-nao-ativado',
};
function badgeStatus(status) {
  return `<span class="badge badge-status ${STATUS_CLASSES[status] || 'badge-status-inativo'}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

let filtro = { produto: '', status: '', tenant_id: '' };
let carregando = false;
let tenants = [];
let tenantsCarregados = false;

async function carregar() {
  if (carregando) return;
  carregando = true;
  conteudo.innerHTML = '<div class="vazio">Carregando disparos...</div>';
  const params = new URLSearchParams();
  if (filtro.produto) params.set('produto', filtro.produto);
  if (filtro.status) params.set('status', filtro.status);
  if (filtro.tenant_id) params.set('tenant_id', filtro.tenant_id);

  const chamadas = [api(`/api/whatsapp/disparos?${params.toString()}`)];
  if (!tenantsCarregados) chamadas.push(api('/api/tenants'));
  const [resposta, tenantsResp] = await Promise.all(chamadas);
  carregando = false;
  if (!resposta) return;
  if (tenantsResp) {
    tenants = (tenantsResp.tenants || []).slice().sort((a, b) => a.nome.localeCompare(b.nome));
    tenantsCarregados = true;
  }
  render(resposta);
}

function render(dados) {
  conteudo.innerHTML = `
    <h2 class="titulo-detalhe">Disparos de WhatsApp</h2>
    <p class="vazio-inline">Automações do Studio e do People — total de tentativas e quantas realmente saíram, com o histórico completo.</p>

    <div class="cards-resumo" style="display:flex;gap:16px;margin:16px 0">
      <div class="secao-detalhe" style="flex:1">
        <div style="font-size:13px;color:var(--cor-texto-secundario,#666)">Total de disparos${filtro.tenant_id ? ' (cliente selecionado)' : ''}</div>
        <div style="font-size:28px;font-weight:700">${dados.total}</div>
      </div>
      <div class="secao-detalhe" style="flex:1">
        <div style="font-size:13px;color:var(--cor-texto-secundario,#666)">Disparos realizados${filtro.tenant_id ? ' (cliente selecionado)' : ''}</div>
        <div style="font-size:28px;font-weight:700">${dados.realizados}</div>
      </div>
    </div>

    <section class="secao-detalhe">
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <select id="filtro-tenant">
          <option value="">Todos os clientes</option>
          ${tenants.map((t) => `<option value="${t.id}" ${filtro.tenant_id === t.id ? 'selected' : ''}>${escapeHtml(t.nome)}</option>`).join('')}
        </select>
        <select id="filtro-produto">
          <option value="">Todos os produtos</option>
          <option value="studio" ${filtro.produto === 'studio' ? 'selected' : ''}>Studio</option>
          <option value="people" ${filtro.produto === 'people' ? 'selected' : ''}>People</option>
        </select>
        <select id="filtro-status">
          <option value="">Todos os status</option>
          <option value="enviado" ${filtro.status === 'enviado' ? 'selected' : ''}>Enviado</option>
          <option value="erro" ${filtro.status === 'erro' ? 'selected' : ''}>Erro no envio</option>
          <option value="bloqueado_optout" ${filtro.status === 'bloqueado_optout' ? 'selected' : ''}>Bloqueado (opt-out)</option>
          <option value="bloqueado_24h" ${filtro.status === 'bloqueado_24h' ? 'selected' : ''}>Bloqueado (24h)</option>
        </select>
      </div>
      <h3>Histórico ${dados.disparos.length < dados.total ? `(últimos ${dados.disparos.length} de ${dados.total})` : ''}</h3>
      <div class="tabela-wrapper">
        <table class="tabela-tenants">
          <thead><tr><th>Data/hora</th><th>Produto</th><th>Salão/Empresa</th><th>Número</th><th>Modelo (template)</th><th>Status</th></tr></thead>
          <tbody>${dados.disparos.map(renderLinha).join('') || '<tr><td colspan="6">Nenhum disparo encontrado.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;

  document.getElementById('filtro-tenant').addEventListener('change', (e) => { filtro.tenant_id = e.target.value; carregar(); });
  document.getElementById('filtro-produto').addEventListener('change', (e) => { filtro.produto = e.target.value; carregar(); });
  document.getElementById('filtro-status').addEventListener('change', (e) => { filtro.status = e.target.value; carregar(); });
}

function renderLinha(d) {
  return `
    <tr>
      <td>${formatarDataHora(d.criado_em)}</td>
      <td>${escapeHtml(PRODUTO_LABELS[d.produto] || d.produto)}</td>
      <td>${escapeHtml(d.tenant_nome || '—')}</td>
      <td>${escapeHtml(d.telefone_e164 || '—')}</td>
      <td>${escapeHtml(d.template_nome || '—')}</td>
      <td>${badgeStatus(d.status)}</td>
    </tr>
  `;
}

carregar();
