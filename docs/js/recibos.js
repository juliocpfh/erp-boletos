// Recibos e termos de quitação da ficha, da entrada e da saída (pedido do dono em 2026-11-13): recibo da reserva, termo de
// devolução da reserva, recibo da caução ou do depósito de garantia e termo de entrega do imóvel, acerto final e quitação.
// Funções puras (rodam no Node, tests/recibos.test.mjs): devolvem o texto do documento; a tela (telas/documentos.js) desenha,
// imprime e faz o PDF, e a janela do e-mail (telas/emails.js) anexa o PDF junto com o comprovante do banco.
//
// Base legal (revisão em documentacao/REVISAO_JURIDICA_CONTRATO.md, seção F):
// - Quem paga tem direito à quitação regular, com o valor, a dívida, quem pagou, o tempo e o lugar e a assinatura de quem
//   recebe (Código Civil, arts. 319 e 320).
// - O locador deve dar recibo discriminado do que o locatário paga; é proibida a quitação genérica (Lei 8.245/91, art. 22, VI).
// - Caução em dinheiro: até 3 aluguéis, em caderneta de poupança, com os rendimentos para o locatário (Lei 8.245/91, art. 38, § 2º).
// - Receber as chaves não dá quitação: o locatário responde pelo estado do imóvel e pelos débitos até a entrega (Lei 8.245/91,
//   art. 23, III); a vistoria de saída e o acerto final vêm depois (revisão jurídica, B3 e B4).
// - Documentos pessoais da ficha reprovada são apagados; os comprovantes de dinheiro ficam (LGPD, art. 16, I).
import * as C from './calculos.js';
import * as K from './contratos.js';
import * as CR from './config-regras.js';
import * as R from './regras.js';

const PJ = 'Pessoa jurídica (empresa)';

/** Os documentos que o sistema emite, na ordem das etapas. */
export const TIPOS_RECIBO = {
  termo_reserva: 'Termo de aceite da reserva',
  reserva: 'Recibo da reserva',
  devolucao_reserva: 'Termo de devolução da reserva',
  garantia: 'Recibo da garantia',
  devolucao_garantia: 'Recibo da devolução da garantia',
  devolucao_chaves: 'Termo de devolução das chaves',
  quitacao: 'Termo de quitação',
  acordo: 'Termo de confissão de dívida e acordo',
  notificacao: 'Notificação ao inquilino',
  ficha: 'Ficha cadastral',
  ficha_fiador: 'Ficha cadastral do fiador',
};

const documentoDe = (p, campo = 'inquilino_cpf', tipo = p.inquilino_tipo) => (p[campo] ? `${tipo === PJ ? 'CNPJ' : 'CPF'} ${p[campo]}` : '');
const pessoa = (nome, doc) => [nome, doc].filter(Boolean).join(', ');

/** Imóvel do documento: o do contrato, ou o primeiro de interesse da ficha. */
function imovelDe(d, alvo) {
  if (alvo.contrato) return R.buscar(d, 'imoveis', alvo.contrato.imovel_id) || null;
  return (alvo.ficha.imoveis_ids || []).map((id) => R.buscar(d, 'imoveis', id)).find(Boolean) || null;
}

/** Endereço por extenso. Ex.: "Rua Professor Nilo Brandão, 117, Apto 02, São Lourenço, Curitiba/PR". */
function enderecoDe(d, i) {
  if (!i) return '';
  return [R.enderecoCompleto(i), i.bairro, K.cidadeUfDoImovel(d, i)].filter(Boolean).join(', ');
}

/** Empresa que recebe e assina (a mesma dos contratos: a ANK, ou as empresas do imóvel). */
function emitenteDe(d, alvo, i) {
  const base = alvo.contrato || { imovel_id: i ? i.id : null };
  return K.locadorasDoContrato(d, base)[0] || {};
}

/** Itens da proposta da ficha (o que já foi combinado): aluguel, bonificação, vencimento, garantia, IPTU, seguro e contas. */
export function itensDaProposta(f) {
  const out = [];
  const aluguel = f.aluguel_inicial || 0;
  const pct = f.bonificacao === false ? 0 : (f.desconto_pontualidade_percentual || 0);
  const desconto = aluguel ? C.descontoPorPercentual(aluguel, pct) : 0;
  if (aluguel) out.push(['Aluguel', `${C.reais(aluguel)} por mês${desconto ? ` (${C.reais(aluguel - desconto)} pagando até o vencimento)` : ''}`]);
  if (f.dia_vencimento) out.push(['Vencimento', `todo dia ${f.dia_vencimento}`]);
  if (f.prazo_meses) out.push(['Prazo do contrato', `${f.prazo_meses} meses`]);
  if (f.garantia_tipo) out.push(['Garantia', f.garantia_tipo]);
  const quem = (v) => (v === 'Incluso no aluguel' ? 'incluso no aluguel' : v === 'Não tem' ? 'não tem' : 'por conta do locatário');
  if (f.conta_iptu) out.push(['IPTU', `${quem(f.conta_iptu)}${f.conta_iptu === 'Por conta do inquilino' ? ', no boleto' : ''}${f.iptu_estimado > 0 && f.conta_iptu === 'Por conta do inquilino' ? ` (cerca de ${C.reais(f.iptu_estimado)} por mês)` : ''}`]);
  if (f.conta_seguro) out.push(['Seguro contra incêndio', `${quem(f.conta_seguro)}${f.conta_seguro === 'Por conta do inquilino' ? ', no boleto' : ''}${f.seguro_estimado > 0 && f.conta_seguro === 'Por conta do inquilino' ? ` (cerca de ${C.reais(f.seguro_estimado)} por ano)` : ''}`]);
  const contas = [['conta_agua', 'Água'], ['conta_energia', 'Energia'], ['conta_gas', 'Gás'], ['conta_internet', 'Internet / TV'], ['conta_condominio', 'Condomínio']]
    .filter(([k]) => f[k]).map(([k, nome]) => `${nome}: ${quem(f[k])}`);
  if (contas.length) out.push(['Contas', contas.join(' · ')]);
  return out;
}

// --------------------------------------------------------------------------
// Termo de aceite da reserva (decisões do dono de 2026-11-24): o que a pessoa lê e aceita pelo link antes de depositar
// (nuvem/aceite-reserva.mjs) ou assina à mão. Depois do aceite, o PDF repete o texto exato aceito (aceite_reserva.texto_aceito)
// com a prova (data, hora, e-mail confirmado, IP, aparelho e o resumo SHA-256 do texto).
// --------------------------------------------------------------------------
const pctTexto = (n) => `${String(Math.round((Number(n) || 0) * 100) / 100).replace('.', ',')}%`;

/** Dados ou documentos que não correspondem à realidade (decisão do dono de 2026-11-24: exemplos claros, sem falar em "falso"). */
export const TEXTO_CONFERENCIA = 'Se, na conferência, alguma informação ou documento que você enviou não corresponder à realidade (por exemplo: renda diferente da declarada, emprego que a empresa não confirma, documento com dados alterados ou de outra pessoa), a proposta é encerrada e conta como desistência: vale a mesma regra da desistência acima.';

/**
 * Regra da desistência, para a pessoa (termo, e-mail). ``c``: condições; ``valor``: a reserva. Ex.: 100% e 0 dias → "Se você
 * desistir depois do depósito, a reserva não é devolvida: os R$ 500,00 ficam com a empresa, como sinal de arrependimento
 * (Código Civil, artigos 418 e 420)."; 40% e 7 dias → "Se você desistir em até 7 dias do depósito, devolvemos a reserva
 * inteira. Depois desse prazo, a empresa fica com 40% da reserva (R$ 200,00) e devolve o restante (R$ 300,00)."
 */
export function regraDaDesistencia(c, valor) {
  const reter = Math.min(R.retencaoDaReserva(valor, c.retencao_pct), valor);
  if (!reter) return 'Se você desistir antes de assinar o contrato, devolvemos a reserva inteira.';
  const quando = c.dias_arrependimento > 0 ? `Se você desistir em até ${C.plural(c.dias_arrependimento, 'dia', 'dias')} do depósito, devolvemos a reserva inteira. Depois desse prazo, se desistir, ` : 'Se você desistir depois do depósito, ';
  return reter >= valor
    ? `${quando}a reserva não é devolvida: ${valor ? `os ${C.reais(valor)} ficam` : 'ela fica'} com a empresa, como sinal de arrependimento (Código Civil, artigos 418 e 420), pelo tempo em que o imóvel ficou reservado para você e pela análise.`
    : `${quando}a empresa fica com ${pctTexto(c.retencao_pct)} da reserva (${C.reais(reter)}), pelo tempo em que o imóvel ficou reservado e pela análise, e devolve o restante (${C.reais(valor - reter)}).`;
}

