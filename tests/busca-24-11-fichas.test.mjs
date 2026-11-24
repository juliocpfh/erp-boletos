// Busca de erros de 24/11, lote 3 (fichas, comunicados, documentos e e-mails): FIC-01, 02, 04, 05, 06, 08, 09 e DOC-01, 02.
// Cada teste falhava antes da correção. Roda no Node com o navegador de mentira (tela-falsa.mjs). Dados fictícios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { bancoComUsuarios, carregarSite, elemento, entrarComo } from './tela-falsa.mjs';

const T = await carregarSite();
const { E, R } = T;
const { CADASTROS } = await import('../docs/js/telas/cadastros.js');
const { motivoNaoExcluirContrato, motivoNaoExcluirImovel } = await import('../docs/js/telas/acoes.js');
const { pastaFichaLivre, nomePastaFicha } = await import('../docs/js/telas/comum.js');
const { emailDoRecibo } = await import('../docs/js/telas/documentos.js');
const P = await import('../docs/js/pessoa.js');
const CM = await import('../docs/js/comunicados.js');
const hoje = T.C.hojeIso();
const CPF = '529.982.247-25';
const OUTRO = '111.444.777-35';
const form = (campos = []) => elemento('form', { campos, querySelector: () => null });

function base() {
  const d = bancoComUsuarios(R, E);
  entrarComo(E, 'admin');
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa Exemplo', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'teste');
  return { d, casa };
}

test('FIC-01: apagar a pessoa (LGPD) tira o aceite dela como solidária no contrato de outro, e deixa o do solidário do contrato dela', () => {
  const { d, casa } = base();
  const a = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Fulano Teste', inquilino_cpf: CPF, data_entrada: '2010-01-01', data_saida: '2014-01-01', solidario_nome: 'Beltrano Teste', solidario_cpf: OUTRO }, 't');
  const b = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Beltrano Teste', inquilino_cpf: OUTRO, data_entrada: '2010-01-01', data_saida: '2014-01-01', solidario_nome: 'Fulano Teste', solidario_cpf: CPF }, 't');
  R.inserir(d, 'comunicados', { titulo: 'Contatos', destinos: [
    { chave: `c${a.id}`, tipo: 'inquilino', contrato_id: a.id, nome: 'Fulano Teste', resposta: { ip: '1.1.1.1' } },
    { chave: `s${a.id}`, tipo: 'solidario', contrato_id: a.id, nome: 'Beltrano Teste', resposta: { ip: '2.2.2.2' } },
    { chave: `c${b.id}`, tipo: 'inquilino', contrato_id: b.id, nome: 'Beltrano Teste', resposta: { ip: '2.2.2.2' } },
    { chave: `s${b.id}`, tipo: 'solidario', contrato_id: b.id, nome: 'Fulano Teste', resposta: { ip: '1.1.1.1' } },
  ] }, 't');
  assert.deepEqual(P.partesDaPessoa(d, CPF).destinos.map((x) => x.chave).sort(), [`c${a.id}`, `s${b.id}`].sort());
  P.apagarPessoa(d, CPF, 't', hoje);
  assert.deepEqual(d.comunicados[0].destinos.map((x) => x.nome).sort(), ['Beltrano Teste', 'Beltrano Teste']);
});

