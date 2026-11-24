// Termo de aceite da reserva (decisões do dono de 2026-11-24): regras configuráveis (100%, 0 dias, 3 dias úteis, 7 dias, 5 dias
// úteis; também com 40% e 7 dias, se o dono mudar), quanto devolver, prazos e alertas, o texto do termo e o PDF, o e-mail, o aceite pela nuvem (código no e-mail, prova)
// e a correção pela pessoa na ficha pela internet (trocar e apagar documentos, só antes da conferência, com o registro).
// Dados fictícios (CPF e CNPJ de teste).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as CR from '../docs/js/config-regras.js';
import { dadosDoEmail } from '../docs/js/email-dados.js';
import { modeloEmail, montarEmail } from '../docs/js/modelos-email.js';
import * as REC from '../docs/js/recibos.js';
import * as R from '../docs/js/regras.js';
import * as TR from '../docs/js/termo-reserva.js';
import * as AR from '../nuvem/aceite-reserva.mjs';
import { textosDoAviso } from '../nuvem/avisos-ficha.mjs';
import * as FP from '../nuvem/ficha-publica.mjs';
import * as W from '../nuvem/worker.mjs';
import { r2Falso } from './r2-falso.mjs';

function base(extra = {}) {
  const d = R.bancoVazio();
  R.normalizar(d);
  R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true,
    conta_deposito: 'ANK ADMINISTRADORA · Banco 336 (C6) · Ag. 0001 · C/C 1234-5 · Pix CNPJ 11.222.333/0001-81', email_contato: 'administracao@exemplo.com.br' }, 'j');
  const i = R.inserir(d, 'imoveis', { nome: 'Flores 3', endereco: 'Rua das Flores, 120', complemento: 'Apto 3', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }, 'j');
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física', inquilino_email: 'maria@exemplo.com.br',
    imoveis_ids: [i.id], situacao: 'Em análise', data_recebida: '2026-12-08', aluguel_inicial: 200000, desconto_pontualidade_percentual: 10, dia_vencimento: 10,
    garantia_tipo: 'Fiador', prazo_meses: 30, conta_iptu: 'Por conta do inquilino', iptu_estimado: 15000, conta_seguro: 'Por conta do inquilino', seguro_estimado: 30000,
    reserva_combinada: 50000, requisitos: 'Renda de pelo menos 3 vezes o aluguel', ...extra }, 'j');
  return { d, i, f };
}
/** Aceite como o que vem da nuvem (``condicoes``: as do dia do aceite; padrão: as de agora, 100% e 0 dias). */
const aceite = (em = '2026-12-09T13:00:00.000Z', condicoes = R.condicoesDaReservaAgora()) => ({ em, email: 'maria@exemplo.com.br', ip: '203.0.113.7', aparelho: 'Teste/1.0', texto_aceito: 'TERMO DE ACEITE DA RESERVA DE IMÓVEL\n\nTexto.\n\nDeclaração: Li e concordo.', texto_sha256: 'a'.repeat(64), condicoes, reserva_valor: 50000 });
/** Termo aceito com 40% e 7 dias (se o dono mudar a regra). */
const COND_40_7 = { retencao_pct: 40, dias_arrependimento: 7, dias_uteis_documentos: 3, dias_validade: 7, dias_uteis_devolucao: 5 };
const aceite40 = () => aceite(undefined, COND_40_7);

test('regras novas: padrões do dono (100%, 0 dias, 3 dias úteis, 7 dias, 5 dias úteis), com explicação, consequência, risco e lei', () => {
  const chaves = ['reserva_retencao_pct', 'reserva_dias_arrependimento', 'reserva_dias_uteis_documentos', 'reserva_dias_validade', 'reserva_dias_uteis_devolucao'];
  assert.deepEqual(chaves.map((k) => CR.PADRAO_SISTEMA[k]), [100, 0, 3, 7, 5]);
  for (const k of chaves) {
    const def = CR.definicaoRegra(k);
    assert.equal(def.grupo, 'reserva');
    assert.ok(def.explica && def.consequencia && def.lei, k);
  }
  assert.match(CR.definicaoRegra('reserva_retencao_pct').lei, /418.*420.*413.*51/s);
  assert.match(CR.definicaoRegra('reserva_retencao_pct').consequencia, /juiz pode reduzir.*413.*51.*10% a 25%/s, 'o risco fica registrado na regra');
  assert.match(CR.definicaoRegra('reserva_dias_arrependimento').consequencia, /decisões isoladas que aplicam o art\. 49/);
  assert.equal(CR.limparValorRegra('reserva_dias_arrependimento', 0), 0);
});

