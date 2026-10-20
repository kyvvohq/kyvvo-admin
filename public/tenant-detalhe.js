// Página de detalhe do tenant da área admin da Kyvvo (US28) — consome
// GET /api/tenants/:id (dados consolidados). Chegou aqui a partir de
// um clique na linha/"Ver detalhes" da listagem (US26/US27).
//
// Reorganizado em abas (pedido do Bruno, 2026-10-20): Geral, WhatsApp,
// Disparo, Consumo, E-mail. Geral/WhatsApp usam só o payload já carregado
// em renderDetalhe(); Disparo/Consumo/E-mail buscam sob demanda (só quando a
// aba é aberta pela primeira vez) e ficam em cache em memória pro resto da
// visita a esta página — evita 3 chamadas extras (2 delas pra Meta/Asaas)
// em toda carga, quando o admin só olha Geral na maioria das vezes. Mesmo
// padrão visual de abas de produto-config.js (ds-abas-lista/data-aba).

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

// Duplicado intencionalmente do app.js do painel admin (mesmo raciocínio de
// isolamento entre as telas admin — ver comentário em admin/app.js).
const SEGMENTOS_ADMIN = {
  salao_beleza: 'Salão de beleza',
  petshop: 'Pet Shop',
  psicologia: 'Psicólogo(a)',
  fisioterapia: 'Fisioterapia',
  pilates: 'Pilates',
  outro: 'Outro',
};

const ROLE_LABEL = { administrador: 'Administrador', operador: 'Operador' };

const STATUS_CLASSES = {
  'Trial ativo': 'badge-trial-ativo',
  'Trial expirado': 'badge-trial-expirado',
  'Não ativado': 'badge-status-nao-ativado',
  Ativo: 'badge-status-ativo',
  Inativo: 'badge-status-inativo',
  Suspenso: 'badge-status-suspenso',
};

function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

// Célula de tabela com o valor cheio no title (hover) e cortado no texto —
// usado na aba E-mail (destinatário truncado, CA pedido pelo Bruno).
function celulaTruncada(valor, max = 28) {
  const s = String(valor ?? '');
  const curto = s.length > max ? `${s.slice(0, max)}…` : s;
  return `<span title="${escapeHtml(s)}">${escapeHtml(curto)}</span>`;
}

// WhatsApp é guardado só com dígitos (DDD + número, sem DDI) — mesmo
// formatador da listagem (US26/CA02).
function formatarWhatsapp(digitos) {
  if (!digitos) return '—';
  const d = String(digitos).replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}

