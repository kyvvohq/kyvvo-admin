import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

// Espelha o NAV_TREE de public/shell.js — duplicado de propósito aqui, não
// importado: shell.js é script clássico (assume globais/DOM), não um
// módulo. Qualquer alteração de menu feita lá precisa ser replicada aqui
// manualmente enquanto só esta página estiver migrada (ver plano).
const NAV_TREE = [
  { tipo: 'item', label: 'Visão geral', href: '/dashboard.html' },
  { tipo: 'item', label: 'Tenants', href: '/painel.html' },
  {
    tipo: 'grupo', label: 'Produtos', filhos: [
      { label: 'Studio', href: '/produtos-studio.html' },
      { label: 'People', href: '/produtos-people.html' },
      { label: 'CRM', href: '/produtos-crm.html' },
    ],
  },
  {
    tipo: 'grupo', label: 'WhatsApp', filhos: [
      { label: 'WABAs', href: '/whatsapp-wabas.html' },
      { label: 'Saúde', href: '/whatsapp.html' },
      { label: 'Templates', href: '/whatsapp-templates.html' },
      { label: 'Disparos', href: '/whatsapp-disparos.html' },
      { label: 'Catálogo de disparos', href: '/whatsapp-catalogo.html' },
    ],
  },
  {
    tipo: 'grupo', label: 'E-mail', filhos: [
      { label: 'Modelos', href: '/email-modelos.html' },
      { label: 'Rodapé', href: '/email-rodape.html' },
      { label: 'Envios', href: '/email-envios.html' },
      { label: 'Lista de bloqueio', href: '/email-bloqueio.html' },
    ],
  },
  {
    tipo: 'grupo', label: 'Plataforma', filhos: [
      { label: 'Assinaturas', href: '/assinaturas.html' },
      { label: 'IA e consumo', href: '/ia-uso.html' },
    ],
  },
  {
    tipo: 'grupo', label: 'Sistema', filhos: [
      // Única entrada migrada pra React nesta rodada — rota interna via
      // React Router em vez de <a href> de page load cheio.
      { label: 'Administradores', to: '/administradores' },
      { label: 'Versões / Changelog', href: '/versao.html' },
      { label: 'Swagger', href: '/docs', externo: true },
      { label: 'Arquitetura', href: '/documentacao-arquitetura.html' },
      { label: 'Banco', href: '/documentacao-banco.html' },
    ],
  },
];

function iniciaisAdmin(nome) {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '🛠';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

function MenuGrupo({ grupo, caminhoAtual }) {
  const temFilhoAtivo = grupo.filhos.some((f) => f.href === caminhoAtual || (f.to && caminhoAtual.startsWith(`/app${f.to}`)));
  const [aberto, setAberto] = useState(temFilhoAtivo);

  return (
    <li className="ds-menu-grupo">
      <button
        type="button"
        className={`ds-menu-link ds-menu-grupo-botao${temFilhoAtivo ? ' tem-filho-ativo' : ''}`}
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <span className="ds-menu-rotulo">{grupo.label}</span>
        <span className="ds-menu-seta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </button>
      {aberto && (
        <ul className="ds-menu-sub">
          {grupo.filhos.map((filho) => (
            <li key={filho.label}>
              {filho.to ? (
                <Link
                  className={`ds-menu-sublink${caminhoAtual.startsWith(`/app${filho.to}`) ? ' ds-menu-sublink-ativo' : ''}`}
                  to={filho.to}
                >
                  {filho.label}
                </Link>
              ) : (
                <a
                  className="ds-menu-sublink"
                  href={filho.href}
                  target={filho.externo ? '_blank' : undefined}
                  rel={filho.externo ? 'noopener' : undefined}
                >
                  {filho.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function AdminLayout() {
  const location = useLocation();
  const caminhoAtual = location.pathname;

  const [nome, setNome] = useState('');
  const [tema, setTema] = useState(() => localStorage.getItem('kyvvo_tema') || 'light');
  const [recolhida, setRecolhida] = useState(() => localStorage.getItem('kyvvo_admin_sidebar_oculta') === '1');
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    setNome(localStorage.getItem('kyvvo_admin_nome') || '');
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('kyvvo_tema', tema);
  }, [tema]);

  function alternarSidebar() {
    const nova = !recolhida;
    setRecolhida(nova);
    localStorage.setItem('kyvvo_admin_sidebar_oculta', nova ? '1' : '0');
  }

  function sair() {
    localStorage.removeItem('kyvvo_admin_token');
    localStorage.removeItem('kyvvo_admin_nome');
    window.location.href = '/login.html';
  }

  return (
    <>
      <header className="ds-topbar">
        <a className="ds-topbar-marca" href="/painel.html" aria-label="Ir para o início">
          <span className="ds-topbar-produto"><span className="ds-topbar-produto-acento">Ad</span>min</span>
          <span className="ds-topbar-kyvvo">kyvvo</span>
        </a>
        <div className="ds-topbar-acoes">
          <div className="user-menu">
            <button className="user-menu-toggle" onClick={() => setMenuAberto((v) => !v)}>
              <div className="user-menu-avatar">{iniciaisAdmin(nome)}</div>
              <div className="user-menu-textos">
                <div className="user-menu-nome">{nome}</div>
              </div>
              <span className="user-menu-chevron">▾</span>
            </button>
            {menuAberto && (
              <div className="user-menu-dropdown">
                <button className="user-menu-tema" type="button" role="switch" aria-checked={tema === 'dark'} onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')}>
                  <span>Tema</span>
                  <span className="user-menu-tema-estado">{tema === 'dark' ? 'Escuro' : 'Claro'}</span>
                </button>
                <div className="user-menu-divisor" />
                <button className="user-menu-sair" onClick={sair}>
                  <span aria-hidden="true">⎋</span> Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="painel-shell">
        <nav className="ds-menu" data-ds-menu-recolhido={recolhida ? '' : undefined}>
          <button type="button" className="ds-menu-toggle" onClick={alternarSidebar}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <ul className="ds-menu-lista">
            {NAV_TREE.map((entrada) => {
              if (entrada.tipo === 'item') {
                return (
                  <li key={entrada.label}>
                    <a className="ds-menu-link" href={entrada.href}>
                      <span className="ds-menu-rotulo">{entrada.label}</span>
                    </a>
                  </li>
                );
              }
              return <MenuGrupo key={entrada.label} grupo={entrada} caminhoAtual={caminhoAtual} />;
            })}
          </ul>
        </nav>
        <div className="painel-main">
          <Outlet />
          <footer className="ds-rodape">
            <span>© {new Date().getFullYear()} Kyvvo Tecnologia. Todos os direitos reservados.</span>
          </footer>
        </div>
      </div>
    </>
  );
}