test('devolução pelo padrão (100%, 0 dias): desistência depois do depósito não devolve nada; reprovada devolve tudo', () => {
  const { d, f } = base({ reserva_valor: 50000, reserva_data: '2026-12-10' });
  assert.deepEqual(R.prazosDaReserva(f), { documentos_ate: '2026-12-15', vale_ate: '2026-12-17', arrependimento_ate: null }, 'quinta 10/12 + 3 dias úteis = terça 15/12; sem prazo de devolução total');
  assert.equal(R.devolucaoDaReserva(f, { data: '2026-12-10' }).devolver, 50000, 'sem o termo aceito: devolve tudo');
  R.guardarAceiteReserva(d, f.id, aceite(), 'j');
  const dv = R.devolucaoDaReserva(R.buscar(d, 'fichas', f.id), { data: '2026-12-10' });
  assert.deepEqual([dv.devolver, dv.reter], [0, 50000], 'no próprio dia do depósito já não devolve');
  assert.match(dv.motivo, /a empresa fica com a reserva inteira \(R\$ 500,00\)/);
  // sem os documentos em 3 dias úteis: conta como desistência e a reserva fica com a empresa (dono, 24/11)
  const alerta = R.pendenciasDasFichas(d, '2026-12-16').find((x) => /prazo dos documentos/.test(x.texto));
  assert.match(alerta.texto, /acabou em 15\/12\/2026 .*pelo termo, conta como desistência \(a reserva fica com a empresa\)/);
  R.atualizar(d, 'fichas', f.id, { situacao: 'Desistiu', decisao_data: '2026-12-11' }, 'j');
  assert.equal(R.devolucaoPendente(R.buscar(d, 'fichas', f.id)), false, 'nada a devolver: não fica "devolver a reserva"');
  assert.ok(!R.pendenciasDasFichas(d, '2026-12-30').some((x) => /devolução/.test(x.texto)));
  R.atualizar(d, 'fichas', f.id, { situacao: 'Reprovada', decisao_motivo: 'renda' }, 'j');
  assert.equal(R.devolucaoDaReserva(R.buscar(d, 'fichas', f.id)).devolver, 50000, 'reprovada: devolve tudo');
  R.atualizar(d, 'fichas', f.id, { reprovada_conferencia: true }, 'j');
  assert.equal(R.devolucaoDaReserva(R.buscar(d, 'fichas', f.id)).devolver, 0, 'informação que não correspondeu à realidade conta como desistência');
});

test('devolução com 40% e 7 dias (se o dono mudar a regra): em até 7 dias devolve tudo; depois devolve R$ 300,00 e fica R$ 200,00', () => {
  const { d, f } = base({ reserva_valor: 50000, reserva_data: '2026-12-10' });
  R.guardarAceiteReserva(d, f.id, aceite40(), 'j');
  assert.equal(R.prazosDaReserva(R.buscar(d, 'fichas', f.id)).arrependimento_ate, '2026-12-17');
  const g = R.buscar(d, 'fichas', f.id);
  assert.equal(R.devolucaoDaReserva(g, { data: '2026-12-17' }).devolver, 50000, 'no 7º dia ainda devolve tudo');
  const depois = R.devolucaoDaReserva(g, { data: '2026-12-18' });
  assert.deepEqual([depois.devolver, depois.reter, depois.integral], [30000, 20000, false]);
  assert.match(depois.motivo, /40% \(R\$ 200,00\)/);
  R.atualizar(d, 'fichas', f.id, { situacao: 'Reprovada', decisao_data: '2026-12-20', decisao_motivo: 'renda' }, 'j');
  assert.equal(R.devolucaoDaReserva(R.buscar(d, 'fichas', f.id)).devolver, 50000, 'reprovada: devolve tudo');
  R.atualizar(d, 'fichas', f.id, { reprovada_conferencia: true }, 'j');
  assert.equal(R.devolucaoDaReserva(R.buscar(d, 'fichas', f.id)).devolver, 30000, 'dado que não se confirmou conta como desistência');
  // o termo vale o % do dia do aceite: mudar a regra depois não muda o que foi aceito
  R.salvarRegrasSistema(d, { reserva_retencao_pct: 20 }, 'admin');
  try {
    assert.equal(R.devolucaoDaReserva(R.buscar(d, 'fichas', f.id)).devolver, 30000);
    assert.equal(R.condicoesDaReservaAgora().retencao_pct, 20);
  } finally { CR.usarRegras(null); }
  assert.equal(R.devolverReservaAte(R.buscar(d, 'fichas', f.id)), '2026-12-28', '5 dias úteis da decisão (25/12 é feriado)');
});

