// Área admin — detalhe de um usuário (conta individual de login: pode haver
// mais de uma por tenant, ex.: dono + equipe convidada) com o tenant e plano,
// pra suporte/triagem. Não tem mais listagem própria (US16b, 2026-10-12) —
// usuário só é alcançado a partir do tenant dele (GET /api/tenants/:id já
// traz os vinculados; esta rota é só o clique num deles). Edição de módulos
// não duplica nada aqui — reaproveita GET/PATCH /admin/api/tenants/:id[/modulos/:moduloKey]
// já existentes (módulo é uma permissão do TENANT, não do usuário
// individual; todo membro da equipe de um tenant enxerga os mesmos módulos).
const planos = require('../lib/planos');

function registerAdminUsuariosRoutes(fastify, pool) {
  fastify.get('/api/usuarios/:id', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.role, u.ativo, u.email_verified, u.criado_em, u.ultimo_login_em,
              t.id AS tenant_id, t.nome AS tenant_nome, t.plano,
              (SELECT COUNT(*)::int FROM tenant_modulos tm WHERE tm.tenant_id = t.id AND tm.ativo) AS total_modulos_ativos
       FROM usuarios u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [id]
    );
    const usuario = rows[0];
    if (!usuario) return reply.code(404).send({ error: 'Usuário não encontrado' });
    return { ...usuario, plano_nome: planos.nomeDoPlano(usuario.plano) };
  });

  // Troca de e-mail de um usuário individual (suporte/triagem) — não existia
  // nenhuma rota de edição aqui até agora, só o PATCH de tenant (que não
  // cobre `usuarios`, tabela separada). Mesma normalização de
  // .toLowerCase().trim() usada no login/cadastro de cada produto.
  fastify.patch('/api/usuarios/:id', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { email } = request.body || {};
    if (!email || !email.trim()) {
      return reply.code(400).send({ error: 'Informe o e-mail.' });
    }
    try {
      const { rows } = await pool.query(
        'UPDATE usuarios SET email = $2 WHERE id = $1 RETURNING id, nome, email, tenant_id',
        [id, email.trim().toLowerCase()]
      );
      if (!rows[0]) return reply.code(404).send({ error: 'Usuário não encontrado' });
      return rows[0];
    } catch (erro) {
      if (erro.code === '23505') return reply.code(409).send({ error: 'Esse e-mail já está em uso por outra conta.' });
      throw erro;
    }
  });
}

module.exports = { registerAdminUsuariosRoutes };
