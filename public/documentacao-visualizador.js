// Visualizador de zoom/pan reusado pelas páginas de Documentação
// (Arquitetura e Banco) — imagem estática (SVG pré-renderizado), sem
// nenhuma lib de diagrama em runtime (mesmo padrão "tudo self-hosted" do
// resto do admin: a única coisa carregada de fora é fonte do Google Fonts).
//
// `criarVisualizadorDiagrama(alvo, imagens)` monta a barra de zoom + (se
// houver mais de uma imagem) um seletor em pills pra trocar de diagrama sem
// sair da aba. `imagens`: [{ id, label, src }].
function criarVisualizadorDiagrama(alvo, imagens) {
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 4;
  const ZOOM_PASSO = 0.25;

  let escala = 1;
  let deslocX = 0;
  let deslocY = 0;
  let atual = imagens[0].id;

  function aplicarTransform() {
    const imagem = document.getElementById(`${alvo.id}-imagem`);
    if (imagem) imagem.style.transform = `translate(${deslocX}px, ${deslocY}px) scale(${escala})`;
  }

  function definirZoom(novaEscala) {
    escala = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, novaEscala));
    aplicarTransform();
    document.getElementById(`${alvo.id}-reset`).textContent = `${Math.round(escala * 100)}%`;
  }

  function resetarZoom() {
    escala = 1;
    deslocX = 0;
    deslocY = 0;
    definirZoom(1);
  }

  function trocarImagem(id) {
    atual = id;
    resetarZoom();
    const img = imagens.find((i) => i.id === id);
    document.getElementById(`${alvo.id}-imagem`).src = img.src;
    alvo.querySelectorAll('[data-diagrama-pill]').forEach((pill) => {
      pill.setAttribute('aria-selected', pill.dataset.diagramaPill === id ? 'true' : 'false');
    });
  }

  alvo.innerHTML = `
    ${
      imagens.length > 1
        ? `<div class="ds-abas-lista" style="margin-bottom:12px">
            ${imagens.map((i) => `<button type="button" class="ds-aba" aria-selected="${i.id === atual ? 'true' : 'false'}" data-diagrama-pill="${i.id}">${i.label}</button>`).join('')}
          </div>`
        : ''
    }
    <div class="visualizador-diagrama">
      <div class="visualizador-barra">
        <button type="button" class="btn-secundario btn-tabela" id="${alvo.id}-menos" aria-label="Diminuir zoom">−</button>
        <button type="button" class="btn-secundario btn-tabela" id="${alvo.id}-reset">100%</button>
        <button type="button" class="btn-secundario btn-tabela" id="${alvo.id}-mais" aria-label="Aumentar zoom">+</button>
      </div>
      <div class="visualizador-area" id="${alvo.id}-area">
        <img src="${imagens[0].src}" alt="${imagens[0].label}" id="${alvo.id}-imagem" draggable="false">
      </div>
    </div>
  `;

  const area = document.getElementById(`${alvo.id}-area`);
  document.getElementById(`${alvo.id}-mais`).addEventListener('click', () => definirZoom(escala + ZOOM_PASSO));
  document.getElementById(`${alvo.id}-menos`).addEventListener('click', () => definirZoom(escala - ZOOM_PASSO));
  document.getElementById(`${alvo.id}-reset`).addEventListener('click', resetarZoom);
  alvo.querySelectorAll('[data-diagrama-pill]').forEach((pill) => {
    pill.addEventListener('click', () => trocarImagem(pill.dataset.diagramaPill));
  });

  area.addEventListener('wheel', (e) => {
    e.preventDefault();
    definirZoom(escala + (e.deltaY < 0 ? ZOOM_PASSO : -ZOOM_PASSO));
  }, { passive: false });

  let arrastando = false;
  let inicioX = 0;
  let inicioY = 0;
  area.addEventListener('pointerdown', (e) => {
    arrastando = true;
    inicioX = e.clientX - deslocX;
    inicioY = e.clientY - deslocY;
    area.setPointerCapture(e.pointerId);
    area.classList.add('visualizador-arrastando');
  });
  area.addEventListener('pointermove', (e) => {
    if (!arrastando) return;
    deslocX = e.clientX - inicioX;
    deslocY = e.clientY - inicioY;
    aplicarTransform();
  });
  const soltar = () => {
    arrastando = false;
    area.classList.remove('visualizador-arrastando');
  };
  area.addEventListener('pointerup', soltar);
  area.addEventListener('pointerleave', soltar);
  area.addEventListener('dblclick', resetarZoom);
}