test('alertas do Painel: prazo dos documentos sem documento marcado, reserva vencida e devolução fora do prazo', () => {
  const { d, f } = base({ reserva_valor: 50000, reserva_data: '2026-12-10' });
  R.guardarAceiteReserva(d, f.id, aceite40(), 'j');
  assert.deepEqual(R.pendenciasDasFichas(d, '2026-12-15').map((x) => x.texto).filter((t) => /prazo|segurava/.test(t)), [], 'no último dia ainda não avisa');
  assert.ok(R.pendenciasDasFichas(d, '2026-12-16').some((x) => /prazo dos documentos acabou em 15\/12\/2026/.test(x.texto)));
  R.atualizar(d, 'fichas', f.id, { doc_pessoais: true, doc_renda: true, doc_residencia: true }, 'j');
  assert.ok(!R.pendenciasDasFichas(d, '2026-12-16').some((x) => /documentos/.test(x.texto)));
  assert.ok(R.pendenciasDasFichas(d, '2026-12-18').some((x) => /segurava o imóvel até 17\/12\/2026/.test(x.texto)));
  R.atualizar(d, 'fichas', f.id, { situacao: 'Desistiu', decisao_data: '2026-12-21' }, 'j');
  const p = R.pendenciasDasFichas(d, '2026-12-30').find((x) => /devolução/.test(x.texto));
  assert.match(p.texto, /de R\$ 300,00 da reserva de R\$ 500,00 \(fica R\$ 200,00, como no termo\) \(o prazo era 29\/12\/2026\)/);
});

