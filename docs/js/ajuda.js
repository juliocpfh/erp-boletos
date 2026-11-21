// Ajuda para quem está começando: o botão "?" no título das telas principais (AJUDA_TELAS, ligarAjuda), os primeiros
// passos do Painel enquanto o sistema está quase vazio (passosIniciais, caixaPrimeirosPassos) e o "próximo passo" das
// listas vazias (proximoPasso). Os textos ficam todos aqui, em português simples, com exemplos de datas e valores.
import * as C from './calculos.js';
import { regra } from './config-regras.js';
import { esc } from './formularios.js';

// --------------------------------------------------------------------------
// Textos da ajuda de cada tela (botão "?" ao lado do título)
// --------------------------------------------------------------------------
/**
 * Uma entrada por tela: ``serve`` (para que serve), ``primeiro`` (o que fazer primeiro, em passos curtos) e ``exemplo``
 * (um caso com datas e valores). Texto puro: passa por esc() ao desenhar.
 */
export const AJUDA_TELAS = {
  painel: {
    titulo: 'Painel',
    serve: 'É a tela de entrada: mostra num relance quantos imóveis e inquilinos você tem, os avisos do que precisa de atenção (boleto vencido, reajuste, seguro, documento faltando) e o calendário do mês.',
    primeiro: ['Leia os alertas de cima para baixo: cada um tem um link que leva direto ao que precisa ser feito.',
      'Use "Confirmar pagamento" quando um inquilino pagar.',
      'No calendário, clique num dia para ver o que vence nele (no celular, o calendário vira uma lista: toque na semana).'],
    exemplo: 'No dia {dia_gerar_boletos}/11/2026 o calendário avisa "boletos": é o dia de gerar os boletos do aluguel de novembro, que vencem em dezembro. No dia 01/12/2026 avisa "NFs": é o dia de numerar as NFs dos pagamentos de novembro.',
  },
  imoveis: {
    titulo: 'Imóveis',
    serve: 'Lista todos os imóveis, com o endereço, a matrícula, as contas (água, luz, gás, internet, condomínio) e o aluguel de hoje. Imóvel sem inquilino aparece como "Vago".',
    primeiro: ['Clique em "Novo imóvel" e digite o CEP: a rua, o bairro e a cidade vêm sozinhos.',
      'Anexe o arquivo da matrícula no botão "📎 Anexar".',
      'Depois, cadastre o inquilino em Inquilinos → "Novo contrato".'],
    exemplo: 'Apartamento 101 com aluguel de R$ 2.000,00 e bonificação de 10%: a lista mostra R$ 2.000,00 e, entre parênteses, R$ 1.800,00 (o que o inquilino paga em dia).',
  },
  imovel: {
    titulo: 'Página do imóvel',
    serve: 'Junta tudo de um imóvel: dados e documentos, o inquilino de agora e os anteriores, o IPTU de cada ano, as contas de água e luz e o que entrou e saiu no banco ligado a ele.',
    primeiro: ['Confira o endereço e as contas em "Editar imóvel".',
      'Lance o IPTU do ano na caixa do IPTU.',
      'Para alugar, use "Novo contrato" (ou a ficha do interessado, em Inquilinos).'],
    exemplo: 'IPTU de 2026 de R$ 2.130,00 em 10 parcelas: cada boleto do inquilino leva R$ 213,00 a partir do mês escolhido (ex.: o boleto que vence em março de 2026).',
  },
  inquilinos: {
    titulo: 'Inquilinos',
    serve: 'Lista quem aluga hoje (ativos) e quem já saiu, com a vigência do contrato, o aluguel atual e a garantia. Em cima ficam as fichas dos interessados que ainda estão em análise.',
    primeiro: ['Alguém quer alugar? Clique em "Novo pedido de reserva": preencha o imóvel, o contato, a proposta e o que está incluso. Depois, na página da ficha, gere o link para a pessoa preencher o resto.',
      'Ficha aprovada vira o contrato já preenchido. Já tem o contrato? Use "Novo contrato", na caixa "Contratos ativos".',
      'Clique no nome do inquilino para abrir a página dele.'],
    exemplo: 'Inquilino que entrou em 10/03/2026 com contrato de 30 meses aparece em "Contratos ativos" com a vigência 10/03/2026 a 09/09/2028. Quando sair, a saída é registrada na página dele e ele passa para "Inativos".',
  },
  contrato: {
    titulo: 'Página do inquilino',
    serve: 'Tudo de um contrato: dados do inquilino e dos fiadores, boletos, documentos assinados, garantia (caução ou seguro), reajustes, solicitações e, no fim, a saída com o cálculo final.',
    primeiro: ['Confira os dados em "Editar contrato" (o valor, o dia do vencimento e a garantia).',
      'Siga a "Rotina de entrada do inquilino": gerar o contrato, colher as assinaturas, vistoria, caução. Cada etapa fica marcada sozinha quando é registrada.',
      'Quando o inquilino for sair, use "Saída do inquilino": o sistema faz o cálculo final.'],
    exemplo: 'Aluguel de R$ 2.000,00 com vencimento no dia 10 e bonificação de 10%: pago até 10/12/2026, o boleto de novembro sai por R$ 1.800,00; pago depois, é R$ 2.000,00 mais multa e juros.',
  },
  notificacoes: {
    titulo: 'Notificações ao inquilino',
    serve: 'Lista as notificações que a administração mandou aos inquilinos para resolver algo num prazo (o contrário das solicitações, que são pedidos do inquilino). As em aberto vêm primeiro; o prazo vencido aparece em vermelho.',
    primeiro: ['Clique em "Nova notificação", escolha o inquilino e o assunto e clique em "Montar o texto".',
      'Troque no texto o que estiver em "[preencher: …]" pelo caso real e salve.',
      'Abra a notificação: imprima o PDF, assine no gov.br, anexe a assinada e envie.'],
    exemplo: 'Ar-condicionado instalado errado: notificação de 17/11/2026 com 10 dias úteis vence em 02/12/2026 (20/11 é feriado). O lembrete aparece no Painel em 27/11; em 03/12, se não resolveu, dá para mandar a 2ª notificação ou gerar a multa no próximo boleto.',
  },
  notificacao: {
    titulo: 'Notificação ao inquilino',
    serve: 'Acompanha uma notificação do começo ao fim: o PDF para assinar, a assinada, o envio, o prazo em dias úteis, a baixa quando o inquilino resolve e, se não resolver, outra notificação do mesmo assunto ou a multa.',
    primeiro: ['Clique em "PDF para assinar", baixe e assine no gov.br (assinador.iti.br).',
      'Anexe a notificação assinada e envie por e-mail (o "Enviar agora" já marca a data do envio) ou entregue à mão e marque como enviada.',
      'Quando o inquilino resolver, dê a baixa com a data e uma foto.'],
    exemplo: 'Prazo até 02/12/2026 e nada resolvido: em 03/12 clique em "Gerar multa", digite R$ 2.000,00 (o sistema sugere 1 aluguel) e confira o boleto que recebe. O boleto de 11/2026, que vence em 10/12, passa de R$ 2.000,00 para R$ 4.000,00, e a multa fica fora da NF.',
  },
  ficha: {
    titulo: 'Ficha em análise',
    serve: 'Guarda o pedido de quem quer alugar: dados da pessoa e dos fiadores, a reserva paga e os documentos (renda, identidade). É aqui que a ficha é aprovada ou reprovada.',
    primeiro: ['Confira os documentos de cada pessoa da ficha.',
      'Registre a reserva, se o interessado pagou.',
      'Aprove para virar contrato, ou reprove (a reserva é devolvida e os documentos saem depois de {meses_documentos_ficha|mês|meses}).'],
    exemplo: 'Ficha recebida em 05/11/2026 com reserva de R$ 500,00: aprovada em 08/11/2026, o contrato já vem preenchido com os dados dela e a reserva é descontada do primeiro boleto.',
  },
  cobrancas: {
    titulo: 'Boletos',
    serve: 'Os boletos do aluguel de cada mês. O mês da tela é o mês de referência do aluguel: o boleto do aluguel de novembro vence em dezembro. No alto, o botão "E-mails da régua" abre os e-mails de cobrança preparados pelo sistema, esperando a autorização do administrador (nada é enviado sozinho).',
    primeiro: ['A partir do dia {dia_gerar_boletos}, clique em "Gerar boletos" do mês: o sistema calcula o valor de cada inquilino (aluguel, IPTU, seguro, descontos).',
      'Quando o inquilino pagar, clique em "Confirmar pagamento" na linha e informe o dia em que o dinheiro entrou na conta.',
      'Depois, numere as NFs na tela NF.'],
    exemplo: 'Aluguel de novembro de 2026, R$ 2.000,00 com bonificação de 10%, vencendo em 10/12/2026: em dia, R$ 1.800,00. Se o dia 10 cair num sábado, vale até o próximo dia útil sem multa.',
  },
  cobranca: {
    titulo: 'Boleto',
    serve: 'Mostra um boleto por dentro: cada valor que entra (aluguel, IPTU, seguro, descontos), o vencimento, a situação e o pagamento.',
    primeiro: ['Confira os valores antes de mandar ao inquilino.',
      'Use "Confirmar pagamento" quando o dinheiro entrar.',
      'Precisa mudar um valor? Mude no cadastro e recalcule; o boleto alterado à mão não muda mais sozinho.'],
    exemplo: 'Inquilino que entrou em 15/11/2026: o boleto de novembro é proporcional, 16 de 30 dias. Com aluguel de R$ 2.000,00, sai R$ 1.066,67.',
  },
  faturas: {
    titulo: 'NF',
    serve: 'Numera e guarda as notas fiscais (NF) dos aluguéis recebidos. Cada pagamento confirmado em Boletos fica aqui "aguardando número".',
    primeiro: ['Espere o mês virar: as NFs de novembro são numeradas a partir de 01/12.',
      'Marque os pagamentos e clique em "Numerar as NFs marcadas".',
      'Imprima ou baixe em PDF para mandar ao inquilino.'],
    exemplo: 'Em novembro de 2026 entraram três aluguéis, nos dias 05, 08 e 12. Em 01/12/2026, ao numerar, quem pagou no dia 05 recebe o primeiro número, depois o do dia 08 e por último o do dia 12.',
  },
  banco: {
    titulo: 'Banco',
    serve: 'Traz o extrato da conta no banco (C6) para dentro do sistema e diz para onde foi cada entrada e saída: aluguel de qual boleto, conta de qual imóvel, imposto, reforma.',
    primeiro: ['O administrador liga o banco em Dados e backup (caixa "Banco (C6)").',
      'Clique em "Buscar extrato" do mês (ou importe o arquivo OFX baixado no app do C6).',
      'Dê o destino de cada linha "sem destino": o sistema sugere e você confirma.'],
    exemplo: 'Entrada de R$ 1.800,00 em 10/12/2026 com o nome do inquilino: o sistema propõe ligar ao boleto de novembro desse inquilino; você confere e confirma o pagamento.',
  },
  reajustes: {
    titulo: 'Reajustes do aluguel',
    serve: 'Corrige o aluguel uma vez por ano pelo índice do contrato (IGP-M, IPCA etc.) e prepara a carta de reajuste para o inquilino.',
    primeiro: ['No começo do mês, informe o índice acumulado de 12 meses (IGP-M, IPCA, INPC e IGP-DI vêm do Banco Central para conferir).',
      'Em cada reajuste em aberto, clique em "Aplicar correção".',
      'Gere a carta e mande junto com o boleto do mês.'],
    exemplo: 'Inquilino que entrou em março de 2026 tem o reajuste no aluguel de março de 2027 (o 13º mês; a regra pode ser mudada em Regras do sistema). Aluguel de R$ 2.000,00 com índice de 4,5%: passa a R$ 2.090,00. Índice negativo: o aluguel fica igual.',
  },
  iptu: {
    titulo: "IPTU's",
    serve: 'Mostra o IPTU do ano de todos os imóveis: o que o inquilino paga no boleto, o que é sua parte e as guias que você ainda precisa pagar.',
    primeiro: ['Clique em "Lançar" no imóvel em amarelo (sem o IPTU do ano).',
      'Informe o valor, o número de parcelas e o mês do primeiro boleto com IPTU.',
      'Marque como paga cada guia sua quando pagar.'],
    exemplo: 'IPTU de 2026 de R$ 2.130,00 em 10 parcelas, a partir do boleto que vence em março: o inquilino paga R$ 213,00 por mês de março a dezembro. Em mês sem inquilino, a parcela é sua e aparece em "Guias suas a pagar".',
  },
  dados: {
    titulo: 'Dados e backup',
    serve: 'Mostra onde os dados estão guardados e as cópias de segurança. Daqui também se chega às Empresas, às Regras do sistema, ao Histórico de alterações e à configuração do banco.',
    primeiro: ['Baixe o ZIP com todos os dados de vez em quando e guarde fora do computador (pen drive ou e-mail).',
      'Administrador: ligue o backup seguro neste computador.',
      'Confira as Regras do sistema (multa, juros, caução, reajuste) antes do primeiro boleto.'],
    exemplo: 'Baixou o ZIP em 16/11/2026? Guarde o arquivo num pen drive. Com os dados na nuvem, a tela lembra a data e, a partir de 24/11/2026 (mais de 7 dias), avisa que vale baixar outra cópia.',
  },
  empresas: {
    titulo: 'Empresas',
    serve: 'As empresas que recebem os aluguéis e emitem as NFs. Os dados delas (nome, CNPJ, endereço, conta) saem nos contratos, nos recibos e nas NFs.',
    primeiro: ['Clique em "Nova empresa" e digite o CNPJ: o nome e o endereço vêm sozinhos (confira os acentos).',
      'Envie a logo: ela aparece nos documentos e no ícone do aplicativo.',
      'Tem duas empresas? Cadastre as duas; em cada imóvel você diz quanto da NF é de cada uma.'],
    exemplo: 'Imóvel dividido 50% e 50% entre duas empresas: a NF de um aluguel de R$ 2.000,00 sai em duas partes de R$ 1.000,00, uma para cada empresa.',
  },
};

