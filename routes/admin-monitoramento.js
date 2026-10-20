// Área admin da Kyvvo — Monitoramento — extraído de index.js (fase 9 da
// modularização): GET /admin/api/ia-uso.
// GET /api/whatsapp/status (checava 1 META_PHONE_NUMBER_ID fixo) saiu daqui
// — virou GET /api/whatsapp/wabas em admin-whatsapp-meta.js, que cobre
// todo número de toda WABA que a Kyvvo gerencia, não só um fixo.
const { calcularCustoReaisIA } = require('../lib/ia-custo');

function registerAdminMonitoramentoRoutes(fastify, pool) {
  // Dashboard de consumo da IA (US68) — volume de mensagens/conversas por
  // tenant/dia e custo real em R$, calculado a partir dos tokens capturados
  // em cada turno do assistente (só linhas role='assistant' têm
  // tokens_entrada/tokens_saida — são as únicas que chamam a Anthropic API).
  // Mensagens salvas antes da migration 053 ficam com tokens null: entram no
  // volume mas não somam custo.

  fastify.get('/api/ia-uso', { preHandler: [fastify.authenticateAdmin] }, async (request) => {
    const dias = Math.min(Math.max(parseInt(request.query.dias, 10) || 30, 1), 90);

    const { rows: porDia } = await pool.query(
      `SELECT (criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
              count(*) FILTER (WHERE role = 'assistant') AS mensagens,
              coalesce(sum(tokens_entrada), 0) AS tokens_entrada,
              coalesce(sum(tokens_saida), 0) AS tokens_saida
         FROM conversas_ia
        WHERE criado_em >= now() - ($1 || ' days')::interval
        GROUP BY 1
        ORDER BY 1`,
      [dias]
    );

    const { rows: porTenant } = await pool.query(
      `SELECT t.id AS tenant_id, t.nome AS tenant_nome,
              count(*) FILTER (WHERE c.role = 'assistant') AS mensagens,
              count(DISTINCT c.cliente_id) AS conversas,
              coalesce(sum(c.tokens_entrada), 0) AS tokens_entrada,
              coalesce(sum(c.tokens_saida), 0) AS tokens_saida,
              count(*) FILTER (WHERE c.role = 'assistant' AND c.intent = 'fallback_humano') AS fallback_humano
         FROM conversas_ia c
         JOIN tenants t ON t.id = c.tenant_id
        WHERE c.criado_em >= now() - ($1 || ' days')::interval
        GROUP BY t.id, t.nome
        ORDER BY mensagens DESC`,
      [dias]
    );

    const { rows: porIntent } = await pool.query(
      `SELECT coalesce(intent, 'unknown') AS intent, count(*) AS quantidade
         FROM conversas_ia
        WHERE role = 'assistant' AND criado_em >= now() - ($1 || ' days')::interval
        GROUP BY 1
        ORDER BY 2 DESC`,
      [dias]
    );

    const totalMensagens = porDia.reduce((soma, r) => soma + Number(r.mensagens), 0);
    const totalTokensEntrada = porDia.reduce((soma, r) => soma + Number(r.tokens_entrada), 0);
    const totalTokensSaida = porDia.reduce((soma, r) => soma + Number(r.tokens_saida), 0);
    const totalFallback = porTenant.reduce((soma, r) => soma + Number(r.fallback_humano), 0);

    return {
      periodo: { dias },
      resumo: {
        totalMensagens,
        tenantsAtivos: porTenant.length,
        tokensEntrada: totalTokensEntrada,
        tokensSaida: totalTokensSaida,
        custoReaisTotal: calcularCustoReaisIA(totalTokensEntrada, totalTokensSaida),
        taxaFallbackHumano: totalMensagens ? Number(((totalFallback / totalMensagens) * 100).toFixed(1)) : 0,
      },
      porDia: porDia.map((r) => ({
        dia: r.dia.toISOString().slice(0, 10),
        mensagens: Number(r.mensagens),
        custoReais: calcularCustoReaisIA(Number(r.tokens_entrada), Number(r.tokens_saida)),
      })),
      porTenant: porTenant.map((r) => ({
        tenantId: r.tenant_id,
        tenantNome: r.tenant_nome,
        mensagens: Number(r.mensagens),
        conversas: Number(r.conversas),
        tokensEntrada: Number(r.tokens_entrada),
        tokensSaida: Number(r.tokens_saida),
        custoReais: calcularCustoReaisIA(Number(r.tokens_entrada), Number(r.tokens_saida)),
        taxaFallbackHumano: Number(r.mensagens) > 0
          ? Number(((Number(r.fallback_humano) / Number(r.mensagens)) * 100).toFixed(1))
          : 0,
      })),
      porIntent: porIntent.map((r) => ({ intent: r.intent, quantidade: Number(r.quantidade) })),
    };
  });

  // Aba Consumo do detalhe do tenant (pedido do Bruno, 2026-10-20) — custo de
  // IA GERAL (todo o histórico) e do MÊS atual pra um tenant específico,
  // diferente de GET /api/ia-uso acima (que é um dashboard cross-tenant
  // limitado a uma janela de `dias`). Mesma lib de preço (ia-custo.js), sem
  // duplicar a cotação/tabela de preço por tokens.
  fastify.get('/api/tenants/:id/ia-uso', { preHandler: [fastify.authenticateAdmin] }, async (request) => {
    const { id } = request.params;
    const { rows } = await pool.query(
      `SELECT
         count(*) FILTER (WHERE role = 'assistant') AS mensagens,
         count(DISTINCT cliente_id) AS conversas,
         coalesce(sum(tokens_entrada), 0) AS tokens_entrada,
         coalesce(sum(tokens_saida), 0) AS tokens_saida,
         max(criado_em) AS ultima_conversa_em,
         count(*) FILTER (WHERE role = 'assistant' AND criado_em >= date_trunc('month', now())) AS mensagens_mes,
         coalesce(sum(tokens_entrada) FILTER (WHERE criado_em >= date_trunc('month', now())), 0) AS tokens_entrada_mes,
         coalesce(sum(tokens_saida) FILTER (WHERE criado_em >= date_trunc('month', now())), 0) AS tokens_saida_mes
       FROM conversas_ia
       WHERE tenant_id = $1`,
      [id]
    );
    const r = rows[0];
    return {
      mensagens: Number(r.mensagens),
      conversas: Number(r.conversas),
      ultimaConversaEm: r.ultima_conversa_em,
      custoReaisGeral: calcularCustoReaisIA(Number(r.tokens_entrada), Number(r.tokens_saida)),
      mensagensMes: Number(r.mensagens_mes),
      custoReaisMes: calcularCustoReaisIA(Number(r.tokens_entrada_mes), Number(r.tokens_saida_mes)),
    };
  });
}

module.exports = { registerAdminMonitoramentoRoutes };