test('termo: condições do imóvel, reserva abatida do 1º aluguel, prazos, devolução e os documentos; sem a palavra "falso"', () => {
  const { d, f } = base();
  const t = REC.termoDaReserva(d, f);
  const texto = REC.textoDoTermo(t);
  assert.match(texto, /Imóvel: Rua das Flores, 120 – Apto 3|Imóvel: Rua das Flores, 120, Apto 3/);
  assert.match(texto, /Aluguel: R\$ 2\.000,00 por mês \(R\$ 1\.800,00 pagando até o vencimento\)/);
  assert.match(texto, /IPTU: .*cerca de R\$ 150,00 por mês/);
  assert.match(texto, /Seguro contra incêndio: .*cerca de R\$ 300,00 por ano/);
  assert.match(texto, /Vencimento: todo dia 10/);
  assert.match(texto, /Garantia: fiador com imóvel próprio/);
  assert.match(texto, /Renda de pelo menos 3 vezes o aluguel/);
  assert.match(texto, /Documento com foto e CPF/);
  assert.match(texto, /deposita R\$ 500,00 \(quinhentos reais\)/);
  assert.match(texto, /reservado para você por 7 dias/);
  assert.match(texto, /abatida do primeiro aluguel/);
  assert.match(texto, /3 dias úteis para preencher a ficha e mandar todos os documentos.*a reserva é cancelada/);
  assert.match(texto, /não for aprovada, devolvemos a reserva inteira/);
  assert.match(texto, /6\. Se você desistir depois do depósito, a reserva não é devolvida: os R\$ 500,00 ficam com a empresa, como sinal de arrependimento \(Código Civil, artigos 418 e 420\)/);
  assert.match(texto, /7\. Se, na conferência, alguma informação ou documento que você enviou não corresponder à realidade \(por exemplo: renda diferente da declarada, emprego que a empresa não confirma, documento com dados alterados ou de outra pessoa\), a proposta é encerrada e conta como desistência: vale a mesma regra da desistência acima\./);
  assert.match(texto, /8\. Quando houver devolução \(ficha não aprovada\), ela é feita em até 5 dias úteis da reprovação/);
  // o aviso em destaque vem logo depois da apresentação, antes das condições (antes de aceitar e de pagar)
  assert.ok(texto.indexOf('ATENÇÃO, LEIA ANTES DE ACEITAR E DE PAGAR: se você desistir depois de depositar, você perde a reserva inteira (R$ 500,00)') < texto.indexOf('CONDIÇÕES DA LOCAÇÃO'));
  assert.doesNotMatch(texto, /fraude/i);
  // com 40% e 7 dias (se o dono mudar a regra)
  R.salvarRegrasSistema(d, { reserva_retencao_pct: 40, reserva_dias_arrependimento: 7 }, 'admin');
  try {
    const t40 = REC.textoDoTermo(REC.termoDaReserva(d, f));
    assert.match(t40, /em até 7 dias do depósito, devolvemos a reserva inteira.*fica com 40% da reserva \(R\$ 200,00\).*restante \(R\$ 300,00\)/);
    assert.match(t40, /se você desistir depois de 7 dias do depósito, você perde R\$ 200,00 da reserva/);
  } finally { CR.usarRegras(null); }
  assert.match(texto, /CONTA PARA O DEPÓSITO DA RESERVA\nANK ADMINISTRADORA · Banco 336/);
  assert.doesNotMatch(texto, /fals/i, 'decisão do dono: não falar em documento falso no termo');
  // PDF antes do aceite: com a linha para assinar; depois do aceite: o texto aceito e a prova
  const antes = REC.montarRecibo(d, 'termo_reserva', { ficha: f }, '2026-12-09');
  assert.equal(antes.assinaturas.length, 1);
  R.guardarAceiteReserva(d, f.id, { ...aceite(), texto_aceito: `${texto}\n\nDeclaração: ${t.ciencia}` }, 'j');
  const depois = REC.montarRecibo(d, 'termo_reserva', { ficha: R.buscar(d, 'fichas', f.id) }, '2026-12-20');
  assert.equal(depois.titulo, 'TERMO DE ACEITE DA RESERVA DE IMÓVEL');
  assert.equal(depois.assinaturas.length, 0, 'aceite eletrônico');
  assert.equal(depois.data, '2026-12-09');
  assert.ok(depois.depois.some((x) => /e-mail confirmado|E-mail confirmado pelo código de 6 números enviado a este endereço: maria@exemplo.com.br\. Endereço de internet \(IP\): 203\.0\.113\.7/.test(x)));
  assert.ok(depois.depois.some((x) => /^Declaração aceita: Li as condições acima e concordo/.test(x)));
  assert.ok(depois.paragrafos.some((x) => /a reserva não é devolvida/.test(x)));
  assert.ok(depois.paragrafos.some((x) => /^ATENÇÃO, LEIA ANTES DE ACEITAR/.test(x)), 'o aviso aceito fica no PDF');
});

test('frase da desistência e termo de devolução de parte: citam o termo aceito', () => {
  const { d, f } = base({ reserva_valor: 50000, reserva_data: '2026-12-10' });
  assert.equal(REC.textoDesistencia(f), 'A reserva de R$ 500,00 é devolvida por inteiro, sem descontos.');
  const { d: d100, f: f100 } = base({ reserva_valor: 50000, reserva_data: '2026-12-10' });
  R.guardarAceiteReserva(d100, f100.id, aceite(), 'j');
  assert.equal(REC.textoDesistencia(R.buscar(d100, 'fichas', f100.id)), 'Se você desistir, a reserva de R$ 500,00 não é devolvida (fica com a empresa, como no termo da reserva).');
  R.guardarAceiteReserva(d, f.id, aceite40(), 'j');
  assert.equal(REC.textoDesistencia(R.buscar(d, 'fichas', f.id)), 'Se desistir até 17/12/2026, a reserva de R$ 500,00 volta por inteiro; depois, devolvemos R$ 300,00 da reserva de R$ 500,00 (ficam R$ 200,00, como no termo da reserva).');
  R.atualizar(d, 'fichas', f.id, { situacao: 'Desistiu', decisao_data: '2026-12-21', devolucao_data: '2026-12-22', devolucao_valor: 30000 }, 'j');
  const r = REC.montarRecibo(d, 'devolucao_reserva', { ficha: R.buscar(d, 'fichas', f.id) }, '2026-12-22');
  assert.ok(r.paragrafos.some((x) => /A diferença de R\$ 200,00 fica com a empresa, como no termo de aceite da reserva aceito em 09\/12\/2026/.test(x)));
  // LGPD: com parte retida, o termo aceito fica guardado como prova depois de apagados os dados pessoais
  const g = R.apagarDadosPessoaisDaFicha(d, f.id, 'j', '2027-04-01');
  assert.ok(g.aceite_reserva && g.aceite_reserva.texto_sha256);
  assert.equal(g.inquilino_cpf, null);
});

