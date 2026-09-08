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
  const res = await app.inject({ method: 'GET', url: '/admin/api/versao' });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('login sem corpo -> 400', async () => {
  const app = await build();
  const res = await app.inject({ method: 'POST', url: '/admin/api/auth/login', payload: {} });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test('authenticateAdmin aceita token assinado no namespace admin', async () => {
  const app = await build();
  const token = app.jwt.admin.sign({ adminId: '00000000-0000-0000-0000-000000000000', email: 'x@y.z' });
  const res = await app.inject({
    method: 'GET',
    url: '/admin/api/versao',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});