/** Aviso em destaque, antes de aceitar e de pagar (decisão do dono de 2026-11-24: a proteção principal é avisar antes). '' sem retenção. */
export function avisoDaDesistencia(c, valor) {
  const reter = Math.min(R.retencaoDaReserva(valor, c.retencao_pct), valor);
  if (!reter) return '';
  const quando = c.dias_arrependimento > 0 ? `depois de ${C.plural(c.dias_arrependimento, 'dia', 'dias')} do depósito` : 'depois de depositar';
  return `ATENÇÃO, LEIA ANTES DE ACEITAR E DE PAGAR: se você desistir ${quando}, ${reter >= valor ? `você perde a reserva inteira (${C.reais(valor)})` : `você perde ${C.reais(reter)} da reserva`}. O mesmo vale se alguma informação ou documento enviado não corresponder à realidade. Só faça o depósito se tiver certeza de que quer alugar o imóvel.`;
}

/**
 * Frase da desistência para a pessoa (página da ficha, e-mails, ficha em PDF), já com as datas. Ex.: 100% e 0 dias → "Se você
 * desistir, a reserva de R$ 500,00 não é devolvida (fica com a empresa, como no termo da reserva)."; 40% e 7 dias, depósito em
 * 10/12/2026 → "Se desistir até 17/12/2026, a reserva de R$ 500,00 volta por inteiro; depois, devolvemos R$ 300,00 (ficam
 * R$ 200,00, como no termo da reserva)." Sem termo aceito: "A reserva de R$ 500,00 é devolvida por inteiro, sem descontos."
 */
export function textoDesistencia(f) {
  const valor = R.valorDaReserva(f);
  if (!valor) return '';
  if (!f.aceite_reserva) return `A reserva de ${C.reais(valor)} é devolvida por inteiro, sem descontos.`;
  const c = R.condicoesDaReserva(f);
  const reter = Math.min(R.retencaoDaReserva(valor, c.retencao_pct), valor);
  if (!reter) return `A reserva de ${C.reais(valor)} é devolvida por inteiro, sem descontos.`;
  const pz = R.prazosDaReserva(f);
  const depois = reter >= valor ? `a reserva de ${C.reais(valor)} não é devolvida (fica com a empresa, como no termo da reserva)` : `devolvemos ${C.reais(valor - reter)} da reserva de ${C.reais(valor)} (ficam ${C.reais(reter)}, como no termo da reserva)`;
  if (!(c.dias_arrependimento > 0)) return `Se você desistir, ${depois}.`;
  const ate = pz && pz.arrependimento_ate ? `até ${C.dataBr(pz.arrependimento_ate)}` : `em até ${C.plural(c.dias_arrependimento, 'dia', 'dias')} do depósito`;
  return `Se desistir ${ate}, a reserva de ${C.reais(valor)} volta por inteiro; depois, ${depois.replace(/^a reserva de R\$ [\d.,]+ /, 'ela ')}.`;
}

/**
 * O termo que a pessoa lê antes de depositar: { titulo, intro, itens: [[rótulo, valor]], requisitos, documentos, clausulas,
 * deposito, ciencia, condicoes, reserva_valor }. Usa as regras de agora (o aceite guarda as condições e o texto do dia).
 * Ex.: reserva de R$ 500,00 com 100% e 0 dias → item 6: "Se você desistir depois do depósito, a reserva não é devolvida ...", com o
 * aviso em destaque (``aviso``) logo depois da apresentação.
 */
export function termoDaReserva(d, f) {
  const i = imovelDe(d, { ficha: f });
  const e = emitenteDe(d, { ficha: f }, i);
  const empresa = e.razao_social || e.nome || 'a administradora';
  const enderecos = (f.imoveis_ids || []).map((id) => R.buscar(d, 'imoveis', id)).filter(Boolean).map((x) => enderecoDe(d, x));
  const c = R.condicoesDaReservaAgora();
  const valor = R.valorDaReserva(f);
  const deposito = K.dadoDaEmpresa(d, { imovel_id: i ? i.id : null }, 'conta_deposito') || '';
  const itens = [['Imóvel', enderecos.join(' ou ') || 'imóvel não informado'], ...itensDaProposta(f), ['Reserva', valor ? `${C.reais(valor)}, abatida do 1º aluguel` : 'valor a combinar']];
  const garantia = { Fiador: 'fiador com imóvel próprio, que também manda a ficha e os documentos', 'Fiador + depósito': 'fiador com imóvel próprio e depósito de garantia',
    Caução: 'caução em dinheiro, depositada antes da entrega das chaves', 'Depósito garantia': 'depósito de garantia em dinheiro, antes da entrega das chaves',
    'Seguro fiança': 'seguro fiança aprovado pela seguradora' }[f.garantia_tipo];
  const requisitos = [...(garantia ? [`Garantia: ${garantia}.`] : []), 'Consulta do nome e do CPF (ou do CNPJ) em cadastros de crédito, como Serasa e SPC.',
    ...String(f.requisitos || '').split(/\n+/).map((x) => x.trim()).filter(Boolean)];
  const documentos = [...R.documentosDaFicha(f), ...(R.temFiador(f) ? ['Do fiador: documento com foto e CPF, comprovante de renda e de residência e a matrícula de um imóvel em nome dele (a lista completa vai no link dele)'] : [])];
  const valorTexto = valor ? K.valorComExtenso(valor) : 'o valor combinado';
  const clausulas = [
    `1. Para reservar o imóvel, você deposita ${valorTexto} na conta da empresa${deposito ? ' informada no fim deste termo' : ''}. O imóvel fica reservado para você por ${c.dias_validade} dias, contados do depósito, enquanto analisamos a ficha.`,
    '2. A reserva não é aluguel e não forma o contrato: a locação só existe depois do contrato assinado por todos.',
    '3. Aprovada a ficha e assinado o contrato, a reserva é abatida do primeiro aluguel: o primeiro boleto já vem com o desconto. É para isso que ela serve.',
    `4. Depois do depósito, você tem ${C.plural(c.dias_uteis_documentos, 'dia útil', 'dias úteis')} para preencher a ficha e mandar todos os documentos pelo link que vamos enviar. Sem os documentos nesse prazo, a reserva é cancelada, conta como desistência (item 6) e o imóvel volta a ser oferecido.`,
    '5. Se a ficha não for aprovada, devolvemos a reserva inteira, sem nenhum desconto.',
    `6. ${regraDaDesistencia(c, valor)}`,
    `7. ${TEXTO_CONFERENCIA}`,
    Math.min(R.retencaoDaReserva(valor, c.retencao_pct), valor) >= valor && !(c.dias_arrependimento > 0)
      ? `8. Quando houver devolução (ficha não aprovada), ela é feita em até ${C.plural(c.dias_uteis_devolucao, 'dia útil', 'dias úteis')} da reprovação, na conta de onde veio o depósito.`
      : `8. Quando houver devolução, ela é feita em até ${C.plural(c.dias_uteis_devolucao, 'dia útil', 'dias úteis')} da reprovação ou da desistência, na conta de onde veio o depósito.`,
    '9. Seus dados são usados só para a análise desta locação e, se aprovada, para o contrato (Lei 13.709/2018).',
  ];
  return {
    titulo: 'TERMO DE ACEITE DA RESERVA DE IMÓVEL', empresa, cnpj: e.cnpj || '', condicoes: { ...c }, reserva_valor: valor,
    intro: `${empresa}${e.cnpj ? `, CNPJ ${e.cnpj}` : ''}, apresenta a ${f.inquilino_nome || 'você'} as condições para reservar o imóvel abaixo enquanto a ficha cadastral é analisada. As condições da locação dependem da aprovação da ficha.`,
    aviso: avisoDaDesistencia(c, valor), itens, requisitos, documentos, clausulas, deposito,
    ciencia: 'Li as condições acima e concordo com elas, inclusive com a regra da desistência (itens 6 e 7). Sei que a reserva é abatida do primeiro aluguel se a ficha for aprovada.',
  };
}

/** O termo como texto corrido (o que a pessoa aceita no link; o servidor guarda este texto e o resumo SHA-256 dele). */
export function textoDoTermo(t) {
  return [t.titulo, t.intro, ...(t.aviso ? [t.aviso] : []), `CONDIÇÕES DA LOCAÇÃO\n${t.itens.map(([a, b]) => `- ${a}: ${b}`).join('\n')}`,
    `REQUISITOS PARA A APROVAÇÃO\n${t.requisitos.map((x) => `- ${x}`).join('\n')}`,
    `DOCUMENTOS PARA A ANÁLISE\n${t.documentos.map((x, k) => `${k + 1}. ${x}`).join('\n')}`,
    `CONDIÇÕES DA RESERVA\n${t.clausulas.join('\n')}`, ...(t.deposito ? [`CONTA PARA O DEPÓSITO DA RESERVA\n${t.deposito}`] : [])].join('\n\n');
}

/**
 * Caução ou depósito que saiu numa troca de garantia e ainda não foi devolvido (os depósitos ficam guardados na troca):
 * o recibo continua podendo sair. Ex.: caução de R$ 3.600,00 trocada por fiador em 01/12/2026, ainda a devolver.
 */
