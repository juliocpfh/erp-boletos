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
// - Documentos pessoais da ficha reprovada são apagados; os comprovantes de dinheiro ficam (LGPD, art. 16, I).
import * as C from './calculos.js';
import * as K from './contratos.js';
import * as CR from './config-regras.js';
import * as R from './regras.js';

const PJ = 'Pessoa jurídica (empresa)';

/** Os documentos que o sistema emite, na ordem das etapas. */
export const TIPOS_RECIBO = {
  reserva: 'Recibo da reserva',
  devolucao_reserva: 'Termo de devolução da reserva',
  garantia: 'Recibo da garantia',
  quitacao: 'Termo de quitação',
};

const documentoDe = (p, campo = 'inquilino_cpf', tipo = p.inquilino_tipo) => (p[campo] ? `${tipo === PJ ? 'CNPJ' : 'CPF'} ${p[campo]}` : '');
const pessoa = (nome, doc) => [nome, doc].filter(Boolean).join(', ');

/** Imóvel do documento: o do contrato, ou o primeiro de interesse da ficha. */
function imovelDe(d, alvo) {
  if (alvo.contrato) return R.buscar(d, 'imoveis', alvo.contrato.imovel_id) || null;
  return (alvo.ficha.imoveis_ids || []).map((id) => R.buscar(d, 'imoveis', id)).find(Boolean) || null;
}

