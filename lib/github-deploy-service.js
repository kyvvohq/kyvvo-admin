// Dispara o workflow "Deploy to EC2" de outro repo Kyvvo via API do GitHub
// (workflow_dispatch) — mesma ação que rodar `gh workflow run "Deploy to
// EC2" --ref <branch>` na mão. Único uso hoje: recriar platform/people
// depois de escrever um parâmetro novo no SSM (ver
// routes/admin-whatsapp-meta.js) — o próprio deploy já roda
// gen-env-from-ssm.sh + docker compose up -d --force-recreate sozinho, não
// precisa de nada além de disparar o workflow.
//
// PRÉ-REQUISITO (pendente, 2026-09-24): GITHUB_DEPLOY_TOKEN — um PAT com
// escopo `workflow` (nunca o NPM_PACKAGES_TOKEN, esse só lê pacote, não
// dispara workflow) — ainda não configurado no servidor.
async function dispararDeploy(repo, ref) {
  const token = process.env.GITHUB_DEPLOY_TOKEN;
  if (!token) throw new Error('GITHUB_DEPLOY_TOKEN não configurado no servidor.');

  const resposta = await fetch(`https://api.github.com/repos/kyvvohq/${repo}/actions/workflows/deploy.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    throw new Error(`GitHub API respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
  }
}

module.exports = { dispararDeploy };
