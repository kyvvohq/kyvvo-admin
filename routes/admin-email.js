// E-mail (pedido do Bruno, 2026-10-02): modelos de e-mail editáveis sem
// desenvolvimento, rodapé padrão, histórico de envios e lista de bloqueio.
//
// As tabelas são do kyvvo-platform (schema `platform`, db/010 e db/011 de lá
// — fonte da verdade, nunca migrar aqui). O platform lê os modelos com cache
// de 60s: o que for salvo aqui vale no próximo e-mail em até 1 minuto.
//
// Prévia e "enviar teste" passam pelo próprio platform
// (POST /internal/email/{preview,send}, token PLATFORM_EMAIL_TOKEN do admin)
// — o HTML mostrado é exatamente o que o renderizador de produção gera.
//
// Modelos não são criados/excluídos por aqui: cada um corresponde a um
// e-mail que algum produto já envia (chave usada no código). O que se
// edita é o texto, ligar/desligar e restaurar o padrão.

const PLATFORM_URL = process.env.PLATFORM_URL || 'http://platform:3003';
const CAMPOS_EDITAVEIS = ['assunto', 'titulo', 'corpo', 'cta_texto', 'motivo'];
const LIMITES = { assunto: 200, titulo: 200, corpo: 5000, cta_texto: 60, motivo: 500 };
const CONFIG_CHAVES = [
  'rodape_nao_responda', 'rodape_notificacao', 'rodape_desativar',
  'caminho_notificacoes_studio', 'caminho_notificacoes_studio_url',
  'caminho_notificacoes_crm', 'caminho_notificacoes_crm_url',
];
const STATUS_ENVIO = ['enviado', 'entregue', 'bounce', 'reclamacao', 'rejeitado', 'falhou', 'suprimido', 'log'];
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// Valida/normaliza o patch de um modelo. Devolve { erro } ou { campos }.
function validarPatchModelo(body) {
  const campos = {};
  for (const c of CAMPOS_EDITAVEIS) {
    if (body[c] === undefined) continue;
    const v = body[c] == null ? '' : String(body[c]);
    if (v.length > LIMITES[c]) return { erro: `${c} passa de ${LIMITES[c]} caracteres.` };
    if ((c === 'assunto' || c === 'titulo') && !v.trim()) return { erro: `${c === 'assunto' ? 'Assunto' : 'Título'} não pode ficar vazio.` };
    campos[c] = (c === 'cta_texto' || c === 'motivo') ? (v.trim() || null) : v;
  }
  if (body.ativo !== undefined) campos.ativo = !!body.ativo;
  if (!Object.keys(campos).length) return { erro: 'Nada para salvar.' };
  return { campos };
}

function validarConfig(body) {
  const valores = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (!CONFIG_CHAVES.includes(k)) return { erro: `Configuração desconhecida: ${k}` };
    const s = String(v == null ? '' : v).trim();
    if (s.length > 500) return { erro: `${k} passa de 500 caracteres.` };
    if (k.endsWith('_url') && s && !/^https:\/\//.test(s)) return { erro: 'Os links precisam começar com https://' };
    if (k === 'rodape_desativar' && s && !s.includes('{{caminho}}')) return { erro: 'O texto de desativação precisa conter {{caminho}}.' };
    valores[k] = s;
  }
  return { valores };
}

// Variáveis de exemplo de um modelo ({ nome: exemplo }).
function exemplosDe(modelo) {
  const out = {};
  for (const v of modelo.variaveis || []) if (v && v.nome) out[v.nome] = v.exemplo || '';
  return out;
}

// Conteúdo dinâmico de exemplo (o que o produto mandaria de verdade), pra
// prévia/teste mostrarem botão, tabela e código.
function layoutExemplo(modelo) {
  const base = { tipo: modelo.tipo, titulo: modelo.titulo };
  if (modelo.cta_texto) base.cta = { texto: modelo.cta_texto, url: 'https://kyvvo.com.br' };
  if (modelo.chave === 'token_verificacao') base.destaque = '482915';
  if (modelo.tipo === 'notificacao') {
    base.detalhes = [{ rotulo: 'Exemplo', valor: 'Os detalhes do evento aparecem aqui' }];
  }
  if (modelo.chave === 'automacao') base.remetenteNome = 'Empresa de exemplo';
  return base;
}

