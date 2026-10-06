// Catálogo de disparos padrão por produto (Bruno, 2026-10-06): "vamos criar
// um repositório no portal do admin onde cadastramos os disparos, pra cada
// produto". Repositório único (tabela `disparos_catalogo`, migration
// kyvvo-studio#090) — cada produto lê daqui na hora de provisionar o
// WhatsApp de um tenant (onboarding: tenant conecta a própria WABA, o
// produto submete os templates padrão pra Meta aprovar automaticamente, ver
// @kyvvohq/whatsapp#criarTemplate).
//
// Duas famílias de rota aqui:
// - /api/whatsapp/disparos-catalogo[...] — autenticada por admin
//   (fastify.authenticateAdmin), pra tela de gestão (CRUD).
// - /admin-interno/whatsapp/disparos-catalogo — autenticada por
//   ADMIN_INTERNAL_TOKEN (mesmo segredo compartilhado já usado nos outros
//   admin-interno, só que na direção OPOSTA: aqui é o ADMIN que expõe pro
//   PRODUTO chamar, não o contrário), só leitura, usada pelos produtos.
const PRODUTOS_VALIDOS = ['studio', 'crm', 'people'];
const CATEGORIAS_VALIDAS = ['UTILITY', 'MARKETING', 'AUTHENTICATION'];

function registerAdminDisparosCatalogoRoutes(fastify, pool) {
  fastify.get('/api/whatsapp/disparos-catalogo', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { produto } = request.query || {};
    if (produto && !PRODUTOS_VALIDOS.includes(produto)) {
      return reply.code(400).send({ error: `produto inválido — use um de: ${PRODUTOS_VALIDOS.join(', ')}` });
    }
    const { rows } = await pool.query(
      produto
        ? 'SELECT * FROM disparos_catalogo WHERE produto = $1 ORDER BY gatilho, nome'
        : 'SELECT * FROM disparos_catalogo ORDER BY produto, gatilho, nome',
      produto ? [produto] : []
    );
    return { disparos: rows };
  });

  fastify.post('/api/whatsapp/disparos-catalogo', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { produto, gatilho, nome, categoria, corpo } = request.body || {};
    if (!produto || !gatilho || !nome || !categoria || !corpo) {
      return reply.code(400).send({ error: 'produto, gatilho, nome, categoria e corpo são obrigatórios' });
    }
    if (!PRODUTOS_VALIDOS.includes(produto)) {
      return reply.code(400).send({ error: `produto inválido — use um de: ${PRODUTOS_VALIDOS.join(', ')}` });
    }
    if (!CATEGORIAS_VALIDAS.includes(categoria)) {
      return reply.code(400).send({ error: `categoria inválida — use uma de: ${CATEGORIAS_VALIDAS.join(', ')}` });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO disparos_catalogo (produto, gatilho, nome, categoria, corpo)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [produto, gatilho, nome, categoria, corpo]
      );
      return reply.code(201).send(rows[0]);
    } catch (erro) {
      if (erro.code === '23505') {
        return reply.code(409).send({ error: `Já existe um disparo "${nome}" cadastrado pro produto ${produto}.` });
      }
      throw erro;
    }
  });

  fastify.patch('/api/whatsapp/disparos-catalogo/:id', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { gatilho, nome, categoria, corpo, ativo } = request.body || {};
    if (categoria && !CATEGORIAS_VALIDAS.includes(categoria)) {
      return reply.code(400).send({ error: `categoria inválida — use uma de: ${CATEGORIAS_VALIDAS.join(', ')}` });
    }
    const campos = { gatilho, nome, categoria, corpo, ativo };
    const sets = [];
    const params = [request.params.id];
    for (const [chave, valor] of Object.entries(campos)) {
      if (valor === undefined) continue;
      params.push(valor);
      sets.push(`${chave} = $${params.length}`);
    }
    if (!sets.length) return reply.code(400).send({ error: 'Nenhum campo pra atualizar' });
    try {
      const { rows } = await pool.query(
        `UPDATE disparos_catalogo SET ${sets.join(', ')}, atualizado_em = now() WHERE id = $1 RETURNING *`,
        params
      );
      if (!rows[0]) return reply.code(404).send({ error: 'Disparo não encontrado' });
      return rows[0];
    } catch (erro) {
      if (erro.code === '23505') {
        return reply.code(409).send({ error: 'Já existe um disparo com esse nome pro mesmo produto.' });
      }
      throw erro;
    }
  });

  fastify.delete('/api/whatsapp/disparos-catalogo/:id', { preHandler: [fastify.authenticateAdmin] }, async (request) => {
    await pool.query('DELETE FROM disparos_catalogo WHERE id = $1', [request.params.id]);
    return { ok: true };
  });

  // --- Leitura pelos produtos (admin-interno, mesmo segredo compartilhado) ---
  fastify.get('/admin-interno/whatsapp/disparos-catalogo', async (request, reply) => {
    const token = (request.headers['x-admin-internal-token'] || '').trim();
    if (!process.env.ADMIN_INTERNAL_TOKEN || token !== process.env.ADMIN_INTERNAL_TOKEN) {
      return reply.code(401).send({ error: 'Não autorizado' });
    }
    const { produto } = request.query || {};
    if (!produto || !PRODUTOS_VALIDOS.includes(produto)) {
      return reply.code(400).send({ error: `produto é obrigatório — use um de: ${PRODUTOS_VALIDOS.join(', ')}` });
    }
    const { rows } = await pool.query(
      'SELECT gatilho, nome, categoria, corpo FROM disparos_catalogo WHERE produto = $1 AND ativo = true ORDER BY gatilho',
      [produto]
    );
    return { disparos: rows };
  });
}

module.exports = { registerAdminDisparosCatalogoRoutes };
