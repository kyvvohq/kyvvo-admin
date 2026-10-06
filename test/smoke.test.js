const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/none';

const { build } = require('../index');

test('GET /health responde ok', async () => {
  const app = await build();
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, 'ok');
  await app.close();
});

test('rota protegida sem token -> 401', async () => {
  const app = await build();
  const res = await app.inject({ method: 'GET', url: '/api/versao' });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('login sem corpo -> 400', async () => {
  const app = await build();
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test('authenticateAdmin aceita token do namespace admin', async () => {
  const app = await build();
  const token = app.jwt.admin.sign({ adminId: '00000000-0000-0000-0000-000000000000', email: 'x@y.z' });
  const res = await app.inject({
    method: 'GET',
    url: '/api/versao',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test('rotas de gestão registradas e protegidas (401 sem token)', async () => {
  const app = await build();
  for (const url of ['/api/tenants', '/api/assinaturas', '/api/planos', '/api/usuarios', '/api/numeros-prontos', '/api/whatsapp/wabas', '/api/whatsapp/templates', '/api/ia-uso', '/api/configuracoes/studio', '/api/administradores', '/api/mensagens', '/api/eventos-catalogo', '/api/whatsapp/crm-tenants', '/api/whatsapp/crm-numeros', '/api/whatsapp/disparos-catalogo', '/api/email/modelos', '/api/email/configuracoes', '/api/email/envios', '/api/email/supressoes']) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 401, `${url} deveria exigir auth`);
  }
  await app.close();
});

test('admin-interno de disparos-catalogo: exige ADMIN_INTERNAL_TOKEN, não JWT', async () => {
  const app = await build();
  const semToken = await app.inject({ method: 'GET', url: '/admin-interno/whatsapp/disparos-catalogo?produto=crm' });
  assert.equal(semToken.statusCode, 401);

  process.env.ADMIN_INTERNAL_TOKEN = 'segredo-teste';
  const tokenErrado = await app.inject({
    method: 'GET', url: '/admin-interno/whatsapp/disparos-catalogo?produto=crm',
    headers: { 'x-admin-internal-token': 'errado' },
  });
  assert.equal(tokenErrado.statusCode, 401);

  const semProduto = await app.inject({
    method: 'GET', url: '/admin-interno/whatsapp/disparos-catalogo',
    headers: { 'x-admin-internal-token': 'segredo-teste' },
  });
  assert.equal(semProduto.statusCode, 400);
  delete process.env.ADMIN_INTERNAL_TOKEN;
  await app.close();
});