/** Tela do endereço (#/imoveis, #/imovel/3, #/ → painel) → chave da ajuda, ou '' se a tela não tem ajuda. */
export function chaveDaAjuda(hash) {
  const nome = String(hash || '').replace(/^#\/?/, '').split(/[/?]/)[0] || 'painel';
  return Object.hasOwn(AJUDA_TELAS, nome) ? nome : '';
}

/**
 * Prazos que o administrador muda (Regras do sistema) entram no texto na hora de mostrar: {dia_gerar_boletos} → "20"
 * (ou "05"); {meses_documentos_ficha|mês|meses} → "3 meses" (ou "1 mês").
 */
export function comRegras(texto) {
  return String(texto).replace(/\{([a-z_]+)(?:\|([^|}]+)\|([^}]+))?\}/g, (todo, chave, um, varios) => {
    let v;
    try { v = regra(chave); } catch { return todo; }
    if (v === undefined || v === null) return todo;
    if (um) return C.plural(v, um, varios);
    return chave.startsWith('dia_') ? String(v).padStart(2, '0') : String(v);
  });
}

/** O texto da ajuda (HTML já escapado). */
export function textoDaAjuda(chave) {
  const a = AJUDA_TELAS[chave];
  if (!a) return '';
  return `<p><b>Para que serve:</b> ${esc(comRegras(a.serve))}</p>
    <p><b>O que fazer primeiro:</b></p><ol>${a.primeiro.map((p) => `<li>${esc(comRegras(p))}</li>`).join('')}</ol>
    <p><b>Exemplo:</b> ${esc(comRegras(a.exemplo))}</p>`;
}

