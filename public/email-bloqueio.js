// E-mail > Lista de bloqueio — endereços que não recebem mais nenhum e-mail
// da Kyvvo: bounce permanente e reclamação de spam (automáticos, vindos da
// AWS) ou incluídos à mão. Ver routes/admin-email.js.

const conteudo = document.getElementById('conteudo');
const MOTIVOS = { bounce: 'Endereço inexistente (bounce)', reclamacao: 'Marcou como spam', manual: 'Incluído manualmente' };

async function carregar() {
  const r = await api('/api/email/supressoes');
  if (!r) return;
  if (r.__erro) { conteudo.innerHTML = `<div class="vazio">${escapeHtml(r.__erro)}</div>`; return; }
  conteudo.innerHTML = `
    <h2 class="titulo-detalhe">Lista de bloqueio</h2>
    <p class="vazio-inline">Ninguém desta lista recebe e-mail da Kyvvo, de nenhum produto. Endereços que deram bounce ou marcaram spam entram sozinhos — insistir neles derruba a reputação de envio da conta.
    Só remova se tiver certeza de que o problema foi resolvido (ex.: o cliente corrigiu a caixa de e-mail).</p>
    <section class="secao-detalhe" style="margin-top:16px">
      <h3>Bloquear um e-mail</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input type="email" id="novo-email" placeholder="email@exemplo.com" style="flex:1;min-width:220px">
        <input type="text" id="novo-detalhe" placeholder="Motivo (opcional)" style="flex:1;min-width:220px" maxlength="500">
        <button class="btn-primario btn-auto" id="btn-adicionar">Bloquear</button>
      </div>
    </section>
    <section class="secao-detalhe" style="margin-top:16px">
      <h3>${r.supressoes.length} endereço(s) bloqueado(s)</h3>
      <div class="tabela-wrapper"><table class="tabela-tenants">
        <thead><tr><th>E-mail</th><th>Motivo</th><th>Detalhe</th><th>Desde</th><th></th></tr></thead>
        <tbody>${r.supressoes.map((s) => `
          <tr data-linha="${escapeHtml(s.email)}">
            <td>${escapeHtml(s.email)}</td>
            <td>${escapeHtml(MOTIVOS[s.motivo] || s.motivo)}</td>
            <td style="max-width:360px">${escapeHtml(s.detalhe || '—')}</td>
            <td>${formatarDataHora(s.criado_em)}</td>
            <td style="white-space:nowrap">
              <button class="btn-tabela" data-remover="${escapeHtml(s.email)}">Remover</button>
              <span data-confirmar="${escapeHtml(s.email)}" hidden>Remover mesmo?
                <button class="btn-tabela btn-perigo" data-sim="${escapeHtml(s.email)}">Sim</button>
                <button class="btn-tabela btn-secundario" data-nao="${escapeHtml(s.email)}">Não</button>
              </span>
            </td>
          </tr>`).join('') || '<tr><td colspan="5">Nenhum endereço bloqueado.</td></tr>'}
        </tbody>
      </table></div>
    </section>
  `;
  document.getElementById('btn-adicionar').addEventListener('click', adicionar);
  const alternar = (email, confirmando) => {
    conteudo.querySelector(`[data-remover="${CSS.escape(email)}"]`).hidden = confirmando;
    conteudo.querySelector(`[data-confirmar="${CSS.escape(email)}"]`).hidden = !confirmando;
  };
  conteudo.querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', () => alternar(b.dataset.remover, true)));
  conteudo.querySelectorAll('[data-nao]').forEach((b) => b.addEventListener('click', () => alternar(b.dataset.nao, false)));
  conteudo.querySelectorAll('[data-sim]').forEach((b) => b.addEventListener('click', () => remover(b.dataset.sim)));
}

async function adicionar() {
  const email = document.getElementById('novo-email').value.trim();
  const detalhe = document.getElementById('novo-detalhe').value.trim();
  const r = await api('/api/email/supressoes', { method: 'POST', body: JSON.stringify({ email, detalhe }) });
  if (!r) return;
  if (r.__erro) { avisar(r.__erro, true); return; }
  avisar(`${email} bloqueado.`);
  carregar();
}

async function remover(email) {
  const r = await api(`/api/email/supressoes/${encodeURIComponent(email)}`, { method: 'DELETE' });
  if (!r) return;
  if (r.__erro) { avisar(r.__erro, true); return; }
  avisar(`${email} removido da lista.`);
  carregar();
}

carregar();
