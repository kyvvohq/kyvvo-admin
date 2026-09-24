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
    `;
    return;
  }

  conteudo.innerHTML = `
    <h2 class="titulo-detalhe">WABAs</h2>
    <p class="vazio-inline">Contas do WhatsApp Business que a Kyvvo gerencia, consultadas ao vivo na Meta — aprovação, números e qualidade nunca vêm de cópia local.</p>
    <button class="btn-primario btn-tabela" id="btn-atualizar" style="margin: 8px 0 16px;">🔄 Atualizar</button>
    ${dados.wabas.length ? dados.wabas.map(renderWaba).join('') : '<div class="vazio">Nenhuma WABA atribuída ao Usuário do Sistema da Kyvvo ainda.</div>'}
  `;
  document.getElementById('btn-atualizar').addEventListener('click', carregar);
}

carregar();
