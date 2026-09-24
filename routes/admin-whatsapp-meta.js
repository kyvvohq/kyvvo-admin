// Área admin > WhatsApp > WABAs/Templates — pedido do Bruno: consulta direto
// na Meta Graph API ao vivo, não espelha aprovação/status no nosso banco
// ("se um número está pendente de aprovação da Meta quero ver na Kyvvo e
// não na Meta"). O banco entra só pra rotular qual tenant é dono de cada
// WABA (JOIN por meta_waba_id em tenants/numeros_prontos) — rótulo, não
// status; sem ele o admin só veria um ID da Meta sem contexto nenhum.
const metaWhatsappService = require('../lib/meta-whatsapp-service');

function registerAdminWhatsappMetaRoutes(fastify, pool) {
  async function mapaWabaParaTenant() {
    const { rows } = await pool.query(
      `SELECT meta_waba_id, nome AS tenant_nome, id AS tenant_id FROM tenants WHERE meta_waba_id IS NOT NULL
       UNION ALL
       SELECT n.meta_waba_id, t.nome AS tenant_nome, t.id AS tenant_id
       FROM numeros_prontos n JOIN tenants t ON t.id = n.tenant_id
       WHERE n.meta_waba_id IS NOT NULL`
    );
    const mapa = new Map();
    rows.forEach((r) => mapa.set(r.meta_waba_id, { tenantId: r.tenant_id, tenantNome: r.tenant_nome }));
    return mapa;
  }

  // WABAs que o Usuário do Sistema da Kyvvo gerencia, ao vivo — cada uma
  // enriquecida com seus números (fan-out paralelo, WABA a WABA; o volume
  // hoje é pequeno o bastante pra não precisar de paginação/lote).
  fastify.get('/api/whatsapp/wabas', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    if (!process.env.META_WHATSAPP_TOKEN || !process.env.META_BUSINESS_ID) {
      return { configurado: false, wabas: [] };
    }
    let wabas;
    try {
      wabas = await metaWhatsappService.listarWabas();
    } catch (erro) {
      return reply.code(502).send({ error: `Falha ao consultar a Meta: ${erro.message}` });
    }

    const [tenantPorWaba, ...numerosPorWaba] = await Promise.all([
      mapaWabaParaTenant(),
      ...wabas.map((w) => metaWhatsappService.listarNumerosDaWaba(w.id).catch((erro) => ({ _erro: erro.message }))),
    ]);

    return {
      configurado: true,
      wabas: wabas.map((w, i) => {
        const numeros = numerosPorWaba[i];
        const tenant = tenantPorWaba.get(w.id) || null;
        return {
          id: w.id,
          nome: w.name,
          statusRevisao: w.account_review_status || null,
          namespaceTemplates: w.message_template_namespace || null,
          tenantId: tenant ? tenant.tenantId : null,
          tenantNome: tenant ? tenant.tenantNome : null,
          numeros: Array.isArray(numeros) ? numeros.map((n) => ({
            id: n.id || null,
            numeroExibido: n.display_phone_number || null,
            nomeVerificado: n.verified_name || null,
            qualidade: n.quality_rating || null,
            statusVerificacao: n.code_verification_status || null,
            status: n.status || null,
          })) : [],
          numerosErro: Array.isArray(numeros) ? null : numeros._erro,
        };
      }),
    };
  });

  // Templates de mensagem de todas as WABAs, agregados — cada linha marcada
  // com de qual WABA/tenant veio. Mesmo raciocínio de "status sempre da
  // Meta, nunca de cópia local": não existe tabela de templates aqui.
  fastify.get('/api/whatsapp/templates', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    if (!process.env.META_WHATSAPP_TOKEN || !process.env.META_BUSINESS_ID) {
      return { configurado: false, templates: [] };
    }
    let wabas;
    try {
      wabas = await metaWhatsappService.listarWabas();
    } catch (erro) {
      return reply.code(502).send({ error: `Falha ao consultar a Meta: ${erro.message}` });
    }

    const tenantPorWaba = await mapaWabaParaTenant();
    const porWaba = await Promise.all(
      wabas.map((w) => metaWhatsappService.listarTemplatesDaWaba(w.id).catch((erro) => ({ _erro: erro.message, waba: w })))
    );

    const templates = [];
    const errosPorWaba = [];
    porWaba.forEach((resultado, i) => {
      const w = wabas[i];
      const tenant = tenantPorWaba.get(w.id) || null;
      if (!Array.isArray(resultado)) {
        errosPorWaba.push({ wabaId: w.id, wabaNome: w.name, erro: resultado._erro });
        return;
      }
      resultado.forEach((t) => {
        templates.push({
          nome: t.name,
          status: t.status || null,
          categoria: t.category || null,
          idioma: t.language || null,
          motivoRejeicao: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
          wabaId: w.id,
          wabaNome: w.name,
          tenantId: tenant ? tenant.tenantId : null,
          tenantNome: tenant ? tenant.tenantNome : null,
        });
      });
    });

    return { configurado: true, templates, errosPorWaba };
  });
}

module.exports = { registerAdminWhatsappMetaRoutes };
