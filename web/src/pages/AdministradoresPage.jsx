import { useEffect, useState } from 'react';
import { api } from '../apiClient.js';

function formatarData(iso) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function AdministradoresPage() {
  const [administradores, setAdministradores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [modalCriar, setModalCriar] = useState(false);
  const [confirmarDesativar, setConfirmarDesativar] = useState(null);
  const [form, setForm] = useState({ nome: '', email: '', senha: '' });
  const [erroForm, setErroForm] = useState('');
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    setCarregando(true);
    api.get('/api/administradores')
      .then((data) => setAdministradores(data.administradores))
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  async function criar(e) {
    e.preventDefault();
    setSalvando(true);
    setErroForm('');
    try {
      await api.post('/api/administradores', form);
      setModalCriar(false);
      setForm({ nome: '', email: '', senha: '' });
      carregar();
    } catch (e) {
      setErroForm(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(admin) {
    if (admin.ativo) {
      setConfirmarDesativar(admin);
      return;
    }
    try {
      await api.patch(`/api/administradores/${admin.id}`, { ativo: true });
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function confirmarDesativarAgora() {
    try {
      await api.patch(`/api/administradores/${confirmarDesativar.id}`, { ativo: false });
      setConfirmarDesativar(null);
      carregar();
    } catch (e) {
      setErro(e.message);
      setConfirmarDesativar(null);
    }
  }

  return (
    <div className="conteudo" style={{ maxWidth: 1400 }}>
      <div className="cabecalho-pagina">
        <div className="textos">
          <div className="linha-titulo">
            <h1 className="pagina-titulo">Administradores</h1>
          </div>
        </div>
        <button className="ds-botao ds-botao-primario" onClick={() => setModalCriar(true)}>
          + Novo administrador
        </button>
      </div>

      {erro && <p className="ds-alerta ds-alerta-danger">{erro}</p>}

      {carregando ? (
        <p>Carregando…</p>
      ) : (
        <table className="ds-tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Status</th>
              <th>Criado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {administradores.map((admin) => (
              <tr key={admin.id}>
                <td>{admin.nome}</td>
                <td>{admin.email}</td>
                <td>
                  <span className={`ds-badge ${admin.ativo ? 'ds-badge-success' : 'ds-badge-neutro'}`}>
                    {admin.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>{formatarData(admin.criado_em)}</td>
                <td>
                  <button className="ds-botao ds-botao-secundario" onClick={() => alternarAtivo(admin)}>
                    {admin.ativo ? 'Desativar' : 'Reativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalCriar && (
        <div className="ds-modal-overlay" role="dialog" aria-modal="true">
          <div className="ds-modal">
            <h2>Novo administrador</h2>
            <form onSubmit={criar}>
              {erroForm && <p className="ds-alerta ds-alerta-danger">{erroForm}</p>}
              <label>
                Nome
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              </label>
              <label>
                E-mail
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </label>
              <label>
                Senha
                <input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required />
              </label>
              <div className="ds-modal-acoes">
                <button type="button" className="ds-botao ds-botao-secundario" onClick={() => setModalCriar(false)}>
                  Cancelar
                </button>
                <button type="submit" className="ds-botao ds-botao-primario" disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmarDesativar && (
        <div className="ds-modal-overlay" role="dialog" aria-modal="true">
          <div className="ds-modal">
            <h2>Desativar administrador?</h2>
            <p>
              {confirmarDesativar.nome} ({confirmarDesativar.email}) perde acesso à área admin imediatamente.
            </p>
            <div className="ds-modal-acoes">
              <button className="ds-botao ds-botao-secundario" onClick={() => setConfirmarDesativar(null)}>
                Cancelar
              </button>
              <button className="ds-botao ds-botao-danger" onClick={confirmarDesativarAgora}>
                Desativar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