// CA03/CA06 pedem data + hora (a listagem, em US26, só mostra a data).
function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${data} ${hora}`;
}

function formatarPreco(valor) {
  return valor != null ? `R$ ${Number(valor).toFixed(2).replace('.', ',')}` : '—';
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

// ============================================================
// Aba Geral
// ============================================================

function renderSecaoNegocio(t) {
  return `
    <section class="secao-detalhe">
      <h3>Dados do negócio</h3>
      <p><strong>Nome da empresa:</strong> ${escapeHtml(t.nome)}</p>
      <p><strong>Segmento:</strong> ${t.segmento ? escapeHtml(SEGMENTOS_ADMIN[t.segmento] || t.segmento) : '—'}</p>
      <p><strong>WhatsApp de contato:</strong> ${
        t.whatsapp
          ? `<a href="https://wa.me/55${String(t.whatsapp).replace(/\D/g, '')}" target="_blank" rel="noopener">${formatarWhatsapp(t.whatsapp)}</a>`
          : '—'
      }</p>
    </section>
  `;
}

function renderSecaoResponsavel(t) {
  const email = t.responsavel ? escapeHtml(t.responsavel.email) : null;
  const ultimoLogin = (t.usuarios || [])
    .map((u) => u.ultimo_login_em)
    .filter(Boolean)
    .sort()
    .pop();
  return `
    <section class="secao-detalhe">
      <h3>Dados do responsável</h3>
      <p><strong>Nome:</strong> ${t.responsavel ? escapeHtml(t.responsavel.nome) : '—'}</p>
      <p><strong>E-mail:</strong> ${email ? `<a href="mailto:${email}">${email}</a>` : '—'}</p>
      <p><strong>Data de cadastro:</strong> ${formatarDataHora(t.cadastrado_em)}</p>
      <p><strong>Data de ativação:</strong> ${t.ativado_em ? formatarDataHora(t.ativado_em) : 'Não ativado'}</p>
      <p><strong>Último login (qualquer usuário):</strong> ${ultimoLogin ? formatarDataHora(ultimoLogin) : '—'}</p>
    </section>
  `;
}

// Indicador de trial somente leitura (US31/CA01-CA04) — toggle + badge, sem
// nenhum handler de clique/edição. Todo o cálculo (trial_ativo/trial_inicio/
// trial_fim/trial_dias_restantes) vem pronto do backend (CA05).
function renderIndicadorTrial(t) {
  const ativado = Boolean(t.trial_inicio);
  const classeToggle = t.trial_ativo ? 'toggle-on' : 'toggle-off';
  const rotulo = !ativado ? 'Não ativado' : t.trial_ativo ? 'Trial ativo' : 'Trial expirado';
  const classeBadge = !ativado ? 'badge-status-nao-ativado' : t.trial_ativo ? 'badge-trial-ativo' : 'badge-trial-expirado';
  const diasHtml = ativado
    ? `<p><strong>Dias restantes:</strong> ${
        t.trial_ativo ? t.trial_dias_restantes : `Expirado há ${Math.abs(t.trial_dias_restantes)} dias`
      }</p>`
    : '';
  return `
    <p>
      <strong>Trial:</strong>
      <span class="toggle-readonly ${classeToggle}" aria-hidden="true"></span>
      <span class="badge badge-trial-indicador ${classeBadge}">${escapeHtml(rotulo)}</span>
    </p>
    ${ativado ? `<p><strong>Início do trial:</strong> ${formatarDataHora(t.trial_inicio)}</p>` : ''}
    ${ativado ? `<p><strong>Término do trial:</strong> ${formatarDataHora(t.trial_fim)}</p>` : ''}
    ${diasHtml}
  `;
}

function renderSecaoStatus(t) {
  const statusClasse = STATUS_CLASSES[t.status_conta] || 'badge-status-inativo';
  return `
    <section class="secao-detalhe">
      <h3>Status da conta</h3>
      <p><strong>Status atual:</strong> <span class="badge badge-status ${statusClasse}">${escapeHtml(t.status_conta)}</span></p>
      ${renderIndicadorTrial(t)}
      <p><strong>Plano atual:</strong> ${escapeHtml(t.plano_atual)}</p>
    </section>
  `;
}

const STATUS_COBRANCA_LABEL = {
  CONFIRMED: 'Confirmado', RECEIVED: 'Recebido', PENDING: 'Pendente',
  OVERDUE: 'Vencido', REFUNDED: 'Estornado', CANCELLED: 'Cancelado',
};
const MEIO_PAGAMENTO_LABEL = { PIX: 'Pix', CREDIT_CARD: 'Cartão de crédito', BOLETO: 'Boleto' };

function renderLinhaCobranca(c) {
  return `
    <tr>
      <td>${c.data ? formatarDataHora(c.data).split(' ')[0] : '—'}</td>
      <td>${formatarPreco(c.valor)}</td>
      <td>${c.meio ? escapeHtml(MEIO_PAGAMENTO_LABEL[c.meio] || c.meio) : '—'}</td>
      <td>${escapeHtml(STATUS_COBRANCA_LABEL[c.status] || c.status || '—')}</td>
    </tr>
  `;
}

// Carregada sob demanda (GET /api/tenants/:id/cobranca chama a Asaas de
// verdade) e plugada aqui assim que chega — ver carregarCobranca().
function renderSecaoCobranca(cobranca) {
  if (!cobranca) {
    return `
      <section class="secao-detalhe">
        <h3>Cobrança</h3>
        <div class="vazio">Carregando...</div>
      </section>
    `;
  }
  if (cobranca.error) {
    return `
      <section class="secao-detalhe">
        <h3>Cobrança</h3>
        <p class="vazio-inline">Falha ao consultar: ${escapeHtml(cobranca.error)}</p>
      </section>
    `;
  }
  const historico = cobranca.historico || [];
  return `
    <section class="secao-detalhe">
      <h3>Cobrança</h3>
      <p><strong>Meio de pagamento:</strong> ${
        cobranca.meio_pagamento
          ? `${escapeHtml(MEIO_PAGAMENTO_LABEL[cobranca.meio_pagamento] || cobranca.meio_pagamento)}${cobranca.cartao_final ? ` (final ${escapeHtml(cobranca.cartao_final)})` : ''}`
          : '—'
      }</p>
      <p><strong>Próxima cobrança:</strong> ${
        cobranca.proxima_cobranca
          ? `${formatarPreco(cobranca.proxima_cobranca.valor)} em ${formatarDataHora(cobranca.proxima_cobranca.data).split(' ')[0]}`
          : '—'
      }</p>
      <h4 style="margin-top:16px">Histórico de cobrança</h4>
      ${
        historico.length
          ? `
        <div class="tabela-wrapper">
          <table class="tabela-tenants">
            <thead><tr><th>Data</th><th>Valor</th><th>Meio</th><th>Status</th></tr></thead>
            <tbody>${historico.map(renderLinhaCobranca).join('')}</tbody>
          </table>
        </div>
      `
          : '<span class="vazio-inline">Nenhuma cobrança registrada ainda.</span>'
      }
    </section>
  `;
}

// US65 — cada módulo do catálogo aparece com seu estado (ativo/inativo) e um
// toggle pra alterar. Módulo obrigatório (CA04) vem sempre ativo, com o
// toggle desabilitado e uma explicação no title.
function renderLinhaModulo(m) {
  const bloqueado = Boolean(m.obrigatorio);
  return `
    <tr data-modulo="${escapeHtml(m.key)}">
      <td>
        ${escapeHtml(m.nome)}
        ${bloqueado ? '<span class="badge-obrigatorio" title="Módulo obrigatório: não pode ser desativado">obrigatório</span>' : ''}
      </td>
      <td>
        <label class="toggle-switch" title="${bloqueado ? 'Módulo obrigatório não pode ser desativado' : ''}">
          <input
            type="checkbox"
            class="toggle-modulo"
            data-modulo-key="${escapeHtml(m.key)}"
            ${m.ativo ? 'checked' : ''}
            ${bloqueado ? 'disabled' : ''}
          >
          <span class="toggle-switch-trilho"></span>
        </label>
      </td>
    </tr>
  `;
}

function renderSecaoModulos(t) {
  const modulos = t.modulos || [];
  return `
    <section class="secao-detalhe">
      <h3>Módulos</h3>
      ${
        modulos.length
          ? `
        <div class="tabela-wrapper">
          <table class="tabela-tenants">
            <thead><tr><th>Módulo</th><th>Ativo</th></tr></thead>
            <tbody>${modulos.map(renderLinhaModulo).join('')}</tbody>
          </table>
        </div>
      `
          : '<span class="vazio-inline">Nenhum módulo disponível</span>'
      }
    </section>
  `;
}

function renderLinhaHistoricoModulo(h) {
  return `
    <tr>
      <td>${escapeHtml(h.modulo_nome)}</td>
      <td>${h.acao === 'ativado' ? 'Ativado' : 'Desativado'}</td>
      <td>${escapeHtml(h.alterado_por_nome || '—')}</td>
      <td>${formatarDataHora(h.alterado_em)}</td>
    </tr>
  `;
}

function renderSecaoHistoricoModulos(historico) {
  return `
    <section class="secao-detalhe">
      <h3>Histórico de alterações de módulos</h3>
      <div class="tabela-wrapper">
        <table class="tabela-tenants">
          <thead><tr><th>Módulo</th><th>Ação</th><th>Alterado por</th><th>Data</th></tr></thead>
          <tbody>${
            historico.length
              ? historico.map(renderLinhaHistoricoModulo).join('')
              : '<tr><td colspan="4">Nenhuma alteração registrada ainda.</td></tr>'
          }</tbody>
        </table>
      </div>
    </section>
  `;
}

// US16b — usuários vinculados ao tenant (antes uma tela global própria,
// /usuarios.html; agora só existe a partir daqui). Clicar na linha abre o
// detalhe (/usuarios/:id), igual o clique num tenant na listagem de Tenants.
function renderLinhaUsuario(u) {
  return `
    <tr data-usuario-id="${escapeHtml(u.id)}">
      <td>${escapeHtml(u.nome || '—')}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(ROLE_LABEL[u.role] || u.role)}</td>
      <td><span class="badge ${u.ativo ? 'badge-status-ativo' : 'badge-status-inativo'}">${u.ativo ? 'Ativo' : 'Desativado'}</span></td>
      <td>${formatarDataHora(u.ultimo_login_em)}</td>
    </tr>
  `;
}

function renderSecaoUsuarios(usuarios) {
  return `
    <section class="secao-detalhe">
      <h3>Usuários vinculados</h3>
      ${
        usuarios.length
          ? `
        <div class="tabela-wrapper">
          <table class="tabela-tenants">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th>Último login</th></tr></thead>
            <tbody>${usuarios.map(renderLinhaUsuario).join('')}</tbody>
          </table>
        </div>
      `
          : '<span class="vazio-inline">Nenhum usuário vinculado</span>'
      }
    </section>
  `;
}

function wireEventosUsuarios() {
  conteudo.querySelectorAll('[data-usuario-id]').forEach((linha) => {
    linha.addEventListener('click', () => {
      window.location.href = `/usuarios/${encodeURIComponent(linha.dataset.usuarioId)}`;
    });
  });
}

// ---------- Modal genérico (mesma implementação de app.js/usuarios.js) ----------
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

// US16c — acesso temporário de usuário de outro tenant (só documentação/
// auditoria, ver routes/admin-acessos-temporarios.js pro porquê de não
// mexer em login/sessão de verdade).
const PRAZOS_ACESSO_TEMPORARIO = [1, 3, 7, 14, 30];

function renderLinhaAcessoTemporario(a) {
  const expirado = !a.revogado_em && new Date(a.expira_em) < new Date();
  const statusLabel = a.revogado_em ? 'Revogado' : expirado ? 'Expirado' : 'Ativo';
  const statusClasse = a.revogado_em ? 'badge-status-inativo' : expirado ? 'badge-status-nao-ativado' : 'badge-status-ativo';
  return `
    <tr>
      <td>${escapeHtml(a.usuario_nome || a.usuario_email)}<br><span class="tabela-contato-email">${escapeHtml(a.usuario_email)} · ${escapeHtml(a.usuario_tenant_nome)}</span></td>
      <td>${escapeHtml(a.motivo)}</td>
      <td>${formatarDataHora(a.concedido_em)}${a.concedido_por_nome ? ` (${escapeHtml(a.concedido_por_nome)})` : ''}</td>
      <td>${formatarDataHora(a.expira_em)}</td>
      <td><span class="badge ${statusClasse}">${statusLabel}</span></td>
      <td>${
        a.revogado_em
          ? '—'
          : `<button type="button" class="btn-secundario btn-tabela" data-revogar-acesso="${escapeHtml(a.id)}">Revogar</button>`
      }</td>
    </tr>
  `;
}

function renderSecaoAcessosTemporarios(acessos) {
  return `
    <section class="secao-detalhe">
      <h3>Acessos temporários</h3>
      <p class="vazio-inline">Registro de usuários de OUTROS tenants com permissão temporária pra validar alguma informação — não loga de verdade, é só auditoria de uma permissão concedida por outro canal.</p>
      ${
        acessos.length
          ? `
        <div class="tabela-wrapper">
          <table class="tabela-tenants">
            <thead><tr><th>Usuário</th><th>Motivo</th><th>Concedido em</th><th>Expira em</th><th>Status</th><th></th></tr></thead>
            <tbody>${acessos.map(renderLinhaAcessoTemporario).join('')}</tbody>
          </table>
        </div>
      `
          : '<span class="vazio-inline">Nenhum acesso temporário concedido</span>'
      }
      <div class="modal-acoes" style="justify-content:flex-start; margin-top:12px">
        <button type="button" class="btn-secundario" id="btn-conceder-acesso">Conceder acesso temporário</button>
      </div>
    </section>
  `;
}

let timeoutBuscaUsuario = null;
let usuarioEscolhido = null;

function renderModalConcederAcesso() {
  abrirModal('<h3>Conceder acesso temporário</h3>', `
    <div class="ds-form">
      <div class="ds-campo">
        <label class="ds-rotulo" for="busca-usuario-acesso">Usuário (nome ou e-mail)</label>
        <input class="ds-input" type="search" id="busca-usuario-acesso" placeholder="Digite ao menos 3 caracteres..." autocomplete="off">
        <div id="resultado-busca-usuario"></div>
      </div>
      <div class="ds-campo">
        <label class="ds-rotulo" for="motivo-acesso">Motivo</label>
        <input class="ds-input" type="text" id="motivo-acesso" placeholder="Ex.: validar configuração X a pedido do suporte">
      </div>
      <div class="ds-campo">
        <label class="ds-rotulo" for="dias-acesso">Prazo</label>
        <select class="ds-select" id="dias-acesso">
          ${PRAZOS_ACESSO_TEMPORARIO.map((d) => `<option value="${d}" ${d === 7 ? 'selected' : ''}>${d} dia${d === 1 ? '' : 's'}</option>`).join('')}
        </select>
      </div>
      <div class="modal-erro" id="erro-conceder-acesso"></div>
      <div class="ds-form-acoes">
        <button type="button" class="ds-btn ds-btn-secundario" id="btn-cancelar-conceder">Cancelar</button>
        <button type="button" class="ds-btn ds-btn-primario" id="btn-confirmar-conceder" disabled>Conceder</button>
      </div>
    </div>
  `);

  usuarioEscolhido = null;
  document.getElementById('btn-cancelar-conceder').addEventListener('click', fecharModal);
  document.getElementById('btn-confirmar-conceder').addEventListener('click', confirmarConcessaoAcesso);

  const inputBusca = document.getElementById('busca-usuario-acesso');
  inputBusca.addEventListener('input', () => {
    usuarioEscolhido = null;
    document.getElementById('btn-confirmar-conceder').disabled = true;
    clearTimeout(timeoutBuscaUsuario);
    timeoutBuscaUsuario = setTimeout(() => buscarUsuarioParaAcesso(inputBusca.value.trim()), 350);
  });
}

async function buscarUsuarioParaAcesso(q) {
  const alvo = document.getElementById('resultado-busca-usuario');
  if (!alvo) return;
  if (q.length < 3) {
    alvo.innerHTML = '';
    return;
  }
  const resultado = await api(`/api/usuarios-busca?q=${encodeURIComponent(q)}&excluir_tenant=${encodeURIComponent(idTenantAtual)}`);
  if (!alvo.isConnected) return; // modal já foi fechado/trocado antes da resposta chegar
  const usuarios = (resultado && resultado.usuarios) || [];
  if (!usuarios.length) {
    alvo.innerHTML = '<p class="vazio-inline">Nenhum usuário encontrado (de outro tenant).</p>';
    return;
  }
  alvo.innerHTML = usuarios.map((u) => `
    <button type="button" class="btn-secundario btn-tabela" style="display:block; width:100%; text-align:left; margin-top:4px" data-escolher-usuario="${escapeHtml(u.id)}">
      ${escapeHtml(u.nome || u.email)} · ${escapeHtml(u.email)} · ${escapeHtml(u.tenant_nome)}
    </button>
  `).join('');
  alvo.querySelectorAll('[data-escolher-usuario]').forEach((btn) => {
    btn.addEventListener('click', () => {
      usuarioEscolhido = { id: btn.dataset.escolherUsuario, label: btn.textContent.trim() };
      document.getElementById('busca-usuario-acesso').value = usuarioEscolhido.label;
      alvo.innerHTML = '';
      document.getElementById('btn-confirmar-conceder').disabled = false;
    });
  });
}

async function confirmarConcessaoAcesso() {
  const erroEl = document.getElementById('erro-conceder-acesso');
  erroEl.textContent = '';
  if (!usuarioEscolhido) {
    erroEl.textContent = 'Escolha um usuário na busca.';
    return;
  }
  const motivo = document.getElementById('motivo-acesso').value.trim();
  const dias = document.getElementById('dias-acesso').value;
  if (!motivo) {
    erroEl.textContent = 'Informe o motivo.';
    return;
  }

  const resultado = await api(`/api/tenants/${encodeURIComponent(idTenantAtual)}/acessos-temporarios`, {
    method: 'POST',
    body: JSON.stringify({ usuario_id: usuarioEscolhido.id, motivo, dias }),
  });
  if (!resultado) return;
  if (resultado.error) {
    erroEl.textContent = resultado.error;
    return;
  }
  fecharModal();
  mostrarToast('Acesso temporário concedido com sucesso.');
  await recarregarAcessosTemporarios();
}

async function revogarAcessoTemporario(acessoId) {
  const resultado = await api(`/api/tenants/${encodeURIComponent(idTenantAtual)}/acessos-temporarios/${encodeURIComponent(acessoId)}`, {
    method: 'DELETE',
  });
  if (!resultado) return;
  if (resultado.error) {
    mostrarToast(resultado.error, 'erro');
    return;
  }
  mostrarToast('Acesso revogado.');
  await recarregarAcessosTemporarios();
}

// Recarrega só a seção de acessos (a mesma lista já vem embutida no GET
// completo do tenant — mais simples reaproveitar do que criar um GET
// dedicado só pra isto) e re-renderiza a aba atual, igual o padrão já usado
// por alterarModulo.
async function recarregarAcessosTemporarios() {
  const data = await api(`/api/tenants/${encodeURIComponent(idTenantAtual)}`);
  if (!data || data.error) return;
  tenantAtual = data;
  historicoModulosAtual = await carregarHistoricoModulos(idTenantAtual);
  renderAba();
}

function wireEventosAcessosTemporarios() {
  const btnConceder = document.getElementById('btn-conceder-acesso');
  if (btnConceder) btnConceder.addEventListener('click', renderModalConcederAcesso);
  conteudo.querySelectorAll('[data-revogar-acesso]').forEach((btn) => {
    btn.addEventListener('click', () => revogarAcessoTemporario(btn.dataset.revogarAcesso));
  });
}

function renderSecaoAtividade(t) {
  const c = t.contagens || {};
  return `
    <section class="secao-detalhe">
      <h3>Atividade recente</h3>
      <p><strong>Total de agendamentos:</strong> ${c.total_agendamentos ?? 0}</p>
      <p><strong>Último agendamento:</strong> ${c.ultimo_agendamento ? formatarDataHora(c.ultimo_agendamento) : '—'}</p>
      <p><strong>Total de clientes cadastrados:</strong> ${c.total_clientes ?? 0}</p>
    </section>
  `;
}

// US65 — alterna um módulo pro tenant da tela atual. Em caso de sucesso,
// atualiza só os módulos (resposta do PATCH já vem com o catálogo
// atualizado) e recarrega o histórico, sem refazer o GET completo do
// tenant. Em caso de erro (ex.: módulo obrigatório), reverte o toggle
// visualmente.
async function alterarModulo(moduloKey, ativo, checkbox) {
  checkbox.disabled = true;
  const resultado = await api(`/api/tenants/${encodeURIComponent(idTenantAtual)}/modulos/${encodeURIComponent(moduloKey)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ativo }),
  });
  checkbox.disabled = false;
  if (!resultado) return;

  if (resultado.error) {
    checkbox.checked = !ativo;
    mostrarToast(resultado.error, 'erro');
    return;
  }

  mostrarToast(`Módulo ${ativo ? 'ativado' : 'desativado'} com sucesso.`, 'sucesso');
  tenantAtual.modulos = resultado.modulos;
  historicoModulosAtual = await carregarHistoricoModulos(idTenantAtual);
  renderAba();
}

