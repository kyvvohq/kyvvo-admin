// Self-service de conexão do WhatsApp — Embedded Signup da Meta (WhatsApp
// Business Platform / Cloud API).
//
// Diferente do asaas-service.js/token-service.js, aqui não existe "modo dev"
// com id fake: o fluxo depende inteiramente de credenciais reais da Meta
// (META_APP_ID/META_APP_SECRET pro Facebook Login, META_WHATSAPP_TOKEN pro
// Usuário do Sistema). Sem elas configuradas, as rotas que usam este serviço
// devolvem erro explicando o que falta, em vez de fingir sucesso.
//
// Ponto chave da arquitetura: o token do Embedded Signup (vindo do `code`
// trocado em trocarCodePorToken) não é persistido — é usado só na hora, pra
// assinar os webhooks da WABA recém-conectada (assinarWebhooks), já que
// nesse momento o Usuário do Sistema ainda não tem acesso a ela. Depois de
// assinado, o envio/recebimento de mensagem passa a usar o
// META_WHATSAPP_TOKEN do Usuário do Sistema, compartilhado entre tenants.

const GRAPH_API_VERSION = 'v22.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

async function chamar(metodo, caminho, { query, body, token } = {}) {
  const url = new URL(`${GRAPH_API_BASE}${caminho}`);
  if (query) for (const [chave, valor] of Object.entries(query)) url.searchParams.set(chave, valor);

  const res = await fetch(url, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mensagem = (dados.error && dados.error.message) || `Meta respondeu ${res.status}`;
    throw new Error(mensagem);
  }
  return dados;
}

// Troca o `code` de autorização (devolvido pelo FB.login do Embedded Signup)
// por um token de curta duração — usado só pra assinar os webhooks da WABA
// recém-conectada (ver assinarWebhooks). O envio/recebimento de mensagem
// continua usando o META_WHATSAPP_TOKEN do Usuário do Sistema, não este
// token; ele não é persistido em lugar nenhum.
async function trocarCodePorToken(code) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('META_APP_ID/META_APP_SECRET não configurados no servidor.');
  }
  return chamar('GET', '/oauth/access_token', {
    query: { client_id: appId, client_secret: appSecret, code },
  });
}

// Assina o app do Kyvvo pra receber webhook de mensagens dessa WABA —
// equivalente ao toggle "Assinar webhooks" do Business Settings da Meta.
// Precisa do token do cliente (vindo de trocarCodePorToken): o
// META_WHATSAPP_TOKEN do Usuário do Sistema ainda não tem acesso a essa WABA
// nesse momento do fluxo.
async function assinarWebhooks(wabaId, tokenCliente) {
  if (!tokenCliente) throw new Error('Token do cliente não fornecido para assinarWebhooks.');
  return chamar('POST', `/${wabaId}/subscribed_apps`, { token: tokenCliente });
}

// Atribui o Usuário do Sistema compartilhado (dono do META_WHATSAPP_TOKEN) à
// WABA recém-conectada — equivalente ao "Atribuir pessoas" manual no
// Business Settings. Sem isso, qualquer chamada feita depois com
// META_WHATSAPP_TOKEN nessa WABA/número (status, registro, envio de
// mensagem) volta com "missing permissions" da Meta, mesmo com o ID certo.
// Usa o token do cliente pra autorizar a atribuição (só ele tem permissão
// sobre a WABA nesse momento); descobre o id do Usuário do Sistema via /me
// com o próprio META_WHATSAPP_TOKEN, em vez de guardar mais uma env var.
async function atribuirUsuarioSistema(wabaId, tokenCliente) {
  const metaToken = process.env.META_WHATSAPP_TOKEN;
  if (!metaToken) throw new Error('META_WHATSAPP_TOKEN não configurado no servidor.');
  const { id: systemUserId } = await chamar('GET', '/me', { token: metaToken });
  return chamar('POST', `/${wabaId}/assigned_users`, {
    query: { user: systemUserId, tasks: JSON.stringify(['MANAGE']) },
    token: tokenCliente,
  });
}

// Registra o número pra uso na Cloud API (PIN de verificação em duas
// etapas). Best-effort: dependendo de como o Embedded Signup foi
// configurado, o número pode já vir registrado — erro aqui é logado mas não
// derruba a conexão (a WABA/telefone já foram salvos no tenant nesse ponto).
//
// `pinExistente` opcional — achado real: um número que já teve 2FA
// configurado antes (ex.: verificado direto no Meta Business Suite, fora do
// nosso fluxo) responde "Two step verification PIN Mismatch" pra qualquer
// PIN novo gerado aqui; só aceita o PIN ORIGINAL que já estava configurado
// pra esse número. Sem esse parâmetro, mantém o comportamento antigo (PIN
// aleatório — só funciona pra número nunca registrado antes).
async function registrarNumero(phoneNumberId, pinExistente) {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) throw new Error('META_WHATSAPP_TOKEN não configurado no servidor.');
  const pin = pinExistente ? String(pinExistente) : String(Math.floor(100000 + Math.random() * 900000));
  return chamar('POST', `/${phoneNumberId}/register`, {
    token,
    body: { messaging_product: 'whatsapp', pin },
  });
}

