# CLAUDE.md

Guia para o Claude Code neste repositório.

## O que é

`kyvvo-admin` — o back-office cross-produto da Kyvvo (`admin.kyvvo.com.br`).
Serviço Fastify único, porta 3004, container `kyvvo-admin`, sem build e sem
bundler. Layout flat: `index.js`, `lib/`, `routes/`, `public/`, `test/`.

**Estado: Fase 0.** Está sendo extraído do `kyvvo-studio` (o admin hoje mora em
`server/panel/`). Plano: `wild-petting-puffin.md` (topo). Hoje só tem
`/health`, `POST /admin/api/auth/login`, `GET /admin/api/versao`.

## Comandos

```bash
npm start   # node index.js  (precisa ADMIN_JWT_SECRET, DATABASE_URL)
npm test    # node --test test/*.test.js
```

`npm ci` precisa de `NPM_PACKAGES_TOKEN` no ambiente (`.npmrc` aponta `@kyvvohq`
pro GitHub Packages).

## Arquitetura

- **`index.js`** monta o Fastify: `@fastify/jwt` no namespace `admin`
  (`fastify.jwt.admin.*`, `request.adminJwtVerify`, `request.admin`), decorator
  `authenticateAdmin`, static de `public/` em `/admin/` e do design system em
  `/ds/`. Rotas de API vivem em `routes/admin-*.js`.
- **Auth** (`routes/admin-auth.js`): `POST /admin/api/auth/login` valida contra
  `kyvvo_admins` (schema `public` do `railway`), bcrypt, emite JWT `admin`
  (HS256, `ADMIN_JWT_SECRET`, TTL 7d). Sem lookup em banco por request —
  adequado pra poucos usuários de staff.
- **`lib/db.js`** — `pool` pg. **Sem schema/migration próprio.** O admin
  lê/escreve `platform.*` (tenants, usuarios, modulos, tenant_modulos, planos,
  plano_features, plano_limites, configuracoes_sistema) e `public.*`
  (`kyvvo_admins`, `numeros_prontos`, `conversas_ia`, `log_*`), e lê
  `agendamentos/clientes/profissionais/servicos` pro tenant-detalhe. A fonte da
  verdade dessas tabelas é `kyvvo-studio` + `kyvvo-platform` — nunca criar
  migration aqui.
- **Front** é estático não-bundlado em `public/admin/`. Os assets usam paths
  root-absolutos e o JS chama `/admin/api/...`; o nginx proxia
  `admin.kyvvo.com.br` → `:3004` **sem reescrever** (diferente do estado
  pré-extração, em que reescrevia pra `/admin/`).

## Multi-tenancy

Toda query que lê dado de tenant carrega `WHERE tenant_id = $1`. Sem RLS.

## Secrets

AWS SSM `SecureString` em `/kyvvo/admin/<KEY>`; `gen-env-from-ssm.sh` (na EC2)
materializa `/opt/kyvvo/env/admin.env`, lido pelo compose via `env_file`.

## CI / deploy

- **`gate.yml`** (toda PR): `npm ci` + `npm test` + `node -c`. Job
  `caminhos-protegidos` reprova PR que toca `.github/workflows/`,
  `.github/dependabot.yml`, `CODEOWNERS`, `CLAUDE.md`, `.npmrc`, `package.json`,
  `lib/db.js` ou `routes/admin-auth.js` **sem a label `revisado:infra`**
  (Dependabot isento).
- **`agente.yml`** (`issues: labeled`): `agent:tests` (só `test/`) ou
  `agent:ui` (telas `public/admin/` + `routes/admin-*.js` exceto `admin-auth.js`)
  dispara o `claude-code-action`.
- **`deploy.yml`** — dormente (`workflow_dispatch`) até a Fase 1.

## Fluxo obrigatório (para o agente)

1. `npm test` antes de mudar qualquer coisa.
2. Respeitar a categoria da label — nada fora dela, nunca caminho protegido.
3. Máx. 3 tentativas de conserto de teste quebrado; se não convergir, PR
   rascunho + explicação.
4. PR com `Closes #<n>`.