function wireEventosModulos() {
  conteudo.querySelectorAll('.toggle-modulo').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      alterarModulo(checkbox.dataset.moduloKey, checkbox.checked, checkbox);
    });
  });
}

async function carregarHistoricoModulos(id) {
  const resultado = await api(`/api/tenants/${encodeURIComponent(id)}/modulos/historico`).catch(() => null);
  return (resultado && resultado.historico) || [];
}

function renderAbaGeral(t) {
  return `
    ${renderSecaoNegocio(t)}
    ${renderSecaoResponsavel(t)}
    ${renderSecaoStatus(t)}
    ${renderSecaoCobranca(cacheAbas.cobranca)}
    ${renderSecaoUsuarios(t.usuarios || [])}
    ${renderSecaoAcessosTemporarios(t.acessos_temporarios || [])}
    ${renderSecaoModulos(t)}
    ${renderSecaoHistoricoModulos(historicoModulosAtual)}
    ${renderSecaoAtividade(t)}
  `;
}

async function carregarCobrancaSeNecessario() {
  if (cacheAbas.cobranca) return;
  cacheAbas.cobranca = await api(`/api/tenants/${encodeURIComponent(idTenantAtual)}/cobranca`).catch((erro) => ({ error: erro.message }));
  // Só atualiza a tela se ainda estivermos na aba Geral (usuário pode ter
  // trocado de aba enquanto a chamada pra Asaas estava em voo).
  if (estado.aba === 'geral') renderAba();
}