test('e-mail "Condições e termo da reserva": sem campo faltando, com o link desta aba e os valores do termo', () => {
  const { d, f } = base();
  TR.lembrarUrlDoAceite(f.id, { url: 'https://ficha.ankjck.com.br/reserva#chave', vence_em: '2099-12-16T12:00:00.000Z' });
  const e = montarEmail(modeloEmail(d, 'ficha_termo_reserva'), dadosDoEmail(d, { ficha: f }, {}, '2026-12-09'));
  assert.doesNotMatch(e.texto, /\[preencher/);
  assert.match(e.texto, /Valor: R\$ 500,00, abatido do 1º aluguel/);
  assert.match(e.texto, /- Se você desistir depois do depósito, a reserva não é devolvida/);
  assert.match(e.texto, /- Se, na conferência, alguma informação ou documento/);
  assert.ok(e.texto.indexOf('ATENÇÃO, LEIA ANTES DE ACEITAR E DE PAGAR') < e.texto.indexOf('CONDIÇÕES DA LOCAÇÃO'), 'o aviso vem logo no começo, antes das condições, do link e da conta');
  assert.match(e.texto, /https:\/\/ficha\.ankjck\.com\.br\/reserva#chave/);
  assert.match(e.texto, /- Renda de pelo menos 3 vezes o aluguel/);
  assert.match(e.texto, /Banco 336/);
  TR.esquecerUrlsDoAceite();
  const sem = montarEmail(modeloEmail(d, 'ficha_termo_reserva'), dadosDoEmail(d, { ficha: f }, {}, '2026-12-09'));
  assert.match(sem.texto, /Leia o termo anexo/);
  // modelo gravado antes: o trecho antigo do "ficha reprovada" passa a dizer os dias úteis
  d.modelos_email = [{ id: 1, chave: 'ficha_reprovada', texto: 'X [se reserva][se devolucao]a[senão]A reserva de {reserva} será devolvida em até 24 horas úteis, na conta de onde veio o depósito.[fim][fim]' }];
  assert.match(modeloEmail(d, 'ficha_reprovada').texto, /\{dias_devolucao\} dias úteis/);
});

test('pedido do link: termo, condições em números e a conta; WhatsApp com o valor e a validade', () => {
  const { d, f } = base();
  const p = TR.pedidoDoAceite(d, f);
  assert.equal(p.ficha_id, f.id);
  assert.equal(p.contexto.reserva_valor, 50000);
  assert.deepEqual(p.contexto.condicoes, { retencao_pct: 100, dias_arrependimento: 0, dias_uteis_documentos: 3, dias_validade: 7, dias_uteis_devolucao: 5 });
  assert.match(p.contexto.aviso, /^ATENÇÃO, LEIA ANTES DE ACEITAR E DE PAGAR/);
  assert.match(p.contexto.termo, /^TERMO DE ACEITE DA RESERVA DE IMÓVEL\n\n/);
  assert.doesNotThrow(() => AR.contextoValido(p.contexto), 'a nuvem aceita o que o sistema manda');
  assert.match(TR.textoWhatsappAceite(f, { url: 'https://x/reserva#k', vence_em: '2026-12-16T12:00:00.000Z' }), /\(R\$ 500,00, abatida do 1º aluguel\).*até 16\/12\/2026: https:\/\/x\/reserva#k/s);
});

// ---------------------------------------------------------------------------
// Nuvem: o aceite pelo link
// ---------------------------------------------------------------------------
const ERP = 'http://localhost:8787';
const FICHA = 'https://ficha.ankjck.com.br';
function ambiente() {
  const env = { MODO_TESTE: '1', EMAIL_TESTE: 'dono@exemplo.com.br', ORIGEM: ERP, URL_FICHA: `${FICHA}/`, HOST_FICHA: 'ficha.ankjck.com.br', SIMULAR_GMAIL: '1', GMAIL_REMETENTE: 'administracao@exemplo.com.br', DADOS: r2Falso() };
  const equipe = (metodo, caminho, corpo, raiz = 'aceite-reserva') => W.atender(new Request(`${ERP}/api/${raiz}/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : typeof corpo === 'string' || corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo),
    headers: metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: ERP } : {},
  }), env);
  const avisos = [];
  const publico = (chave, metodo, caminho, corpo, cab = {}) => FP.atenderFicha(new Request(`${FICHA}/api/publico/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : typeof corpo === 'string' || corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo),
    headers: { ...(chave ? { 'X-Ficha-Token': chave } : {}), ...(metodo !== 'GET' ? { 'X-Ficha': '1', Origin: FICHA } : {}), 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'Teste/1.0', ...cab },
  }), env, { avisar: async (_env, reg, evento, detalhe) => { avisos.push([evento, detalhe || '']); } });
  return { env, equipe, publico, avisos };
}
async function saidas(fn) {
  const linhas = []; const velho = console.log;
  console.log = (...a) => { linhas.push(a.join(' ')); };
  try { await fn(); } finally { console.log = velho; }
  return linhas.join('\n');
}

test('aceite pelo link: página no endereço da ficha, código no e-mail, prova guardada, comprovante e aviso à equipe', async () => {
  const ctx = ambiente();
  const { d, f } = base();
  const r = await ctx.equipe('POST', 'link', TR.pedidoDoAceite(d, f));
  assert.equal(r.status, 200);
  const { url } = await r.json();
  assert.match(url, /^https:\/\/ficha\.ankjck\.com\.br\/reserva#[A-Za-z0-9_-]{43}$/);
  const chave = url.split('#')[1];
  const pagina = await FP.atenderFicha(new Request(`${FICHA}/reserva`), ctx.env);
  assert.equal(pagina.status, 200);
  assert.match(pagina.headers.get('Content-Security-Policy'), /script-src 'nonce-/);
  const lido = await (await ctx.publico(chave, 'GET', 'aceite')).json();
  assert.match(lido.contexto.termo, /a reserva não é devolvida/);
  assert.match(lido.contexto.aviso, /^ATENÇÃO, LEIA ANTES DE ACEITAR E DE PAGAR/, 'o aviso em destaque chega à página');
  assert.equal(lido.resposta, null);
  assert.equal((await ctx.publico(chave, 'POST', 'aceite/confirmar', { email: 'maria@exemplo.com.br', codigo: '123456', ciente: true })).status, 400, 'sem pedir o código');
  const log = await saidas(async () => assert.equal((await ctx.publico(chave, 'POST', 'aceite/codigo', { email: 'Maria@Exemplo.com.br' })).status, 200));
  const codigo = log.match(/Seu código de confirmação: (\d{6})/)[1];
  assert.equal((await ctx.publico(chave, 'POST', 'aceite/confirmar', { email: 'maria@exemplo.com.br', codigo, ciente: false })).status, 400, 'sem marcar "Li e concordo"');
  const errado = await ctx.publico(chave, 'POST', 'aceite/confirmar', { email: 'maria@exemplo.com.br', codigo: codigo === '000000' ? '111111' : '000000', ciente: true });
  assert.equal(errado.status, 400);
  let ok;
  const log2 = await saidas(async () => { ok = await ctx.publico(chave, 'POST', 'aceite/confirmar', { email: 'maria@exemplo.com.br', codigo, ciente: true }); });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).comprovante, true);
  assert.match(log2, /Comprovante: termo da reserva aceito/);
  assert.match(log2, /Termo da reserva aceito: Maria Souza/, 'aviso por e-mail à equipe');
  assert.equal((await ctx.publico(chave, 'POST', 'aceite/codigo', { email: 'maria@exemplo.com.br' })).status, 409, 'já aceito');
  const eq = await (await ctx.equipe('GET', `ler?ficha=${f.id}`)).json();
  assert.ok(!('hash' in eq.link) && !('codigo' in eq.link));
  assert.equal(eq.link.resposta.ip, '203.0.113.7');
  assert.equal(eq.link.resposta.texto_sha256, await AR.sha(eq.link.resposta.texto_aceito));
  assert.match(eq.link.resposta.texto_aceito, /\n\nDeclaração: Li as condições acima e concordo/);
  assert.equal(eq.link.resposta.condicoes.retencao_pct, 100);
  // de volta no sistema: o aceite vai para a ficha (uma vez) e o PDF sai com a prova
  assert.equal(R.guardarAceiteReserva(d, f.id, eq.link.resposta, 'j'), true);
  assert.equal(R.guardarAceiteReserva(d, f.id, eq.link.resposta, 'j'), false);
  const pdf = REC.montarRecibo(d, 'termo_reserva', { ficha: R.buscar(d, 'fichas', f.id) });
  assert.ok(pdf.depois.some((x) => x.includes(eq.link.resposta.texto_sha256)));
  assert.equal((await ctx.equipe('POST', 'encerrar', { ficha_id: f.id })).status, 200);
  assert.equal((await ctx.publico(chave, 'GET', 'aceite')).status, 404, 'link encerrado');
  assert.equal((await ctx.equipe('POST', 'link', { ficha_id: f.id, contexto: { ...TR.pedidoDoAceite(d, f).contexto, condicoes: { retencao_pct: 40, dias_arrependimento: 61 } } })).status, 400, 'condições inválidas (prazo fora da faixa)');
});

// ---------------------------------------------------------------------------
// Ficha pela internet: a pessoa vê o que mandou e corrige (decisão do dono de 2026-11-24)
// ---------------------------------------------------------------------------
const PASTA = 'arquivos/Fichas em analise/Maria Souza (ficha 08-12-2026)';
const FORM = [{ secao: 'Dados' }, { nome: 'inquilino_nome', rotulo: 'Nome completo', tipo: 'texto', obrig: true }, { nome: 'inquilino_profissao', rotulo: 'Profissão', tipo: 'texto' }];
const PDF = new TextEncoder().encode('%PDF-1.4 teste');
const PDF2 = new TextEncoder().encode('%PDF-1.4 outro');

test('correção pela pessoa: troca e apaga documento, reenvia dados com o que mudou; conferido trava; a equipe é avisada a cada passo', async () => {
  const ctx = ambiente();
  const r = await ctx.equipe('POST', 'link', { ficha_id: 9, pessoa: 'interessado', pasta: PASTA, formulario: FORM, valores: { inquilino_nome: 'Maria Souza' },
    contexto: { empresa: 'ANK', nome: 'Maria Souza', imovel: 'Rua das Flores, 120', reserva: 'R$ 500,00', devolucao: 'Se desistir até 17/12/2026, a reserva de R$ 500,00 volta por inteiro.', documentos: ['Documento com foto e CPF (RG ou CNH)', '3 últimos holerites'], dica: 'PDF' } }, 'ficha-online');
  const chave = (await r.json()).url.split('#')[1];
  const env = ctx.env;
  // dados: 1º envio e a correção (guarda o que mudou)
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'Maria Souza', inquilino_profissao: 'Professora' }, declaracao: true })).status, 200);
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'Maria Souza', inquilino_profissao: 'Engenheira' }, declaracao: true })).status, 200);
  // documentos: manda dois, troca um, apaga o outro
  const um = await (await ctx.publico(chave, 'PUT', 'ficha/arquivo?documento=3%20%C3%BAltimos%20holerites&nome=errado.pdf', PDF)).json();
  const dois = await (await ctx.publico(chave, 'PUT', 'ficha/arquivo?documento=outro&nome=sem-querer.pdf', PDF)).json();
  assert.match(um.arquivo, /^link-3-ultimos-holerites-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}\.pdf$/);
  assert.equal((await ctx.publico(chave, 'PUT', `ficha/arquivo?documento=3%20%C3%BAltimos%20holerites&nome=certo.pdf&troca=${um.arquivo}`, PDF2)).status, 200);
  assert.ok(!env.DADOS.m.has(`${PASTA}/${um.arquivo}`), 'o trocado sai da pasta');
  assert.ok([...env.DADOS.m.keys()].some((k) => k.startsWith('lixeira/') && k.endsWith(um.arquivo)), 'e fica na lixeira');
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/apagar', { arquivo: dois.arquivo })).status, 200);
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/apagar', { arquivo: dois.arquivo })).status, 404, 'já apagado');
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/apagar', { arquivo: '../../x.pdf' })).status, 404, 'nome fora do padrão');
  const lido = await (await ctx.publico(chave, 'GET', 'ficha')).json();
  assert.deepEqual(lido.arquivos.map((a) => a.nome_original), ['certo.pdf']);
  assert.equal(lido.apagados, 2);
  assert.equal(lido.envios, 2);
  assert.equal(lido.valores.inquilino_profissao, 'Engenheira');
  assert.deepEqual(ctx.avisos.map((x) => x[0]), ['enviou', 'enviou', 'documento', 'documento', 'trocou', 'apagou']);
  // a equipe vê o registro do que foi trocado e o que mudou nos dados
  const l = (await (await ctx.equipe('GET', 'lista?ficha=9', undefined, 'ficha-online')).json()).links[0];
  assert.deepEqual(l.respostas.at(-1).mudou, ['inquilino_profissao']);
  assert.equal(l.arquivos.find((a) => a.arquivo === um.arquivo).substituido_por.startsWith('link-3-ultimos-holerites'), true);
  assert.ok(l.arquivos.find((a) => a.arquivo === dois.arquivo).apagado_em);
  assert.ok(l.eventos.some((e) => /documento trocado pelo link: 3 últimos holerites \(errado\.pdf → certo\.pdf\)/.test(e.texto)));
  // conferido pela equipe: não troca mais; documento novo ainda entra; "Deixar corrigir" libera
  assert.equal((await ctx.equipe('POST', 'atualizar', { ficha_id: 9, pessoa: 'interessado', conferido: true }, 'ficha-online')).status, 200);
  const certo = (await (await ctx.publico(chave, 'GET', 'ficha')).json()).arquivos[0].arquivo;
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/apagar', { arquivo: certo })).status, 409);
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'Maria' }, declaracao: true })).status, 409);
  assert.equal((await ctx.publico(chave, 'PUT', `ficha/arquivo?documento=outro&nome=x.pdf&troca=${certo}`, PDF)).status, 409);
  assert.equal((await ctx.publico(chave, 'PUT', 'ficha/arquivo?documento=outro&nome=novo.pdf', PDF)).status, 200, 'documento novo, sim');
  assert.equal((await ctx.equipe('POST', 'atualizar', { ficha_id: 9, pessoa: 'interessado', liberar: true }, 'ficha-online')).status, 200);
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/apagar', { arquivo: certo })).status, 200);
});

