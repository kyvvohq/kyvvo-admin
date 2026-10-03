// Chamador genérico das rotas internas do kyvvo-crm (protegidas por
// ADMIN_INTERNAL_TOKEN, mesmo segredo compartilhado usado com o People).
// Extraído de routes/admin-crm-whatsapp-numeros.js (2026-10-03) pra ser
// reusado também pelo toggle do módulo "Resumo" (routes/admin-tenants.js).
const CRM_INTERNAL_URL = process.env.CRM_INTERNAL_URL || 'http://crm:3005';
const ADMIN_INTERNAL_TOKEN = process.env.ADMIN_INTERNAL_TOKEN;

async function chamarCrmInterno(path, options = {}) {
  if (!ADMIN_INTERNAL_TOKEN) {
    throw new Error('ADMIN_INTERNAL_TOKEN não configurado no servidor do admin.');
  }
  const res = await fetch(`${CRM_INTERNAL_URL}${path}`, {
    ...options,
    headers: {
      'x-admin-internal-token': ADMIN_INTERNAL_TOKEN,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({}));
    throw new Error(erro.error || `CRM respondeu ${res.status}`);
  }
  return res.json();
}

module.exports = { chamarCrmInterno };
