// E-mail > Envios — histórico dos e-mails enviados pela plataforma (todos os
// produtos), com status atualizado pelos eventos do SES (entregue, bounce,
// reclamação). Ver routes/admin-email.js.

const conteudo = document.getElementById('conteudo');

const STATUS = {
  enviado: ['Enviado', 'badge-status-nao-ativado'],
  entregue: ['Entregue', 'badge-status-ativo'],
  bounce: ['Não entregue (bounce)', 'badge-status-inadimplente'],
  reclamacao: ['Marcado como spam', 'badge-status-inadimplente'],
  rejeitado: ['Rejeitado', 'badge-status-inadimplente'],
  falhou: ['Falhou', 'badge-status-inadimplente'],
  suprimido: ['Bloqueado (lista)', 'badge-status-inativo'],
  log: ['Só log (dev)', 'badge-status-inativo'],
};

let filtro = { produto: '', status: '', q: '' };
let timerBusca = null;

function badge(status) {
  const [rotulo, classe] = STATUS[status] || [status, 'badge-status-inativo'];
  return `<span class="badge badge-status ${classe}">${escapeHtml(rotulo)}</span>`;
}

async function carregar() {
  const params = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v));
  const lista = document.getElementById('envios-lista');
  if (lista) lista.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
  const r = await api(`/api/email/envios?${params}`);
  if (!r) return;
  if (r.__erro) { conteudo.innerHTML = `<div class="vazio">${escapeHtml(r.__erro)}</div>`; return; }
  render(r);
}

function render(d) {
  if (!document.getElementById('envios-lista')) montar();
  const cards = [['Total', d.total], ['Entregues', d.porStatus.entregue || 0], ['Enviados (aguardando confirmação)', d.porStatus.enviado || 0],
    ['Com problema', (d.porStatus.bounce || 0) + (d.porStatus.reclamacao || 0) + (d.porStatus.rejeitado || 0) + (d.porStatus.falhou || 0)]];
  document.getElementById('envios-cards').innerHTML = cards.map(([r, n]) => `
    <div class="secao-detalhe" style="flex:1;min-width:180px">
      <div style="font-size:13px;color:var(--muted)">${escapeHtml(r)}</div>
      <div style="font-size:28px;font-weight:700">${n}</div>
    </div>`).join('');
  document.getElementById('envios-titulo').textContent = d.envios.length < d.total ? `Últimos ${d.envios.length} de ${d.total}` : 'Histórico';
  document.getElementById('envios-lista').innerHTML = d.envios.map((e) => `
    <tr>
      <td>${formatarDataHora(e.criado_em)}</td>
      <td>${escapeHtml(EMAIL_PRODUTOS[e.produto] || e.produto)}</td>
      <td>${escapeHtml(e.destinatario)}</td>
      <td>${escapeHtml(e.assunto)}${e.tag ? `<div class="tabela-contato-email">${escapeHtml(e.tag)}</div>` : ''}</td>
      <td>${badge(e.status)}${e.erro ? `<div class="tabela-contato-email" title="${escapeHtml(e.erro)}">${escapeHtml(e.erro.slice(0, 80))}</div>` : ''}</td>
      <td>${escapeHtml(e.provedor)}</td>
    </tr>`).join('') || '<tr><td colspan="6">Nenhum e-mail encontrado.</td></tr>';
}

function montar() {
  conteudo.innerHTML = `
    <h2 class="titulo-detalhe">E-mails enviados</h2>
    <p class="vazio-inline">Todos os e-mails que os produtos mandaram pela plataforma. "Entregue", "bounce" e "spam" chegam da AWS alguns segundos depois do envio.</p>
    <div id="envios-cards" style="display:flex;gap:16px;margin:16px 0;flex-wrap:wrap"></div>
    <section class="secao-detalhe">
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <input type="search" id="f-q" placeholder="Buscar por destinatário ou assunto" style="flex:1;min-width:220px;width:auto;margin:0">
        <select id="f-produto" style="width:auto;margin:0"><option value="">Todos os produtos</option>${Object.entries(EMAIL_PRODUTOS).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('')}</select>
        <select id="f-status" style="width:auto;margin:0"><option value="">Todos os status</option>${Object.entries(STATUS).map(([k, [v]]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('')}</select>
      </div>
      <h3 id="envios-titulo">Histórico</h3>
      <div class="tabela-wrapper"><table class="tabela-tenants">
        <thead><tr><th>Data/hora</th><th>Produto</th><th>Destinatário</th><th>Assunto</th><th>Status</th><th>Provedor</th></tr></thead>
        <tbody id="envios-lista"></tbody>
      </table></div>
    </section>
  `;
  document.getElementById('f-produto').addEventListener('change', (e) => { filtro.produto = e.target.value; carregar(); });
  document.getElementById('f-status').addEventListener('change', (e) => { filtro.status = e.target.value; carregar(); });
  document.getElementById('f-q').addEventListener('input', (e) => {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(() => { filtro.q = e.target.value; carregar(); }, 350);
  });
}

carregar();
