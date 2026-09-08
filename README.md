# kyvvo-admin

Back-office cross-produto da Kyvvo — `admin.kyvvo.com.br`. Fastify, porta 3004,
container `kyvvo-admin`, sem build.

**Estado: Fase 0 (esqueleto).** O plano completo (extração do admin do Studio +
desacoplamento do People) está em `wild-petting-puffin.md` no dir de planos do
Claude. Hoje este serviço só tem: `/health`, `POST /admin/api/auth/login`
(`kyvvo_admins`, JWT namespace `admin`), `GET /admin/api/versao`. As telas e as
rotas de gestão (tenants, planos, config, ia-uso, números, whatsapp status)
chegam na Fase 1, movidas verbatim de `kyvvo-studio/server/panel/`.

## Rodar local

```bash
npm install
ADMIN_JWT_SECRET=dev DATABASE_URL=postgres://... npm start   # :3004
npm test
```

## Banco

Sem schema/migration próprio. Conecta no `railway` (mesmo Postgres do
Studio/platform) e lê/escreve `platform.*` + `public.*` (`kyvvo_admins`,
`numeros_prontos`, `conversas_ia`, `log_*`). Fonte da verdade das tabelas:
`kyvvo-studio` + `kyvvo-platform`.

## CI / deploy

- `gate.yml` — `npm ci` + `npm test` + `node -c`; job `caminhos-protegidos`
  exige a label `revisado:infra` pra tocar `.github/`, `.npmrc`, `package.json`,
  `lib/db.js`, `routes/admin-auth.js`.
- `agente.yml` — issue com label `agent:tests` ou `agent:ui` dispara o
  `claude-code-action`.
- `deploy.yml` — **dormente** (`workflow_dispatch` only) até a Fase 1.
