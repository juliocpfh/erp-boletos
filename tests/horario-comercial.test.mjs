// Horário comercial para falar com inquilinos e fiadores e o que acontece com os e-mails agendados (pedido do dono de 25/11/2026).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as B from '../docs/js/brasilia.js';
import * as C from '../docs/js/calculos.js';
import * as AG from '../docs/js/agendados.js';
import * as R from '../docs/js/regras.js';
import { usarRegras } from '../docs/js/config-regras.js';

// instante de Brasília (UTC-3) em texto: '2026-11-27 21:30' → Date
const em = (t) => new Date(`${t.replace(' ', 'T')}:00-03:00`);
const proximo = (t) => C.horarioComercialAgora(em(t));

test('horário comercial: segunda a sexta 8h–18h, sábado 8h–12h, domingo e feriado não', () => {
  assert.equal(proximo('2026-11-25 12:00').dentro, true, 'quarta ao meio-dia');
  assert.equal(proximo('2026-11-25 08:00').dentro, true, '8h em ponto já é horário');
  assert.equal(proximo('2026-11-25 18:00').dentro, false, '18h em ponto já é fora');
  assert.equal(proximo('2026-11-28 11:59').dentro, true, 'sábado de manhã');
  assert.equal(proximo('2026-11-29 10:00').dentro, false, 'domingo');
  assert.equal(proximo('2026-11-20 10:00').dentro, false, '20/11 é feriado nacional');
});

test('próximo horário comercial: sexta 21h30 → sábado 8h; sábado 13h → segunda 8h; véspera de feriado', () => {
  const sexta = proximo('2026-11-27 21:30');
  assert.equal(sexta.quando.toISOString(), '2026-11-28T11:00:00.000Z');
  assert.equal(sexta.rotulo, 'amanhã (sábado), 28/11, às 8h');
  const sabado = proximo('2026-11-28 13:00');
  assert.equal(sabado.quando.toISOString(), '2026-11-30T11:00:00.000Z');
  assert.equal(sabado.rotulo, 'segunda, 30/11, às 8h');
  // quinta 19/11/2026 às 19h: sexta 20/11 é feriado (Consciência Negra) → sábado 21/11
  assert.equal(proximo('2026-11-19 19:00').quando.toISOString(), '2026-11-21T11:00:00.000Z');
  // quinta 24/12/2026 às 18h30: Natal na sexta → sábado 26/12
  assert.equal(proximo('2026-12-24 18:30').rotulo, 'sábado, 26/12, às 8h');
  // de madrugada: o mesmo dia às 8h
  assert.equal(proximo('2026-11-25 06:10').rotulo, 'hoje, 25/11, às 8h');
  // domingo à noite → segunda
  assert.equal(proximo('2026-11-29 22:00').rotulo, 'amanhã (segunda), 30/11, às 8h');
});

test('horário comercial pelas regras: sábado sem expediente e feriado da cidade', () => {
  const h = { inicio: 8, fim: 18, sabadoFim: 0, ehFeriado: (x) => x === '2026-11-30' };
  // sexta 21h30, sem sábado e com segunda 30/11 feriado da cidade → terça 01/12
  const p = B.proximoHorarioComercial(em('2026-11-27 21:30'), h);
  assert.equal(p.data, '2026-12-01');
  assert.equal(p.hora, 8);
  assert.equal(B.proximoHorarioComercial(em('2026-11-25 19:00'), { ...h, fim: 24 }).dentro, true, 'fim 24: a noite toda conta');
  usarRegras({ config_regras: [{ chave: 'inicio_expediente_hora', valor: 9 }, { chave: 'fim_expediente_sabado_hora', valor: 0 }] });
  try {
    assert.equal(proximo('2026-11-25 08:30').rotulo, 'hoje, 25/11, às 9h');
    assert.equal(proximo('2026-11-27 21:30').rotulo, 'segunda, 30/11, às 9h');
    assert.equal(C.textoHorarioComercial(), 'segunda a sexta, das 9h às 18h (sábado sem expediente)');
  } finally { usarRegras(null); }
  // o prazo dado fora do expediente (regra da #421) continua igual
  assert.equal(C.inicioDoPrazoAgora(em('2026-11-24 21:45')), '2026-11-25');
});

test('registro do envio: sempre a data de Brasília (21h30 de 24/11 fica 24/11)', () => {
  assert.equal(C.hojeBrasilia(new Date('2026-11-25T00:30:00Z')), '2026-11-24');
});

