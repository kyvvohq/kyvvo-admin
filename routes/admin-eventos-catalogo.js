// Área admin — catálogo de eventos obrigatórios do Kyvvo People (Handoff
// v2, Parte 5.2). Escrita exclusiva do admin; o People só LÊ, via a rota
// pública no fim deste arquivo — os dois serviços têm Postgres fisicamente
// separados (People é isolado de propósito), não dá pra ler direto por SQL
// como o resto deste repo faz com Studio/platform. Toda alteração exige
// justificativa e vira uma linha nova em log_eventos_catalogo (nunca
// sobrescreve, sempre soma histórico — mesmo espírito do evidence ledger
// do próprio People, nada aqui é UPDATE por cima do que já existe no log).

const CANAIS_VALIDOS = ['whatsapp', 'email'];
const TEMPLATE_STATUS_VALIDOS = ['pendente', 'aprovado', 'rejeitado'];

function registerAdminEventosCatalogoRoutes(fastify, pool) {
  fastify.get('/api/eventos-catalogo', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const { rows } = await pool.query('SELECT * FROM people_eventos_catalogo ORDER BY codigo');
    return { eventos: rows };
  });

  fastify.get('/api/eventos-catalogo/:codigo/auditoria', { preHandler: [fastify.authenticateAdmin] }, async (request) => {
    const { rows } = await pool.query(
      `SELECT l.*, a.nome AS alterado_por_nome
       FROM log_eventos_catalogo l
       LEFT JOIN kyvvo_admins a ON a.id = l.alterado_por
       WHERE l.codigo = $1
       ORDER BY l.alterado_em DESC
       LIMIT 20`,
      [request.params.codigo]
    );
    return { log: rows };
  });

  // Só atualiza (não cria/exclui) — o MVP trabalha sobre o seed dos dois
  // eventos conhecidos (candidatura_criada, vaga_encerrada); adicionar
  // eventos novos ao catálogo é uma decisão de produto que ainda não foi
  // pedida, não dá pra assumir o formato de uma tela de criação livre.
  fastify.patch('/api/eventos-catalogo/:codigo', { preHandler: [fastify.authenticateAdmin] }, async (request, reply) => {
    const { codigo } = request.params;
    const { canal, template_meta_nome: templateMetaNome, template_status: templateStatus, obrigatorio, ativo, justificativa } = request.body || {};

    const justificativaLimpa = (justificativa || '').trim();
    if (!justificativaLimpa) {
      return reply.code(400).send({ error: 'Justificativa é obrigatória pra qualquer alteração no catálogo (Parte 5.2).' });
    }
    if (canal !== undefined && !CANAIS_VALIDOS.includes(canal)) {
      return reply.code(400).send({ error: `Canal inválido. Use: ${CANAIS_VALIDOS.join(', ')}.` });
    }
    if (templateStatus !== undefined && !TEMPLATE_STATUS_VALIDOS.includes(templateStatus)) {
      return reply.code(400).send({ error: `Status de template inválido. Use: ${TEMPLATE_STATUS_VALIDOS.join(', ')}.` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: antesRows } = await client.query('SELECT * FROM people_eventos_catalogo WHERE codigo = $1 FOR UPDATE', [codigo]);
      const anterior = antesRows[0];
      if (!anterior) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Evento não encontrado no catálogo.' });
      }

      // Validado aqui pra devolver um 400 legível — o CHECK do banco
      // (eventos_catalogo_obrigatorio_exige_aprovado) é a garantia final
      // de qualquer jeito, isso só evita o erro genérico de constraint.
      const templateStatusFinal = templateStatus !== undefined ? templateStatus : anterior.template_status;
      const obrigatorioFinal = obrigatorio !== undefined ? obrigatorio : anterior.obrigatorio;
      if (obrigatorioFinal && templateStatusFinal !== 'aprovado') {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'Não é possível marcar como obrigatório sem um template aprovado na Meta.' });
      }

      const { rows: novoRows } = await client.query(
        `UPDATE people_eventos_catalogo SET
           canal = COALESCE($2, canal),
           template_meta_nome = COALESCE($3, template_meta_nome),
           template_status = COALESCE($4, template_status),
           obrigatorio = COALESCE($5, obrigatorio),
           ativo = COALESCE($6, ativo),
           justificativa = $7,
           versao = versao + 1,
           atualizado_em = now(),
           atualizado_por = $8
         WHERE codigo = $1
         RETURNING *`,
        [codigo, canal, templateMetaNome, templateStatus, obrigatorio, ativo, justificativaLimpa, request.admin.adminId]
      );
      const novo = novoRows[0];

      await client.query(
        `INSERT INTO log_eventos_catalogo (codigo, acao, estado_anterior, estado_novo, justificativa, alterado_por)
         VALUES ($1, 'atualizar', $2, $3, $4, $5)`,
        [codigo, JSON.stringify(anterior), JSON.stringify(novo), justificativaLimpa, request.admin.adminId]
      );

      await client.query('COMMIT');
      return { evento: novo };
    } catch (erro) {
      await client.query('ROLLBACK');
      throw erro;
    } finally {
      client.release();
    }
  });

  // Pública (sem authenticateAdmin) — único jeito do kyvvo-people consumir
  // o catálogo, já que os dois bancos são fisicamente separados. Mesmo
  // padrão de GET /api/configuracoes/whatsapp-horario. Só devolve eventos
  // ativos; campos internos de auditoria (justificativa, atualizado_por)
  // ficam de fora — não é dado que o People precisa pra decidir nada.
  fastify.get('/api/eventos-catalogo/publico', async () => {
    const { rows } = await pool.query(
      `SELECT codigo, etapa_gatilho, canal, template_meta_nome, template_status, obrigatorio, versao
       FROM people_eventos_catalogo WHERE ativo ORDER BY codigo`
    );
    return { eventos: rows };
  });
}

module.exports = { registerAdminEventosCatalogoRoutes };
