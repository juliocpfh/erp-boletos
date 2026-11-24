// ACOES: o que cada botão faz (data-acao="nome"), com os auxiliares de PDF, Excel, exclusão (TABELAS_EXCLUSAO) e reajuste.
import { alterar, atualizarCopiaAberta, aviso, confirmar, podeSairDaTela, backupCompletoSeguro, baixar, bibliotecasPdf, conectarSeguro, E, escolherPasta, excelJs, ir, janela, jsPdf, jsZip, login, mostrar, naFilaSegura, pastaSeguraDeTeste, podeUsuario, reabrirPastaLembrada, sair, statusDoBotao } from '../app.js';
import * as S from '../armazenamento.js';
import { PAPEIS } from '../auth.js';
import * as B from '../backup-seguro.js';
import * as BANCO from '../banco.js';
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import * as CP from '../compactar.js';
import * as CPF from '../conferir-pdf.js';
import * as Z from '../conciliacao.js';
import * as K from '../contratos.js';
import { avisosDeCorte, cortesDaFatura, encaixarFaturas, faturaExcel, faturaHtml } from '../fatura.js';
import { ACEITA_DOCUMENTOS, atalhosData, chipDaLista, dinheiroTexto, esc } from '../formularios.js';
import { MODELOS_PADRAO } from '../modelos-contrato.js';
import * as R from '../regras.js';
import { desfazerItens, dispensarAvisoSeguro } from './admin.js';
import { ACOES_BANCO } from './banco.js';
import { ACOES_FICHAS } from './fichas.js';
import { ACOES_TERMO } from './termo-reserva.js';
import { ACOES_EMAILS } from './emails.js';
import { htmlSaude } from './banco-c6.js';
import { ANEXOS_COM_X, CADASTROS, nomeComprovante } from './cadastros.js';
import { CAMPOS_PESSOA_FORM, guardarRascunhoVistoria, indicesMensaisFci } from './campos.js';
import { oQueContinuaDoAditivo } from './contrato.js';
import { adiados, alterarApagandoAnexos, anexosEmUso, botao, apagarAnexos, apagarPastaDaFicha, nomePastaFicha, arquivoApagadoNoFormulario, buscar, carregarParte, chavePasta, parteAdiada, conferirArquivos, conferirHerancas, d, ehMatricula, encerrarLinksDaFicha, extensao, memoria, nomePastaContrato, opera, ordenar, pastaDoEscopo, pastaPaiContrato, salvarAssinado, semAcentoArquivo, SO_ADMIN_NUMERACAO, vinculoDoEscopo } from './comum.js';
import { ACOES_ICONE } from './icone.js';
import { alertasAbertos } from './comum.js';
import { ACOES_PASTA } from './arquivo-impresso.js';
import { ACOES_NOTIFICACOES } from './notificacoes.js';
import { ACOES_PROVAS } from './cobranca-provas.js';
import { ACOES_COMUNICACOES } from './comunicacoes.js';
import { alvoDoRecibo, documentoMontado, guardarCartaNaPasta, logoPng, MODELO_COMODOS, modelosNoBanco, pdfDaCarta, pdfDoDocumento, pdfDoRecibo, roteiroTexto } from './documentos.js';
import * as AS from '../assinatura.js';
import * as REC from '../recibos.js';
import { confirmarPagamentoBoleto } from './envios.js';
import { siglaEmpresa } from './faturas.js';

// --------------------------------------------------------------------------
// Botões
// --------------------------------------------------------------------------
async function modeloFatura() {
  try {
    const dir = await E.pasta.getDirectoryHandle(S.PASTA_MODELOS);
    return await (await (await dir.getFileHandle(S.MODELO_FATURA)).getFile()).arrayBuffer();
  } catch {
    // versão de arquivo único: o modelo padrão vem embutido
    if (window.MODELO_FATURA_BASE64) return Uint8Array.from(atob(window.MODELO_FATURA_BASE64), (ch) => ch.charCodeAt(0)).buffer;
    const r = await fetch('modelos/fatura-modelo.xlsx');
    if (!r.ok) throw new Error('Modelo da NF não encontrado.');
    return r.arrayBuffer();
  }
}

const megas = (b) => `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

/**
 * Barra de progresso do ZIP com tudo (backup completo, "Baixar ZIP"): na nuvem cada anexo é baixado um a um e leva minutos.
 * Desenha no elemento `id` e, enquanto roda, o navegador pergunta antes de recarregar ou fechar a página. `fim()` limpa.
 */
function andamentoZip(id) {
  const el = document.getElementById(id);
  const segurar = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
  window.addEventListener('beforeunload', segurar);
  let ultimo = 0;
  let pctAntes = -1;
  const desenhar = (valor, maximo, texto, detalhe = '') => {
    if (!el) return;
    el.innerHTML = `<div class="alerta info"><p><progress ${maximo ? `max="${maximo}" value="${valor}"` : ''} style="width:100%"></progress></p>
      <p><b>${esc(texto)}</b><br><span class="suave">${esc(detalhe)}</span></p>
      <p class="suave">Pode levar alguns minutos. <b>Não recarregue nem feche a página</b> até terminar.</p></div>`;
  };
  return {
    aoAndar(p) {
      const agora = Date.now();
      if (p.fase === 'arquivos' && p.feitos && agora - ultimo < 150) return; // sem redesenhar a cada arquivo pequeno
      if (p.fase === 'compactando' && Math.round(p.pct) === pctAntes) return;
      ultimo = agora;
      if (p.fase === 'compactando') pctAntes = Math.round(p.pct);
      if (p.fase === 'esperando') desenhar(0, 0, 'Começando…', 'Esperando a cópia de segurança anterior terminar.');
      else if (p.fase === 'listando') desenhar(0, 0, 'Procurando os anexos…');
      else if (p.fase === 'arquivos') {
        desenhar(p.totalBytes ? p.bytes : p.feitos, p.totalBytes || p.total, `Baixando os anexos: ${p.feitos + 1} de ${p.total}`
          + (p.totalBytes ? ` (${megas(p.bytes)} de ${megas(p.totalBytes)})` : ''), p.nome);
      } else if (p.fase === 'compactando') desenhar(Math.round(p.pct), 100, `Compactando: ${Math.round(p.pct)}%`);
      else if (p.fase === 'gravando') desenhar(0, 0, 'Cifrando e gravando na pasta segura…');
    },
    fim() {
      window.removeEventListener('beforeunload', segurar);
      if (el) el.innerHTML = '';
    },
  };
}

/**
 * Celular: o anexo abre na própria tela (visualizador.js, que só carrega aqui). Devolve false para abrir como no computador
 * (aba nova), inclusive se o visualizador não carregar (sem internet e ainda não guardado no aparelho).
 * ``esperar``: termina só quando o arquivo estiver desenhado.
 */
/** Abre o arquivo numa aba nova; o endereço temporário é liberado 1 minuto depois (a aba já carregou; antes ficava na memória até fechar o sistema). */
function abrirEmAbaNova(blob, opcoes = '') {
  const url = URL.createObjectURL(blob);
  if (opcoes) window.open(url, '_blank', opcoes); else window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function noVisualizador(blob, nome, tipo, esperar = true) {
  let V;
  try { V = await import('../visualizador.js'); } catch { return false; }
  if (!V.usarVisualizador()) return false;
  const desenho = V.visualizar(blob, nome, tipo, baixar);
  if (esperar) await desenho;
  return true;
}

async function excelDoNumero(ExcelJS, modelo, numero) {
  const fs = E.d.faturas.filter((f) => f.numero === Number(numero) && f.situacao === 'Emitida').sort((a, b) => a.id - b.id);
  if (!fs.length) throw new C.ErroUsuario('Esta NF não existe mais (pode ter sido cancelada ou apagada). Atualize a página.');
  const blob = await faturaExcel(ExcelJS, modelo, fs, E.d.emitentes);
  return { blob, nome: S.limparNome(`NF ${R.numeroFatura(numero)} - ${fs[0].tomador_nome}.xlsx`) };
}

/**
 * Exclusões grandes: o que sai junto, contado (contrato: todas as tabelas com o contrato_id dele, como R.excluirContrato;
 * imóvel: IPTU, despesas, reformas, leituras, vistorias, seguros, participações e titularidades). Devolve { itens, arquivos }.
 */
const EXCLUSAO_GRANDE = { contratos: true, imoveis: true, fichas: true };
const NOMES_NA_EXCLUSAO = {
  cobrancas: ['boleto', 'boletos'], vistorias: ['vistoria', 'vistorias'], aditivos: ['termo aditivo', 'termos aditivos'], fiadores: ['fiador', 'fiadores'],
  seguros: ['apólice de seguro', 'apólices de seguro'], acordos: ['acordo', 'acordos'], cartas_reajuste: ['carta de reajuste', 'cartas de reajuste'],
  leituras: ['leitura dos relógios', 'leituras dos relógios'], iptus: ['IPTU', 'IPTUs'], despesas: ['conta ou despesa', 'contas e despesas'],
  reformas: ['reforma', 'reformas'], titularidades: ['registro de titularidade', 'registros de titularidade'], participacoes: ['participação de empresa', 'participações de empresas'],
  depositos_garantia: ['depósito da garantia', 'depósitos da garantia'], aplicacoes: ['aplicação da garantia', 'aplicações da garantia'],
  correcoes: ['correção do aluguel', 'correções do aluguel'], ressarcimentos: ['ressarcimento', 'ressarcimentos'], solicitacoes: ['solicitação', 'solicitações'],
};
const TABELAS_DO_IMOVEL = ['participacoes', 'seguros', 'leituras', 'reformas', 'iptus', 'titularidades', 'despesas', 'vistorias'];
export function oQueSaiNaExclusao(db, tabela, reg) {
  const conta = {};
  if (tabela === 'contratos') {
    for (const t of Object.keys(R.TABELAS)) {
      if (['contratos', 'faturas', 'movimentacoes_banco', 'pagamentos_banco'].includes(t) || !Array.isArray(db[t])) continue;
      const n = db[t].filter((x) => x && x.contrato_id === reg.id).length;
      if (n) conta[t] = n;
    }
  }
  if (tabela === 'imoveis') for (const t of TABELAS_DO_IMOVEL) { const n = (db[t] || []).filter((p) => p.imovel_id === reg.id).length; if (n) conta[t] = n; }
  const itens = [];
  let outros = 0;
  for (const [t, n] of Object.entries(conta)) {
    const nomes = NOMES_NA_EXCLUSAO[t];
    if (nomes) itens.push(`${n} ${n === 1 ? nomes[0] : nomes[1]}`); else outros += n;
  }
  if (outros) itens.push(`${outros} outro(s) registro(s) ligados a ele`);
  // pagamentos já recebidos saem junto: a receita some dos Resultados (item 10 do teste de ponta a ponta)
  const pagos = tabela === 'contratos' ? db.cobrancas.filter((cb) => cb.contrato_id === reg.id && cb.data_pagamento) : [];
  if (pagos.length) itens.unshift(`ATENÇÃO: ${pagos.length} ${pagos.length === 1 ? 'pagamento recebido' : 'pagamentos recebidos'} (${reais(pagos.reduce((t, cb) => t + (cb.valor_pago || 0), 0))}), que saem dos Resultados`);
  const arquivos = tabela === 'contratos'
    ? R.arquivosReferenciados(db).filter((a) => ['contrato', 'assinados', 'aditivos', 'seguro'].includes(a.escopo) && Number(a.id) === reg.id).length : 0;
  return { itens, arquivos };
}

/** Dupla confirmação: 1ª janela mostra o nome e o que sai junto; 2ª pede para digitar APAGAR. Devolve true para seguir. */
async function confirmarExclusaoGrande(tabela, r) {
  const quem = { contratos: `o contrato de ${r.inquilino_nome}`, imoveis: `o imóvel ${r.nome}`, fichas: `a ficha de ${r.inquilino_nome}` }[tabela];
  const { itens, arquivos } = oQueSaiNaExclusao(d(), tabela, r);
  const fica = { contratos: 'Documentos postos à mão na pasta do inquilino ficam guardados.', imoveis: 'Os arquivos da pasta do imóvel ficam guardados.', fichas: 'Os documentos da pasta da ficha são apagados juntos.' }[tabela];
  const lista = [...itens, arquivos && `${arquivos} arquivo(s) que o sistema guardou (comprovantes, documentos assinados, apólices)`].filter(Boolean);
  const primeira = await janela({ titulo: `Excluir ${quem}?`, forte: true, sim: 'Continuar', html: `<p>Você vai excluir <b>${esc(quem)}</b>.</p>
    ${lista.length ? `<p>Sai junto:</p><ul>${lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<p class="suave">${esc(fica)}</p>` });
  if (!primeira) return false;
  const rotulo = { contratos: 'Excluir contrato', imoveis: 'Excluir imóvel', fichas: 'Excluir ficha' }[tabela];
  const segunda = await janela({ titulo: 'Última confirmação', forte: true, sim: rotulo,
    html: `<p>Para excluir <b>${esc(quem)}</b>, digite <b>APAGAR</b> no campo abaixo.</p>
      <p><input name="digitado" autocomplete="off" aria-label="Digite APAGAR para confirmar" style="max-width:220px"></p>`,
    ligar: (dlg) => dlg.querySelector('input[name=digitado]')?.focus() });
  if (!segunda) return false;
  if (String((segunda.digitado || [''])[0]).trim().toUpperCase() !== 'APAGAR') throw new C.ErroUsuario('Nada foi excluído: para confirmar, é preciso digitar APAGAR.');
  return true;
}

/**
 * Por que o imóvel não pode ser excluído (texto) ou null. Além dos inquilinos, o que não sai junto com ele: ganhos do Airbnb,
 * NFs avulsas e o que está ligado ao extrato ou ao C6 (a movimentação ficaria apontando para um registro apagado). Item 18.
 */
export function motivoNaoExcluirImovel(db, r) {
  if (db.contratos.some((c) => c.imovel_id === r.id)) return 'Este imóvel tem inquilinos. Exclua os contratos antes.';
  // ficha aberta (em análise ou aprovada sem contrato) para o imóvel: ficava com "falta o contrato" para sempre (FIC-05)
  const ficha = R.fichaAbertaDoImovel(db, r.id);
  if (ficha) return `Este imóvel está na ficha de ${ficha.inquilino_nome}, ainda em aberto (${ficha.situacao}). Decida a ficha (reprovar ou "Desistiu") ou desmarque o imóvel nela antes.`;
  if ((db.ganhos_airbnb || []).some((g) => g.imovel_id === r.id)) return 'Este imóvel tem ganhos do Airbnb lançados. Exclua os ganhos antes.';
  if ((db.avulsas || []).some((a) => a.imovel_id === r.id)) return 'Este imóvel tem NFs avulsas. Exclua as NFs avulsas antes.';
  const doImovel = (t) => (db[t] || []).filter((x) => x.imovel_id === r.id);
  const despesas = new Set(doImovel('despesas').map((x) => x.id)); const iptus = new Set(doImovel('iptus').map((x) => x.id));
  const reformas = new Set(doImovel('reformas').map((x) => x.id));
  const ligadas = (db.movimentacoes_banco || []).some((m) => m.imovel_id === r.id || despesas.has(m.despesa_id) || iptus.has(m.iptu_id) || reformas.has(m.reforma_id))
    || doImovel('despesas').some((x) => x.movimentacao_id || x.pagamento_banco_id)
    || (db.pagamentos_banco || []).some((p) => p.origem && ((p.origem.tipo === 'iptu' && iptus.has(Number(p.origem.id))) || (p.origem.tipo === 'despesa' && despesas.has(Number(p.origem.id)))) && !['cancelado', 'erro'].includes(p.situacao));
  return ligadas ? 'Este imóvel tem lançamentos ligados ao extrato ou a pagamentos do banco: desfaça o destino das movimentações na tela Banco antes.' : null;
}

/**
 * "Baixar PDF" do documento da tela no mesmo tamanho em qualquer aparelho (mutirão 19/11, iphone-002/003/004): no celular a
 * tela tem uns 400 px e essa largura virava a folha A4 inteira (letra gigante, 24 folhas em vez de 7, coluna do valor cortada).
 * Tela estreita: fotografa uma cópia desenhada fora da tela com 860 px (como o PDF que vai no e-mail, ``pdfDaCarta``). No
 * computador continua a do próprio documento (o PDF não muda).
 */
async function pdfNaLarguraDaFolha(el, rodape, opcoes) {
  if (el.offsetWidth >= 700) return pdfDoDocumento(el, rodape, opcoes);
  const caixa = document.createElement('div');
  caixa.className = 'impressao';
  caixa.style.cssText = 'position:absolute;left:-10000px;top:0;width:860px';
  const copia = el.cloneNode(true);
  copia.style.maxWidth = 'none';
  caixa.append(copia);
  document.body.append(caixa);
  try {
    return await pdfDoDocumento(copia, rodape, opcoes);
  } finally {
    caixa.remove();
  }
}

/**
 * Por que o contrato não pode ser excluído (texto) ou null (mutirão 19/11, saida-008/034/035): NF emitida; boleto emitido no
 * C6 e em aberto no banco (o inquilino ainda pode pagá-lo); movimentação do extrato ligada a um boleto dele (ficaria apontando
 * para um boleto apagado); contrato que continua com o novo titular numa troca (o novo perderia o que herda dele).
 */
export function motivoNaoExcluirContrato(db, r) {
  const boletos = db.cobrancas.filter((cb) => cb.contrato_id === r.id);
  if (boletos.some((cb) => R.faturasDe(db, 'cobranca', cb.id, false).length)) return 'Este contrato tem NFs emitidas e não pode ser excluído.';
  if (boletos.some((cb) => cb.banco && cb.banco.situacao === 'emitido')) return 'Este contrato tem boleto emitido no C6 e em aberto no banco. Cancele no banco antes de excluir.';
  const ids = new Set(boletos.map((cb) => cb.id));
  if ((db.movimentacoes_banco || []).some((m) => m.cobranca_id && ids.has(m.cobranca_id))) return 'Este contrato tem boletos ligados ao extrato: desfaça o destino das movimentações na tela Banco antes.';
  const novo = R.continuadoPor(db, r);
  if (novo) return `Este contrato continua com ${novo.inquilino_nome} (troca de titular): exclua antes o contrato do novo titular.`;
  // feito de uma ficha aprovada e ainda não assinado (busca de 24/11, FIC-04): excluir deixava a ficha presa a um contrato
  // apagado e o comprovante da reserva sumia junto; a desistência devolve a reserva e os documentos à ficha
  const ficha = r.ficha_id && !r.doc_contrato_em ? R.buscar(db, 'fichas', r.ficha_id) : null;
  if (ficha && !R.fichaSemContrato(ficha)) return `Este contrato foi feito da ficha de ${ficha.inquilino_nome} e ainda não foi assinado. Para cancelar, use "Desistiu antes de assinar" na página da ficha: o contrato sai e a reserva e os documentos voltam para a ficha. Para corrigir um dado, use "Editar".`;
  // novo titular com a troca completada: o que veio do anterior sairia junto (busca de 24/11, CON-01)
  return R.motivoNaoExcluirHerdeiro(db, r);
}

/**
 * Texto do Histórico na exclusão pelo botão da página: o mesmo da inclusão (``descricao`` de CADASTROS) com o inquilino ou o
 * imóvel (mutirão 19/11, mensal-037). Ex.: "Seguro obrigatório: Outra, vigência 01/01/2026 a 31/12/2026 · Carlos Em Dia".
 */
export function descricaoDaExclusao(db, tabela, reg) {
  let t = null;
  if (tabela === 'fichas') return `Ficha de ${reg.inquilino_nome}`;
  if (tabela === 'cobrancas') t = `Boleto de ${compBr(reg.competencia)}`;
  else { try { t = (CADASTROS[tabela] && CADASTROS[tabela].descricao) ? CADASTROS[tabela].descricao(reg, reg, { contrato: reg.contrato_id, imovel: reg.imovel_id }) : null; } catch { t = null; } }
  t = t || reg.nome || reg.descricao || null;
  const c = reg.contrato_id ? R.buscar(db, 'contratos', reg.contrato_id) : null;
  const im = !c && reg.imovel_id ? R.buscar(db, 'imoveis', reg.imovel_id) : null;
  const quem = c ? c.inquilino_nome : im ? im.nome : '';
  if (!t) return quem ? `${R.TABELAS[tabela] || tabela} · ${quem}` : null;
  return quem && !String(t).includes(quem) ? `${t} · ${quem}` : t;
}

