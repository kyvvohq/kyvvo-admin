// Página de detalhe do usuário da área admin da Kyvvo (US16b) — consome
// GET /api/usuarios/:id. Chegou aqui a partir de um clique numa linha da
// seção "Usuários vinculados" em tenant-detalhe.js (usuário não tem mais
// listagem/busca própria — ver comentário em routes/admin-usuarios.js).

// token / identificação do admin / dropdown "Sair" agora vivem em shell.js
// (US53), carregado antes deste script em todas as páginas admin.

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

const ROLE_LABEL = { administrador: 'Administrador', operador: 'Operador' };

function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${data} ${hora}`;
}

function idDaUrl() {
  const partes = window.location.pathname.split('/').filter(Boolean);
  return decodeURIComponent(partes[partes.length - 1]);
}

// Duplicado intencionalmente do app.js do painel admin (mesmo raciocínio de
// isolamento entre as telas admin — ver comentário no topo do arquivo).
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

let usuarioAtual = null;
let editandoEmail = false;

function renderSecaoConta(u) {
  return `
    <section class="secao-detalhe">
      <h3>Dados da conta</h3>
      <p><strong>Nome:</strong> ${escapeHtml(u.nome || '—')}</p>
      <p>
        <strong>E-mail:</strong>
        ${editandoEmail
          ? `
          <input type="email" id="input-email-usuario" value="${escapeHtml(u.email)}" style="max-width:280px">
          <button type="button" class="btn-primario btn-tabela" id="btn-salvar-email">Salvar</button>
          <button type="button" class="btn-secundario btn-tabela" id="btn-cancelar-email">Cancelar</button>
          <div class="modal-erro" id="erro-email"></div>
        `
          : `${escapeHtml(u.email)} <button type="button" class="btn-secundario btn-tabela" id="btn-editar-email">Editar</button>`
        }
      </p>
      <p><strong>Papel:</strong> ${escapeHtml(ROLE_LABEL[u.role] || u.role)}</p>
      <p><strong>Status:</strong> <span class="badge ${u.ativo ? 'badge-status-ativo' : 'badge-status-inativo'}">${u.ativo ? 'Ativo' : 'Desativado'}</span></p>
      <p><strong>E-mail verificado:</strong> ${u.email_verified ? 'Sim' : 'Não'}</p>
      <p><strong>Cadastrado em:</strong> ${formatarDataHora(u.criado_em)}</p>
      <p><strong>Último login:</strong> ${formatarDataHora(u.ultimo_login_em)}</p>
    </section>
  `;
}

function renderSecaoTenant(u) {
  return `
    <section class="secao-detalhe">
      <h3>Tenant</h3>
      <p><strong>Empresa:</strong> <a class="topbar-nav-link" href="/tenants/${encodeURIComponent(u.tenant_id)}">${escapeHtml(u.tenant_nome)}</a></p>
      <p><strong>Plano:</strong> ${escapeHtml(u.plano_nome)}</p>
      <p><strong>Módulos ativos:</strong> ${u.total_modulos_ativos} módulo${u.total_modulos_ativos === 1 ? '' : 's'}</p>
    </section>
  `;
}

function renderPagina(u) {
  conteudo.innerHTML = `
    <a class="topbar-nav-link" href="/tenants/${encodeURIComponent(u.tenant_id)}">← Voltar para ${escapeHtml(u.tenant_nome)}</a>
    <h2 class="titulo-detalhe">${escapeHtml(u.nome || u.email)}</h2>
    ${renderSecaoConta(u)}
    ${renderSecaoTenant(u)}
  `;
  wireEventosConta();
}

function wireEventosConta() {
  const btnEditar = document.getElementById('btn-editar-email');
  if (btnEditar) {
    btnEditar.addEventListener('click', () => {
      editandoEmail = true;
      renderPagina(usuarioAtual);
      document.getElementById('input-email-usuario').focus();
    });
  }

  const btnCancelar = document.getElementById('btn-cancelar-email');
  if (btnCancelar) {
    btnCancelar.addEventListener('click', () => {
      editandoEmail = false;
      renderPagina(usuarioAtual);
    });
  }

  const btnSalvar = document.getElementById('btn-salvar-email');
  if (btnSalvar) {
    btnSalvar.addEventListener('click', salvarEmail);
  }
}

async function salvarEmail() {
  const input = document.getElementById('input-email-usuario');
  const erroEl = document.getElementById('erro-email');
  const email = input.value.trim();
  if (!email) {
    erroEl.textContent = 'Informe o e-mail.';
    return;
  }
  const resultado = await api(`/api/usuarios/${encodeURIComponent(usuarioAtual.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ email }),
  });
  if (!resultado) return;
  if (resultado.error) {
    erroEl.textContent = resultado.error;
    return;
  }
  usuarioAtual = { ...usuarioAtual, email: resultado.email };
  editandoEmail = false;
  mostrarToast('E-mail atualizado com sucesso.');
  renderPagina(usuarioAtual);
}

async function renderDetalhe() {
  conteudo.innerHTML = '<div class="vazio">Carregando...</div>';

  const id = idDaUrl();
  const data = await api(`/api/usuarios/${encodeURIComponent(id)}`);
  if (!data) return;

  if (data.error) {
    conteudo.innerHTML = `
      <a class="topbar-nav-link" href="/painel.html">← Voltar para Tenants</a>
      <div class="vazio">${escapeHtml(data.error)}</div>
    `;
    return;
  }

  usuarioAtual = data;
  renderPagina(data);
}

renderDetalhe();
