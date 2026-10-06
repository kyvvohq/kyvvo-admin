// WhatsApp > Catálogo de disparos (Bruno, 2026-10-06): "vamos criar um
// repositório no portal do admin onde cadastramos os disparos, pra cada
// produto". CRUD simples (gatilho + nome do template + categoria da Meta +
// corpo da mensagem) por produto — cada produto lê daqui
// (GET /admin-interno/whatsapp/disparos-catalogo) na hora de provisionar o
// WhatsApp de um tenant (onboarding: conecta a WABA, submete os templates
// padrão pra Meta aprovar automaticamente).

// token / identificação do admin / dropdown "Sair" vivem em shell.js (US53),
// carregado antes deste script.

// Content-Type só quando tem corpo de verdade — bug real encontrado em
// whatsapp-wabas.js (2026-10-04): o Fastify recusa com 400 um corpo vazio
// quando o content-type diz que é JSON (afeta GET/DELETE sem body).
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

function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------- Modal genérico (mesma implementação de administradores.js) ----------
function escFecharModal(e) {
  if (e.key === 'Escape') fecharModal();
}
function fecharModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', escFecharModal);
}
function abrirModal(tituloHtml, conteudoHtml) {
  fecharModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
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

const PRODUTOS = [
  { chave: 'crm', nome: 'CRM' },
  { chave: 'studio', nome: 'Studio' },
  { chave: 'people', nome: 'People' },
];
const CATEGORIAS = ['UTILITY', 'MARKETING', 'AUTHENTICATION'];

let produtoAtual = 'crm';
let disparos = [];

function extrairParametros(corpo) {
  return [...new Set((corpo.match(/\{\{\w+\}\}/g) || []).map((m) => m.slice(2, -2)))];
}

async function carregar() {
  const dados = await api(`/api/whatsapp/disparos-catalogo?produto=${produtoAtual}`);
  disparos = (dados && dados.disparos) || [];
  renderizar();
}

function renderizar() {
  conteudo.innerHTML = `
    <p class="vazio-inline" style="margin-bottom:16px">
      Modelos de mensagem padrão por produto — quando um cliente conecta a própria WABA, cada um destes é submetido
      automaticamente pra aprovação da Meta e vira a mensagem usada pelo gatilho correspondente.
    </p>
    <div class="abas-produto" style="display:flex;gap:8px;margin-bottom:16px">
      ${PRODUTOS.map((p) => `<button class="btn-tabela${p.chave === produtoAtual ? ' ativo' : ''}" data-produto="${p.chave}">${p.nome}</button>`).join('')}
    </div>
    <button class="btn-primario" id="btn-novo-disparo" style="margin-bottom:12px">+ Novo disparo</button>
    <table class="tabela-admin">
      <thead><tr><th>Gatilho</th><th>Nome do template</th><th>Categoria</th><th>Parâmetros</th><th>Ativo</th><th></th></tr></thead>
      <tbody>
        ${disparos.length ? disparos.map((d) => `
          <tr>
            <td>${escapeHtml(d.gatilho)}</td>
            <td><code>${escapeHtml(d.nome)}</code></td>
            <td>${escapeHtml(d.categoria)}</td>
            <td>${extrairParametros(d.corpo).map((p) => `{{${escapeHtml(p)}}}`).join(' ') || '—'}</td>
            <td>${d.ativo ? '✅' : '—'}</td>
            <td>
              <button class="btn-tabela" data-editar="${d.id}">Editar</button>
              <button class="btn-tabela" data-excluir="${d.id}" data-nome="${escapeHtml(d.nome)}">Excluir</button>
            </td>
          </tr>
        `).join('') : '<tr><td colspan="6" class="vazio-inline">Nenhum disparo cadastrado pra este produto ainda.</td></tr>'}
      </tbody>
    </table>
  `;

  conteudo.querySelectorAll('[data-produto]').forEach((btn) => {
    btn.addEventListener('click', () => { produtoAtual = btn.dataset.produto; carregar(); });
  });
  conteudo.querySelector('#btn-novo-disparo').addEventListener('click', () => abrirModalDisparo(null));
  conteudo.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalDisparo(disparos.find((d) => d.id === btn.dataset.editar)));
  });
  conteudo.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Excluir o disparo "${btn.dataset.nome}"? Essa ação não pode ser desfeita.`)) return;
      await api(`/api/whatsapp/disparos-catalogo/${btn.dataset.excluir}`, { method: 'DELETE' });
      carregar();
    });
  });
}

// Mesmo modal serve pra criar (disparo === null) e editar.
function abrirModalDisparo(disparo) {
  const editando = !!disparo;
  abrirModal(`<h3>${editando ? 'Editar' : 'Novo'} disparo — ${PRODUTOS.find((p) => p.chave === produtoAtual).nome}</h3>`, `
    <label for="d-gatilho">Gatilho</label>
    <input type="text" id="d-gatilho" placeholder="ex.: pedido_parado" value="${editando ? escapeHtml(disparo.gatilho) : ''}">
    <label for="d-nome">Nome do template (só minúsculas/números/underscore, igual a Meta exige)</label>
    <input type="text" id="d-nome" placeholder="ex.: pedido_parado" value="${editando ? escapeHtml(disparo.nome) : ''}" ${editando ? 'disabled' : ''}>
    <label for="d-categoria">Categoria (Meta)</label>
    <select id="d-categoria">${CATEGORIAS.map((c) => `<option value="${c}" ${editando && disparo.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <label for="d-corpo">Corpo da mensagem (use {{nome_do_parametro}} pra cada variável)</label>
    <textarea id="d-corpo" rows="4" placeholder="Olá {{cliente}}, seu pedido...">${editando ? escapeHtml(disparo.corpo) : ''}</textarea>
    ${editando ? `
    <label class="toggle-linha"><span class="toggle-switch"><input type="checkbox" id="d-ativo" ${disparo.ativo ? 'checked' : ''}><span class="toggle-switch-trilho"></span></span> Ativo (incluído no onboarding)</label>
    ` : ''}
    <div class="modal-erro" id="d-erro"></div>
    <div class="modal-acoes">
      <button type="button" class="btn-secundario" id="btn-sair-disparo">Sair</button>
      <button type="submit" class="btn-primario" id="btn-salvar-disparo">Salvar</button>
    </div>
  `);
  document.getElementById('btn-sair-disparo').addEventListener('click', fecharModal);
  document.getElementById('btn-salvar-disparo').addEventListener('click', async () => {
    const corpo = {
      gatilho: document.getElementById('d-gatilho').value.trim(),
      categoria: document.getElementById('d-categoria').value,
      corpo: document.getElementById('d-corpo').value.trim(),
    };
    if (!editando) corpo.nome = document.getElementById('d-nome').value.trim();
    if (editando) corpo.ativo = document.getElementById('d-ativo').checked;
    if (!corpo.gatilho || (!editando && !corpo.nome) || !corpo.corpo) {
      document.getElementById('d-erro').textContent = 'Gatilho, nome e corpo são obrigatórios.';
      return;
    }
    const resultado = editando
      ? await api(`/api/whatsapp/disparos-catalogo/${disparo.id}`, { method: 'PATCH', body: JSON.stringify(corpo) })
      : await api('/api/whatsapp/disparos-catalogo', { method: 'POST', body: JSON.stringify({ ...corpo, produto: produtoAtual }) });
    if (resultado && resultado.error) {
      document.getElementById('d-erro').textContent = resultado.error;
      return;
    }
    fecharModal();
    carregar();
  });
}

carregar();
