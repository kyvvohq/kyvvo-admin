require('dotenv').config();

const path = require('path');
const fsPromises = require('fs/promises');
const Fastify = require('fastify');
const jwt = require('@fastify/jwt');
const staticPlugin = require('@fastify/static');

const { pool } = require('./lib/db');
const planos = require('./lib/planos');
const configSistema = require('./lib/configuracoes-sistema');
const { registerAdminAuthRoutes } = require('./routes/admin-auth');
const { registerAdminTenantsRoutes } = require('./routes/admin-tenants');
const { registerAdminConfiguracoesRoutes } = require('./routes/admin-configuracoes');
const { registerAdminMonitoramentoRoutes } = require('./routes/admin-monitoramento');
const { registerAdminNumerosProntosRoutes } = require('./routes/admin-numeros-prontos');
const { registerAdminUsuariosRoutes } = require('./routes/admin-usuarios');
const { registerAdminAdministradoresRoutes } = require('./routes/admin-administradores');

const PORT = process.env.PORT || 3004;

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!ADMIN_JWT_SECRET) throw new Error('ADMIN_JWT_SECRET não configurado');

async function build() {
  const fastify = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  // JWT da área admin — namespace próprio (fastify.jwt.admin.*,
  // request.adminJwtVerify, reply.adminJwtSign), decoratorName próprio
  // (request.admin). Mesma config do painel de origem.
  await fastify.register(jwt, {
    secret: ADMIN_JWT_SECRET,
    namespace: 'admin',
    decoratorName: 'admin',
  });

  // Confere `ativo` no banco a cada request (não só na hora do login) —
  // sem isso, desativar um admin (Sistema > Administradores) só faria
  // efeito quando o token de 7 dias dele expirasse. O JWT não carrega
  // tokenVersion pra invalidar por assinatura (diferente do login de
  // tenant em kyvvo-platform); uma query indexada por request é aceitável
  // aqui — é uma ferramenta interna de baixo tráfego.
  fastify.decorate('authenticateAdmin', async (request, reply) => {
    try {
      await request.adminJwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Não autenticado' });
    }
    const { rows } = await pool.query('SELECT ativo FROM kyvvo_admins WHERE id = $1', [request.admin.adminId]);
    if (!rows[0] || !rows[0].ativo) {
      return reply.code(401).send({ error: 'Acesso desativado.' });
    }
  });

  // Telas do admin — servidas cruas de public/ na RAIZ (kyvvo-admin é
  // standalone; não há painel de tenant pra colidir, então não precisa do
  // namespace /admin/). O JS chama /api/... e navega pra /dashboard.html etc.
  // O nginx proxia admin.kyvvo.com.br -> :3004 sem reescrever nada.
  await fastify.register(staticPlugin, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });

  // Design system servido cru de node_modules (sem bundler).
  await fastify.register(staticPlugin, {
    root: path.join(__dirname, 'node_modules', '@kyvvohq', 'design-system'),
    prefix: '/ds/',
    decorateReply: false,
  });

  // Caches de config/planos (lib/*): init sincrono + carregar() do banco.
  // Se o banco não responder no boot, sobe mesmo assim com os defaults — as
  // rotas que dependem disso degradam, não derrubam o serviço.
  configSistema.init(pool);
  planos.init(pool);
  try {
    await configSistema.carregar();
    await planos.carregar();
  } catch (err) {
    fastify.log.warn({ err: err.message }, 'cache de config/planos não carregou no boot — seguindo com defaults');
  }

  fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // A raiz abre a tela de login (o nginx do host admin não reescreve mais nada).
  fastify.get('/', async (request, reply) => reply.redirect('/login.html'));

  // Versão do backend rodando — version.json gravado pelo workflow de deploy.
  fastify.get('/api/versao', { preHandler: [fastify.authenticateAdmin] }, async () => {
    try {
      const conteudo = await fsPromises.readFile(path.join(__dirname, 'version.json'), 'utf8');
      return JSON.parse(conteudo);
    } catch {
      return { commit: null, deployedAt: null };
    }
  });

  registerAdminAuthRoutes(fastify, pool);
  registerAdminTenantsRoutes(fastify, pool);
  registerAdminConfiguracoesRoutes(fastify, pool);
  registerAdminMonitoramentoRoutes(fastify, pool);
  registerAdminNumerosProntosRoutes(fastify, pool);
  registerAdminUsuariosRoutes(fastify, pool);
  registerAdminAdministradoresRoutes(fastify, pool);

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