// ============================================================
// Aba WhatsApp
// ============================================================

// Modo do agente de atendimento por IA do CRM (bot da Basic 3D Print, ver
// kyvvo-crm/docs/runbooks/onboarding-whatsapp-basic.md) — pedido do Bruno
// (achado ao vivo, 2026-10-13: "bot não responde" era modo "rascunho", que
// só sugere resposta pra equipe aprovar, não manda nada sozinho) pra ver e
// trocar sem precisar logar como o tenant na tela Atendimento do CRM.
// Só aparece quando o módulo 'crm' está ativo pro tenant.
const MODO_AGENTE_LABEL = {
  desligado: 'Desligado',
  rascunho: 'Rascunho (sugestões — equipe aprova antes de enviar)',
  automatico: 'Automático (responde sozinho)',
};
const MODO_AGENTE_CLASSE = {
  desligado: 'badge-status-inativo',
  rascunho: 'badge-status-nao-ativado',
  automatico: 'badge-status-ativo',
};

function renderSecaoAgenteCrm(config) {
  if (!config) return '';
  if (config.error) {
    return `
      <section class="secao-detalhe">
        <h3>Agente de atendimento (CRM)</h3>
        <p class="vazio-inline">Falha ao consultar: ${escapeHtml(config.error)}</p>
      </section>
    `;
  }
  if (!config.configurado) {
    return `
      <section class="secao-detalhe">
        <h3>Agente de atendimento (CRM)</h3>
        <span class="vazio-inline">Agente ainda não configurado pra este tenant (ver runbook de onboarding).</span>
      </section>
    `;
  }
  const horario = config.horario_atendimento;
  return `
    <section class="secao-detalhe">
      <h3>Agente de atendimento (CRM)</h3>
      <p><strong>Modo atual:</strong> <span class="badge ${MODO_AGENTE_CLASSE[config.modo] || 'badge-status-inativo'}">${escapeHtml(MODO_AGENTE_LABEL[config.modo] || config.modo)}</span></p>
      ${horario ? `<p><strong>Horário de atendimento:</strong> ${escapeHtml(horario.inicio)}–${escapeHtml(horario.fim)} (${escapeHtml(horario.fuso)})</p>` : ''}
      <div class="ds-campo" style="max-width:320px">
        <label class="ds-rotulo" for="select-modo-agente">Alterar modo</label>
        <select class="ds-select" id="select-modo-agente">
          ${Object.keys(MODO_AGENTE_LABEL).map((m) => `<option value="${m}" ${m === config.modo ? 'selected' : ''}>${escapeHtml(MODO_AGENTE_LABEL[m])}</option>`).join('')}
        </select>
      </div>
      <div class="modal-acoes" style="justify-content:flex-start; margin-top:8px">
        <button type="button" class="btn-secundario" id="btn-salvar-modo-agente">Salvar</button>
      </div>
    </section>
  `;
}

