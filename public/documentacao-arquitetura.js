// Documentação > Arquitetura (pedido do Bruno, 2026-10-20) — imagem
// estática do mapa de arquitetura (produtos, platform, admin). O visualizador
// de zoom/pan é compartilhado com Documentação > Banco, ver
// documentacao-visualizador.js (carregado antes deste script).
// O SVG em si foi gerado uma vez (fora deste repo) a partir do diagrama
// discutido com o Bruno; atualizar a arquitetura = trocar o arquivo em
// /documentacao/arquitetura.svg, não editar este script.

const conteudo = document.getElementById('conteudo');

conteudo.innerHTML = `
  <p class="vazio-inline" style="margin-bottom:12px">
    Mapa de hoje: produtos (Studio/CRM/People), o platform de autenticação/cobrança/e-mail e o admin.
    Arraste pra mover, use os botões ou a roda do mouse pra dar zoom.
  </p>
  <div id="visualizador-arquitetura"></div>
`;

criarVisualizadorDiagrama(document.getElementById('visualizador-arquitetura'), [
  { id: 'arquitetura', label: 'Arquitetura', src: '/documentacao/arquitetura.svg' },
]);