async function chamarPlatform(caminho, corpo) {
  const token = process.env.PLATFORM_EMAIL_TOKEN;
  if (!token) return { status: 503, json: { error: 'PLATFORM_EMAIL_TOKEN não configurado no admin.' } };
  try {
    const res = await fetch(`${PLATFORM_URL}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': token },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } catch (err) {
    return { status: 502, json: { error: `Platform indisponível: ${err.message}` } };
  }
}

function registerAdminEmailRoutes(fastify, pool) {
  const auth = { preHandler: [fastify.authenticateAdmin] };

  // --- Modelos ---------------------------------------------------------------
  fastify.get('/api/email/modelos', auth, async () => {
    const { rows } = await pool.query(
      `SELECT id, produto, chave, nome, descricao, tipo, assunto, titulo, corpo, cta_texto, motivo,
              variaveis, ativo, padrao, atualizado_em, atualizado_por
         FROM platform.email_modelos
        ORDER BY CASE produto WHEN 'platform' THEN 0 WHEN 'studio' THEN 1 WHEN 'people' THEN 2 ELSE 3 END, nome`,
    );
    return { modelos: rows };
  });

  fastify.patch('/api/email/modelos/:id', auth, async (request, reply) => {
    const { erro, campos } = validarPatchModelo(request.body || {});
    if (erro) return reply.code(400).send({ error: erro });
    const chaves = Object.keys(campos);
    const sets = chaves.map((c, i) => `${c} = $${i + 2}`);
    const { rows } = await pool.query(
      `UPDATE platform.email_modelos
          SET ${sets.join(', ')}, atualizado_em = now(), atualizado_por = $${chaves.length + 2}
        WHERE id = $1 RETURNING *`,
      [request.params.id, ...chaves.map((c) => campos[c]), request.admin.email || null],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Modelo não encontrado.' });
    return { modelo: rows[0] };
  });

  fastify.post('/api/email/modelos/:id/restaurar', auth, async (request, reply) => {
    const { rows } = await pool.query(
      `UPDATE platform.email_modelos
          SET assunto = padrao->>'assunto', titulo = padrao->>'titulo', corpo = padrao->>'corpo',
              cta_texto = padrao->>'cta_texto', motivo = padrao->>'motivo',
              atualizado_em = now(), atualizado_por = $2
        WHERE id = $1 RETURNING *`,
      [request.params.id, request.admin.email || null],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Modelo não encontrado.' });
    return { modelo: rows[0] };
  });

  // Prévia de um rascunho (campos do formulário, ainda não salvos).
  fastify.post('/api/email/preview', auth, async (request, reply) => {
    const b = request.body || {};
    if (!b.modelo) return reply.code(400).send({ error: 'modelo obrigatório' });
    const r = await chamarPlatform('/internal/email/preview', {
      produto: b.modelo.produto,
      modelo: b.modelo,
      variaveis: { ...exemplosDe(b.modelo), ...(b.variaveis || {}) },
      layout: layoutExemplo(b.modelo),
      config: b.config,
    });
    return reply.code(r.status).send(r.json);
  });

  // Envia o modelo SALVO, com as variáveis de exemplo, pro e-mail informado.
  fastify.post('/api/email/modelos/:id/teste', auth, async (request, reply) => {
    const para = String((request.body || {}).para || request.admin.email || '').trim();
    if (!EMAIL_RE.test(para)) return reply.code(400).send({ error: 'Informe um e-mail válido.' });
    const { rows } = await pool.query('SELECT * FROM platform.email_modelos WHERE id = $1', [request.params.id]);
    const m = rows[0];
    if (!m) return reply.code(404).send({ error: 'Modelo não encontrado.' });
    const r = await chamarPlatform('/internal/email/send', {
      to: para,
      subject: `[Teste] ${m.nome}`,
      produto: m.produto,
      modelo: m.chave,
      variaveis: exemplosDe(m),
      layout: layoutExemplo(m),
      tag: `teste_${m.chave}`,
    });
    return reply.code(r.status).send(r.json);
  });

  // --- Rodapé (configurações) -----------------------------------------------
  fastify.get('/api/email/configuracoes', auth, async () => {
    const { rows } = await pool.query('SELECT chave, valor, atualizado_em, atualizado_por FROM platform.email_configuracoes');
    const config = {};
    for (const r of rows) config[r.chave] = r.valor;
    return { config, chaves: CONFIG_CHAVES };
  });

  fastify.put('/api/email/configuracoes', auth, async (request, reply) => {
    const { erro, valores } = validarConfig(request.body || {});
    if (erro) return reply.code(400).send({ error: erro });
    for (const [chave, valor] of Object.entries(valores)) {
      await pool.query(
        `INSERT INTO platform.email_configuracoes (chave, valor, atualizado_em, atualizado_por)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
        [chave, valor, request.admin.email || null],
      );
    }
    return { ok: true };
  });

  // --- Envios (histórico) ---------------------------------------------------
  // `tenant_id` (aba E-mail do detalhe do tenant, pedido do Bruno,
  // 2026-10-20) — platform.email_envios não tem tenant_id (é só um log de
  // destinatário/assunto, ver db/010_email.sql do platform), então filtra
  // por quem é dono do e-mail: os usuários daquele tenant. Com tenant_id
  // informado, também devolve `porStatusMes`/`totalMes` (mês corrente) junto
  // de `porStatus`/`total` (todo o histórico) — os cards "geral" x "mês
  // atual" do topo da aba.
  fastify.get('/api/email/envios', auth, async (request, reply) => {
    const { produto, status, q, tenant_id: tenantId } = request.query || {};
    const where = [];
    const params = [];
    if (produto) { params.push(produto); where.push(`produto = $${params.length}`); }
    if (status) {
      if (!STATUS_ENVIO.includes(status)) return reply.code(400).send({ error: 'Status inválido.' });
      params.push(status); where.push(`status = $${params.length}`);
    }
    if (q && String(q).trim()) { params.push(`%${String(q).trim().toLowerCase()}%`); where.push(`(lower(destinatario) LIKE $${params.length} OR lower(assunto) LIKE $${params.length})`); }
    if (tenantId) {
      params.push(tenantId);
      where.push(`lower(destinatario) IN (SELECT lower(email) FROM usuarios WHERE tenant_id = $${params.length})`);
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [lista, totais, totaisMes] = await Promise.all([
      pool.query(
        `SELECT id, produto, tag, destinatario, assunto, provedor, status, erro, criado_em, atualizado_em
           FROM platform.email_envios ${filtro} ORDER BY criado_em DESC LIMIT 200`, params),
      pool.query(`SELECT status, count(*)::int AS n FROM platform.email_envios ${filtro} GROUP BY status`, params),
      // `filtro` nunca vem vazio aqui: a própria condição de tenant_id acima
      // já garante um WHERE.
      tenantId
        ? pool.query(
            `SELECT status, count(*)::int AS n FROM platform.email_envios
               ${filtro} AND criado_em >= date_trunc('month', now())
             GROUP BY status`,
            params,
          )
        : Promise.resolve({ rows: [] }),
    ]);
    const porStatus = {};
    let total = 0;
    for (const r of totais.rows) { porStatus[r.status] = r.n; total += r.n; }
    const porStatusMes = {};
    let totalMes = 0;
    for (const r of totaisMes.rows) { porStatusMes[r.status] = r.n; totalMes += r.n; }
    return tenantId
      ? { envios: lista.rows, total, porStatus, totalMes, porStatusMes }
      : { envios: lista.rows, total, porStatus };
  });

  // --- Lista de bloqueio ----------------------------------------------------
  fastify.get('/api/email/supressoes', auth, async () => {
    const { rows } = await pool.query('SELECT email, motivo, detalhe, criado_em FROM platform.email_supressoes ORDER BY criado_em DESC LIMIT 500');
    return { supressoes: rows };
  });

  fastify.post('/api/email/supressoes', auth, async (request, reply) => {
    const email = String((request.body || {}).email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return reply.code(400).send({ error: 'Informe um e-mail válido.' });
    const detalhe = String((request.body || {}).detalhe || '').trim().slice(0, 500) || `Adicionado por ${request.admin.email || 'admin'}`;
    await pool.query(
      `INSERT INTO platform.email_supressoes (email, motivo, detalhe) VALUES ($1, 'manual', $2)
       ON CONFLICT (email) DO NOTHING`,
      [email, detalhe],
    );
    return { ok: true };
  });

  fastify.delete('/api/email/supressoes/:email', auth, async (request, reply) => {
    const { rowCount } = await pool.query('DELETE FROM platform.email_supressoes WHERE email = $1', [String(request.params.email).toLowerCase()]);
    if (!rowCount) return reply.code(404).send({ error: 'E-mail não está na lista.' });
    return { ok: true };
  });
}

module.exports = { registerAdminEmailRoutes, validarPatchModelo, validarConfig, exemplosDe, layoutExemplo };
