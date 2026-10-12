// Página de Saúde do WhatsApp na área admin — todo número de todo produto
// (Studio, People, o que vier), com status ao vivo da Meta, aprovado ou
// não ("mesmo que não esteja aprovado quero ver qual o status atual do
// número" — pedido do Bruno). Consome GET /api/whatsapp/wabas (mesma fonte
// da tela WABAs) e achata pra uma linha por número — antes usava
// /api/whatsapp/status, que só checava 1 META_PHONE_NUMBER_ID fixo (por
// isso só aparecia Studio).

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
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${data} ${hora}`;
}

// Duplicado intencionalmente de whatsapp-wabas.js/whatsapp-templates.js
// (mesmo raciocínio de isolamento entre telas admin).
const STATUS_CLASSES = {
  APPROVED: 'badge-status-ativo',
  VERIFIED: 'badge-status-ativo',
  GREEN: 'badge-status-ativo',
  CONNECTED: 'badge-status-ativo',
  PENDING: 'badge-status-nao-ativado',
  YELLOW: 'badge-status-nao-ativado',
  REJECTED: 'badge-status-inadimplente',
  DISABLED: 'badge-status-inadimplente',
  RED: 'badge-status-inadimplente',
  NOT_VERIFIED: 'badge-status-inadimplente',
};
function badgeStatus(valor) {
  if (!valor) return '<span class="badge badge-status badge-status-inativo">—</span>';
  return `<span class="badge badge-status ${STATUS_CLASSES[valor] || 'badge-status-inativo'}">${escapeHtml(valor)}</span>`;
}

let carregando = false;

// ---------- Números prontos (US39.2 — plano "Novo número") ----------
const NUMERO_STATUS_LABELS = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  em_configuracao: 'Em configuração',
  ativo: 'Ativo',
  erro: 'Erro',
};
const NUMERO_STATUS_CLASSES = {
  disponivel: 'badge-status-inativo',
  reservado: 'badge-status-nao-ativado',
  em_configuracao: 'badge-status-suspenso',
  ativo: 'badge-status-ativo',
  erro: 'badge-status-inadimplente',
};

let numerosProntos = [];
let tenantsDisponiveis = [];
let novoFormAberto = false;
let vinculandoId = null;
let testandoId = null;
// Guarda o último status da Meta carregado pra re-renderizar a seção de
// números prontos (abrir/fechar formulário, trocar de linha em edição) sem
// precisar rebuscar tudo da API de novo.
let ultimoStatusCarregado = null;

async function carregar() {
  if (carregando) return;
  carregando = true;
  conteudo.innerHTML = '<div class="vazio">Consultando números na Meta...</div>';
  const [wabasResp, numerosResp, tenantsResp] = await Promise.all([
    api('/api/whatsapp/wabas'),
    api('/api/numeros-prontos'),
    api('/api/tenants'),
  ]);
  carregando = false;
  if (!wabasResp) return;
  numerosProntos = (numerosResp && numerosResp.numeros) || [];
  tenantsDisponiveis = (tenantsResp && tenantsResp.tenants) || [];
  render(wabasResp);
}

// Achata `wabas[].numeros[]` (mesma forma de /api/whatsapp/wabas) numa
// linha por número — cada WABA é um produto/tenant diferente (Studio,
// People, o que vier), por isso "todos os números de todos os produtos" é
// simplesmente todo número de toda WABA, sem filtrar por status.
function numerosAchatados(wabas) {
  return wabas.flatMap((w) => (w.numeros || []).map((n) => ({
    ...n,
    wabaId: w.id,
    wabaNome: w.nome,
    tenantNome: w.tenantNome,
    statusRevisaoWaba: w.statusRevisao,
  })));
}

function renderLinhaSaude(n) {
  return `
    <tr>
      <td>${escapeHtml(n.numeroExibido || '—')}</td>
      <td>${escapeHtml(n.nomeVerificado || '—')}</td>
      <td>${n.tenantNome ? escapeHtml(n.tenantNome) : escapeHtml(n.wabaNome || n.wabaId)}</td>
      <td>${badgeStatus(n.qualidade)}</td>
      <td>${badgeStatus(n.statusVerificacao)}</td>
      <td>${badgeStatus(n.status)}</td>
      <td>${badgeStatus(n.statusRevisaoWaba)}</td>
    </tr>
  `;
}

function render(dados) {
  ultimoStatusCarregado = dados;

  let corpo;
  if (!dados.configurado) {
    corpo = '<div class="vazio">META_WHATSAPP_TOKEN / META_BUSINESS_ID não configurados no servidor.</div>';
  } else {
    const numeros = numerosAchatados(dados.wabas || []);
    const errosWaba = (dados.wabas || []).filter((w) => w.numerosErro);
    corpo = `
      ${errosWaba.length ? `<p class="modal-erro">Falha ao buscar números de ${errosWaba.map((w) => escapeHtml(w.nome || w.id)).join(', ')}.</p>` : ''}
      <div class="tabela-wrapper">
        <table class="tabela-tenants">
          <thead>
            <tr><th>Número</th><th>Nome verificado</th><th>Salão / WABA</th><th>Qualidade</th><th>Verificação</th><th>Status</th><th>Revisão da conta</th></tr>
          </thead>
          <tbody>
            ${numeros.length ? numeros.map(renderLinhaSaude).join('') : '<tr><td colspan="7">Nenhum número encontrado nas WABAs que a Kyvvo gerencia.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  const html = `
    <h2 class="titulo-detalhe">Saúde do WhatsApp</h2>
    <section class="secao-detalhe">
      <h3>Todos os números, todos os produtos — ao vivo na Meta</h3>
      <p class="vazio-inline">Status sempre mostrado, aprovado ou não — igual a Meta responde, sem filtro.</p>
      ${corpo}
      <button class="btn-primario btn-tabela" id="btn-atualizar" style="margin-top: 12px;">🔄 Atualizar</button>
    </section>
    ${renderSecaoNumerosProntos()}
  `;
  conteudo.innerHTML = html;
  document.getElementById('btn-atualizar').addEventListener('click', carregar);
  wireEventosNumerosProntos();
}

// CA (US39.2) — cadastro/vínculo/teste de números adquiridos manualmente pela
// operação (plano "Novo número"). O número físico já foi adquirido fora do
// repositório (ver US40); aqui só registramos os IDs da Meta, vinculamos a um
// salão e validamos que ele manda mensagem de verdade antes de considerá-lo
// ativo.
function renderSecaoNumerosProntos() {
  return `
    <section class="secao-detalhe">
      <h3>Números prontos — plano "Novo número"</h3>
      <p class="vazio-inline">Números já adquiridos e configurados na Meta pela operação, aguardando vínculo a um salão.</p>
      ${novoFormAberto ? renderFormNovoNumero() : `<button class="btn-secundario btn-tabela" data-acao="abrir-novo-numero" style="margin: 8px 0 12px;">+ Cadastrar número pronto</button>`}
      <div class="tabela-wrapper">
        <table class="tabela-tenants">
          <thead><tr><th>Telefone</th><th>Status</th><th>Salão</th><th>Último teste</th><th></th></tr></thead>
          <tbody>
            ${numerosProntos.length ? numerosProntos.map(renderLinhaNumeroPronto).join('') : '<tr><td colspan="5">Nenhum número pronto cadastrado ainda.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderFormNovoNumero() {
  return `
    <div class="secao-detalhe" style="padding: 12px; margin: 8px 0 12px;">
      <p><label>Telefone<br><input type="text" id="novo-numero-telefone" placeholder="(34) 98555-8788"></label></p>
      <p><label>Phone Number ID (Meta)<br><input type="text" id="novo-numero-phone-id" placeholder="1263829973471596"></label></p>
      <p><label>WABA ID (Meta)<br><input type="text" id="novo-numero-waba-id"></label></p>
      <div class="modal-erro" id="novo-numero-erro"></div>
      <button class="btn-secundario btn-tabela" data-acao="cancelar-novo-numero">Cancelar</button>
      <button class="btn-primario btn-tabela" data-acao="salvar-novo-numero">Cadastrar</button>
    </div>
  `;
}

function renderLinhaNumeroPronto(n) {
  const statusLabel = NUMERO_STATUS_LABELS[n.status] || n.status;
  const statusClasse = NUMERO_STATUS_CLASSES[n.status] || 'badge-status-inativo';
  const ultimoTeste = n.testado_em
    ? `${formatarDataHora(n.testado_em)}${n.teste_resultado ? ` — ${escapeHtml(n.teste_resultado)}` : ''}`
    : '—';

  let acoes = '';
  if (n.status === 'disponivel') {
    acoes = vinculandoId === n.id
      ? `
        <select id="select-tenant-${n.id}">
          <option value="">Selecione o salão…</option>
          ${tenantsDisponiveis.map((t) => `<option value="${t.id}">${escapeHtml(t.nome)}</option>`).join('')}
        </select>
        <div class="modal-erro" id="vincular-erro-${n.id}"></div>
        <button class="btn-secundario btn-tabela" data-acao="cancelar-vincular" data-id="${n.id}">Cancelar</button>
        <button class="btn-primario btn-tabela" data-acao="confirmar-vincular" data-id="${n.id}">Vincular</button>
      `
      : `<button class="btn-secundario btn-tabela" data-acao="abrir-vincular" data-id="${n.id}">Vincular a um salão</button>`;
  } else if (n.tenant_id) {
    acoes = testandoId === n.id
      ? `
        <input type="text" id="teste-destino-${n.id}" placeholder="Nº de teste (ex.: 5534988887777)">
        <div class="modal-erro" id="testar-erro-${n.id}"></div>
        <button class="btn-secundario btn-tabela" data-acao="cancelar-testar" data-id="${n.id}">Cancelar</button>
        <button class="btn-primario btn-tabela" data-acao="confirmar-testar" data-id="${n.id}">Enviar teste</button>
      `
      : `<button class="btn-secundario btn-tabela" data-acao="abrir-testar" data-id="${n.id}">Enviar mensagem de teste</button>`;
  }

  return `
    <tr data-numero="${n.id}">
      <td>${escapeHtml(n.telefone)}</td>
      <td><span class="badge badge-status ${statusClasse}">${escapeHtml(statusLabel)}</span></td>
      <td>${n.tenant_nome ? escapeHtml(n.tenant_nome) : '—'}</td>
      <td>${ultimoTeste}</td>
      <td class="celula-acoes-plano">${acoes}</td>
    </tr>
  `;
}

function wireEventosNumerosProntos() {
  const btnAbrirNovo = conteudo.querySelector('[data-acao="abrir-novo-numero"]');
  if (btnAbrirNovo) btnAbrirNovo.addEventListener('click', () => { novoFormAberto = true; render(ultimoStatusCarregado); });

  const btnCancelarNovo = conteudo.querySelector('[data-acao="cancelar-novo-numero"]');
  if (btnCancelarNovo) btnCancelarNovo.addEventListener('click', () => { novoFormAberto = false; render(ultimoStatusCarregado); });

  const btnSalvarNovo = conteudo.querySelector('[data-acao="salvar-novo-numero"]');
  if (btnSalvarNovo) btnSalvarNovo.addEventListener('click', salvarNovoNumero);

  conteudo.querySelectorAll('[data-acao="abrir-vincular"]').forEach((btn) => {
    btn.addEventListener('click', () => { vinculandoId = btn.dataset.id; render(ultimoStatusCarregado); });
  });
  conteudo.querySelectorAll('[data-acao="cancelar-vincular"]').forEach((btn) => {
    btn.addEventListener('click', () => { vinculandoId = null; render(ultimoStatusCarregado); });
  });
  conteudo.querySelectorAll('[data-acao="confirmar-vincular"]').forEach((btn) => {
    btn.addEventListener('click', () => vincularNumero(btn.dataset.id));
  });

  conteudo.querySelectorAll('[data-acao="abrir-testar"]').forEach((btn) => {
    btn.addEventListener('click', () => { testandoId = btn.dataset.id; render(ultimoStatusCarregado); });
  });
  conteudo.querySelectorAll('[data-acao="cancelar-testar"]').forEach((btn) => {
    btn.addEventListener('click', () => { testandoId = null; render(ultimoStatusCarregado); });
  });
  conteudo.querySelectorAll('[data-acao="confirmar-testar"]').forEach((btn) => {
    btn.addEventListener('click', () => testarNumero(btn.dataset.id));
  });
}

async function salvarNovoNumero() {
  const telefone = document.getElementById('novo-numero-telefone').value.trim();
  const metaPhoneNumberId = document.getElementById('novo-numero-phone-id').value.trim();
  const metaWabaId = document.getElementById('novo-numero-waba-id').value.trim();
  const erroEl = document.getElementById('novo-numero-erro');
  erroEl.textContent = '';

  if (!telefone || !metaPhoneNumberId || !metaWabaId) {
    erroEl.textContent = 'Preencha telefone, Phone Number ID e WABA ID.';
    return;
  }

  const resultado = await api('/api/numeros-prontos', {
    method: 'POST',
    body: JSON.stringify({ telefone, meta_phone_number_id: metaPhoneNumberId, meta_waba_id: metaWabaId }),
  });

  if (resultado && !resultado.error) {
    novoFormAberto = false;
    mostrarToast('Número pronto cadastrado.', 'sucesso');
    await carregar();
  } else {
    erroEl.textContent = (resultado && resultado.error) || 'Erro ao cadastrar número.';
  }
}

async function vincularNumero(id) {
  const select = document.getElementById(`select-tenant-${id}`);
  const tenantId = select.value;
  const erroEl = document.getElementById(`vincular-erro-${id}`);
  erroEl.textContent = '';

  if (!tenantId) {
    erroEl.textContent = 'Selecione um salão.';
    return;
  }

  const resultado = await api(`/api/numeros-prontos/${id}/vincular`, {
    method: 'POST',
    body: JSON.stringify({ tenant_id: tenantId }),
  });

  if (resultado && !resultado.error) {
    vinculandoId = null;
    mostrarToast('Número vinculado ao salão.', 'sucesso');
    await carregar();
  } else {
    erroEl.textContent = (resultado && resultado.error) || 'Erro ao vincular número.';
  }
}

async function testarNumero(id) {
  const input = document.getElementById(`teste-destino-${id}`);
  const numeroDestino = input.value.trim();
  const erroEl = document.getElementById(`testar-erro-${id}`);
  erroEl.textContent = '';

  if (!numeroDestino) {
    erroEl.textContent = 'Informe o número de destino do teste.';
    return;
  }

  const resultado = await api(`/api/numeros-prontos/${id}/testar`, {
    method: 'POST',
    body: JSON.stringify({ numero_destino: numeroDestino }),
  });

  if (resultado && !resultado.error) {
    testandoId = null;
    mostrarToast('Mensagem de teste enviada. Número marcado como ativo.', 'sucesso');
    await carregar();
  } else {
    erroEl.textContent = (resultado && resultado.error) || 'Erro ao enviar mensagem de teste.';
  }
}

// ---------- Toast (duplicado intencionalmente, mesmo raciocínio de
// isolamento entre as telas admin já usado nas demais páginas) ----------
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

carregar();