test('FIC-02: reprovar uma ficha já aprovada grava a data de hoje como data da decisão (não a da aprovação)', () => {
  const { d, casa } = base();
  const recebida = T.C.somarDias(hoje, -60);
  const aprovada = T.C.somarDias(hoje, -45);
  const r = R.inserir(d, 'fichas', { inquilino_nome: 'Ana Exemplo', inquilino_email: 'ana@exemplo.com', data_recebida: recebida, situacao: 'Aprovada', decisao_data: aprovada, decisao_por: 'dono@exemplo.com.br', imoveis_ids: [casa.id], modo_imoveis: R.MODOS_FICHA[0] }, 't');
  const dados = { inquilino_nome: 'Ana Exemplo', inquilino_email: 'ana@exemplo.com', data_recebida: recebida, situacao: 'Reprovada', decisao_motivo: 'Renda insuficiente', decisao_data: aprovada, modo_imoveis: R.MODOS_FICHA[0], [`imovel_${casa.id}`]: true, bonificacao: false };
  const erros = {};
  CADASTROS.fichas.ajustar(dados, erros, r, form());
  assert.deepEqual(erros, {});
  assert.equal(dados.decisao_data, hoje);
  // data digitada de propósito (outra que não a da aprovação) continua valendo
  const outra = { ...dados, decisao_data: T.C.somarDias(hoje, -2) };
  CADASTROS.fichas.ajustar(outra, {}, r, form());
  assert.equal(outra.decisao_data, T.C.somarDias(hoje, -2));
});

test('FIC-04: contrato feito da ficha e ainda não assinado não se exclui (é a desistência); o assinado excluído solta a ficha', () => {
  const { d, casa } = base();
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Maria Teste', situacao: 'Aprovada', imoveis_ids: [casa.id], modo_imoveis: R.MODOS_FICHA[0], data_recebida: '2026-11-01', reserva_valor: 100000, reserva_data: '2026-11-01' }, 't');
  const c = R.inserir(d, 'contratos', { ...R.dadosDaFicha(d, f), imovel_id: casa.id, ficha_id: f.id, data_entrada: '2026-12-01' }, 't');
  R.atualizar(d, 'fichas', f.id, { documentos_no_contrato: c.id, comprovante_reserva: null }, 't', 'documentos levados');
  assert.match(motivoNaoExcluirContrato(d, c), /Desistiu antes de assinar/);
  R.atualizar(d, 'contratos', c.id, { doc_contrato_em: '2026-11-20' }, 't', 'assinado');
  assert.equal(motivoNaoExcluirContrato(d, c), null);
  R.excluirContrato(d, c.id, 't');
  assert.equal(R.buscar(d, 'fichas', f.id).documentos_no_contrato, null);
});

test('FIC-05: imóvel com ficha aberta não se exclui; imóvel que sumiu não fica como "falta o contrato"', () => {
  const { d, casa } = base();
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Maria Teste', situacao: 'Aprovada', imoveis_ids: [casa.id], modo_imoveis: R.MODOS_FICHA[0], data_recebida: '2026-11-01' }, 't');
  assert.match(motivoNaoExcluirImovel(d, casa), /ficha de Maria Teste/);
  // dado antigo: o imóvel já foi excluído antes da correção
  R.excluir(d, 'imoveis', casa.id, 't');
  assert.deepEqual(R.imoveisParaContrato(d, R.buscar(d, 'fichas', f.id)), []);
});

test('FIC-06: duas fichas com o mesmo nome no mesmo dia ganham pastas diferentes', () => {
  const um = { inquilino_nome: 'Maria Souza', data_recebida: '2026-11-12' };
  assert.equal(pastaFichaLivre(um, []), nomePastaFicha(um));
  const outra = pastaFichaLivre(um, [{ ...um, pasta: nomePastaFicha(um) }]);
  assert.notEqual(outra, nomePastaFicha(um));
  assert.match(outra, /^Maria Souza \(ficha 12-11-2026 2\)$/);
  assert.match(pastaFichaLivre(um, [{ ...um, pasta: nomePastaFicha(um) }, { ...um, pasta: outra }]), /12-11-2026 3\)$/);
});

test('FIC-08: na página pública, valor com ponto decimal ("2500.50") não vira 100 vezes maior', () => {
  const fonte = fs.readFileSync(new URL('../nuvem/ficha-publica.mjs', import.meta.url), 'utf8');
  const ini = fonte.indexOf('const centavos = (t) => {');
  const fim = fonte.indexOf('\n  };', ini);
  assert.ok(ini > 0 && fim > ini, 'achei a conta na página');
  const centavos = new Function(`${fonte.slice(ini, fim + 5)} return centavos;`)();
  assert.equal(centavos('2500.50'), 250050);
  assert.equal(centavos('2.500,50'), 250050);
  assert.equal(centavos('2.500'), 250000);
  assert.equal(centavos('2500'), 250000);
  assert.equal(centavos('R$ 1.234.567,8'), 123456780);
  assert.equal(centavos(''), null);
});

