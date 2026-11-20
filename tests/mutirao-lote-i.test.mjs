// Mutirão de 19/11, lote I (cadastros e formulários): valores sem sentido que eram aceitos calados agora são recusados ou pedem
// "Salvar assim mesmo?". Roda no Node com o navegador de mentira (tela-falsa.mjs). Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bancoComUsuarios, carregarSite, elemento, entrarComo } from './tela-falsa.mjs';

const T = await carregarSite();
const { E, R } = T;
const { CADASTROS } = await import('../docs/js/telas/cadastros.js');
const A = await import('../docs/js/telas/avisos.js');
const F = await import('../docs/js/formularios.js');
const AUTH = await import('../docs/js/auth.js');
const hoje = T.C.hojeIso();
const form = (campos = [], arquivos = {}) => elemento('form', { campos, querySelector: (sel) => { const m = sel.match(/name="?([\w]+)"?\]/); return m && arquivos[m[1]] ? { files: [arquivos[m[1]]] } : null; } });

function base() {
  const d = bancoComUsuarios(R, E);
  entrarComo(E, 'admin');
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa Exemplo', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'teste');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Daniel Exemplo', inquilino_cpf: '529.982.247-25', data_entrada: '2026-01-10', vigencia_inicio: '2026-01-10',
    prazo_tipo: 'Determinado', prazo_meses: 30, aluguel_inicial: 240000, dia_vencimento: 10, ativo: true, bonificacao: true, desconto_pontualidade_percentual: 10 }, 'teste');
  return { d, casa, c };
}

test('boleto: desconto maior que o aluguel é recusado; multa e juros negativos são recusados; multa alta e vencimento de outro ano perguntam', () => {
  const { d, c } = base();
  const cb = R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2026-10', vencimento: '2026-11-10', aluguel: 240000, multa_percentual: 2, juros_mensal_percentual: 1 }, 'teste');
  const erros = {};
  CADASTROS.cobrancas.ajustar({ aluguel: 240000, desconto: 500000 }, erros, cb);
  assert.match(erros.desconto, /não pode passar do aluguel \(R\$ 2\.400,00\)/);
  const lido = F.ler(F.COBRANCA, form([['vencimento', '2026-11-10'], ['aluguel', '2.400,00'], ['multa_percentual', '-1'], ['juros_mensal_percentual', '-3']]));
  assert.ok(lido.erros.multa_percentual && lido.erros.juros_mensal_percentual, 'negativo não passa');
  const avisos = A.conferirBoleto({ vencimento: '2020-01-01', multa_percentual: 500, juros_mensal_percentual: 1 }, cb);
  assert.ok(avisos.some((x) => /antes do mês do boleto \(10\/2026\)/.test(x)), 'vencimento de 2020');
  assert.ok(avisos.some((x) => /Multa por atraso de 500/.test(x)), 'multa de 500%');
  assert.deepEqual(A.conferirBoleto({ vencimento: '2026-11-10', multa_percentual: 2, juros_mensal_percentual: 1 }, cb), [], 'valores normais: sem pergunta');
});

test('IPTU: 99 parcelas, parcela fixa que não bate com o total e 1º boleto de outro ano perguntam antes de salvar', () => {
  const { casa } = base();
  const q = { imovel: String(casa.id) };
  const avisos = A.conferirIptu({ ano: Number(hoje.slice(0, 4)), valor_total: 120000, num_parcelas: 99, primeiro_vencimento_boleto: `${hoje.slice(0, 4)}-03` }, null, q);
  assert.ok(avisos.some((x) => /99 parcelas/.test(x)));
  const fixa = A.conferirIptu({ ano: Number(hoje.slice(0, 4)), valor_total: 120000, num_parcelas: 10, valor_parcela: 500000, primeiro_vencimento_boleto: `${hoje.slice(0, 4)}-03` }, null, q);
  assert.ok(fixa.some((x) => /R\$ 5\.000,00 × 10 = R\$ 50\.000,00/.test(x)), 'R$ 5.000,00 × 10 de um IPTU de R$ 1.200,00');
  const ano = A.conferirIptu({ ano: Number(hoje.slice(0, 4)), valor_total: 120000, num_parcelas: 10, primeiro_vencimento_boleto: '1900-03' }, null, q);
  assert.ok(ano.some((x) => /longe do ano do IPTU/.test(x)));
  assert.deepEqual(A.conferirIptu({ ano: Number(hoje.slice(0, 4)), valor_total: 120000, num_parcelas: 10, valor_parcela: 12000, primeiro_vencimento_boleto: `${hoje.slice(0, 4)}-03` }, null, q), []);
});

