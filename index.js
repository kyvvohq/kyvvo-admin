require('dotenv').config();

const path = require('path');
const fsPromises = require('fs/promises');
const Fastify = require('fastify');
const jwt = require('@fastify/jwt');
const staticPlugin = require('@fastify/static');

const { pool, migrar } = require('./lib/db');
const planos = require('./lib/planos');
const configSistema = require('./lib/configuracoes-sistema');
const { registerAdminAuthRoutes } = require('./routes/admin-auth');
const { registerAdminTenantsRoutes } = require('./routes/admin-tenants');
const { registerAdminConfiguracoesRoutes } = require('./routes/admin-configuracoes');
const { registerAdminMonitoramentoRoutes } = require('./routes/admin-monitoramento');
const { registerAdminWhatsappMetaRoutes } = require('./routes/admin-whatsapp-meta');
const { registerAdminNumerosProntosRoutes } = require('./routes/admin-numeros-prontos');
const { registerAdminUsuariosRoutes } = require('./routes/admin-usuarios');
const { registerAdminAdministradoresRoutes } = require('./routes/admin-administradores');
const { registerAdminMensagensRoutes } = require('./routes/admin-mensagens');
const { registerAdminEventosCatalogoRoutes } = require('./routes/admin-eventos-catalogo');
const { registerAdminWhatsappDisparosRoutes } = require('./routes/admin-whatsapp-disparos');
const { registerAdminCrmWhatsappNumerosRoutes } = require('./routes/admin-crm-whatsapp-numeros');
const { registerAdminEmailRoutes } = require('./routes/admin-email');
const { registerAdminDisparosCatalogoRoutes } = require('./routes/admin-disparos-catalogo');
const { registerAdminAcessosTemporariosRoutes } = require('./routes/admin-acessos-temporarios');

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
  //
  // Falha ao CONSULTAR (banco fora do ar) não derruba a sessão — mesmo
  // raciocínio de configSistema/planos logo abaixo ("sobe com os defaults
  // se o banco não responder"): toda outra rota já depende do banco pros
  // próprios dados, então um banco fora do ar já deixa o admin inútil de
  // qualquer forma; barrar o login aqui só pioraria (ninguém entra, nem
  // pra ver o que está quebrado). Resposta explícita "ativo: false" é a
  // única que nega acesso de verdade.
  fastify.decorate('authenticateAdmin', async (request, reply) => {
    try {
      await request.adminJwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Não autenticado' });
    }
    try {
      const { rows } = await pool.query('SELECT ativo FROM kyvvo_admins WHERE id = $1', [request.admin.adminId]);
      if (!rows[0] || rows[0].ativo === false) {
        return reply.code(401).send({ error: 'Acesso desativado.' });
      }
    } catch (err) {
      fastify.log.warn({ err: err.message }, 'authenticateAdmin: falha ao checar ativo, seguindo (banco indisponível?)');
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

  // /ds/* NÃO é mais servido por este app: o nginx atende /ds/ direto de
  // /opt/kyvvo/design-system/ (sincronizado a cada push na main do
  // kyvvo-design-system — consumo em tempo real, sem npm/lockfile por produto).

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

  // Página cheia de detalhe do tenant (/tenants/:id) — o botão "Gerenciar
  // tenant" do drawer (public/app.js) navega direto pra cá, e
  // tenant-detalhe.js lê o id do ÚLTIMO SEGMENTO da URL (idDaUrl()), não de
  // querystring — por isso precisa dessa rota servindo o HTML sem redirect
  // nem rewrite, preservando o :id na URL. Sem isso, cada clique em
  // "Gerenciar tenant" caía num 404 puro do Fastify (rota nunca existiu).
  fastify.get('/tenants/:id', async (request, reply) => reply.sendFile('tenant-detalhe.html'));

  // Página cheia de detalhe do usuário (/usuarios/:id), mesmo motivo da rota
  // de tenant acima — chegada a partir do clique num usuário vinculado
  // dentro de tenant-detalhe.js.
  fastify.get('/usuarios/:id', async (request, reply) => reply.sendFile('usuario-detalhe.html'));

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
  registerAdminWhatsappMetaRoutes(fastify, pool);
  registerAdminNumerosProntosRoutes(fastify, pool);
  registerAdminUsuariosRoutes(fastify, pool);
  registerAdminAdministradoresRoutes(fastify, pool);
  registerAdminMensagensRoutes(fastify, pool);
  registerAdminEventosCatalogoRoutes(fastify, pool);
  registerAdminWhatsappDisparosRoutes(fastify, pool);
  registerAdminCrmWhatsappNumerosRoutes(fastify, pool);
  registerAdminDisparosCatalogoRoutes(fastify, pool);
  registerAdminAcessosTemporariosRoutes(fastify, pool);
  registerAdminEmailRoutes(fastify, pool);

  return fastify;
}

if (require.main === module) {
  migrar()
    .then(() => build())
    .then((app) => app.listen({ port: PORT, host: '0.0.0.0' }))
    .then(() => console.log(`kyvvo-admin ouvindo na porta ${PORT}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { build };
