// Login da área admin da Kyvvo — lift verbatim de
// kyvvo-studio/server/panel/routes/admin-auth.js (fase 0 do plano kyvvo-admin).
// POST /admin/api/auth/login — tabela `kyvvo_admins` (public schema do railway),
// bcrypt, JWT no namespace `admin` (secret ADMIN_JWT_SECRET, TTL 7d).
const bcrypt = require('bcryptjs');

function registerAdminAuthRoutes(fastify, pool) {
  fastify.post('/api/auth/login', async (request, reply) => {
    const { email, senha } = request.body || {};
    if (!email || !senha) {
      return reply.code(400).send({ error: 'E-mail e senha são obrigatórios' });
    }

    const { rows } = await pool.query(
      'SELECT id, email, senha_hash, nome, ativo FROM kyvvo_admins WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    const admin = rows[0];
    if (!admin) {
      return reply.code(401).send({ error: 'E-mail ou senha inválidos' });
    }

    const senhaValida = await bcrypt.compare(senha, admin.senha_hash);
    if (!senhaValida) {
      return reply.code(401).send({ error: 'E-mail ou senha inválidos' });
    }
    if (!admin.ativo) {
      return reply.code(403).send({ error: 'Acesso desativado. Fale com outro administrador.' });
    }

    const token = fastify.jwt.admin.sign({ adminId: admin.id, email: admin.email }, { expiresIn: '7d' });
    return { token, nome: admin.nome, email: admin.email };
  });
}

module.exports = { registerAdminAuthRoutes };
