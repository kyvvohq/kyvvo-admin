// Área admin > WhatsApp > WABAs, seção "Kyvvo CRM — WhatsApp por cliente"
// (pedido do Bruno, 2026-09-25): até aqui o vínculo phone_number_id ->
// tenant_id do bot de atendimento do CRM só existia via INSERT manual direto
// no banco do CRM (ver kyvvo-crm/docs/DECISOES-PENDENTES.md #3). Este arquivo
// só repassa pras rotas internas novas do kyvvo-crm (protegidas por
// ADMIN_INTERNAL_TOKEN, mesmo padrão já usado com o People em
// admin-whatsapp-disparos.js) — nenhum dado fica espelhado aqui.
//
// Nota de arquitetura (não resolvida nesta rodada): o kyvvo-platform só
// roteia UM phone_number_id pro serviço do CRM inteiro (env
// CRM_PHONE_NUMBER_ID, ver kyvvo-platform/routes/webhook-whatsapp.js) —
// então hoje só um cliente do CRM por vez pode ter bot de atendimento próprio
// de verdade, mesmo a tabela crm_whatsapp_numeros suportando vários. Esta
// tela troca QUAL cliente é dono do número já roteado; dar um número
// dedicado pra um SEGUNDO cliente do CRM ao mesmo tempo exige mudar o
// roteamento do platform pra olhar a tabela em vez de comparar com uma env
// var fixa — fora de escopo aqui.
const CRM_INTERNAL_URL = process.env.CRM_INTERNAL_URL || 'http://crm:3005';
const ADMIN_INTERNAL_TOKEN = process.env.ADMIN_INTERNAL_TOKEN;

async function chamarCrmInterno(fastify, path, options = {}) {
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

function registerAdminCrmWhatsappNumerosRoutes(fastify, pool) {
  // Tenants com o módulo 'crm' ativo — mesmo JOIN já usado em
  // admin-tenants.js pra outros módulos, só que filtrado por 'crm' aqui.
  fastify.get('/api/whatsapp/crm-tenants', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const { rows } = await pool.query(
      `select t.id, t.nome from tenants t
       join tenant_modulos tm on tm.tenant_id = t.id
       where tm.modulo_key = 'crm' and tm.ativo = true
       order by t.nome`
    );
    return { tenants: rows };
  });

  fastify.get('/api/whatsapp/crm-numeros', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    let dados;
    try {
      dados = await chamarCrmInterno(fastify, '/crm/admin-interno/whatsapp-numeros');
    } catch (erro) {
      fastify.log.error(`[crm-whatsapp-numeros] ${erro.message}`);
      return reply.code(502).send({ error: erro.message });
    }
    const tenantIds = [...new Set(dados.numeros.map((n) => n.tenant_id))];
    let nomesPorTenant = new Map();
    if (tenantIds.length) {
      const { rows } = await pool.query('select id, nome from tenants where id = any($1::uuid[])', [tenantIds]);
      nomesPorTenant = new Map(rows.map((r) => [r.id, r.nome]));
    }
    return {
      numeros: dados.numeros.map((n) => ({ ...n, tenant_nome: nomesPorTenant.get(n.tenant_id) || null })),
    };
  });

  fastify.post('/api/whatsapp/crm-numeros', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { phone_number_id: phoneNumberId, tenant_id: tenantId, numero_exibido: numeroExibido } = request.body || {};
    if (!phoneNumberId || !tenantId) {
      return reply.code(400).send({ error: 'phone_number_id e tenant_id são obrigatórios' });
    }
    try {
      const resultado = await chamarCrmInterno(fastify, '/crm/admin-interno/whatsapp-numeros', {
        method: 'POST',
        body: JSON.stringify({ phone_number_id: phoneNumberId, tenant_id: tenantId, numero_exibido: numeroExibido || null }),
      });
      return reply.code(201).send(resultado);
    } catch (erro) {
      fastify.log.error(`[crm-whatsapp-numeros] ${erro.message}`);
      return reply.code(502).send({ error: erro.message });
    }
  });

  fastify.delete('/api/whatsapp/crm-numeros/:phoneNumberId', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    try {
      await chamarCrmInterno(fastify, `/crm/admin-interno/whatsapp-numeros/${encodeURIComponent(request.params.phoneNumberId)}`, { method: 'DELETE' });
      return { ok: true };
    } catch (erro) {
      fastify.log.error(`[crm-whatsapp-numeros] ${erro.message}`);
      return reply.code(502).send({ error: erro.message });
    }
  });
}

module.exports = { registerAdminCrmWhatsappNumerosRoutes };
