// Sistema > Administradores — CRUD de quem tem acesso à área admin da
// Kyvvo. Antes desta tela, a única forma de dar/revogar acesso era mexer
// direto em kyvvo_admins pelo banco (não existia nem um script local, ver
// scripts/criar-admin.js do kyvvo-platform — projeto diferente). Sem papéis/
// permissões granulares ainda (todo admin ativo continua com acesso total
// a tudo) — isso é RBAC de verdade, escopo maior, fica pra depois; esta
// tela resolve o problema mais urgente: dar de baixa o acesso de alguém.
const bcrypt = require('bcryptjs');
const { EMAIL_REGEX, SENHA_REGEX } = require('../lib/validadores');

function registerAdminAdministradoresRoutes(fastify, pool) {
  fastify.get('/api/administradores', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const { rows } = await pool.query(
      'SELECT id, nome, email, ativo, criado_em FROM kyvvo_admins ORDER BY criado_em DESC'
    );
    return { administradores: rows };
  });

  fastify.post('/api/administradores', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { nome: nomeBruto, email: emailBruto, senha } = request.body || {};
    const nome = (nomeBruto || '').trim();
    const email = (emailBruto || '').toLowerCase().trim();

    if (nome.length < 2) {
      return reply.code(400).send({ error: 'Informe o nome.' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return reply.code(400).send({ error: 'Digite um e-mail válido.' });
    }
    if (!SENHA_REGEX.test(senha || '')) {
      return reply.code(400).send({ error: 'A senha deve ter no mínimo 8 caracteres, 1 número e 1 letra maiúscula.' });
    }

    const hash = await bcrypt.hash(senha, 10);
    try {
      const { rows } = await pool.query(
        'INSERT INTO kyvvo_admins (nome, email, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, email, ativo, criado_em',
        [nome, email, hash]
      );
      reply.code(201);
      return rows[0];
    } catch (erro) {
      if (erro.code === '23505') {
        return reply.code(409).send({ error: 'Já existe um administrador com este e-mail.' });
      }
      throw erro;
    }
  });

  // Só liga/desliga `ativo` — travas anti-lockout: ninguém desativa a
  // própria conta (evita se trancar fora sem querer), e não pode zerar o
  // último admin ativo (a área ficaria inacessível pra sempre, sem UI nem
  // script pra recriar um — só psql direto).
  fastify.patch('/api/administradores/:id', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { ativo } = request.body || {};
    if (typeof ativo !== 'boolean') {
      return reply.code(400).send({ error: 'Informe ativo (true/false).' });
    }

    if (!ativo) {
      if (id === request.admin.adminId) {
        return reply.code(400).send({ error: 'Você não pode desativar a própria conta.' });
      }
      const { rows: ativosRows } = await pool.query(
        'SELECT COUNT(*)::int AS total FROM kyvvo_admins WHERE ativo AND id != $1',
        [id]
      );
      if (ativosRows[0].total === 0) {
        return reply.code(400).send({ error: 'Precisa sobrar pelo menos um administrador ativo.' });
      }
    }

    const { rows } = await pool.query(
      'UPDATE kyvvo_admins SET ativo = $1 WHERE id = $2 RETURNING id, nome, email, ativo, criado_em',
      [ativo, id]
    );
    if (!rows[0]) {
      return reply.code(404).send({ error: 'Administrador não encontrado.' });
    }
    return rows[0];
  });
}

module.exports = { registerAdminAdministradoresRoutes };