const ajudasAbertas = new Set(); // a ajuda aberta continua aberta quando a mesma tela é desenhada de novo

/**
 * Põe o botão "?" no título (1º h1) da tela, se ela tem ajuda, e a caixa da explicação logo abaixo do cabeçalho
 * (fechada). Chamado a cada desenho da tela (TELAS._ligarDesconto).
 */
export function ligarAjuda(raiz, hash = globalThis.location?.hash) {
  if (!raiz || typeof raiz.querySelector !== 'function') return;
  ligarPrimeirosPassos(raiz);
  const chave = chaveDaAjuda(hash);
  const h1 = chave && raiz.querySelector('h1');
  if (!h1 || h1.querySelector('.botao-ajuda')) return;
  const id = `ajuda-${chave}`;
  const aberta = ajudasAbertas.has(chave);
  h1.insertAdjacentHTML('beforeend', ` <button type="button" class="botao-ajuda nao-imprimir" aria-controls="${id}" aria-expanded="${aberta}" title="Ajuda: para que serve esta tela e por onde começar">?</button>`);
  const depoisDe = h1.parentElement && h1.parentElement.classList.contains('cabecalho') ? h1.parentElement : h1;
  depoisDe.insertAdjacentHTML('afterend', `<div class="ajuda-tela nao-imprimir" id="${id}" role="region" aria-label="Ajuda: ${esc(AJUDA_TELAS[chave].titulo)}" ${aberta ? '' : 'hidden'}>
    ${textoDaAjuda(chave)}<p class="acoes"><button type="button" class="secundario pequeno" data-fechar-ajuda>Fechar a ajuda</button></p></div>`);
  const botao = h1.querySelector('.botao-ajuda');
  const caixa = raiz.querySelector(`#${id}`);
  const abrir = (sim) => {
    caixa.hidden = !sim;
    botao.setAttribute('aria-expanded', String(sim));
    if (sim) ajudasAbertas.add(chave); else ajudasAbertas.delete(chave);
  };
  botao.addEventListener('click', () => abrir(caixa.hidden));
  caixa.querySelector('[data-fechar-ajuda]').addEventListener('click', () => { abrir(false); botao.focus(); });
}