/** Tela de onde vem uma impressão (para o "Voltar" da aba nova). Ex.: #/imprimir/faturas?mes=2026-01 → #/faturas?mes=2026-01. */
export function origemDaImpressao(hash) {
  const [caminho, consulta = ''] = String(hash || '').replace(/^#\/?/, '').split('?');
  const q = new URLSearchParams(consulta);
  const tela = caminho.split('/')[1] || '';
  if (tela === 'faturas') return q.get('mes') ? `#/faturas?mes=${q.get('mes')}` : '#/faturas';
  if (tela === 'demonstrativos' && q.get('comp')) return `#/cobrancas?comp=${q.get('comp')}`;
  if (/^\d+$/.test(q.get('contrato') || '')) return `#/contrato/${q.get('contrato')}`;
  if (/^\d+$/.test(q.get('ficha') || '')) return `#/ficha/${q.get('ficha')}`;
  return '#/';
}

const TABELAS_EXCLUSAO = {
  imoveis: { admin: true, checar: (db, r) => motivoNaoExcluirImovel(db, r), voltar: () => '#/imoveis' },
  contratos: { admin: true, checar: (db, r) => motivoNaoExcluirContrato(db, r), voltar: (r) => (r.imovel_id ? `#/imovel/${r.imovel_id}` : '#/inquilinos') },
  cobrancas: { checar: (db, r) => (R.emAcordo(r) || R.ehParcelaAcordo(r) ? 'Este boleto faz parte de um acordo: use "Desfazer o acordo" na página do boleto.' : R.faturasDe(db, 'cobranca', r.id, false).length ? 'Este boleto tem NF. Desfaça o pagamento antes.' : r.banco && r.banco.situacao === 'emitido' ? 'Este boleto foi emitido no C6 e está em aberto no banco. Cancele no banco antes de excluir.' : R.motivoNaoExcluirParcelaCaucao(db, r)),
    // parcela do complemento da caução: as outras (em aberto) saem juntas e o complemento volta a "Caução a completar"
    depois: (db, r) => R.excluirParcelasIrmas(db, r, login()), voltar: (r) => `#/cobrancas?comp=${r.competencia}` },
  correcoes: { recalcular: (db, r) => (cb) => cb.contrato_id === r.contrato_id },
  iptus: {
    // parcela paga pelo extrato ou pelo C6: a movimentação ficaria apontando para um IPTU apagado (mutirão 3000, item 19)
    checar: (db, r) => ((db.movimentacoes_banco || []).some((m) => m.iptu_id === r.id) || [0, ...Object.keys(r.pagas || {})].some((n) => R.iptuPagoPeloBanco(db, r.id, n))
      ? 'Este IPTU tem parcela paga pelo banco: desfaça o destino da movimentação na tela Banco antes.' : null),
    recalcular: (db, r) => (cb) => (R.buscar(db, 'contratos', cb.contrato_id) || {}).imovel_id === r.imovel_id,
  },
  seguros: { recalcular: (db, r) => (cb) => cb.contrato_id === r.contrato_id },
  avulsas: { checar: (db, r) => (R.faturasDe(db, 'avulsa', r.id).length ? 'Esta NF avulsa já tem número.' : null) },
  // desfazer o cálculo final: os boletos que ele descontava da garantia voltam a ser cobrados; com a devolução do saldo e da
  // caução já registrada, é barrado (desfazer apagaria o registro e o comprovante: item 46)
  encerramentos: { admin: true, checar: (db, r) => (r.garantia_devolvida_em ? `A devolução já foi registrada em ${dataBr(r.garantia_devolvida_em)}. Desfaça a devolução antes (botão "Desfazer" na etapa "Devolução da garantia" do roteiro da saída, na página do inquilino) e depois desfaça o cálculo final.` : R.motivoNaoDesfazerSaldo(db, r)),
    // boleto do saldo (2026-11-20): em aberto sai junto; pago, emitido no C6 ou em acordo, barra com a explicação
    depois: (db, reg) => { R.liberarBoletosDaSaida(db, reg.id, login()); R.excluirBoletoDoSaldo(db, reg.id, login()); } },
  vistorias: { admin: true, voltar: (r) => `#/contrato/${r.contrato_id}?ir=documentos` },
  aditivos: { depois: (db, r) => R.marcarAditivos(db, r.contrato_id, login()), voltar: (r) => `#/contrato/${r.contrato_id}?ir=aditivos` },
  fiadores: { voltar: (r) => `#/contrato/${r.contrato_id}?ir=garantia` },
  // a devolução da troca de titular descontava boletos em aberto: eles voltam a ser cobrados
  devolucoes_garantia: { depois: (db, r) => R.liberarBoletosDaDevolucao(db, r.id, login()), voltar: (r) => `#/contrato/${r.contrato_id}?ir=garantia` },
  // ficha: só o administrador exclui; os documentos da pasta dela saem juntos (ACOES.excluir)
  // reserva recebida e não devolvida: o registro e o comprovante do dinheiro de terceiro sumiriam (mutirão 19/11, entrada-023)
  fichas: { admin: true, checar: (db, r) => (db.contratos.some((c) => c.ficha_id === r.id) ? 'Esta ficha já virou contrato e não pode ser excluída.'
    : r.reserva_valor > 0 && (r.reserva_data || r.comprovante_reserva) && !r.devolucao_data ? `Esta ficha tem reserva de ${reais(r.reserva_valor)} recebida e não devolvida: registre a devolução da reserva antes de excluir.` : null), voltar: () => '#/inquilinos?ir=fichas' },
  depositos_garantia: { depois: (db, r) => (r.complementar ? null : R.acertarGarantiaDepositada(db, r.contrato_id, r.qual, login())), voltar: (r) => `#/contrato/${r.contrato_id}?ir=garantia` },
  despesas: { checar: (db, r) => (r.movimentacao_id || r.pagamento_banco_id ? 'Esta conta veio do banco: desfaça o destino da movimentação na tela Banco.' : null) },
  ganhos_airbnb: {
    checar: (db, r) => {
      if (r.movimentacao_id) return 'Este ganho veio do extrato: desfaça o destino da movimentação na tela Banco.';
      const m = R.airbnbDoMes(db, r.competencia);
      return m.numerada ? `A NF do Airbnb de ${compBr(r.competencia)} já foi numerada: este ganho não pode ser excluído.` : null;
    },
  },
  ressarcimentos: {
    checar: (db, r) => ((R.boletoDoMes(db, r.contrato_id, r.competencia_abatimento) || {}).data_pagamento
      ? 'Este ressarcimento já foi abatido num boleto pago. Desfaça o pagamento antes.' : null),
    depois: (db, r) => R.aplicarRessarcimentos(db, R.buscar(db, 'contratos', r.contrato_id), r.competencia_abatimento, login()),
    voltar: (r) => `#/contrato/${r.contrato_id}?ir=ressarcimentos`,
  },
};

/**
 * Lista de opções editada dentro do formulário (concessionárias, índices): acerta na hora só o que mostra a lista (as
 * opções do campo e os itens da caixa "Editar lista"), sem desenhar a página de novo: o que já foi digitado ou escolhido
 * (inclusive o arquivo do comprovante) continua. ``incluido`` passa a ficar escolhido no campo da caixa usada (``el``).
 */
function acertarListaNaTela(el, lista, { incluido = null, removido = null }) {
  const usada = el.closest('[data-editor]');
  for (const editor of document.querySelectorAll('[data-editor]')) {
    if (editor.dataset.editor !== lista) continue;
    const sel = editor.parentElement.querySelector('select');
    const chips = editor.querySelector('.chips');
    if (incluido !== null) {
      chips.insertAdjacentHTML('beforeend', chipDaLista(lista, incluido));
      if (sel && ![...sel.options].some((o) => o.value === incluido)) sel.add(new Option(incluido, incluido));
      if (sel && editor === usada) {
        sel.value = incluido;
        sel.dispatchEvent(new Event('change', { bubbles: true })); // campos que aparecem conforme a escolha
      }
    }
    if (removido !== null) {
      for (const b of chips.querySelectorAll('[data-acao=removerDaLista]')) if (b.dataset.valor === removido) b.closest('.chip').remove();
      // a opção escolhida neste formulário fica até ele ser salvo (como acontecia ao desenhar de novo)
      if (sel) for (const o of [...sel.options]) if (o.value === removido && !o.selected) o.remove();
    }
  }
}

// --------------------------------------------------------------------------
// Banco (C6): auxiliares das ações de boleto
// --------------------------------------------------------------------------
/**
 * Conta que emite: no modo "padrão" a conta padrão (ANK); no modo "escolher", pergunta numa janela com as contas configuradas,
 * pré-marcada a da empresa do imóvel (se uma só) ou a padrão. ``lote``: texto da pergunta para vários boletos. null = cancelou.
 */
async function escolherContaC6(cb, lote = '') {
  const sugerida = cb && R.contaSugerida(d(), cb);
  if (sugerida && !lote) return sugerida;
  const contas = R.configBanco(d()).contas;
  if (!contas.length) throw new C.ErroUsuario('Nenhuma conta bancária cadastrada: configure em Sistema → Banco → Banco (C6).');
  if (contas.length === 1) return contas[0];
  const marcada = cb ? R.contaPreMarcada(d(), cb) : R.contaEmissora(d());
  const resp = await janela({ titulo: 'Por qual empresa emitir o boleto?',
    html: `<p>${lote || `Boleto de <b>${esc(buscar('contratos', cb.contrato_id).inquilino_nome)}</b> (${esc(compBr(cb.competencia))}, ${esc(reais(R.totais(cb).a_pagar_sem_desconto))}).`} Escolha a conta do C6 que recebe:</p>
      ${contas.map((x) => `<p><label class="check-mini"><input type="radio" name="conta" value="${esc(x.id)}" ${marcada && marcada.id === x.id ? 'checked' : ''}> <b>${esc((buscar('emitentes', x.emitente_id) || {}).nome || x.apelido)}</b> · conta ${esc(x.apelido)}${x.ambiente === 'sandbox' ? ' (sandbox: teste)' : ''}</label></p>`).join('')}
      <p class="suave">Para não perguntar, escolha "Sempre pela empresa padrão" em Sistema → Banco.</p>`,
    sim: 'Emitir', nao: 'Cancelar' });
  if (!resp) return null;
  return R.contaBanco(d(), String((resp.conta || [])[0] || ''));
}

/** A conta tem chave Pix no site, mas o boleto veio sem o Pix: a ponte não tem a chave (C6_<CONTA>_CHAVE_PIX). Texto do aviso ou ''. */
const avisoSemPix = (conta, banco) => (conta && conta.chave_pix && !banco.pix_copia_cola && banco.situacao !== 'erro'
  ? `O boleto saiu sem o Pix: a ponte não tem a chave Pix desta conta (C6_${String(conta.id).toUpperCase()}_CHAVE_PIX). O inquilino paga só pela linha digitável.` : '');

/**
 * Antes de cancelar ou negativar: pergunta ao banco como o boleto está agora (a situação guardada pode ser velha). Pago ou "pago,
 * aguardando crédito": não faz nada e avisa.
 */
async function conferirAntesDeAgirNoBanco(id, acao) {
  const cb = buscar('cobrancas', id);
  const resposta = await BANCO.consultarBoleto(d(), cb);
  const banco = await alterar((db) => R.registrarBoletoBancario(db, cb.id, resposta, login()));
  if (banco.situacao === 'pago' || R.aguardandoCredito({ banco })) {
    throw new C.ErroUsuario(`O banco informa que este boleto já foi pago${R.aguardandoCredito({ banco }) ? ' (o crédito ainda está sendo confirmado)' : ''}: não dá para ${acao}. Registre o pagamento na página do boleto.`);
  }
  if (banco.situacao !== 'emitido') throw new C.ErroUsuario(`O banco informa que este boleto não está em aberto (${banco.situacao_banco || banco.situacao}): nada foi feito.`);
}

/** Chama a ponte e grava a resposta no boleto; em falha do banco, grava o erro no boleto e repassa a mensagem. */
async function emitirNoC6(cb, conta) {
  // confere o pedido antes de marcar a emissão (erro do cadastro não deixa nada pendente)
  if (cb.vencimento < C.hojeIso()) throw new C.ErroUsuario(`O boleto de ${compBr(cb.competencia)} venceu em ${dataBr(cb.vencimento)}: o banco não aceita vencimento no passado. Mude o vencimento do boleto para hoje ou depois e emita de novo.`);
  R.pedidoBoletoC6(d(), cb, conta);
  // grava a emissão pendente ANTES de chamar a ponte: outra aba/pessoa não emite o mesmo boleto, e a nova tentativa usa a mesma referência
  const { referencia, repetir } = await alterar((db) => R.iniciarEmissaoBancaria(db, cb.id, conta, login()));
  let r;
  try {
    r = await BANCO.emitirBoleto(d(), buscar('cobrancas', cb.id), conta, { referencia, repetir });
  } catch (e) {
    if (e instanceof BANCO.ErroPonte) {
      // sem resposta certa: o boleto PODE ter sido emitido; a pendência fica e o botão vira "Conferir no banco"
      const incerto = BANCO.emissaoIncerta(e);
      await alterar((db) => R.registrarErroBancario(db, cb.id, e.message, login(), { conta_id: conta.id, ambiente: conta.ambiente, incerto }));
      if (incerto) throw new C.ErroUsuario(`Sem resposta certa do banco: o boleto pode ter sido emitido. Não emita no site do banco. Clique em "Conferir no banco" na página do boleto: o sistema usa a mesma referência e não cria outro boleto. (${e.message})`);
    } else await alterar((db) => R.desistirDaEmissao(db, cb.id, login()));
    throw e;
  }
  return alterar((db) => R.registrarBoletoBancario(db, cb.id, r.resposta, login(), { conta_id: conta.id, ambiente: r.resposta.ambiente || conta.ambiente }));
}

/**
 * Banco disse que pagou: janela com a data em que pagou e a data contábil (crédito); só grava se o usuário confirmar. ``pagamento``: o
 * que a listagem do banco informou (sugestão de Z.conciliarBoletos: data_pagamento, data_credito, valor, conta_id); sem ele, o que a
 * consulta gravou no boleto. A entrada do extrato desse dinheiro, se já foi importada, fica ligada ao boleto (como na tela Banco).
 */
async function proporPagamentoDoBanco(cb, pagamento = null) {
  const b = cb.banco || {};
  const hoje = C.hojeIso();
  const pagoEm = pagamento ? pagamento.data_pagamento : b.pago_em;
  const creditoEm = pagamento ? pagamento.data_credito : b.credito_em;
  const pagou = pagoEm || hoje;
  const credito = creditoEm || pagou;
  const contaId = (pagamento && pagamento.conta_id) || b.conta_id || null;
  const previsto = R.previstoNoPagamento(cb, credito, { dataPagou: pagou !== credito ? pagou : null });
  const valorBanco = pagamento ? pagamento.valor : (b.valor_pago ?? null);
  const difere = valorBanco !== null && valorBanco !== previsto.valor_devido;
  const resp = await janela({ titulo: 'O banco confirmou o pagamento. Registrar aqui?',
    html: `<p>Boleto de <b>${esc(buscar('contratos', cb.contrato_id).inquilino_nome)}</b> (${esc(compBr(cb.competencia))}): o C6 informa pagamento${pagoEm ? ` em <b>${esc(dataBr(pagoEm))}</b>` : ''}${valorBanco !== null ? ` de <b>${esc(reais(valorBanco))}</b>` : ''}${creditoEm ? `, creditado em <b>${esc(dataBr(creditoEm))}</b>` : ''}.</p>
      ${pagamento && pagamento.certeza !== 'exata' ? '<p class="texto-aviso">O banco não diz qual boleto é: casado pelo valor e pela data. Confira o inquilino e o mês.</p>' : ''}
      <p><label>Pagou em</label><input type="date" name="pagou" value="${esc(pagou)}" required>${atalhosData()}</p>
      <p><label>Dia em que o dinheiro entrou na conta (é a data da NF)</label><input type="date" name="data" value="${esc(credito)}" required>${atalhosData()}</p>
      <p>Previsto pelo sistema para essa data: <b>${esc(reais(previsto.valor_devido))}</b>${previsto.pontual ? ' (em dia)' : ` (${C.plural(previsto.dias_atraso, 'dia')} de atraso)`}.</p>
      ${difere ? `<div class="alerta aviso">O valor pago no banco (${esc(reais(valorBanco))}) é diferente do previsto. Ao confirmar, o pagamento fica registrado com o valor do banco e você informa a justificativa e o valor da NF na página do boleto.</div>` : ''}
      <p class="suave">Nada é registrado sem a sua confirmação.</p>`,
    sim: 'Confirmar pagamento', nao: 'Agora não' });
  if (!resp) { aviso(cb.banco ? 'Pagamento não registrado. O boleto continua como pago no banco; registre quando quiser pelo botão "Consultar situação".' : 'Pagamento não registrado. Registre quando quiser pela tela Banco ("Conferir boletos pagos no banco") ou na página do boleto.', 'info'); return; }
  const data = String((resp.data || [])[0] || '');
  const dataPagou = String((resp.pagou || [])[0] || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{4}-\d{2}-\d{2}$/.test(dataPagou)) throw new C.ErroUsuario('Informe as duas datas.');
  if (dataPagou > data) throw new C.ErroUsuario('O dia em que pagou não pode ser depois do dia em que o dinheiro entrou na conta.');
  // em dia até o vencimento ou, se ele não é dia útil, até o próximo dia útil
  const pagouEmDia = dataPagou <= C.limitePagamento(cb.vencimento) && data > cb.vencimento;
  if (difere && R.geraNf(buscar('contratos', cb.contrato_id))) {
    // mesmo caminho do pagamento com valor diferente digitado à mão: justificativa + valor da NF na página do boleto
    // a entrada do extrato desse dinheiro, se já importada, fica ligada ao boleto quando o pagamento for confirmado (FORMULARIOS.pagamentoNf)
    const entrada = Z.entradaDoRecebimento(d(), { conta_id: contaId, valor: valorBanco, ids: [pagamento && pagamento.external_payment_id, ...Z.identificadoresDoBoleto(cb)] });
    memoria.pagamentoDivergente = { id: cb.id, data, valor: valorBanco, pagouEmDia, dataPagou: pagouEmDia ? null : dataPagou, justificativa: `Valor informado pelo banco (C6): ${reais(valorBanco)}`, movimentacao_id: entrada ? entrada.id : null };
    ir(`#/cobranca/${cb.id}?ir=pagamento`);
    return;
  }
  let ligada = null;
  const r = await alterar((db) => {
    const res = R.registrarPagamento(db, cb.id, data, difere ? valorBanco : null, login(), { pagouEmDia, dataPagou: pagouEmDia || dataPagou === data ? null : dataPagou });
    ligada = Z.ligarEntradaDoBoleto(db, cb.id, contaId, login());
    return res;
  });
  const extrato = ligada ? ` A entrada de ${dataBr(ligada.data)} no extrato ficou ligada ao boleto.` : '';
  aviso(r.pontual ? `Pagamento em dia registrado${pagouEmDia ? ' (sem multa e juros)' : ''}. Data da NF: ${dataBr(data)}.${extrato}` : `Pagamento registrado com ${C.plural(r.dias_atraso, 'dia')} de atraso: multa ${reais(r.multa)} e juros ${reais(r.juros)}. Data da NF: ${dataBr(data)}.${extrato}`, r.pontual ? 'ok' : 'aviso');
}

/**
 * NF tem tamanho fixo: texto que não cabe sai cortado (fatura.js, LIMITES_NF). Antes de baixar em PDF ou Excel, avisa
 * o que foi cortado (até 3 avisos e "mais N").
 */
function avisarCortes(fs) {
  const cortes = avisosDeCorte(fs);
  if (!cortes.length) return;
  const mais = cortes.length > 3 ? ` E mais ${cortes.length - 3} aviso(s): veja em "Ver / imprimir NF".` : '';
  aviso(`Texto cortado na NF (tamanho fixo): ${cortes.slice(0, 3).join(' ')}${mais}`, 'aviso');
}

/** Antes de numerar: o texto que vai sair cortado nas NFs dos pagamentos marcados (ainda dá para encurtar no cadastro). */
function cortesAntesDeNumerar(pendentes) {
  return pendentes.flatMap((p) => {
    let b;
    try { b = R.baseDaFatura(E.d, p.tipo, p.registro); } catch { return []; } // o problema aparece na numeração
    const dados = { tomador_nome: b.tomador.nome, tomador_endereco: b.tomador.endereco, observacoes: b.observacoes, municipio: b.municipio || (b.imovel && b.imovel.cidade) || '' };
    return cortesDaFatura(dados).map((c) => `${b.descricao}: ${c.texto} Para sair inteiro, encurte no cadastro antes de numerar.`);
  });
}

const numerosSelecionados = () => {
  const ns = [...document.querySelectorAll('input[data-nf]:checked')].map((x) => Number(x.dataset.nf));
  if (!ns.length) throw new C.ErroUsuario('Marque pelo menos uma NF na lista.');
  return ns;
};

/** PDF de uma NF (uma empresa), com o nome "NÚMERO - EMPRESA IMÓVEL.pdf" (ex.: "0123 - ANK Loja 1.pdf"). */
async function pdfDaFatura(f) {
  const { html2canvas, jsPDF } = await bibliotecasPdf();
  const e = buscar('emitentes', f.emitente_id);
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:-20000px;top:0;background:#fff';
  caixa.innerHTML = faturaHtml(f, e);
  document.body.appendChild(caixa);
  encaixarFaturas(caixa);
  try {
    const canvas = await html2canvas(caixa.firstElementChild, { scale: 2, backgroundColor: '#ffffff' });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    let w = 190;
    let h = (canvas.height * w) / canvas.width;
    if (h > 277) { w = (w * 277) / h; h = 277; }
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (210 - w) / 2, 10, w, h);
    const imovel = R.imovelDaFatura(E.d, f);
    const nome = S.limparNome(`${R.numeroFatura(f.numero)} - ${siglaEmpresa(e)} ${imovel ? imovel.nome : f.tomador_nome}`);
    return { blob: pdf.output('blob'), nome: `${nome}.pdf` };
  } finally {
    caixa.remove();
  }
}

/** Todas as NFs (uma por empresa) dos números escolhidos, em PDFs separados dentro de um ZIP. */
async function baixarPdfs(numeros, nomeZip, emitenteId = null) {
  const fs = E.d.faturas.filter((f) => f.situacao === 'Emitida' && numeros.includes(f.numero) && (!emitenteId || f.emitente_id === emitenteId))
    .sort((a, b) => a.numero - b.numero || a.id - b.id);
  if (!fs.length) throw new C.ErroUsuario('Não há NF emitida com esses números para exportar.');
  avisarCortes(fs);
  aviso(`Gerando ${fs.length} PDF(s)…`, 'info');
  const JSZip = await jsZip();
  const zip = new JSZip();
  for (const f of fs) {
    const { blob, nome } = await pdfDaFatura(f);
    zip.file(nome, blob);
  }
  baixar(await zip.generateAsync({ type: 'blob' }), `${nomeZip}.zip`);
}

/**
 * Muda o contrato (saída, imóvel corrigido): o nome da pasta acompanha (datas e imóvel), os boletos em aberto são
 * recalculados e a pasta do inquilino é renomeada ou movida no disco.
 */
/**
 * Aviso dos boletos já pagos proporcionais que ficaram com menos dias que os ocupados (saída desfeita ou adiada):
 * a diferença não é cobrada sozinha. Ex.: " O boleto de 10/2026, já pago, cobrou 15 de 30 dias: faltam R$ 750,00 …".
 */
function textoPagosComMenosDias(id) {
  const c = buscar('contratos', id);
  const l = c ? R.pagosComMenosDias(d(), c) : [];
  if (!l.length) return '';
  return ` Atenção: ${l.map((x) => `o boleto de ${compBr(x.cobranca.competencia)}, já pago, cobrou ${x.dias_pagos} de ${x.dias_mes} dias e agora são ${x.dias_agora} (faltam ${reais(x.diferenca)})`).join('; ')}. O sistema não cobra essa diferença sozinho: lance-a no próximo boleto (cobrança adicional) ou combine com o inquilino.`;
}

async function mudarContrato(id, fn, { apagandoAnexos = false } = {}) {
  const antigo = { ...buscar('contratos', id) };
  await (apagandoAnexos ? alterarApagandoAnexos : alterar)((db) => {
    fn(db);
    const c = R.buscar(db, 'contratos', id);
    const pasta = nomePastaContrato(c);
    if (pasta !== c.pasta) R.atualizar(db, 'contratos', id, { pasta }, login(), 'Pasta de arquivos');
    R.recalcularCobrancas(db, (cb) => cb.contrato_id === id, login());
  });
  await CADASTROS.contratos.depois(buscar('contratos', id), antigo);
}

/** Aplica o reajuste (tela Reajustes) e já pergunta o boleto do complemento da caução, quando houver. */
export async function aplicarReajusteNaTela(contratoId, comp, manual = null) {
  const n = await alterar((db) => {
    R.aplicarReajuste(db, contratoId, comp, login(), manual);
    return R.recalcularCobrancas(db, (cb) => cb.contrato_id === contratoId, login());
  });
  aviso(`Correção registrada a partir do aluguel de ${compBr(comp)}.${n ? ` ${n} boleto(s) em aberto recalculado(s).` : ''}`);
  // vários reajustes atrasados do mesmo inquilino: a caução é calculada uma vez, depois do último já vencido
  const resta = R.reajustesAbertos(d(), C.hojeIso(), { contratoId }).find((r) => !r.corrigido && r.competencia <= C.competenciaDe(C.hojeIso()));
  if (resta) aviso(`Caução: o complemento é calculado depois de aplicar também o reajuste de ${compBr(resta.competencia)}.`, 'info');
  else await perguntarCaucao(contratoId);
  await mostrar();
}

/**
 * Complemento da caução depois do reajuste: janela com o vencimento (pode dar mais prazo) e as parcelas;
 * "Depois" deixa para gerar na tela Reajustes (ou sai sozinho com os boletos do mês). Caução que já cobre: confirma.
 */
/**
 * Janela do complemento da caução: troca à vista ↔ parcelado e mantém as linhas das parcelas (vencimento mensal a partir
 * do padrão; valores iguais). Mudou um valor: a última parcela se ajusta para a soma dar o complemento.
 */
function ligarParcelasCaucao(dlg, total, padrao) {
  const avista = dlg.querySelector('[data-avista]');
  const parcelado = dlg.querySelector('[data-parcelado]');
  const sel = dlg.querySelector('select[name=parcelas]');
  const linhas = dlg.querySelector('[data-linhas]');
  const somaEl = dlg.querySelector('[data-soma]');
  const cent = (t) => { try { return C.centavos(String(t || '0')); } catch { return NaN; } };
  const conferir = () => {
    const valores = [...linhas.querySelectorAll('[name=parcela_valor]')].map((el) => cent(el.value));
    const soma = valores.reduce((t, v) => t + v, 0);
    somaEl.innerHTML = soma === total ? `Soma: ${reais(soma)} ✓` : `<span class="texto-perigo">Soma: ${Number.isFinite(soma) ? reais(soma) : '?'} · o complemento é ${reais(total)}</span>`;
  };
  const montar = () => {
    const n = Number(sel.value);
    const datas = [...linhas.querySelectorAll('[name=parcela_vencimento]')].map((el) => el.value);
    linhas.innerHTML = C.parcelas(total, n).map((v, k) => `<div class="acoes"><span class="nw" style="min-width:32px">${k + 1}/${n}</span>
      <input type="date" name="parcela_vencimento" value="${datas[k] || C.somarMesesData(datas[0] || padrao, k)}" required style="width:auto">
      <input name="parcela_valor" value="${dinheiroTexto(v)}" inputmode="decimal" data-dinheiro required style="width:120px"></div>`).join('');
    conferir();
  };
  const trocar = (parcelar) => {
    avista.hidden = parcelar;
    parcelado.hidden = !parcelar;
    // os campos escondidos ficam desligados: não vão na resposta nem bloqueiam o "Gerar"
    avista.querySelectorAll('input').forEach((el) => { el.disabled = parcelar; });
    if (parcelar) { linhas.innerHTML = ''; montar(); } else linhas.innerHTML = '';
    sel.disabled = !parcelar;
  };
  dlg.querySelector('[data-parcelar]').addEventListener('click', () => { const v = avista.querySelector('[name=vencimento]').value; if (v) padrao = v; trocar(true); });
  dlg.querySelector('[data-avista-volta]').addEventListener('click', () => trocar(false));
  sel.addEventListener('change', montar);
  linhas.addEventListener('change', (ev) => {
    if (ev.target.name !== 'parcela_valor') return conferir();
    const campos = [...linhas.querySelectorAll('[name=parcela_valor]')];
    const ultimo = campos[campos.length - 1];
    if (ev.target !== ultimo) {
      const resto = total - campos.slice(0, -1).reduce((t, el) => t + cent(el.value), 0);
      if (Number.isFinite(resto)) ultimo.value = dinheiroTexto(resto);
    }
    conferir();
  });
  dlg.querySelector('form').addEventListener('submit', (ev) => {
    if (parcelado.hidden) return;
    const valores = [...linhas.querySelectorAll('[name=parcela_valor]')].map((el) => cent(el.value));
    if (valores.reduce((t, v) => t + v, 0) !== total || valores.some((v) => !(v > 0))) { ev.preventDefault(); conferir(); }
  }, true);
  sel.disabled = true;
}

