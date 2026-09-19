const path = require('path');
const { Pool } = require('pg');
const { migrar: migrarBase } = require('@kyvvohq/db-migrate');

// Conecta no banco `railway` (o mesmo do Studio/platform) — o admin lê/escreve
// `platform.*` (tenants, usuarios, modulos, planos, ...) e `public.*`
// (kyvvo_admins, numeros_prontos, conversas_ia, log_*, ...). A maior parte
// dessas tabelas continua migrada historicamente pelo kyvvo-studio
// (server/db/) — não movido pra cá, o que já funciona não precisa mudar de
// lugar. Mas tabela NOVA conceitualmente do admin (cross-produto, não
// específica do Studio) nasce em ./db a partir de agora — o admin não devia
// depender do pipeline de deploy do Studio pra migrar schema que é seu.
// Mesmo pacote/tabela de controle (`_migrations`) já usado por
// kyvvo-platform e kyvvo-people.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

function migrar() {
  return migrarBase({ pool, dir: path.join(__dirname, '..', 'db') });
}

module.exports = { pool, migrar };