test('seguro: 0 parcelas é recusado; 1ª cobrança antes da vigência ou parcelas depois dela perguntam', () => {
  const { c } = base();
  const erros = {};
  CADASTROS.seguros.ajustar({ vigencia_inicio: '2026-01-10', vigencia_fim: '2027-01-10', num_parcelas: 0 }, erros);
  assert.match(erros.num_parcelas, /pelo menos 1 parcela/);
  const q = { contrato: String(c.id) };
  const antes = A.conferirSeguro({ vigencia_inicio: '2026-01-10', vigencia_fim: '2027-01-10', valor_total: 60000, num_parcelas: 12, primeira_competencia: '2020-01' }, null, q);
  assert.ok(antes.some((x) => /antes do início da vigência/.test(x)));
  const muitas = A.conferirSeguro({ vigencia_inicio: '2026-01-10', vigencia_fim: '2027-01-10', valor_total: 60000, num_parcelas: 60, primeira_competencia: '2026-01' }, null, q);
  assert.ok(muitas.some((x) => /depois do fim da vigência/.test(x)));
  assert.deepEqual(A.conferirSeguro({ vigencia_inicio: '2026-01-10', vigencia_fim: '2027-01-10', valor_total: 60000, num_parcelas: 12, primeira_competencia: '2026-01' }, null, q), []);
});

test('renovação: término antes da entrada ou do término atual é recusado; "Novo valor negociado" não muda o término; R$ 1,00 pergunta', () => {
  const { c } = base();
  const q = { contrato: String(c.id) };
  const ajustar = (dados) => { const erros = {}; CADASTROS.renovacoes.ajustar(dados, erros, null, form(), q); return erros; };
  assert.match(ajustar({ data: '2026-11-01', tipo: 'Renovado com nova data de término', nova_vigencia_fim: '2020-01-01' }).nova_vigencia_fim, /depois da entrada/);
  assert.match(ajustar({ data: '2026-11-01', tipo: 'Renovado com nova data de término', nova_vigencia_fim: '2027-01-10' }).nova_vigencia_fim, /depois do término atual \(10\/07\/2028\)/);
  assert.deepEqual(ajustar({ data: '2028-07-10', tipo: 'Renovado com nova data de término', nova_vigencia_fim: '2031-07-10' }), {});
  const novoValor = { data: '2026-11-01', tipo: 'Novo valor negociado', nova_vigencia_fim: '2020-01-01', novo_valor: 100 };
  ajustar(novoValor);
  assert.equal(novoValor.nova_vigencia_fim, null, 'a data digitada não vale no "Novo valor negociado"');
  assert.ok(A.conferirRenovacao({ novo_valor: 100 }, null, q).some((x) => /R\$ 1,00 está 100% abaixo/.test(x)));
});

test('ficha: datas no futuro ou fora de ordem, reserva sem data, reprovação sem motivo e comprovante sem valor são recusados', () => {
  const { casa } = base();
  const futuro = T.C.somarDias(hoje, 10);
  const r = R.inserir(E.d, 'fichas', { inquilino_nome: 'Ana Exemplo', data_recebida: T.C.somarDias(hoje, -5), situacao: 'Em análise', imoveis_ids: [casa.id], modo_imoveis: R.MODOS_FICHA[0] }, 'teste');
  const ajustar = (mais, arquivos = {}) => {
    const erros = {};
    CADASTROS.fichas.ajustar({ inquilino_nome: 'Ana Exemplo', data_recebida: r.data_recebida, situacao: 'Em análise', modo_imoveis: R.MODOS_FICHA[0], [`imovel_${casa.id}`]: true, bonificacao: false, ...mais }, erros, r, form([], arquivos));
    return erros;
  };
  assert.match(ajustar({ data_recebida: futuro }).data_recebida, /futuro/);
  assert.match(ajustar({ reserva_valor: 100000 }).reserva_data, /data da reserva/);
  assert.match(ajustar({ reserva_valor: 100000, reserva_data: futuro }).reserva_data, /futura/);
  assert.match(ajustar({ situacao: 'Reprovada', decisao_motivo: '' }).decisao_motivo, /motivo da reprovação/);
  assert.match(ajustar({ situacao: 'Aprovada', decisao_data: T.C.somarDias(r.data_recebida, -3) }).decisao_data, /antes de a ficha chegar/);
  const reserva = { reserva_valor: 100000, reserva_data: T.C.somarDias(hoje, -3), situacao: 'Reprovada', decisao_motivo: 'Renda insuficiente' };
  assert.match(ajustar({ ...reserva, devolucao_data: T.C.somarDias(hoje, -4) }).devolucao_data, /antes da reserva/);
  assert.match(ajustar({ ...reserva, devolucao_data: futuro }).devolucao_data, /futura/);
  // devolução de parte: precisa da explicação nas observações, e a janela pergunta
  assert.match(ajustar({ ...reserva, devolucao_data: hoje, devolucao_valor: 30000 }).observacoes, /explique a diferença/);
  assert.deepEqual(ajustar({ ...reserva, devolucao_data: hoje, devolucao_valor: 30000, observacoes: 'Desconto da taxa combinada' }), {});
  assert.ok(CADASTROS.fichas.conferir({ ...reserva, devolucao_valor: 30000 }, r).some((x) => /ficam R\$ 700,00 sem devolver/.test(x)));
  // comprovante escolhido e o valor em branco: não some em silêncio
  assert.match(ajustar({}, { comprovante_reserva: { name: 'comprovante.pdf' } }).reserva_valor, /há um comprovante escolhido/);
});

