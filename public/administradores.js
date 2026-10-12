// Sistema > Administradores — CRUD de quem tem acesso à área admin da
// Kyvvo. Sem papéis/permissões ainda (RBAC de verdade é escopo maior,
// fica pra depois) — aqui só dá pra criar conta e ligar/desligar acesso.
// Travas anti-lockout (não desativa a si mesmo, não zera o último ativo)
// são aplicadas no backend; esta tela só mostra o erro que vier de lá.

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

function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// ---------- Modal genérico + toast (mesma implementação de admin/app.js) ----------
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

let administradores = [];
let carregando = false;

async function carregar() {
  if (carregando) return;
  carregando = true;
  conteudo.innerHTML = '<div class="vazio">Carregando...</div>';
  const dados = await api('/api/administradores');
  carregando = false;
  if (!dados) return;
  administradores = dados.administradores;
  render();
}

function renderLinha(a) {
  return `
    <tr>
      <td>${escapeHtml(a.nome)}</td>
      <td>${escapeHtml(a.email)}</td>
      <td><span class="badge ${a.ativo ? 'badge-status-ativo' : 'badge-status-inativo'}">${a.ativo ? 'Ativo' : 'Desativado'}</span></td>
      <td>${formatarDataHora(a.criado_em)}</td>
      <td>
        <button type="button" class="btn-secundario" data-toggle-ativo="${escapeHtml(a.id)}" data-ativo="${a.ativo}">
          ${a.ativo ? 'Desativar' : 'Reativar'}
        </button>
      </td>
    </tr>
  `;
}

function render() {
  conteudo.innerHTML = `
    <h2 class="titulo-detalhe">Administradores</h2>
    <p class="vazio-inline">Quem tem acesso à área admin da Kyvvo. Sem papéis/permissões ainda — todo administrador ativo tem acesso total.</p>
    <button class="btn-primario btn-tabela" id="btn-novo-admin" style="margin: 8px 0 16px;">+ Novo administrador</button>
    <div class="tabela-wrapper">
      <table class="tabela-tenants">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Status</th><th>Cadastrado em</th><th></th></tr></thead>
        <tbody>
          ${administradores.length ? administradores.map(renderLinha).join('') : '<tr><td colspan="5">Nenhum administrador cadastrado.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('btn-novo-admin').addEventListener('click', abrirModalNovoAdmin);
  conteudo.querySelectorAll('[data-toggle-ativo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ativo = btn.dataset.ativo === 'true';
      if (ativo) {
        abrirModalConfirmarDesativar(btn.dataset.toggleAtivo);
      } else {
        alterarAtivo(btn.dataset.toggleAtivo, true);
      }
    });
  });
}

function abrirModalNovoAdmin() {
  abrirModal(
    '<h3>Novo administrador</h3>',
    `
      <p><label>Nome<br><input type="text" id="novo-admin-nome"></label></p>
      <p><label>E-mail<br><input type="email" id="novo-admin-email"></label></p>
      <p><label>Senha<br><input type="password" id="novo-admin-senha" placeholder="Mín. 8 caracteres, 1 número, 1 maiúscula"></label></p>
      <div class="modal-erro" id="novo-admin-erro"></div>
      <button class="btn-secundario btn-tabela" id="novo-admin-cancelar">Cancelar</button>
      <button class="btn-primario btn-tabela" id="novo-admin-salvar">Cadastrar</button>
    `
  );
  document.getElementById('novo-admin-cancelar').addEventListener('click', fecharModal);
  document.getElementById('novo-admin-salvar').addEventListener('click', salvarNovoAdmin);
}

async function salvarNovoAdmin() {
  const nome = document.getElementById('novo-admin-nome').value.trim();
  const email = document.getElementById('novo-admin-email').value.trim();
  const senha = document.getElementById('novo-admin-senha').value;
  const erroEl = document.getElementById('novo-admin-erro');
  erroEl.textContent = '';

  if (!nome || !email || !senha) {
    erroEl.textContent = 'Preencha todos os campos.';
    return;
  }

  const resultado = await api('/api/administradores', {
    method: 'POST',
    body: JSON.stringify({ nome, email, senha }),
  });

  if (resultado && !resultado.error) {
    fecharModal();
    mostrarToast('Administrador cadastrado.', 'sucesso');
    await carregar();
  } else {
    erroEl.textContent = (resultado && resultado.error) || 'Erro ao cadastrar administrador.';
  }
}

function abrirModalConfirmarDesativar(id) {
  const admin = administradores.find((a) => a.id === id);
  abrirModal(
    '<h3>Desativar administrador</h3>',
    `
      <p>Desativar o acesso de <strong>${escapeHtml(admin ? admin.nome : '')}</strong>? A sessão atual dele para de funcionar na próxima ação.</p>
      <div class="modal-erro" id="desativar-erro"></div>
      <button class="btn-secundario btn-tabela" id="desativar-cancelar">Cancelar</button>
      <button class="btn-primario btn-tabela" id="desativar-confirmar">Desativar</button>
    `
  );
  document.getElementById('desativar-cancelar').addEventListener('click', fecharModal);
  document.getElementById('desativar-confirmar').addEventListener('click', () => alterarAtivo(id, false));
}

async function alterarAtivo(id, ativo) {
  const resultado = await api(`/api/administradores/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ativo }),
  });

  if (resultado && !resultado.error) {
    fecharModal();
    mostrarToast(ativo ? 'Administrador reativado.' : 'Administrador desativado.', 'sucesso');
    await carregar();
  } else {
    const erroEl = document.getElementById('desativar-erro');
    if (erroEl) erroEl.textContent = (resultado && resultado.error) || 'Erro ao atualizar.';
    else mostrarToast((resultado && resultado.error) || 'Erro ao atualizar.', 'erro');
  }
}

carregar();
