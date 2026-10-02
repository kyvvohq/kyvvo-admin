// Helpers das telas do grupo E-mail (email-*.html) — carregado depois de
// shell.js (que define `token`) e antes do script da tela.

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
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ...json, __erro: json.error || `Erro ${res.status}` };
  return json;
}

function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

const EMAIL_PRODUTOS = { platform: 'Plataforma (todos os produtos)', studio: 'Studio', people: 'People', crm: 'CRM', admin: 'Admin' };
const EMAIL_TIPOS = { notificacao: 'Notificação', seguranca: 'Segurança da conta', convite: 'Convite', mensagem: 'Mensagem', aviso: 'Aviso' };

// Aviso curto no topo do conteúdo (sucesso/erro), some sozinho.
function avisar(texto, erro = false) {
  let el = document.getElementById('email-aviso');
  if (!el) {
    el = document.createElement('div');
    el.id = 'email-aviso';
    el.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:1000;padding:12px 16px;border-radius:10px;font-size:14px;box-shadow:0 8px 24px rgba(15,17,26,.18);max-width:420px';
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.style.background = erro ? 'var(--danger)' : 'var(--text)';
  el.style.color = 'var(--card)';
  el.hidden = false;
  clearTimeout(avisar._t);
  avisar._t = setTimeout(() => { el.hidden = true; }, 4000);
}
