// Área admin > WhatsApp > WABAs — pedido do Bruno: não faz sentido nenhum
// trazer aprovação/status da nossa base, se uma WABA está pendente de
// aprovação da Meta ele quer ver aqui, direto da Meta. Consome
// GET /api/whatsapp/wabas, que lista tudo que o Usuário do Sistema da
// Kyvvo gerencia (ver comentário em lib/meta-whatsapp-service.js) — nada
// aqui vem de tabela local, só o rótulo de qual tenant é dono de cada WABA.

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

// Vocabulário da Meta pra account_review_status/quality_rating/
// code_verification_status — badges já existentes no CSS (ver
// admin-numeros-prontos), reaproveitadas aqui pelo mesmo espectro de cor
// (verde=ok, amarelo=pendente, vermelho=problema, cinza=desconhecido).
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
function classeStatus(valor) {
  return STATUS_CLASSES[valor] || 'badge-status-inativo';
}
function badgeStatus(valor, rotuloVazio) {
  if (!valor) return `<span class="badge badge-status badge-status-inativo">${escapeHtml(rotuloVazio || '—')}</span>`;
  return `<span class="badge badge-status ${classeStatus(valor)}">${escapeHtml(valor)}</span>`;
}

let carregando = false;

async function carregar() {
  if (carregando) return;
  carregando = true;
  conteudo.innerHTML = '<div class="vazio">Consultando WABAs na Meta...</div>';
  const dados = await api('/api/whatsapp/wabas');
  carregando = false;
  if (!dados) return;
  render(dados);
}

function renderNumeros(waba) {
  if (waba.numerosErro) {
    return `<p class="vazio-inline">Falha ao buscar números: ${escapeHtml(waba.numerosErro)}</p>`;
  }
  if (!waba.numeros.length) {
    return '<p class="vazio-inline">Nenhum número nesta WABA.</p>';
  }
  return `
    <table class="tabela-tenants" style="margin-top: 8px;">
      <thead><tr><th>Número</th><th>Nome verificado</th><th>Qualidade</th><th>Verificação</th><th>Status</th><th>Ações</th></tr></thead>
      <tbody>
        ${waba.numeros.map((n) => `
          <tr data-numero="${escapeHtml(n.id || '')}">
            <td>${escapeHtml(n.numeroExibido || '—')}${n.id ? `<br><small style="font-family:monospace;color:var(--muted)">${escapeHtml(n.id)}</small>` : ''}</td>
            <td>${escapeHtml(n.nomeVerificado || '—')}</td>
            <td>${badgeStatus(n.qualidade)}</td>
            <td>${badgeStatus(n.statusVerificacao)}</td>
            <td>${badgeStatus(n.status)}</td>
            <td>
              ${n.id && n.status !== 'CONNECTED'
                ? `<button class="btn-tabela" data-registrar="${escapeHtml(n.id)}">Registrar na Cloud API</button>`
                : ''}
              ${n.id && n.status === 'CONNECTED' ? `
                <div style="display:flex;gap:4px;align-items:center">
                  <input type="tel" placeholder="5534999999999" data-teste-destino style="width:130px">
                  <button class="btn-tabela" data-teste="${escapeHtml(n.id)}">Enviar teste</button>
                </div>
                <div style="display:flex;gap:4px;align-items:center;margin-top:4px">
                  <select data-vincular-select style="width:130px">
                    <option value="">Vincular a...</option>
                    <option value="people">People</option>
                    <option value="crm">CRM</option>
                  </select>
                  <button class="btn-tabela" data-vincular="${escapeHtml(n.id)}">Vincular</button>
                </div>
              ` : ''}
              <div class="vazio-inline" data-registrar-msg style="margin-top:4px"></div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// Número "de casa" da Kyvvo (não vinculado a nenhum tenant, ex. o número do
// People) só passa pelo fluxo de Embedded Signup quando é de UM TENANT — o
// que a Meta Business Suite adiciona direto pra Kyvvo fica "PENDING" até
// alguém chamar essa 2ª etapa (registrarNumero, mesma chamada que o
// Embedded Signup do tenant já faz sozinho). Delegado no #conteudo porque a
// tabela inteira é recriada a cada carregar().
conteudo.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-registrar]');
  if (!btn) return;
  const phoneNumberId = btn.dataset.registrar;
  const msgEl = btn.closest('td').querySelector('[data-registrar-msg]');
  btn.disabled = true;
  btn.textContent = 'Registrando...';
  msgEl.textContent = '';
  // body: '{}' — a api() sempre manda Content-Type: application/json; sem
  // corpo nenhum o parser JSON padrão do Fastify rejeita com 400
  // (FST_ERR_CTP_EMPTY_JSON_BODY) antes mesmo de chegar na rota.
  const resultado = await api(`/api/whatsapp/numeros/${phoneNumberId}/registrar`, { method: 'POST', body: '{}' });
  if (resultado && resultado.ok) {
    msgEl.textContent = '✅ Registrado — atualizando...';
    carregar();
  } else {
    btn.disabled = false;
    btn.textContent = 'Registrar na Cloud API';
    msgEl.textContent = `❌ ${(resultado && resultado.error) || 'Falha ao registrar.'}`;
  }
});