// --------------------------------------------------------------------------
// Primeiros passos (Painel)
// --------------------------------------------------------------------------
/**
 * Sistema que já está em uso (ex.: o da ANK/JCK) nunca mostra os primeiros passos, mesmo que falte um deles: mais de
 * 10 imóveis, mais de 24 boletos ou mais de 12 NFs.
 */
export const LIMITES_SISTEMA_NOVO = { imoveis: 10, cobrancas: 24, faturas: 12 };
export const sistemaComecando = (db) => (db.imoveis || []).length <= LIMITES_SISTEMA_NOVO.imoveis
  && (db.cobrancas || []).length <= LIMITES_SISTEMA_NOVO.cobrancas && (db.faturas || []).length <= LIMITES_SISTEMA_NOVO.faturas;

/** Algum ZIP com todos os dados já foi baixado (registro "Exportação" do Histórico)? */
const zipBaixado = (db) => (db.historico || []).some((h) => h.acao === 'Exportação' && /ZIP/.test(h.descricao || ''));

/**
 * Os 5 primeiros passos, cada um feito ou não pelo que já está nos dados (nunca por um clique): empresa cadastrada,
 * imóvel, contrato, boleto gerado e cópia dos dados (ZIP baixado ou backup seguro ligado neste computador).
 * ``depois``: passo que só dá para fazer depois de outro (o contrato precisa do imóvel; o boleto, do contrato).
 * O boleto leva ao mês certo: o do aluguel mais antigo ainda sem boleto, nunca antes do mês passado
 * (ex.: hoje 16/11/2026 e contrato com entrada em 15/11/2026 → Boletos de 11/2026).
 */