async function salvarModoAgente() {
  const select = document.getElementById('select-modo-agente');
  const btn = document.getElementById('btn-salvar-modo-agente');
  if (!select || !btn) return;
  const modo = select.value;
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Salvando...';
  const resultado = await api(`/api/whatsapp/crm-agente-config/${encodeURIComponent(idTenantAtual)}`, {
    method: 'PATCH',
    body: JSON.stringify({ modo }),
  });
  btn.disabled = false;
  btn.textContent = textoOriginal;
  if (!resultado) return;
  if (resultado.error) {
    mostrarToast(resultado.error, 'erro');
    return;
  }
  mostrarToast('Modo do agente atualizado.');
  crmAgenteAtual = { ...crmAgenteAtual, modo: resultado.modo };
  renderAba();
}

function wireEventosAgenteCrm() {
  const btn = document.getElementById('btn-salvar-modo-agente');
  if (btn) btn.addEventListener('click', salvarModoAgente);
}

// CA (US39.1) — pedido de "Novo número" ainda não atendido: o tenant já
// confirmou que quer um número fornecido pela Kyvvo (POST
// /api/whatsapp/solicitar-numero-novo) e ainda não tem meta_phone_number_id
// (i.e., nenhum número foi vinculado ainda via /whatsapp.html — ver
// migration 037/US39.2). Só aparece enquanto o pedido está pendente.
function renderSecaoNumeroNovo(t) {
  if (!t.novo_numero_solicitado_em || t.meta_phone_number_id) return '';
  return `
    <section class="secao-detalhe">
      <h3>Pedido de número novo</h3>
      <p><strong>Solicitado em:</strong> ${formatarDataHora(t.novo_numero_solicitado_em)}</p>
      <p><strong>DDD de preferência:</strong> ${t.novo_numero_ddd_preferencia ? escapeHtml(t.novo_numero_ddd_preferencia) : 'Sem preferência'}</p>
      <p class="vazio-inline">Vincule um número em <a class="topbar-nav-link" href="/whatsapp.html">Admin → WhatsApp → Números prontos</a> quando houver um disponível.</p>
    </section>
  `;
}

// Status do número do agente de IA do CRM (crm_whatsapp_numeros.status) —
// não confundir com o `whatsapp_conectado` do Studio (meta_phone_number_id),
// são conexões independentes, cada produto com a sua.
const STATUS_NUMERO_CRM_LABEL = { ativo: 'Conectado', pausado: 'Pausado', desconectado: 'Desconectado' };
const STATUS_NUMERO_CRM_CLASSE = { ativo: 'badge-status-ativo', pausado: 'badge-status-nao-ativado', desconectado: 'badge-status-inativo' };

// Achado ao vivo (2026-10-20, Bruno): o número mostrado aqui não pode ser o
// telefone de CADASTRO do tenant — é o número que a Kyvvo forneceu pro
// agente de IA. Cada produto resolve/mostra o seu: Studio via
// meta_phone_number_id (já vem no payload principal do tenant, sem
// fallback pro telefone de cadastro — ver GET /api/tenants/:id), CRM via
// crm_whatsapp_numeros (isolado no banco do CRM, resolvido à parte aqui).
function renderSecaoNumeroStudio(t) {
  return `
    <section class="secao-detalhe">
      <h3>Número conectado (Studio)</h3>
      <p><strong>Status:</strong> ${
        t.whatsapp_conectado
          ? '<span class="badge badge-status-ativo">Conectado</span>'
          : '<span class="badge badge-status-inativo">Não conectado</span>'
      }</p>
      <p><strong>Número:</strong> ${t.whatsapp_numero ? formatarWhatsapp(t.whatsapp_numero) : '—'}</p>
    </section>
  `;
}