// "hello_world" pra um número de teste — confirma que o número recém
// registrado está mesmo operacional na Cloud API.
conteudo.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-teste]');
  if (!btn) return;
  const phoneNumberId = btn.dataset.teste;
  const td = btn.closest('td');
  const numeroDestino = (td.querySelector('[data-teste-destino]').value || '').trim();
  const msgEl = td.querySelector('[data-registrar-msg]');
  if (!numeroDestino) {
    msgEl.textContent = '❌ Informe o número de destino (E.164, ex.: 5534999999999).';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  msgEl.textContent = '';
  const resultado = await api(`/api/whatsapp/numeros/${phoneNumberId}/teste`, {
    method: 'POST',
    body: JSON.stringify({ numeroDestino }),
  });
  btn.disabled = false;
  btn.textContent = 'Enviar teste';
  msgEl.textContent = resultado && resultado.ok
    ? '✅ Enviado — confira o WhatsApp do número de destino.'
    : `❌ ${(resultado && resultado.error) || 'Falha ao enviar.'}`;
});

// Vincula o número a um produto — grava no SSM + redeploya os serviços
// afetados sozinho (ver PRODUTOS_SUPORTADOS em
// routes/admin-whatsapp-meta.js). Ainda depende de duas peças de infra que
// talvez não estejam configuradas (permissão de SSM na EC2,
// GITHUB_DEPLOY_TOKEN) — o erro vem claro da API quando faltar alguma.
conteudo.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-vincular]');
  if (!btn) return;
  const phoneNumberId = btn.dataset.vincular;
  const td = btn.closest('td');
  const produto = td.querySelector('[data-vincular-select]').value;
  const msgEl = td.querySelector('[data-registrar-msg]');
  if (!produto) {
    msgEl.textContent = '❌ Escolha um produto pra vincular.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Vinculando...';
  msgEl.textContent = '';
  const resultado = await api(`/api/whatsapp/numeros/${phoneNumberId}/vincular-produto`, {
    method: 'POST',
    body: JSON.stringify({ produto }),
  });
  btn.disabled = false;
  btn.textContent = 'Vincular';
  if (resultado && resultado.ok) {
    msgEl.textContent = '✅ Vinculado — deploy dos serviços disparado.';
  } else if (resultado && resultado.aviso) {
    msgEl.textContent = `⚠️ ${resultado.aviso}`;
  } else {
    msgEl.textContent = `❌ ${(resultado && resultado.error) || 'Falha ao vincular.'}`;
  }
});

function renderWaba(w) {
  return `
    <section class="secao-detalhe" data-waba="${escapeHtml(w.id)}">
      <h3>${escapeHtml(w.nome || w.id)} ${badgeStatus(w.statusRevisao, 'sem revisão')}</h3>
      <p class="vazio-inline">
        ${w.tenantNome ? `Salão: <strong>${escapeHtml(w.tenantNome)}</strong> · ` : ''}
        WABA ID: <code>${escapeHtml(w.id)}</code>
        ${w.namespaceTemplates ? ` · Namespace de templates: <code>${escapeHtml(w.namespaceTemplates)}</code>` : ''}
      </p>
      ${renderNumeros(w)}
    </section>
  `;
}