// Contrário de registrarNumero — tira o número do registro ativo na Cloud
// API (POST .../deregister). Não remove o número da WABA/Business Manager
// (isso é uma ação só feita manualmente no Meta Business Suite); só libera
// o número pra ser (re)registrado — inclusive por uma WABA diferente via
// Embedded Signup — sem brigar com um registro ativo em outro lugar.
async function desregistrarNumero(phoneNumberId) {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) throw new Error('META_WHATSAPP_TOKEN não configurado no servidor.');
  return chamar('POST', `/${phoneNumberId}/deregister`, { token });
}

// CA (US39.2) — envia uma mensagem de teste pra validar que um "número
// pronto" recém-vinculado a um tenant está mesmo operacional na Cloud API.
// Usa o template "hello_world" (aprovado por padrão em toda WABA, sem
// precisar de aprovação prévia) em vez de texto livre, porque texto livre só
// funciona dentro da janela de 24h de uma conversa já iniciada pelo
// destinatário — o número recém-vinculado nunca teve conversa nenhuma ainda.
async function enviarMensagemTeste(phoneNumberId, numeroDestino) {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) throw new Error('META_WHATSAPP_TOKEN não configurado no servidor.');
  return chamar('POST', `/${phoneNumberId}/messages`, {
    token,
    body: {
      messaging_product: 'whatsapp',
      to: numeroDestino,
      type: 'template',
      template: { name: 'hello_world', language: { code: 'en_US' } },
    },
  });
}

// US68 — envia texto livre em resposta a uma mensagem recebida do cliente
// (motor de IA). Texto livre só é permitido dentro da janela de 24h de uma
// conversa iniciada pelo cliente (diferente de enviarMensagemTeste acima,
// que é proativo e por isso precisa de template aprovado) — como isto é
// sempre uma resposta a uma mensagem que acabou de chegar, está sempre
// dentro da janela.
async function enviarTexto(phoneNumberId, numeroDestino, texto) {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) throw new Error('META_WHATSAPP_TOKEN não configurado no servidor.');
  return chamar('POST', `/${phoneNumberId}/messages`, {
    token,
    body: { messaging_product: 'whatsapp', to: numeroDestino, type: 'text', text: { body: texto } },
  });
}

// US pedida pelo Bruno — área admin > WhatsApp > WABAs/Templates: consulta
// direto na Meta, ao vivo, em vez de espelhar status de aprovação no nosso
// banco ("se um número está pendente de aprovação da Meta quero ver na
// Kyvvo e não na Meta").
//
// Primeira versão usava `/{usuário-sistema}/assigned_whatsapp_business_accounts`
// — só devolve WABA que passou por `assigned_users` explícito
// (atribuirUsuarioSistema, só roda no fluxo self-service). No modelo Tech
// Provider (o nosso: WABA fica na conta do CLIENTE, compartilhada com a
// Kyvvo), a WABA aparece do lado da Business Manager da Kyvvo, não do
// usuário — por isso Bruno via só WABA/templates de tenants que passaram
// pelo fluxo certo (Studio), e nada do resto. Corrigido: consulta as duas
// arestas da Business Manager (`owned_` + `client_`), que juntas cobrem o
// que a Kyvvo é dona + o que foi compartilhado como tech provider —
// union por id, sem depender de nada gravado localmente.
async function listarWabas() {
  const token = process.env.META_WHATSAPP_TOKEN;
  const businessId = process.env.META_BUSINESS_ID;
  if (!token) throw new Error('META_WHATSAPP_TOKEN não configurado no servidor.');
  if (!businessId) throw new Error('META_BUSINESS_ID não configurado no servidor.');

  const fields = 'id,name,account_review_status,message_template_namespace,timezone_id';
  const [ownedResp, clientResp] = await Promise.all([
    chamar('GET', `/${businessId}/owned_whatsapp_business_accounts`, { token, query: { fields } }),
    chamar('GET', `/${businessId}/client_whatsapp_business_accounts`, { token, query: { fields } }),
  ]);

  const porId = new Map();
  [...(ownedResp.data || []), ...(clientResp.data || [])].forEach((waba) => porId.set(waba.id, waba));
  return [...porId.values()];
}

// Números de uma WABA — usado pra enriquecer cada WABA da listarWabas() com
// o(s) número(s) de telefone dela (qualidade/verificação, também ao vivo).
async function listarNumerosDaWaba(wabaId) {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) throw new Error('META_WHATSAPP_TOKEN não configurado no servidor.');
  const { data } = await chamar('GET', `/${wabaId}/phone_numbers`, {
    token,
    query: { fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status,status' },
  });
  return data || [];
}

// Templates de mensagem de uma WABA — mesmo raciocínio: a aprovação é
// decidida pela Meta, então o status vem sempre de lá, nunca de uma cópia
// local. limit alto (100) porque hoje o volume de templates por WABA é
// pequeno (poucos por tenant); paginar fica pra quando isso crescer.
async function listarTemplatesDaWaba(wabaId) {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) throw new Error('META_WHATSAPP_TOKEN não configurado no servidor.');
  const { data } = await chamar('GET', `/${wabaId}/message_templates`, {
    token,
    query: { fields: 'name,status,category,language,rejected_reason', limit: '100' },
  });
  return data || [];
}

module.exports = {
  trocarCodePorToken,
  assinarWebhooks,
  atribuirUsuarioSistema,
  registrarNumero,
  desregistrarNumero,
  enviarMensagemTeste,
  enviarTexto,
  listarWabas,
  listarNumerosDaWaba,
  listarTemplatesDaWaba,
};
