const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validarPatchModelo, validarConfig, exemplosDe, layoutExemplo } = require('../routes/admin-email');

describe('admin-email — validações', () => {
  test('patch de modelo: assunto/título não podem ficar vazios; limites', () => {
    assert.match(validarPatchModelo({ assunto: '  ' }).erro, /Assunto/);
    assert.match(validarPatchModelo({ titulo: '' }).erro, /Título/);
    assert.match(validarPatchModelo({ cta_texto: 'x'.repeat(61) }).erro, /cta_texto/);
    assert.match(validarPatchModelo({}).erro, /Nada/);
    const ok = validarPatchModelo({ assunto: 'A', corpo: 'B', cta_texto: ' ', motivo: '', ativo: 0, ignorado: 'x' });
    assert.deepEqual(ok.campos, { assunto: 'A', corpo: 'B', cta_texto: null, motivo: null, ativo: false });
  });

  test('configuração: só chaves conhecidas, links https, {{caminho}} obrigatório', () => {
    assert.match(validarConfig({ outra: 'x' }).erro, /desconhecida/);
    assert.match(validarConfig({ caminho_notificacoes_crm_url: 'http://x' }).erro, /https/);
    assert.match(validarConfig({ rodape_desativar: 'Desative no menu' }).erro, /\{\{caminho\}\}/);
    assert.deepEqual(validarConfig({ rodape_desativar: ' Vá em {{caminho}}. ' }).valores, { rodape_desativar: 'Vá em {{caminho}}.' });
  });

  test('exemplos e layout de exemplo da prévia', () => {
    assert.deepEqual(exemplosDe({ variaveis: [{ nome: 'a', exemplo: '1' }, { nome: 'b' }] }), { a: '1', b: '' });
    const l = layoutExemplo({ chave: 'token_verificacao', tipo: 'seguranca', titulo: 'T', cta_texto: null });
    assert.equal(l.destaque, '482915');
    assert.equal(l.cta, undefined);
    assert.equal(layoutExemplo({ chave: 'notificacao', tipo: 'notificacao', titulo: 'T', cta_texto: 'Abrir' }).cta.url, 'https://kyvvo.com.br');
  });
});
