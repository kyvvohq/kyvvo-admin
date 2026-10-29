// Fetch wrapper central — substitui o padrão `api()` duplicado em cada
// public/*.js do admin legado (mesmo header Authorization, mesmo redirect
// de 401). Lê o token do localStorage em toda chamada (não guarda em
// módulo) pra pegar login/logout feito numa outra aba.
function token() {
  return localStorage.getItem('kyvvo_admin_token');
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token()}` };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('kyvvo_admin_token');
    localStorage.removeItem('kyvvo_admin_nome');
    window.location.href = '/login.html';
    throw new Error('Não autenticado');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const erro = new Error(data.error || `Erro ${res.status}`);
    erro.status = res.status;
    erro.data = data;
    throw erro;
  }
  return data;
}

export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }),
};
