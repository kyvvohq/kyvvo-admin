// Sistema/Produtos > Mensagens — avisos/banners que um admin da Kyvvo
// publica pros usuários finais dos produtos. Pedido do Bruno: "Podemos ter
// uma mensagem de uma nova funcionalidade para People e não pode aparecer
// para Studio" (produto específico) + "mensagens gerais para kyvvo inteira
// que deve apresentar para todos os produtos" (produto null).
//
// GET/POST/PATCH/DELETE são de gestão (autenticado, qualquer admin — sem
// RBAC granular ainda, mesma situação do resto do admin). GET
// /api/mensagens/ativas é pública — cada produto (kyvvo-studio/kyvvo-people)
// chama isso pra montar o banner do próprio painel, mesmo padrão já usado
// por GET /api/configuracoes/whatsapp-horario.

const PRODUTOS_VALIDOS = ['studio', 'people'];
const SEVERIDADES_VALIDAS = ['info', 'aviso', 'erro'];

function registerAdminMensagensRoutes(fastify, pool) {
  fastify.get('/api/mensagens', { preHandler: [fastify.authenticateAdmin] }, async (request) => {
    const { produto } = request.query || {};
    const params = [];
    let where = '';
    if (produto) {
      if (!PRODUTOS_VALIDOS.includes(produto)) {
        return { error: `Produto inválido. Use: ${PRODUTOS_VALIDOS.join(', ')}.` };
      }
      params.push(produto);
      where = 'WHERE produto = $1';
    }
    const { rows } = await pool.query(
      `SELECT m.*, a.nome AS criado_por_nome
       FROM mensagens_admin m
       LEFT JOIN kyvvo_admins a ON a.id = m.criado_por
       ${where}
       ORDER BY m.criado_em DESC`,
      params
    );
    return { mensagens: rows };
  });

  fastify.post('/api/mensagens', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { produto, texto, severidade, expira_em: expiraEm } = request.body || {};
    const textoLimpo = (texto || '').trim();

    if (!textoLimpo) {
      return reply.code(400).send({ error: 'Informe o texto da mensagem.' });
    }
    // produto null = "todos os produtos" (Kyvvo inteira) — só valida quando
    // vem preenchido; ausente/null é um valor válido de propósito.
    if (produto != null && !PRODUTOS_VALIDOS.includes(produto)) {
      return reply.code(400).send({ error: `Produto inválido. Use: ${PRODUTOS_VALIDOS.join(', ')}, ou deixe em branco pra Kyvvo inteira.` });
    }
    const severidadeFinal = severidade || 'info';
    if (!SEVERIDADES_VALIDAS.includes(severidadeFinal)) {
      return reply.code(400).send({ error: `Severidade inválida. Use: ${SEVERIDADES_VALIDAS.join(', ')}.` });
    }

    const { rows } = await pool.query(
      `INSERT INTO mensagens_admin (produto, texto, severidade, expira_em, criado_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [produto || null, textoLimpo, severidadeFinal, expiraEm || null, request.admin.adminId]
    );
    reply.code(201);
    return rows[0];
  });

  fastify.patch('/api/mensagens/:id', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { texto, severidade, ativo, expira_em: expiraEm } = request.body || {};

    if (texto !== undefined && !String(texto).trim()) {
      return reply.code(400).send({ error: 'Texto não pode ficar em branco.' });
    }
    if (severidade !== undefined && !SEVERIDADES_VALIDAS.includes(severidade)) {
      return reply.code(400).send({ error: `Severidade inválida. Use: ${SEVERIDADES_VALIDAS.join(', ')}.` });
    }

    const { rows } = await pool.query(
      `UPDATE mensagens_admin SET
         texto = COALESCE($2, texto),
         severidade = COALESCE($3, severidade),
         ativo = COALESCE($4, ativo),
         expira_em = COALESCE($5, expira_em),
         atualizado_em = now()
       WHERE id = $1
       RETURNING *`,
      [id, texto ? texto.trim() : null, severidade, ativo, expiraEm]
    );
    if (!rows[0]) {
      return reply.code(404).send({ error: 'Mensagem não encontrada.' });
    }
    return rows[0];
  });

  fastify.delete('/api/mensagens/:id', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { rows } = await pool.query('DELETE FROM mensagens_admin WHERE id = $1 RETURNING id', [request.params.id]);
    if (!rows[0]) {
      return reply.code(404).send({ error: 'Mensagem não encontrada.' });
    }
    return { ok: true };
  });

  // Pública — cada produto chama isso pra montar o banner do próprio
  // painel. Ativas, não expiradas, do produto pedido OU gerais (produto
  // null = Kyvvo inteira). `produto` obrigatório (mesmo raciocínio de
  // whatsapp-horario: sem ele não dá pra saber que WHERE aplicar).
  fastify.get('/api/mensagens/ativas', async (request, reply) => {
    const { produto } = request.query || {};
    if (!PRODUTOS_VALIDOS.includes(produto)) {
      return reply.code(400).send({ error: 'Informe ?produto=studio|people.' });
    }
    const { rows } = await pool.query(
      `SELECT id, texto, severidade, criado_em
       FROM mensagens_admin
       WHERE ativo AND (produto = $1 OR produto IS NULL) AND (expira_em IS NULL OR expira_em > now())
       ORDER BY criado_em DESC`,
      [produto]
    );
    return { mensagens: rows };
  });
}

module.exports = { registerAdminMensagensRoutes };
