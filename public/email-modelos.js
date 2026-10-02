// E-mail > Modelos — textos de cada e-mail que os produtos enviam, editáveis
// sem desenvolvimento, com prévia ao vivo (renderizada pelo próprio
// kyvvo-platform). Ver routes/admin-email.js.

const conteudo = document.getElementById('conteudo');
let modelos = [];
let editando = null; // cópia do modelo aberto no editor
let timerPrevia = null;

async function carregar() {
  conteudo.innerHTML = '<div class="vazio">Carregando modelos...</div>';
  const r = await api('/api/email/modelos');
  if (!r) return;
  if (r.__erro) { conteudo.innerHTML = `<div class="vazio">${escapeHtml(r.__erro)}</div>`; return; }
  modelos = r.modelos;
  const id = new URLSearchParams(location.search).get('id');
  const m = id && modelos.find((x) => x.id === id);
  if (m) abrirEditor(m); else renderLista();
}

function renderLista() {
  editando = null;
  history.replaceState(null, '', '/email-modelos.html');
  const grupos = {};
  for (const m of modelos) (grupos[m.produto] = grupos[m.produto] || []).push(m);
  conteudo.innerHTML = `
    <h2 class="titulo-detalhe">Modelos de e-mail</h2>
    <p class="vazio-inline">Textos de cada e-mail enviado pelos produtos. O que você salvar aqui passa a valer no próximo envio, em até 1 minuto — sem deploy.
    A identidade visual, o selo do produto e o rodapé são aplicados automaticamente (o rodapé se edita em <a href="/email-rodape.html">E-mail → Rodapé</a>).</p>
    ${Object.entries(grupos).map(([produto, lista]) => `
      <section class="secao-detalhe" style="margin-top:16px">
        <h3>${escapeHtml(EMAIL_PRODUTOS[produto] || produto)}</h3>
        <div class="tabela-wrapper"><table class="tabela-tenants">
          <thead><tr><th>E-mail</th><th>Quando é enviado</th><th>Tipo</th><th>Situação</th><th>Última edição</th><th></th></tr></thead>
          <tbody>${lista.map((m) => `
            <tr>
              <td><strong>${escapeHtml(m.nome)}</strong><div class="tabela-contato-email">${escapeHtml(m.assunto)}</div></td>
              <td>${escapeHtml(m.descricao || '')}</td>
              <td>${escapeHtml(EMAIL_TIPOS[m.tipo] || m.tipo)}</td>
              <td>${m.ativo ? '<span class="badge badge-status badge-status-ativo">Ativo</span>' : '<span class="badge badge-status badge-status-inativo">Texto padrão do produto</span>'}</td>
              <td>${m.atualizado_por ? `${formatarDataHora(m.atualizado_em)}<div class="tabela-contato-email">${escapeHtml(m.atualizado_por)}</div>` : '—'}</td>
              <td><button class="btn-tabela" data-editar="${m.id}">Editar</button></td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </section>`).join('')}
  `;
  conteudo.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => {
    abrirEditor(modelos.find((m) => m.id === b.dataset.editar));
  }));
}

function campo(id, rotulo, valor, { textarea = false, ajuda = '', max } = {}) {
  const attrs = `id="${id}" ${max ? `maxlength="${max}"` : ''} data-campo`;
  return `
    <label for="${id}" style="display:block;margin-top:14px;font-weight:600">${rotulo}</label>
    ${textarea
      ? `<textarea ${attrs} rows="7" style="width:100%;font-family:inherit;font-size:14px;padding:10px;border:1px solid var(--border-strong);border-radius:8px;background:var(--input-bg);color:var(--text);resize:vertical">${escapeHtml(valor || '')}</textarea>`
      : `<input type="text" ${attrs} value="${escapeHtml(valor || '')}" style="width:100%">`}
    ${ajuda ? `<div class="vazio-inline" style="font-size:12.5px;margin-top:4px">${ajuda}</div>` : ''}`;
}

function abrirEditor(m) {
  editando = { ...m };
  history.replaceState(null, '', `/email-modelos.html?id=${m.id}`);
  const vars = m.variaveis || [];
  const ehNotificacao = m.tipo === 'notificacao';
  const alterado = ['assunto', 'titulo', 'corpo', 'cta_texto', 'motivo'].some((c) => (m.padrao || {})[c] !== m[c] && !((m.padrao || {})[c] == null && !m[c]));
  conteudo.innerHTML = `
    <button class="btn-secundario btn-auto" id="btn-voltar" style="margin-bottom:12px">← Todos os modelos</button>
    <h2 class="titulo-detalhe">${escapeHtml(m.nome)} <span class="vazio-inline" style="font-size:14px;font-weight:400">· ${escapeHtml(EMAIL_PRODUTOS[m.produto] || m.produto)} · ${escapeHtml(EMAIL_TIPOS[m.tipo] || m.tipo)}</span></h2>
    <p class="vazio-inline">${escapeHtml(m.descricao || '')}</p>

    <div style="display:grid;grid-template-columns:minmax(320px,1fr) minmax(320px,1.1fr);gap:20px;align-items:start;margin-top:12px" id="editor-grid">
      <section class="secao-detalhe">
        <label class="toggle-linha"><span class="toggle-switch"><input type="checkbox" id="m-ativo" ${m.ativo ? 'checked' : ''}><span class="toggle-switch-trilho"></span></span> Usar estes textos</label>
        <div class="vazio-inline" style="font-size:12.5px;margin-top:4px">Desligado, o produto usa o texto que já vem no código dele.</div>

        ${vars.length ? `
          <div style="margin-top:16px;font-weight:600">Variáveis disponíveis <span class="vazio-inline" style="font-weight:400;font-size:12.5px">— clique para inserir no campo selecionado</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
            ${vars.map((v) => `<button type="button" class="btn-tabela" data-var="${escapeHtml(v.nome)}" title="Exemplo: ${escapeHtml(v.exemplo || '')}">{{${escapeHtml(v.nome)}}}</button>`).join('')}
          </div>
          <div class="vazio-inline" style="font-size:12.5px;margin-top:6px">Para um valor alternativo quando a variável vier vazia: <code>{{nome|texto}}</code>.</div>` : ''}

        ${campo('m-assunto', 'Assunto *', m.assunto, { max: 200 })}
        ${campo('m-titulo', 'Título *', m.titulo, { max: 200 })}
        ${campo('m-corpo', 'Texto', m.corpo, { textarea: true, max: 5000, ajuda: 'Deixe uma linha em branco entre parágrafos. Links https são clicáveis automaticamente.' })}
        ${m.cta_texto != null || (m.padrao || {}).cta_texto ? campo('m-cta', 'Texto do botão', m.cta_texto, { max: 60, ajuda: 'O link do botão é definido pelo produto (ex.: o link do convite).' }) : ''}
        ${ehNotificacao
          ? '<div class="vazio-inline" style="margin-top:14px;font-size:13px">O rodapé de notificações (por que recebeu + onde desativar) é editado em <a href="/email-rodape.html">E-mail → Rodapé</a>.</div>'
          : campo('m-motivo', 'Rodapé deste e-mail', m.motivo, { textarea: false, max: 500, ajuda: 'Por que a pessoa recebeu. O aviso "não é necessário responder" entra sempre, depois deste texto.' })}

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px">
          <button class="btn-primario btn-auto" id="btn-salvar">Salvar</button>
          <button class="btn-secundario btn-auto" id="btn-restaurar" ${alterado ? '' : 'disabled title="Os textos já são os padrão"'}>Restaurar padrão</button>
        </div>
        <div id="confirmar-restaurar" hidden style="margin-top:10px;padding:10px;border:1px solid var(--border-strong);border-radius:8px">
          Voltar os textos para o original? O que foi editado será perdido.
          <div style="display:flex;gap:8px;margin-top:8px"><button class="btn-perigo btn-auto" id="btn-restaurar-sim">Restaurar</button><button class="btn-secundario btn-auto" id="btn-restaurar-nao">Cancelar</button></div>
        </div>

        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
          <div style="font-weight:600">Enviar teste</div>
          <div class="vazio-inline" style="font-size:12.5px">Envia a versão <strong>salva</strong>, com os valores de exemplo.</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input type="email" id="m-teste-para" placeholder="vazio = seu e-mail de login" style="flex:1">
            <button class="btn-secundario btn-auto" id="btn-teste">Enviar</button>
          </div>
        </div>
      </section>

      <section class="secao-detalhe" style="position:sticky;top:16px">
        <div style="font-weight:600">Prévia</div>
        <div style="margin:6px 0 10px;font-size:13px"><span class="vazio-inline">Assunto:</span> <strong id="previa-assunto">—</strong></div>
        <iframe id="previa" title="Prévia do e-mail" sandbox="" style="width:100%;height:680px;border:1px solid var(--border);border-radius:10px;background:#F8F9FC"></iframe>
        <div class="vazio-inline" style="font-size:12px;margin-top:6px">Com valores de exemplo. Botão, tabela de detalhes e código são preenchidos pelo produto no envio real.</div>
      </section>
    </div>
  `;

  const media = window.matchMedia('(max-width: 900px)');
  const ajustarGrid = () => { document.getElementById('editor-grid').style.gridTemplateColumns = media.matches ? '1fr' : 'minmax(320px,1fr) minmax(320px,1.1fr)'; };
  ajustarGrid();

  let ultimoCampo = document.getElementById('m-corpo');
  conteudo.querySelectorAll('[data-campo]').forEach((el) => {
    el.addEventListener('focus', () => { ultimoCampo = el; });
    el.addEventListener('input', agendarPrevia);
  });
  conteudo.querySelectorAll('[data-var]').forEach((b) => b.addEventListener('click', () => {
    const el = ultimoCampo;
    if (!el) return;
    const ins = `{{${b.dataset.var}}}`;
    const ini = el.selectionStart ?? el.value.length;
    const fim = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, ini) + ins + el.value.slice(fim);
    el.focus();
    el.selectionStart = el.selectionEnd = ini + ins.length;
    agendarPrevia();
  }));

  document.getElementById('btn-voltar').addEventListener('click', renderLista);
  document.getElementById('btn-salvar').addEventListener('click', salvar);
  document.getElementById('btn-restaurar').addEventListener('click', () => { document.getElementById('confirmar-restaurar').hidden = false; });
  document.getElementById('btn-restaurar-nao').addEventListener('click', () => { document.getElementById('confirmar-restaurar').hidden = true; });
  document.getElementById('btn-restaurar-sim').addEventListener('click', restaurar);
  document.getElementById('btn-teste').addEventListener('click', enviarTeste);

  atualizarPrevia();
}

function lerFormulario() {
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
  const dados = {
    assunto: val('m-assunto'),
    titulo: val('m-titulo'),
    corpo: val('m-corpo'),
    ativo: document.getElementById('m-ativo').checked,
  };
  if (document.getElementById('m-cta')) dados.cta_texto = val('m-cta');
  if (document.getElementById('m-motivo')) dados.motivo = val('m-motivo');
  return dados;
}

function agendarPrevia() {
  clearTimeout(timerPrevia);
  timerPrevia = setTimeout(atualizarPrevia, 450);
}

async function atualizarPrevia() {
  if (!editando) return;
  const f = lerFormulario();
  const modelo = { ...editando, ...f };
  const r = await api('/api/email/preview', { method: 'POST', body: JSON.stringify({ modelo }) });
  if (!r || !editando) return;
  const iframe = document.getElementById('previa');
  if (r.__erro) {
    document.getElementById('previa-assunto').textContent = '—';
    iframe.srcdoc = `<p style="font-family:Arial;padding:24px;color:#B42318">Não foi possível gerar a prévia: ${escapeHtml(r.__erro)}</p>`;
    return;
  }
  document.getElementById('previa-assunto').textContent = r.assunto;
  iframe.srcdoc = r.html;
}

async function salvar() {
  const f = lerFormulario();
  if (!f.assunto.trim() || !f.titulo.trim()) { avisar('Assunto e título são obrigatórios.', true); return; }
  const btn = document.getElementById('btn-salvar');
  btn.disabled = true;
  const r = await api(`/api/email/modelos/${editando.id}`, { method: 'PATCH', body: JSON.stringify(f) });
  btn.disabled = false;
  if (!r) return;
  if (r.__erro) { avisar(r.__erro, true); return; }
  const i = modelos.findIndex((m) => m.id === r.modelo.id);
  modelos[i] = r.modelo;
  avisar('Modelo salvo. Vale no próximo envio, em até 1 minuto.');
  abrirEditor(r.modelo);
}

async function restaurar() {
  const r = await api(`/api/email/modelos/${editando.id}/restaurar`, { method: 'POST', body: '{}' });
  if (!r) return;
  if (r.__erro) { avisar(r.__erro, true); return; }
  const i = modelos.findIndex((m) => m.id === r.modelo.id);
  modelos[i] = r.modelo;
  avisar('Textos padrão restaurados.');
  abrirEditor(r.modelo);
}

async function enviarTeste() {
  const para = document.getElementById('m-teste-para').value.trim();
  const btn = document.getElementById('btn-teste');
  btn.disabled = true;
  const r = await api(`/api/email/modelos/${editando.id}/teste`, { method: 'POST', body: JSON.stringify({ para }) });
  btn.disabled = false;
  if (!r) return;
  if (r.__erro) {
    const motivo = (r.resultados || [])[0];
    avisar(motivo && motivo.status === 'suprimido' ? 'Esse e-mail está na lista de bloqueio.' : r.__erro, true);
    return;
  }
  avisar(`Teste enviado para ${para || 'o seu e-mail'}.`);
}

carregar();