function garantiaDaTroca(d, c) {
  const pend = R.devolucoesDeTrocaPendentes(d, c).at(-1);
  if (!pend) return null;
  const t = pend.troca;
  const qual = t.tipo_anterior === 'Caução' ? 'caucao' : 'deposito';
  const deps = (t.devolucao_movimentos || []).filter((x) => x.valor > 0);
  const valor = deps.reduce((s, x) => s + x.valor, 0) || t.valor_anterior;
  return { qual, nome: qual === 'caucao' ? 'caução' : 'depósito de garantia', valor, data: deps.length ? deps[deps.length - 1].data : t.data,
    depositos: deps.map((x) => ({ data: x.data, valor: x.valor })), uso: (t.anterior || {}).deposito_uso || '', troca: t };
}

/** Garantia em dinheiro já paga: { qual, nome, valor, data, depositos: [{ data, valor }] } ou null. */
export function garantiaPaga(d, c) {
  const qual = R.temCaucao(c) ? 'caucao' : R.temDeposito(c) ? 'deposito' : null;
  if (!qual) return garantiaDaTroca(d, c);
  const deps = R.depositosGarantiaDo(d, c, qual).filter((x) => !x.complementar);
  if (!R.garantiaDepositada(c) && !deps.length) return null;
  const valor = deps.length ? deps.reduce((s, x) => s + x.valor, 0) : (qual === 'caucao' ? c.caucao_valor : c.deposito_valor) || 0;
  const data = (qual === 'caucao' ? c.caucao_pago_em : c.deposito_pago_em) || (deps.length ? deps[deps.length - 1].data : (qual === 'caucao' ? c.caucao_data : c.deposito_data));
  return valor > 0 ? { qual, nome: qual === 'caucao' ? 'caução' : 'depósito de garantia', valor, data, depositos: deps.map((x) => ({ data: x.data, valor: x.valor })), uso: c.deposito_uso || '' } : null;
}

/**
 * O documento pode sair? { ok, motivo }. Ex.: termo de quitação antes do cálculo final → { ok: false, motivo: "Faça antes o cálculo final da saída." }.
 * ``alvo``: { ficha } ou { contrato } (registros).
 */
export function reciboDisponivel(d, tipo, alvo) {
  const f = alvo.ficha || null;
  const c = alvo.contrato || null;
  const p = f || c;
  if (!p) return { ok: false, motivo: 'Ficha ou inquilino não encontrado.' };
  if (tipo === 'ficha' || tipo === 'ficha_fiador') {
    if (!f) return { ok: false, motivo: 'A ficha cadastral é da ficha em análise.' };
    if (tipo === 'ficha_fiador' && !R.temFiador(f) && !R.fiadoresDaFicha(f).length) return { ok: false, motivo: 'A garantia da proposta não é fiador.' };
    return { ok: true };
  }
  if (tipo === 'termo_reserva') {
    if (!f) return { ok: false, motivo: 'O termo de aceite da reserva é da ficha em análise.' };
    if (f.aceite_reserva) return { ok: true };
    return R.valorDaReserva(f) > 0 ? { ok: true } : { ok: false, motivo: 'Informe a reserva combinada (em "Editar") antes do termo.' };
  }
  if (tipo === 'reserva') {
    // troca de titular: a reserva copiada do contrato anterior foi paga pelo titular anterior (o recibo é o dele)
    const ant = c ? R.contratoHerdado(d, c) : null;
    if (ant) return { ok: false, motivo: `A reserva foi paga pelo titular anterior (${ant.inquilino_nome}): o recibo é o do contrato dele.` };
    return p.reserva_valor > 0 && p.reserva_data ? { ok: true } : { ok: false, motivo: 'Informe o valor e a data da reserva.' };
  }
  if (tipo === 'devolucao_reserva') {
    if (!f) return { ok: false, motivo: 'O termo de devolução da reserva é da ficha em análise.' };
    if (!(f.reserva_valor > 0)) return { ok: false, motivo: 'A ficha não tem reserva.' };
    return f.devolucao_data ? { ok: true } : { ok: false, motivo: 'Registre antes a devolução da reserva (data e comprovante, em "Editar").' };
  }
  if (tipo === 'garantia') {
    if (!c) return { ok: false, motivo: 'O recibo da garantia é do contrato.' };
    if (!R.temCaucao(c) && !R.temDeposito(c) && !garantiaDaTroca(d, c)) return { ok: false, motivo: 'O contrato não tem caução nem depósito em dinheiro.' };
    // garantia herdada (trocas antigas): quem pagou foi o titular anterior
    const qual = R.temCaucao(c) ? 'caucao' : R.temDeposito(c) ? 'deposito' : null;
    const pagador = qual ? R.pagadorDaGarantia(d, c, qual) : c;
    if (pagador.id !== c.id) return { ok: false, motivo: `O recibo é de quem pagou a garantia (${pagador.inquilino_nome}): tire-o no contrato dele.` };
    return garantiaPaga(d, c) ? { ok: true } : { ok: false, motivo: 'Registre antes o depósito da garantia (data e comprovante).' };
  }
  if (tipo === 'devolucao_garantia') {
    if (!c) return { ok: false, motivo: 'O recibo da devolução da garantia é do contrato.' };
    const dev = devolucaoDe(d, c, alvo);
    if (!dev) return { ok: false, motivo: 'Registre antes a devolução da garantia (troca de garantia ou de titular).' };
    // sem saldo a devolver (os débitos levaram tudo), não há devolução nem recibo (decisão do dono, 2026-11-21)
    return dev.saldo > 0 ? { ok: true } : { ok: false, motivo: 'Não sobrou saldo a devolver: os débitos descontados levaram a garantia inteira.' };
  }
  if (tipo === 'devolucao_chaves') {
    if (!c) return { ok: false, motivo: 'O termo de devolução das chaves é do contrato.' };
    return c.data_saida ? { ok: true } : { ok: false, motivo: 'Informe antes a data de saída.' };
  }
  if (tipo === 'acordo') {
    if (!c) return { ok: false, motivo: 'O termo do acordo é do contrato.' };
    const a = acordoDe(d, c, alvo);
    if (!a) return { ok: false, motivo: 'Acordo não encontrado.' };
    return a.desfeito_em ? { ok: false, motivo: 'Este acordo foi desfeito.' } : { ok: true };
  }
  if (tipo === 'notificacao') {
    if (!c) return { ok: false, motivo: 'A notificação é do contrato.' };
    const n = notificacaoDe(d, c, alvo);
    if (!n) return { ok: false, motivo: 'Notificação não encontrada.' };
    return n.situacao === 'Cancelada' ? { ok: false, motivo: 'Esta notificação foi cancelada.' } : { ok: true };
  }
  if (tipo === 'quitacao') {
    if (!c) return { ok: false, motivo: 'O termo de quitação é do contrato.' };
    const e = R.encerramentoDo(d, c.id);
    if (!e) return { ok: false, motivo: 'Faça antes o cálculo final da saída.' };
    if (e.saldo !== 0 && !e.garantia_devolvida_em) return { ok: false, motivo: e.saldo > 0 ? 'Marque antes a devolução do saldo ao inquilino (roteiro da saída).' : 'Marque antes o pagamento do saldo pelo inquilino (roteiro da saída).' };
    return { ok: true };
  }
  return { ok: false, motivo: 'Documento desconhecido.' };
}

/**
 * Texto do documento: { titulo, emitente, paragrafos, tabela: [[rótulo, valor]] (valor null = linha de título), depois, assinaturas: [{ nome, linha }],
 * cidade, data, arquivo }. Parágrafos e células são texto puro (a tela escapa). Lança erro se o documento não puder sair.
 * Ex.: reserva de R$ 4.150,00 em 10/11/2026 → "Recebemos de GABRIEL ..., CPF ..., a importância de R$ 4.150,00 (quatro mil, cento e cinquenta reais) ...".
 */
