// Cliente da ponte no site (docs/js/banco.js e banco-fase2.js) com um fetch falso: endereço montado, senha no cabeçalho,
// erros em português (senha recusada, sem ponte, tempo esgotado), boletos (emitir, consultar, listar páginas) e fase 2
// (extrato, pagamentos, comprovante). Nada vai ao banco. Dados fictícios (CPF 529.982.247-25, CNPJ 11.222.333/0001-81).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as B from '../docs/js/banco.js';
import * as F2 from '../docs/js/banco-fase2.js';
import * as R from '../docs/js/regras.js';

const PONTE = 'http://localhost:8765';
const SENHA = 'frase longa combinada com a ponte';

/** fetch falso: guarda as chamadas e responde com o que `responder(url, init)` devolver ({ status, corpo } ou texto). */
function fetchFalso(responder = () => ({ ok: true })) {
  const chamadas = [];
  const f = async (url, init = {}) => {
    chamadas.push({ url, metodo: init.method, cabecalhos: init.headers || {}, corpo: init.body ? JSON.parse(init.body) : null });
    const r = responder(url, init);
    if (typeof r === 'string') return new Response(r, { status: 200 });
    // { status, corpo } = resposta HTTP com erro; qualquer outro objeto é o JSON de uma resposta 200
    return 'corpo' in r ? new Response(JSON.stringify(r.corpo), { status: r.status || 200 }) : new Response(JSON.stringify(r), { status: 200 });
  };
  f.chamadas = chamadas;
  return f;
}

