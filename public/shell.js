// US53 — shell compartilhado por todas as páginas admin (painel/whatsapp/
// configurações/detalhe do tenant): identificação do admin (nome + avatar)
// e o dropdown "Sair", no mesmo padrão visual/comportamental do user menu do
// painel do tenant (app.js). Cada página ainda faz seu próprio redirect
// síncrono no <head> se não houver token (precisa rodar antes do body
// existir); este script só cuida do que depende do DOM já montado, por isso
// é carregado no fim do body, antes do script específico da página.

// US57 — ícones do menu lateral (Kyvvo DS, biblioteca lucide). Só os paths
// dos ícones usados aqui, copiados de lucide-static — sem trazer a lib
// inteira pra um site sem bundler. stroke="currentColor" herda a cor do
// próprio .menu-item/.btn-topbar-icone, então hover/active pintam o ícone
// de graça, sem CSS extra.
const LUCIDE_ICONS = {
  'layout-dashboard': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  'building-2': '<path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  'credit-card': '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  'message-circle': '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
  sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="M3.29 7 12 12l8.71-5"/><path d="m7.5 4.27 9 5.15"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
};

function svgIcone(nome, classe) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (classe) svg.setAttribute('class', classe);
  svg.innerHTML = LUCIDE_ICONS[nome] || '';
  return svg;
}

// Árvore de navegação (pedido do Bruno: menu com grupos expansíveis, não
// mais uma lista plana) — fonte única, montada aqui em vez de duplicada em
// cada HTML (eram 9 cópias idênticas do mesmo <nav>, uma por página, e
// qualquer alteração de menu exigia editar as 9). `pendente: true` marca
// item da estrutura-alvo que ainda não tem tela: aparece na árvore (o
// Bruno pediu pra ver a estrutura inteira), mas sem link — cada PR futura
// que implementa a tela troca `pendente` por `href` aqui, isso e mais nada.
const NAV_TREE = [
  { tipo: 'item', label: 'Visão geral', icon: 'layout-dashboard', href: '/dashboard.html' },
  {
    tipo: 'grupo', label: 'Clientes', icon: 'building-2', filhos: [
      { label: 'Empresas', href: '/painel.html' },
      { label: 'Usuários', href: '/usuarios.html' },
    ],
  },
  {
    tipo: 'grupo', label: 'Produtos', icon: 'package', filhos: [
      { label: 'Studio', pendente: true },
      { label: 'People', pendente: true },
      { label: 'Leads', pendente: true },
      { label: 'CRM', pendente: true },
    ],
  },
  {
    tipo: 'grupo', label: 'WhatsApp', icon: 'message-circle', filhos: [
      { label: 'Números', pendente: true },
      // WABAs/Templates ao vivo da Meta (pedido do Bruno) — sem tabela
      // local, ver comentário no topo de whatsapp-wabas.js/-templates.js.
      { label: 'WABAs', href: '/whatsapp-wabas.html' },
      // "Saúde" é a tela de hoje (whatsapp.html): confere se a Cloud API
      // da Meta está conectada de verdade — não é lista de números.
      { label: 'Saúde', href: '/whatsapp.html' },
      { label: 'Templates', href: '/whatsapp-templates.html' },
      { label: 'Logs', pendente: true },
    ],
  },
  {
    tipo: 'grupo', label: 'Campanhas', icon: 'megaphone', filhos: [
      { label: 'Templates', pendente: true },
      { label: 'Envios', pendente: true },
      { label: 'Relatórios', pendente: true },
    ],
  },
  {
    tipo: 'grupo', label: 'Plataforma', icon: 'credit-card', filhos: [
      { label: 'Planos', pendente: true },
      { label: 'Assinaturas', href: '/assinaturas.html' },
      { label: 'Entitlements', pendente: true },
      // Fora da estrutura que o Bruno mandou, mas já existia e não tinha
      // pra onde ir — consumo/custo de IA é informação de plataforma.
      { label: 'IA e consumo', href: '/ia-uso.html' },
    ],
  },
  {
    tipo: 'grupo', label: 'Sistema', icon: 'shield', filhos: [
      { label: 'Administradores', href: '/administradores.html' },
      { label: 'Permissões', pendente: true },
      { label: 'Feature Flags', pendente: true },
      { label: 'Auditoria', pendente: true },
      { label: 'Logs', pendente: true },
      { label: 'Configurações', href: '/configuracoes.html' },
      { label: 'Versões / Changelog', href: '/versao.html' },
      { label: 'Swagger', href: '/docs', externo: true },
    ],
  },
];