function render(dados) {
  if (!dados.configurado) {
    conteudo.innerHTML = `
      <h2 class="titulo-detalhe">WABAs</h2>
      <div class="vazio">META_WHATSAPP_TOKEN não configurado no servidor — sem credencial não dá pra consultar a Meta.</div>
      ${secaoCrmNumerosHtml()}
    `;
    ligarEventosCrmNumeros();
    carregarCrmNumeros();
    return;
  }

  conteudo.innerHTML = `
    <h2 class="titulo-detalhe">WABAs</h2>
    <p class="vazio-inline">Contas do WhatsApp Business que a Kyvvo gerencia, consultadas ao vivo na Meta — aprovação, números e qualidade nunca vêm de cópia local.</p>
    <button class="btn-primario btn-tabela" id="btn-atualizar" style="margin: 8px 0 16px;">🔄 Atualizar</button>
    ${dados.wabas.length ? dados.wabas.map(renderWaba).join('') : '<div class="vazio">Nenhuma WABA atribuída ao Usuário do Sistema da Kyvvo ainda.</div>'}
    ${secaoCrmNumerosHtml()}
  `;
  document.getElementById('btn-atualizar').addEventListener('click', carregar);
  ligarEventosCrmNumeros();
  carregarCrmNumeros();
}

// ---------- Kyvvo CRM — WhatsApp por cliente ----------
// Separado do resto da tela porque não vem da Meta ao vivo feito o resto —
// é uma tabela de configuração do próprio CRM (crm_whatsapp_numeros),
// buscada via chamada interna (ver routes/admin-crm-whatsapp-numeros.js).
// O "Vincular a produto" acima só resolve o roteamento platform -> serviço
// do CRM inteiro; esta seção resolve QUAL CLIENTE é dono do número já
// roteado (ver comentário no topo do arquivo de rotas pra limitação atual
// de só um cliente por vez).
let crmTenants = [];

function secaoCrmNumerosHtml() {
  return `
    <section class="secao-detalhe" id="secao-crm-numeros">
      <h3>Kyvvo CRM — WhatsApp por cliente</h3>
      <p class="vazio-inline">
        Qual cliente do CRM é o dono do número de atendimento (bot de WhatsApp). Hoje só um número por vez chega até o
        serviço do CRM (ver "Vincular a produto" acima) — esta tabela decide de qual cliente ele é.
      </p>
      <table class="tabela-tenants" style="margin-top: 8px;">
        <thead><tr><th>Número</th><th>Cliente (CRM)</th><th>Ações</th></tr></thead>
        <tbody id="crm-numeros-corpo"><tr><td colspan="3" class="vazio-inline">Carregando...</td></tr></tbody>
      </table>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:12px;">
        <input type="text" id="crm-novo-phone-id" placeholder="phone_number_id (copie da tabela de números acima)" style="width:260px">
        <input type="text" id="crm-novo-numero-exibido" placeholder="número exibido (opcional)" style="width:170px">
        <select id="crm-novo-tenant" style="width:200px"><option value="">Cliente...</option></select>
        <button class="btn-tabela" id="crm-novo-vincular">Vincular</button>
      </div>
      <div class="vazio-inline" id="crm-numeros-msg" style="margin-top:6px"></div>
    </section>
  `;
}

