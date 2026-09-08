require('dotenv').config();

const path = require('path');
const fsPromises = require('fs/promises');
const Fastify = require('fastify');
const jwt = require('@fastify/jwt');
const staticPlugin = require('@fastify/static');

const { pool } = require('./lib/db');
const { registerAdminAuthRoutes } = require('./routes/admin-auth');

const PORT = process.env.PORT || 3004;

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!ADMIN_JWT_SECRET) throw new Error('ADMIN_JWT_SECRET não configurado');

async function build() {
  const fastify = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  // JWT da área admin — namespace próprio (fastify.jwt.admin.*,
  // request.adminJwtVerify, reply.adminJwtSign), decoratorName próprio
  // (request.admin). Isolado de qualquer JWT de tenant. Mesma config do painel
  // de origem (kyvvo-studio/server/panel/index.js).
  await fastify.register(jwt, {
    secret: ADMIN_JWT_SECRET,
    namespace: 'admin',
    decoratorName: 'admin',
  });

  fastify.decorate('authenticateAdmin', async (request, reply) => {
    try {
      await request.adminJwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Não autenticado' });
    }
  });

  // Telas do admin — servidas cruas de public/ (sem bundler). Os assets usam
  // paths root-absolutos e o JS chama /admin/api/... — o nginx proxia
  // admin.kyvvo.com.br -> :3004 sem reescrever (diferente de hoje).
  // O static de /ds/ (design system de node_modules/@kyvvohq/design-system)
  // entra na Fase 1, junto com as telas de verdade.
  await fastify.register(staticPlugin, {
    root: path.join(__dirname, 'public'),
    prefix: '/admin/',
  });

  fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // Versão do backend rodando — version.json gravado pelo workflow de deploy.
  fastify.get('/admin/api/versao', { preHandler: [fastify.authenticateAdmin] }, async () => {
    try {
      const conteudo = await fsPromises.readFile(path.join(__dirname, 'version.json'), 'utf8');
      return JSON.parse(conteudo);
    } catch {
      return { commit: null, deployedAt: null };
    }
  });

  registerAdminAuthRoutes(fastify, pool);

  return fastify;
}

if (require.main === module) {
  build()
    .then((app) => app.listen({ port: PORT, host: '0.0.0.0' }))
    .then(() => console.log(`kyvvo-admin ouvindo na porta ${PORT}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { build };