async function perguntarCaucao(contratoId, comp = null) {
  const c = buscar('contratos', contratoId);
  const x = R.complementoCaucao(d(), c);
  if (!x || x.boleto) return;
  if (x.necessaria === null) { aviso('Caução: informe no contrato a quantos aluguéis ela equivale para o sistema calcular o complemento.', 'aviso'); return; }
  if (!(x.complemento > 0)) {
    const ok = await janela({ titulo: 'Caução do reajuste', sim: 'Confirmar caução', nao: 'Depois',
      html: `<p>A caução depositada (${reais(x.atual)}) já cobre o necessário (${reais(x.necessaria)}). Confirmar a caução sem boleto?</p>` });
    if (ok) await alterar((db) => R.confirmarCaucaoSemComplemento(db, contratoId, login()));
    return;
  }
  // reajuste de ano anterior: sugere o próximo vencimento (nunca uma data que já passou)
  const inicio = [x.competencia, comp || '', C.competenciaDe(C.hojeIso())].sort().pop();
  const padrao = C.vencimentoDaCompetencia(inicio, c.dia_vencimento || 10, c.cobranca_mes_seguinte !== false);
  // à vista por padrão; "Parcelar" mostra uma linha por boleto (data e valor; a última parcela fecha a soma)
  const r = await janela({ titulo: `Complemento da caução - ${c.inquilino_nome}`, sim: 'Gerar boleto(s)', nao: 'Depois',
    html: `<p>Caução depositada <b>${reais(x.atual)}</b> · necessária <b>${reais(x.necessaria)}</b> (${c.caucao_meses} aluguéis com bonificação) · complemento <b>${reais(x.complemento)}</b>.</p>
      <p class="suave">Boleto separado, sem tarifa e sem NF. Cada parcela paga soma na caução.</p>
      <div data-avista><label>Vencimento do boleto (à vista: ${reais(x.complemento)})</label><input type="date" name="vencimento" value="${padrao}" required>
        <p><button type="button" class="secundario pequeno" data-parcelar>Parcelar caução complementar</button></p></div>
      <div data-parcelado hidden><label>Parcelas (uma linha por boleto)</label><select name="parcelas">${[2, 3, 4, 5, 6].map((p) => `<option value="${p}">${p} boletos</option>`).join('')}</select>
        <div data-linhas class="caucao-parcelas"></div><div class="suave" data-soma></div>
        <p><button type="button" class="link-botao" data-avista-volta>Voltar para à vista</button></p></div>`,
    ligar: (dlg) => ligarParcelasCaucao(dlg, x.complemento, padrao) });
  if (!r) { aviso('Complemento da caução fica em "Caução a completar", na tela Reajustes.', 'info'); return; }
  const vencimento = String((r.vencimento || [])[0] || '');
  const plano = (r.parcela_vencimento || []).map((v, k) => ({ vencimento: String(v), valor: C.centavos(String(r.parcela_valor[k] || '0')) }));
  const cbs = await alterar((db) => R.gerarBoletosCaucao(db, contratoId, login(), comp, plano.length ? { plano } : { vencimento }));
  aviso(`Boleto${cbs.length > 1 ? 's' : ''} do complemento da caução gerado${cbs.length > 1 ? 's' : ''}: ${cbs.map((cb) => `${reais(cb.caucao_complemento)} vence em ${dataBr(cb.vencimento)}`).join('; ')}.`, 'ok');
}

/**
 * "Anexar arquivos" nos documentos do seguro: pergunta se é a apólice ou outro documento e de qual vigência, e liga o
 * arquivo à apólice (nome "apolice-2026-10-16-a-2027-10-16.pdf" ou "seguro-2026-10-16-a-2027-10-16-boleto.pdf").
 * Sem apólice cadastrada, ou "documento solto", fica só na pasta.
 */
async function enviarArquivosSeguro(contratoId, el) {
  const arquivos = [...el.files];
  const seguros = R.segurosDoContrato(d(), contratoId).sort((a, b) => String(b.vigencia_inicio).localeCompare(String(a.vigencia_inicio)));
  const vigente = R.seguroVigente(d(), contratoId);
  const r = seguros.length ? await janela({ titulo: `Anexar ${arquivos.length > 1 ? `${arquivos.length} arquivos` : `"${arquivos[0].name}"`} ao seguro`, sim: 'Anexar',
    html: `<p><label>O que é</label><select name="tipo"><option value="outro">Outro documento (boleto, proposta, comprovante)</option>
        <option value="apolice"${arquivos.length > 1 ? ' disabled' : ''}>Apólice${arquivos.length > 1 ? ' (anexe um arquivo por vez)' : ''}</option><option value="solto">Documento solto (sem vigência)</option></select></p>
      <p><label>Vigência da apólice</label><select name="seguro">${seguros.map((s) => `<option value="${s.id}"${vigente && s.id === vigente.id ? ' selected' : ''}>${dataBr(s.vigencia_inicio)} a ${dataBr(s.vigencia_fim)}${s.apolice ? ` · apólice ${esc(s.apolice)}` : ''}${s.arquivo_apolice ? '' : ' · sem arquivo da apólice'}</option>`).join('')}</select></p>` }) : { tipo: ['solto'] };
  el.value = '';
  if (!r) return;
  const tipo = String(r.tipo[0]);
  const s = tipo === 'solto' ? null : buscar('seguros', r.seguro[0]);
  if (s && tipo === 'apolice' && s.arquivo_apolice) throw new C.ErroUsuario(`A apólice da vigência ${dataBr(s.vigencia_inicio)} a ${dataBr(s.vigencia_fim)} já tem arquivo: apague o atual (×) antes de anexar outro. Nada foi anexado.`);
  const dir = await pastaDoEscopo('seguro', contratoId);
  const vig = s ? `${s.vigencia_inicio}-a-${s.vigencia_fim}` : '';
  const nomes = [];
  for (const f of arquivos) {
    const novo = !s ? f : new File([f], tipo === 'apolice' ? `apolice-${vig}${extensao(f.name)}` : `seguro-${vig}-${semAcentoArquivo(f.name)}`, { type: f.type });
    nomes.push(await S.salvarArquivo(dir, novo));
  }
  await alterar((db) => {
    if (s) for (const nome of nomes) R.ligarArquivoSeguro(db, s.id, nome, tipo, login());
    else R.registrar(db, login(), 'Inclusão', 'arquivos', null, `${nomes.length} arquivo(s) anexado(s) ao seguro`, { arquivos: nomes.join(', ') }, vinculoDoEscopo('seguro', contratoId));
  });
  aviso(s ? `${nomes.length} arquivo(s) ligado(s) à apólice de ${dataBr(s.vigencia_inicio)} a ${dataBr(s.vigencia_fim)}${tipo === 'apolice' ? ' (como a apólice)' : ''}.` : `${nomes.length} arquivo(s) anexado(s).`);
  await mostrar();
}