/** Endereço por extenso. Ex.: "Rua Professor Nilo Brandão, 117, Apto 02, São Lourenço, Curitiba/PR". */
function enderecoDe(i) {
  if (!i) return '';
  return [R.enderecoCompleto(i), i.bairro, i.cidade ? `${i.cidade}/${i.uf || 'PR'}` : ''].filter(Boolean).join(', ');
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

/** Garantia em dinheiro já paga: { qual, nome, valor, data, depositos: [{ data, valor }] } ou null. */
function garantiaPaga(d, c) {
  const qual = R.temCaucao(c) ? 'caucao' : R.temDeposito(c) ? 'deposito' : null;
  if (!qual) return null;
  const deps = R.depositosGarantiaDo(d, c, qual).filter((x) => !x.complementar);
  if (!R.garantiaDepositada(c) && !deps.length) return null;
  const valor = deps.length ? deps.reduce((s, x) => s + x.valor, 0) : (qual === 'caucao' ? c.caucao_valor : c.deposito_valor) || 0;
  const data = (qual === 'caucao' ? c.caucao_pago_em : c.deposito_pago_em) || (deps.length ? deps[deps.length - 1].data : (qual === 'caucao' ? c.caucao_data : c.deposito_data));
  return valor > 0 ? { qual, nome: qual === 'caucao' ? 'caução' : 'depósito de garantia', valor, data, depositos: deps.map((x) => ({ data: x.data, valor: x.valor })) } : null;
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
  if (tipo === 'reserva') return p.reserva_valor > 0 && p.reserva_data ? { ok: true } : { ok: false, motivo: 'Informe o valor e a data da reserva.' };
  if (tipo === 'devolucao_reserva') {
    if (!f) return { ok: false, motivo: 'O termo de devolução da reserva é da ficha em análise.' };
    if (!(f.reserva_valor > 0)) return { ok: false, motivo: 'A ficha não tem reserva.' };
    return f.devolucao_data ? { ok: true } : { ok: false, motivo: 'Registre antes a devolução da reserva (data e comprovante, em "Editar").' };
  }
  if (tipo === 'garantia') {
    if (!c) return { ok: false, motivo: 'O recibo da garantia é do contrato.' };
    if (!R.temCaucao(c) && !R.temDeposito(c)) return { ok: false, motivo: 'O contrato não tem caução nem depósito em dinheiro.' };
    return garantiaPaga(d, c) ? { ok: true } : { ok: false, motivo: 'Registre antes o depósito da garantia (data e comprovante).' };
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
  const endereco = enderecoDe(i) || 'imóvel não informado';
  const quem = pessoa(p.inquilino_nome, documentoDe(p));
  const assinaEmpresa = { nome: empresa, linha: [e.cnpj ? `CNPJ ${e.cnpj}` : '', 'LOCADORA'].filter(Boolean).join(' · ') };
  const assinaPessoa = (papel) => ({ nome: p.inquilino_nome, linha: [documentoDe(p), papel].filter(Boolean).join(' · ') });
  const nomeArq = (doc, data) => `${doc} ${i ? i.nome : 'sem imovel'} - ${p.inquilino_nome} - ${data || hoje}`;
  const base = { emitente: e, cidade: (i && i.cidade) || e.municipio || 'Curitiba', data: hoje, tabela: [], depois: [] };

  if (tipo === 'reserva') {
    const proposta = f ? itensDaProposta(f) : [];
    return {
      ...base, titulo: 'RECIBO DE RESERVA DE IMÓVEL',
      paragrafos: [
        `Recebemos de ${quem}, a importância de ${K.valorComExtenso(p.reserva_valor)}, em ${C.dataBr(p.reserva_data)}, creditada na conta da empresa, a título de reserva do imóvel situado na ${endereco}${f ? ', durante a análise da ficha cadastral' : ''}.`,
        'Condições da reserva:',
        '1. A reserva não forma a locação: o contrato só existe depois de assinado por todas as partes.',
        '2. Aprovada a ficha e assinado o contrato, o valor é abatido do primeiro aluguel.',
        '3. Não aprovada a ficha, ou se o interessado desistir antes de assinar o contrato, o valor é devolvido por inteiro, sem desconto, na conta de onde veio o depósito.',
        'O valor é um adiantamento: a nota fiscal sai com o aluguel em que ele for abatido.',
      ],
      tabela: proposta.length ? [['CONDIÇÕES PROPOSTAS (dependem da aprovação da ficha)', null], ...proposta] : [],
      depois: ['Dou quitação do valor acima, nos termos dos artigos 319 e 320 do Código Civil.'],
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
        `Com a devolução, a ficha cadastral fica encerrada${f.situacao === 'Reprovada' ? ', sem a formação de contrato de locação' : ''}.`,
        integral
          ? 'As partes declaram que nada mais devem uma à outra em razão da reserva e da ficha cadastral, e dão-se mútua quitação desse valor (Código Civil, artigos 319 e 320).'
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
          : `O valor é devolvido no fim da locação, depois da entrega das chaves e da vistoria de saída, descontados apenas os débitos comprovados, conforme o contrato${c.deposito_uso ? ` (uso combinado: ${c.deposito_uso})` : ''}.`,
        'A garantia não é aluguel nem receita da empresa: não há nota fiscal.',
      ],
      tabela: g.depositos.length > 1 ? [['DEPÓSITOS', null], ...g.depositos.map((x) => [C.dataBr(x.data), C.reais(x.valor)])] : [],
      depois: ['Dou quitação do valor acima, nos termos dos artigos 319 e 320 do Código Civil.'],
      assinaturas: [assinaEmpresa],
      arquivo: nomeArq(caucao ? 'Recibo caucao' : 'Recibo deposito garantia', g.data),
    };
  }

  // quitacao: entrega do imóvel, acerto final e quitação recíproca, com os valores discriminados
  const enc = R.encerramentoDo(d, c.id);
  const vist = K.resultadoVistoriaSaida(d, c);
  const solidario = c.solidario_nome ? pessoa(c.solidario_nome, c.solidario_cpf ? `CPF/CNPJ ${c.solidario_cpf}` : '') : '';
  const tabela = [];
  if (enc.garantia_valor > 0) {
    tabela.push(['Garantia depositada', C.reais(enc.garantia_valor)]);
    tabela.push([`Garantia corrigida até ${C.dataBr(enc.data_saida)}`, C.reais(enc.garantia_corrigida || enc.garantia_valor)]);
  }
  if (enc.fci_credito) tabela.push(['FCI corrigido (crédito do locatário)', C.reais(enc.fci_credito)]);
  tabela.push(['(-) Débitos descontados', C.reais(enc.debitos || 0)]);
  for (const l of String(enc.debitos_descricao || '').split(/\n+/).map((x) => x.trim()).filter(Boolean)) tabela.push([`   ${l}`, '']);
  tabela.push([enc.saldo >= 0 ? '= Saldo devolvido ao locatário' : '= Saldo pago pelo locatário', C.reais(Math.abs(enc.saldo || 0))]);
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