function renderSecaoNumeroCrm(crmNumeros) {
  if (!crmNumeros) return '<section class="secao-detalhe"><h3>Número conectado (CRM)</h3><div class="vazio">Carregando...</div></section>';
  if (crmNumeros.error) {
    return `<section class="secao-detalhe"><h3>Número conectado (CRM)</h3><p class="vazio-inline">Falha ao consultar: ${escapeHtml(crmNumeros.error)}</p></section>`;
  }
  const numero = (crmNumeros.numeros || []).find((n) => n.tenant_id === idTenantAtual);
  if (!numero) {
    return `
      <section class="secao-detalhe">
        <h3>Número conectado (CRM)</h3>
        <p><strong>Status:</strong> <span class="badge badge-status-inativo">Não conectado</span></p>
        <p class="vazio-inline">Nenhum número vinculado em <a class="topbar-nav-link" href="/whatsapp-wabas.html">Admin → WhatsApp → WABAs</a> (seção "Kyvvo CRM — WhatsApp por cliente").</p>
      </section>
    `;
  }
  return `
    <section class="secao-detalhe">
      <h3>Número conectado (CRM)</h3>
      <p><strong>Status:</strong> <span class="badge ${STATUS_NUMERO_CRM_CLASSE[numero.status] || 'badge-status-inativo'}">${escapeHtml(STATUS_NUMERO_CRM_LABEL[numero.status] || numero.status || '—')}</span></p>
      <p><strong>Número:</strong> ${numero.numero_exibido ? escapeHtml(numero.numero_exibido) : '—'}</p>
      <p><strong>Modo:</strong> ${numero.modo === 'coexistencia' ? 'Coexistência (WhatsApp Business app)' : 'API (só Cloud API)'}</p>
    </section>
  `;
}

function renderAbaWhatsapp(t, crmAtivo, crmNumeros) {
  return `
    ${renderSecaoNumeroStudio(t)}
    ${crmAtivo ? renderSecaoNumeroCrm(crmNumeros) : ''}
    ${renderSecaoNumeroNovo(t)}
    ${renderSecaoAgenteCrm(crmAgenteAtual)}
  `;
}

// ============================================================
// Aba Disparo (sob demanda) — reusa GET /api/whatsapp/disparos (total/
// realizados/limite do plano) e GET /api/whatsapp/templates (status de
// aprovação na Meta), filtrando por este tenant.
// ============================================================

const STATUS_TEMPLATE_LABEL = { APPROVED: 'Aprovados', PENDING: 'Pendentes', REJECTED: 'Reprovados' };

function renderListaTemplates(titulo, templates) {
  return `
    <div>
      <h4 style="margin-top:16px">${escapeHtml(titulo)} (${templates.length})</h4>
      ${
        templates.length
          ? `<ul class="lista-simples">${templates.map((t) => `
              <li>${escapeHtml(t.nome)} <span class="vazio-inline">(${escapeHtml(t.idioma || '—')})</span>${t.motivoRejeicao ? ` — <span class="vazio-inline">${escapeHtml(t.motivoRejeicao)}</span>` : ''}</li>
            `).join('')}</ul>`
          : '<span class="vazio-inline">Nenhum</span>'
      }
    </div>
  `;
}

function renderAbaDisparo(dados) {
  if (!dados) return '<div class="vazio">Carregando...</div>';
  if (dados.error) return `<p class="vazio-inline">Falha ao consultar: ${escapeHtml(dados.error)}</p>`;
  const { total, realizados, limitePlano, templates } = dados;
  const restante = limitePlano && limitePlano.limite != null ? Math.max(limitePlano.limite - limitePlano.usadoMesAtual, 0) : null;
  const porStatus = { APPROVED: [], PENDING: [], REJECTED: [] };
  (templates || []).forEach((t) => {
    if (porStatus[t.status]) porStatus[t.status].push(t);
  });
  return `
    <section class="secao-detalhe">
      <h3>Disparos</h3>
      <p><strong>Total de disparos:</strong> ${total}</p>
      <p><strong>Realizados (enviados):</strong> ${realizados}</p>
      ${
        limitePlano
          ? `
        <p><strong>Plano:</strong> ${escapeHtml(limitePlano.planoNome)}</p>
        <p><strong>Usado no mês:</strong> ${limitePlano.usadoMesAtual}${limitePlano.limite != null ? ` de ${limitePlano.limite}` : ' (sem limite)'}</p>
        ${restante != null ? `<p><strong>Restante no mês:</strong> ${restante}</p>` : ''}
      `
          : '<p class="vazio-inline">Sem plano com limite de disparos configurado.</p>'
      }
    </section>
    <section class="secao-detalhe">
      <h3>Modelos de mensagem</h3>
      ${Object.entries(STATUS_TEMPLATE_LABEL).map(([chave, titulo]) => renderListaTemplates(titulo, porStatus[chave])).join('')}
    </section>
  `;
}

async function carregarDisparo() {
  const [disparos, templatesResp] = await Promise.all([
    api(`/api/whatsapp/disparos?tenant_id=${encodeURIComponent(idTenantAtual)}`),
    api('/api/whatsapp/templates'),
  ]);
  if (!disparos) return { error: 'Falha ao consultar disparos.' };
  const templates = ((templatesResp && templatesResp.templates) || []).filter((t) => t.tenantId === idTenantAtual);
  return { ...disparos, templates };
}

// ============================================================
// Aba Consumo (sob demanda) — custo de IA geral e do mês atual.
// ============================================================

