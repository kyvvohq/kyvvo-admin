const { Pool } = require('pg');

// Conecta no banco `railway` (o mesmo do Studio/platform) — o admin lê/escreve
// `platform.*` (tenants, usuarios, modulos, planos, ...) e `public.*`
// (kyvvo_admins, numeros_prontos, conversas_ia, log_*). Não tem schema/migration
// próprio: a fonte da verdade das tabelas é o kyvvo-studio + kyvvo-platform.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

module.exports = { pool };