function slugRotulo(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

// Mesma convenção de grupo expansível do painel do tenant (app.js:
// .menu-item-grupo + .menu-chevron + .menu-submenu, classes .aberto/
// .expandido/.tem-filho-ativo já vêm do style.css compartilhado) —
// adaptada aqui pra navegação real por <a href> (cada tela é um .html
// próprio, sem router client-side como o painel do tenant tem).
function montarMenu() {
  const nav = document.getElementById('menu-lateral');
  if (!nav) return; // login.html não tem sidebar
  const caminhoAtual = window.location.pathname;
  nav.innerHTML = '';

  NAV_TREE.forEach((entrada) => {
    if (entrada.tipo === 'item') {
      const a = document.createElement('a');
      a.className = 'menu-item';
      a.href = entrada.href;
      a.dataset.icon = entrada.icon;
      a.textContent = entrada.label;
      if (caminhoAtual === entrada.href) a.classList.add('active');
      nav.appendChild(a);
      return;
    }

    const grupoId = `menu-grupo-${slugRotulo(entrada.label)}`;
    const toggle = document.createElement('div');
    toggle.className = 'menu-item-grupo';
    toggle.dataset.icon = entrada.icon;
    toggle.dataset.submenu = grupoId;
    const rotulo = document.createElement('span');
    rotulo.textContent = entrada.label;
    const chevron = document.createElement('span');
    chevron.className = 'menu-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    toggle.append(rotulo, chevron);

    const submenu = document.createElement('div');
    submenu.className = 'menu-submenu';
    submenu.id = grupoId;

    let temFilhoAtivo = false;
    entrada.filhos.forEach((filho) => {
      if (filho.pendente) {
        const span = document.createElement('span');
        span.className = 'menu-item menu-item-pendente';
        span.textContent = filho.label;
        span.title = 'Em desenvolvimento';
        submenu.appendChild(span);
        return;
      }
      const a = document.createElement('a');
      a.className = 'menu-item';
      a.href = filho.href;
      a.textContent = filho.label;
      if (filho.externo) { a.target = '_blank'; a.rel = 'noopener'; }
      if (caminhoAtual === filho.href) {
        a.classList.add('active');
        temFilhoAtivo = true;
      }
      submenu.appendChild(a);
    });

    if (temFilhoAtivo) {
      toggle.classList.add('tem-filho-ativo', 'expandido');
      submenu.classList.add('aberto');
    }

    toggle.addEventListener('click', () => {
      submenu.classList.toggle('aberto');
      toggle.classList.toggle('expandido');
    });

    nav.append(toggle, submenu);
  });

  nav.querySelectorAll('.menu-item[data-icon], .menu-item-grupo[data-icon]').forEach((item) => {
    item.insertBefore(svgIcone(item.dataset.icon, 'menu-icon'), item.firstChild);
  });
}

montarMenu();

// Tema: o painel (tenant + admin) adotou o layout claro do Kyvvo People,
// modo único, sem toggle. Os tokens vêm do @kyvvohq/design-system (:root =
// claro); nenhum data-theme é setado.

const token = localStorage.getItem('kyvvo_admin_token');
const adminNome = localStorage.getItem('kyvvo_admin_nome') || '';

document.getElementById('admin-nome').textContent = adminNome;

// Iniciais do admin pro avatar — mesmo critério de iniciaisNome() no painel
// do tenant (primeira + última palavra do nome).
function iniciaisAdmin(nome) {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '🛠';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}
document.getElementById('user-menu-avatar').textContent = iniciaisAdmin(adminNome);

// Tema claro/escuro — o admin herdava só o claro do @kyvvohq/design-system
// (o comentário antigo aqui dizia "modo único, sem toggle"), mas o DS e o
// painel do tenant (kyvvo-studio) já suportam data-theme="dark" de verdade;
// ninguém tinha voltado aqui pra ligar o toggle. Mesma chave localStorage
// (`kyvvo_tema`) do painel do tenant — trocar de tema aqui não teria por
// que divergir do resto do produto. O <head> de cada página já aplica o
// tema salvo antes do primeiro paint (evita flash); aqui só o toggle em si.
function temaAtual() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function definirTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  localStorage.setItem('kyvvo_tema', tema);
  const estadoEl = document.getElementById('user-menu-tema-estado');
  const btnTema = document.getElementById('btn-tema-toggle');
  if (estadoEl) estadoEl.textContent = tema === 'dark' ? 'Escuro' : 'Claro';
  if (btnTema) btnTema.setAttribute('aria-checked', String(tema === 'dark'));
}