export function passosIniciais(db, { hoje = C.hojeIso(), backupLigado = false } = {}) {
  const contratos = (db.contratos || []).filter((c) => c.ativo !== false && c.imovel_id);
  const padrao = C.somarMeses(C.competenciaDe(hoje), -1);
  const entradas = contratos.map((c) => C.competenciaDe(c.data_entrada || c.vigencia_inicio || hoje)).sort();
  const mesBoleto = entradas.length && entradas[0] > padrao ? entradas[0] : padrao;
  return [
    { chave: 'empresa', feito: (db.emitentes || []).length > 0, soAdmin: true, href: '#/novo/emitentes', botao: 'Cadastrar a empresa',
      titulo: 'Dados da empresa', texto: 'Nome, CNPJ e endereço da empresa que recebe os aluguéis e emite as NFs. Digite o CNPJ: o resto vem sozinho.' },
    { chave: 'imovel', feito: (db.imoveis || []).length > 0, href: '#/novo/imoveis', botao: 'Cadastrar o primeiro imóvel',
      titulo: 'Primeiro imóvel', texto: 'Endereço (pelo CEP), matrícula e as contas de água e luz.' },
    { chave: 'contrato', feito: (db.contratos || []).length > 0, depois: 'imovel', href: '#/novo/contratos', botao: 'Cadastrar o inquilino e o contrato',
      titulo: 'Primeiro inquilino e contrato', texto: 'Quem aluga, o aluguel, o dia do vencimento e a garantia. Ex.: R$ 2.000,00, vencendo todo dia 10.' },
    { chave: 'boleto', feito: (db.cobrancas || []).length > 0, depois: 'contrato', href: `#/cobrancas?comp=${mesBoleto}`, botao: `Gerar o boleto de ${C.compBr(mesBoleto)}`,
      titulo: 'Primeiro boleto', texto: `Na tela Boletos, gere os boletos do aluguel de ${C.compBr(mesBoleto)}: o sistema calcula o valor de cada inquilino.` },
    { chave: 'backup', feito: zipBaixado(db) || !!backupLigado, href: '#/dados', botao: 'Fazer a cópia dos dados',
      titulo: 'Cópia de segurança (backup)', texto: 'Baixe o ZIP com todos os dados (em Dados e backup) e guarde fora do computador, num pen drive ou no seu e-mail.' },
  ];
}

