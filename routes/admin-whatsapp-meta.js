// Área admin > WhatsApp > WABAs/Templates — pedido do Bruno: consulta direto
// na Meta Graph API ao vivo, não espelha aprovação/status no nosso banco
// ("se um número está pendente de aprovação da Meta quero ver na Kyvvo e
// não na Meta"). O banco entra só pra rotular qual tenant é dono de cada
// WABA (JOIN por meta_waba_id em tenants/numeros_prontos) — rótulo, não
// status; sem ele o admin só veria um ID da Meta sem contexto nenhum.
const metaWhatsappService = require('../lib/meta-whatsapp-service');
const awsSsmService = require('../lib/aws-ssm-service');
const githubDeployService = require('../lib/github-deploy-service');

// Vincula um número "de casa" (sem tenant) da Meta a um produto Kyvvo —
// escreve o(s) parâmetro(s) certo(s) no SSM e dispara o redeploy dos
// serviços afetados (mesma ação que o Bruno fazia na mão: escrever o SSM +
// `docker compose up -d --force-recreate` de cada serviço). Um produto novo
// é uma entrada aqui, não uma rota nova.
//
// CRM (2026-09-24): diferente do People (número único pro produto inteiro),
// o bot do CRM é por TENANT (ex.: Basic 3D Print) — este botão só resolve o
// roteamento phone_number_id -> produto (platform + o próprio serviço crm);
// o vínculo phone_number_id -> tenant_id específico ainda é feito à mão
// direto no banco do CRM (crm_whatsapp_numeros), Fase 1 de onboarding
// manual (ver docs/DECISOES-PENDENTES.md do kyvvo-crm).
const PRODUTOS_SUPORTADOS = {
  people: {
    parametrosSsm: ['/kyvvo/platform/PEOPLE_PHONE_NUMBER_ID', '/kyvvo/people/META_PHONE_NUMBER_ID'],
    deploys: [
      { repo: 'kyvvo-platform', ref: 'main' },
      { repo: 'kyvvo-people', ref: 'release' },
    ],
  },
  crm: {
    parametrosSsm: ['/kyvvo/platform/CRM_PHONE_NUMBER_ID', '/kyvvo/crm/META_PHONE_NUMBER_ID'],
    deploys: [
      { repo: 'kyvvo-platform', ref: 'main' },
      { repo: 'kyvvo-crm', ref: 'release' },
    ],
  },
};

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

  // Registra um número da Meta pra uso na Cloud API (2ª etapa, PIN de
  // verificação — mesma chamada que o Embedded Signup do tenant já faz
  // automaticamente em kyvvo-studio/routes/whatsapp-config.js). Precisa
  // disso pra número "de casa" da Kyvvo (não vinculado a nenhum tenant, ex.
  // o número do People) que foi só adicionado/verificado na Meta Business
  // Suite, sem passar pelo fluxo de Embedded Signup — fica "PENDING" até
  // alguém chamar isso uma vez.
  fastify.post('/api/whatsapp/numeros/:phoneNumberId/registrar', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    if (!process.env.META_WHATSAPP_TOKEN) {
      return reply.code(400).send({ error: 'META_WHATSAPP_TOKEN não configurado no servidor.' });
    }
    try {
      // `pin` opcional (US real: "Two step verification PIN Mismatch") — um
      // número que já teve 2FA configurado antes (fora do nosso fluxo) exige
      // o PIN ORIGINAL pra re-registrar, não aceita qualquer PIN novo. Sem
      // isso no corpo, mantém o comportamento antigo (gera um aleatório —
      // só funciona pra número que nunca foi registrado).
      const { pin } = request.body || {};
      const resultado = await metaWhatsappService.registrarNumero(request.params.phoneNumberId, pin);
      return { ok: true, resultado };
    } catch (erro) {
      return reply.code(502).send({ error: `Falha ao registrar na Meta: ${erro.message}` });
    }
  });

  // Recuperação de PIN esquecido (ver comentário em solicitarCodigoVerificacao)
  // — passo 1: pede o código por SMS/ligação pro número físico.
  fastify.post('/api/whatsapp/numeros/:phoneNumberId/solicitar-codigo', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    if (!process.env.META_WHATSAPP_TOKEN) {
      return reply.code(400).send({ error: 'META_WHATSAPP_TOKEN não configurado no servidor.' });
    }
    try {
      const { metodo } = request.body || {};
      const resultado = await metaWhatsappService.solicitarCodigoVerificacao(request.params.phoneNumberId, metodo);
      return { ok: true, resultado };
    } catch (erro) {
      return reply.code(502).send({ error: `Falha ao solicitar código na Meta: ${erro.message}` });
    }
  });

  // Passo 2 — confirma o código recebido. Depois disso, /registrar aceita
  // qualquer PIN novo pra esse número.
  fastify.post('/api/whatsapp/numeros/:phoneNumberId/verificar-codigo', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    if (!process.env.META_WHATSAPP_TOKEN) {
      return reply.code(400).send({ error: 'META_WHATSAPP_TOKEN não configurado no servidor.' });
    }
    const { codigo } = request.body || {};
    if (!codigo) {
      return reply.code(400).send({ error: 'Informe o código recebido.' });
    }
    try {
      const resultado = await metaWhatsappService.verificarCodigoVerificacao(request.params.phoneNumberId, codigo);
      return { ok: true, resultado };
    } catch (erro) {
      return reply.code(502).send({ error: `Falha ao verificar código na Meta: ${erro.message}` });
    }
  });

  // Contrário da rota acima — libera o número do registro ativo na Cloud API
  // (não remove da WABA). Usado quando um número verificado direto no Meta
  // Business Suite (fora do Embedded Signup) precisa ser "solto" pra ser
  // reconectado do zero por esse fluxo, sem brigar com o registro anterior.
  fastify.post('/api/whatsapp/numeros/:phoneNumberId/desregistrar', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    if (!process.env.META_WHATSAPP_TOKEN) {
      return reply.code(400).send({ error: 'META_WHATSAPP_TOKEN não configurado no servidor.' });
    }
    try {
      const resultado = await metaWhatsappService.desregistrarNumero(request.params.phoneNumberId);
      return { ok: true, resultado };
    } catch (erro) {
      return reply.code(502).send({ error: `Falha ao desregistrar na Meta: ${erro.message}` });
    }
  });

  // Envia o template "hello_world" (aprovado por padrão em toda WABA) pra um
  // número de teste — confirma que um número recém-registrado (ver rota
  // acima) está mesmo operacional na Cloud API, sem depender de nenhum
  // tenant/fluxo de produto.
  fastify.post('/api/whatsapp/numeros/:phoneNumberId/teste', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    if (!process.env.META_WHATSAPP_TOKEN) {
      return reply.code(400).send({ error: 'META_WHATSAPP_TOKEN não configurado no servidor.' });
    }
    const { numeroDestino } = request.body || {};
    if (!numeroDestino) {
      return reply.code(400).send({ error: 'Informe o número de destino (E.164, ex.: 5534999999999).' });
    }
    try {
      const resultado = await metaWhatsappService.enviarMensagemTeste(request.params.phoneNumberId, numeroDestino);
      return { ok: true, resultado };
    } catch (erro) {
      return reply.code(502).send({ error: `Falha ao enviar teste: ${erro.message}` });
    }
  });

  // Ver PRODUTOS_SUPORTADOS/comentário no topo do arquivo. Grava no SSM
  // primeiro; só dispara os deploys se TODOS os parâmetros gravaram — nunca
  // redeploya com metade do estado novo, metade do velho.
  fastify.post('/api/whatsapp/numeros/:phoneNumberId/vincular-produto', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { produto } = request.body || {};
    const config = PRODUTOS_SUPORTADOS[produto];
    if (!config) {
      return reply.code(400).send({ error: `Produto "${produto}" não suportado. Válidos: ${Object.keys(PRODUTOS_SUPORTADOS).join(', ')}` });
    }
    const { phoneNumberId } = request.params;

    try {
      for (const nomeParametro of config.parametrosSsm) {
        await awsSsmService.escreverParametro(nomeParametro, phoneNumberId);
      }
    } catch (erro) {
      return reply.code(502).send({ error: `Falha ao gravar no SSM (nenhum deploy disparado): ${erro.message}` });
    }

    const falhasDeploy = [];
    for (const d of config.deploys) {
      try {
        await githubDeployService.dispararDeploy(d.repo, d.ref);
      } catch (erro) {
        falhasDeploy.push(`${d.repo}: ${erro.message}`);
      }
    }

    return {
      ok: falhasDeploy.length === 0,
      aviso: falhasDeploy.length
        ? `Parâmetros gravados no SSM, mas falhou disparar o deploy de: ${falhasDeploy.join('; ')} — precisa rodar "gh workflow run" manualmente pra esse(s) repo(s).`
        : null,
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