// Studio e CRM têm agente de IA PRÓPRIO, em banco separado (conversas_ia no
// Studio x crm_agente_execucoes isolado no CRM — ver comentário da rota
// /api/tenants/:id/ia-uso) — por isso as duas seções abaixo convivem,
// cada uma só aparece quando o produto correspondente está em uso.
function renderSecaoConsumoStudio(dados) {
  if (!dados) return '<section class="secao-detalhe"><h3>Uso da IA — Studio</h3><div class="vazio">Carregando...</div></section>';
  if (dados.error) return `<section class="secao-detalhe"><h3>Uso da IA — Studio</h3><p class="vazio-inline">Falha ao consultar: ${escapeHtml(dados.error)}</p></section>`;
  return `
    <section class="secao-detalhe">
      <h3>Uso da IA — Studio (geral)</h3>
      <p><strong>Total de mensagens:</strong> ${dados.mensagens}</p>
      <p><strong>Total de conversas:</strong> ${dados.conversas}</p>
      <p><strong>Última conversa:</strong> ${dados.ultimaConversaEm ? formatarDataHora(dados.ultimaConversaEm) : '—'}</p>
      <p><strong>Custo total (estimado):</strong> ${formatarPreco(dados.custoReaisGeral)}</p>
    </section>
    <section class="secao-detalhe">
      <h3>Uso da IA — Studio (mês atual)</h3>
      <p><strong>Mensagens no mês:</strong> ${dados.mensagensMes}</p>
      <p><strong>Custo no mês (estimado):</strong> ${formatarPreco(dados.custoReaisMes)}</p>
    </section>
  `;
}

// Achado ao vivo (2026-10-20, Bruno): o consumo de IA de um tenant do CRM
// (ex. Basic 3D Print) não aparecia aqui — a query de Studio olha
// conversas_ia, que não tem nada pra tenant de CRM (o agente dele roda em
// crm_agente_execucoes, isolado no banco do CRM). Mostra os MESMOS
// indicadores que o próprio tenant vê em Atendimento > Indicadores
// (últimos 7 dias) — mesma rota de cálculo, só sem exigir o JWT do tenant
// (GET /crm/admin-interno/agente/metricas/:tenantId). Custo em USD mesmo
// (não converte pra BRL): é o valor que a Anthropic cobra de verdade,
// específico do modelo configurado pro tenant — converter aqui reintroduz
// o mesmo risco de "preço fixo errado" que o Studio já tem documentado em
// lib/ia-custo.js, só que pior (lá é só 1 modelo, aqui o CRM pode trocar).
function renderSecaoConsumoCrm(dados) {
  if (!dados) return '<section class="secao-detalhe"><h3>Uso da IA — CRM (últimos 7 dias)</h3><div class="vazio">Carregando...</div></section>';
  if (dados.error) return `<section class="secao-detalhe"><h3>Uso da IA — CRM (últimos 7 dias)</h3><p class="vazio-inline">Falha ao consultar: ${escapeHtml(dados.error)}</p></section>`;
  const c = dados.custo || {};
  const ex = dados.execucoes || {};
  const ah = dados.atendimento_humano || {};
  return `
    <section class="secao-detalhe">
      <h3>Uso da IA — CRM (últimos 7 dias)</h3>
      <p class="vazio-inline" style="margin-bottom:8px">Mesmos números que a cliente vê em Atendimento → Indicadores, no CRM dela.</p>
      <p><strong>Custo de IA (estimado):</strong> ${c.ia_usd != null ? `US$ ${c.ia_usd.toFixed(4)}` : 'Sem preço cadastrado pro modelo'}</p>
      <p><strong>Mensagens enviadas:</strong> ${c.mensagens_enviadas ?? 0}</p>
      <p><strong>Execuções do agente:</strong> ${ex.total ?? 0} (${ex.conversas ?? 0} conversas)</p>
      <p><strong>Bloqueadas pelo filtro:</strong> ${ex.bloqueadas_pelo_filtro ?? 0} (${ex.taxa_bloqueio != null ? Math.round(ex.taxa_bloqueio * 100) : 0}%)</p>
      <p><strong>Encaminhamentos abertos agora:</strong> ${(dados.fila && dados.fila.abertos) ?? 0}</p>
      <p><strong>Tempo até 1º atendimento humano (mediana):</strong> ${ah.mediana_min != null ? `${ah.mediana_min} min` : '—'}</p>
    </section>
  `;
}

function renderAbaConsumo(dadosStudio, crmAtivo, dadosCrm) {
  return `
    ${renderSecaoConsumoStudio(dadosStudio)}
    ${crmAtivo ? renderSecaoConsumoCrm(dadosCrm) : ''}
  `;
}

// ============================================================
// Aba E-mail (sob demanda) — histórico de envios do platform, filtrado
// pelos e-mails dos usuários deste tenant (email_envios não tem tenant_id,
// ver comentário em routes/admin-email.js).
// ============================================================

const STATUS_EMAIL_LABEL = {
  enviado: 'Enviado', entregue: 'Entregue', bounce: 'Bounce', reclamacao: 'Reclamação',
  rejeitado: 'Rejeitado', falhou: 'Falhou', suprimido: 'Suprimido', log: 'Log (modo dev)',
};
const STATUS_EMAIL_ERRO = ['bounce', 'reclamacao', 'rejeitado', 'falhou'];

function somarStatus(porStatus, chaves) {
  return chaves.reduce((soma, c) => soma + (porStatus[c] || 0), 0);
}

function renderLinhaEmail(e) {
  return `
    <tr>
      <td>${celulaTruncada(e.destinatario)}</td>
      <td>${escapeHtml(STATUS_EMAIL_LABEL[e.status] || e.status)}</td>
      <td>${formatarDataHora(e.criado_em)}</td>
      <td>${e.erro ? celulaTruncada(e.erro, 40) : '—'}</td>
    </tr>
  `;
}

function renderCardsEmail(titulo, porStatus, total) {
  return `
    <div class="secao-detalhe" style="flex:1">
      <h4>${escapeHtml(titulo)}</h4>
      <p><strong>Enviados:</strong> ${total}</p>
      <p><strong>Entregues:</strong> ${porStatus.entregue || 0}</p>
      <p><strong>Erros:</strong> ${somarStatus(porStatus, STATUS_EMAIL_ERRO)}</p>
    </div>
  `;
}