test('FIC-09: "e-mail a todos" e "WhatsApp a todos" deixam de fora quem já saiu (como o lembrete)', () => {
  const { d, casa } = base();
  const ativo = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Ativo Teste', inquilino_email: 'ativo@exemplo.com', data_entrada: '2026-01-10', ativo: true }, 't');
  const saiu = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Saiu Teste', inquilino_email: 'saiu@exemplo.com', data_entrada: '2024-01-10', data_saida: '2025-01-10', ativo: false }, 't');
  const semEmail = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Sem Email', data_entrada: '2026-01-10', ativo: true }, 't');
  const saiuSem = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Saiu Sem Email', data_entrada: '2024-01-10', data_saida: '2025-01-10', ativo: false }, 't');
  const com = { destinos: [ativo, saiu, semEmail, saiuSem].map((c) => ({ chave: `c${c.id}`, tipo: 'inquilino', contrato_id: c.id, nome: c.inquilino_nome })) };
  const email = CM.filaDoEnvio(d, com, 'email');
  assert.deepEqual(email.alvos.map((x) => x.nome), ['Ativo Teste']);
  assert.deepEqual(email.sem.map((x) => x.nome), ['Sem Email']);
  assert.equal(email.fora, 2);
  assert.deepEqual(CM.filaDoEnvio(d, com, 'whats').alvos.map((x) => x.nome), ['Ativo Teste', 'Sem Email']);
});

test('DOC-01: o recibo da reserva tirado do contrato não abre o e-mail da ficha cadastral', () => {
  assert.equal(emailDoRecibo('reserva', { contrato: { id: 1 } }), null);
  assert.equal(emailDoRecibo('reserva', { ficha: { id: 1 } }), 'ficha_envio');
  assert.equal(emailDoRecibo('garantia', { contrato: { id: 1 } }), 'contrato_assinado');
  assert.equal(emailDoRecibo('notificacao', { contrato: { id: 1 }, id: 3 }), 'notificacao_envio');
});

test('DOC-02: o PDF da notificação assinado pelo PC vira a assinada; pedido de antes da mudança do texto, não', () => {
  const { d, casa } = base();
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Carlos Teste', data_entrada: '2026-01-10', ativo: true }, 't');
  const n = R.inserir(d, 'notificacoes', { contrato_id: c.id, data: hoje, data_limite: hoje, assunto: 'Barulho', texto: 'Texto antigo', situacao: 'Rascunho', arquivo_assinado: null }, 't');
  const antes = new Date(Date.now() - 60000).toISOString();
  R.atualizar(d, 'notificacoes', n.id, { texto: 'Texto novo' }, 't', 'rascunho alterado');
  assert.equal(R.ligarNotificacaoAssinada(d, n.id, 'notificacao - assinado.pdf', antes, 't'), false, 'o assinado é do texto antigo');
  assert.equal(R.buscar(d, 'notificacoes', n.id).arquivo_assinado, null);
  const depois = new Date(Date.now() + 1000).toISOString();
  assert.equal(R.ligarNotificacaoAssinada(d, n.id, 'notificacao - assinado.pdf', depois, 't'), true);
  assert.equal(R.buscar(d, 'notificacoes', n.id).arquivo_assinado, 'notificacao - assinado.pdf');
  assert.ok(R.arquivosReferenciados(d).some((a) => a.nome === 'notificacao - assinado.pdf'), 'o arquivo fica referenciado (não sai como solto)');
  // já com a assinada: não troca
  assert.equal(R.ligarNotificacaoAssinada(d, n.id, 'outro - assinado.pdf', depois, 't'), false);
});