test('desistência antes de a ficha chegar é recusada', () => {
  const { casa } = base();
  const f = R.inserir(E.d, 'fichas', { inquilino_nome: 'Ana Exemplo', data_recebida: '2026-11-19', situacao: 'Em análise', imoveis_ids: [casa.id] }, 'teste');
  assert.throws(() => R.desistirAntesDeAssinar(E.d, { fichaId: f.id, data: '2026-11-01' }, 'teste', '2026-11-20'), /antes de a ficha chegar \(19\/11\/2026\)/);
});

test('solicitação: voltar de "Concluída" para "Aberta" reabre (a data de conclusão sai); conclusão antes do pedido é recusada', () => {
  const { c } = base();
  const r = { id: 1, contrato_id: c.id, situacao: 'Concluída', data: '2026-11-01', data_conclusao: '2026-11-10' };
  const pessoas = R.inquilinosParaSolicitacao(E.d, hoje, c.id);
  const chave = pessoas.find((p) => p.contratos.some((x) => x.id === c.id)).chave;
  const dados = { situacao: 'Aberta', data: '2026-11-01', data_conclusao: '2026-11-10' };
  CADASTROS.solicitacoes.ajustar(dados, {}, r, form([['inquilino', chave]]));
  assert.equal(dados.situacao, 'Aberta');
  assert.equal(dados.data_conclusao, null);
  const erros = {};
  CADASTROS.solicitacoes.ajustar({ situacao: 'Concluída', data: '2026-11-19', data_conclusao: '2020-01-01' }, erros, null, form([['inquilino', chave]]));
  assert.match(erros.data_conclusao, /antes do pedido/);
  assert.ok(CADASTROS.solicitacoes.conferir({ valor: 20000, pago_por: 'Sem custo' }, null).some((x) => /Sem custo/.test(x)));
});

test('cálculo final sem o boleto do mês da saída avisa antes de salvar', () => {
  const { d, c } = base();
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-10-20' }, 'teste');
  const q = { contrato: String(c.id) };
  assert.ok(CADASTROS.encerramentos.conferir({}, null, q).some((x) => /boleto de 10\/2026/.test(x)));
  R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2026-10', vencimento: '2026-11-10', aluguel: 160000 }, 'teste');
  assert.deepEqual(CADASTROS.encerramentos.conferir({}, null, q), []);
});

test('usuários: e-mail de acesso de outro é recusado; sem e-mail, na nuvem, não entra pela internet', () => {
  const us = [{ id: 1, login: 'dono@exemplo.com.br' }, { id: 2, login: 'socio', email: 'socio@exemplo.com.br' }];
  assert.equal(AUTH.usuarioComMesmoAcesso(us, { login: 'maria', email: 'SOCIO@exemplo.com.br' }).id, 2);
  assert.equal(AUTH.usuarioComMesmoAcesso(us, { login: 'socio@exemplo.com.br' }).id, 2, 'login igual ao e-mail de outro');
  assert.equal(AUTH.usuarioComMesmoAcesso(us, { login: 'socio', email: 'socio@exemplo.com.br' }, 2), null, 'o próprio não conta');
  assert.equal(AUTH.emailDeAcesso({ login: 'maria' }), '');
  assert.equal(AUTH.emailDeAcesso({ login: 'Maria@Exemplo.com.br' }), 'maria@exemplo.com.br');
});

test('campos: os de valor negativo abrem o teclado completo; leituras abrem o de números; anexos com a lista do sistema', () => {
  const html = F.camposHtml([...F.COBRANCA, ...F.LEITURA, { nome: 'arq', rotulo: 'Arquivo', tipo: 'arquivo' }], {}, {});
  const entrada = (nome) => html.match(new RegExp(`<input[^>]*name="${nome}"[^>]*>`))[0];
  assert.doesNotMatch(entrada('outros'), /inputmode/, 'o ajuste do mês aceita -150,00');
  assert.match(entrada('desconto'), /inputmode="decimal"/);
  assert.match(entrada('agua'), /inputmode="decimal"/);
  assert.match(entrada('arq'), new RegExp(`accept="${F.ACEITA_DOCUMENTOS.replace(/\./g, '\\.')}"`));
});