/** Tipo e consulta da tela de impressão (ex.: #/imprimir/chaves?contrato=3 → ['chaves', { contrato: '3' }]). */
function documentoDaTela() {
  const [caminho, consulta] = location.hash.replace(/^#\/?/, '').split('?');
  return [caminho.split('/')[1], C.sanearParametros(Object.fromEntries(new URLSearchParams(consulta || '')))];
}

/** Contrato ou termo das chaves baixado ou impresso: marca "gerar" na rotina de entrada do inquilino (uma vez, com a data de hoje). */
async function marcarGeradoNaRotina(tipo, m) {
  const chave = { contrato: 'contrato_gerado', chaves: 'chaves_gerado' }[tipo];
  if (!chave || !m || !m.c || !opera() || (m.c.rotina_entrada || {})[chave]) return;
  await alterar((db) => R.marcarGeradoNaRotina(db, m.c.id, chave, login()));
}

/** Janela do texto pronto ao inquilino (lembrete e 2ª via): assunto e mensagem editáveis, e-mail (canal oficial), WhatsApp e copiar. */
function janelaMensagem(titulo, l, topo = '') {
  const tel = l.telefone ? (l.telefone.length <= 11 ? `55${l.telefone}` : l.telefone) : '';
  return janela({ titulo, sim: 'Fechar', nao: '',
      html: `${topo}<p class="suave" style="margin-bottom:6px">Confira o texto (pode editar) e escolha por onde enviar. O e-mail é o canal oficial da empresa.</p>
        <p><label>Assunto</label><input name="assunto" value="${esc(l.assunto)}"></p>
        <p><label>Mensagem</label><textarea name="texto" rows="11" style="width:100%;font-family:inherit">${esc(l.texto)}</textarea></p>
        <div class="acoes"><a class="botao" data-enviar="email" href="#" target="_blank" rel="noopener">✉ Abrir e-mail${l.email ? ` para ${esc(l.email)}` : ' (sem e-mail no cadastro)'}</a>
          <a class="botao secundario" data-enviar="whatsapp" href="#" target="_blank" rel="noopener">WhatsApp${tel ? '' : ' (sem telefone)'}</a>
          <button type="button" class="secundario" data-copiar-lembrete>Copiar texto</button></div>`,
      ligar(dlg) {
        dlg.querySelector('[data-nao]').hidden = true;
        const assunto = dlg.querySelector('[name=assunto]');
        const texto = dlg.querySelector('[name=texto]');
        const email = dlg.querySelector('[data-enviar=email]');
        const zap = dlg.querySelector('[data-enviar=whatsapp]');
        const atualizar = () => {
          email.href = `mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent(assunto.value)}&body=${encodeURIComponent(texto.value)}`;
          zap.href = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto.value)}` : '#';
        };
        assunto.addEventListener('input', atualizar);
        texto.addEventListener('input', atualizar);
        atualizar();
        if (!tel) zap.addEventListener('click', (ev) => { ev.preventDefault(); aviso('Este inquilino não tem telefone no cadastro.', 'aviso'); });
        // a mesma rotina dos outros botões de copiar: com plano B e aviso se o navegador recusar (iphone-017)
        dlg.querySelector('[data-copiar-lembrete]').addEventListener('click', async (ev) => {
          try { await ACOES.copiar({ texto: texto.value }, ev.target); } catch {
            texto.select();
            aviso('O navegador não deixou copiar: o texto ficou selecionado, copie e cole na mensagem.', 'aviso');
          }
        });
      } });
}

export const ACOES = {
  escolherPasta: () => escolherPasta(),
  reabrir: () => reabrirPastaLembrada(),
  async sair() {
    if (!(await podeSairDaTela())) return; // formulário com mudança não salva (decisão do dono, 2026-11-16)
    // nuvem: tenta mandar o que falta antes; se ainda sobrar (sem internet), avisa antes de sair
    if (E.nuvem) {
      await E.nuvem.sincronizar().catch(() => {});
      await E.anexos?.enviarFila().catch(() => {});
      const n = E.nuvem.pendentesQtd() + (E.anexos?.fila?.length || 0);
      if (n && !(await confirmar(`Há ${n} alteração(ões) feitas neste aparelho que ainda não foram enviadas (sem internet).\n\n`
        + 'Elas ficam guardadas aqui e sobem sozinhas quando você entrar de novo com internet, mas o mais seguro é esperar a internet voltar e sair depois.', { titulo: 'Sair mesmo assim?', sim: 'Sair mesmo assim', nao: 'Esperar a internet' }))) return;
    }
    await sair();
  },
  async imprimir() {
    window.print();
    if (!/^#\/imprimir\/(contrato|chaves)\b/.test(location.hash)) return;
    const [tipo, q] = documentoDaTela();
    await marcarGeradoNaRotina(tipo, await documentoMontado(tipo, q));
  },

  async documentoWord() {
    const [tipo, q] = documentoDaTela();
    const m = await documentoMontado(tipo, q);
    if (!m) throw new C.ErroUsuario('Este documento não existe mais (o registro pode ter sido excluído por outra pessoa). Atualize a página.');
    await marcarGeradoNaRotina(tipo, m);
    const [JSZip, logo] = await Promise.all([jsZip(), logoPng()]);
    const i = buscar('imoveis', m.c.imovel_id);
    const blob = await K.contratoDocx(JSZip, m.blocos, { logo, rodape: m.rodape, titulo: `${m.nome} - ${m.c.inquilino_nome}` });
    baixar(blob, `${m.arquivo || `${m.nome} - ${m.c.inquilino_nome}${i ? ` - ${i.nome}` : ''}`}.docx`.replace(/[\\/:*?"<>|]/g, '-'));
  },

  /** Tela Gestão: "Relatório em PDF", o resumo do mês numa página (a tela é carregada só quando usada). */
  async relatorioGestao({ mes }) {
    const { pdfDaGestao } = await carregarParte(() => import('./gestao.js'));
    aviso('Gerando o PDF…', 'info');
    const r = await pdfDaGestao(mes);
    baixar(r.blob, r.nome);
  },

  /** PDF de um trecho da página (carta de reajuste, demonstrativo do boleto), com margens e "Página X de Y". */
  async baixarPdfTela({ seletor, nome }) {
    const el = document.querySelector(seletor);
    if (!el) throw new Error('Documento não encontrado.');
    aviso('Gerando o PDF…', 'info');
    baixar(await pdfNaLarguraDaFolha(el, [], { margemLado: 15 }), `${nome || 'Documento'}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
  },

  /** PDF do documento que está na tela (contrato, vistoria, recibo das chaves), com o rodapé e "Página X de Y" em todas as folhas. */
  async documentoPdf() {
    const [tipo, q] = documentoDaTela();
    const m = await documentoMontado(tipo, q);
    const el = document.querySelector('.impressao .contrato');
    if (!m || !el) throw new Error('Documento não encontrado.');
    await marcarGeradoNaRotina(tipo, m);
    const blob = await pdfNaLarguraDaFolha(el, m.rodape);
    baixar(blob, `${m.arquivo || `${m.nome} - ${m.c.inquilino_nome}`}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
  },

  async escolherPastaSegura() {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador configura o backup seguro.');
    // celular, Safari, Firefox: o navegador não deixa escolher uma pasta para gravar
    if (!E.teste && !S.suportado()) throw new C.ErroUsuario('Faça isto no computador (Chrome ou Edge).');
    try {
      E.pastaSeguraNova = E.teste ? await pastaSeguraDeTeste() : await window.showDirectoryPicker({ id: 'backup-seguro', mode: 'readwrite' });
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw e;
    }
    if (E.pasta && (await E.pasta.isSameEntry(E.pastaSeguraNova))) {
      E.pastaSeguraNova = null;
      throw new C.ErroUsuario('Escolha uma pasta diferente da pasta dos dados.');
    }
    await mostrar();
  },

  async reconectarSeguro() {
    if (await conectarSeguro(true)) {
      naFilaSegura(() => B.espelhar(E.seguro.dir, E.seguro.chave, E.d));
      aviso('Backup seguro reconectado.');
    } else aviso('O acesso à pasta segura não foi liberado.', 'erro');
    await mostrar();
  },

  async backupCompletoAgora(_dados, el) {
    const barra = andamentoZip('progresso-backup');
    try { await backupCompletoSeguro(barra.aoAndar); } finally { barra.fim(); }
    if (E.seguroErro) throw new Error(E.seguroErro);
    await mostrar();
    statusDoBotao(el).mostrar(`Backup completo gravado na pasta segura (${C.agoraBr()}).`, 'ok');
  },

  /** Backup seguro: atualiza agora a cópia aberta dos arquivos (copia-aberta.js). Andamento e resultado embaixo do botão. */
  async atualizarCopiaAberta(_dados, el) {
    const status = statusDoBotao(el);
    const r = await atualizarCopiaAberta(({ feitos, total }) => status.mostrar(`Atualizando: ${feitos} de ${total}…`));
    if (!r) throw new C.ErroUsuario('A cópia aberta precisa dos dados na nuvem e do backup seguro ligado neste computador.');
    await mostrar();
    statusDoBotao(el).mostrar(`Pasta atualizada: ${r.baixados} arquivo(s) baixado(s), ${r.apagados} tirado(s)${r.falhas ? `, ${r.falhas} ficaram para a próxima` : ''}. Total: ${r.total}.`, r.falhas ? 'aviso' : 'ok');
  },

  async desconectarSeguro() {
    await S.esquecerPastaSegura();
    E.seguro = null;
    aviso('Backup seguro desligado neste computador.');
    await mostrar();
  },

  async dispensarAvisoSeguro({ chave } = {}) {
    dispensarAvisoSeguro(chave);
    await mostrar();
  },

  /** CPF já cadastrado: copia nome, contato e qualificação da pessoa para os campos deste formulário. */
  usarPessoa({ fonte, alvo }, el) {
    const [tabela, id, pref] = fonte.split(':');
    const r = buscar(tabela, id);
    const form = el.closest('form');
    for (const k of CAMPOS_PESSOA_FORM) {
      const campo = form.querySelector(`[name="${alvo}${k}"]`);
      const v = r[`${pref}${k}`];
      if (!campo || v === undefined || v === null || v === '') continue;
      campo.value = v;
      campo.dispatchEvent(new Event('change', { bubbles: true }));
    }
    el.closest('[data-auto-msg]').innerHTML = `Dados de <b>${esc(r[`${pref}nome`])}</b> copiados. Confira antes de salvar.`;
  },

  /** Vistoria: marca o cômodo inteiro ("Bom") ou copia a situação da entrada, só nos itens ainda sem situação. */
  vistoriaTudo({ comodo, valor }) {
    document.querySelectorAll(`select[data-comodo="${comodo}"]`).forEach((el) => {
      if (el.value) return;
      el.value = valor === 'entrada' ? el.dataset.entrada || '' : valor;
    });
    guardarRascunhoVistoria();
  },

  /** Vistoria: limpa a situação e a observação de todos os itens do cômodo. */
  vistoriaApagar({ comodo }) {
    document.querySelectorAll(`[data-comodo="${comodo}"]`).forEach((el) => { el.value = ''; el.classList.remove('piorou'); el.dispatchEvent(new Event('change', { bubbles: true })); });
    guardarRascunhoVistoria();
  },

  inserirComodoModelo({ comodo }) {
    const t = document.querySelector('textarea[name=modelo]');
    t.value = `${t.value.replace(/\s*$/, '')}${t.value.trim() ? '\n\n' : ''}## ${comodo}\n${MODELO_COMODOS[comodo].join('\n')}\n`;
    t.focus();
    t.scrollTop = t.scrollHeight;
  },

  async copiarModeloVistoria() {
    const sel = document.querySelector('select[name=copiar_de]');
    const t = document.querySelector('textarea[name=modelo]');
    const outro = buscar('imoveis', sel.value);
    if (t.value.trim() && !(await confirmar(`O texto que está no campo será trocado pelo modelo de vistoria de "${outro ? outro.nome : 'outro imóvel'}".`, { titulo: 'Trocar o texto do modelo?', sim: 'Trocar o texto' }))) return;
    t.value = outro.modelo_vistoria || '';
  },

  /** Financeiro: cria ou acerta a NF do Airbnb do mês (uma só, sem imóvel, com a soma dos ganhos). */
  async gerarNfAirbnb({ mes }) {
    const nf = await alterar((db) => R.gerarNfAirbnb(db, mes, login()));
    aviso(nf ? `NF do Airbnb de ${compBr(mes)} pronta (${reais(nf.valor)}): numere na tela NF.` : `Nenhum ganho do Airbnb em ${compBr(mes)}.`);
    await mostrar();
  },

  /** Contas pagas por nós: preenche cada valor vazio com o último lançado. */
  /** Contas do imóvel: vai ao mês escolhido (só no botão "Ir": no iPhone a roleta do mês avisa a mudança a cada giro, iphone-012). */
  irMesContas({ imovel }) {
    const mes = (document.getElementById('contas-mes') || {}).value || '';
    if (!C.competenciaValida(mes)) throw new C.ErroUsuario('Escolha o mês de referência.');
    ir(`#/contas/${Number(imovel)}?comp=${mes}`);
  },

  repetirContas() {
    const form = document.querySelector('form[data-form=lancarContas]');
    form.querySelectorAll('input[name^=valor_]').forEach((el) => { if (!el.value && el.placeholder && el.placeholder !== '0,00') el.value = el.placeholder; });
  },

  async etapaFechamento({ mes, etapa, feito }) {
    await alterar((db) => R.marcarEtapaFechamento(db, mes, etapa, feito === '1', login()));
    await mostrar();
  },

  async desmarcarReservaAbatida({ id }) {
    const n = await alterar((db) => R.desmarcarReservaAbatida(db, Number(id), login()));
    aviso(`Registro excluído: a reserva volta a abater os boletos em aberto${n ? ` (${n} boleto(s) ajustado(s))` : ''}.`);
    await mostrar();
  },

  async condominioConferido({ id, mes }) {
    await alterar((db) => R.marcarCondominioConferido(db, Number(id), mes, login()));
    await mostrar();
  },

  async estilosAlertasPadrao() {
    await alterar((db) => R.salvarEstilosAlertas(db, {}, login(), 'padrao'));
    aviso('Alertas de volta ao padrão do sistema.');
    await mostrar();
  },

  async documentoPerdido({ contrato, campo }) {
    await alterar((db) => R.marcarDocumentoPerdido(db, Number(contrato), campo, C.hojeIso(), login(), podeUsuario('admin')));
    await mostrar();
  },

  /** Anexo com assinatura faltante: a janela só oferece os nomes ligados ao contrato. */
  async documentoParcial({ contrato, campo }, el) {
    const form = el.closest('form');
    const data = form.querySelector('[name=data]').value;
    const arquivo = form.querySelector('[name=arquivo]').files[0];
    const doc = R.DOCUMENTOS_ENTRADA.find(([k]) => k === campo);
    if (!data) throw new C.ErroUsuario('Informe a data.');
    if (!arquivo) throw new C.ErroUsuario(`Anexe o arquivo de "${doc[1]}" (mesmo sem todas as assinaturas) antes de clicar em "Falta assinatura".`);
    const partes = R.partesDoContrato(d(), buscar('contratos', contrato));
    const r = await janela({ titulo: `De quem falta a assinatura? (${doc[1]})`,
      html: `<p class="suave">Só aparecem as pessoas e empresas cadastradas neste contrato. Marque todas que faltam.</p>
        ${partes.map((p) => `<label class="check"><input type="checkbox" name="falta" value="${esc(R.textoParte(p))}"> <b>${esc(p.nome)}</b> <span class="suave">(${esc(p.papel)})</span></label>`).join('')}`,
      sim: 'Anexar com assinatura faltante' });
    if (!r) return;
    if (!r.falta || !r.falta.length) throw new C.ErroUsuario('Marque de quem falta a assinatura. Nada foi salvo.');
    const nome = await salvarAssinado('assinados', Number(contrato), arquivo, `${doc[1]} falta assinatura ${data}`);
    await alterar((db) => R.anexarDocumentoParcial(db, Number(contrato), campo, { data, arquivo: nome, falta: r.falta }, login(), podeUsuario('admin')));
    aviso(podeUsuario('admin') ? 'Anexado. Fica o alerta até chegar o arquivo com todas as assinaturas.' : 'Anexado. O administrador vai analisar; fica o alerta até chegar o arquivo com todas as assinaturas.');
    await mostrar();
  },

  async desfazerParcial({ contrato, campo }) {
    await alterarApagandoAnexos((db) => R.anexarDocumentoParcial(db, Number(contrato), campo, null, login(), podeUsuario('admin')));
    await mostrar();
  },

  /** Administrador confirma ou recusa a perda ou o anexo com assinatura faltante registrados por outro usuário. */
  async analisarDocumento({ contrato, campo, tipo, aceitar }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador analisa este pedido.');
    await alterarApagandoAnexos((db) => R.analisarDocumento(db, Number(contrato), campo, tipo, aceitar === '1', login()));
    await mostrar();
  },

  async desmarcarPerdido({ contrato, campo }) {
    await alterar((db) => R.marcarDocumentoPerdido(db, Number(contrato), campo, null, login()));
    await mostrar();
  },

  /** Comprovante de depósito que faltava: grava na pasta do inquilino e liga ao registro (some o alerta). */
  async anexarComprovante({ contrato, tabela, id, campo, tipo, data }, el) {
    const arq = el.files[0];
    // termo assinado (acordo, quitação, chaves) e contra-vistoria não são comprovante de pagamento: nome e aviso próprios (mensal-021)
    const termo = /^(termo-|contra-vistoria)/.test(String(tipo || ''));
    const nomeNovo = termo ? `${tipo}-${data || C.hojeIso()}${extensao(arq.name)}` : nomeComprovante(tipo, data, arq);
    const nome = await S.salvarArquivo(await pastaDoEscopo('contrato', Number(contrato)), new File([arq], nomeNovo));
    await alterar((db) => R.anexarComprovante(db, tabela, Number(id), campo, nome, login()));
    aviso(!termo ? 'Comprovante anexado.' : /^contra-vistoria/.test(tipo) ? 'Contra-vistoria anexada.' : 'Termo assinado anexado.');
    await mostrar();
  },

  /**
   * PDF do boleto emitido à mão no banco (página do boleto, 2026-11-24): grava na pasta do inquilino (boleto-banco-<mês>.pdf) e
   * liga ao boleto; trocar apaga o anterior. Sem o PDF, "Enviar boleto por e-mail" só avisa.
   */
  async anexarBoletoPdf({ id }, el) {
    const arq = el.files[0];
    const cb = buscar('cobrancas', id);
    if (!arq) return;
    if (!cb) throw new C.ErroUsuario('Este boleto não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
    const nome = await S.salvarArquivo(await pastaDoEscopo('contrato', cb.contrato_id), new File([arq], `boleto-banco-${cb.competencia}${extensao(arq.name)}`));
    const trocou = !!cb.boleto_pdf;
    await alterarApagandoAnexos((db) => R.anexarBoletoPdf(db, cb.id, nome, login()));
    aviso(trocou ? 'PDF do boleto trocado.' : 'PDF do boleto anexado. Agora dá para enviar por e-mail.');
    await mostrar();
  },

  /** "×" do PDF do boleto do banco: tira o anexo e apaga o arquivo (o boleto continua). */
  async removerBoletoPdf({ id }) {
    await alterarApagandoAnexos((db) => R.anexarBoletoPdf(db, Number(id), null, login()));
    aviso('PDF do boleto tirado.');
    await mostrar();
  },

  /** Histórico (administrador): desfaz uma alteração ou as marcadas, recalculando os boletos em aberto quando for o caso. */
  async desfazerAlteracao({ itens }) {
    await desfazerItens(String(itens).split(','));
  },

  async desfazerMarcados() {
    const itens = [...document.querySelectorAll('input[data-desfazer]:checked')].flatMap((x) => x.value.split(','));
    if (!itens.length) throw new C.ErroUsuario('Marque as alterações que quer desfazer.');
    await desfazerItens(itens); // a janela mostra tudo o que volta e pede a confirmação
  },

  /**
   * "Excluir" do arquivo já guardado num formulário de edição (#/editar/tabela/id): tira do registro e apaga da pasta.
   * A página não é redesenhada: o que já foi digitado no formulário continua lá (ao salvar, o registro é lido de novo).
   */
  async excluirAnexoDoCampo({ campo }, el) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode apagar arquivos.');
    const [, acao, tabela, id] = location.hash.split('?')[0].split('/');
    const r = acao === 'editar' ? buscar(tabela, id) : null;
    if (!r || !r[campo]) throw new C.ErroUsuario('Este arquivo já não está neste lançamento (talvez outra pessoa tenha apagado). Atualize a página.');
    // comprovante de depósito, correção, aplicação ou reserva: as mesmas contas do "×" da página do inquilino
    await alterarApagandoAnexos((db) => ((ANEXOS_COM_X[tabela] || []).includes(campo) ? R.removerAnexo(db, tabela, r.id, campo, login())
      : R.atualizar(db, tabela, r.id, { [campo]: null }, login(), `Arquivo excluído: ${r[campo]}`)));
    arquivoApagadoNoFormulario(el, r[campo]);
  },

  /** "×" do comprovante da ficha no Novo contrato feito dela (o arquivo ainda está na pasta da ficha): tira da ficha e apaga. */
  async apagarArquivoDaFicha({ campo, ficha }, el) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode apagar arquivos.');
    const f = buscar('fichas', ficha);
    if (!f || !f[campo] || !R.CAMPOS_ARQUIVO_FICHA.includes(campo)) throw new C.ErroUsuario('Este arquivo já não está na ficha (talvez outra pessoa tenha apagado). Atualize a página.');
    const nome = f[campo];
    await alterarApagandoAnexos((db) => R.atualizar(db, 'fichas', f.id, { [campo]: null }, login(), `Arquivo excluído: ${nome}`));
    arquivoApagadoNoFormulario(el, nome);
  },

  /** Nome do arquivo já guardado num formulário de edição (#/editar/tabela/id): abre o arquivo (na pasta do inquilino; o seguro, na subpasta das apólices). */
  async abrirAnexoDoCampo({ campo }) {
    const [, , tabela, id] = location.hash.split('?')[0].split('/');
    const r = buscar(tabela, id);
    if (!r || !r[campo]) throw new C.ErroUsuario('Este arquivo já não está neste lançamento (talvez outra pessoa tenha apagado). Atualize a página.');
    const [escopo, dono] = tabela === 'fichas' ? ['ficha', r.id] : tabela === 'seguros' ? ['seguro', r.contrato_id] : tabela === 'contratos' ? ['contrato', r[`${campo}_contrato`] || r.id] : ['contrato', r.contrato_id];
    await ACOES.abrirArquivo({ escopo, id: dono, nome: r[campo] });
  },

  /** "Excluir" de uma foto já guardada da vistoria (fachada, relógios, quadro de disjuntores). */
  async excluirFotoVistoria({ campo, vistoria }, el) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode apagar arquivos.');
    const v = buscar('vistorias', vistoria);
    if (!v || !(v.fotos || {})[campo]) throw new C.ErroUsuario('Esta foto já foi apagada (talvez por outra pessoa). Atualize a página.');
    const fotos = { ...v.fotos };
    delete fotos[campo];
    await alterarApagandoAnexos((db) => R.atualizar(db, 'vistorias', v.id, { fotos }, login(), `Foto da vistoria excluída: ${v.fotos[campo]}`));
    arquivoApagadoNoFormulario(el, v.fotos[campo]);
  },

  /** Contrato anterior (troca de titular): leva o comprovante e a data do depósito da garantia para o novo titular. */
  async sincronizarGarantia({ id }) {
    let n = null;
    await alterar((db) => { n = R.sincronizarGarantiaHerdeiro(db, Number(id), login()); });
    aviso(n ? `Garantia atualizada em ${n.inquilino_nome}.` : 'Anexe primeiro aqui o comprovante do depósito (ou registre o depósito com o comprovante).', n ? 'ok' : 'aviso');
    await mostrar();
  },

  /** "✎ corrigir data" da caução ou do depósito: a data em que foi paga (na herdada, muda no contrato de quem pagou). */
  async corrigirDataGarantia({ contrato, qual }) {
    const c = buscar('contratos', contrato);
    const g = R.GARANTIAS_DEPOSITADAS[qual];
    if (!c || !g) throw new C.ErroUsuario('Este contrato não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
    const quem = R.pagadorDaGarantia(d(), c, qual);
    const atual = c[g.pago] || quem[g.pago] || '';
    const r = await janela({ titulo: `Data em que a ${g.nome} foi paga`, sim: 'Gravar data',
      html: `<p>${quem.id !== c.id ? `${esc(c.inquilino_nome)} herdou a ${g.nome} de <b>${esc(quem.inquilino_nome)}</b>: a data é a do pagamento feito por ${esc(quem.inquilino_nome)}. Ela muda lá (no contrato de quem pagou) e aqui.` : `Data em que ${esc(c.inquilino_nome)} pagou a ${g.nome}.`}</p>
        ${quem[`${qual}_por_depositos`] ? '<p class="suave">Paga em depósitos: muda a data do último depósito.</p>' : ''}
        <label>Paga em</label><input type="date" name="data" value="${esc(atual)}" max="${C.hojeIso()}" required>${atalhosData()}` });
    if (!r) return;
    const data = String((r.data || [])[0] || '');
    await alterar((db) => R.corrigirDataGarantiaPaga(db, c.id, qual, data, login()));
    aviso(`Data da ${g.nome} corrigida: paga em ${dataBr(data)}${quem.id !== c.id ? ` (no contrato de ${quem.inquilino_nome} e aqui)` : ''}.`, 'ok');
    await mostrar();
  },

  async removerComprovanteGarantia({ contrato, qual }) {
    const c = buscar('contratos', contrato);
    const ultimo = c && c[`${qual}_por_depositos`] ? R.depositosGarantiaDo(d(), c, qual).filter((x) => !x.complementar).pop() : null;
    await alterarApagandoAnexos((db) => R.removerComprovanteGarantia(db, Number(contrato), qual, login()));
    // paga em depósitos: saiu o último depósito, não só o comprovante (entrada-017)
    const depois = ultimo && buscar('contratos', contrato);
    if (ultimo) aviso(`Depósito de ${reais(ultimo.valor)} de ${dataBr(ultimo.data)} desfeito${depois ? `; falta ${reais(R.garantiaADepositar(d(), depois, qual).falta)}` : ''}.`);
    else aviso('Comprovante removido: anexe o certo na garantia (o aviso para anexar volta a aparecer).');
    await mostrar();
  },

  /** "×" ao lado do comprovante (reserva, depósito, correção, aplicação): apaga só o arquivo; o lançamento continua. */
  async removerAnexo({ tabela, id, campo }) {
    await alterarApagandoAnexos((db) => R.removerAnexo(db, tabela, Number(id), campo, login()));
    aviso('Comprovante apagado: fica o aviso para anexar o certo.');
    await mostrar();
  },

  /** "×" no arquivo do documento assinado: apaga só o arquivo (continua assinado). */
  async removerArquivoDocumento({ contrato, campo }) {
    await alterarApagandoAnexos((db) => R.arquivoDocumento(db, Number(contrato), campo, null, login()));
    aviso('Arquivo apagado: o documento continua assinado. Use "⚠ anexar arquivo" para pôr o certo.');
    await mostrar();
  },

  /** "⚠ anexar arquivo" no documento já assinado sem arquivo. */
  async anexarArquivoDocumento({ contrato, campo }, el) {
    const c = buscar('contratos', contrato);
    const doc = R.DOCUMENTOS_ENTRADA.find(([k]) => k === campo);
    const nome = await salvarAssinado('assinados', c.id, el.files[0], `${doc[1]} ${doc[2]} ${c[campo]}`);
    await alterar((db) => R.arquivoDocumento(db, c.id, campo, nome, login()));
    aviso('Arquivo anexado.');
    await mostrar();
  },

  /** Termo aditivo gerado que não voltou assinado: vale como assinado, sem arquivo (quem não é administrador aguarda a análise). */
  async aditivoPerdido({ id }) {
    const a = buscar('aditivos', id);
    await alterar((db) => R.marcarAditivoPerdido(db, Number(id), C.hojeIso(), login(), podeUsuario('admin')));
    const adm = podeUsuario('admin');
    aviso(`Termo aditivo registrado como perdido${a.dia_novo && adm ? `: o vencimento passou ao dia ${a.dia_novo} a partir de ${C.dataBr(a.primeiro_vencimento)}` : ''}.${adm ? '' : ` O administrador vai analisar${a.dia_novo ? `; a troca para o dia ${a.dia_novo} só vale depois da confirmação` : ''}.`}`);
    await mostrar();
  },

  async desmarcarAditivoPerdido({ id }) {
    await alterar((db) => R.marcarAditivoPerdido(db, Number(id), null, login()));
    await mostrar();
  },

  async analisarAditivoPerdido({ id, aceitar }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador analisa este pedido.');
    await alterar((db) => R.analisarAditivoPerdido(db, Number(id), aceitar === '1', login()));
    await mostrar();
  },

  /** Termo aditivo antigo, assinado, cujo papel se perdeu: registra com data e assunto, sem o arquivo. */
  async registrarAditivoPerdido({ contrato }, el) {
    const form = el.closest('form');
    const data = form.querySelector('[name=data]').value;
    const assunto = form.querySelector('[name=assunto]').value;
    if (!data) throw new C.ErroUsuario('Informe a data do termo aditivo.');
    if (!String(assunto || '').trim()) throw new C.ErroUsuario('Informe o assunto do termo aditivo (ex.: troca do dia do vencimento).');
    if (!(await confirmar(`O termo aditivo de ${C.dataBr(data)} fica registrado como assinado, mas sem o arquivo, e passa a valer como assinado.${podeUsuario('admin') ? '' : ' O administrador vai analisar.'}`, { titulo: 'Registrar o termo aditivo como perdido?', sim: 'Registrar como perdido' }))) return;
    await alterar((db) => R.registrarAditivo(db, Number(contrato), { data, assunto, perdido: true }, login(), podeUsuario('admin')));
    aviso('Termo aditivo registrado como perdido.');
    await mostrar();
  },

  /**
   * "×" do termo aditivo já anexado (o termo inteiro, ``so: 'termo'``, ou só o arquivo, ``so: 'arquivo'``): pergunta se ele valeu
   * (decisão do dono, 21/11/2026, saida-031). Assinado por todos: sai com aviso e a mudança continua (ex.: o vencimento fica no
   * dia 15). Arquivo errado ou sem a assinatura de todos: sai e a mudança é desfeita (o vencimento volta ao dia 10).
   */
  async excluirAditivoAssinado({ id, so }) {
    const a = buscar('aditivos', id);
    if (!a) throw new C.ErroUsuario('Termo aditivo não encontrado.');
    const c = buscar('contratos', a.contrato_id);
    const oque = so === 'arquivo' ? `o arquivo "${a.arquivo}"` : `o termo aditivo de ${dataBr(a.data)}`;
    const resp = await janela({ titulo: so === 'arquivo' ? 'Apagar o arquivo do termo aditivo?' : 'Excluir o termo aditivo?', forte: true, sim: 'Continuar',
      html: `<p>Você vai apagar <b>${esc(oque)}</b> (${esc(a.assunto || 'termo aditivo')}).</p>
        <p><b>Este termo valeu?</b></p>
        <p><label><input type="radio" name="valeu" value="nao" checked> Não: é o arquivo errado ou falta a assinatura de alguém. <b>A mudança é desfeita.</b></label></p>
        <p><label><input type="radio" name="valeu" value="sim"> Sim: foi assinado por todos. <b>A mudança continua valendo</b> (o inquilino já assinou).</label></p>` });
    if (!resp) return;
    const valeu = (resp.valeu || [])[0] === 'sim';
    if (valeu) {
      const ok = await confirmar(`O termo foi assinado por todos: o que ele mudou continua valendo.${oQueContinuaDoAditivo(a, c)} Apagar ${oque} mesmo assim?`, { titulo: 'Confirme', sim: 'Apagar', nao: 'Voltar', forte: true });
      if (!ok) return;
      await alterarApagandoAnexos((db) => (so === 'arquivo' ? R.removerArquivoAditivo(db, Number(id), login())
        : R.excluir(db, 'aditivos', Number(id), login(), `${c.inquilino_nome}: termo aditivo de ${dataBr(a.data)} excluído (assinado por todos: a mudança continua valendo)`)));
      aviso(so === 'arquivo' ? 'Arquivo apagado: o termo voltou a "aguardando assinatura". A mudança continua valendo.' : 'Termo aditivo excluído. A mudança continua valendo.');
    } else {
      let feito = '';
      await alterarApagandoAnexos((db) => { feito = R.desfazerAditivo(db, Number(id), login(), { excluirTermo: so !== 'arquivo' }); });
      aviso(`${so === 'arquivo' ? 'Arquivo apagado: o termo voltou a "aguardando assinatura".' : 'Termo aditivo excluído.'} ${feito}`.trim(), 'ok');
    }
    await mostrar();
  },

  /** Assinatura digital (regra assinatura_digital): manda o recibo conferido para a fila; o programa do PC assina. */
  async assinaturaPedir({ tipo, contrato, ficha, id, fiador }) {
    const alvo = alvoDoRecibo({ contrato, ficha, id, fiador });
    if (!alvo) throw new C.ErroUsuario('Ficha ou inquilino não encontrado.');
    aviso('Montando o PDF para assinar…', 'info');
    const r = await pdfDoRecibo(tipo, alvo, { paraAssinar: true });
    await AS.pedirAssinatura(r.blob, { titulo: `${REC.TIPOS_RECIBO[tipo] || 'Documento'} · ${(alvo.ficha || alvo.contrato).inquilino_nome}`, chave: AS.chaveDoRecibo(tipo, alvo), nome: r.nome, contrato: alvo.contrato ? alvo.contrato.id : null });
    aviso('Enviado para assinar: o programa do PC com o certificado assina em cerca de 1 minuto (se estiver ligado).', 'ok');
    await mostrar();
  },

  /** Baixa o PDF assinado e guarda uma cópia na pasta do inquilino (ou da ficha). */
  async assinaturaBaixar({ pedido, contrato, ficha, tipo, id }) {
    const blob = await AS.baixarAssinado(pedido);
    const alvo = alvoDoRecibo({ contrato, ficha, id });
    const p = ((await AS.fila()).pedidos || []).find((x) => x.id === pedido) || {};
    const nome = S.limparNome(String(p.nome || 'documento-assinado.pdf').replace(/\.pdf$/i, '')) + ' - assinado.pdf';
    let guardado = false;
    if (alvo) { try { await S.escreverTexto(await pastaDoEscopo(alvo.ficha ? 'ficha' : 'contrato', (alvo.ficha || alvo.contrato).id), nome, blob); guardado = true; } catch (e) { aviso(`O PDF foi baixado, mas não consegui guardar a cópia na pasta: ${e.message}`, 'aviso'); } }
    baixar(blob, nome);
    // notificação: a cópia assinada vira a "assinada" da notificação (etapa 2, pasta física, e-mail), como se anexada à mão;
    // só o pedido desta notificação (pela chave) e de depois da última mudança do texto (ligarNotificacaoAssinada)
    if (guardado && tipo === 'notificacao' && alvo.contrato && alvo.id && p.chave === AS.chaveDoRecibo('notificacao', alvo)) {
      let ligou = false;
      await alterar((db) => { ligou = R.ligarNotificacaoAssinada(db, alvo.id, nome, p.pedido_em, login()); });
      if (ligou) { aviso('PDF assinado baixado e anexado na notificação como a assinada.'); await mostrar(); }
    }
  },

  async assinaturaCancelar({ id }) {
    if (!(await confirmar('Tirar este documento da fila de assinatura? Ele não será assinado.', { titulo: 'Tirar da fila', sim: 'Tirar', nao: 'Voltar' }))) return;
    await AS.cancelarAssinatura(id);
    await mostrar();
  },

  async assinaturaAtualizar() {
    await AS.fila({ fresca: true });
    await mostrar();
  },

  /** Rotina de entrada: etapa que não se aplica a este inquilino (ex.: sem reserva) ou volta a pendente. */
  async pularEtapaEntrada({ contrato, chave }) {
    await alterar((db) => R.marcarEtapaEntrada(db, Number(contrato), chave, { pular: true }, login()));
    await mostrar();
  },

  async desfazerEtapaEntrada({ contrato, chave }) {
    await alterar((db) => R.marcarEtapaEntrada(db, Number(contrato), chave, {}, login()));
    await mostrar();
  },

  async desmarcarDocumento({ contrato, campo }) {
    await alterarApagandoAnexos((db) => R.marcarDocumento(db, Number(contrato), campo, null, login()));
    await mostrar();
  },

  /** Vistoria: acrescenta o roteiro do cômodo no fim do descritivo. */
  inserirRoteiro({ comodo }) {
    const t = document.querySelector('textarea[name=descritivo]');
    t.value = `${t.value.replace(/\s*$/, '')}${t.value.trim() ? '\n\n' : ''}${roteiroTexto(comodo)}`;
    t.focus();
    t.scrollTop = t.scrollHeight;
  },

  async copiarModelo({ id }) {
    let novo;
    await alterar((db) => {
      const m = R.buscar(db, 'modelos_contrato', modelosNoBanco(db, Number(id)));
      novo = R.inserir(db, 'modelos_contrato', { nome: `Cópia de ${m.nome}`, texto: m.texto, ...(m.tipo ? { tipo: m.tipo } : {}) }, login(), `Modelo de contrato "Cópia de ${m.nome}"`);
    });
    ir(`#/modelo-contrato/${novo.id}`);
  },

  async restaurarModelo({ id }) {
    await alterar((db) => {
      const m = R.buscar(db, 'modelos_contrato', Number(id));
      const p = MODELOS_PADRAO.find((x) => x.nome === m.padrao);
      R.atualizar(db, 'modelos_contrato', m.id, { texto: p.texto }, login(), `Modelo de contrato "${m.nome}" voltou ao texto padrão`);
    });
    aviso('Texto padrão restaurado.');
    await mostrar();
  },

  async excluirModelo({ id }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só administradores podem excluir modelos.');
    await alterar((db) => {
      const m = R.buscar(db, 'modelos_contrato', Number(id));
      if (m) R.excluir(db, 'modelos_contrato', m.id, login(), `Modelo de contrato "${m.nome}" excluído`);
    });
    await mostrar();
  },
  // tela de impressão aberta em aba nova não tem página anterior: vai à tela de origem (impressos-009)
  voltar: () => (history.length > 1 ? history.back() : ir(origemDaImpressao(location.hash))),

  async excluir({ tabela, id }) {
    const cfg = TABELAS_EXCLUSAO[tabela] || {};
    if (cfg.admin && !podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador exclui este tipo de registro.');
    const r = buscar(tabela, id);
    if (!r) throw new C.ErroUsuario('Este registro já foi excluído.');
    // exclusão grande (contrato, imóvel, ficha): o motivo de não poder vem antes de qualquer pergunta; depois, a dupla
    // confirmação com o nome e o que sai junto, digitando APAGAR (decisão do dono, 2026-11-16)
    if (EXCLUSAO_GRANDE[tabela]) {
      const problema = cfg.checar ? cfg.checar(d(), r) : null;
      if (problema) throw new C.ErroUsuario(problema);
      if (!(await confirmarExclusaoGrande(tabela, r))) return;
    }
    const destino = cfg.voltar ? cfg.voltar(r) : null;
    // lançamento com anexo (aditivo, comprovante, apólice, fotos da vistoria): o arquivo sai junto. Contrato: saem os arquivos
    // dos registros dele (os documentos postos à mão na pasta ficam, e a pasta com eles). Imóvel guarda a pasta.
    const pastaFicha = tabela === 'fichas' && r ? r.pasta || nomePastaFicha(r) : null;
    await (['imoveis', 'fichas'].includes(tabela) ? alterar : alterarApagandoAnexos)((db) => {
      const reg = R.buscar(db, tabela, id);
      const problema = cfg.checar ? cfg.checar(db, reg) : null;
      if (problema) throw new C.ErroUsuario(problema);
      if (tabela === 'imoveis') {
        for (const t of TABELAS_DO_IMOVEL) db[t].filter((p) => p.imovel_id === reg.id).forEach((p) => R.excluir(db, t, p.id, login()));
      }
      if (tabela === 'contratos') R.excluirContrato(db, reg.id, login());
      else R.excluir(db, tabela, reg.id, login(), descricaoDaExclusao(db, tabela, reg));
      if (cfg.recalcular) R.recalcularCobrancas(db, cfg.recalcular(db, reg), login());
      if (cfg.depois) cfg.depois(db, reg);
    });
    // ficha excluída: os links dela pela internet deixam de valer (senão o que chegasse cairia numa pasta sem ficha)
    if (tabela === 'fichas') { try { await encerrarLinksDaFicha(r.id); } catch (e) { console.warn('encerrar os links da ficha', e); } }
    if (pastaFicha) await apagarPastaDaFicha(pastaFicha);
    // contrato excluído: a pasta dele sai junto se estiver vazia (pasta com documentos fica guardada)
    if (tabela === 'contratos') {
      try { await S.apagarPastaVazia(await S.subpasta(await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS), pastaPaiContrato(r), false), r.pasta || nomePastaContrato(r)); } catch { /* pasta nem existia */ }
    }
    aviso('Excluído.');
    if (destino) ir(destino); else await mostrar();
  },

  /** Arquivos que sobraram de lançamentos excluídos antes (comprovantes, fotos da vistoria, assinados, aditivos): lista e apaga. */
  /** Sistema: quantos arquivos há na pasta dos anexos e quanto ocupam (na nuvem, numa ida; na pasta, percorrendo as pastas). */
  async medirAnexos(_dados, el) {
    const status = statusDoBotao(el);
    let n = 0; let bytes = 0;
    if (E.nuvem && E.anexos) {
      for (const a of await E.anexos.listaCrua([S.PASTA_ARQUIVOS])) { n += 1; bytes += Number(a.tamanho) || 0; }
    } else {
      let raiz;
      try { raiz = await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS); } catch { status.mostrar('Ainda não há anexos na pasta.', 'ok'); return; }
      const andar = async (dir) => {
        for await (const [, h] of dir.entries()) {
          if (h.kind === 'directory') { await andar(h); continue; }
          n += 1;
          bytes += h.tamanho ?? (await h.getFile()).size;
          if (n % 200 === 0) status.mostrar(`Contando os anexos… ${n} até agora`);
        }
      };
      await andar(raiz);
    }
    status.mostrar(`${n} arquivo(s) na pasta dos anexos, ${C.tamanhoTexto(bytes)} no total (${C.agoraBr()}).`, 'ok');
  },

  async limparAnexosSoltos(_dados, el) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador apaga arquivos sem lançamento.');
    const emUso = anexosEmUso();
    const vistas = new Set();
    const soltos = [];
    for (const c of d().contratos) {
      for (const escopo of ['contrato', 'assinados', 'aditivos']) {
        const pasta = chavePasta(escopo, c.id);
        if (vistas.has(pasta)) continue;
        vistas.add(pasta);
        let dir;
        try { dir = await pastaDoEscopo(escopo, c.id, false); } catch { continue; }
        for (const a of await S.listar(dir)) {
          // na pasta do inquilino ficam também as fichas e documentos anexados à mão: só os gravados pelo sistema
          if (escopo === 'contrato' && !/^(comprovante-|vistoria-(entrada|saida)-)/i.test(a.nome)) continue;
          if (!emUso.has(`${pasta}|${a.nome}`)) soltos.push({ escopo, id: c.id, nome: a.nome, quem: c.inquilino_nome });
        }
      }
    }
    for (const c of d().contratos) {
      const pasta = chavePasta('seguro', c.id);
      if (vistas.has(pasta)) continue;
      vistas.add(pasta);
      let dir;
      try { dir = await pastaDoEscopo('seguro', c.id, false); } catch { continue; }
      // apólices: só os arquivos que já foram de uma apólice (os anexados à mão na caixa ficam)
      for (const a of await S.listar(dir)) if (/^(apolice|seguro)-/i.test(a.nome) && !emUso.has(`${pasta}|${a.nome}`)) soltos.push({ escopo: 'seguro', id: c.id, nome: a.nome, quem: c.inquilino_nome });
    }
    const status = statusDoBotao(el);
    if (!soltos.length) { status.mostrar('Nenhum arquivo sobrando: todos os anexos têm lançamento.', 'ok'); return; }
    status.mostrar(`${soltos.length} arquivo(s) sem lançamento encontrados: confira a lista.`);
    const ok = await janela({ titulo: `${soltos.length} arquivo(s) sem lançamento`, forte: true,
      html: `<p>Estes arquivos ficaram na pasta depois que o lançamento foi excluído. Serão <b>apagados de vez</b>:</p>
        <ul style="max-height:300px;overflow:auto">${soltos.map((a) => `<li>${esc(a.quem)}: ${esc(a.nome)}</li>`).join('')}</ul>`,
      sim: `Apagar ${soltos.length} arquivo(s)`, nao: 'Cancelar' });
    if (!ok) { status.mostrar(`${soltos.length} arquivo(s) sem lançamento: nada foi apagado.`); return; }
    status.mostrar('Apagando…');
    const n = await apagarAnexos(soltos, 'Arquivo sem lançamento apagado na limpeza');
    await mostrar();
    statusDoBotao(el).mostrar(`${n} arquivo(s) apagado(s).`, 'ok');
  },

  async removerLogo() {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só administradores podem alterar a logo.');
    await alterar((db) => {
      R.registrar(db, login(), 'Exclusão', null, null, 'Logo da empresa removida');
      delete db.logo;
    });
    await mostrar();
  },

  async tirarAjuste({ id, ajuste }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode alterar. Peça ao administrador, se precisar.');
    // um ajuste da lista (desde 24/11/2026); sem o número, tira todos (as multas e diferenças presas ficam)
    await alterar((db) => (ajuste ? R.retirarAjuste(db, Number(id), Number(ajuste), login()) : R.ajustarBoleto(db, Number(id), 0, '', login())));
    await mostrar();
  },

  /** FCI: traz do Banco Central os índices de cada mês desde o primeiro pagamento e guarda no contrato (o saldo corrigido sai deles). */
  async calcularFci({ id }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode alterar. Peça ao administrador, se precisar.');
    const c = buscar('contratos', id);
    if (!c.fci_indice) throw new C.ErroUsuario('Escolha antes o índice de correção do FCI em "Editar" (O que está incluso no contrato).');
    const deps = R.depositosFci(d(), c);
    if (!deps.length) throw new C.ErroUsuario('Ainda não há pagamento do FCI para corrigir.');
    const de = C.somarMeses(deps[0].data.slice(0, 7), 1);
    const ate = C.competenciaDe(C.hojeIso());
    if (de > ate) { aviso('Os pagamentos são deste mês: a correção começa no mês que vem.', 'info'); return; }
    const indices = await indicesMensaisFci(c.fci_indice, de, ate);
    if (!Object.keys(indices).length) throw new C.ErroUsuario(`O ${c.fci_indice} de ${compBr(de)} em diante ainda não saiu no Banco Central.`);
    await alterar((db) => R.atualizar(db, 'contratos', c.id, { fci_indices: indices, fci_calculado_em: C.hojeIso() }, login(),
      `FCI corrigido pelo ${c.fci_indice} (Banco Central): ${reais(R.saldoFci(db, R.buscar(db, 'contratos', c.id), indices).corrigido)}`));
    const s = R.saldoFci(d(), buscar('contratos', id));
    aviso(`FCI: pago ${reais(s.total)}, corrigido ${reais(s.corrigido)}${s.ate ? ` (índices até ${compBr(s.ate)})` : ''}.`, 'info');
    await mostrar();
  },

  /** Grava os depósitos do FCI de antes do sistema (caixa do FCI); a correção antiga fica para refazer no "Calcular atualização". */
  async salvarFciPrevios({ id }, el) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode alterar. Peça ao administrador, se precisar.');
    const linhas = [...el.closest('details').querySelectorAll('[data-linhas-fci] tr')].map((tr) => {
      const v = tr.querySelector('[name=fci_valor]').value.trim();
      return { data: tr.querySelector('[name=fci_data]').value, valor: v ? C.centavos(v) : 0 };
    });
    const lista = R.validarFciPrevios(linhas);
    const c = buscar('contratos', id);
    await alterar((db) => R.atualizar(db, 'contratos', c.id, { fci_previos: lista, fci_indices: {}, fci_calculado_em: null }, login(),
      `FCI: ${lista.length} depósito(s) anterior(es) ao sistema, ${reais(lista.reduce((s, x) => s + x.valor, 0))}`));
    aviso(`${lista.length} depósito(s) gravado(s). Clique em "Calcular atualização" para corrigir.`, 'info');
    await mostrar();
  },

  async alternarNf({ id }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode alterar. Peça ao administrador, se precisar.');
    await alterar((db) => {
      const c = R.buscar(db, 'contratos', id);
      const emite = !R.geraNf(c);
      R.atualizar(db, 'contratos', c.id, { gerar_nf: emite }, login(), emite ? 'Passa a emitir NF' : 'Passa a boleto de controle (sem NF)');
    });
    await mostrar();
  },

  /** Saída, 1ª etapa (ou mudar a data, antes do cálculo final): o último boleto sai proporcional. */
  async informarSaida({ id }) {
    const c = buscar('contratos', id);
    const r = await janela({ titulo: `${c.data_saida ? 'Adiar ou mudar a saída' : 'Data de saída'} - ${c.inquilino_nome}`, sim: 'Salvar', nao: 'Cancelar',
      html: `<p>Dia em que o inquilino sai (devolve as chaves). O boleto do último mês sai proporcional aos dias. O cálculo final vem depois.</p>
        ${c.data_saida ? `<p>Hoje a saída está em <b>${esc(dataBr(c.data_saida))}</b>. Adiando (ex.: precisa de mais dias para arrumar o imóvel), o boleto do último mês, ainda em aberto, é recalculado pelos dias novos${c.vistoria_saida_data ? ` e a vistoria marcada (${esc(dataBr(c.vistoria_saida_data))}) anda os mesmos dias` : ''}. O acerto do que faltar fica para o cálculo final.</p>` : ''}
        <label>Data de saída</label><input type="date" name="data" value="${esc(c.data_saida || C.hojeIso())}" required>` });
    if (!r) return;
    const data = String((r.data || [])[0] || '');
    // data muito longe de hoje costuma ser erro de digitação do ano (2026-11-20)
    if (C.dataValida(data) && Math.abs(C.diasEntre(C.hojeIso(), data)) > 365 && !(await confirmar(`A data de saída (${dataBr(data)}) está a mais de um ano de hoje. Confira o ano antes de salvar.`, { titulo: 'Confira a data de saída', sim: 'Salvar assim mesmo', nao: 'Voltar' }))) return;
    const antes = { saida: c.data_saida, vistoria: c.vistoria_saida_data, boleto: c.data_saida ? R.boletoDoMes(d(), c.id, c.data_saida.slice(0, 7)) : null };
    const valorAntes = antes.boleto && !antes.boleto.data_pagamento ? R.totais(antes.boleto).a_pagar_pontual : null;
    await mudarContrato(c.id, (db) => R.informarSaida(db, c.id, data, login()));
    const agora = buscar('contratos', c.id);
    const cb = antes.boleto && buscar('cobrancas', antes.boleto.id);
    const boleto = valorAntes !== null && cb && !cb.data_pagamento && R.totais(cb).a_pagar_pontual !== valorAntes
      ? ` O boleto de ${compBr(cb.competencia)} foi recalculado: ${reais(valorAntes)} → ${reais(R.totais(cb).a_pagar_pontual)} (${cb.dias_cobrados}/${cb.dias_mes} dias).` : '';
    const vistoria = antes.vistoria && agora.vistoria_saida_data !== antes.vistoria ? ` A vistoria de saída passou para ${dataBr(agora.vistoria_saida_data)}: mande o convite de novo (botão de e-mail da etapa).` : '';
    aviso(`Saída em ${dataBr(data)}.${boleto}${vistoria} Depois que ele sair: vistoria de saída e cálculo final.${textoPagosComMenosDias(c.id)}`, R.pagosComMenosDias(d(), agora).length || vistoria ? 'aviso' : 'ok');
    await mostrar();
  },

  /** Roteiro da saída (B3): data e hora da vistoria de saída, para o convite por e-mail e o termo de devolução das chaves. */
  async marcarVistoriaSaida({ id }) {
    const c = buscar('contratos', id);
    if (!c) throw new C.ErroUsuario('Este inquilino não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
    const horas = c.finalidade === 'Não residencial' ? 48 : 72;
    const r = await janela({ titulo: `Vistoria de saída - ${c.inquilino_nome}`, sim: 'Salvar', nao: 'Cancelar',
      html: `<p>Saída em <b>${dataBr(c.data_saida)}</b>. O contrato prevê a vistoria em até ${horas} horas da devolução das chaves, com o inquilino convidado por escrito. Depois de salvar, mande o convite pelo botão de e-mail da etapa.</p>
        <label>Data da vistoria</label><input type="date" name="data" value="${esc(c.vistoria_saida_data || c.data_saida || C.hojeIso())}" required>
        <label>Hora</label><input type="time" name="hora" value="${esc(c.vistoria_saida_hora || '10:00')}" required>
        ${c.vistoria_saida_data ? '<p class="check"><label><input type="checkbox" name="desmarcar" value="1"> Desmarcar a data</label></p>' : ''}` });
    if (!r) return;
    const desmarcar = String((r.desmarcar || [])[0] || '') === '1';
    const data = desmarcar ? '' : String((r.data || [])[0] || '');
    await mudarContrato(c.id, (db) => R.marcarVistoriaSaida(db, c.id, data, String((r.hora || [])[0] || ''), login()));
    aviso(data ? `Vistoria marcada para ${dataBr(data)}. Mande o convite ao inquilino (botão de e-mail da etapa).` : 'Data da vistoria desmarcada.');
    await mostrar();
  },

  /** Roteiro da saída (B5): valor de cada reparo da vistoria de saída, com o orçamento; entra nos débitos do cálculo final. */
  async valoresReparos({ id }) {
    const v = buscar('vistorias', id);
    const c = v && buscar('contratos', v.contrato_id);
    if (!c) throw new C.ErroUsuario('Este inquilino não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
    const res = K.resultadoVistoriaSaida(d(), c);
    const r = await janela({ titulo: `Reparos da vistoria de saída - ${c.inquilino_nome}`, sim: 'Salvar', nao: 'Cancelar',
      html: `<p>O valor de cada reparo vem do orçamento (melhor dois) ou da nota do serviço. Entra nos débitos do cálculo final, descontado da garantia ou cobrado. Guarde os orçamentos na pasta do inquilino. Item sem reparo a cobrar (ex.: desgaste natural): valor 0,00.</p>
        ${res.reparos.map((x) => `<fieldset style="margin:8px 0"><legend>${esc(x.pendencia)}</legend>
          <label>Valor (R$)</label><input name="valor" inputmode="decimal" value="${x.valor === null ? '' : esc(dinheiroTexto(x.valor))}" placeholder="ex.: 350,00">
          <label>Orçamento ou nota <span class="suave">(de quem, data)</span></label><input name="orcamento" value="${esc(x.orcamento)}" placeholder="ex.: Pinturas Silva, 18/11/2026"></fieldset>`).join('')}` });
    if (!r) return;
    const lista = res.reparos.map((x, k) => {
      const t = String((r.valor || [])[k] || '').trim();
      let valor = null;
      if (t) { try { valor = C.centavos(t); } catch { throw new C.ErroUsuario(`Valor inválido em "${x.pendencia}".`); } }
      return { pendencia: x.pendencia, valor, orcamento: String((r.orcamento || [])[k] || '') };
    });
    await alterar((db) => R.valoresReparos(db, v.id, lista, login()));
    aviso('Valores dos reparos salvos: entram nos débitos do cálculo final.');
    await mostrar();
  },

  /** Roteiro da saída (D6): marca a garantia como devolvida (ou o saldo cobrado) no cálculo final. */
  /** Processo do inquilino que saiu impresso e guardado em papel (etapa final do roteiro da saída). */
  async arquivoFisico({ id, desfazer }) {
    const c = buscar('contratos', id);
    if (!c) throw new C.ErroUsuario('Este inquilino não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
    if (desfazer === '1') { await alterar((db) => R.marcarArquivoFisico(db, c.id, '', login())); await mostrar(); return; }
    const r = await janela({ titulo: 'Arquivo físico', sim: 'Marcar arquivado',
      html: `<p>Imprima e guarde em papel o processo de <b>${esc(c.inquilino_nome)}</b>: contrato, aditivos, vistorias de entrada e saída, termos das chaves, cálculo final e comprovantes (botão "Ver os documentos"). Guarde por 10 anos depois da saída.</p>
        <label>Data em que foi arquivado</label><input type="date" name="data" value="${C.hojeIso()}" required>` });
    if (!r) return;
    await alterar((db) => R.marcarArquivoFisico(db, c.id, String((r.data || [])[0] || ''), login()));
    aviso('Processo marcado como arquivado em papel.');
    await mostrar();
  },

  /** Conta paga pelo banco lançada errada (2026-11-20): o administrador corrige só o lançamento; o pagamento no banco fica. */
  async corrigirContaBanco({ id }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador corrige uma conta paga pelo banco.');
    const x = buscar('despesas', id);
    if (!x) throw new C.ErroUsuario('Esta conta não existe mais (pode ter sido excluída por outra pessoa). Atualize a página.');
    const imoveis = [...d().imoveis].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const r = await janela({ titulo: `Corrigir ${x.tipo} paga pelo banco`, sim: 'Salvar a correção',
      html: `<p>Muda só o lançamento desta conta (o que entra nos Resultados). O pagamento feito no banco (${reais((buscar('pagamentos_banco', x.pagamento_banco_id) || x).valor)} em ${dataBr(x.data_pagamento)}) continua como foi.</p>
        <label>Valor da conta</label><input name="valor" inputmode="decimal" data-dinheiro value="${esc(dinheiroTexto(x.valor))}" required>
        <label>Mês de referência</label><input type="month" name="competencia" value="${esc(x.competencia || '')}" required>
        <label>Imóvel</label><select name="imovel">${imoveis.map((i) => `<option value="${i.id}"${i.id === x.imovel_id ? ' selected' : ''}>${esc(i.nome)}</option>`).join('')}</select>` });
    if (!r) return;
    const valor = C.centavos(String((r.valor || [])[0] || ''));
    await alterar((db) => R.corrigirContaPagaPeloBanco(db, x.id, { valor, competencia: String((r.competencia || [])[0] || ''), imovel_id: Number((r.imovel || [])[0]) }, login(), 'admin'));
    aviso('Lançamento corrigido. O pagamento no banco não mudou.');
    await mostrar();
  },

  /** Saldo da saída a pagar pelo inquilino (2026-11-20): gera o boleto avulso do saldo, com o vencimento escolhido. */
  async boletoDoSaldo({ id }) {
    const e = buscar('encerramentos', id);
    if (!e) throw new C.ErroUsuario('O cálculo final da saída não existe mais (pode ter sido desfeito por outra pessoa). Atualize a página.');
    const r = await janela({ titulo: 'Boleto do saldo da saída', sim: 'Gerar o boleto',
      html: `<p>O inquilino deve <b>${reais(-e.saldo)}</b> no cálculo final. O boleto sai sem NF; pago depois do vencimento, tem a multa e os juros do contrato. Quando for pago, o saldo fica marcado como cobrado sozinho. Pode ser emitido no C6 como os outros.</p>
        <label>Vencimento</label><input type="date" name="vencimento" value="${C.somarDias(C.hojeIso(), 5)}" min="${C.hojeIso()}" required>` });
    if (!r) return;
    const cb = await alterar((db) => R.gerarBoletoDoSaldo(db, e.id, String((r.vencimento || [])[0] || ''), login(), C.hojeIso()));
    aviso(`Boleto do saldo gerado: ${reais(cb.outros)}, vence em ${dataBr(cb.vencimento)}. Emita no C6 pela página do boleto, se quiser.`);
    await mostrar();
  },

  async garantiaDevolvida({ id, desfazer }) {
    const e = buscar('encerramentos', id);
    if (!e) throw new C.ErroUsuario('O cálculo final da saída não existe mais (pode ter sido desfeito por outra pessoa). Atualize a página.');
    if (desfazer) {
      if (!(await confirmar(`Desfazer a ${e.saldo >= 0 ? 'devolução da garantia' : 'cobrança do saldo'} marcada em ${dataBr(e.garantia_devolvida_em)}? A etapa volta a ficar por fazer.`, { titulo: 'Desfazer a devolução', sim: 'Desfazer' }))) return;
      await alterar((db) => R.marcarGarantiaDevolvida(db, e.id, '', login()));
      aviso('Devolução desfeita: a etapa voltou a ficar por fazer.', 'info');
      await mostrar();
      return;
    }
    const r = await janela({ titulo: e.saldo >= 0 ? 'Garantia devolvida' : 'Saldo cobrado do inquilino', sim: 'Marcar',
      html: `<p>${e.saldo >= 0 ? `Devolução de <b>${reais(e.saldo)}</b> ao inquilino.` : `Cobrança de <b>${reais(-e.saldo)}</b> do inquilino.`} Informe o dia em que aconteceu (fica no histórico).</p>
        <label>Data</label><input type="date" name="data" value="${esc(e.garantia_devolvida_em || C.hojeIso())}" required>` });
    if (!r) return;
    const dataDev = String((r.data || [])[0] || '');
    // vai para o termo de quitação: não antes da saída nem depois de hoje (2026-11-20)
    if (dataDev && dataDev > C.hojeIso()) throw new C.ErroUsuario(`A data (${dataBr(dataDev)}) é depois de hoje: marque no dia em que aconteceu.`);
    await alterar((db) => R.marcarGarantiaDevolvida(db, e.id, dataDev, login()));
    aviso('Etapa marcada no roteiro da saída.');
    await mostrar();
  },

  async desfazerSaida({ id }) {
    // o termo de devolução das chaves era desta saída: sai do lançamento e o arquivo da pasta (2026-11-20)
    await mudarContrato(Number(id), (db) => R.desfazerSaida(db, Number(id), login()), { apagandoAnexos: true });
    const falta = textoPagosComMenosDias(Number(id));
    aviso(`Inquilino ativo de novo (sem data de saída).${falta}`, falta ? 'aviso' : 'ok');
    await mostrar();
  },

  /** Imóvel lançado errado (só sem boleto pago): troca o imóvel, move a pasta do inquilino e recalcula os boletos em aberto. */
  async corrigirImovel({ id }) {
    const c = buscar('contratos', id);
    const hoje = C.hojeIso();
    const ocupado = (i) => d().contratos.some((x) => x.id !== c.id && x.imovel_id === i.id && R.contratoAtivo(x, hoje));
    const r = await janela({ titulo: `Corrigir imóvel - ${c.inquilino_nome}`, sim: 'Corrigir', nao: 'Cancelar',
      html: `<p>Imóvel atual: <b>${esc((buscar('imoveis', c.imovel_id) || {}).nome || 'sem imóvel')}</b>. Use só para imóvel lançado errado (antes de qualquer boleto pago): a pasta do inquilino, as leituras e as vistorias vão para o imóvel certo.</p>
        <label>Imóvel certo</label><select name="imovel">${ordenar(d().imoveis, 'nome').filter((i) => i.id !== c.imovel_id).map((i) => `<option value="${i.id}">${esc(i.nome)}${ocupado(i) ? ' (ocupado)' : ' · vago'}</option>`).join('')}</select>` });
    if (!r) return;
    const imovel = Number((r.imovel || [])[0]);
    await mudarContrato(c.id, (db) => R.corrigirImovel(db, c.id, imovel, login()));
    aviso(`Imóvel corrigido para ${(buscar('imoveis', imovel) || {}).nome}.`);
    await mostrar();
  },

  async copiar({ texto }, el) {
    try { await navigator.clipboard.writeText(texto); } catch {
      // navegador sem permissão para a área de transferência: o jeito antigo (texto selecionado + copiar)
      const t = Object.assign(document.createElement('textarea'), { value: texto });
      t.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.append(t); t.select();
      const ok = document.execCommand('copy');
      t.remove();
      if (!ok) throw new C.ErroUsuario(`Não deu para copiar sozinho. Selecione e copie: ${texto}`);
    }
    const antes = el.textContent;
    el.textContent = 'Copiado ✓';
    setTimeout(() => { el.textContent = antes; }, 1500);
  },

  async gerarCobrancas({ comp }) {
    const r = await alterar((db) => R.gerarCobrancas(db, comp, login()));
    aviso(`${r.geradas} boleto(s) gerado(s) para ${compBr(comp)}.`);
    await mostrar();
  },

  /** Painel: adia um alerta por 7 dias ("adiado") ou só hoje ("cuidando", com quem marcou; volta amanhã). Some do Painel e da página do inquilino até a data. */
  async adiarAlerta({ chave, modo, tipo }) {
    const r = await alterar((db) => R.adiarAlerta(db, chave, modo, login(), { tipo, quem: E.usuario.nome }));
    aviso(modo === 'cuidando' ? `Anotado: ${E.usuario.nome} está cuidando. O alerta volta amanhã (${dataBr(C.somarDias(r.ate, 1))}) se ainda estiver pendente.` : `Alerta adiado: volta em ${dataBr(C.somarDias(r.ate, 1))} se ainda estiver pendente.`);
    await mostrar();
  },

  async voltarAlerta({ chave }) {
    await alterar((db) => R.voltarAlerta(db, chave, login()));
    await mostrar();
  },

  /** Desliga um tipo de alerta para um inquilino ou imóvel: não aparece mais até alguém religar (lista "Alertas desligados" do Painel). */
  async desligarAlerta({ tipo, contrato, imovel }) {
    await alterar((db) => R.desligarAlerta(db, tipo, { contrato_id: contrato || null, imovel_id: imovel || null }, login(), { quem: E.usuario.nome }));
    aviso(`Alerta "${tipo}" desligado. Para voltar a avisar, use "Religar" em "Alertas desligados", no fim dos alertas do Painel.`);
    await mostrar();
  },

  /** Painel: mostra todos os alertas de um tipo (começam só os primeiros, MOSTRAR_ALERTAS) ou volta a recolher. */
  verTodosAlertas({ tipo }) {
    if (alertasAbertos.has(tipo)) alertasAbertos.delete(tipo); else alertasAbertos.add(tipo);
    return mostrar();
  },

  async religarAlerta({ id }) {
    await alterar((db) => R.religarAlerta(db, id, login()));
    aviso('Alerta religado: volta a aparecer se ainda estiver pendente.');
    await mostrar();
  },

  /**
   * Acordo de dívida (D8): janela com os boletos vencidos do inquilino (marcados), o total combinado (vem com o valor de
   * hoje, com multa e juros), o número de boletos e o 1º vencimento; a prévia mostra os boletos novos e quanto vai na NF.
   */
  async fazerAcordo({ contrato }) {
    const c = buscar('contratos', contrato);
    const hoje = C.hojeIso();
    const vencidos = d().cobrancas.filter((cb) => cb.contrato_id === c.id && R.aCobrar(cb) && C.vencido(cb.vencimento, hoje) && !R.ehComplementoCaucao(cb))
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    if (!vencidos.length) throw new C.ErroUsuario('Este inquilino não tem boleto vencido em aberto.');
    const hojeDe = (cb) => C.liquidar(cb, hoje).valor_devido;
    const proximo = C.vencimentoDaCompetencia(C.competenciaDe(hoje), c.dia_vencimento || 10, false);
    const primeiro = proximo > hoje ? proximo : C.somarMesesData(proximo, 1);
    const nome = (cb) => (R.ehParcelaAcordo(cb) ? `acordo ${cb.acordo_parcela || ''}` : compBr(cb.competencia));
    const r = await janela({ titulo: `Acordo · ${c.inquilino_nome}`, sim: 'Fazer o acordo', nao: 'Cancelar',
      html: `<p class="suave">Os boletos marcados ficam "em acordo" (saem da inadimplência) e o sistema cria os boletos novos. Se um boleto do acordo atrasar, o inquilino volta para a lista.</p>
        <p><label>Boletos do acordo</label>${vencidos.map((cb) => `<label class="check-mini"><input type="checkbox" name="boleto" value="${cb.id}" checked data-hoje="${hojeDe(cb)}">
          ${esc(nome(cb))} · venceu ${dataBr(cb.vencimento)} · ${reais(R.totais(cb).a_pagar_sem_desconto)} <span class="suave">(hoje ${reais(hojeDe(cb))})</span></label>`).join('<br>')}</p>
        <div class="acoes"><p><label>Total combinado</label><input name="total" inputmode="decimal" data-dinheiro required style="width:140px"></p>
          <p><label>Boletos</label><select name="parcelas">${Array.from({ length: 12 }, (_, k) => `<option value="${k + 1}" ${k === 2 ? 'selected' : ''}>${k + 1}</option>`).join('')}</select></p>
          <p><label>1º vencimento</label><input type="date" name="vencimento" value="${primeiro}" min="${hoje}" required style="width:auto"></p></div>
        <p><label>Observações (opcional)</label><input name="observacoes" placeholder="Ex.: combinado por telefone em ${dataBr(hoje)}"></p>
        <div data-previa class="suave"></div>`,
      ligar(dlg) {
        const total = dlg.querySelector('[name=total]');
        const previa = dlg.querySelector('[data-previa]');
        const marcados = () => [...dlg.querySelectorAll('[name=boleto]:checked')];
        let mexeu = false;
        const ver = () => {
          if (!mexeu) total.value = dinheiroTexto(marcados().reduce((s, el) => s + Number(el.dataset.hoje), 0));
          try {
            const p = R.previaAcordo(d(), { contrato_id: c.id, ids: marcados().map((el) => el.value), total: C.centavos(total.value || '0'),
              parcelas: dlg.querySelector('[name=parcelas]').value, primeiro_vencimento: dlg.querySelector('[name=vencimento]').value }, hoje);
            previa.innerHTML = `<b>Boletos novos:</b><br>${p.boletos.map((b) => `${b.parcela || 'único'} · vence ${dataBr(b.vencimento)} · <b>${reais(b.valor)}</b> (NF ${reais(b.nf)})`).join('<br>')}
              <br>Dívida de hoje ${reais(p.divida)} · combinado ${reais(p.total)}. Na NF vai o aluguel com multa e juros do acordo; ${p.foraDaNf < 0
    ? `a reserva (ou o ressarcimento) já abatida no boleto também entra (${reais(-p.foraDaNf)} a mais na NF), como no pagamento normal.`
    : `IPTU, seguro e tarifa (${reais(p.foraDaNf)}) ficam fora, como sempre.`}`;
          } catch (e) { previa.innerHTML = `<span class="texto-perigo">${esc(e.message)}</span>`; }
        };
        total.addEventListener('input', () => { mexeu = true; });
        dlg.addEventListener('change', ver);
        ver();
      } });
    if (!r) return;
    const dados = { contrato_id: c.id, ids: (r.boleto || []).map(Number), total: C.centavos(String((r.total || [])[0] || '0')), parcelas: Number((r.parcelas || [])[0]),
      primeiro_vencimento: String((r.vencimento || [])[0] || ''), observacoes: String((r.observacoes || [])[0] || '') };
    const x = await alterar((db) => R.fazerAcordo(db, dados, login(), hoje));
    aviso(`Acordo feito: ${x.parcelas.length} boleto(s) novo(s), o primeiro vence em ${dataBr(x.parcelas[0].vencimento)}. Emita-os no banco como os outros.`, 'ok');
    await mostrar();
  },

  async desfazerAcordo({ id }) {
    const a = buscar('acordos', id);
    const origens = a ? R.origensDoAcordo(d(), a).map((cb) => cb.id) : [];
    await alterar((db) => R.desfazerAcordo(db, id, login()));
    aviso('Acordo desfeito: os boletos originais voltaram a ser cobrados.', 'ok');
    // na página da parcela do acordo (que foi excluída): vai ao boleto original mais antigo (links-pc-002 = mensal-020)
    const [, tela, idDaTela] = location.hash.split('?')[0].split('/');
    if (tela === 'cobranca' && !buscar('cobrancas', Number(idDaTela))) {
      if (origens.length && buscar('cobrancas', origens[0])) ir(`#/cobranca/${origens[0]}`);
      else ir(a ? `#/contrato/${a.contrato_id}` : '#/inquilinos');
      return;
    }
    await mostrar();
  },

  /**
   * Lembrete ao inquilino (D3): janela com o texto pronto (editável) e os botões de e-mail (canal oficial), WhatsApp e copiar.
   * O texto muda com a fase do boleto (antes do vencimento, no dia, atrasado) e traz o Pix quando o boleto saiu pelo banco.
   */
  async lembrete({ id }) {
    const cb = buscar('cobrancas', id);
    if (!cb || cb.data_pagamento) throw new C.ErroUsuario('Este boleto já foi pago ou excluído (talvez por outra pessoa). Atualize a página.');
    const l = R.textoLembrete(d(), cb, C.hojeIso());
    const c = buscar('contratos', cb.contrato_id);
    const titulo = { antes: 'Lembrete antes do vencimento', dia: 'Lembrete: vence hoje', atrasado: 'Cobrança de boleto em atraso' }[l.fase];
    await janelaMensagem(`${titulo} · ${c.inquilino_nome}`, l);
  },

  /**
   * 2ª via com o valor do dia (boleto vencido, pedido do dono de 17/11): o valor de hoje com multa e juros (C.liquidar), o
   * botão para copiar o valor e o texto pronto para mandar ao inquilino. Não emite boleto novo no banco.
   */
  async segundaVia({ id }) {
    const cb = buscar('cobrancas', id);
    if (!cb || cb.data_pagamento) throw new C.ErroUsuario('Este boleto já foi pago ou excluído (talvez por outra pessoa). Atualize a página.');
    const hoje = C.hojeIso();
    const v = R.segundaVia(d(), cb, hoje);
    if (!v) throw new C.ErroUsuario(`O boleto de ${compBr(cb.competencia)} ainda não venceu (ou não se cobra mais): o valor é o do boleto. Use "Lembrar o inquilino".`);
    const c = buscar('contratos', cb.contrato_id);
    const linha = (rotulo, valor) => `<tr><td>${rotulo}</td><td class="n">${valor}</td></tr>`;
    await janelaMensagem(`2ª via com o valor de hoje · ${c.inquilino_nome}`, v, `<table class="compacta" style="margin-bottom:8px">
        ${linha(`Valor do boleto (venceu em ${dataBr(cb.vencimento)})`, reais(v.original))}
        ${v.multa ? linha(`Multa (${C.pct(cb.multa_percentual)})`, reais(v.multa)) : ''}${v.juros ? linha(`Juros (${C.pct(cb.juros_mensal_percentual)} ao mês, ${C.plural(v.dias, 'dia')})`, reais(v.juros)) : ''}
        <tr class="total"><td>Para pagar hoje, ${dataBr(hoje)}</td><td class="n maior">${reais(v.valor)}</td></tr></table>
      <p class="acoes">${botao('copiar', `Copiar o valor (${reais(v.valor, false)})`, { texto: reais(v.valor, false) }, 'secundario pequeno')}<span class="suave">Não emite boleto novo no banco: amanhã o valor muda.</span></p>`);
  },

  /** Tela de Boletos: confirma o pagamento numa janela (os mesmos campos da página do boleto), sem o formulário na linha. */
  async pagarBoleto({ id }) {
    const cb = buscar('cobrancas', id);
    if (!cb || cb.data_pagamento) throw new C.ErroUsuario('Este boleto já foi pago ou excluído (talvez por outra pessoa). Atualize a página.');
    const c = buscar('contratos', cb.contrato_id);
    const i = c ? buscar('imoveis', c.imovel_id) : null;
    const hoje = C.hojeIso();
    const sim = C.liquidar(cb, hoje);
    const resp = await janela({ titulo: `Confirmar pagamento · ${c ? c.inquilino_nome : ''}`,
      html: `<p class="suave" style="margin-bottom:8px">${i ? `${esc(i.nome)} · ` : ''}boleto ${compBr(cb.competencia)}, vencimento ${dataBr(cb.vencimento)}. Se pago hoje: <b>${reais(sim.valor_devido)}</b>${sim.pontual ? '' : ` (${C.plural(sim.dias_atraso, 'dia')} de atraso)`}.</p>
        <p><label>Dia em que o dinheiro entrou na conta</label><input type="date" name="data" value="${hoje}" required>${atalhosData()}</p>
        <p><label>Pagou em (só se atrasou)</label><input type="date" name="pagou">${atalhosData()}<span class="ajuda">Em branco: o dia em que o dinheiro entrou</span></p>
        <p><label>Valor recebido (opcional)</label><input name="valor" inputmode="decimal" placeholder="0,00"></p>
        <p><label class="check-mini"><input type="checkbox" name="em_dia" value="1"> pagou em dia (o banco só compensou depois: sem multa e juros)</label></p>`,
      sim: 'Confirmar pagamento' });
    if (!resp) return;
    const f = new FormData();
    for (const [k, v] of Object.entries(resp)) f.set(k, v[0]);
    await confirmarPagamentoBoleto(cb.id, f);
  },

  async estornar({ id }) {
    // o comprovante da entrada do extrato ligada ao boleto sai junto (a entrada volta a ficar sem destino)
    await alterarApagandoAnexos((db) => R.estornarPagamento(db, Number(id), login()));
    aviso('Pagamento desfeito.');
    await mostrar();
  },

  async recalcularMes({ comp }) {
    const n = await alterar((db) => R.recalcularCobrancas(db, (cb) => cb.competencia === comp, login()));
    aviso(n ? `${n} boleto(s) recalculado(s).` : 'Os boletos já estavam de acordo com o cadastro.');
    await mostrar();
  },

  async recalcularBoleto({ id }) {
    await alterar((db) => {
      R.atualizar(db, 'cobrancas', Number(id), { editado_manual: false, campos_manuais: null }, login(), 'Boleto volta a ser calculado pelo cadastro');
      R.recalcularCobrancas(db, (cb) => cb.id === Number(id), login());
    });
    aviso('Boleto recalculado pelo cadastro.');
    await mostrar();
  },

  async recalcularCorrecoes({ id }) {
    let n = 0;
    await alterar((db) => {
      n = R.recalcularCorrecoes(db, Number(id), login());
      R.recalcularCobrancas(db, (cb) => cb.contrato_id === Number(id), login());
    });
    aviso(`${n} correção(ões) refeita(s) a partir do aluguel inicial.`);
    await mostrar();
  },

  /** Fiador: excluir o cadastro (fiador contratual lançado errado; pode ser incluído de novo em "Editar contrato") ou trocar a garantia. */
  async excluirFiador({ id }) {
    const f = buscar('fiadores', id);
    if (!f) throw new C.ErroUsuario('Este fiador não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
    const r = await janela({ titulo: `Fiador ${f.nome}`,
      html: `<p>Deseja excluir fiador contratual ou trocar garantia/fiador?</p>
        <p><label class="check" style="padding-top:0"><input type="radio" name="escolha" value="excluir"> Excluir fiador contratual (cadastro errado). Pode ser incluído de novo em "Editar contrato"</label></p>
        <p><label class="check" style="padding-top:0"><input type="radio" name="escolha" value="trocar" checked> Trocar garantia/fiador (fica guardado no histórico, com termo aditivo)</label></p>`,
      sim: 'Continuar', nao: 'Cancelar' });
    if (!r) return;
    if ((r.escolha || [])[0] === 'trocar') return ir(`#/novo/trocas_garantia?contrato=${f.contrato_id}`);
    await ACOES.excluir({ tabela: 'fiadores', id: f.id });
  },

  cancelarPagamentoDivergente() {
    memoria.pagamentoDivergente = null;
    aviso('Pagamento não confirmado. Nada foi salvo.');
    return mostrar();
  },

  async cancelarTrocaGarantia({ id }) {
    await alterar((db) => R.cancelarTrocaGarantia(db, Number(id), login()));
    aviso('Troca de garantia cancelada: o contrato voltou para a garantia anterior.');
    await mostrar();
  },

  async excluirRenovacao({ id }) {
    await alterar((db) => {
      const r = R.buscar(db, 'renovacoes', id);
      R.excluirRenovacao(db, Number(id), login());
      R.recalcularCobrancas(db, (cb) => cb.contrato_id === r.contrato_id, login());
    });
    aviso('Registro excluído.');
    await mostrar();
  },

  /**
   * Guia do IPTU paga por você: um caminho só para as três telas (caixa do imóvel, lista de guias a pagar e quadradinho do mapa
   * do ano; C17). Sem ``data``, pergunta a data numa janela; ``data: ''`` desfaz (parcela paga pelo banco não se desfaz aqui).
   */
  async iptuPago({ id, n, data, texto }) {
    if (data === '') {
      await alterar((db) => R.marcarIptuPago(db, Number(id), Number(n), null, login()));
      await mostrar();
      return;
    }
    if (!data) {
      const r = await janela({ titulo: 'Marcar a guia do IPTU como paga', sim: 'Marcar como paga', nao: 'Cancelar',
        html: `<p>${esc(texto || '')}</p><label>Pago em</label><input type="date" name="data" value="${C.hojeIso()}" max="${C.hojeIso()}" required>${atalhosData()}` });
      if (!r) return;
      data = String((r.data || [])[0] || '');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new C.ErroUsuario('Informe a data do pagamento.');
    // pagamento ainda não feito não se marca (mensal-035): como no pagamento do boleto, data depois de hoje é recusada
    if (data > C.hojeIso()) throw new C.ErroUsuario(`A data do pagamento (${dataBr(data)}) é depois de hoje: marque a guia como paga quando ela for paga.`);
    await alterar((db) => R.marcarIptuPago(db, Number(id), Number(n), data, login()));
    aviso('Parcela do IPTU marcada como paga.');
    await mostrar();
  },

  // listas editáveis (concessionárias, índices) dentro dos formulários
  abrirLista({ lista }) {
    const el = document.querySelector(`[data-editor="${lista}"]`);
    if (el) el.hidden = !el.hidden;
  },

  async incluirNaLista({ lista }, el) {
    const campoNovo = el.parentElement.querySelector('[data-lista-novo]');
    const valor = await alterar((db) => R.incluirNaLista(db, lista, campoNovo.value, login()));
    acertarListaNaTela(el, lista, { incluido: valor });
    campoNovo.value = '';
    aviso(`"${valor}" incluído na lista.`);
  },

  async removerDaLista({ lista, valor }, el) {
    if (!(await confirmar(`"${valor}" sai da lista de opções. O que já foi gravado com ele continua igual.`, { titulo: 'Remover da lista?', sim: 'Remover', forte: true }))) return;
    await alterar((db) => R.removerDaLista(db, lista, valor, login())); // recusa (ex.: em uso) aparece na janela de erro
    acertarListaNaTela(el, lista, { removido: valor });
  },

  async desfazerUltimaNumeracao() {
    if (!podeUsuario('admin')) throw new C.ErroUsuario(SO_ADMIN_NUMERACAO);
    const ciclo = await alterar((db) => R.desfazerUltimaNumeracao(db, login()));
    aviso(`Numeração nº ${R.numeroFatura(ciclo.de)} a ${R.numeroFatura(ciclo.ate)} desfeita. Corrija o que precisar, inclua o que faltou e clique em "Numerar as NFs marcadas".`);
    await mostrar();
  },

  async cancelarNumero({ numero }) {
    await alterar((db) => R.cancelarNumero(db, Number(numero), login()));
    aviso(`NF nº ${R.numeroFatura(numero)} cancelada. O pagamento voltou para a fila: corrija se precisar e numere de novo.`);
    await mostrar();
  },

  async apagarCanceladas({ numero }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só administradores podem apagar NFs.');
    await alterar((db) => R.apagarCanceladas(db, Number(numero), login()));
    aviso(`NF nº ${R.numeroFatura(numero)} apagada da lista.`);
    await mostrar();
  },

  /** Tela Reajustes: desfaz a correção (só a mais recente do inquilino, sem boleto da caução pago). */
  async desfazerReajuste({ id }) {
    // a caução corrigida por depósito deste reajuste sai junto, com o comprovante
    const x = await alterarApagandoAnexos((db) => {
      const corr = R.desfazerReajuste(db, Number(id), login());
      R.recalcularCobrancas(db, (cb) => cb.contrato_id === corr.contrato_id, login());
      return corr;
    });
    aviso(`Correção desfeita: o aluguel voltou a ${reais(x.valor_anterior)}.`);
    await mostrar();
  },

  async gerarBoletoCaucao({ contrato, comp }) {
    await perguntarCaucao(Number(contrato), comp || null);
    await mostrar();
  },

  async confirmarCaucao({ contrato }) {
    await alterar((db) => R.confirmarCaucaoSemComplemento(db, Number(contrato), login()));
    aviso('Caução confirmada: a depositada já cobre o reajuste.');
    await mostrar();
  },

  /** Caução a completar: o inquilino já depositou o complemento (sem boleto). Comprovante opcional: fica o aviso até anexar. */
  async complementoDepositado({ contrato }) {
    const c = buscar('contratos', contrato);
    const x = R.complementoCaucao(d(), c);
    if (!x) return;
    const r = await janela({ titulo: `Depósito do complemento - ${c.inquilino_nome}`, sim: 'Registrar depósito', nao: 'Cancelar',
      html: `<p>Complemento de <b>${reais(x.complemento)}</b>: a caução passa de ${reais(x.atual)} para <b>${reais(x.necessaria)}</b>.</p>
        <label>Data do depósito</label><input type="date" name="data" value="${C.hojeIso()}" required>${atalhosData()}
        <label>Comprovante (opcional)</label><input type="file" name="arquivo" accept="${ACEITA_DOCUMENTOS}">
        <p class="suave">Sem o comprovante, fica o aviso "anexar" até ele chegar.</p>` });
    if (!r) return;
    const data = String((r.data || [])[0] || '');
    const arq = (r.arquivo || [])[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new C.ErroUsuario('Informe a data do depósito.');
    const nome = arq && arq.size ? await S.salvarArquivo(await pastaDoEscopo('contrato', c.id), new File([arq], nomeComprovante('complemento-caucao', data, arq))) : null;
    await alterar((db) => R.registrarComplementoDepositado(db, c.id, { data, arquivo: nome }, login()));
    aviso(`Complemento de ${reais(x.complemento)} registrado: caução de ${reais(x.necessaria)}.${nome ? '' : ' Sem comprovante: fica o aviso até anexar.'}`);
    await mostrar();
  },

  /** Editar do inquilino: avisa que é só o cadastro do contrato; correções, reajustes e lançamentos são na própria tela. */
  async editarContrato({ id }) {
    const ok = await janela({ titulo: 'Editar os dados do contrato', sim: 'Editar o contrato', nao: 'Voltar',
      html: `<p>Aqui você altera só os <b>dados do contrato</b>: inquilino, documentos, prazo, valores combinados, garantia e condições.</p>
        <p><b>Não use para</b> correções do aluguel, reajustes, boletos, pagamentos, depósitos da garantia e demais lançamentos: faça isso pelos botões da própria tela do inquilino.</p>` });
    if (ok) ir(`#/editar/contratos/${id}`);
  },

  /**
   * Carta de reajuste por e-mail (D4; o e-mail é o canal oficial): baixa o PDF da carta, abre o Gmail (ou o programa de e-mail)
   * já com destinatário, assunto e o texto da carta, e marca a carta como enviada (guardando o PDF na pasta do inquilino).
   * O PDF baixado precisa ser anexado à mão (o navegador não anexa arquivo num e-mail sozinho).
   */
  async enviarCartaEmail({ contrato, comp }) {
    const c = buscar('contratos', contrato);
    if (!c) throw new C.ErroUsuario('Este inquilino não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
    const carta = await pdfDaCarta(c, comp);
    if (!carta) throw new C.ErroUsuario('A carta ainda não sai: falta o índice ou a correção aplicada (tela Reajustes).');
    const assunto = `Reajuste do aluguel a partir de ${compBr(comp)} · ${(buscar('imoveis', c.imovel_id) || {}).nome || ''}`.trim();
    const para = c.inquilino_email || '';
    const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(para)}&su=${encodeURIComponent(assunto)}&body=${encodeURIComponent(carta.texto)}`;
    const mailto = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(carta.texto)}`;
    const r = await janela({ titulo: `Enviar carta de reajuste · ${c.inquilino_nome}`, sim: 'Abrir o e-mail e marcar como enviada',
      html: `<p>${para ? `Para: <b>${esc(para)}</b>.` : '<b>Este inquilino não tem e-mail no cadastro:</b> o e-mail abre sem destinatário.'} O PDF <b>${esc(carta.nome)}</b> é baixado agora: <b>anexe-o no e-mail</b> (arraste da pasta Downloads). O texto da carta já vai no corpo.</p>
        <p><label><input type="radio" name="por" value="gmail" checked> Abrir no Gmail (conta do Google da empresa)</label><br><label><input type="radio" name="por" value="mailto"> Abrir no programa de e-mail do computador</label></p>
        <p><label><input type="checkbox" name="marcar" value="1" checked> Marcar a carta como enviada hoje (guarda o PDF na pasta do inquilino)</label></p>` });
    if (!r) return;
    baixar(carta.blob, carta.nome);
    window.open((r.por || [])[0] === 'mailto' ? mailto : gmail, '_blank', 'noopener');
    if ((r.marcar || [])[0] === '1') {
      await ACOES.cartaEnviada({ contrato: c.id, comp, enviada: '1' });
      return;
    }
    aviso('PDF baixado e e-mail aberto. A carta não foi marcada como enviada.');
  },

  /** Marca a carta como enviada e guarda o PDF dela na pasta do inquilino; desfazer apaga o PDF. */
  async cartaEnviada({ contrato, comp, enviada }) {
    if (enviada !== '1') {
      await alterarApagandoAnexos((db) => R.marcarCartaEnviada(db, Number(contrato), comp, false, login()));
      await mostrar();
      return;
    }
    await alterar((db) => R.marcarCartaEnviada(db, Number(contrato), comp, true, login()));
    try {
      const c = buscar('contratos', contrato);
      const nome = await guardarCartaNaPasta(c, comp);
      const carta = d().cartas_reajuste.find((x) => x.contrato_id === c.id && x.competencia === comp);
      if (nome && carta) await alterar((db) => R.atualizar(db, 'cartas_reajuste', carta.id, { arquivo: nome }, login(), 'Carta de reajuste guardada na pasta do inquilino'));
      if (nome) aviso(`Carta guardada na pasta do inquilino: ${nome}.`);
    } catch (e) {
      aviso(`A carta foi marcada como enviada, mas não deu para guardar o PDF na pasta: ${e.message}`, 'aviso');
    }
    await mostrar();
  },

  /** Calendário do Painel: mostra a agenda do dia clicado (clicar de novo fecha). */
  abrirDia({ dia }) {
    const alvo = document.querySelector(`[data-agenda="${dia}"]`);
    const abrir = alvo && alvo.hidden;
    document.querySelectorAll('[data-agenda]').forEach((el) => { el.hidden = true; });
    document.querySelectorAll('.cal-dia.selecionado').forEach((el) => el.classList.remove('selecionado'));
    if (abrir) {
      alvo.hidden = false;
      document.querySelector(`.cal-dia[data-dia="${dia}"]`).classList.add('selecionado');
    }
  },

  imprimirDemonstrativos({ comp }) {
    const ids = [...document.querySelectorAll('input[data-boleto]:checked')].map((x) => x.dataset.boleto);
    if (!ids.length) throw new C.ErroUsuario('Marque pelo menos um boleto na lista (ou "selecionar todos").');
    ir(`#/imprimir/demonstrativos?comp=${comp}&ids=${ids.join(',')}`);
  },

  /** Exclui os boletos marcados na lista. Pagos não saem: desfaça o pagamento antes (com NF, cancele a NF antes). */
  async excluirBoletosSelecionados({ comp }) {
    const ids = [...document.querySelectorAll('input[data-boleto]:checked')].map((x) => Number(x.dataset.boleto));
    if (!ids.length) throw new C.ErroUsuario('Marque pelo menos um boleto na lista (ou "selecionar todos").');
    const nome = (cb) => { const c = buscar('contratos', cb.contrato_id); return c ? c.inquilino_nome : `boleto ${cb.id}`; };
    const pagos = ids.map((id) => buscar('cobrancas', id)).filter((cb) => cb && cb.data_pagamento);
    if (pagos.length) throw new C.ErroUsuario(`Boleto(s) já pago(s) não podem ser excluídos: ${pagos.map(nome).join(', ')}. Desmarque ou desfaça o pagamento antes.`);
    // o título diz os meses dos boletos marcados (nos filtros de todos os meses eles são de vários meses)
    const meses = [...new Set(ids.map((id) => buscar('cobrancas', id)).filter(Boolean).map((cb) => cb.competencia))].sort();
    const deMeses = meses.length === 1 ? `de ${compBr(meses[0])}` : meses.length ? `de ${meses.map(compBr).join(', ')}` : `de ${compBr(comp)}`;
    if (!(await confirmar(`Eles podem ser gerados de novo depois.`, { titulo: `Excluir ${ids.length} boleto(s) ${deMeses}?`, sim: 'Excluir boletos', forte: true }))) return;
    let excluidos = 0;
    await alterarApagandoAnexos((db) => { // o PDF do boleto do banco anexado sai junto
      excluidos = 0;
      for (const id of ids) {
        const cb = R.buscar(db, 'cobrancas', id);
        if (!cb) continue; // já excluído por outra pessoa (ou noutra aba) enquanto a lista estava aberta
        const problema = TABELAS_EXCLUSAO.cobrancas.checar(db, cb);
        if (problema) throw new C.ErroUsuario(`${nome(cb)}: ${problema}`);
        R.excluir(db, 'cobrancas', id, login(), `Boleto de ${compBr(cb.competencia)} - ${nome(cb)} (exclusão em lote)`);
        excluidos += 1 + R.excluirParcelasIrmas(db, cb, login());
      }
    });
    aviso(`${excluidos} boleto(s) excluído(s).${excluidos < ids.length ? ` ${ids.length - excluidos} já não existia(m) mais.` : ''}`);
    await mostrar();
  },

  imprimirSelecionadas() {
    const ns = numerosSelecionados();
    ir(`#/imprimir/faturas?numeros=${ns.join(',')}`);
  },

  async pdf({ id }) {
    const f = buscar('faturas', id);
    avisarCortes([f]);
    aviso('Gerando o PDF…', 'info');
    const { blob, nome } = await pdfDaFatura(f);
    baixar(blob, nome);
  },

  async pdfSelecionadas() {
    await baixarPdfs(numerosSelecionados(), 'NFs selecionadas');
  },

  /** Todas as NFs do mês em PDF (ZIP); com ``empresa``, só as daquela empresa (ex.: todas da ANK). */
  async pdfMes({ mes, empresa }) {
    const ns = [...new Set(E.d.faturas.filter((f) => f.situacao === 'Emitida' && f.emissao.slice(0, 7) === mes).map((f) => f.numero))];
    const e = empresa ? buscar('emitentes', empresa) : null;
    await baixarPdfs(ns, `NFs ${mes} PDF${e ? ` ${siglaEmpresa(e)}` : ''}`, e ? e.id : null);
  },

  async excelSelecionadas() {
    const ns = numerosSelecionados();
    avisarCortes(E.d.faturas.filter((f) => f.situacao === 'Emitida' && ns.includes(f.numero)));
    const [ExcelJS, JSZip] = await Promise.all([excelJs(), jsZip()]);
    const modelo = await modeloFatura();
    const zip = new JSZip();
    for (const n of ns) {
      const { blob, nome } = await excelDoNumero(ExcelJS, modelo, n);
      zip.file(nome, blob);
    }
    baixar(await zip.generateAsync({ type: 'blob' }), 'NFs selecionadas.zip');
  },

  // usuários: aprovar pedido de acesso, recusar e bloquear
  async aprovarUsuario({ id }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só administradores aprovam acessos.');
    const sel = document.querySelector(`[data-papel-de="${id}"]`);
    const papel = sel ? sel.value : 'consulta';
    await alterar((db) => {
      const u = R.buscar(db, 'usuarios', id);
      R.atualizar(db, 'usuarios', u.id, { pendente: false, ativo: true, papel }, login(), `Acesso de ${u.nome} aprovado como ${PAPEIS[papel]}`);
    });
    aviso('Acesso aprovado.');
    await mostrar();
  },

  async recusarUsuario({ id }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só administradores recusam acessos.');
    await alterar((db) => R.excluir(db, 'usuarios', Number(id), login(), 'Pedido de acesso recusado'));
    await mostrar();
  },

  async bloquearUsuario({ id }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só administradores bloqueiam usuários.');
    if (Number(id) === E.usuario.id) throw new C.ErroUsuario('Você não pode bloquear o seu próprio acesso.');
    await alterar((db) => {
      const u = R.buscar(db, 'usuarios', id);
      R.atualizar(db, 'usuarios', u.id, { ativo: !u.ativo }, login(), u.ativo ? `Usuário ${u.login} bloqueado` : `Usuário ${u.login} desbloqueado`);
    });
    await mostrar();
  },

  /** Numera só os pagamentos marcados na fila (por padrão, os dos meses fechados), lembrando antes do Airbnb. */
  async numerar() {
    const apenas = [...document.querySelectorAll('input[data-nfp]:checked')].map((x) => x.dataset.nfp);
    if (!apenas.length) throw new C.ErroUsuario('Marque na lista os pagamentos que quer numerar.');
    const marcados = R.pendentesDeFatura(E.d).filter((p) => apenas.includes(R.chavePendente(p)));
    const meses = [...new Set(marcados.map((p) => p.data.slice(0, 7)))];
    const abertos = meses.filter((m) => !R.mesFechado(m));
    const avisos = [
      ...(abertos.length ? [`Há pagamento(s) de ${abertos.map(compBr).join(', ')}, mês ainda em andamento: o normal é numerar depois da virada do mês.`] : []),
      ...R.lembretesAirbnb(E.d, meses),
      ...cortesAntesDeNumerar(marcados),
    ];
    if (avisos.length && !(await confirmar(`${avisos.map((t) => `• ${t}`).join('\n')}\n\nNumerar mesmo assim?`, { titulo: 'Confira antes de numerar', sim: 'Numerar mesmo assim' }))) return;
    let r = await alterar((db) => R.numerarFaturas(db, login(), { apenas }));
    if (r.foraDeOrdem.length) {
      const lista = r.foraDeOrdem.map((p) => `${dataBr(p.data)}`).join(', ');
      if (!(await confirmar(`A última NF (nº ${R.numeroFatura(r.ultima.numero)}) é de ${dataBr(r.ultima.emissao)}, e há pagamento(s) com data anterior: ${lista}.\n\nNumerar mesmo assim? Eles receberão os próximos números, com a data do próprio pagamento.`, { titulo: 'Pagamentos com data anterior à última NF', sim: 'Numerar mesmo assim' }))) return;
      r = await alterar((db) => R.numerarFaturas(db, login(), { forcar: true, apenas }));
    }
    if (r.numeradas.length) aviso(`NFs numeradas: ${r.numeradas.map((n) => R.numeroFatura(n.numero)).join(', ')}.`);
    if (r.problema) aviso(r.problema, 'erro');
    await mostrar();
  },

  async excel({ numero }) {
    avisarCortes(E.d.faturas.filter((f) => f.situacao === 'Emitida' && f.numero === Number(numero)));
    const ExcelJS = await excelJs();
    const { blob, nome } = await excelDoNumero(ExcelJS, await modeloFatura(), numero);
    baixar(blob, nome);
  },

  /**
   * ZIP do mês para o contador (D10): por empresa e mês, as NFs emitidas (Excel, uma por número), a planilha das entradas e
   * saídas do extrato com o destino de cada uma e as cópias dos comprovantes já guardadas na pasta do contador. Baixa no computador.
   */
  async zipContador({ emitente, mes }) {
    const e = buscar('emitentes', emitente);
    if (!e || !/^\d{4}-\d{2}$/.test(mes || '')) throw new Error('Empresa ou mês inválido.');
    const [JSZip, ExcelJS] = await Promise.all([jsZip(), excelJs()]);
    const zip = new JSZip();
    const avisos = [];
    // 1) NFs do mês desta empresa, uma planilha por número (o mesmo Excel de "Baixar Excel")
    const nfs = E.d.faturas.filter((f) => f.emitente_id === e.id && f.situacao === 'Emitida' && String(f.emissao).slice(0, 7) === mes).sort((a, b) => a.numero - b.numero);
    const numeros = [...new Set(nfs.map((f) => f.numero))];
    let modelo = null;
    try { modelo = numeros.length ? await modeloFatura() : null; } catch (err) { avisos.push(`NFs em Excel não geradas: ${err.message}`); }
    if (modelo) {
      for (const n of numeros) {
        const fs = nfs.filter((f) => f.numero === n);
        zip.file(`NFs/${S.limparNome(`NF ${R.numeroFatura(n)} - ${fs[0].tomador_nome}.xlsx`)}`, await faturaExcel(ExcelJS, modelo, fs, E.d.emitentes));
      }
    }
    // 2) entradas e saídas das contas desta empresa no mês, com o destino de cada uma
    const contas = R.contasDoExtrato(E.d).filter((c) => c.emitente_id === e.id).map((c) => c.id);
    const movs = (E.d.movimentacoes_banco || []).filter((m) => contas.includes(m.conta_id) && String(m.data).slice(0, 7) === mes).sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Movimentações');
    const moeda = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    ws.addRow([`${e.nome} · entradas e saídas de ${compBr(mes)}`]).font = { bold: true, size: 14 };
    ws.addRow([`Gerado em ${C.agoraBr()} · ${movs.length} movimentação(ões) · ${movs.filter((m) => !m.classificacao).length} sem destino`]).font = { italic: true, color: { argb: 'FF666666' } };
    ws.addRow([]);
    const cab = ws.addRow(['Data', 'Conta', 'Tipo', 'Valor', 'Descrição do banco', 'Destino', 'Imóvel', 'Comprovante']);
    cab.font = { bold: true };
    for (const m of movs) {
      const i = m.imovel_id ? buscar('imoveis', m.imovel_id) : null;
      const linha = ws.addRow([new Date(`${m.data}T12:00:00`), R.apelidoDaConta(E.d, m.conta_id), m.tipo === 'saida' ? 'Saída' : 'Entrada', (m.tipo === 'saida' ? -1 : 1) * m.valor / 100,
        m.titulo || m.descricao || '', Z.descreverDestino(E.d, m) || 'SEM DESTINO', i ? i.nome : '', m.comprovante_contador || m.comprovante || '']);
      linha.getCell(1).numFmt = 'dd/mm/yyyy';
      linha.getCell(4).numFmt = moeda;
    }
    const soma = (tipo) => movs.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.valor, 0) / 100;
    const tot = ws.addRow(['', '', 'Entradas', soma('entrada')]); tot.font = { bold: true }; tot.getCell(4).numFmt = moeda;
    const tot2 = ws.addRow(['', '', 'Saídas', -soma('saida')]); tot2.font = { bold: true }; tot2.getCell(4).numFmt = moeda;
    ws.columns = [{ width: 12 }, { width: 10 }, { width: 9 }, { width: 14 }, { width: 44 }, { width: 50 }, { width: 22 }, { width: 50 }];
    zip.file(S.limparNome(`Movimentacoes ${e.nome} ${mes}.xlsx`), await wb.xlsx.writeBuffer());
    // 3) comprovantes já guardados na pasta do contador (cópias feitas pela tela Banco)
    let comprovantes = 0;
    try {
      const dir = await pastaDoEscopo('contador', R.idContador(e.id, mes), false);
      for (const a of await S.listar(dir)) { zip.file(`Comprovantes/${a.nome}`, await S.lerConteudo(await dir.getFileHandle(a.nome))); comprovantes += 1; }
    } catch { /* pasta ainda não existe: sem comprovantes */ }
    zip.file('LEIA-ME.txt', [`${e.razao_social || e.nome}${e.cnpj ? ` · CNPJ ${e.cnpj}` : ''}`, `Mês: ${compBr(mes)} · gerado em ${C.agoraBr()}`, '',
      `NFs: ${numeros.length} número(s) em Excel (pasta NFs).`, `Movimentações bancárias: ${movs.length} (planilha Movimentacoes), ${movs.filter((m) => !m.classificacao).length} ainda sem destino.`,
      `Comprovantes: ${comprovantes} arquivo(s) (pasta Comprovantes).`, ...(avisos.length ? ['', 'Avisos:', ...avisos] : [])].join('\n'));
    baixar(await zip.generateAsync({ type: 'blob' }), S.limparNome(`Contador ${e.nome} ${mes}.zip`));
    aviso(`ZIP do contador gerado: ${numeros.length} NF(s), ${movs.length} movimentação(ões) e ${comprovantes} comprovante(s).${avisos.length ? ` ${avisos.join(' ')}` : ''}`, avisos.length ? 'aviso' : 'ok');
  },

  /** Resultados financeiros do período em Excel: uma aba com o ranking e outra com as contas pagas por nós. */
  async excelResultados({ de, ate }) {
    const ExcelJS = await excelJs();
    const lista = R.resultadosFinanceiros(E.d, de, ate).sort((a, b) => a.controle - b.controle);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Resultados');
    const moeda = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    ws.addRow([`Resultados financeiros de ${dataBr(de)} a ${dataBr(ate)}`]).font = { bold: true, size: 14 };
    ws.addRow([`Gerado em ${C.agoraBr()}`]).font = { italic: true, color: { argb: 'FF666666' } };
    ws.addRow([]);
    const colunas = [['Posição', 9], ['Imóvel', 30], ['Valor do imóvel + reformas', 22], ['Aluguel recebido', 18], ['NFs avulsas', 15], ['Airbnb', 15], ['IPTU pago pelo proprietário', 22],
      ['Contas pagas por nós', 20], ['Resultado bruto', 18], ['Retorno ao ano', 15], ['Impostos (rateio)', 18], ['Impostos estimados', 18], ['Líquido', 18], ['Retorno líquido ao ano', 15],
      ['Reformas no período', 18], ['Lucro depois das reformas', 20], ['Pagamentos', 12], ['Observação', 30]];
    const cab = ws.addRow(colunas.map(([t]) => t));
    cab.font = { bold: true };
    cab.alignment = { wrapText: true, vertical: 'middle' };
    cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; });
    colunas.forEach(([, w], i) => { ws.getColumn(i + 1).width = w; });
    const r = (v) => v / 100;
    lista.forEach((x, n) => ws.addRow([x.retornoAnual !== null && !x.controle ? n + 1 : '', x.imovel.nome, r(x.base), r(x.aluguel), r(x.avulsas), r(x.airbnb), -r(x.iptu), -r(x.contas), r(x.resultado),
      x.retornoAnual === null ? '' : x.retornoAnual / 100, -r(x.impostos), -r(x.impostosEstimados), r(x.liquido), x.retornoLiquido === null ? '' : x.retornoLiquido / 100,
      -r(x.reformasPeriodo), r(x.lucro), x.mesesPagos, x.controle ? 'boleto de controle: não conta' : (x.base ? '' : 'informe o valor do imóvel')]));
    const conta = lista.filter((x) => !x.controle);
    const soma = (k) => r(conta.reduce((t, x) => t + x[k], 0));
    const base = conta.reduce((t, x) => t + x.base, 0);
    const resultado = conta.reduce((t, x) => t + x.resultado, 0);
    const meses = lista[0] ? lista[0].meses : 12;
    const liquido = conta.reduce((t, x) => t + x.liquido, 0);
    const tot = ws.addRow(['', 'Total', soma('base'), soma('aluguel'), soma('avulsas'), soma('airbnb'), -soma('iptu'), -soma('contas'), soma('resultado'), base ? (resultado * 12 / meses / base) : '',
      -soma('impostos'), -soma('impostosEstimados'), soma('liquido'), base ? (liquido * 12 / meses / base) : '', -soma('reformasPeriodo'), soma('lucro'), '', '']);
    tot.font = { bold: true };
    tot.eachCell((c) => { c.border = { top: { style: 'medium' } }; });
    for (const col of [3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 15, 16]) ws.getColumn(col).numFmt = moeda;
    for (const col of [10, 14]) ws.getColumn(col).numFmt = '0.00%';
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    // contas pagas por nós no período, uma por linha
    const wc = wb.addWorksheet('Contas pagas por nós');
    wc.addRow(['Imóvel', 'Mês de referência', 'Conta', 'Valor', 'Pago em', 'Observação', 'Vencimento']).font = { bold: true };
    [30, 14, 14, 15, 13, 40, 13].forEach((w, i) => { wc.getColumn(i + 1).width = w; });
    E.d.despesas.filter((x) => x.data_pagamento >= de && x.data_pagamento <= ate)
      .sort((a, b) => String(a.data_pagamento).localeCompare(String(b.data_pagamento)))
      .forEach((x) => wc.addRow([(buscar('imoveis', x.imovel_id) || {}).nome || '', compBr(x.competencia), x.tipo, r(x.valor), new Date(`${x.data_pagamento}T12:00:00`), x.observacoes || '', x.vencimento ? new Date(`${x.vencimento}T12:00:00`) : '']));
    // ressarcimentos de condomínio abatidos em boletos pagos no período (quando não saíram da NF)
    E.d.cobrancas.filter((cb) => cb.ressarcimento > 0 && !cb.ressarcimento_na_nf && cb.data_pagamento >= de && cb.data_pagamento <= ate).forEach((cb) => {
      const c = buscar('contratos', cb.contrato_id) || {};
      wc.addRow([(buscar('imoveis', c.imovel_id) || {}).nome || '', compBr(cb.competencia), 'Ressarcimento condomínio', r(cb.ressarcimento), new Date(`${cb.data_pagamento}T12:00:00`), cb.ressarcimento_descricao || '']);
    });
    wc.getColumn(4).numFmt = moeda;
    wc.getColumn(5).numFmt = 'dd/mm/yyyy';
    wc.getColumn(7).numFmt = 'dd/mm/yyyy';
    // ganhos do Airbnb no período, um por linha
    const wa = wb.addWorksheet('Airbnb');
    wa.addRow(['Imóvel', 'Mês de referência', 'Recebido em', 'Valor', 'Observação']).font = { bold: true };
    [30, 16, 13, 15, 40].forEach((w, i) => { wa.getColumn(i + 1).width = w; });
    (E.d.ganhos_airbnb || []).filter((g) => g.data_recebimento >= de && g.data_recebimento <= ate)
      .sort((a, b) => String(a.data_recebimento).localeCompare(String(b.data_recebimento)))
      .forEach((g) => wa.addRow([(buscar('imoveis', g.imovel_id) || {}).nome || '', compBr(g.competencia), new Date(`${g.data_recebimento}T12:00:00`), r(g.valor), g.observacoes || '']));
    wa.getColumn(3).numFmt = 'dd/mm/yyyy';
    wa.getColumn(4).numFmt = moeda;
    const buf = await wb.xlsx.writeBuffer();
    baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Resultados ${de} a ${ate}.xlsx`);
  },

  async excelMes({ mes }) {
    const [ExcelJS, JSZip] = await Promise.all([excelJs(), jsZip()]);
    const modelo = await modeloFatura();
    const numeros = [...new Set(E.d.faturas.filter((f) => f.situacao === 'Emitida' && f.emissao.slice(0, 7) === mes).map((f) => f.numero))].sort((a, b) => a - b);
    avisarCortes(E.d.faturas.filter((f) => f.situacao === 'Emitida' && numeros.includes(f.numero)));
    const zip = new JSZip();
    for (const n of numeros) {
      const { blob, nome } = await excelDoNumero(ExcelJS, modelo, n);
      zip.file(nome, blob);
    }
    baixar(await zip.generateAsync({ type: 'blob' }), `NFs ${mes}.zip`);
  },

  async exportar(_dados, el) {
    if (E.nuvem && !podeUsuario('admin')) throw new C.ErroUsuario('Na nuvem, só o administrador baixa o ZIP com todos os dados (o aparelho dos outros usuários não recebe as senhas de todos, e o ZIP não serviria num desastre).');
    const JSZip = await jsZip();
    const barra = andamentoZip('progresso-exportar');
    let blob;
    try { blob = await S.exportarZip(JSZip, E.pasta, E.d, barra.aoAndar); } finally { barra.fim(); }
    const nome = `imoveis-${C.carimboLocal()}.zip`; // data e hora daqui (a UTC passava para o dia seguinte depois das 21h)
    baixar(blob, nome);
    await alterar((db) => R.registrar(db, login(), 'Exportação', 'banco', null, 'Banco e arquivos exportados em ZIP', null, {}, false));
    statusDoBotao(el).mostrar(`ZIP baixado: ${nome} (${C.tamanhoTexto(blob.size)}). Veja na pasta de downloads.`, 'ok');
  },

  async exportarPlanilhaPdf(_dados, el) {
    // só o jsPDF: este PDF é escrito direto (não fotografa a tela, então não precisa baixar o html2canvas)
    const [ExcelJS, jsPDF, { pdfDeTudo, planilhaDeTudo }] = await Promise.all([excelJs(), jsPdf(), carregarParte(() => import('../exportar.js'))]);
    const quando = C.carimboLocal();
    baixar(await planilhaDeTudo(ExcelJS, E.d), `imoveis-dados-${quando}.xlsx`);
    baixar(pdfDeTudo(jsPDF, E.d), `imoveis-dados-${quando}.pdf`);
    await alterar((db) => R.registrar(db, login(), 'Exportação', 'banco', null, 'Todos os dados exportados em planilha e PDF', null, {}, false));
    statusDoBotao(el).mostrar(`Baixados: imoveis-dados-${quando}.xlsx e imoveis-dados-${quando}.pdf (pasta de downloads).`, 'ok');
  },

  async baixarRegras() {
    const [{ REGRAS_TEXTO }, { textoDasRegrasEmUso }] = await Promise.all([carregarParte(() => import('../regras-texto.js')), parteAdiada('regras')]);
    baixar(new Blob(['﻿', REGRAS_TEXTO, textoDasRegrasEmUso()], { type: 'text/plain;charset=utf-8' }), 'Regras do sistema.txt');
  },

  async removerModelo() {
    const dir = await E.pasta.getDirectoryHandle(S.PASTA_MODELOS, { create: true });
    await dir.removeEntry(S.MODELO_FATURA).catch(() => {});
    await alterar((db) => R.registrar(db, login(), 'Alteração', 'banco', null, 'Voltou ao modelo Excel padrão'));
    await mostrar();
  },

  /**
   * Apaga um arquivo do seguro (a apólice ou outro documento). A apólice de uma vigência anterior pede para abrir e
   * conferir o arquivo antes (marcar "conferi"); depois dá para anexar o certo em "Anexar arquivos" dos documentos.
   */
  async excluirArquivoSeguro({ contrato, seguro, nome, conferir }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode apagar arquivos.');
    const s = buscar('seguros', seguro);
    if (!s) throw new C.ErroUsuario('Esta apólice não existe mais (pode ter sido excluída por outra pessoa). Atualize a página.');
    if (conferir) {
      const resp = await janela({ titulo: 'Apagar a apólice de uma vigência anterior', forte: true, sim: 'Apagar o arquivo', nao: 'Cancelar',
        html: `<p>Este arquivo é a apólice da vigência <b>${dataBr(s.vigencia_inicio)} a ${dataBr(s.vigencia_fim)}</b>. Abra e confira se é mesmo o arquivo errado antes de apagar:</p>
          <p><a href="#" data-acao="abrirArquivo" data-escopo="seguro" data-id="${esc(contrato)}" data-nome="${esc(nome)}">📎 ${esc(nome)}</a></p>
          <p><label class="check"><input type="checkbox" name="conferi" value="1"> Abri o arquivo e confirmo que quero apagar</label></p>
          <p class="suave">Depois, anexe o certo em "Anexar arquivos" dos documentos do seguro, escolhendo "Apólice" e esta vigência.</p>` });
      if (!resp) return;
      if (!resp.conferi) throw new C.ErroUsuario('Marque "Abri o arquivo e confirmo" para apagar. Nada foi apagado.');
    }
    await alterarApagandoAnexos((db) => R.tirarArquivoSeguro(db, s.id, nome, login()));
    aviso(`Arquivo apagado: ${nome}.`);
    await mostrar();
  },

  async enviarArquivos({ upload }, el) {
    const [escopo, id] = upload.split(':');
    if (escopo === 'seguro') return enviarArquivosSeguro(Number(id), el);
    // tipo proibido no meio da escolha: confere todos antes de gravar o primeiro e anexa só os aceitos (comunicacoes-025)
    const todos = [...el.files];
    const recusados = todos.filter((f) => !S.nomeAnexavel(f.name)).map((f) => f.name);
    const aceitos = todos.filter((f) => S.nomeAnexavel(f.name));
    if (!aceitos.length) throw new C.ErroUsuario(`Nada foi anexado (${recusados.join(', ')}). ${S.ERRO_TIPO_ARQUIVO}`);
    const dir = await pastaDoEscopo(escopo, Number(id));
    const nomes = [];
    const vinc = vinculoDoEscopo(escopo, id);
    const registrar = () => alterar((db) => R.registrar(db, login(), 'Inclusão', 'arquivos', null, `${nomes.length} arquivo(s) anexado(s)`, { arquivos: nomes.join(', ') }, vinc));
    try {
      for (const f of aceitos) nomes.push(await S.salvarArquivo(dir, escopo === 'matricula' && !ehMatricula(f.name) ? new File([f], `Matricula ${f.name}`, { type: f.type }) : f));
    } catch (e) {
      // o que já foi gravado entra no Histórico e na lista mesmo se um arquivo do meio falhar
      if (nomes.length) { await registrar(); await mostrar(); }
      throw e;
    }
    await registrar();
    aviso(`${nomes.length} arquivo(s) anexado(s).${recusados.length ? ` Não anexado(s), tipo de arquivo não aceito: ${recusados.join(', ')}.` : ''}`, recusados.length ? 'aviso' : undefined);
    await mostrar();
  },

  // Só PDF e fotos abrem na aba nova, com o tipo forçado (o tipo do arquivo em disco vem da extensão e não é confiável):
  // um .html/.svg anexado abriria como página na origem do sistema, com acesso à sessão e à pasta. Os outros tipos são baixados.
  async abrirArquivo({ escopo, id, nome }) {
    let arq;
    try { arq = await S.abrirArquivo(await pastaDoEscopo(escopo, Number(id)), nome); } catch (e) {
      // arquivo apagado ou movido da pasta por fora do sistema: explica em vez do erro do navegador em inglês (links-pc-009)
      if (e && e.name === 'NotFoundError') throw new C.ErroUsuario(`O arquivo "${nome}" não está mais na pasta (foi apagado ou movido por fora do sistema). Tire-o com o × e anexe de novo.`);
      throw e;
    }
    const tipo = S.tipoParaAbrir(nome);
    if (!tipo) return baixar(arq, nome);
    if (await noVisualizador(arq, nome, tipo)) return; // celular: mostra na tela em vez de baixar
    abrirEmAbaNova(new Blob([arq], { type: tipo }), 'noopener');
  },

  /**
   * Página Inquilinos: botão "Matrícula" ao lado do imóvel. Abre o arquivo da matrícula (pasta "Matrículas" do imóvel);
   * com mais de um, pergunta qual. Sem arquivo, explica onde anexar (lista de Imóveis, coluna Matrícula).
   */
  /** Botão apagado (ex.: "Contrato" sem o arquivo assinado): o toque explica o motivo (no celular não há "passar o mouse"). */
  explicarBotao({ texto }) {
    if (texto) aviso(String(texto), 'aviso');
  },

  async abrirMatricula({ imovel }) {
    const i = buscar('imoveis', Number(imovel));
    let lista = [];
    try { lista = (await S.listar(await pastaDoEscopo('matricula', i.id, false))).filter((a) => ehMatricula(a.nome)); } catch { lista = []; }
    if (!lista.length) throw new C.ErroUsuario(`${i.nome}: nenhum arquivo da matrícula anexado. Anexe na lista de Imóveis (📎 Anexar, embaixo do nome).`);
    let nome = lista[0].nome;
    if (lista.length > 1) {
      const r = await janela({ titulo: `Matrícula · ${i.nome}`, sim: 'Abrir', html: `<p>Qual arquivo?</p>${lista.map((a, n) => `<label style="display:block;margin:6px 0"><input type="radio" name="nome" value="${esc(a.nome)}"${n ? '' : ' checked'}> ${esc(a.nome)}</label>`).join('')}` });
      if (!r || !r.nome) return;
      [nome] = r.nome;
    }
    return ACOES.abrirArquivo({ escopo: 'matricula', id: i.id, nome });
  },

  /** Faixa do topo (login da internet vencido): recarrega a página para entrar de novo; a fila do aparelho fica. */
  recarregarPagina() { location.reload(); },

  /** Sistema: apaga as telas guardadas no aparelho (não os dados nem o que espera envio) e abre a versão nova. */
  async atualizarSistema() {
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
    for (const reg of (await navigator.serviceWorker?.getRegistrations?.()) || []) await reg.update().catch(() => {});
    location.reload();
  },

  // ------------------------------------------------------------------------
  // Banco (C6): boleto com Pix pela ponte. A chamada ao banco fica fora do alterar(); o resultado é gravado depois.
  // ------------------------------------------------------------------------
  /** Sistema: chama /saude da ponte e mostra o que falta (certificado, chaves, token, modo simulado). */
  /** Sistema: apaga o endereço e a senha da ponte guardados neste navegador (nada muda no arquivo de dados). */
  async esquecerPonteC6() {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador altera a integração com o banco.');
    await BANCO.esquecerPonteLocal();
    aviso('Ponte esquecida neste computador. Para usar o banco aqui de novo, informe o endereço e a senha e salve.');
    await mostrar();
  },

  async testarPonteC6() {
    const alvo = document.getElementById('saude-ponte');
    if (alvo) alvo.innerHTML = '<p class="suave">Falando com a ponte…</p>';
    try {
      const s = await BANCO.saudePonte(d());
      if (alvo) alvo.innerHTML = htmlSaude(s);
      aviso(s.simulado ? 'Ponte respondeu em modo simulado.' : s.configurado ? 'Ponte pronta para falar com o banco.' : 'Ponte respondeu, mas ainda faltam as chaves do banco (veja abaixo).', s.configurado && !s.simulado ? 'ok' : 'aviso');
    } catch (e) {
      if (alvo) alvo.innerHTML = `<div class="alerta perigo">${esc(e.message)}</div>`;
      throw e;
    }
  },

  async testarContaC6({ conta }) {
    const alvo = document.getElementById('saude-ponte');
    if (alvo) alvo.innerHTML = '<p class="suave">Falando com a ponte…</p>';
    try {
      const s = await BANCO.saudeConta(d(), conta);
      if (alvo) alvo.innerHTML = htmlSaude({ ponte: true, simulado: s.simulado, configurado: s.configurado, contas: { [conta]: s } }, conta);
    } catch (e) {
      if (alvo) alvo.innerHTML = `<div class="alerta perigo">${esc(e.message)}</div>`;
      throw e;
    }
  },

  /** Preenche o formulário "Incluir ou alterar uma conta" com a conta escolhida. */
  editarContaBanco({ conta }) {
    const c = R.contaBanco(d(), conta);
    if (!c) throw new C.ErroUsuario('Esta conta bancária não existe mais. Atualize a página.');
    const det = document.getElementById('nova-conta-banco');
    const form = det && det.querySelector('form');
    if (!form) return;
    det.open = true;
    for (const [k, v] of Object.entries(c)) if (form.elements[k] && typeof v !== 'object') form.elements[k].value = v ?? '';
    for (const [k, v] of Object.entries(c.notificar || {})) if (form.elements[`notificar_${k}`]) form.elements[`notificar_${k}`].checked = !!v;
    if (form.elements.negativacao_ativa) form.elements.negativacao_ativa.checked = !!(c.negativacao && c.negativacao.ativa);
    if (form.elements.negativacao_dias && c.negativacao) form.elements.negativacao_dias.value = c.negativacao.dias_atraso;
    if (form.elements.desconto_conferido) form.elements.desconto_conferido.checked = !!(c.desconto_conferido && c.desconto_conferido.tipo === c.tipo_desconto);
    form.elements.id.focus();
    det.scrollIntoView({ block: 'start' });
  },

  async excluirContaBanco({ conta }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador altera a integração com o banco.');
    await alterar((db) => R.excluirContaBanco(db, conta, login()));
    aviso('Conta tirada da integração.');
    await mostrar();
  },

  /** Tira uma conta de outro banco (só extrato por arquivo), se ainda não tem extrato importado. */
  async excluirContaArquivo({ conta }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador altera as contas do banco.');
    await alterar((db) => R.excluirContaArquivo(db, conta, login()));
    aviso('Conta de outro banco tirada.');
    await mostrar();
  },

  /** Emite um boleto no C6: escolhe a conta (pergunta se o imóvel tem mais de uma empresa), chama a ponte e grava a resposta. */
  async emitirBoletoC6({ id }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode emitir boletos.');
    const cb = buscar('cobrancas', id);
    const conta = await escolherContaC6(cb);
    if (!conta) return;
    const banco = await emitirNoC6(cb, conta);
    aviso(`Boleto emitido no C6 pela conta ${conta.apelido}${banco.ambiente === 'sandbox' ? ' (sandbox: teste, não vale como cobrança)' : ''}. Linha digitável: ${banco.linha_digitavel || '-'}`, banco.ambiente === 'sandbox' ? 'aviso' : 'ok');
    if (avisoSemPix(conta, banco)) aviso(avisoSemPix(conta, banco), 'aviso');
    await mostrar();
  },

  /** Emite todos os boletos em aberto do mês ainda não emitidos; os que precisam de escolha da conta ficam para emitir um a um. */
  async emitirBoletosMesC6({ comp }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode emitir boletos.');
    const lista = R.boletosParaEmitir(d(), comp);
    if (!lista.length) throw new C.ErroUsuario('Todos os boletos em aberto deste mês já foram emitidos no banco: nada a emitir.');
    const falhas = [];
    let emitidos = 0;
    // modo "escolher": os boletos de imóvel com uma só empresa usam a conta dela; para os outros, pergunta uma vez
    const semConta = lista.filter((cb) => !R.contaSugerida(d(), cb));
    const contaDoLote = semConta.length ? await escolherContaC6(null, `${semConta.length} boleto(s) em aberto do mês: escolha a empresa que emite o lote.`) : null;
    if (semConta.length && !contaDoLote) return;
    const usadas = new Set();
    const semPix = [];
    for (const cb of lista) {
      try {
        const conta = R.contaSugerida(d(), cb) || contaDoLote;
        usadas.add(conta.apelido);
        const banco = await emitirNoC6(buscar('cobrancas', cb.id), conta);
        if (avisoSemPix(conta, banco)) semPix.push(conta);
        emitidos += 1;
      } catch (e) {
        falhas.push(`${buscar('contratos', cb.contrato_id).inquilino_nome}: ${e.message}`);
      }
    }
    aviso(`${emitidos} boleto(s) emitido(s) no C6${usadas.size ? ` pela(s) conta(s) ${[...usadas].join(', ')}` : ''}.${falhas.length ? ` ${falhas.length} falharam: ${falhas.join(' · ')}` : ''}`, falhas.length ? 'aviso' : 'ok');
    if (semPix.length) aviso(`${semPix.length} boleto(s) saiu(íram) sem o Pix: a ponte não tem a chave Pix da(s) conta(s) ${[...new Set(semPix.map((c) => `C6_${String(c.id).toUpperCase()}_CHAVE_PIX`))].join(', ')}.`, 'aviso');
    await mostrar();
  },

  /** Consulta a situação no banco; se o banco diz que foi pago e aqui ainda não está, propõe registrar o pagamento (nunca registra sozinho). */
  async consultarBoletoC6({ id }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode alterar boletos.');
    const cb = buscar('cobrancas', id);
    const resposta = await BANCO.consultarBoleto(d(), cb);
    const banco = await alterar((db) => R.registrarBoletoBancario(db, cb.id, resposta, login()));
    if (banco.situacao !== 'pago') {
      aviso(R.aguardandoCredito({ banco }) ? 'O inquilino pagou e o banco ainda está confirmando o crédito. Consulte de novo mais tarde para registrar o pagamento.'
        : banco.situacao === 'cancelado' ? 'O banco informa que este boleto está cancelado.' : `Situação no banco: ${banco.situacao_banco || 'em aberto'}. Ainda não foi pago.`, 'info');
      await mostrar();
      return;
    }
    if (cb.data_pagamento) {
      aviso('O banco confirma o pagamento, que já está registrado aqui.');
      await mostrar();
      return;
    }
    await proporPagamentoDoBanco(buscar('cobrancas', id));
    await mostrar();
  },

  /** Negativação do pagador no birô: só administrador, conta com a opção ligada, 2ª confirmação com o nome do inquilino e o prazo. */
  async negativarC6({ id }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador negativa um pagador.');
    const cb = buscar('cobrancas', id);
    const conta = R.contaBanco(d(), cb.banco && cb.banco.conta_id);
    if (!conta || !conta.negativacao.ativa) throw new C.ErroUsuario('A negativação está desligada nesta conta (Sistema → Banco → Banco (C6)).');
    const c = buscar('contratos', cb.contrato_id);
    const resp = await janela({ titulo: '2ª confirmação: negativar no birô de crédito', forte: true,
      html: `<p>O banco vai incluir <b>${esc(c.inquilino_nome)}</b>${c.inquilino_cpf ? ` (${esc(c.inquilino_cpf)})` : ''} no birô de crédito se o boleto de <b>${esc(compBr(cb.competencia))}</b> (${esc(reais(cb.banco.valor))}, vencimento ${esc(dataBr(cb.vencimento))}) não for pago em até <b>${conta.negativacao.dias_atraso} dias de atraso</b>.</p>
        <p><label>Dias de atraso</label><input type="number" name="dias" min="1" value="${conta.negativacao.dias_atraso}" required></p>
        <p>Digite <b>NEGATIVAR</b> para confirmar: <input name="confirmo" autocomplete="off" required></p>`,
      sim: 'Agendar a negativação', nao: 'Cancelar' });
    if (!resp) return;
    if (String((resp.confirmo || [])[0] || '').trim().toUpperCase() !== 'NEGATIVAR') throw new C.ErroUsuario('Digite NEGATIVAR para confirmar. Nada foi feito.');
    const dias = Number((resp.dias || [])[0]);
    if (!Number.isInteger(dias) || dias < 1) throw new C.ErroUsuario('Informe os dias de atraso (número inteiro, a partir de 1).');
    await conferirAntesDeAgirNoBanco(cb.id, 'negativar');
    const resposta = await BANCO.negativarBoleto(d(), buscar('cobrancas', cb.id), dias);
    await alterar((db) => R.registrarNegativacao(db, cb.id, resposta, login(), dias));
    aviso(`Negativação agendada no C6${resposta && resposta.denial_date ? ` para ${dataBr(resposta.denial_date)}` : ''}.`, 'aviso');
    await mostrar();
  },

  async cancelarNegativacaoC6({ id }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador cancela a negativação.');
    const cb = buscar('cobrancas', id);
    const resposta = await BANCO.cancelarNegativacao(d(), cb);
    await alterar((db) => { R.registrarCancelamentoNegativacao(db, cb.id, login()); if (resposta && resposta.external_reference_id) R.registrarBoletoBancario(db, cb.id, resposta, login()); });
    aviso('Cancelamento da negativação pedido ao C6.');
    await mostrar();
  },

  /** Boleto mudou depois de emitido: manda ao banco o valor, o vencimento e a descrição atuais (PATCH). Se recusar, cancelar e emitir outro. */
  async alterarBoletoC6({ id }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode alterar boletos.');
    const cb = buscar('cobrancas', id);
    let resposta;
    try {
      resposta = await BANCO.alterarBoleto(d(), cb);
    } catch (e) {
      throw new Error(`${e.message} Alternativa: "Cancelar no banco" e depois "Emitir no C6" de novo.`);
    }
    await alterar((db) => R.registrarBoletoBancario(db, cb.id, resposta, login(), { alterado: true }));
    aviso('Boleto atualizado no C6 com os valores do sistema (valor, vencimento, bonificação, multa e juros).');
    await mostrar();
  },

  async cancelarBoletoC6({ id }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode alterar boletos.');
    await conferirAntesDeAgirNoBanco(id, 'cancelar');
    const cb = buscar('cobrancas', id);
    const resposta = await BANCO.cancelarBoleto(d(), cb);
    await alterar((db) => R.registrarCancelamentoBancario(db, cb.id, login(), resposta));
    aviso('Boleto cancelado no C6. Se precisar, emita outro.');
    await mostrar();
  },

  /** Só com a ponte em modo simulado: marca o boleto fictício como pago, para testar o fluxo de consulta → registrar pagamento. */
  async pagarSimuladoC6({ id }) {
    const cb = buscar('cobrancas', id);
    if (!cb.banco || !cb.banco.simulado) throw new Error('Este boleto não é fictício.');
    const previsto = R.previstoNoPagamento(cb, C.hojeIso(), {});
    await BANCO.chamarPonte(cb.banco.conta_id, 'POST', `/simulado/pagar/${encodeURIComponent(cb.banco.id_externo)}`, { payment_date: C.hojeIso(), amount: R.centavosParaReais(previsto.valor_devido) });
    aviso('Pagamento fictício registrado na ponte. Agora clique em "Consultar situação no banco".', 'info');
  },

  abrirPdfC6({ id }) {
    const cb = buscar('cobrancas', id);
    // a ponte exige a senha num cabeçalho, que uma aba nova não manda: baixa pelo fetch e abre o arquivo
    return BANCO.chamarPonteCrua('GET', `/contas/${encodeURIComponent(cb.banco.conta_id)}/boletos/${encodeURIComponent(cb.banco.id_externo)}/pdf`, null, { fetch: async (url, o) => {
      const r = await fetch(url, o);
      if (!r.ok) return r;
      const blob = await r.blob();
      if (!(await noVisualizador(blob, 'boleto.pdf', 'application/pdf', false))) abrirEmAbaNova(blob);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    } });
  },

  /** Sistema: confere agora os arquivos dos lançamentos (devolve os que estavam em outra pasta; alerta os que sumiram). */
  async conferirArquivos(_dados, el) {
    const status = statusDoBotao(el); // "Conferindo os arquivos…" já está embaixo do botão (data-status)
    // trocas de titular: o que ficou no contrato anterior (ex.: aplicação da garantia) passa ao novo antes de conferir
    await conferirHerancas();
    const r = await conferirArquivos();
    status.mostrar(`${r.conferidos} arquivo(s) conferido(s).${r.devolvidos.length ? ` ${r.devolvidos.length} estavam em outra pasta e voltaram ao lugar.` : ''}${r.faltando.length ? ` ${r.faltando.length} não foram encontrados: veja o alerta no Painel.` : ' Nenhum faltando.'}`, r.faltando.length ? 'aviso' : 'ok');
  },

  /**
   * Sistema (administrador): compacta as fotos e os PDFs escaneados que já estão no sistema (compactar.js), trocando
   * no lugar com o mesmo nome. PDF assinado fica como está; documento do link da ficha, só depois de conferido.
   */
  async compactarAnexos(_dados, el) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador compacta os anexos que já estão no sistema.');
    const status = statusDoBotao(el); // andamento e resultado embaixo do botão
    const mostrarAndamento = (t, tipo = 'info') => status.mostrar(t, tipo);
    const MB = (b) => `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;
    mostrarAndamento('Procurando os anexos…');
    let raiz;
    try { raiz = await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS); } catch { mostrarAndamento('Não há anexos para compactar.'); return; }
    // documentos do link da ficha: só os já conferidos (a conferência guardada na ficha olhou o arquivo como chegou)
    const conferidos = new Map((d().fichas || []).flatMap((f) => Object.keys(f.conferencias_link || {}).map((n) => [`${S.limparNome(f.pasta || nomePastaFicha(f))}|${n}`, f.id])));
    const r = await CP.compactarTodos(raiz, {
      conferido: (pastaFicha, nome) => conferidos.has(`${pastaFicha}|${nome}`),
      ler: (h) => S.lerConteudo(h),
      gravar: async (dir, nome, arq, partes = []) => {
        // documento do link: o resumo do compactado entra na conferência antes da troca (senão a ficha acusa "o arquivo mudou")
        const fichaId = partes[0] === CP.PASTA_FICHAS ? conferidos.get(`${partes[1]}|${nome}`) : null;
        if (fichaId) {
          const sha256 = await CPF.resumoDoArquivo(new Uint8Array(await arq.arrayBuffer()));
          await alterar((db) => R.registrarCompactacaoDoLink(db, fichaId, { [nome]: sha256 }, login()));
        }
        return S.escreverTexto(dir, nome, arq);
      },
      aoAndar: ({ feitos, total, compactados, economia }) => mostrarAndamento(`${total ? Math.floor((100 * feitos) / total) : 100}%: ${feitos} de ${total} arquivo(s) olhados · ${compactados} compactado(s) · ${MB(economia)} a menos`),
    });
    const texto = r.compactados
      ? `${r.compactados} de ${r.vistos} arquivo(s) compactado(s): de ${MB(r.antes)} para ${MB(r.depois)} (${MB(r.antes - r.depois)} a menos).`
      : `Nenhum dos ${r.vistos} arquivo(s) olhados ficaria bem menor: nada foi trocado.`;
    if (r.compactados) {
      await alterar((db) => R.registrar(db, login(), 'Alteração', 'arquivos', null, `Anexos compactados: ${texto}`, null, {}, false));
      atualizarCopiaAberta().catch(() => {}); // a cópia aberta do PC recebe os arquivos novos (tamanho mudou)
    }
    mostrarAndamento(`${texto}${r.falhas ? ` ${r.falhas} não puderam ser lidos.` : ''}`, r.falhas ? 'aviso' : 'ok');
  },

  async excluirArquivo({ escopo, id, nome }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode apagar arquivos.');
    // arquivo ligado a um lançamento (inclusive o herdado na troca de titular): só sai pelo × do lançamento
    const dono = R.rotulosDosArquivos(d()).get(`${escopo}:${id}|${nome}`) || (anexosEmUso().has(`${chavePasta(escopo, id)}|${nome}`) ? 'arquivo de um lançamento' : '');
    if (dono) throw new C.ErroUsuario(`Este arquivo é o ${dono}: para apagar, use o "×" ao lado do lançamento (volta o aviso para anexar).`);
    const dir = await pastaDoEscopo(escopo, Number(id));
    await dir.removeEntry(nome);
    const vinc = vinculoDoEscopo(escopo, id);
    await alterar((db) => R.registrar(db, login(), 'Exclusão', 'arquivos', null, `Arquivo excluído: ${nome}`, null, vinc));
    await mostrar();
  },
};

// Banco (extrato, comprovantes e pagamentos pelo C6): botões em telas/banco.js
Object.assign(ACOES, ACOES_BANCO, ACOES_FICHAS, ACOES_TERMO, ACOES_ICONE, ACOES_EMAILS, ACOES_PASTA, ACOES_NOTIFICACOES, ACOES_COMUNICACOES, ACOES_PROVAS);
// telas raras (nuvem, regras do sistema, régua, dados de uma pessoa): carregadas no 1º clique (PARTES_ADIADAS, telas/comum.js)
Object.assign(ACOES, adiados('acoes'));