export function montarRecibo(d, tipo, alvo, hoje = C.hojeIso()) {
  const disp = reciboDisponivel(d, tipo, alvo);
  if (!disp.ok) throw new C.ErroUsuario(disp.motivo);
  const f = alvo.ficha || null;
  const c = alvo.contrato || null;
  const p = f || c;
  const i = imovelDe(d, alvo);
  const e = emitenteDe(d, alvo, i);
  const empresa = e.razao_social || e.nome || 'LOCADORA';
  const endereco = enderecoDe(d, i) || 'imóvel não informado';
  const quem = pessoa(p.inquilino_nome, documentoDe(p));
  const assinaEmpresa = { nome: empresa, linha: [e.cnpj ? `CNPJ ${e.cnpj}` : '', 'LOCADORA'].filter(Boolean).join(' · ') };
  const assinaPessoa = (papel) => ({ nome: p.inquilino_nome, linha: [documentoDe(p), papel].filter(Boolean).join(' · ') });
  const nomeArq = (doc, data) => `${doc} ${i ? i.nome : 'sem imovel'} - ${p.inquilino_nome} - ${data || hoje}`;
  const base = { emitente: e, cidade: (i && i.cidade) || e.municipio || K.dadoDaEmpresa(d, alvo.contrato || { imovel_id: i ? i.id : null }, 'cidade_documentos'), data: hoje, tabela: [], depois: [] };

  if (tipo === 'ficha') return fichaCadastral(d, f, base, nomeArq);
  if (tipo === 'ficha_fiador') return fichaDoFiador(d, f, Number(alvo.fiador) || 1, i, base, nomeArq);

  if (tipo === 'termo_reserva') return termoReservaPdf(d, f, base, nomeArq);

  if (tipo === 'reserva') {
    const proposta = f ? itensDaProposta(f) : [];
    return {
      ...base, titulo: 'RECIBO DE RESERVA DE IMÓVEL',
      paragrafos: [
        `Recebemos de ${quem}, a importância de ${K.valorComExtenso(p.reserva_valor)}, em ${C.dataBr(p.reserva_data)}, creditada na conta da empresa, a título de reserva do imóvel situado na ${endereco}${f ? ', durante a análise da ficha cadastral' : ''}.`,
        'Condições da reserva:',
        '1. A reserva não forma a locação: o contrato só existe depois de assinado por todas as partes.',
        '2. Aprovada a ficha e assinado o contrato, o valor é abatido do primeiro aluguel.',
        f && f.aceite_reserva && R.retencaoDaReserva(p.reserva_valor, R.condicoesDaReserva(f).retencao_pct) > 0
          ? `3. Não aprovada a ficha, o valor é devolvido por inteiro, sem desconto, na conta de onde veio o depósito. Na desistência, vale o termo de aceite da reserva de ${C.dataBr(String(f.aceite_reserva.em).slice(0, 10))}: ${textoDesistencia(f)}`
          : '3. Não aprovada a ficha, ou se o interessado desistir antes de assinar o contrato, o valor é devolvido por inteiro, sem desconto, na conta de onde veio o depósito.',
      ],
      tabela: proposta.length ? [['CONDIÇÕES PROPOSTAS (dependem da aprovação da ficha)', null], ...proposta] : [],
      depois: ['Damos quitação do valor acima, nos termos dos artigos 319 e 320 do Código Civil.'],
      assinaturas: [assinaEmpresa],
      arquivo: nomeArq('Recibo reserva', p.reserva_data),
    };
  }

  if (tipo === 'devolucao_reserva') {
    const devolvido = f.devolucao_valor || f.reserva_valor;
    const integral = devolvido >= f.reserva_valor;
    const meses = CR.regra('meses_documentos_ficha');
    return {
      ...base, titulo: 'TERMO DE DEVOLUÇÃO DA RESERVA E QUITAÇÃO',
      paragrafos: [
        `${empresa}${e.cnpj ? `, CNPJ ${e.cnpj}` : ''}, devolveu em ${C.dataBr(f.devolucao_data)} a ${quem}, a importância de ${K.valorComExtenso(devolvido)}, ${integral ? 'correspondente à integralidade' : `parte`} da reserva de ${C.reais(f.reserva_valor)} recebida em ${C.dataBr(f.reserva_data)} para o imóvel situado na ${endereco}, por transferência para a conta de onde veio o depósito, conforme o comprovante bancário anexo.`,
        `Com a devolução, a ficha cadastral fica encerrada${R.fichaSemContrato(f) ? ', sem a formação de contrato de locação' : ''}.`,
        integral
          ? 'As partes declaram que nada mais devem uma à outra em razão da reserva e da ficha cadastral, e dão-se mútua quitação desse valor (Código Civil, artigos 319 e 320).'
          : f.aceite_reserva && R.devolucaoDaReserva(f).devolver === devolvido
            ? `A diferença de ${C.reais(f.reserva_valor - devolvido)} fica com a empresa, como no termo de aceite da reserva aceito em ${C.dataBr(String(f.aceite_reserva.em).slice(0, 10))} (${R.devolucaoDaReserva(f).motivo}). As partes dão-se quitação do valor devolvido e do retido (Código Civil, artigos 319, 320 e 418).`
            : `A diferença de ${C.reais(f.reserva_valor - devolvido)} fica explicada nas observações da ficha. As partes dão-se quitação do valor devolvido (Código Civil, artigos 319 e 320).`,
        `Os documentos pessoais enviados para a análise serão apagados em até ${meses} meses. Ficam guardados só os comprovantes da reserva e da devolução, por obrigação legal (Lei 13.709/2018, artigo 16, I).`,
      ],
      assinaturas: [assinaEmpresa, assinaPessoa('recebi o valor e dou quitação')],
      arquivo: nomeArq('Termo devolucao reserva', f.devolucao_data),
    };
  }

  if (tipo === 'garantia') {
    const g = garantiaPaga(d, c);
    const caucao = g.qual === 'caucao';
    const inicio = c.data_entrada || c.vigencia_inicio;
    return {
      ...base, titulo: caucao ? 'RECIBO DE CAUÇÃO EM DINHEIRO' : 'RECIBO DE DEPÓSITO DE GARANTIA',
      paragrafos: [
        `Recebemos de ${quem}, a importância de ${K.valorComExtenso(g.valor)}, ${g.depositos.length > 1 ? `em ${g.depositos.length} depósitos (abaixo)` : `em ${C.dataBr(g.data)}`}, creditada na conta da empresa, a título de ${g.nome} do contrato de locação do imóvel situado na ${endereco}${inicio ? `, com início em ${C.dataBr(inicio)}` : ''}.`,
        caucao
          ? 'O valor fica depositado em caderneta de poupança, com os rendimentos a favor do locatário, e é devolvido no fim da locação, depois da entrega das chaves e da vistoria de saída, descontados apenas os débitos comprovados, conforme o contrato (Lei 8.245/91, artigo 38, § 2º).'
          : `O valor é devolvido no fim da locação, depois da entrega das chaves e da vistoria de saída, descontados apenas os débitos comprovados, conforme o contrato${g.uso ? ` (uso combinado: ${g.uso})` : ''}.`,
        'A garantia não é aluguel nem receita da empresa: não há nota fiscal.',
      ],
      tabela: g.depositos.length > 1 ? [['DEPÓSITOS', null], ...g.depositos.map((x) => [C.dataBr(x.data), C.reais(x.valor)])] : [],
      depois: ['Damos quitação do valor acima, nos termos dos artigos 319 e 320 do Código Civil.'],
      assinaturas: [assinaEmpresa],
      arquivo: nomeArq(caucao ? 'Recibo caucao' : 'Recibo deposito garantia', g.data),
    };
  }

  if (tipo === 'devolucao_garantia') return reciboDevolucaoGarantia(d, c, devolucaoDe(d, c, alvo), base, { empresa, e, quem, endereco, assinaEmpresa, assinaPessoa, nomeArq });
  if (tipo === 'acordo') return termoDoAcordo(d, c, acordoDe(d, c, alvo), base, { empresa, e, quem, endereco, assinaEmpresa, assinaPessoa, nomeArq });
  if (tipo === 'notificacao') return cartaDaNotificacao(d, c, notificacaoDe(d, c, alvo), base, { empresa, e, quem, endereco, assinaEmpresa, assinaPessoa, nomeArq });
  if (tipo === 'devolucao_chaves') return termoDevolucaoChaves(d, c, base, { empresa, e, quem, endereco, assinaEmpresa, assinaPessoa, nomeArq });

  // quitacao: entrega do imóvel, acerto final e quitação recíproca, com os valores discriminados
  const enc = R.encerramentoDo(d, c.id);
  const vist = K.resultadoVistoriaSaida(d, c);
  const solidario = c.solidario_nome ? pessoa(c.solidario_nome, c.solidario_cpf ? `${K.rotuloDocumento(c.solidario_cpf)} ${c.solidario_cpf}` : '') : '';
  const tabela = linhasDoAcerto(enc, { quitacao: true });
  const pagamento = enc.saldo > 0 ? `Em ${C.dataBr(enc.garantia_devolvida_em)}, a LOCADORA devolveu ao LOCATÁRIO o saldo de ${K.valorComExtenso(enc.saldo)}, conforme o comprovante bancário anexo.`
    : enc.saldo < 0 ? `Em ${C.dataBr(enc.garantia_devolvida_em)}, o LOCATÁRIO pagou à LOCADORA o saldo de ${K.valorComExtenso(-enc.saldo)}.`
      : 'Não há saldo a devolver nem a pagar.';
  return {
    ...base, titulo: 'TERMO DE ENTREGA DO IMÓVEL, ACERTO FINAL E QUITAÇÃO',
    paragrafos: [
      `LOCADORA: ${empresa}${e.cnpj ? `, CNPJ ${e.cnpj}` : ''}. LOCATÁRIO: ${quem}${solidario ? `. LOCATÁRIO SOLIDÁRIO: ${solidario}` : ''}. IMÓVEL: ${endereco}.`,
      `1. ENTREGA DO IMÓVEL. As chaves foram devolvidas em ${C.dataBr(enc.data_saida)}${vist.vistoria ? `, com a vistoria de saída feita em ${C.dataBr(vist.vistoria.data)}` : ''}. O contrato de locação fica encerrado nessa data.`,
      '2. ACERTO FINAL. Os valores do contrato até a entrega das chaves, discriminados abaixo (Lei 8.245/91, artigo 22, VI):',
    ],
    tabela,
    depois: [
      `3. PAGAMENTO DO SALDO. ${pagamento}`,
      `4. QUITAÇÃO. Com o acerto acima, as partes dão-se quitação recíproca dos aluguéis, encargos, reparos e da garantia deste contrato até ${C.dataBr(enc.data_saida)}, nos valores aqui discriminados (Código Civil, artigos 319 e 320), estendida ao locatário solidário e aos fiadores, se houver.`,
      '5. RESSALVA. Ficam ressalvadas apenas as contas de consumo (água, energia e gás) e os tributos do período da locação ainda não lançados nesta data, que serão cobrados com a conta ou a guia correspondente.',
    ],
    assinaturas: [assinaEmpresa, assinaPessoa('LOCATÁRIO'), ...(c.solidario_nome ? [{ nome: c.solidario_nome, linha: 'LOCATÁRIO SOLIDÁRIO' }] : [])],
    arquivo: nomeArq('Termo quitacao', enc.garantia_devolvida_em || enc.data_saida),
  };
}