function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'teste');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Professor Nilo Brandão, 117', bairro: 'São Lourenço', cidade: 'Curitiba', uf: 'PR', cep: '82200-100' }, 'teste');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo da Silva', inquilino_cpf: '529.982.247-25', inquilino_endereco: 'Rua das Flores, 45, Centro, Curitiba/PR, CEP 80010-000',
    data_entrada: '2026-01-10', vigencia_inicio: '2026-01-10', aluguel_inicial: 364445, dia_vencimento: 10, cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 10, taxa_boleto: 0, multa_percentual: 10, juros_mensal_percentual: 1 }, 'teste');
  R.salvarContaBanco(d, { id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox', chave_pix: 'chave-aleatoria-ank', dias_baixa: 30 }, 'teste');
  R.salvarConfigBanco(d, { ativo: true }, 'teste');
  R.gerarCobrancas(d, '2026-02', 'teste'); // mês cheio: aluguel 3.644,45
  return { d, c, cb: d.cobrancas[0], conta: R.contaBanco(d, 'ank') };
}

test('ponte deste navegador: endereço limpo (sem barra final), só http(s); sem ela a chamada explica o que falta', async () => {
  await B.salvarPonteLocal({ ponte_url: '', senha_ponte: '' });
  assert.equal(B.ponteLocal().configurada, false);
  await assert.rejects(B.chamarPonteCrua('GET', '/saude'), /Falta o endereço e a senha da ponte/);
  await assert.rejects(B.salvarPonteLocal({ ponte_url: 'localhost:8765', senha_ponte: 'x' }), /começa com http/);
  const p = await B.salvarPonteLocal({ ponte_url: `${PONTE}///`, senha_ponte: SENHA });
  assert.equal(p.ponte_url, PONTE);
  assert.equal(B.ponteLocal().configurada, true);
  const { d } = base();
  assert.equal(B.pontePronta(d), true);
  assert.equal(B.configuracaoBanco(d).senha_ponte, SENHA, 'a senha fica só neste navegador, nunca no JSON compartilhado');
  assert.equal(d.config_banco.senha_ponte, undefined);
});

test('chamarPonte monta /contas/<conta>/…, manda a senha no cabeçalho e JSON no corpo; devolve o JSON da ponte', async () => {
  await B.salvarPonteLocal({ ponte_url: PONTE, senha_ponte: SENHA });
  const f = fetchFalso(() => ({ ponte: true, versao: '2' }));
  const r = await B.chamarPonte('ank', 'POST', 'boletos', { amount: '3644.45' }, { fetch: f });
  assert.deepEqual(r, { ponte: true, versao: '2' });
  const [ch] = f.chamadas;
  assert.equal(ch.url, `${PONTE}/contas/ank/boletos`);
  assert.equal(ch.metodo, 'POST');
  assert.equal(ch.cabecalhos[B.CABECALHO_SENHA], SENHA);
  assert.equal(ch.cabecalhos['Content-Type'], 'application/json');
  assert.deepEqual(ch.corpo, { amount: '3644.45' });
  assert.throws(() => B.chamarPonte('', 'GET', '/saude'), /Conta bancária não informada/);
  const g = fetchFalso(() => ({ ok: true }));
  await B.saudePonte(null, { fetch: g });
  assert.equal(g.chamadas[0].url, `${PONTE}/saude`);
  assert.equal(g.chamadas[0].corpo, null, 'GET sem corpo');
  assert.equal(g.chamadas[0].cabecalhos['Content-Type'], undefined);
});

test('erros da ponte em português: senha recusada (401/403), erro do banco com o texto dele, resposta que não é JSON, ponte desligada e tempo esgotado', async () => {
  await B.salvarPonteLocal({ ponte_url: PONTE, senha_ponte: SENHA });
  await assert.rejects(B.chamarPonteCrua('GET', '/saude', null, { fetch: fetchFalso(() => ({ status: 401, corpo: { erro: 'x' } })) }), (e) => e instanceof B.ErroPonte && e.status === 401 && /recusou a senha/.test(e.message));
  await assert.rejects(B.chamarPonteCrua('GET', '/saude', null, { fetch: fetchFalso(() => ({ status: 403, corpo: {} })) }), /recusou a senha/);
  await assert.rejects(B.chamarPonteCrua('GET', '/x', null, { fetch: fetchFalso(() => ({ status: 422, corpo: { erro: 'CPF do pagador inválido' } })) }), (e) => e.status === 422 && e.message === 'CPF do pagador inválido' && !!e.detalhes.erro);
  await assert.rejects(B.chamarPonteCrua('GET', '/x', null, { fetch: fetchFalso(() => ({ status: 500, corpo: { message: 'Internal' } })) }), /Internal/);
  // resposta sem JSON (ex.: página de erro): vira erro com o começo do texto
  const html = async () => new Response('<html>Bad gateway</html>', { status: 502 });
  await assert.rejects(B.chamarPonteCrua('GET', '/x', null, { fetch: html }), (e) => e.status === 502 && e.detalhes.erro.includes('Bad gateway'));
  // ponte desligada
  const fora = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(B.chamarPonteCrua('GET', '/saude', null, { fetch: fora }), /Não consegui falar com a ponte em http:\/\/localhost:8765/);
  // pendurada: o tempo limite cancela
  const pendurada = (url, init) => new Promise((_, erro) => { init.signal.addEventListener('abort', () => erro(Object.assign(new Error('abort'), { name: 'AbortError' }))); });
  await assert.rejects(B.chamarPonteCrua('GET', '/saude', null, { fetch: pendurada, tempoLimite: 20 }), /não respondeu a tempo/);
});

test('boletos: emitir manda o pedido do sistema e devolve pedido+resposta sem gravar; consultar/cancelar/alterar usam o código do banco; listar junta as páginas', async () => {
  await B.salvarPonteLocal({ ponte_url: PONTE, senha_ponte: SENHA });
  const { d, conta } = base();
  let cb = d.cobrancas[0];
  const f = fetchFalso(() => ({ id: 'C6-123', status: 'ISSUED' }));
  const r = await B.emitirBoleto(d, cb, conta, { fetch: f });
  assert.equal(f.chamadas[0].url, `${PONTE}/contas/ank/boletos`);
  assert.equal(r.resposta.id, 'C6-123');
  assert.equal(r.pedido.amount, 3644.45, 'pedido no formato da API (reais), vindo de pedidoBoletoC6');
  assert.equal(R.emitidoNoBanco(cb), false, 'emitir não grava: quem grava é a tela');
  assert.throws(() => B.consultarBoleto(d, cb, { fetch: f }), /não foi emitido no banco/); // lança na hora (função síncrona); a tela chama dentro de try/await
  R.registrarBoletoBancario(d, cb.id, { id: 'C6-123', status: 'ISSUED' }, 'teste', { conta_id: 'ank', ambiente: 'sandbox' });
  cb = R.buscar(d, 'cobrancas', cb.id); // atualizar troca o registro
  assert.equal(cb.banco.id_banco, 'C6-123');
  await assert.rejects(B.emitirBoleto(d, cb, conta, { fetch: f }), /já foi emitido/);
  f.chamadas.length = 0;
  await B.consultarBoleto(d, cb, { fetch: f });
  await B.cancelarBoleto(d, cb, { fetch: f });
  await B.alterarBoleto(d, cb, { amount: '3600.00' }, { fetch: f });
  await B.cancelarNegativacao(d, cb, { fetch: f });
  assert.deepEqual(f.chamadas.map((c) => `${c.metodo} ${c.url.slice(PONTE.length)}`), [
    'GET /contas/ank/boletos/C6-123', 'POST /contas/ank/boletos/C6-123/cancelar', 'POST /contas/ank/boletos/C6-123/alterar', 'POST /contas/ank/boletos/C6-123/negativar/cancelar']);
  assert.deepEqual(f.chamadas[2].corpo, { amount: '3600.00' });
  assert.throws(() => B.negativarBoleto(d, cb, 5, { fetch: f }), /negativação está desligada/);
  assert.equal(B.urlPdfBoleto(d, cb), `${PONTE}/contas/ank/boletos/C6-123/pdf`);
  assert.equal(B.imagemQrPix(cb), '', 'sem QR guardado, nada');
  assert.equal(B.imagemQrPix({ banco: { pix_qr_base64: 'AAAA' } }), 'data:image/png;base64,AAAA');
  // listagem paginada: 3 páginas, até 10
  const paginas = fetchFalso((url) => { const p = Number(new URL(url).searchParams.get('page')); return { content: [{ id: `p${p}` }], total_pages: 3 }; });
  const todos = await B.listarTodosBoletos(d, 'ank', { due_date_from: '2026-03-01', due_date_to: '2026-03-31' }, { fetch: paginas });
  assert.deepEqual(todos.map((x) => x.id), ['p0', 'p1', 'p2']);
  assert.equal(new URL(paginas.chamadas[0].url).searchParams.get('size'), '100');
  // integração desligada: explica em vez de chamar
  R.salvarConfigBanco(d, { ativo: false }, 'teste');
  await assert.rejects(B.emitirBoleto(d, cb, conta, { fetch: f }), (e) => e.message === B.motivoIndisponivel(d));
});

test('fase 2: extrato/boletos pagos exigem datas AAAA-MM-DD; pagamentos (ler, itens, remover, enviar) e comprovante em PDF; no Node vai à ponte de verdade', async () => {
  await B.salvarPonteLocal({ ponte_url: PONTE, senha_ponte: SENHA });
  const original = globalThis.fetch;
  const f = fetchFalso((url) => (url.includes('/comprovante/') ? { pdf_base64: btoa('%PDF-1.4 teste'), nome: 'comp.pdf', origem: 'ponte', lancamento: { reference: 'REF1' } } : { ok: true }));
  globalThis.fetch = f;
  try {
    await F2.extratoDaConta('ank', '2026-11-01', '2026-11-30');
    await F2.boletosPagos('ank', '2026-11-01', '2026-11-30', 'credit_date');
    await F2.saldoDaConta('ank');
    await F2.ddaDaConta('ank');
    await F2.decodificarPagamentos('ank', [{ content: '23790...', amount: '150.00', description: 'Copel' }]);
    await F2.itensDoGrupo('ank', 'G 1');
    await F2.removerItensDoGrupo('ank', 'G 1', 'it1');
    await F2.enviarGrupoParaAprovacao('ank', 'G 1', '  Dono  ');
    const blob = await F2.baixarComprovantePonte('ank', 'REF1', '2026-11-05');
    assert.deepEqual(f.chamadas.map((c) => `${c.metodo} ${c.url.slice(PONTE.length)}`), [
      'GET /contas/ank/extrato?de=2026-11-01&ate=2026-11-30', 'GET /contas/ank/boletos/pagos?de=2026-11-01&ate=2026-11-30&por=credit_date',
      'GET /contas/ank/saldo', 'GET /contas/ank/dda', 'POST /contas/ank/pagamentos/decodificar', 'GET /contas/ank/pagamentos/G%201/itens',
      'DELETE /contas/ank/pagamentos/G%201/itens', 'POST /contas/ank/pagamentos/G%201/enviar', 'GET /contas/ank/comprovante/REF1?data=2026-11-05&formato=json']);
    assert.deepEqual(f.chamadas[4].corpo, { items: [{ content: '23790...', amount: '150.00', description: 'Copel' }] });
    assert.deepEqual(f.chamadas[6].corpo, ['it1']);
    assert.deepEqual(f.chamadas[7].corpo, { uploader_name: 'Dono' });
    assert.equal(blob.type, 'application/pdf');
    assert.equal(blob.nome, 'comp.pdf');
    assert.equal(await blob.text(), '%PDF-1.4 teste');
    assert.deepEqual(blob.lancamento, { reference: 'REF1' });
    await assert.rejects(F2.extratoDaConta('ank', '01/11/2026', '2026-11-30'), /AAAA-MM-DD/);
    await assert.rejects(F2.decodificarPagamentos('ank', []), /pelo menos um pagamento/);
    await assert.rejects(F2.removerItensDoGrupo('ank', 'G1', []), /itens a remover/);
    await assert.rejects(F2.enviarGrupoParaAprovacao('ank', 'G1', ' '), /nome de quem/);
    await assert.rejects(F2.itensDoGrupo('ank', ''), /Informe o grupo/);
    globalThis.fetch = fetchFalso(() => ({ sem: 'pdf' }));
    await assert.rejects(F2.baixarComprovantePonte('ank', 'REF1'), /não devolveu o PDF/);
    assert.deepEqual([...F2.bytesDoBase64('AQID')], [1, 2, 3]);
  } finally {
    globalThis.fetch = original;
  }
});