async function carregarCrmNumeros() {
  const corpo = document.getElementById('crm-numeros-corpo');
  const [numerosResp, tenantsResp] = await Promise.all([
    api('/api/whatsapp/crm-numeros'),
    api('/api/whatsapp/crm-tenants'),
  ]);
  crmTenants = (tenantsResp && tenantsResp.tenants) || [];
  const opcoesTenant = crmTenants.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nome)}</option>`).join('');
  document.getElementById('crm-novo-tenant').innerHTML = `<option value="">Cliente...</option>${opcoesTenant}`;

  if (!numerosResp || numerosResp.error) {
    corpo.innerHTML = `<tr><td colspan="3" class="vazio-inline">❌ ${escapeHtml((numerosResp && numerosResp.error) || 'Falha ao consultar o CRM.')}</td></tr>`;
    return;
  }
  const numeros = numerosResp.numeros || [];
  corpo.innerHTML = numeros.length ? numeros.map((n) => `
    <tr data-crm-numero="${escapeHtml(n.phone_number_id)}">
      <td>${escapeHtml(n.numero_exibido || '—')}<br><small style="font-family:monospace;color:var(--muted)">${escapeHtml(n.phone_number_id)}</small></td>
      <td><select data-crm-trocar-tenant>${crmTenants.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === n.tenant_id ? 'selected' : ''}>${escapeHtml(t.nome)}</option>`).join('')}</select></td>
      <td>
        <button class="btn-tabela" data-crm-salvar-tenant="${escapeHtml(n.phone_number_id)}">Salvar</button>
        <button class="btn-tabela" data-crm-desvincular="${escapeHtml(n.phone_number_id)}">Desvincular</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="3" class="vazio-inline">Nenhum número vinculado a um cliente do CRM ainda.</td></tr>';
}

function ligarEventosCrmNumeros() {
  const secao = document.getElementById('secao-crm-numeros');
  if (!secao || secao.dataset.ligado) return;
  secao.dataset.ligado = '1';

  const msgEl = () => document.getElementById('crm-numeros-msg');

  secao.addEventListener('click', async (e) => {
    const salvar = e.target.closest('[data-crm-salvar-tenant]');
    if (salvar) {
      const phoneNumberId = salvar.dataset.crmSalvarTenant;
      const tenantId = salvar.closest('tr').querySelector('[data-crm-trocar-tenant]').value;
      if (!tenantId) { msgEl().textContent = '❌ Escolha um cliente.'; return; }
      salvar.disabled = true;
      const resultado = await api('/api/whatsapp/crm-numeros', {
        method: 'POST',
        body: JSON.stringify({ phone_number_id: phoneNumberId, tenant_id: tenantId }),
      });
      salvar.disabled = false;
      if (resultado && !resultado.error) {
        msgEl().textContent = '✅ Cliente atualizado.';
        carregarCrmNumeros();
      } else {
        msgEl().textContent = `❌ ${(resultado && resultado.error) || 'Falha ao salvar.'}`;
      }
      return;
    }

    const desvincular = e.target.closest('[data-crm-desvincular]');
    if (desvincular) {
      const phoneNumberId = desvincular.dataset.crmDesvincular;
      desvincular.disabled = true;
      const resultado = await api(`/api/whatsapp/crm-numeros/${encodeURIComponent(phoneNumberId)}`, { method: 'DELETE' });
      desvincular.disabled = false;
      if (resultado && !resultado.error) {
        msgEl().textContent = '✅ Desvinculado.';
        carregarCrmNumeros();
      } else {
        msgEl().textContent = `❌ ${(resultado && resultado.error) || 'Falha ao desvincular.'}`;
      }
    }
  });

  document.getElementById('crm-novo-vincular').addEventListener('click', async () => {
    const phoneNumberId = document.getElementById('crm-novo-phone-id').value.trim();
    const numeroExibido = document.getElementById('crm-novo-numero-exibido').value.trim();
    const tenantId = document.getElementById('crm-novo-tenant').value;
    if (!phoneNumberId || !tenantId) { msgEl().textContent = '❌ Informe o phone_number_id e escolha um cliente.'; return; }

    const btn = document.getElementById('crm-novo-vincular');
    btn.disabled = true;
    btn.textContent = 'Vinculando...';
    const resultado = await api('/api/whatsapp/crm-numeros', {
      method: 'POST',
      body: JSON.stringify({ phone_number_id: phoneNumberId, tenant_id: tenantId, numero_exibido: numeroExibido || null }),
    });
    btn.disabled = false;
    btn.textContent = 'Vincular';
    if (resultado && !resultado.error) {
      msgEl().textContent = '✅ Vinculado.';
      document.getElementById('crm-novo-phone-id').value = '';
      document.getElementById('crm-novo-numero-exibido').value = '';
      carregarCrmNumeros();
    } else {
      msgEl().textContent = `❌ ${(resultado && resultado.error) || 'Falha ao vincular.'}`;
    }
  });
}

carregar();