test('avisos: a equipe recebe a cada documento, troca, apagamento e correção de dados (com os campos)', () => {
  const reg = { pessoa: 'interessado', contexto: { nome: 'Maria Souza', imovel: 'Rua das Flores, 120', devolucao: 'Se desistir até 17/12/2026, a reserva de R$ 500,00 volta por inteiro; depois, devolvemos R$ 300,00 (ficam R$ 200,00, como no termo da reserva).' },
    formulario: FORM, respostas: [{ em: 'a' }, { em: 'b', mudou: ['inquilino_profissao'] }], arquivos: [{}, {}] };
  assert.match(textosDoAviso(reg, 'documento', 'RG').equipe.titulo, /mandou um documento/);
  assert.match(textosDoAviso({ ...reg, arquivos: [{}] }, 'documento', 'RG').equipe.titulo, /começou a mandar/);
  assert.match(textosDoAviso(reg, 'trocou', 'RG').equipe.titulo, /trocou um documento/);
  assert.match(textosDoAviso(reg, 'apagou', 'RG').equipe.titulo, /apagou um documento/);
  const corr = textosDoAviso(reg, 'enviou');
  assert.match(corr.equipe.titulo, /corrigiu os dados/);
  assert.match(corr.equipe.texto, /Mudou: Profissão/);
  assert.equal(corr.pessoa, null, 'a pessoa só recebe o e-mail no 1º envio');
  assert.match(textosDoAviso(reg, 'desistiu').pessoa.texto, /depois, devolvemos R\$ 300,00/);
});
