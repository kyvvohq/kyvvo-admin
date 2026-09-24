// Escreve parâmetros no AWS SSM Parameter Store — mesma instância/instance
// profile da EC2 onde este serviço roda, nenhuma credencial explícita (o
// SDK usa a IAM role da máquina, igual o backup-db.sh já faz com S3). Único
// uso hoje: vincular um número da Meta a um produto Kyvvo (ver
// routes/admin-whatsapp-meta.js), por isso o allowlist de prefixos — nunca
// escreve um path arbitrário vindo do request, só os que esse fluxo conhece.
//
// PRÉ-REQUISITO (pendente, 2026-09-24): o instance profile
// `kyvvo-ec2-backup-role` só tem permissão de S3 hoje (ver
// kyvvo-infra/README.md) — precisa ganhar `ssm:PutParameter` + `kms:Encrypt`
// restrito a `arn:aws:ssm:*:*:parameter/kyvvo/*` antes disto funcionar de
// verdade. Sem isso, toda chamada cai no catch com AccessDeniedException.
const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');

const REGION = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const PREFIXOS_PERMITIDOS = ['/kyvvo/platform/', '/kyvvo/people/'];

let client = null;
function getClient() {
  if (!client) client = new SSMClient({ region: REGION });
  return client;
}

async function escreverParametro(nome, valor) {
  if (!PREFIXOS_PERMITIDOS.some((prefixo) => nome.startsWith(prefixo))) {
    throw new Error(`path de SSM fora do permitido: ${nome}`);
  }
  await getClient().send(new PutParameterCommand({
    Name: nome,
    Value: String(valor),
    Type: 'SecureString',
    Overwrite: true,
  }));
}

module.exports = { escreverParametro, PREFIXOS_PERMITIDOS };
