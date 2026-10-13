// Área admin — acesso temporário de um usuário de OUTRO tenant (US16c,
// pedido do Bruno, 2026-10-13): registrar, na tela de detalhe do tenant,
// que alguém de fora precisa validar alguma informação por um tempo
// limitado. É SÓ documentação/auditoria — não cria sessão nem token, não
// mexe em usuarios.tenant_id (ver migration 093_tenant_acessos_temporarios.sql
// no kyvvo-studio pro porquê). O acesso real, se acontecer, é por outro
// canal; esta tela só registra quem/quando/até quando/por quê/concedido
// por quem.
const DIAS_VALIDOS = new Set([1, 3, 7, 14, 30]);

// Usado por routes/admin-tenants.js (GET /api/tenants/:id) pra incluir a
// lista no mesmo payload da página de detalhe — mora aqui, não lá, porque é
// esse arquivo que "dona" o conceito de acesso temporário.
async function acessosTemporariosDoTenant(pool, tenantId) {
  const { rows } = await pool.query(
    `SELECT at.id, at.motivo, at.concedido_em, at.expira_em, at.revogado_em,
            u.id AS usuario_id, u.nome AS usuario_nome, u.email AS usuario_email,
            t.nome AS usuario_tenant_nome,
            admConcedeu.nome AS concedido_por_nome,
            admRevogou.nome AS revogado_por_nome
     FROM tenant_acessos_temporarios at
     JOIN usuarios u ON u.id = at.usuario_id
     JOIN tenants t ON t.id = u.tenant_id
     LEFT JOIN kyvvo_admins admConcedeu ON admConcedeu.id = at.concedido_por
     LEFT JOIN kyvvo_admins admRevogou ON admRevogou.id = at.revogado_por
     WHERE at.tenant_id = $1
     ORDER BY at.concedido_em DESC`,
    [tenantId]
  );
  return rows;
}

function registerAdminAcessosTemporariosRoutes(fastify, pool) {
  // Busca de usuário pra conceder acesso — só pra esta tela (não é uma
  // listagem geral de usuários, que foi removida em #65). Exclui quem já
  // é do próprio tenant (não faz sentido "emprestar acesso" pra quem já é
  // de casa) e exige pelo menos 3 caracteres pra não devolver meio banco.
  fastify.get('/api/usuarios-busca', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const q = typeof request.query.q === 'string' ? request.query.q.trim() : '';
    const excluirTenant = typeof request.query.excluir_tenant === 'string' ? request.query.excluir_tenant : null;
    if (q.length < 3) {
      return reply.code(400).send({ error: 'Digite ao menos 3 caracteres.' });
    }
    const params = [`%${q}%`];
    let excluirClause = '';
    if (excluirTenant) {
      params.push(excluirTenant);
      excluirClause = `AND u.tenant_id != $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, t.nome AS tenant_nome
       FROM usuarios u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE (u.nome ILIKE $1 OR u.email ILIKE $1) ${excluirClause}
       ORDER BY u.nome
       LIMIT 10`,
      params
    );
    return { usuarios: rows };
  });

  // Concede acesso temporário — 409 se já existe um acesso ativo (ainda não
  // revogado, mesmo que já expirado por tempo) pro mesmo par tenant/usuário;
  // revogar o antigo antes de conceder de novo é a forma de "renovar".
  fastify.post('/api/tenants/:id/acessos-temporarios', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { id: tenantId } = request.params;
    const { usuario_id: usuarioId, motivo, dias } = request.body || {};

    if (!motivo || !motivo.trim()) {
      return reply.code(400).send({ error: 'Informe o motivo.' });
    }
    const diasNum = Number(dias);
    if (!DIAS_VALIDOS.has(diasNum)) {
      return reply.code(400).send({ error: `Prazo inválido. Use um destes: ${[...DIAS_VALIDOS].join(', ')} dias.` });
    }

    const { rows: tenantRows } = await pool.query('SELECT id FROM tenants WHERE id = $1 AND excluido_em IS NULL', [tenantId]);
    if (!tenantRows[0]) return reply.code(404).send({ error: 'Tenant não encontrado' });

    const { rows: usuarioRows } = await pool.query('SELECT id, tenant_id FROM usuarios WHERE id = $1', [usuarioId]);
    const usuario = usuarioRows[0];
    if (!usuario) return reply.code(404).send({ error: 'Usuário não encontrado' });
    if (usuario.tenant_id === tenantId) {
      return reply.code(400).send({ error: 'Esse usuário já é do próprio tenant.' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO tenant_acessos_temporarios (tenant_id, usuario_id, motivo, concedido_por, expira_em)
         VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)
         RETURNING id`,
        [tenantId, usuarioId, motivo.trim(), request.admin.adminId, diasNum]
      );
      return { id: rows[0].id };
    } catch (erro) {
      if (erro.code === '23505') {
        return reply.code(409).send({ error: 'Esse usuário já tem um acesso temporário ativo pra este tenant — revogue antes de conceder de novo.' });
      }
      throw erro;
    }
  });

  fastify.delete('/api/tenants/:id/acessos-temporarios/:acessoId', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { id: tenantId, acessoId } = request.params;
    const { rows } = await pool.query(
      `UPDATE tenant_acessos_temporarios SET revogado_em = now(), revogado_por = $3
       WHERE id = $1 AND tenant_id = $2 AND revogado_em IS NULL
       RETURNING id`,
      [acessoId, tenantId, request.admin.adminId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Acesso não encontrado (ou já revogado)' });
    return { ok: true };
  });
}

module.exports = { registerAdminAcessosTemporariosRoutes, acessosTemporariosDoTenant };
