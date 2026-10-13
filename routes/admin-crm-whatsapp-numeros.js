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
// chamarCrmInterno virou compartilhada em lib/crm-interno.js (2026-10-03 —
// também usada pelo toggle do módulo "Resumo" em admin-tenants.js).
const { chamarCrmInterno } = require('../lib/crm-interno');

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

  // Erro devolvido com status 200 (não 502/500) de propósito: nginx/Cloudflare
  // na frente do admin trocam qualquer 5xx do serviço por uma página HTML
  // genérica de erro — o front nunca chegava a ver a mensagem real (achado
  // ao vivo, 2026-09-25). `resultado.error` é o jeito de sinalizar falha
  // aqui, não o status HTTP.
  fastify.get('/api/whatsapp/crm-numeros', { preHandler: [fastify.authenticateAdmin] }, async (request) => {
    let dados;
    try {
      dados = await chamarCrmInterno('/crm/admin-interno/whatsapp-numeros');
    } catch (erro) {
      fastify.log.error(`[crm-whatsapp-numeros] ${erro.message}`);
      return { error: erro.message };
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
      const resultado = await chamarCrmInterno('/crm/admin-interno/whatsapp-numeros', {
        method: 'POST',
        body: JSON.stringify({ phone_number_id: phoneNumberId, tenant_id: tenantId, numero_exibido: numeroExibido || null }),
      });
      return reply.code(201).send(resultado);
    } catch (erro) {
      fastify.log.error(`[crm-whatsapp-numeros] ${erro.message}`);
      return { error: erro.message };
    }
  });

  fastify.delete('/api/whatsapp/crm-numeros/:phoneNumberId', { preHandler: [fastify.authenticateAdmin] }, async (request) => {
    try {
      await chamarCrmInterno(`/crm/admin-interno/whatsapp-numeros/${encodeURIComponent(request.params.phoneNumberId)}`, { method: 'DELETE' });
      return { ok: true };
    } catch (erro) {
      fastify.log.error(`[crm-whatsapp-numeros] ${erro.message}`);
      return { error: erro.message };
    }
  });

  // Modo do agente de atendimento (desligado/rascunho/automatico) por
  // tenant — diagnóstico de "bot não responde" sem query manual no banco.
  fastify.get('/api/whatsapp/crm-agente-config/:tenantId', { preHandler: [fastify.authenticateAdmin] }, async (request) => {
    try {
      return await chamarCrmInterno(`/crm/admin-interno/agente-config/${encodeURIComponent(request.params.tenantId)}`);
    } catch (erro) {
      fastify.log.error(`[crm-agente-config] ${erro.message}`);
      return { error: erro.message };
    }
  });
}

module.exports = { registerAdminCrmWhatsappNumerosRoutes };
