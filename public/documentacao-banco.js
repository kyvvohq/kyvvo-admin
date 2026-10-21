// Documentação > Banco (pedido do Bruno, 2026-10-20) — modelos MER
// (conceitual, só entidades + relacionamentos) e DER (detalhado, com
// colunas) em abas separadas. Mesmas imagens estáticas pré-renderizadas da
// Arquitetura (ver documentacao-visualizador.js) — a Kyvvo roda hoje em 4
// bancos Postgres fisicamente separados (platform/Studio compartilhado +
// CRM isolado + People isolado), então o DER vira 4 diagramas selecionáveis
// (um por banco), e o MER é 1 diagrama único com os 4 como blocos, deixando
// claro o que é FK de verdade (dentro do mesmo banco) e o que é só
// tenant_id correspondendo entre bancos sem constraint nenhuma.

const conteudo = document.getElementById('conteudo');

const ABAS = [
  { id: 'mer', label: 'MER' },
  { id: 'der', label: 'DER' },
];

let estado = { aba: 'mer' };

function render() {
  conteudo.innerHTML = `
    <div class="ds-abas-lista">
      ${ABAS.map((a) => `<button type="button" class="ds-aba" aria-selected="${estado.aba === a.id ? 'true' : 'false'}" data-aba="${a.id}">${a.label}</button>`).join('')}
    </div>
    <div id="conteudo-aba"></div>
  `;
  conteudo.querySelectorAll('[data-aba]').forEach((el) => {
    el.addEventListener('click', () => { estado.aba = el.dataset.aba; render(); });
  });
  renderAba();
}

function renderAba() {
  const alvo = document.getElementById('conteudo-aba');
  if (estado.aba === 'mer') {
    alvo.innerHTML = `
      <p class="vazio-inline" style="margin-bottom:12px">
        Modelo conceitual: só entidades e relacionamentos, sem colunas. Os 4 blocos são bancos
        Postgres fisicamente separados — linha cheia é FK de verdade (mesmo banco), linha
        pontilhada é correspondência por tenant_id entre bancos (sem constraint, só convenção).
      </p>
      <div id="visualizador-mer"></div>
    `;
    criarVisualizadorDiagrama(document.getElementById('visualizador-mer'), [
      { id: 'mer', label: 'Visão geral', src: '/documentacao/mer.svg' },
    ]);
    return;
  }
  alvo.innerHTML = `
    <p class="vazio-inline" style="margin-bottom:12px">
      Modelo detalhado por banco (tabelas + colunas-chave, PK/FK). Um banco físico por aba —
      arraste pra mover, use os botões ou a roda do mouse pra dar zoom.
    </p>
    <div id="visualizador-der"></div>
  `;
  criarVisualizadorDiagrama(document.getElementById('visualizador-der'), [
    { id: 'platform', label: 'Platform', src: '/documentacao/der-platform.svg' },
    { id: 'studio', label: 'Studio', src: '/documentacao/der-studio.svg' },
    { id: 'crm', label: 'CRM', src: '/documentacao/der-crm.svg' },
    { id: 'people', label: 'People', src: '/documentacao/der-people.svg' },
  ]);
}

render();