test('Painel: avisa os agendados e o que falhou', () => {
  const lista = [
    { id: 'a', situacao: 'agendado', quando: '2026-11-28T11:00:00.000Z', para: 'ana@exemplo.com.br', descricao: 'Boleto por e-mail · Ana' },
    { id: 'b', situacao: 'falhou', quando: '2026-11-26T11:00:00.000Z', para: 'bruno@exemplo.com.br', descricao: 'Notificação · Bruno', erro: 'A autorização do Gmail venceu ou foi retirada.' },
    { id: 'c', situacao: 'enviado', quando: '2026-11-25T11:00:00.000Z', para: 'x@exemplo.com.br' },
  ];
  const av = AG.avisosDoPainel(lista);
  assert.equal(av.length, 2);
  assert.equal(av[0].tipo, 'erro');
  assert.match(av[0].texto, /1 e-mail agendado não saiu: Notificação · Bruno \(para bruno@exemplo\.com\.br\): A autorização do Gmail venceu/);
  assert.match(av[1].texto, /1 e-mail agendado: o próximo sai sábado, 28\/11\/2026, às 08:00/);
  assert.deepEqual(AG.avisosDoPainel([]), []);
});

test('efeitos do agendado que saiu: notificação, régua e comunicado, uma vez só; cancelar devolve a régua à lista', () => {
  const d = R.normalizar({});
  const c = R.inserir(d, 'contratos', { inquilino_nome: 'Ana Teste', ativo: true }, 'teste', null);
  const n = R.inserir(d, 'notificacoes', { contrato_id: c.id, data: '2026-11-24', situacao: 'Rascunho', data_limite: '2026-12-04' }, 'teste', null);
  const dec = R.inserir(d, 'regua_emails', { cobranca_id: 9, contrato_id: c.id, dias: 1, situacao: 'agendado', data: '2026-11-24' }, 'teste', null);
  const com = R.inserir(d, 'comunicados', { titulo: 'Contatos', destinos: [{ chave: `c${c.id}`, nome: 'Ana Teste', agendado_id: 'ag3' }] }, 'teste', null);
  // a nuvem gravou os envios (data de Brasília do envio)
  R.inserir(d, 'envios_email', { data: '2026-11-25', chave: 'notificacao_envio', contrato_id: c.id, como: 'enviado', agendado_id: 'ag1', efeito: { tipo: 'notificacao', notificacao_id: n.id } }, 'nuvem', null);
  R.inserir(d, 'envios_email', { data: '2026-11-25', chave: 'cobranca_depois', contrato_id: c.id, como: 'enviado', agendado_id: 'ag2', efeito: { tipo: 'regua', decisao_id: dec.id } }, 'nuvem', null);
  R.inserir(d, 'envios_email', { data: '2026-11-25', chave: 'comunicado', contrato_id: c.id, como: 'enviado', agendado_id: 'ag3', enviado_em: '2026-11-25T11:00:05.000Z', efeito: { tipo: 'comunicado', comunicado_id: com.id, destino: `c${c.id}`, campo: 'email_em' } }, 'nuvem', null);
  assert.equal(AG.efeitosPendentes(d).length, 3);
  assert.equal(AG.aplicarEfeitos(d, 'teste'), 3);
  assert.equal(R.buscar(d, 'notificacoes', n.id).enviada_em, '2026-11-25', 'o prazo corre do dia em que saiu');
  assert.equal(R.buscar(d, 'regua_emails', dec.id).situacao, 'enviado');
  const destino = R.buscar(d, 'comunicados', com.id).destinos[0];
  assert.equal(destino.email_em, '2026-11-25T11:00:05.000Z');
  assert.equal(destino.agendado_id, undefined);
  assert.equal(AG.aplicarEfeitos(d, 'teste'), 0, 'não repete');
  // cancelado na nuvem: a decisão "agendado" da régua sai e o e-mail volta à fila
  const dec2 = R.inserir(d, 'regua_emails', { cobranca_id: 10, contrato_id: c.id, dias: 1, situacao: 'agendado', data: '2026-11-24' }, 'teste', null);
  assert.equal(AG.desfazerAgendamento(d, { efeito: { tipo: 'regua', decisao_id: dec2.id } }, 'ag9', 'teste'), true);
  assert.equal(R.buscar(d, 'regua_emails', dec2.id), undefined);
});