// Conteúdo do dropdown "montado" aqui (não estático em cada HTML) pelo
// mesmo motivo do menu lateral (montarMenu): eram 11 cópias idênticas do
// mesmo <div>, e só tinha o botão Sair — sem "Meu Perfil"/"Equipe"/"Ajuda"
// porque a área admin ainda não tem tela de perfil própria nem conceito de
// "equipe" pro staff da Kyvvo (o painel do tenant tem os dois); ficam pra
// quando existir alguma dessas telas, pra não linkar pra lugar nenhum.
function montarUserMenuDropdown() {
  const dropdown = document.getElementById('user-menu-dropdown');
  dropdown.innerHTML = '';

  const btnTema = document.createElement('button');
  btnTema.className = 'user-menu-tema';
  btnTema.id = 'btn-tema-toggle';
  btnTema.type = 'button';
  btnTema.setAttribute('role', 'switch');
  btnTema.innerHTML = '<span>Tema</span><span class="user-menu-tema-estado" id="user-menu-tema-estado"></span>';
  btnTema.addEventListener('click', () => definirTema(temaAtual() === 'dark' ? 'light' : 'dark'));

  const divisor = document.createElement('div');
  divisor.className = 'user-menu-divisor';

  const btnSair = document.createElement('button');
  btnSair.className = 'user-menu-sair';
  btnSair.id = 'btn-sair';
  btnSair.innerHTML = '<span aria-hidden="true">⎋</span> Sair';
  btnSair.addEventListener('click', () => {
    localStorage.removeItem('kyvvo_admin_token');
    localStorage.removeItem('kyvvo_admin_nome');
    window.location.href = '/login.html';
  });

  dropdown.append(btnTema, divisor, btnSair);
  definirTema(temaAtual()); // sincroniza o rótulo/aria-checked com o tema já aplicado no <head>
}
montarUserMenuDropdown();

// User menu (avatar + dropdown) — mesmo comportamento do painel do tenant
// (abre/fecha ao clicar no avatar, fecha ao clicar fora).
const userMenuToggle = document.getElementById('user-menu-toggle');
const userMenuDropdown = document.getElementById('user-menu-dropdown');

function fecharUserMenu() {
  userMenuDropdown.hidden = true;
  userMenuToggle.classList.remove('aberto');
}

userMenuToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const vaiAbrir = userMenuDropdown.hidden;
  fecharUserMenu();
  if (vaiAbrir) {
    userMenuDropdown.hidden = false;
    userMenuToggle.classList.add('aberto');
  }
});

document.addEventListener('click', (e) => {
  if (!document.getElementById('user-menu').contains(e.target)) fecharUserMenu();
});
