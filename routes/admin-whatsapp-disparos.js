// Área admin > WhatsApp > Disparos (pedido do Bruno, 2026-09-19): total de
// disparos, quantidade realizada e histórico (número, template/modelo, data
// e hora, status), cross-produto Studio+People.
//
// Studio grava `whatsapp_disparos` no mesmo Postgres que este admin usa (ver
// admin-whatsapp-meta.js — mesmo padrão de JOIN direto com `tenants`), então
// é consultado por SQL puro. People tem banco isolado (kyvvo_people, role
// própria, decisão antiga de segurança), então é buscado por uma chamada
// interna protegida por segredo compartilhado (ADMIN_INTERNAL_TOKEN) — nunca
// exposta publicamente, só alcançável dentro da rede Docker/EC2.
const PEOPLE_INTERNAL_URL = process.env.PEOPLE_INTERNAL_URL || 'http://people:3002';
const ADMIN_INTERNAL_TOKEN = process.env.ADMIN_INTERNAL_TOKEN;

async function buscarDisparosPeople(fastify, tenantId) {
  if (!ADMIN_INTERNAL_TOKEN) {
    fastify.log.warn('[whatsapp-disparos] ADMIN_INTERNAL_TOKEN não configurado — disparos do People ficam de fora');
    return { disparos: [], planoChave: null };
  }
  try {
    const query = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
    const res = await fetch(`${PEOPLE_INTERNAL_URL}/people/admin-interno/whatsapp-disparos${query}`, {
      headers: { 'x-admin-internal-token': ADMIN_INTERNAL_TOKEN },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      fastify.log.error(`[whatsapp-disparos] People respondeu ${res.status}`);
      return { disparos: [], planoChave: null };
    }
    const dados = await res.json();
    return {
      disparos: (dados.disparos || []).map((d) => ({ ...d, produto: 'people' })),
      planoChave: dados.plano_chave || null,
    };
  } catch (erro) {
    fastify.log.error(`[whatsapp-disparos] Falha ao consultar o People: ${erro.message}`);
    return { disparos: [], planoChave: null };
  }
}

function registerAdminWhatsappDisparosRoutes(fastify, pool) {
  fastify.get('/api/whatsapp/disparos', { preHandler: [fastify.authenticateAdmin] }, async (request) => {
    const { produto, status, tenant_id: tenantId } = request.query || {};

    const [studioResult, peopleResultado] = await Promise.all([
      pool.query(
        `select d.id, d.tenant_id, t.nome as tenant_nome, t.plano, d.telefone_e164, d.template_nome, d.gatilho, d.status, d.criado_em
         from whatsapp_disparos d
         left join tenants t on t.id = d.tenant_id
         ${tenantId ? 'where d.tenant_id = $1' : ''}
         order by d.criado_em desc
         limit 1000`,
        tenantId ? [tenantId] : []
      ),
      buscarDisparosPeople(fastify, tenantId),
    ]);
    const studioRows = studioResult.rows.map((row) => ({ ...row, produto: 'studio' }));
    const peopleRows = peopleResultado.disparos;

    // tenant_nome do People precisa ser resolvido aqui — o banco isolado dele
    // não tem tabela `tenants` local (referência solta), mas o tenant_id é o
    // mesmo emitido pelo kyvvo-platform, cuja tabela `tenants` é esta que o
    // admin já consulta.
    const tenantIds = [...new Set(peopleRows.map((d) => d.tenant_id).filter(Boolean))];
    let nomesPorTenant = new Map();
    if (tenantIds.length) {
      const { rows } = await pool.query('select id, nome from tenants where id = any($1::uuid[])', [tenantIds]);
      nomesPorTenant = new Map(rows.map((r) => [r.id, r.nome]));
    }
    const peopleComNome = peopleRows.map((d) => ({ ...d, tenant_nome: nomesPorTenant.get(d.tenant_id) || null }));

    let todos = [...studioRows, ...peopleComNome].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
    if (produto) todos = todos.filter((d) => d.produto === produto);
    if (status) todos = todos.filter((d) => d.status === status);

    const total = todos.length;
    const realizados = todos.filter((d) => d.status === 'enviado').length;

    // Uso do mês vs. limite do plano (US: pedido do Bruno pra ver e travar
    // por cliente) — só calculado quando um cliente específico foi filtrado.
    // Studio: `tenants.plano` (mesmo banco). People: `plano_chave` que a
    // rota interna já devolveu, resolvido acima. `planos` é a mesma tabela
    // pros dois produtos, sempre consultável direto por este admin.
    let limitePlano = null;
    if (tenantId) {
      const planoChave = studioResult.rows[0]?.plano || peopleResultado.planoChave || null;
      if (planoChave) {
        const { rows: planoRows } = await pool.query(
          'select chave, nome, limite_disparos from planos where chave = $1',
          [planoChave]
        );
        if (planoRows[0]) {
          const inicioDoMes = new Date(); inicioDoMes.setDate(1); inicioDoMes.setHours(0, 0, 0, 0);
          const usadoMesAtual = todos.filter((d) => d.status === 'enviado' && new Date(d.criado_em) >= inicioDoMes).length;
          limitePlano = {
            planoNome: planoRows[0].nome,
            limite: planoRows[0].limite_disparos,
            usadoMesAtual,
          };
        }
      }
    }

    return { total, realizados, disparos: todos.slice(0, 300), limitePlano };
  });
}

module.exports = { registerAdminWhatsappDisparosRoutes };