/**
 * Linhas do acerto final (cálculo da saída), as mesmas no termo de quitação e no e-mail do acerto: [[rótulo, valor]].
 * Os reparos pagos pelo FCI e o que passou dele também saem do saldo, senão a conta não fecha. Ex.: garantia corrigida
 * R$ 5.940,00, FCI R$ 1.200,00, reparos R$ 800,00, débitos R$ 1.000,00 → 5.940 + 1.200 − 800 − 1.000 = saldo R$ 5.340,00.
 * ``quitacao``: rótulos do termo (saldo já devolvido ou pago); sem ela, os do e-mail (a devolver / a pagar).
 */
export function linhasDoAcerto(enc, { quitacao = false } = {}) {
  if (!enc) return [];
  const tabela = [];
  if (enc.garantia_valor > 0) {
    tabela.push(['Garantia depositada', C.reais(enc.garantia_valor)]);
    tabela.push([`Garantia corrigida até ${C.dataBr(enc.data_saida)}`, C.reais(enc.garantia_corrigida || enc.garantia_valor)]);
  }
  if (enc.fci_credito) tabela.push(['FCI corrigido (crédito do locatário)', C.reais(enc.fci_credito)]);
  if (enc.fci_usado > 0) tabela.push(['(-) Reparos pagos pelo FCI', C.reais(enc.fci_usado)]);
  const danosAlem = Math.max((enc.fci_danos || 0) - (enc.fci_usado || 0), 0);
  if (danosAlem > 0) tabela.push(['(-) Reparos além do FCI', C.reais(danosAlem)]);
  tabela.push([quitacao ? '(-) Débitos descontados' : '(-) Débitos', C.reais(enc.debitos || 0)]);
  for (const l of String(enc.debitos_descricao || '').split(/\n+/).map((x) => x.trim()).filter(Boolean)) tabela.push([`   ${l}`, '']);
  const saldo = quitacao ? (enc.saldo >= 0 ? '= Saldo devolvido ao locatário' : '= Saldo pago pelo locatário') : `= Saldo ${enc.saldo >= 0 ? 'a devolver' : 'a pagar'}`;
  tabela.push([saldo, C.reais(Math.abs(enc.saldo || 0))]);
  return tabela;
}

/**
 * Devolução da garantia do documento: a de ``alvo.id`` ou, sem ele, a última do contrato com saldo; só se for deste contrato.
 * (Tabela devolucoes_garantia: troca de garantia, com ``troca_id``, ou troca de titular com garantia nova.)
 */
const devolucaoDe = (d, c, alvo) => {
  const dev = alvo.id ? R.buscar(d, 'devolucoes_garantia', Number(alvo.id)) : R.devolucoesGarantiaDo(d, c.id).filter((x) => x.saldo > 0).at(-1);
  return dev && dev.contrato_id === c.id ? dev : null;
};

/**
 * Recibo da devolução da garantia (item 4 de PENDENCIAS_4000, decisão do dono de 2026-11-21): na troca de garantia (ex.: caução
 * de R$ 3.150,00 trocada por fiador em 01/12/2026) ou de titular com garantia nova, a caução ou o depósito volta a quem depositou,
 * corrigido pela poupança e descontados os débitos; a pessoa assina que recebeu e o recibo assinado é anexado. A garantia não
 * passa adiante (decisão da direção, 2026-11-13) e não é receita: sem NF.
 */
function reciboDevolucaoGarantia(d, c, dev, base, { empresa, e, quem, endereco, assinaEmpresa, assinaPessoa, nomeArq }) {
  const troca = dev.troca_id ? R.buscar(d, 'trocas_garantia', dev.troca_id) : null;
  const caucao = troca ? troca.tipo_anterior === 'Caução' : R.temCaucao(c);
  const nome = caucao ? 'caução' : 'depósito de garantia';
  const motivo = troca ? `em razão da troca da garantia (${troca.tipo_anterior} por ${String(troca.tipo_novo || '').toLocaleLowerCase('pt-BR')}) em ${C.dataBr(troca.data)}`
    : (() => { const n = R.continuadoPor(d, c); return `em razão da troca de titular do contrato${n ? ` (${n.inquilino_nome} assumiu em ${C.dataBr(n.data_entrada || n.vigencia_inicio)}, com garantia própria)` : ''}`; })();
  const tabela = [['Garantia depositada', C.reais(dev.garantia_valor || 0)]];
  if (dev.indice_percentual) tabela.push([`Correção pela caderneta de poupança (${String(dev.indice_percentual).replace('.', ',')}%)`, C.reais((dev.garantia_corrigida || 0) - (dev.garantia_valor || 0))]);
  tabela.push(['Garantia corrigida', C.reais(dev.garantia_corrigida || dev.garantia_valor || 0)]);
  if (dev.debitos > 0) {
    tabela.push(['(-) Débitos descontados', C.reais(dev.debitos)]);
    for (const l of String(dev.debitos_descricao || '').split(/\n+/).map((x) => x.trim()).filter(Boolean)) tabela.push([`   ${l}`, '']);
  }
  tabela.push(['= Valor devolvido', C.reais(dev.saldo)]);
  return {
    ...base, titulo: `RECIBO DE DEVOLUÇÃO ${caucao ? 'DA CAUÇÃO' : 'DO DEPÓSITO DE GARANTIA'}`, data: dev.data || base.data,
    paragrafos: [
      `Recebi de ${empresa}${e.cnpj ? `, CNPJ ${e.cnpj}` : ''}, em ${C.dataBr(dev.data)}, a importância de ${K.valorComExtenso(dev.saldo)}, referente à devolução da ${nome} do contrato de locação do imóvel situado na ${endereco}, ${motivo}, conforme o comprovante bancário anexo.`,
      `${caucao ? 'O valor foi corrigido pelos rendimentos da caderneta de poupança, que são do locatário (Lei 8.245/91, artigo 38, § 2º)' : 'O valor foi corrigido'}${dev.debitos > 0 ? ', e descontados apenas os débitos discriminados abaixo:' : ', sem débitos a descontar:'}`,
    ],
    tabela,
    depois: [
      `Com o recebimento, dou quitação da ${nome} acima, nada mais tendo a receber a esse título (Código Civil, artigos 319 e 320).${troca ? ' O contrato de locação continua, agora com a nova garantia.' : ''}`,
      'A garantia não é aluguel nem receita da empresa: não há nota fiscal.',
    ],
    assinaturas: [assinaPessoa('recebi o valor e dou quitação'), assinaEmpresa],
    arquivo: nomeArq(caucao ? 'Recibo devolucao caucao' : 'Recibo devolucao deposito garantia', dev.data),
  };
}

/** Notificação do documento (``alvo.notificacao``: o registro, ou ``alvo.id``), só se for deste contrato. */
const notificacaoDe = (d, c, alvo) => {
  const n = alvo.notificacao || R.buscar(d, 'notificacoes', Number(alvo.id));
  return n && n.contrato_id === c.id ? n : null;
};

/**
 * Notificação extrajudicial ao inquilino (pedido do dono em 2026-11-17): quem notifica, quem é notificado e o imóvel, o texto
 * (o do rascunho, com a cláusula citada, o prazo e a data limite), o quadro com as datas e as assinaturas (a da empresa, feita
 * pelo gov.br fora do sistema, e a ciência do inquilino quando entregue em mãos). Ex.: notificação de 17/11/2026, 10 dias
 * úteis → "Data limite para cumprir: 02/12/2026".
 */