function renderAbaEmail(dados) {
  if (!dados) return '<div class="vazio">Carregando...</div>';
  if (dados.error) return `<p class="vazio-inline">Falha ao consultar: ${escapeHtml(dados.error)}</p>`;
  const envios = dados.envios || [];
  return `
    <p class="vazio-inline" style="margin-bottom:12px">E-mails pra usuários do portal e convites — não inclui notificações ao cliente final do CRM (aniversário, NF-e etc.), que vivem no banco isolado do CRM.</p>
    <div style="display:flex; gap:16px; flex-wrap:wrap">
      ${renderCardsEmail('Geral (todo o histórico)', dados.porStatus || {}, dados.total || 0)}
      ${renderCardsEmail('Mês atual', dados.porStatusMes || {}, dados.totalMes || 0)}
    </div>
    <section class="secao-detalhe">
      <h3>Histórico de envios</h3>
      ${
        envios.length
          ? `
        <div class="tabela-wrapper">
          <table class="tabela-tenants">
            <thead><tr><th>Destinatário</th><th>Status</th><th>Data de envio</th><th>Observação</th></tr></thead>
            <tbody>${envios.map(renderLinhaEmail).join('')}</tbody>
          </table>
        </div>
      `
          : '<span class="vazio-inline">Nenhum e-mail enviado ainda.</span>'
      }
    </section>
  `;
}

// ============================================================
// Abas — navegação e estado
// ============================================================

const ABAS = [
  { id: 'geral', label: 'Geral' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'disparo', label: 'Disparo' },
  { id: 'consumo', label: 'Consumo' },
  { id: 'email', label: 'E-mail' },
];

let estado = { aba: 'geral' };
let cacheAbas = {};

// Estado da tela mantido em memória pra poder re-renderizar só a aba atual
// depois de uma ação (toggle de módulo, trocar modo do agente etc.), sem
// refazer o GET completo do tenant.
let tenantAtual = null;
let idTenantAtual = null;
let crmAgenteAtual = null;
let historicoModulosAtual = [];

function renderPagina() {
  conteudo.innerHTML = `
    <a class="topbar-nav-link" href="/painel.html">← Voltar para lista</a>
    <h2 class="titulo-detalhe">${escapeHtml(tenantAtual.nome)}</h2>
    <div class="ds-abas-lista">
      ${ABAS.map((a) => `<button type="button" class="ds-aba" aria-selected="${estado.aba === a.id ? 'true' : 'false'}" data-aba="${a.id}">${a.label}</button>`).join('')}
    </div>
    <div id="conteudo-aba"></div>
  `;
  conteudo.querySelectorAll('[data-aba]').forEach((el) => {
    el.addEventListener('click', () => { estado.aba = el.dataset.aba; renderPagina(); });
  });
  renderAba();
}

async function renderAba() {
  const alvo = document.getElementById('conteudo-aba');
  if (!alvo) return;

  if (estado.aba === 'geral') {
    alvo.innerHTML = renderAbaGeral(tenantAtual);
    wireEventosModulos();
    wireEventosUsuarios();
    wireEventosAcessosTemporarios();
    carregarCobrancaSeNecessario();
    return;
  }

  if (estado.aba === 'whatsapp') {
    const crmAtivo = (tenantAtual.modulos_ativos || []).some((m) => m.key === 'crm');
    alvo.innerHTML = renderAbaWhatsapp(tenantAtual, crmAtivo, cacheAbas.crmNumeros);
    wireEventosAgenteCrm();
    if (crmAtivo && !cacheAbas.crmNumeros) {
      cacheAbas.crmNumeros = await api('/api/whatsapp/crm-numeros').catch((erro) => ({ error: erro.message }));
      if (estado.aba === 'whatsapp') {
        alvo.innerHTML = renderAbaWhatsapp(tenantAtual, crmAtivo, cacheAbas.crmNumeros);
        wireEventosAgenteCrm();
      }
    }
    return;
  }

  if (estado.aba === 'disparo') {
    alvo.innerHTML = renderAbaDisparo(cacheAbas.disparo);
    if (!cacheAbas.disparo) {
      cacheAbas.disparo = await carregarDisparo();
      if (estado.aba === 'disparo') alvo.innerHTML = renderAbaDisparo(cacheAbas.disparo);
    }
    return;
  }

  if (estado.aba === 'consumo') {
    const crmAtivo = (tenantAtual.modulos_ativos || []).some((m) => m.key === 'crm');
    alvo.innerHTML = renderAbaConsumo(cacheAbas.consumo, crmAtivo, cacheAbas.consumoCrm);
    const faltam = [];
    if (!cacheAbas.consumo) {
      faltam.push(
        api(`/api/tenants/${encodeURIComponent(idTenantAtual)}/ia-uso`)
          .catch((erro) => ({ error: erro.message }))
          .then((r) => { cacheAbas.consumo = r; })
      );
    }
    if (crmAtivo && !cacheAbas.consumoCrm) {
      faltam.push(
        api(`/api/whatsapp/crm-agente-metricas/${encodeURIComponent(idTenantAtual)}?dias=7`)
          .catch((erro) => ({ error: erro.message }))
          .then((r) => { cacheAbas.consumoCrm = r; })
      );
    }
    if (faltam.length) {
      await Promise.all(faltam);
      if (estado.aba === 'consumo') alvo.innerHTML = renderAbaConsumo(cacheAbas.consumo, crmAtivo, cacheAbas.consumoCrm);
    }
    return;
  }

  if (estado.aba === 'email') {
    alvo.innerHTML = renderAbaEmail(cacheAbas.email);
    if (!cacheAbas.email) {
      cacheAbas.email = await api(`/api/email/envios?tenant_id=${encodeURIComponent(idTenantAtual)}`).catch((erro) => ({ error: erro.message }));
      if (estado.aba === 'email') alvo.innerHTML = renderAbaEmail(cacheAbas.email);
    }
    return;
  }
}

async function renderDetalhe() {
  conteudo.innerHTML = '<div class="vazio">Carregando...</div>';

  const id = idDaUrl();
  idTenantAtual = id;
  const [data, historico] = await Promise.all([
    api(`/api/tenants/${encodeURIComponent(id)}`),
    carregarHistoricoModulos(id),
  ]);
  if (!data) return;

  if (data.error) {
    conteudo.innerHTML = `
      <a class="topbar-nav-link" href="/painel.html">← Voltar para lista</a>
      <div class="vazio">${escapeHtml(data.error)}</div>
    `;
    return;
  }

  tenantAtual = data;
  historicoModulosAtual = historico;
  const crmAtivo = (data.modulos_ativos || []).some((m) => m.key === 'crm');
  crmAgenteAtual = crmAtivo ? await api(`/api/whatsapp/crm-agente-config/${encodeURIComponent(id)}`) : null;
  renderPagina();
}

renderDetalhe();