// "Já sei usar": guardado neste navegador, por login (outro usuário no mesmo computador continua vendo)
const CHAVE_ESCONDIDOS = 'primeiros-passos-escondidos';
function escondidos() {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(CHAVE_ESCONDIDOS) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
export const passosEscondidos = (quem) => escondidos().includes(String(quem || ''));
export function esconderPassos(quem, esconder = true) {
  const lista = escondidos().filter((x) => x !== String(quem || ''));
  if (esconder) lista.push(String(quem || ''));
  try { globalThis.localStorage?.setItem(CHAVE_ESCONDIDOS, JSON.stringify(lista)); } catch { /* sem localStorage: só nesta vez */ }
}

/** Os primeiros passos aparecem? Só em sistema começando, com algum passo por fazer e sem o "Já sei usar". */
export function mostrarPassos(db, quem, opcoes = {}) {
  if (!sistemaComecando(db) || passosEscondidos(quem)) return false;
  return passosIniciais(db, opcoes).some((p) => !p.feito);
}

/**
 * Caixa do Painel: os 5 passos, com ✓ no que já foi feito e o botão de cada um que falta (o próximo em destaque).
 * ``pode``: o usuário lança (operador ou administrador); ``admin``: só ele cadastra a empresa.
 */
export function caixaPrimeirosPassos(db, { quem = '', pode = true, admin = false, hoje, backupLigado = false } = {}) {
  if (!pode || !mostrarPassos(db, quem, { hoje, backupLigado })) return '';
  const passos = passosIniciais(db, { hoje, backupLigado });
  const feitos = passos.filter((p) => p.feito).length;
  const proximo = passos.find((p) => !p.feito && !(p.soAdmin && !admin) && !(p.depois && !passos.find((x) => x.chave === p.depois).feito));
  const item = (p, n) => {
    const espera = p.depois && !passos.find((x) => x.chave === p.depois).feito;
    const acao = p.feito ? '<span class="passo-feito">feito</span>'
      : p.soAdmin && !admin ? '<span class="suave">(o administrador faz)</span>'
        : espera ? `<span class="suave">(depois do passo ${passos.findIndex((x) => x.chave === p.depois) + 1})</span>`
          : `<a class="botao${p === proximo ? '' : ' secundario'} pequeno" href="${esc(p.href)}">${esc(p.botao)}</a>`;
    return `<li class="${p.feito ? 'feito' : ''}"><span class="passo-numero" aria-hidden="true">${p.feito ? '✓' : n}</span>
      <div><b>${esc(p.titulo)}</b><br><span class="suave">${esc(p.texto)}</span><div class="passo-acao">${acao}</div></div></li>`;
  };
  return `<div class="primeiros-passos" id="primeiros-passos">
    <div class="cabecalho"><h2>Primeiros passos <span class="suave">(${feitos} de ${passos.length} feitos)</span></h2>
      <button type="button" class="secundario pequeno" data-esconder-passos="${esc(quem)}" title="Esconder esta caixa. Para ver de novo: Dados e backup">Já sei usar</button></div>
    <p class="suave">Para começar a usar o sistema, siga os passos na ordem. Cada um fica marcado com ✓ sozinho quando estiver feito. Em cada tela, o botão <b>?</b> ao lado do título explica para que ela serve.</p>
    <ol class="lista-passos">${passos.map((p, i) => item(p, i + 1)).join('')}</ol></div>`;
}

/** Dados e backup: com os primeiros passos escondidos (e ainda por fazer), o botão que os traz de volta ao Painel. */
export function caixaReabrirPassos(db, quem, opcoes = {}) {
  if (!passosEscondidos(quem) || !sistemaComecando(db) || !passosIniciais(db, opcoes).some((p) => !p.feito)) return '';
  return `<div class="cartao" id="reabrir-passos"><h2>Primeiros passos</h2><p>A lista dos primeiros passos (empresa, imóvel, contrato, boleto e backup) está escondida no Painel.</p>
    <p><button type="button" class="secundario pequeno" data-mostrar-passos="${esc(quem)}">Mostrar os primeiros passos no Painel</button></p></div>`;
}

/** Botões "Já sei usar" (Painel) e "Mostrar os primeiros passos" (Dados e backup). */
function ligarPrimeirosPassos(raiz) {
  const esconder = raiz.querySelector('[data-esconder-passos]');
  if (esconder) {
    esconder.addEventListener('click', () => {
      esconderPassos(esconder.dataset.esconderPassos, true);
      esconder.closest('.primeiros-passos')?.remove();
    });
  }
  const mostrar = raiz.querySelector('[data-mostrar-passos]');
  if (mostrar) {
    mostrar.addEventListener('click', () => {
      esconderPassos(mostrar.dataset.mostrarPassos, false);
      globalThis.location.hash = '#/';
    });
  }
}

// --------------------------------------------------------------------------
// Listas vazias: o próximo passo
// --------------------------------------------------------------------------
/**
 * Lista vazia: em vez de só "nenhum registro", o que fazer agora e o botão para fazer. ``botoes``: [[endereço, texto]]
 * (o 1º em destaque) ou o HTML de um botão já montado (botao() de telas/comum.js, que escapa o texto); falsos são pulados.
 * Ex.: proximoPasso('Nenhum imóvel ainda.', 'Comece pelo primeiro.', [['#/novo/imoveis', 'Cadastrar']]).
 */
export function proximoPasso(titulo, texto, botoes = []) {
  const lista = botoes.filter(Boolean);
  const um = (b, i) => (typeof b === 'string' ? b : `<a class="botao${i ? ' secundario' : ''} pequeno" href="${esc(b[0])}">${esc(b[1])}</a>`);
  return `<div class="proximo-passo"><b>${esc(titulo)}</b>${texto ? ` <span>${esc(texto)}</span>` : ''}${lista.length
    ? `<div class="acoes">${lista.map(um).join(' ')}</div>` : ''}</div>`;
}