function cartaDaNotificacao(d, c, n, base, x) {
  const numero = R.numeroDaNotificacao(d, n);
  const ant = n.anterior_id ? R.buscar(d, 'notificacoes', n.anterior_id) : null;
  const solidario = c.solidario_nome ? pessoa(c.solidario_nome, c.solidario_cpf ? `${K.rotuloDocumento(c.solidario_cpf)} ${c.solidario_cpf}` : '') : '';
  return {
    ...base, data: n.data, titulo: numero > 1 ? `${numero}ª NOTIFICAÇÃO EXTRAJUDICIAL` : 'NOTIFICAÇÃO EXTRAJUDICIAL',
    paragrafos: [
      `NOTIFICANTE (LOCADORA): ${x.empresa}${x.e.cnpj ? `, CNPJ ${x.e.cnpj}` : ''}. NOTIFICADO (LOCATÁRIO): ${x.quem}${solidario ? `. LOCATÁRIO SOLIDÁRIO: ${solidario}` : ''}. IMÓVEL: ${x.endereco}.`,
      `ASSUNTO: ${n.assunto}.`,
      ...String(n.texto || '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean),
    ],
    tabela: [['Data desta notificação', C.dataBr(n.data)], ['Prazo para cumprir', `${n.prazo_dias} ${n.prazo_dias === 1 ? 'dia útil' : 'dias úteis'}`],
      ['Data limite', C.dataBr(n.data_limite)], ...(ant ? [['Notificação anterior', `${C.dataBr(ant.data)} (prazo até ${C.dataBr(ant.data_limite)})`]] : []),
      ...(n.clausula ? [['Contrato', n.clausula]] : [])],
    depois: ['Recebi esta notificação em ______/______/__________ (preencher só se entregue em mãos).'],
    assinaturas: [x.assinaEmpresa, x.assinaPessoa('NOTIFICADO (LOCATÁRIO), ciente')],
    arquivo: x.nomeArq(numero > 1 ? `Notificacao ${numero}` : 'Notificacao', n.data),
  };
}

/** Acordo do documento (``alvo.acordo`` = id), só se for deste contrato. */
const acordoDe = (d, c, alvo) => { const a = R.buscar(d, 'acordos', Number(alvo.acordo)); return a && a.contrato_id === c.id ? a : null; };

/**
 * Termo de confissão de dívida e acordo de pagamento (pedido do dono em 2026-11-15): a dívida confessada, os boletos que o
 * acordo substituiu, as parcelas, o vencimento antecipado no atraso, sem novação, a concordância dos fiadores e duas testemunhas.
 * Ex.: boletos de ago/2026 e set/2026 (R$ 2.700,00, R$ 2.910,00 com multa e juros em 10/11/2026), acordo de R$ 2.910,00 em
 * 3 boletos de R$ 970,00 vencendo 10/12/2026, 10/01/2027 e 10/02/2027.
 * Base legal: confissão de dívida assinada pelo devedor e por duas testemunhas é título executivo (CPC, artigo 784, III); sem
 * ânimo de novar não há novação (Código Civil, artigo 361); o fiador se desobriga se o credor der prazo ao devedor sem o
 * consentimento dele (Código Civil, artigo 838, I): por isso os fiadores assinam concordando.
 */
function termoDoAcordo(d, c, a, base, x) {
  const solidario = c.solidario_nome ? pessoa(c.solidario_nome, c.solidario_cpf ? `${K.rotuloDocumento(c.solidario_cpf)} ${c.solidario_cpf}` : '') : '';
  const fiadores = R.fiadoresDoContrato(d, c.id).filter((f) => !f.data_saida || f.data_saida >= a.data);
  const origens = R.origensDoAcordo(d, a);
  const parcelas = R.parcelasDoAcordo(d, a);
  const multa = String(c.multa_percentual || 0).replace('.', ',');
  const juros = String(c.juros_mensal_percentual || 0).replace('.', ',');
  const nomeBoleto = (cb) => (R.ehParcelaAcordo(cb) ? `parcela ${cb.acordo_parcela || 'única'} de acordo anterior` : `aluguel de ${C.compBr(cb.competencia)}`);
  const tabela = [['BOLETOS VENCIDOS INCLUÍDOS NO ACORDO', null], ...origens.map((cb) => [`${nomeBoleto(cb)} (venceu em ${C.dataBr(cb.vencimento)})`, C.reais(R.totais(cb).a_pagar_sem_desconto)]),
    ['Valor original', C.reais(a.valor_original)], [`Valor em ${C.dataBr(a.data)}, com multa e juros`, C.reais(a.divida_na_data)],
    ['PARCELAS DO ACORDO', null], ...parcelas.map((cb, k) => [`${parcelas.length > 1 ? `${k + 1}ª parcela` : 'Parcela única'}, vencimento ${C.dataBr(cb.vencimento)}`, C.reais(R.totais(cb).a_pagar_sem_desconto)]),
    ['Total do acordo', C.reais(a.valor_total)]];
  const nomesFiadores = fiadores.map((f) => pessoa(f.nome, f.cpf ? `CPF ${f.cpf}` : '')).join('; ');
  return {
    ...base, data: a.data, titulo: 'TERMO DE CONFISSÃO DE DÍVIDA E ACORDO DE PAGAMENTO',
    paragrafos: [
      `CREDORA (LOCADORA): ${x.empresa}${x.e.cnpj ? `, CNPJ ${x.e.cnpj}` : ''}. DEVEDOR (LOCATÁRIO): ${x.quem}${solidario ? `. LOCATÁRIO SOLIDÁRIO: ${solidario}` : ''}${nomesFiadores ? `. FIADOR(ES), como intervenientes anuentes: ${nomesFiadores}` : ''}. IMÓVEL: ${x.endereco}.`,
      `1. DÍVIDA. O LOCATÁRIO reconhece e confessa dever à LOCADORA a importância de ${K.valorComExtenso(a.valor_total)}, referente aos aluguéis e encargos do contrato de locação do imóvel acima (${a.referente}), vencidos e não pagos, discriminados abaixo. A dívida é líquida, certa e exigível.`,
    ],
    tabela,
    depois: [
      `2. PAGAMENTO. O valor será pago em ${parcelas.length} ${parcelas.length > 1 ? 'parcelas mensais' : 'parcela'}, por boleto bancário, nos vencimentos acima. O pagamento de cada parcela dá quitação somente dela.`,
      `3. ATRASO. O não pagamento de qualquer parcela no vencimento torna vencidas de imediato as demais (vencimento antecipado), acrescidas da multa de ${multa}% e dos juros de ${juros}% ao mês previstos no contrato de locação, e permite à LOCADORA cobrar o saldo, inclusive judicialmente, e tomar as demais medidas previstas no contrato e na Lei 8.245/91.`,
      '4. SEM NOVAÇÃO. Este acordo não é novação (Código Civil, artigo 361): o contrato de locação e as suas garantias continuam valendo em todos os termos. Os boletos vencidos acima só ficam quitados com o pagamento de todas as parcelas.',
      ...(fiadores.length ? ['5. FIADORES. O(s) fiador(es) assina(m) este termo concordando com o parcelamento e mantendo a fiança, inclusive sobre esta dívida (Código Civil, artigo 838, I).'] : []),
      `${fiadores.length ? 6 : 5}. TÍTULO EXECUTIVO. Assinado pelo devedor e por duas testemunhas, este termo vale como título executivo extrajudicial (Código de Processo Civil, artigo 784, III).`,
    ],
    assinaturas: [x.assinaEmpresa, x.assinaPessoa('DEVEDOR (LOCATÁRIO)'), ...(c.solidario_nome ? [{ nome: c.solidario_nome, linha: 'LOCATÁRIO SOLIDÁRIO' }] : []),
      ...fiadores.flatMap((f) => [{ nome: f.nome, linha: [f.cpf ? `CPF ${f.cpf}` : '', 'FIADOR (anuente)'].filter(Boolean).join(' · ') }, ...(f.nome_conjuge ? [{ nome: f.nome_conjuge, linha: 'CÔNJUGE DO FIADOR (anuente)' }] : [])]),
      { nome: `TESTEMUNHA 1: ${EM_BRANCO}`, linha: `CPF: ${EM_BRANCO}` }, { nome: `TESTEMUNHA 2: ${EM_BRANCO}`, linha: `CPF: ${EM_BRANCO}` }],
    arquivo: x.nomeArq('Termo acordo', a.data),
  };
}

/** Chaves e controles do contrato: os da vistoria de saída, senão os da vistoria de entrada, senão os do imóvel. */
function chavesDaSaida(d, c) {
  const linhas = (t) => String(t || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const saida = R.vistoriasDo(d, c.id).find((v) => v.tipo === 'Saída');
  const entrada = K.vistoriaDeEntrada(d, c);
  const i = R.buscar(d, 'imoveis', c.imovel_id) || {};
  for (const t of [saida && saida.chaves, entrada && entrada.chaves, i.chaves]) if (linhas(t).length) return linhas(t);
  return [];
}

/**
 * Termo de devolução das chaves (B4), assinado no dia da devolução: a relação das chaves, a vistoria de saída marcada (B3) e a
 * ressalva de que receber as chaves não dá quitação. Ex.: saída em 10/03/2027, vistoria marcada para 12/03/2027 às 14:00.
 */
function termoDevolucaoChaves(d, c, base, x) {
  const solidario = c.solidario_nome ? pessoa(c.solidario_nome, c.solidario_cpf ? `${K.rotuloDocumento(c.solidario_cpf)} ${c.solidario_cpf}` : '') : '';
  const chaves = chavesDaSaida(d, c);
  const horas = c.finalidade === 'Não residencial' ? '48 (quarenta e oito)' : '72 (setenta e duas)';
  const vistoria = c.vistoria_saida_data
    ? `A vistoria de saída fica marcada para ${C.dataBr(c.vistoria_saida_data)}${c.vistoria_saida_hora ? `, às ${c.vistoria_saida_hora}` : ''}, no imóvel`
    : `A vistoria de saída será feita pela LOCADORA em até ${horas} horas desta devolução, em data e horário informados por escrito`;
  return {
    ...base, data: c.data_saida, titulo: 'TERMO DE DEVOLUÇÃO DAS CHAVES',
    paragrafos: [
      `LOCADORA: ${x.empresa}${x.e.cnpj ? `, CNPJ ${x.e.cnpj}` : ''}. LOCATÁRIO: ${x.quem}${solidario ? `. LOCATÁRIO SOLIDÁRIO: ${solidario}` : ''}. IMÓVEL: ${x.endereco}.`,
      `1. DEVOLUÇÃO. Em ${C.dataBr(c.data_saida)}, às ____:____, o LOCATÁRIO devolve à LOCADORA as chaves e os controles do imóvel relacionados abaixo, que a partir deste momento volta à guarda da LOCADORA.`,
    ],
    tabela: [['CHAVES E CONTROLES DEVOLVIDOS', null], ...(chaves.length ? chaves.map((l) => [l, '']) : [['______________________________________________', ''], ['______________________________________________', '']])],
    depois: [
      `2. VISTORIA DE SAÍDA. ${vistoria}. O LOCATÁRIO está convidado a acompanhá-la, pessoalmente ou por pessoa autorizada por escrito. Se não comparecer, a vistoria é feita com fotos e vídeo de cada cômodo e o relatório lhe é enviado por e-mail, com 5 (cinco) dias úteis para contestar, comparado com a vistoria de entrada.`,
      '3. SEM QUITAÇÃO. O recebimento das chaves não dá quitação. Os aluguéis e encargos até esta data, as contas de consumo e os tributos do período da locação e os reparos apontados na vistoria de saída serão apurados no acerto final, descontados da garantia, se houver, ou cobrados do LOCATÁRIO, conforme o contrato (Lei 8.245/91, artigo 23, III).',
      '4. ALUGUEL. O aluguel e os encargos são devidos até esta data, proporcionais aos dias do mês.',
    ],
    assinaturas: [{ ...x.assinaEmpresa, linha: `${x.assinaEmpresa.linha} · REPRESENTANTE DA ADMINISTRADORA` }, x.assinaPessoa('LOCATÁRIO'), ...(c.solidario_nome ? [{ nome: c.solidario_nome, linha: 'LOCATÁRIO SOLIDÁRIO' }] : [])],
    arquivo: x.nomeArq('Termo devolucao chaves', c.data_saida),
  };
}

// --------------------------------------------------------------------------
// Ficha cadastral em PDF (pedido do dono em 2026-11-14, depois de várias fichas com documentos, extratos e assinaturas
// falsos): os dados que já temos, linhas em branco para o resto, os documentos conforme o tipo de renda e, antes da
// assinatura, a declaração de veracidade (tom informativo: o crime e a conferência, sem ameaça) e a saída fácil, a
// desistência com a reserva devolvida por inteiro (já é a regra, decisão de 2026-11-12). Assina pelo gov.br ou à mão.
// --------------------------------------------------------------------------
/** Linha em branco para preencher à mão. */
export const EM_BRANCO = '______________________________';
const ou = (v) => (v === undefined || v === null || v === '' ? EM_BRANCO : String(v));
const dataOu = (v) => (v ? C.dataBr(v) : EM_BRANCO);
const reaisOu = (v) => (v > 0 ? C.reais(v) : EM_BRANCO);
const mesOu = (v) => (v ? C.compBr(v) : EM_BRANCO);
const casadoOuUniao = (estado) => ['Casado(a)', 'União estável'].includes(estado);

/** Qualificação da pessoa física (prefixo do campo: 'inquilino_', 'representante_' ou '' no fiador). */
const qualificacaoDe = (p, pre) => [
  ['Nacionalidade', ou(p[`${pre}nacionalidade`])], ['Estado civil', ou(p[`${pre}estado_civil`])],
  ['Profissão', ou(p[`${pre}profissao`])], ['Data de nascimento', dataOu(p[`${pre}nascimento`])],
];

/** Lista numerada de documentos, com o aviso de mandar o arquivo original. */
const listaDocumentos = (itens) => [['DOCUMENTOS PARA ENVIAR JUNTO', null], ...itens.map((t, k) => [`${k + 1}.`, t]), ['Atenção', R.DICA_DOCUMENTOS]];

/** Declaração antes da assinatura: verdade dos dados, conferência com a fonte, o crime (CP 171, 298, 299 e 304) e a LGPD. */
// revisão de 14/11: art. 297 (documento público: RG, CNH, certidão, recibo do IR) junto do 298 (particular: holerite, extrato);
// "podem ser conferidos" (o banco não confirma extrato de cliente a terceiros, LC 105/2001: confere-se com a fonte possível)
const declaracao = (quem, pj = false) => [
  `DECLARAÇÃO. ${quem} que as informações desta ficha e os documentos entregues com ela são verdadeiros. Os documentos podem ser conferidos diretamente com a fonte (empregadores, cartórios, bancos e validadores oficiais), e apresentar documento, extrato, comprovante ou assinatura falsos é crime (Código Penal, artigos 171, 297, 298, 299 e 304), que pode ser comunicado à autoridade policial.`,
  `Autorizo a consulta ${pj ? 'do CNPJ da empresa e do CPF do representante' : 'do nome e do CPF'} em cadastros de crédito (como Serasa e SPC) e o uso destes dados para a análise desta locação e, se aprovada, para o contrato (Lei 13.709/2018).`,
];
const COMO_ASSINAR = 'Assinatura: pelo gov.br (gratuito, em assinador.iti.br, com conta prata ou ouro) ou à mão, mandando a foto ou o PDF da ficha assinada.';

/** Ficha cadastral do interessado (pessoa física ou empresa). */
function fichaCadastral(d, f, base, nomeArq) {
  const pj = f.inquilino_tipo === PJ;
  const proposta = itensDaProposta(f);
  const imoveis = (f.imoveis_ids || []).map((id) => R.buscar(d, 'imoveis', id)).filter(Boolean);
  const tabela = [['IMÓVEL DE INTERESSE', null], ...(imoveis.length ? imoveis.map((x) => ['Endereço', enderecoDe(d, x)]) : [['Endereço', EM_BRANCO]])];
  if (proposta.length) tabela.push(['CONDIÇÕES PROPOSTAS (dependem da aprovação da ficha)', null], ...proposta);
  if (pj) {
    tabela.push(['DADOS DA EMPRESA', null], ['Razão social', ou(f.inquilino_nome)], ['Nome fantasia', ou(f.inquilino_apelido)], ['CNPJ', ou(f.inquilino_cpf)],
      ['Inscrição estadual', ou(f.inquilino_rg)], ['Endereço da sede', ou(f.inquilino_endereco)], ['Telefone', ou(f.inquilino_telefone)], ['E-mail', ou(f.inquilino_email)],
      ['Faturamento mensal médio', reaisOu(f.renda_mensal)],
      ['REPRESENTANTE (quem assina pela empresa)', null], ['Nome', ou(f.representante_nome)], ['CPF', ou(f.representante_cpf)], ['RG', ou(f.representante_rg)],
      ['Cargo', ou(f.representante_cargo)], ...qualificacaoDe(f, 'representante_'), ['Endereço', ou(f.representante_endereco)],
      ['Telefone', ou(f.representante_telefone)], ['E-mail', ou(f.representante_email)]);
  } else {
    tabela.push(['DADOS DO INTERESSADO (quem vai assinar o contrato)', null], ['Nome completo', ou(f.inquilino_nome)], ['CPF', ou(f.inquilino_cpf)], ['RG', ou(f.inquilino_rg)],
      ...qualificacaoDe(f, 'inquilino_'), ['Endereço atual', ou(f.inquilino_endereco)],
      ['Telefone', `${ou(f.inquilino_telefone)}${f.inquilino_telefone && f.inquilino_whatsapp ? ' (WhatsApp)' : ''}`], ['E-mail', ou(f.inquilino_email)],
      ['RENDA', null], ['Tipo de renda', ou(f.renda_tipo)], ['Renda mensal (bruta)', reaisOu(f.renda_mensal)], ['Empresa onde trabalha / fonte', ou(f.renda_fonte)],
      ['Telefone da empresa', ou(f.renda_fonte_telefone)], ['Trabalha lá desde', mesOu(f.renda_desde)]);
    // cônjuge: de quem é casado ou vive em união estável (estado civil em branco: as linhas vão para preencher, se for o caso)
    if (R.fichaComConjuge(f) || !f.inquilino_estado_civil) {
      tabela.push([`CÔNJUGE OU COMPANHEIRO(A)${f.inquilino_estado_civil ? '' : ' (se for casado ou viver em união estável)'}`, null], ['Nome', ou(f.conjuge_nome)],
        ['CPF', ou(f.conjuge_cpf)], ['Profissão', ou(f.conjuge_profissao)], ['Renda mensal (bruta)', reaisOu(f.conjuge_renda)], ['Telefone', ou(f.conjuge_telefone)]);
    }
  }
  if (f.solidario_nome) tabela.push(['INQUILINO SOLIDÁRIO (assina o contrato junto)', null], ['Nome', f.solidario_nome], ['CPF / CNPJ', ou(f.solidario_cpf)], ['Telefone', ou(f.solidario_telefone)]);
  tabela.push([pj ? 'QUEM VAI USAR O IMÓVEL' : 'QUEM VAI MORAR NO IMÓVEL', null],
    ['Pessoas (nome, parentesco e idade)', f.moradores ? String(f.moradores).split(/\n+/).map((x) => x.trim()).filter(Boolean).join('; ') : EM_BRANCO],
    ['Animais de estimação', ou(f.animais)]);
  const fiadores = R.fiadoresDaFicha(f);
  if (fiadores.length || R.temFiador(f)) {
    tabela.push(['FIADOR', null], ...(fiadores.length ? fiadores.map((x) => [`Fiador ${x.n}`, `${x.nome}${x.cpf ? `, CPF ${x.cpf}` : ''} (preenche e assina a ficha do fiador)`]) : [['Fiador', 'preenche e assina a ficha do fiador']]));
  }
  tabela.push(...listaDocumentos(R.documentosDaFicha(f)));
  const reserva = textoDesistencia(f) || 'Nada é cobrado.';
  return {
    ...base, titulo: 'FICHA CADASTRAL',
    paragrafos: [`Ficha para a análise da locação. Confira os dados já preenchidos, complete o que faltar e assine no fim.${f.data_recebida ? ` Ficha aberta em ${C.dataBr(f.data_recebida)}.` : ''}`],
    tabela,
    depois: [
      ...declaracao(pj ? 'A empresa declara, por meio do representante,' : 'Declaro', pj),
      `Se faltar algum documento ou você preferir não seguir com a análise, sem problema: marque abaixo e devolva esta ficha. ${reserva}`,
      `(   ) Não vou seguir com a análise${f.reserva_valor > 0 ? (f.aceite_reserva ? ' e peço a devolução da reserva, como no termo da reserva' : ' e peço a devolução integral da reserva') : ''}.`,
      COMO_ASSINAR,
    ],
    assinaturas: [pj ? { nome: f.representante_nome || EM_BRANCO, linha: `representante de ${f.inquilino_nome || 'EMPRESA'}` } : { nome: f.inquilino_nome || EM_BRANCO, linha: f.inquilino_cpf ? `CPF ${f.inquilino_cpf} · INTERESSADO` : 'INTERESSADO' }],
    arquivo: nomeArq('Ficha cadastral', base.data),
  };
}

/** Ficha cadastral do fiador ``n`` da ficha (dados da ficha: fiadorN_…). */
function fichaDoFiador(d, f, n, i, base, nomeArq) {
  const x = R.fiadorDaFicha(f, n);
  // casado com separação total de bens (pacto antenupcial): o cônjuge não assina a fiança (CC art. 1.647)
  const conjuge = (casadoOuUniao(x.estado_civil) && !R.separacaoTotal(x)) || !x.estado_civil;
  const imoveis = (f.imoveis_ids || []).map((id) => R.buscar(d, 'imoveis', id)).filter(Boolean).map((x) => enderecoDe(d, x)).join(' ou ') || enderecoDe(d, i);
  const tabela = [['FIADOR DA LOCAÇÃO', null], ['Interessado (locatário)', ou(f.inquilino_nome)], ['Imóvel', ou(imoveis)],
    ['DADOS DO FIADOR', null], ['Nome completo', ou(x.nome)], ['CPF', ou(x.cpf)], ['RG', ou(x.rg)], ...qualificacaoDe(x, ''), ['Regime de bens (se casado)', ou(x.regime_bens)],
    ['Endereço', ou(x.endereco)], ['Telefone', ou(x.telefone)], ['E-mail', ou(x.email)]];
  if (conjuge) tabela.push([`CÔNJUGE OU COMPANHEIRO(A)${x.estado_civil ? ' (também assina a fiança)' : ' (se for casado ou viver em união estável)'}`, null], ['Nome', ou(x.nome_conjuge)], ['CPF', ou(x.cpf_conjuge)], ['RG', ou(x.rg_conjuge)]);
  tabela.push(['IMÓVEL DO FIADOR', null], ['Endereço, matrícula e cartório', ou(x.imovel_garantia)], ...listaDocumentos(R.documentosDoFiador(x)));
  return {
    ...base, titulo: 'FICHA CADASTRAL DO FIADOR',
    paragrafos: ['Ficha para a análise do fiador. Confira os dados já preenchidos, complete o que faltar e assine no fim.',
      'O fiador responde pelas dívidas do contrato de locação se o locatário não pagar (Código Civil, artigo 818). Sendo casado, o cônjuge também assina a fiança, salvo separação total de bens (Código Civil, artigo 1.647, III).'],
    tabela,
    depois: [...declaracao('Declaro'), COMO_ASSINAR],
    assinaturas: [{ nome: x.nome || EM_BRANCO, linha: x.cpf ? `CPF ${x.cpf} · FIADOR` : 'FIADOR' },
      ...(conjuge ? [{ nome: x.nome_conjuge || EM_BRANCO, linha: 'CÔNJUGE OU COMPANHEIRO(A) DO FIADOR' }] : [])],
    arquivo: `${nomeArq('Ficha cadastral do fiador', base.data)}${x.nome ? ` - ${x.nome}` : ''}`,
  };
}

/**
 * Termo de aceite da reserva em PDF. Aceito pelo link: o texto exato aceito e a prova (sem linhas de assinatura: o aceite é
 * eletrônico, com o e-mail confirmado por código; Lei 14.063/2020, art. 4º, I, e MP 2.200-2/2001, art. 10, § 2º). Ainda não
 * aceito: o termo de agora, com as linhas para assinar à mão ou pelo gov.br.
 */
function termoReservaPdf(d, f, base, nomeArq) {
  const a = f.aceite_reserva;
  if (a && a.texto_aceito) {
    const partes = String(a.texto_aceito).split(/\n{2,}/);
    const quando = new Date(a.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    return {
      ...base, titulo: partes[0] || 'TERMO DE ACEITE DA RESERVA DE IMÓVEL', data: String(a.em).slice(0, 10),
      paragrafos: partes.slice(1).flatMap((x) => x.split('\n')).filter((x) => !/^Declaração: /.test(x)),
      depois: [
        `ACEITE ELETRÔNICO. ${f.inquilino_nome} leu este termo e marcou "Li e concordo" no link enviado só a essa pessoa, em ${quando} (horário de Brasília).`,
        ...partes.filter((x) => /^Declaração: /.test(x)).map((x) => `Declaração aceita: ${x.replace(/^Declaração: /, '')}`),
        `E-mail confirmado pelo código de 6 números enviado a este endereço: ${a.email}.${a.ip ? ` Endereço de internet (IP): ${a.ip}.` : ''}${a.aparelho ? ` Aparelho: ${String(a.aparelho).slice(0, 160)}.` : ''}`,
        `Código de conferência do texto (SHA-256): ${a.texto_sha256}. Qualquer mudança no texto muda este código.`,
        'Aceite eletrônico com o e-mail confirmado (Lei 14.063/2020, artigo 4º, I; Medida Provisória 2.200-2/2001, artigo 10, § 2º).',
      ],
      imagem: a.assinatura ? { rotulo: 'Assinatura desenhada na tela:', src: a.assinatura } : null,
      assinaturas: [],
      arquivo: nomeArq('Termo aceite reserva', String(a.em).slice(0, 10)),
    };
  }
  const t = termoDaReserva(d, f);
  return {
    ...base, titulo: t.titulo,
    paragrafos: [t.intro, ...(t.aviso ? [t.aviso] : [])],
    tabela: [['CONDIÇÕES DA LOCAÇÃO', null], ...t.itens, ['REQUISITOS PARA A APROVAÇÃO', null], ...t.requisitos.map((x, k) => [`${k + 1}.`, x]),
      ['DOCUMENTOS PARA A ANÁLISE', null], ...t.documentos.map((x, k) => [`${k + 1}.`, x]), ...(t.deposito ? [['CONTA PARA O DEPÓSITO DA RESERVA', null], ['Depósito', t.deposito]] : [])],
    depois: ['CONDIÇÕES DA RESERVA', ...t.clausulas, `DECLARAÇÃO. ${t.ciencia}`, COMO_ASSINAR],
    assinaturas: [{ nome: f.inquilino_nome || EM_BRANCO, linha: f.inquilino_cpf ? `${documentoDe(f)} · INTERESSADO` : 'INTERESSADO' }],
    arquivo: nomeArq('Termo aceite reserva', base.data),
  };
}
