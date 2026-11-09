// Banco: extrato das contas (#/banco), destino das movimentações, comprovantes, caixa do imóvel, "Pagar pelo banco" (#/contas) e pagamentos (#/banco/pagamentos).
// Regras em conciliacao.js (Z); conversa com a ponte do C6 em banco-fase2.js (P). Nada aqui paga sozinho: o banco só valida e
// manda para aprovação no aplicativo do C6; a confirmação final vem pelo extrato.
import { alterar, aviso, E, ir, janela, login, mostrar, podeUsuario } from '../app.js';
import * as S from '../armazenamento.js';
import * as P from '../banco-fase2.js';
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import * as Z from '../conciliacao.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { alterarApagandoAnexos, botao, buscar, caixaArquivos, d, etiqueta, link, memoria, opera, ordenar, PASTA_CONTADOR, pastaDoEscopo } from './comum.js';

// --------------------------------------------------------------------------
// Configuração e atalhos
// --------------------------------------------------------------------------
const TITULO_AGUARDANDO = 'Aguardando as chaves da API do C6';
const config = () => d().config_banco || {};
const contas = () => config().contas || [];
const contaDe = (id) => contas().find((c) => c.id === id) || null;
const bancoAtivo = () => !!config().ativo && contas().length > 0;
const movs = () => d().movimentacoes_banco || [];
const pagamentos = () => d().pagamentos_banco || [];
const nomeConta = (id) => { const c = contaDe(id); return c ? c.apelido || String(c.id).toUpperCase() : String(id || '').toUpperCase(); };
const emitenteDaConta = (id) => { const c = contaDe(id); return c && c.emitente_id ? buscar('emitentes', c.emitente_id) : null; };
const pastaContador = () => config().pasta_contador || PASTA_CONTADOR;
/** Rótulo de um objeto { id: rotulo } (CLASSIFICACOES, SITUACOES_PAGAMENTO). */
const rotuloDe = (lista, id) => lista[id] || id;
/** Nome curto da classificação para as etiquetas da tabela (o nome completo fica na janela "Dar destino"). */
const ROTULO_CURTO = { boleto: 'Boleto nosso', airbnb: 'Airbnb', reforma: 'Reforma', conta_imovel: 'Conta do imóvel', iptu: 'IPTU', imposto: 'Imposto', tarifa: 'Tarifa', transferencia: 'Transferência', outro: 'Outro', ignorar: 'Ignorada' };
/** Destinos que não precisam de comprovante (igual a conciliacao.js: só a ignorada; a transferência entre as nossas contas tem um PDF só, na pasta do contador da conta de origem). */
const SEM_COMPROVANTE = ['ignorar'];
/** Destinos sem imóvel. */
const SEM_IMOVEL = ['tarifa', 'transferencia', 'ignorar', 'imposto', 'airbnb'];
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const mov = (id) => { const m = movs().find((x) => x.id === Number(id)); if (!m) throw new Error('Movimentação não encontrada.'); return m; };
const pag = (id) => { const p = pagamentos().find((x) => x.id === Number(id)); if (!p) throw new Error('Pagamento não encontrado.'); return p; };
const registroDe = (tabela, id) => (tabela === 'pagamentos_banco' ? pag(id) : mov(id));
const valorHtml = (m) => `<span class="mov-${m.tipo}">${m.tipo === 'entrada' ? '+' : '−'} ${reais(m.valor)}</span>`;
const precisaComprovante = (m) => !!m.classificacao && !SEM_COMPROVANTE.includes(m.classificacao);
const temComprovante = (x) => !!(x.comprovante || x.comprovante_contador);
const sugestaoDe = (m) => (m.classificacao ? null : Z.sugerirDestino(d(), m));
const centavosDoBanco = (x) => { try { return Z.centavosDoC6(x); } catch { return 0; } };

/** Botão que fala com a ponte: desligado (com o motivo) enquanto o banco não está configurado em Dados e backup. */
const botaoPonte = (acao, texto, dados = {}, cls = 'secundario pequeno') => (bancoAtivo() ? botao(acao, texto, dados, cls)
  : `<button type="button" class="${cls}" disabled title="${TITULO_AGUARDANDO}">${texto}</button>`);

/** Estado só da tela (não vai para o banco de dados): saldos consultados e a conferência de boletos pagos. */
const estado = { saldos: {}, conferencia: null };

const avisoNaoConfigurado = () => `<div class="alerta aviso" id="banco-nao-configurado"><b>O banco ainda não está ligado.</b> As chaves da API do C6 são configuradas em <a href="#/dados">Dados e backup</a> (caixa "Banco (C6)").
  Até lá, os botões que falam com o banco ficam desligados; o que já foi importado continua aqui.</div>`;
const avisoPagamentosDesligados = () => `<div class="alerta aviso"><b>Os pagamentos pelo banco estão desligados.</b> O administrador liga em <a href="#/dados?ir=config-banco2">Dados e backup → Banco: conciliação e pagamentos</a>. Enquanto isso, as contas são pagas fora do sistema e só o extrato é conferido aqui.</div>`;

// --------------------------------------------------------------------------
// Tela #/banco
// --------------------------------------------------------------------------
export function telaBanco(rota) {
  if (rota.partes[1] === 'pagamentos') return telaPagamentosBanco();
  const lista = contas();
  const contasVistas = [...new Set([...lista.map((c) => c.id), ...movs().map((m) => m.conta_id)])];
  if (!contasVistas.length) {
    return `<h1>Banco</h1>${avisoNaoConfigurado()}
      <div class="cartao"><h2>O que esta tela faz</h2><p>${AJUDA_BANCO}</p>
      <p class="acoes">${link('#/dados', 'Ir para Dados e backup', 'botao')} ${link('#/banco/pagamentos', 'Pagamentos pelo banco')}</p></div>`;
  }
  const conta = contasVistas.includes(rota.q.conta) ? rota.q.conta : config().conta_padrao_id && contasVistas.includes(config().conta_padrao_id) ? config().conta_padrao_id : contasVistas[0];
  const mes = /^\d{4}-\d{2}$/.test(rota.q.mes || '') ? rota.q.mes : C.competenciaDe(C.hojeIso());
  const filtro = rota.q.filtro || 'todas';
  const imovelFiltro = rota.q.imovel ? buscar('imoveis', Number(rota.q.imovel)) : null;
  const url = (q) => `#/banco?${new URLSearchParams({ conta, mes, ...(filtro !== 'todas' ? { filtro } : {}), ...(imovelFiltro ? { imovel: imovelFiltro.id } : {}), ...q })}`;
  const doMes = movs().filter((m) => m.conta_id === conta && (imovelFiltro ? m.imovel_id === imovelFiltro.id : String(m.data).slice(0, 7) === mes))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);
  const filtradas = doMes.filter((m) => (filtro === 'sem_destino' ? !m.classificacao : filtro === 'sem_comprovante' ? precisaComprovante(m) && !comComprovante(m) : true));
  const soma = (tipo) => doMes.filter((m) => m.tipo === tipo).reduce((t, m) => t + m.valor, 0);
  const semDestino = doMes.filter((m) => !m.classificacao).length;
  const semComprovante = doMes.filter((m) => precisaComprovante(m) && !comComprovante(m)).length;
  const saldo = estado.saldos[conta];
  const e = emitenteDaConta(conta);
  const importadoAte = (config().ultima_importacao || {})[conta] || null;
  const filtroLink = (k, t) => `<a class="botao ${filtro === k ? '' : 'secundario'} pequeno" href="${url({ filtro: k })}">${t}</a>`;
  return `<div class="cabecalho"><h1>Banco</h1><div class="acoes">${link('#/banco/pagamentos', 'Pagamentos pelo banco', 'botao secundario')}</div></div>
    ${bancoAtivo() ? '' : avisoNaoConfigurado()}
    <div class="abas">${contasVistas.map((id) => `<a href="${url({ conta: id })}" class="${id === conta ? 'ativo' : ''}">${esc(nomeConta(id))} · conta no C6</a>`).join('')}</div>
    <div class="cabecalho"><h2>${imovelFiltro ? `Movimentações de ${esc(imovelFiltro.nome)}` : `Extrato de ${compBr(mes)}`}</h2>
      <div class="acoes">${imovelFiltro ? link(`#/banco?conta=${conta}&mes=${mes}`, 'Ver por mês', 'botao secundario')
    : `${link(url({ mes: C.somarMeses(mes, -1) }), `← ${compBr(C.somarMeses(mes, -1))}`, 'botao secundario')}
      <form data-form="ir" data-ir="banco" class="acoes"><input type="hidden" name="conta" value="${esc(conta)}"><input type="month" name="mes" value="${mes}" style="width:160px"><button class="secundario">Ir</button></form>
      ${link(url({ mes: C.somarMeses(mes, 1) }), `${compBr(C.somarMeses(mes, 1))} →`, 'botao secundario')}`}</div></div>
    <div class="acoes" style="margin-bottom:12px">${opera() ? botaoPonte('buscarExtrato', `Buscar extrato de ${compBr(mes)} no banco`, { conta, mes }, 'botao') : ''} ${botaoPonte('saldoBanco', 'Ver saldo', { conta })}
      ${opera() && contaDe(conta) ? `<label class="botao secundario pequeno enviar" title="Enquanto a ponte não tem as chaves do C6: no app do C6, exporte o extrato em OFX e escolha o arquivo aqui">📄 Importar arquivo OFX do app do C6<input type="file" accept=".ofx,application/x-ofx,text/plain" data-acao-arquivo="importarOfx" data-conta="${esc(conta)}" hidden></label>` : ''}
      ${saldo ? `<span>Saldo em ${esc(nomeConta(conta))}: <b>${reais(saldo.valor)}</b> <span class="suave">(${esc(saldo.quando)})</span></span>` : ''}
      ${importadoAte ? `<span class="suave">extrato importado até ${dataBr(importadoAte)}</span>` : ''}</div>
    <div class="numeros">
      <div class="cartao"><div class="grande mov-entrada">${reais(soma('entrada'))}</div>entradas</div>
      <div class="cartao"><div class="grande mov-saida">${reais(soma('saida'))}</div>saídas</div>
      <div class="cartao"><div class="grande ${semDestino ? 'texto-aviso' : ''}">${semDestino}</div>sem destino</div>
      <div class="cartao"><div class="grande ${semComprovante ? 'texto-aviso' : ''}">${semComprovante}</div>sem comprovante</div></div>
    <div class="acoes" style="margin-bottom:8px">${filtroLink('todas', `Todas (${doMes.length})`)} ${filtroLink('sem_destino', `Só sem destino (${semDestino})`)} ${filtroLink('sem_comprovante', `Só sem comprovante (${semComprovante})`)}
      ${opera() && !imovelFiltro ? botaoPonte('gerarComprovantesMes', `Gerar comprovantes de ${compBr(mes)} que ainda não têm${semComprovante ? ` (${semComprovante})` : ''}`, { conta, mes }) : ''}
      ${e && !imovelFiltro ? link(url({ ir: 'pasta-contador' }), 'Abrir pasta do contador deste mês') : ''}</div>
    <div class="cartao rolagem" id="movimentacoes"><table class="cobrancas responsiva banco"><tr><th>Data</th><th>Movimentação</th><th class="n">Valor</th><th>Destino</th><th>Comprovante</th><th></th></tr>
      ${filtradas.map(linhaMovimentacao).join('') || `<tr><td colspan="6" class="suave">${doMes.length ? 'Nenhuma movimentação com este filtro.' : `Nenhuma movimentação importada em ${compBr(mes)}. Clique em "Buscar extrato".`}</td></tr>`}</table>
      <p class="suave">${AJUDA_BANCO}</p></div>
    ${imovelFiltro ? '' : caixaConferirBoletos(conta, mes)}
    ${imovelFiltro || !e ? '' : caixaPastaContador(e, mes)}`;
}

const AJUDA_BANCO = 'Busque o extrato uma vez por mês (ou quando quiser). Cada linha precisa de um destino: um imóvel e a conta dele (água, luz, gás, condomínio, IPTU), um boleto de aluguel recebido, um imposto, tarifa do banco ou transferência entre as nossas contas. O comprovante é guardado em PDF com um nome padrão (data, empresa, imóvel, conta e valor) na pasta do imóvel (Contas pagas/ano) e numa cópia para o contador (_Contador/Empresa/AAAA-MM).';

/** Pasta do contador do mês: os PDFs de "_Contador/<Empresa>/<AAAA-MM>" (abre pelo link "Abrir pasta do contador deste mês"). */
function caixaPastaContador(e, mes) {
  return `<details class="cartao" id="pasta-contador"><summary><b>Pasta do contador de ${compBr(mes)}</b> <span class="suave">· ${esc(pastaContador())} › ${esc(e.nome)} › ${mes} · clique para expandir</span></summary>
    <p class="acoes">${botao('zipContador', `Baixar ZIP de ${compBr(mes)} para o contador`, { emitente: e.id, mes }, 'botao')}<span class="suave">NFs do mês em Excel, planilha das entradas e saídas com o destino de cada uma e os comprovantes desta pasta.</span></p>
    ${caixaArquivos('contador', R.idContador(e.id, mes), 'Comprovantes do mês para o contador', 'arquivos-contador', `Cópias dos comprovantes guardados pela tela Banco. ${E.nuvem ? 'Na nuvem, abra cada arquivo daqui para baixar; para mandar o mês inteiro ao contador, baixe o ZIP com todos os dados (Dados e backup): a pasta do contador vem dentro de "arquivos".' : 'O contador pode receber esta pasta inteira (está dentro de "arquivos", na pasta dos dados).'}`, true, false)}</details>`;
}

function descreverSugestao(s) {
  const i = s.imovel_id ? buscar('imoveis', s.imovel_id) : null;
  const cb = s.cobranca_id ? buscar('cobrancas', s.cobranca_id) : null;
  const c = cb ? buscar('contratos', cb.contrato_id) : null;
  return [ROTULO_CURTO[s.classificacao] || rotuloDe(Z.CLASSIFICACOES, s.classificacao), s.tipo_despesa || '', i ? i.nome : '', cb ? `boleto ${compBr(cb.competencia)}${c ? ` de ${c.inquilino_nome}` : ''}` : '',
    s.classificacao === 'boleto' && !cb && s.candidatos ? `${s.candidatos.length} boletos com este valor` : ''].filter(Boolean).join(' · ');
}

function destinoHtml(m, sugestao) {
  if (!m.classificacao) {
    return `${etiqueta('sem destino', 'aviso')}${sugestao && sugestao.classificacao ? `<br><span class="banco-sugestao">parece: ${esc(descreverSugestao(sugestao))}</span>${opera() ? ` ${botao('usarSugestao', 'Usar sugestão', { id: m.id })}` : ''}` : ''}`;
  }
  const partes = [etiqueta(ROTULO_CURTO[m.classificacao] || rotuloDe(Z.CLASSIFICACOES, m.classificacao), m.classificacao === 'ignorar' ? 'neutra' : 'destino')];
  const i = m.imovel_id ? buscar('imoveis', m.imovel_id) : null;
  if (i) partes.push(`<a href="#/imovel/${i.id}">${esc(i.nome)}</a>`);
  const desp = m.despesa_id ? buscar('despesas', m.despesa_id) : null;
  if (desp) partes.push(`<a href="#/contas/${desp.imovel_id}?comp=${desp.competencia}">${esc(desp.tipo)} de ${compBr(desp.competencia)}</a>`);
  const cb = m.cobranca_id ? buscar('cobrancas', m.cobranca_id) : null;
  if (cb) { const c = buscar('contratos', cb.contrato_id); partes.push(`<a href="#/cobranca/${cb.id}">boleto ${compBr(cb.competencia)}${c ? ` · ${esc(c.inquilino_nome)}` : ''}</a> ${cb.data_pagamento ? etiqueta('pago', 'ok') : etiqueta('boleto em aberto', 'aviso')}`); }
  const p = m.iptu_id ? buscar('iptus', m.iptu_id) : null;
  if (p) { const pc = R.parcelasIptu(d(), p).find((x) => x.n === Number(m.iptu_parcela)); partes.push(`<a href="#/imovel/${p.imovel_id}?ir=iptu">IPTU ${p.ano}${pc ? ` · ${esc(pc.rotulo)}${pc.n ? ' parcela' : ''}` : ''}</a>`); }
  const g = m.guia_imposto_id ? buscar('guias_impostos', m.guia_imposto_id) : null;
  if (g) partes.push(`<a href="#/impostos?mes=${esc(String(g.periodo).slice(0, 7))}">${esc(g.imposto)} ${esc(g.periodo)}</a>`);
  const par = m.par_movimentacao_id ? movs().find((x) => x.id === m.par_movimentacao_id) : null;
  if (par) partes.push(`<a href="#/banco?conta=${esc(par.conta_id)}&mes=${String(par.data).slice(0, 7)}">↔ ${esc(nomeConta(par.conta_id))} ${dataBr(par.data)}</a>`);
  if (m.classificacao === 'airbnb') {
    const gs = (d().ganhos_airbnb || []).filter((g) => g.movimentacao_id === m.id);
    for (const g of gs) { const gi = buscar('imoveis', g.imovel_id); partes.push(`<a href="#/resultados?airbnb=${g.imovel_id}">${esc(gi ? gi.nome : '?')} ${reais(g.valor)}</a> <span class="suave">(${compBr(g.competencia)})</span>`); }
  }
  const rf = m.reforma_id ? buscar('reformas', m.reforma_id) : null;
  if (rf) partes.push(`<a href="#/imovel/${rf.imovel_id}?ir=reformas">reforma: ${esc(rf.descricao)}</a>`);
  if (m.pagamento_banco_id) partes.push(etiqueta('pago pelo sistema', 'info'));
  if (m.observacoes) partes.push(`<span class="suave">${esc(m.observacoes)}</span>`);
  return partes.join('<br>');
}

// --------------------------------------------------------------------------
// Comprovantes (movimentações do extrato e pagamentos pelo banco)
// --------------------------------------------------------------------------
/**
 * O registro irmão: a movimentação do extrato que confirmou o pagamento pelo banco (ou o pagamento confirmado por ela) e a outra ponta
 * da transferência. É o mesmo dinheiro, então os dois dividem UM comprovante só, nas mesmas pastas (a do contador é a do mês do dinheiro).
 */
const irmaoDe = (db, x, tabela) => Z.irmaoDoComprovante(db, x, tabela);

/** Onde está o comprovante: na pasta do imóvel (Contas pagas/ano ou IPTU (guias)/ano) ou, sem imóvel, só na do contador. Sem o seu, vale o do irmão. */
function ondeEstaComprovante(x, tabela = 'movimentacoes_banco', semIrmao = false) {
  const p = Z.escopoDoComprovante(d(), x);
  if (p && x.comprovante) return { ...p, nome: x.comprovante, origem: x.comprovante_origem };
  const c = Z.escopoContador(d(), x);
  if (c && x.comprovante_contador) return { ...c, nome: x.comprovante_contador, origem: x.comprovante_origem };
  const irmao = semIrmao ? null : irmaoDe(d(), x, tabela);
  return irmao && temComprovante(irmao.x) ? ondeEstaComprovante(irmao.x, irmao.tabela, true) : null;
}
const comComprovante = (x, tabela = 'movimentacoes_banco') => temComprovante(x) || !!ondeEstaComprovante(x, tabela);

/** Texto da pasta de um escopo/id: "Loja 1 › Contas pagas › 2026" ou "_Contador › ANK › 2026-11". */
function descreverPasta(p) {
  if (!p) return '';
  if (p.escopo === 'contador') { const { emitenteId, comp } = R.decodificarIdContador(p.id); const e = buscar('emitentes', emitenteId); return `${pastaContador()} › ${e ? e.nome : '?'} › ${comp}`; }
  const i = buscar('imoveis', Math.floor(Number(p.id) / 10000));
  return `${i ? i.nome : '?'} › ${p.escopo === 'iptuano' ? 'IPTU (guias)' : 'Contas pagas'} › ${Number(p.id) % 10000}`;
}

/** A ponte gera o comprovante a partir do lançamento do extrato: a movimentação tem a referência; o pagamento, só se já foi confirmado pelo extrato. */
function lancamentoDaPonte(x, tabela) {
  if (tabela === 'pagamentos_banco') { const m = x.movimentacao_id ? movs().find((y) => y.id === x.movimentacao_id) : null; return m ? { conta: m.conta_id, referencia: m.id_externo, data: m.data } : null; }
  return x.id_externo ? { conta: x.conta_id, referencia: x.id_externo, data: x.data } : null;
}

function comprovanteHtml(x, tabela = 'movimentacoes_banco') {
  const onde = ondeEstaComprovante(x, tabela);
  if (onde) {
    return `✓ <a href="#" data-acao="abrirArquivo" data-escopo="${onde.escopo}" data-id="${onde.id}" data-nome="${esc(onde.nome)}" title="Abrir o PDF (${esc(descreverPasta(onde))})">${esc(onde.nome)}</a>${onde.origem === 'manual' ? ' <span class="suave">(PDF do banco, anexado do PC)</span>' : onde.origem === 'ponte' ? ' <span class="suave">(gerado pela ponte)</span>' : ''}
      ${opera() ? `<br>${botao('trocarComprovante', 'Trocar pelo PDF oficial do banco', { id: x.id, tabela }, 'secundario mini')}` : ''}`;
  }
  if (temComprovante(x)) return `✓ ${esc(x.comprovante || x.comprovante_contador)}`;
  if (tabela === 'pagamentos_banco') return x.situacao === 'pago' ? (opera() ? botao('nomearComprovante', 'Nomear e guardar', { id: x.id, tabela }) : etiqueta('sem comprovante', 'aviso')) : '<span class="suave">—</span>';
  if (!x.classificacao) return '<span class="suave">dê o destino antes</span>';
  if (!precisaComprovante(x)) return '<span class="suave">—</span>';
  return opera() ? botao('nomearComprovante', 'Nomear e guardar', { id: x.id, tabela }) : etiqueta('sem comprovante', 'aviso');
}

/**
 * Guarda o PDF nas pastas (imóvel e/ou contador) e registra no lançamento. Devolve { comprovante, contador, pastas } (nomes gravados).
 * O nome vem sem acento e sem ".pdf" (a extensão é posta aqui); nome já existente na pasta ganha " (2)".
 */
async function guardarComprovante(x, tabela, nomeBase, blob, origem, { avisar = true } = {}) {
  const base = S.limparNome(semAcento(nomeBase).replace(/\.pdf$/i, '').trim());
  if (!base || base === 'sem nome') throw new Error('Dê um nome ao comprovante.');
  const arquivo = () => new File([blob], `${base}.pdf`, { type: 'application/pdf' });
  const p = Z.escopoDoComprovante(d(), x);
  const c = config().copiar_para_contador !== false ? Z.escopoContador(d(), x) : null;
  if (!p && !c) throw new Error('Não há pasta para guardar: a movimentação não tem imóvel e a conta não está ligada a uma empresa (Dados e backup → Banco).');
  const comprovante = p ? await S.salvarArquivo(await pastaDoEscopo(p.escopo, p.id), arquivo()) : null;
  const contador = c ? await S.salvarArquivo(await pastaDoEscopo(c.escopo, c.id), arquivo()) : null;
  // registrarComprovante copia o nome para a conta lançada e para o irmão (pagamento ↔ movimentação; as duas pontas da transferência)
  await alterar((db) => Z.registrarComprovante(db, x.id, { nome_arquivo: base, comprovante, comprovante_contador: contador, origem }, login(), tabela));
  const pastas = [p ? descreverPasta(p) : '', c ? descreverPasta(c) : ''].filter(Boolean);
  if (avisar) aviso(`Comprovante guardado em ${pastas.join(' e em ')}.`);
  return { comprovante, contador, pastas };
}

/** Janela "Nomear e guardar": nome do arquivo, pastas de destino e a origem do PDF (gerado pela ponte ou anexado do PC). */
async function janelaComprovante(x, tabela, { soManual = false, nomeFixo = null } = {}) {
  const p = Z.escopoDoComprovante(d(), x);
  const c = config().copiar_para_contador !== false ? Z.escopoContador(d(), x) : null;
  const pastas = [p, c].filter(Boolean).map(descreverPasta);
  const lanc = lancamentoDaPonte(x, tabela);
  const pontePossivel = !soManual && !!lanc;
  const ponteMarcada = pontePossivel && bancoAtivo();
  let arquivoEl = null;
  const html = `<p>${esc(x.titulo || x.descricao || x.tipo_conta || '')} · ${dataBr(x.data || x.pago_em || x.data_pagamento)} · <b>${x.tipo ? valorHtml(x) : reais(x.valor)}</b></p>
    <p><label>Nome do arquivo</label><input name="nome" value="${esc(nomeFixo || x.nome_arquivo || Z.nomePadraoComprovante(d(), x).replace(/\.pdf$/i, ''))}" style="width:100%" ${nomeFixo ? 'readonly' : ''}><span class="suave">Sem acento; o ".pdf" é colocado sozinho.${nomeFixo ? ' O arquivo novo fica com o mesmo nome; o anterior é apagado.' : ''}</span></p>
    <p>Vai para: ${pastas.length ? pastas.map((t) => `<b>${esc(t)}</b>`).join(' e ') : '<span class="texto-aviso">nenhuma pasta (dê um imóvel à movimentação ou ligue a conta a uma empresa)</span>'}</p>
    ${soManual ? '<input type="hidden" name="origem" value="manual">' : `<p><label><input type="radio" name="origem" value="ponte" ${ponteMarcada ? 'checked' : `disabled title="${pontePossivel ? TITULO_AGUARDANDO : 'Só para lançamentos do extrato'}"`}> Gerar o PDF pelo banco (ponte)</label>
      <label><input type="radio" name="origem" value="manual" ${ponteMarcada ? '' : 'checked'}> Anexar um PDF do computador</label></p>`}
    <p data-campo="arquivo" ${ponteMarcada ? 'hidden' : ''}><input type="file" name="arquivo" accept="application/pdf,.pdf"></p>`;
  const r = await janela({ titulo: nomeFixo ? 'Trocar o comprovante pelo PDF oficial do banco' : 'Nomear e guardar o comprovante', html, sim: 'Guardar', ligar(dlg) {
    arquivoEl = dlg.querySelector('[name="arquivo"]');
    const campo = dlg.querySelector('[data-campo="arquivo"]');
    dlg.querySelectorAll('[name="origem"]').forEach((el) => el.addEventListener('change', () => { campo.hidden = dlg.querySelector('[name="origem"]:checked').value !== 'manual'; }));
  } });
  if (!r) return null;
  const origem = (r.origem || ['manual'])[0];
  const nome = (r.nome || [''])[0];
  const arquivo = arquivoEl && arquivoEl.files && arquivoEl.files[0];
  return { origem, nome, arquivo, lanc };
}

/** O PDF escolhido na janela (ponte ou PC) como Blob. */
async function pdfDaJanela(r) {
  if (r.origem === 'ponte') {
    if (!bancoAtivo()) throw new Error(TITULO_AGUARDANDO);
    try {
      return await P.baixarComprovantePonte(r.lanc.conta, r.lanc.referencia, r.lanc.data);
    } catch (e) {
      throw new Error(`Não consegui gerar o comprovante pelo banco agora (${e.message}). Você pode anexar o PDF do computador: clique de novo em "Nomear e guardar" e escolha "Anexar um PDF".`);
    }
  }
  if (!r.arquivo || !r.arquivo.size) throw new Error('Escolha o arquivo PDF do comprovante.');
  if (!/\.pdf$/i.test(r.arquivo.name) && r.arquivo.type !== 'application/pdf') throw new Error('O comprovante precisa ser um PDF.');
  return r.arquivo;
}

// --------------------------------------------------------------------------
// Linhas da tabela e caixa de conferência dos boletos
// --------------------------------------------------------------------------
function linhaMovimentacao(m) {
  const sugestao = sugestaoDe(m);
  const cb = !m.classificacao && sugestao && sugestao.cobranca_id ? buscar('cobrancas', sugestao.cobranca_id) : null;
  const acoes = [];
  if (opera()) {
    if (!m.classificacao) acoes.push(botao('darDestino', 'Dar destino', { id: m.id }));
    else if (m.classificacao === 'boleto') acoes.push(`<span class="suave" title="O destino desta entrada é o pagamento de um boleto: para desfazer, use 'Desfazer pagamento' na página do boleto">desfaz-se pelo boleto</span>`);
    else acoes.push(botao('desvincularMov', 'Desfazer destino', { id: m.id }, 'secundario pequeno', `Desfazer o destino desta movimentação?${comComprovante(m) ? ' O comprovante guardado é apagado.' : ''}`));
    if (m.tipo === 'entrada' && cb && !cb.data_pagamento) acoes.push(botao('confirmarBoletoPeloBanco', `É o pagamento do boleto ${compBr(cb.competencia)}`, { id: m.id, cobranca: cb.id }, 'botao pequeno'));
  }
  return `<tr class="${m.classificacao === 'ignorar' ? 'mov-ignorada' : ''}"><td class="nw">${dataBr(m.data)}</td>
    <td><b>${esc(m.titulo || m.descricao || '(sem descrição)')}</b>${m.titulo && m.descricao ? `<br><span class="suave">${esc(m.descricao)}</span>` : ''}${m.categoria_banco ? `<br>${etiqueta(m.categoria_banco, 'neutra')}` : ''}</td>
    <td class="n nw">${valorHtml(m)}</td><td>${destinoHtml(m, sugestao)}</td><td>${comprovanteHtml(m)}</td><td class="n nw">${acoes.join(' ')}</td></tr>`;
}

/** Caixa "Conferir boletos pagos no banco": o C6 lista os boletos que recebeu; o sistema casa com os em aberto e dá baixa só nos marcados. */
function caixaConferirBoletos(conta, mes) {
  const conf = estado.conferencia && estado.conferencia.conta === conta && estado.conferencia.mes === mes ? estado.conferencia : null;
  const linha = (s, n) => {
    const cb = buscar('cobrancas', s.cobranca_id);
    const c = cb ? buscar('contratos', cb.contrato_id) : null;
    const i = c ? buscar('imoveis', c.imovel_id) : null;
    if (!cb) return '';
    return `<tr><td class="centro"><input type="checkbox" name="pag" value="${n}" ${cb.data_pagamento ? 'disabled' : 'checked'}></td>
      <td><a href="#/cobranca/${cb.id}"><b>${esc(i ? i.nome : '')}</b> · ${esc(c ? c.inquilino_nome : '')}</a><br><span class="suave">boleto ${compBr(cb.competencia)} · vence ${dataBr(cb.vencimento)}${s.certeza === 'provavel' ? ' · casado só pelo valor e pela data: confira' : ''}</span></td>
      <td class="nw">${dataBr(s.data_credito)}${s.data_pagamento && s.data_pagamento !== s.data_credito ? `<br><span class="suave">pagou ${dataBr(s.data_pagamento)}</span>` : ''}</td><td class="n">${reais(s.valor)}${s.previsto !== s.valor ? `<br><span class="texto-aviso">previsto ${reais(s.previsto)}</span>` : ''}</td>
      <td>${cb.data_pagamento ? etiqueta('já estava pago', 'neutra') : s.previsto === s.valor ? etiqueta('bate certinho', 'ok') : etiqueta('valor diferente', 'aviso')}</td></tr>`;
  };
  return `<div class="cartao" id="conferir-boletos" data-caixa="conferir-boletos"><h2>Conferir boletos pagos no banco</h2>
    <p class="suave">O banco informa quais boletos nossos foram pagos em ${compBr(mes)}. O sistema mostra os que ainda estão em aberto aqui; você marca e confirma, e cada um fica "Pago" com a data em que o dinheiro entrou. Valor diferente do previsto: confirme pela linha do extrato ("É o pagamento do boleto…"), que pede a justificativa e o valor da NF.</p>
    ${opera() ? `<p class="acoes">${botaoPonte('conferirBoletosBanco', `Buscar boletos pagos em ${compBr(mes)}`, { conta, mes })}</p>` : ''}
    ${conf ? (conf.sugestoes.length ? `<form data-form="registrarPagamentosBanco"><input type="hidden" name="conta" value="${esc(conta)}"><input type="hidden" name="mes" value="${mes}">
      <div class="rolagem"><table class="responsiva"><tr><th></th><th>Boleto</th><th>Crédito em</th><th class="n">Valor recebido</th><th>Conferência</th></tr>${conf.sugestoes.map(linha).join('')}</table></div>
      ${opera() ? '<div class="acoes"><button>Registrar os pagamentos marcados</button></div>' : ''}</form>`
    : `<p class="suave">Nenhum boleto pago no banco em ${compBr(mes)} corresponde a um boleto em aberto aqui (${conf.recebidos} informado(s) pelo banco).</p>`) : ''}</div>`;
}

// --------------------------------------------------------------------------
// Tela #/banco/pagamentos
// --------------------------------------------------------------------------
const AVISO_APROVACAO = '<div class="alerta info"><b>O pagamento só acontece depois que você aprovar no aplicativo do C6.</b> Aqui o sistema prepara o pagamento, o banco confere o código, e o administrador aprova e envia numa confirmação só (digitando o valor total); o dinheiro só sai quando alguém autorizado aprova no app. A confirmação final aparece no extrato.</div>';
const CODIGO_PAG = (p) => p.content || p.codigo_barras || p.pix_copia_cola || p.chave_pix || '';
const PENDENTES = ['rascunho', 'aguardando_aprovacao', 'erro'];
/** Texto da confirmação de "Cancelar"/"Descartar": com lote no banco, os códigos já foram lidos lá (nada foi pago). */
const CONFIRMA_CANCELAR = (comLote, plural = false) => (comLote ? `Cancelar ${plural ? 'estes pagamentos' : 'este pagamento'}? O banco só leu o${plural ? 's códigos' : ' código'}; nada foi pago. ${plural ? 'Os itens saem' : 'O item sai'} do lote lido pelo banco.`
  : `Cancelar ${plural ? 'estes pagamentos' : 'este pagamento'}? Nada foi enviado ao banco.`);

function linhaPagamento(p) {
  const i = p.imovel_id ? buscar('imoveis', p.imovel_id) : null;
  const m = p.movimentacao_id ? movs().find((x) => x.id === p.movimentacao_id) : null;
  const acoes = [];
  if (opera()) {
    // a aprovação do administrador acontece junto com o envio ("Aprovar e enviar"); antes disso o banco precisa ter lido o código
    if (PENDENTES.includes(p.situacao) && !p.grupo_id) acoes.push(botaoPonte('lerNoBanco', 'Mandar o banco ler o código', { ids: p.id }, 'botao pequeno'));
    if (['rascunho', 'aguardando_aprovacao'].includes(p.situacao) && p.grupo_id && podeUsuario('admin')) acoes.push(botaoPonte('enviarGrupoAprovacao', 'Aprovar e enviar', { conta: p.conta_id, grupo: p.grupo_id }, 'botao pequeno'));
    if (p.situacao === 'agendado' && p.grupo_id) acoes.push(botaoPonte('atualizarSituacaoPagamento', 'Atualizar situação', { conta: p.conta_id, grupo: p.grupo_id }));
    if (p.situacao === 'agendado') acoes.push(botao('confirmarPagamentoPeloExtrato', 'Confirmar pelo extrato', { id: p.id }, 'botao pequeno'));
    if (p.situacao === 'agendado' && podeUsuario('admin')) acoes.push(botao('canceladoNoBanco', 'Foi cancelado no C6', { id: p.id }, 'secundario pequeno'));
    if (PENDENTES.includes(p.situacao)) acoes.push(botao('cancelarPagamentoBanco', 'Cancelar', { id: p.id }, 'secundario pequeno', CONFIRMA_CANCELAR(!!p.grupo_id)));
  }
  const codigo = CODIGO_PAG(p);
  return `<tr><td>${i ? `<a href="#/contas/${i.id}?comp=${esc(p.competencia || '')}"><b>${esc(i.nome)}</b></a><br>` : ''}${esc(p.tipo_conta || '')}${p.competencia ? ` de ${compBr(p.competencia)}` : ''}${p.descricao ? `<br><span class="suave">${esc(p.descricao)}</span>` : ''}</td>
    <td>${esc(nomeConta(p.conta_id))}</td><td class="n nw"><b>${reais(p.valor)}</b></td><td class="nw">${dataBr(p.data_pagamento)}</td>
    <td>${p.beneficiario && p.beneficiario.nome ? `${esc(p.beneficiario.nome)}<br>` : ''}${p.vencimento ? `<span class="suave">vence ${dataBr(p.vencimento)}</span><br>` : ''}<span class="codigo-barras suave">${esc(codigo.slice(0, 48))}${codigo.length > 48 ? '…' : ''}</span></td>
    <td>${etiquetaSituacao(p)}${p.erro ? `<br><span class="texto-aviso">${esc(p.erro)}</span>` : ''}${p.aprovado_por ? `<br><span class="suave">aprovado por ${esc(p.aprovado_por)}</span>` : ''}${p.pago_em ? `<br><span class="suave">pago em ${dataBr(p.pago_em)}</span>` : ''}${m ? `<br><span class="suave">extrato: ${dataBr(m.data)} · ${esc(m.descricao)}</span>` : ''}</td>
    <td>${comprovanteHtml(p, 'pagamentos_banco')}</td><td class="n nw">${acoes.join(' ')}</td></tr>`;
}

const etiquetaSituacao = (p) => etiqueta(rotuloDe(Z.SITUACOES_PAGAMENTO, p.situacao), { pago: 'ok', erro: 'perigo', cancelado: 'neutra', aguardando_aprovacao: 'aviso', agendado: 'info', rascunho: 'neutra' }[p.situacao] || 'neutra');
const CABECALHO_PAG = '<tr><th>Conta do imóvel</th><th>Paga por</th><th class="n">Valor</th><th>Pagar em</th><th>Beneficiário / código</th><th>Situação</th><th>Comprovante</th><th></th></tr>';

function telaPagamentosBanco() {
  const lista = [...pagamentos()].sort((a, b) => b.id - a.id);
  const grupos = Object.keys(Z.SITUACOES_PAGAMENTO).map((s) => [s, lista.filter((p) => p.situacao === s)]).filter(([, l]) => l.length);
  return `<p class="suave"><a href="#/banco">← Banco</a></p><h1>Pagamentos pelo banco</h1>${AVISO_APROVACAO}
    ${bancoAtivo() ? '' : avisoNaoConfigurado()}${config().permitir_pagamentos ? '' : avisoPagamentosDesligados()}
    <p class="suave">Para preparar um pagamento, abra as contas do imóvel (página do imóvel → "Contas pagas por nós") e use a caixa "Pagar pelo banco". O administrador aprova e envia ao banco; depois de aprovado no app do C6, busque o extrato do mês e clique em "Confirmar pelo extrato".</p>
    ${grupos.map(([s, l]) => `<div class="cartao rolagem" id="pagamentos-${s}"><h2>${esc(rotuloDe(Z.SITUACOES_PAGAMENTO, s))} <span class="suave">(${l.length})</span></h2>
      <table class="cobrancas responsiva">${CABECALHO_PAG}${l.map(linhaPagamento).join('')}</table></div>`).join('')
    || '<div class="cartao"><p class="suave">Nenhum pagamento preparado ainda.</p></div>'}`;
}

// --------------------------------------------------------------------------
// Caixa "Pagar pelo banco" (tela de contas do imóvel) e caixa "Banco" (página do imóvel)
// --------------------------------------------------------------------------
/**
 * Lê o que foi digitado no campo do código, sem ir ao banco. Só dígitos (com espaços, pontos e traços): boleto com 44, 47 ou 48
 * dígitos; CPF (11) ou CNPJ (14) é chave Pix; qualquer outro tamanho é erro ("Código de barras com 20 dígitos: esperava 44, 47 ou 48").
 * Telefone +55 é chave Pix; texto que começa por 000201 é Pix copia e cola; o resto é chave Pix (e-mail ou aleatória).
 * Devolve { forma, codigo_barras | pix_copia_cola | chave_pix, dica } ou { erro } ou { vazio }.
 */
export function lerCodigoPagamento(texto) {
  const t = String(texto || '').trim();
  if (!t) return { vazio: true };
  const dig = t.replace(/\D/g, '');
  if (/^[\d .-]+$/.test(t)) {
    if ([44, 47, 48].includes(dig.length)) return { forma: 'boleto', codigo_barras: dig, dica: `${dig.length} dígitos ✓` };
    if ([11, 14].includes(dig.length)) return { forma: 'pix', chave_pix: dig, dica: `chave Pix (${dig.length === 11 ? 'CPF' : 'CNPJ'}) ✓` };
    return { erro: `Código de barras com ${dig.length} dígitos: esperava 44, 47 ou 48.` };
  }
  const tel = t.replace(/[ ()-]/g, '');
  if (/^\+55\d{10,11}$/.test(tel)) return { forma: 'pix', chave_pix: tel, dica: 'chave Pix (telefone) ✓' };
  if (/^000201/.test(t)) return { forma: 'pix', pix_copia_cola: t, dica: 'Pix copia e cola ✓' };
  return { forma: 'pix', chave_pix: t, dica: 'chave Pix ✓' };
}

/** Dica ao lado do campo do código enquanto digita: "47 dígitos ✓" ou o erro (sem esperar o botão). */
if (typeof document !== 'undefined') {
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLInputElement) || !el.classList.contains('codigo-barras')) return;
    const dica = el.parentElement && el.parentElement.querySelector('[data-dica-codigo]');
    if (!dica) return;
    const r = lerCodigoPagamento(el.value);
    dica.textContent = r.vazio ? '' : r.erro || r.dica;
    dica.classList.toggle('texto-aviso', !!r.erro);
    dica.classList.toggle('texto-ok', !r.erro && !r.vazio);
  });
}
export function caixaPagarPeloBanco(i, comp) {
  const permitidas = R.contasPermitidas(d(), i.id, comp);
  const hoje = C.hojeIso();
  const lista = contas();
  const sugerida = Z.contaSugeridaDoImovel(d(), i.id);
  const doImovel = pagamentos().filter((p) => p.imovel_id === i.id).sort((a, b) => b.id - a.id);
  const pendentes = doImovel.filter((p) => PENDENTES.includes(p.situacao));
  const lotes = [...new Set(pendentes.map((p) => p.grupo_id || ''))].map((g) => [g, pendentes.filter((p) => (p.grupo_id || '') === g)]);
  const outros = doImovel.filter((p) => !PENDENTES.includes(p.situacao)).slice(0, 10);
  const linha = (tipo, n) => `<tr><td><b>${esc(tipo)}</b><input type="hidden" name="tipo_${n}" value="${esc(tipo)}"></td>
    <td><input name="codigo_${n}" class="codigo-barras" placeholder="código de barras, linha digitável, Pix copia e cola ou chave Pix" autocomplete="off"><div class="suave dica-codigo" data-dica-codigo></div></td>
    <td><input name="valor_${n}" data-dinheiro inputmode="decimal" placeholder="0,00" style="width:120px"></td>
    <td><input type="date" name="data_${n}" value="${hoje}" min="${hoje}" style="width:auto"></td></tr>`;
  const itemLote = (p) => `<tr><td><b>${esc(p.tipo_conta)}</b> ${compBr(p.competencia)}</td><td>${esc((p.beneficiario && p.beneficiario.nome) || '-')}</td>
    <td class="nw">${p.vencimento ? dataBr(p.vencimento) : '-'}</td><td class="n">${reais(p.valor)}</td>
    <td>${p.situacao === 'erro' ? etiqueta(p.erro || 'erro no banco', 'perigo') : p.grupo_id ? etiqueta(p.situacao === 'aguardando_aprovacao' ? 'aprovado · validado pelo banco' : 'validado pelo banco', 'ok') : etiqueta('o banco ainda não leu', 'aviso')}</td></tr>`;
  const lote = ([g, l]) => `<h3>Pagamento preparado · ${esc(nomeConta(l[0].conta_id))}${g ? '' : ' <span class="suave">(sem leitura do banco)</span>'}</h3>
    <div class="rolagem"><table class="responsiva"><tr><th>Conta</th><th>Beneficiário</th><th>Vencimento</th><th class="n">Valor</th><th>Banco disse</th></tr>${l.map(itemLote).join('')}</table></div>
    <p class="acoes">${g ? (podeUsuario('admin') ? botaoPonte('enviarGrupoAprovacao', 'Aprovar e enviar para aprovação no app do C6', { conta: l[0].conta_id, grupo: g }, 'botao') : '<span class="suave">Só o administrador aprova e envia para o banco.</span>')
    : botaoPonte('lerNoBanco', 'Mandar o banco ler os códigos', { ids: l.map((p) => p.id).join(',') }, 'botao')}
      ${botao('descartarPagamentos', 'Descartar', { ids: l.map((p) => p.id).join(',') }, 'secundario pequeno', CONFIRMA_CANCELAR(!!g, l.length > 1))}</p>`;
  return `<div class="cartao" id="pagar-banco" data-caixa="pagar-banco"><h2>Pagar pelo banco (C6)</h2>${AVISO_APROVACAO}
    ${bancoAtivo() ? '' : avisoNaoConfigurado()}${config().permitir_pagamentos ? '' : avisoPagamentosDesligados()}
    ${!opera() || !config().permitir_pagamentos ? '' : `<form data-form="pagarPeloBanco"><input type="hidden" name="imovel" value="${i.id}"><input type="hidden" name="competencia" value="${comp}">
      <div class="acoes" style="margin-bottom:10px"><label style="margin:0">Conta que paga</label><select name="conta" style="width:auto">${lista.map((c) => `<option value="${esc(c.id)}" ${c.id === sugerida ? 'selected' : ''}>${esc(nomeConta(c.id))}</option>`).join('') || '<option value="">(nenhuma conta configurada)</option>'}</select>
        <span class="suave">Mês da conta: <b>${compBr(comp)}</b> (troque no formulário acima)</span></div>
      ${permitidas.tipos.length ? `<div class="rolagem"><table><tr><th>Conta</th><th>Código de barras ou Pix</th><th>Valor</th><th>Pagar em</th></tr>${R.TIPOS_DESPESA.filter((t) => permitidas.tipos.includes(t)).map((t) => linha(t, R.TIPOS_DESPESA.indexOf(t))).join('')}</table></div>
      <p class="suave">Preencha só as contas que quer pagar. "Preparar pagamento" guarda o pagamento como rascunho e manda os códigos ao banco, que confere o beneficiário e o vencimento e mostra aqui. Nada é pago nesta etapa.${config().limite_pagamento > 0 ? ` Limite por pagamento: ${reais(config().limite_pagamento)}.` : ''}</p>
      <div class="acoes">${bancoAtivo() ? '<button>Preparar pagamento</button>' : `<button disabled title="${TITULO_AGUARDANDO}">Preparar pagamento</button>`}</div>`
    : `<p class="suave">Em ${compBr(comp)} o inquilino paga todas as contas, conforme o contrato: não há conta nossa para pagar neste mês.</p>`}</form>`}
    ${lotes.map(lote).join('')}
    ${outros.length ? `<h3>Pagamentos deste imóvel</h3><div class="rolagem"><table class="cobrancas responsiva">${CABECALHO_PAG}${outros.map(linhaPagamento).join('')}</table></div>` : ''}
    <p class="suave">${link('#/banco/pagamentos', 'Ver todos os pagamentos pelo banco')}</p></div>`;
}

export function caixaBancoImovel(i) {
  const ano = Number(C.hojeIso().slice(0, 4));
  const todas = movs().filter((m) => m.imovel_id === i.id).sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);
  const doAno = todas.filter((m) => String(m.data).slice(0, 4) === String(ano));
  const soma = (tipo) => doAno.filter((m) => m.tipo === tipo).reduce((t, m) => t + m.valor, 0);
  const meus = pagamentos().filter((p) => p.imovel_id === i.id && !['pago', 'cancelado'].includes(p.situacao));
  return `<div class="cartao" id="banco" data-caixa="banco"><div class="cabecalho"><h2>Banco: movimentações e comprovantes</h2>${link(`#/banco?imovel=${i.id}`, 'Ver no Banco')}</div>
    <p class="suave">Entradas e saídas do extrato ligadas a este imóvel em ${ano}: ${doAno.length ? `<b class="mov-entrada">+ ${reais(soma('entrada'))}</b> · <b class="mov-saida">− ${reais(soma('saida'))}</b>` : 'nenhuma ainda'}.
      ${todas.length > doAno.length ? `Outros anos: ${todas.length - doAno.length} movimentação(ões), veja no Banco.` : ''}</p>
    ${doAno.length ? `<div class="rolagem"><table class="responsiva"><tr><th>Data</th><th>Conta</th><th>O que é</th><th class="n">Valor</th><th>Comprovante</th></tr>
      ${doAno.slice(0, 50).map((m) => `<tr><td class="nw">${dataBr(m.data)}</td><td>${esc(nomeConta(m.conta_id))}</td><td>${esc(m.titulo || m.descricao || '')}<br>${destinoHtml(m, null)}</td><td class="n nw">${valorHtml(m)}</td><td>${comprovanteHtml(m)}</td></tr>`).join('')}</table></div>` : ''}
    ${meus.length ? `<p>${meus.length} pagamento(s) pelo banco em andamento: ${meus.map((p) => `${esc(p.tipo_conta)} ${reais(p.valor)} ${etiquetaSituacao(p)}`).join(' · ')} ${link('#/banco/pagamentos', 'Ver')}</p>` : ''}
    ${caixaArquivos('contasano', R.idPastaAno(i.id, ano), `Comprovantes de ${ano}`, `comprovantes-${ano}`, 'PDFs dos comprovantes guardados pela tela Banco (pasta "Contas pagas/ano" do imóvel). Para anexar, use "Nomear e guardar" na linha da movimentação.', true, false)}</div>`;
}

// --------------------------------------------------------------------------
// Caixa de configuração (Dados e backup): extrato, comprovantes e pagamentos (só administrador)
// --------------------------------------------------------------------------
export function caixaConfigBanco2() {
  if (!podeUsuario('admin')) return '';
  const cfg = { ...R.CONFIG_BANCO_FASE2, ...config() };
  return `<div class="cartao" id="config-banco2"><h2>Banco: conciliação e pagamentos</h2>
    <p class="suave">Como o extrato do C6 é casado com os boletos, onde ficam os comprovantes e se o sistema pode preparar pagamentos (que só acontecem depois da aprovação no app do C6). As chaves da API e as contas ficam na caixa "Banco (C6)".</p>
    <form data-form="configBanco2" class="formulario">
      <div class="check largo"><label><input type="checkbox" name="permitir_pagamentos" value="1" ${cfg.permitir_pagamentos ? 'checked' : ''}> Permitir preparar pagamentos pelo banco (caixa "Pagar pelo banco" nas contas do imóvel)</label></div>
      <div><label>Limite por pagamento (R$)</label><input name="limite_pagamento" data-dinheiro inputmode="decimal" value="${cfg.limite_pagamento ? esc(reais(cfg.limite_pagamento, false)) : ''}" placeholder="sem limite"><div class="ajuda">Em branco ou 0,00 = sem limite. Ex.: 5.000,00 recusa um pagamento de R$ 5.000,01.</div></div>
      <div><label>Tolerância para casar o boleto (dias)</label><input type="number" name="tolerancia_dias" min="0" max="30" value="${Number(cfg.tolerancia_dias) || 0}"><div class="ajuda">Entrada com o valor em dia até tantos dias depois do vencimento ainda casa com o boleto (ex.: 3 → vence dia 10, entrou dia 13).</div></div>
      <div><label>Pasta do contador</label><input name="pasta_contador" value="${esc(cfg.pasta_contador)}"><div class="ajuda">Dentro de "arquivos": ${esc(cfg.pasta_contador)}/Empresa/AAAA-MM. Sem acento.</div></div>
      <div class="largo"><label>Modelo do nome do comprovante</label><input name="modelo_nome_comprovante" value="${esc(cfg.modelo_nome_comprovante)}"><div class="ajuda">Campos entre chaves: {data} {empresa} {imovel} {tipo} {valor} {mes} {contrapartida}. Ex.: "2026-11-05 ANK Loja 1 Agua 123,45.pdf".</div></div>
      <div class="check"><label><input type="checkbox" name="copiar_para_contador" value="1" ${cfg.copiar_para_contador !== false ? 'checked' : ''}> Guardar também uma cópia na pasta do contador</label></div>
      <div class="check"><button>Salvar</button></div></form></div>`;
}

// --------------------------------------------------------------------------
// Janelas: dar destino
// --------------------------------------------------------------------------
const opcoes = (lista, atual, vazio = '') => `${vazio ? `<option value="">${esc(vazio)}</option>` : ''}${lista.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(atual ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;

/** Contas do imóvel já lançadas que ainda não têm movimentação do extrato ligada (as de mesmo valor primeiro). */
const despesasSemExtrato = (imovelId, m) => R.despesasDo(d(), imovelId).filter((x) => x.valor > 0 && !x.movimentacao_id && !movs().some((y) => y.despesa_id === x.id))
  .sort((a, b) => (a.valor === m.valor ? -1 : b.valor === m.valor ? 1 : 0)).slice(0, 24);

/** Boletos em aberto (do imóvel, se escolhido); o de mesmo valor na data da movimentação vem primeiro. */
function boletosAbertos(imovelId, m) {
  const cs = d().contratos.filter((c) => !imovelId || c.imovel_id === imovelId).map((c) => c.id);
  return d().cobrancas.filter((cb) => cs.includes(cb.contrato_id) && R.aCobrar(cb))
    .map((cb) => ({ cb, previsto: R.previstoNoPagamento(cb, m.data).valor_devido }))
    .sort((a, b) => (a.previsto === m.valor ? -1 : b.previsto === m.valor ? 1 : 0) || String(b.cb.vencimento).localeCompare(String(a.cb.vencimento))).slice(0, 30);
}

/** Guias de imposto da empresa da conta ainda não pagas (as de mesmo valor primeiro). */
function guiasAbertas(m) {
  const e = emitenteDaConta(m.conta_id);
  return (d().guias_impostos || []).filter((g) => !g.paga_em && (!e || g.emitente_id === e.id))
    .sort((a, b) => (a.valor === m.valor ? -1 : b.valor === m.valor ? 1 : 0) || String(b.periodo).localeCompare(String(a.periodo))).slice(0, 30);
}

async function janelaDestino(m, inicialDe = null) {
  const s = inicialDe || sugestaoDe(m) || {};
  const imoveis = ordenar(d().imoveis, 'nome').map((i) => [i.id, i.nome]);
  const classes = Object.entries(Z.CLASSIFICACOES);
  const inicial = s.classificacao || (m.tipo === 'entrada' ? 'boleto' : 'conta_imovel');
  const compInicial = s.competencia || String(m.data).slice(0, 7);
  const parSugerido = s.par_movimentacao_id ? movs().find((x) => x.id === s.par_movimentacao_id) : Z.parDaTransferencia(d(), m);
  const html = `<p><b>${dataBr(m.data)}</b> · ${esc(m.titulo || '')} ${esc(m.descricao || '')} · <b>${valorHtml(m)}</b> <span class="suave">(${esc(nomeConta(m.conta_id))})</span></p>
    ${s.classificacao ? `<p class="suave">Sugestão: ${esc(descreverSugestao(s))}${s.motivo ? ` (${esc(s.motivo)})` : ''}.</p>` : ''}
    <p><label>O que é esta movimentação</label><select name="classificacao" style="width:100%">${opcoes(classes, inicial)}</select></p>
    <p data-campo="imovel"><label>Imóvel</label><select name="imovel" style="width:100%">${opcoes(imoveis, s.imovel_id, '— sem imóvel')}</select></p>
    <p data-campo="despesa"><label>Conta do imóvel já lançada</label><select name="despesa" style="width:100%"></select>
      <span class="suave">Se a conta ainda não foi lançada, deixe "— lançar agora": o sistema cria a conta com o valor e a data da movimentação.</span></p>
    <p data-campo="tipo_despesa"><label>Qual conta</label><select name="tipo_despesa" style="width:100%"></select>
      <label>Mês da conta</label><input type="month" name="competencia" value="${compInicial}" style="width:100%"></p>
    <div data-campo="airbnb"><p><label>Mês de referência do Airbnb</label><input type="month" name="competencia_air" value="${compInicial}" style="width:100%"></p>
      <p><label>Quanto é de cada imóvel vago</label></p><div data-air-lista></div>
      <p class="suave" data-air-soma></p></div>
    <p data-campo="reforma"><label>O que foi feito na reforma</label><input name="descricao_reforma" placeholder="ex.: piso da cozinha" style="width:100%"></p>
    <p data-campo="boleto"><label>Boleto do inquilino</label><select name="boleto" style="width:100%"></select>
      <span class="suave">O boleto fica "Pago" com a data em que o dinheiro entrou. Se o valor for diferente do previsto, o sistema pede a justificativa e o valor da NF na página do boleto.</span></p>
    <p data-campo="iptu"><label>IPTU (ano)</label><select name="iptu" style="width:100%"></select><label>Parcela</label><select name="iptu_parcela" style="width:100%"></select></p>
    <p data-campo="guia"><label>Guia de imposto (opcional)</label><select name="guia" style="width:100%">${opcoes(guiasAbertas(m).map((g) => [g.id, `${g.imposto} ${g.periodo} · ${reais(g.valor)}${g.valor === m.valor ? ' ★ mesmo valor' : ''}`]), (guiasAbertas(m).find((g) => g.valor === m.valor) || {}).id, '— sem guia')}</select></p>
    <p data-campo="par" class="suave">${parSugerido ? `A outra ponta: <b>${esc(nomeConta(parSugerido.conta_id))}</b> ${dataBr(parSugerido.data)} · ${esc(parSugerido.descricao || '')} (as duas ficam ligadas).` : 'Não achei a outra ponta no extrato da outra conta: busque o extrato dela e dê o destino lá; as duas ficam ligadas.'}</p>
    <p><label>Observações</label><textarea name="observacoes" rows="2" style="width:100%"></textarea></p>`;
  const r = await janela({ titulo: 'Dar destino à movimentação', html, sim: 'Salvar destino', ligar(dlg) {
    const sel = (n) => dlg.querySelector(`[name="${n}"]`);
    const campo = (n) => dlg.querySelector(`[data-campo="${n}"]`);
    const encherTipos = () => {
      const imovelId = Number(sel('imovel').value) || null;
      const comp = /^\d{4}-\d{2}$/.test(sel('competencia').value) ? sel('competencia').value : compInicial;
      // qualquer imóvel aceita conta nossa; a situação do mês só aparece como lembrete
      const tipos = [...R.TIPOS_DESPESA];
      const p = imovelId ? R.contasPermitidas(d(), imovelId, comp) : null;
      sel('tipo_despesa').innerHTML = opcoes(tipos.map((t) => [t, `${t}${p && p.motivo === 'inquilino' ? ' (pelo contrato, o inquilino paga)' : p && p.motivo === 'incluso' && !p.tipos.includes(t) ? ' (pelo contrato, o inquilino paga)' : ''}`]), tipos.includes(s.tipo_despesa) ? s.tipo_despesa : tipos[0]);
    };
    const somaAir = () => {
      const soma = [...dlg.querySelectorAll('[data-air]')].reduce((t, el) => t + (C.centavos(el.value || '0') || 0), 0);
      dlg.querySelector('[data-air-soma]').innerHTML = `Soma: <b>${reais(soma)}</b> de ${reais(m.valor)}${soma === m.valor ? ' ✓' : ` · falta ${reais(m.valor - soma)}`}`;
    };
    const encherAirbnb = () => {
      const comp = /^\d{4}-\d{2}$/.test(sel('competencia_air').value) ? sel('competencia_air').value : compInicial;
      const vagos = ordenar(d().imoveis, 'nome').filter((i) => R.contasPermitidas(d(), i.id, comp).motivo === 'vago');
      dlg.querySelector('[data-air-lista]').innerHTML = vagos.length
        ? vagos.map((i) => `<p style="display:flex;gap:8px;align-items:center;margin:4px 0"><span style="flex:1">${esc(i.nome)}</span><input name="air_${i.id}" data-air inputmode="decimal" placeholder="0,00" style="width:140px"></p>`).join('')
        : `<p class="suave">Nenhum imóvel vago em ${compBr(comp)}: ganho do Airbnb só em imóvel vago.</p>`;
      if (vagos.length === 1) dlg.querySelector('[data-air]').value = (m.valor / 100).toFixed(2).replace('.', ',');
      dlg.querySelectorAll('[data-air]').forEach((el) => el.addEventListener('input', somaAir));
      somaAir();
    };
    const encherParcelas = () => {
      const p = buscar('iptus', Number(sel('iptu').value));
      const pcs = p ? R.parcelasIptu(d(), p).filter((x) => x.proprietario) : [];
      sel('iptu_parcela').innerHTML = opcoes(pcs.map((x) => [x.n, `${x.rotulo}${x.n ? ' parcela' : ''} · ${reais(x.valorProprietario)}${x.vencimento ? ` · vence ${dataBr(x.vencimento)}` : ''}${x.paga ? ` · já paga em ${dataBr(x.paga)}` : ''}${x.valorProprietario === m.valor && !x.paga ? ' ★ mesmo valor' : ''}`]),
        s.iptu && s.iptu.n !== null && s.iptu.n !== undefined && p && s.iptu.id === p.id ? s.iptu.n : (pcs.find((x) => !x.paga && x.valorProprietario === m.valor) || pcs.find((x) => !x.paga) || {}).n, pcs.length ? '' : '— nenhuma parcela do proprietário');
    };
    const encher = () => {
      const imovelId = Number(sel('imovel').value) || null;
      const ds = imovelId ? despesasSemExtrato(imovelId, m) : [];
      sel('despesa').innerHTML = opcoes(ds.map((x) => [x.id, `${x.tipo} de ${compBr(x.competencia)} · ${reais(x.valor)} · paga em ${dataBr(x.data_pagamento)}${x.valor === m.valor ? ' ★ mesmo valor' : ''}`]), s.despesa_id || (ds.find((x) => x.valor === m.valor) || {}).id, '— lançar agora');
      const bs = boletosAbertos(imovelId, m);
      sel('boleto').innerHTML = opcoes(bs.map(({ cb, previsto }) => { const c = buscar('contratos', cb.contrato_id); return [cb.id, `${compBr(cb.competencia)} · ${c ? c.inquilino_nome : ''} · vence ${dataBr(cb.vencimento)} · ${reais(previsto)}${previsto === m.valor ? ' ★ mesmo valor' : ''}`]; }),
        s.cobranca_id || (bs.find((x) => x.previsto === m.valor) || { cb: {} }).cb.id, '— nenhum');
      const ips = d().iptus.filter((p) => !imovelId || p.imovel_id === imovelId).sort((a, b) => b.ano - a.ano || b.id - a.id);
      sel('iptu').innerHTML = opcoes(ips.map((p) => { const i = buscar('imoveis', p.imovel_id); return [p.id, `${p.ano}${!imovelId && i ? ` · ${i.nome}` : ''}`]; }), s.iptu ? s.iptu.id : (ips[0] || {}).id, ips.length ? '' : '— nenhum IPTU cadastrado');
      encherTipos();
      encherParcelas();
      mostrarCampos();
    };
    const mostrarCampos = () => {
      const k = sel('classificacao').value;
      campo('imovel').hidden = SEM_IMOVEL.includes(k);
      campo('despesa').hidden = k !== 'conta_imovel';
      campo('tipo_despesa').hidden = k !== 'conta_imovel' || !!sel('despesa').value;
      campo('boleto').hidden = k !== 'boleto';
      campo('airbnb').hidden = k !== 'airbnb';
      campo('reforma').hidden = k !== 'reforma';
      campo('iptu').hidden = k !== 'iptu';
      campo('guia').hidden = k !== 'imposto';
      campo('par').hidden = k !== 'transferencia';
    };
    sel('imovel').addEventListener('change', encher);
    sel('classificacao').addEventListener('change', mostrarCampos);
    sel('despesa').addEventListener('change', mostrarCampos);
    sel('competencia').addEventListener('change', encherTipos);
    sel('iptu').addEventListener('change', encherParcelas);
    sel('competencia_air').addEventListener('change', encherAirbnb);
    encherAirbnb();
    encher();
  } });
  if (!r) return null;
  const v = (k) => (r[k] || [''])[0];
  const classificacao = v('classificacao');
  const despesaId = classificacao === 'conta_imovel' ? Number(v('despesa')) || null : null;
  return { classificacao, imovel_id: SEM_IMOVEL.includes(classificacao) ? null : Number(v('imovel')) || null, despesa_id: despesaId,
    tipo_despesa: classificacao === 'conta_imovel' && !despesaId ? v('tipo_despesa') || null : null, competencia: classificacao === 'conta_imovel' && !despesaId ? v('competencia') || null : null,
    cobranca_id: classificacao === 'boleto' ? Number(v('boleto')) || null : null, pagouEmDia: classificacao === 'boleto' && s.cobranca_id === (Number(v('boleto')) || null) ? (s.pagouEmDia ?? null) : null,
    iptu_id: classificacao === 'iptu' ? Number(v('iptu')) || null : null, iptu_parcela: classificacao === 'iptu' && v('iptu_parcela') !== '' ? Number(v('iptu_parcela')) : null,
    guia_imposto_id: classificacao === 'imposto' ? Number(v('guia')) || null : null, par_movimentacao_id: classificacao === 'transferencia' && parSugerido ? parSugerido.id : null,
    competencia_air: classificacao === 'airbnb' ? v('competencia_air') || null : null,
    divisao: classificacao === 'airbnb' ? Object.keys(r).filter((k) => k.startsWith('air_') && String(v(k)).trim()).map((k) => ({ imovel_id: Number(k.slice(4)), valor: C.centavos(v(k)) })) : [],
    descricao_reforma: classificacao === 'reforma' ? String(v('descricao_reforma') || '').trim() : '',
    observacoes: String(v('observacoes') || '').trim() };
}

/**
 * Boleto recebido com valor diferente do previsto: nada foi gravado; abre na página do boleto o mesmo fluxo da baixa manual
 * (justificativa e valor da NF), que ao confirmar também liga a movimentação ao boleto.
 */
function abrirDivergencia(r, m) {
  memoria.pagamentoDivergente = { id: r.cobranca.id, data: m.data, valor: m.valor, pagouEmDia: !!r.pagouEmDia, dataPagou: null, justificativa: '', movimentacao_id: m.id };
  aviso(`Recebido ${reais(r.recebido)}, previsto ${reais(r.previsto)}: informe a justificativa e o valor da NF para confirmar. Nada foi salvo ainda.`, 'aviso');
  ir(`#/cobranca/${r.cobranca.id}?ir=pagamento`);
}

/** Grava o destino; boleto com valor diferente do previsto não grava e abre o fluxo da divergência. */
async function salvarDestino(m, destino) {
  const r = await alterar((db) => Z.vincularMovimentacao(db, m.id, destino, login()));
  if (r && r.divergente) return abrirDivergencia(r, m);
  if (destino.classificacao === 'boleto') { const cb = buscar('cobrancas', destino.cobranca_id); aviso(`Boleto de ${compBr(cb.competencia)} confirmado como pago em ${dataBr(m.data)}.`); } else aviso('Destino salvo.');
  return mostrar();
}

/** Destino a partir da sugestão, sem janela; null se falta algo (aí a janela abre já preenchida). */
function destinoDaSugestao(s) {
  if (!s || !s.classificacao) return null;
  const base = { classificacao: s.classificacao, imovel_id: s.imovel_id || null, tipo_despesa: s.tipo_despesa || null, competencia: null, despesa_id: s.despesa_id || null, cobranca_id: s.cobranca_id || null,
    pagouEmDia: s.pagouEmDia ?? null, iptu_id: s.iptu ? s.iptu.id : null, iptu_parcela: s.iptu && s.iptu.n !== null && s.iptu.n !== undefined ? Number(s.iptu.n) : null, guia_imposto_id: null, par_movimentacao_id: s.par_movimentacao_id || null, observacoes: '' };
  if (['airbnb', 'reforma'].includes(s.classificacao)) return null; // a janela pede a divisão / o que foi feito
  if (s.classificacao === 'boleto' && !base.cobranca_id) return null;
  if (s.classificacao === 'conta_imovel' && !base.despesa_id && (!base.imovel_id || !R.TIPOS_DESPESA.includes(base.tipo_despesa))) return null;
  if (s.classificacao === 'iptu' && (!base.iptu_id || base.iptu_parcela === null)) return null;
  return base;
}

// --------------------------------------------------------------------------
// Pagamentos: o banco lê os códigos (decode) e o lote é enviado para aprovação
// --------------------------------------------------------------------------
/** Casa os itens que o banco devolveu com os pagamentos (content + valor; senão pela ordem). */
function casarItens(pags, items) {
  const usados = new Set();
  return pags.map((p, k) => {
    let idx = items.findIndex((it, j) => !usados.has(j) && (String(it.id) === String(p.id_externo) || (it.content === p.content && centavosDoBanco(it.amount) === p.valor)));
    if (idx < 0 && items[k] && !usados.has(k)) idx = k;
    if (idx >= 0) usados.add(idx);
    return idx >= 0 ? items[idx] : null;
  });
}

/** Manda os códigos ao banco (decode), guarda o grupo e o que o banco leu em cada pagamento (erro de leitura → situação "erro"). */
async function lerNoBanco(conta, pags) {
  const itensC6 = pags.map((p) => ({ content: p.content, amount: p.amount, description: p.description, transaction_date: p.transaction_date }));
  let grupoId;
  let items;
  try {
    ({ group_id: grupoId } = await P.decodificarPagamentos(conta, itensC6));
    ({ items } = await P.itensDoGrupo(conta, grupoId));
  } catch (e) {
    throw new Error(`Os pagamentos ficaram como rascunho, mas o banco não respondeu: ${e.message} Use "Mandar o banco ler os códigos" quando a ponte voltar.`);
  }
  const casados = casarItens(pags, items || []);
  await alterar((db) => pags.forEach((p, k) => {
    const it = casados[k];
    if (!it) return;
    const atual = R.buscar(db, 'pagamentos_banco', p.id);
    const lida = it.status === 'READ_DATA';
    const situacao = lida ? (atual.situacao === 'erro' ? 'rascunho' : atual.situacao) : (Z.SITUACAO_C6[it.status] || 'erro');
    Z.atualizarPagamento(db, p.id, { situacao, erro: it.error_message || null, id_externo: it.id, grupo_id: grupoId, beneficiario: it.beneficiary_name ? { nome: it.beneficiary_name } : undefined, vencimento: it.due_date || undefined }, login());
  }));
  const erros = casados.filter((it) => it && it.status !== 'READ_DATA').length;
  aviso(erros ? `${erros} item(ns) com erro: confira o código. Os demais estão validados pelo banco.` : `${pags.length} pagamento(s) validado(s) pelo banco. Confira e envie para aprovação.`, erros ? 'aviso' : 'ok');
}

/** Pagamentos de um lote ainda não enviados. */
const pagamentosDoLote = (grupo) => pagamentos().filter((p) => p.grupo_id === grupo && ['rascunho', 'aguardando_aprovacao'].includes(p.situacao));

/**
 * Pagamento cancelado aqui antes do envio: o código já tinha sido lido pelo banco (lote de leitura), então o item sai do lote
 * no C6 também. Sem ponte, avisa e segue (o lote lido não paga nada sem a aprovação).
 */
async function tirarDoLote(pags) {
  const noBanco = pags.filter((p) => p.grupo_id && p.id_externo);
  if (!noBanco.length || !bancoAtivo()) return;
  const porLote = new Map();
  for (const p of noBanco) porLote.set(`${p.conta_id}|${p.grupo_id}`, [...(porLote.get(`${p.conta_id}|${p.grupo_id}`) || []), p]);
  const falhas = [];
  for (const [, l] of porLote) {
    try { await P.removerItensDoGrupo(l[0].conta_id, l[0].grupo_id, l.map((p) => p.id_externo)); } catch (e) { falhas.push(e.message); }
  }
  if (falhas.length) aviso(`Cancelado aqui, mas o item não saiu do lote lido pelo banco (${falhas[0]}). Isso não paga nada: o lote só anda com a aprovação.`, 'aviso');
}

// --------------------------------------------------------------------------
// Botões (data-acao) e formulários (data-form)
// --------------------------------------------------------------------------
export const ACOES_BANCO = {
  async buscarExtrato({ conta, mes }) {
    if (!opera()) throw new Error('Seu usuário não pode importar o extrato.');
    if (!bancoAtivo()) throw new Error(`${TITULO_AGUARDANDO}: configure o banco em Dados e backup.`);
    const [de, fim] = C.limitesCompetencia(mes);
    const ate = fim < C.hojeIso() ? fim : C.hojeIso();
    if (de > ate) throw new Error(`${compBr(mes)} ainda não começou.`);
    const r = await P.extratoDaConta(conta, de, ate);
    const res = await alterar((db) => Z.importarExtrato(db, conta, r.lancamentos || [], login(), { de, ate }));
    aviso(`${nomeConta(conta)}: ${res.novas.length} movimentação(ões) nova(s), ${res.repetidas} já estava(m).`);
    await mostrar();
  },

  /**
   * Importa o extrato de um arquivo OFX exportado pelo app do C6 (D5), na conta da aba aberta. Confirma antes mostrando a conta
   * do arquivo, o período e a quantidade; lançamentos já importados (mesmo FITID) não entram de novo.
   */
  async importarOfx({ conta }, el) {
    if (!opera()) throw new Error('Seu usuário não pode importar o extrato.');
    const arquivo = el && el.files && el.files[0];
    if (!arquivo) return;
    try {
      const r = Z.lerOfx(Z.textoDoOfx(new Uint8Array(await arquivo.arrayBuffer())));
      const entradas = r.lancamentos.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + l.valor_centavos, 0);
      const saidas = r.lancamentos.filter((l) => l.tipo === 'saida').reduce((s, l) => s - l.valor_centavos, 0);
      const ok = await janela({ titulo: `Importar extrato na conta ${nomeConta(conta)}`, sim: 'Importar',
        html: `<p>Arquivo <b>${esc(arquivo.name)}</b>${r.banco ? ` · ${esc(r.banco)}` : ''}${r.conta ? ` · conta nº <b>${esc(r.conta)}</b>` : ''}.</p>
          <p><b>${r.lancamentos.length}</b> lançamento(s) de ${dataBr(r.de)} a ${dataBr(r.ate)}: entradas ${reais(entradas)}, saídas ${reais(saidas)}.</p>
          <p class="suave">Confira se o arquivo é mesmo da conta <b>${esc(nomeConta(conta))}</b> (aba aberta). O que já foi importado não entra em dobro.</p>` });
      if (!ok) return;
      const res = await alterar((db) => Z.importarExtrato(db, conta, r.lancamentos, login(), { de: r.de, ate: r.ate }));
      aviso(`${nomeConta(conta)}: ${res.novas.length} movimentação(ões) nova(s) do arquivo OFX, ${res.repetidas} já estava(m).`);
      ir(`#/banco?conta=${encodeURIComponent(conta)}&mes=${r.ate.slice(0, 7)}`);
    } finally {
      if (el) el.value = '';
    }
  },

  async saldoBanco({ conta }) {
    if (!bancoAtivo()) throw new Error(TITULO_AGUARDANDO);
    const s = await P.saldoDaConta(conta);
    estado.saldos[conta] = { valor: centavosDoBanco(s.total_available ?? s.available ?? 0), quando: `consultado ${new Date().toLocaleString('pt-BR')}${s.available !== undefined && s.total_available !== undefined && s.available !== s.total_available ? ` · disponível sem limite ${reais(centavosDoBanco(s.available))}` : ''}` };
    await mostrar();
  },

  async darDestino({ id }) {
    const m = mov(id);
    const destino = await janelaDestino(m);
    if (destino) await salvarDestino(m, destino);
  },

  async usarSugestao({ id }) {
    const m = mov(id);
    const s = sugestaoDe(m);
    if (!s || !s.classificacao) throw new Error('Não há sugestão para esta movimentação.');
    if (s.pagamento_banco_id) {
      await alterar((db) => Z.marcarPagoPeloExtrato(db, s.pagamento_banco_id, m.id, login()));
      aviso('Pagamento pelo banco confirmado pelo extrato.');
      return mostrar();
    }
    const destino = destinoDaSugestao(s) || await janelaDestino(m, s);
    if (destino) await salvarDestino(m, destino);
  },

  async desvincularMov({ id }) {
    const m = mov(id);
    const r = await alterarApagandoAnexos((db) => Z.desvincularMovimentacao(db, m.id, login()));
    aviso(`Destino desfeito.${r && r.arquivos && r.arquivos.length ? ` ${r.arquivos.length} comprovante(s) apagado(s) da pasta.` : ''}`);
    await mostrar();
  },

  async nomearComprovante({ id, tabela = 'movimentacoes_banco' }) {
    const x = registroDe(tabela, id);
    const r = await janelaComprovante(x, tabela);
    if (!r) return;
    const blob = await pdfDaJanela(r);
    await guardarComprovante(x, tabela, r.nome, blob, r.origem);
    await mostrar();
  },

  /** Troca o comprovante gerado (ou anexado antes) pelo PDF oficial do banco, com o mesmo nome: o anterior é apagado da pasta. */
  async trocarComprovante({ id, tabela = 'movimentacoes_banco' }) {
    const onde = ondeEstaComprovante(registroDe(tabela, id), tabela);
    if (!onde) throw new Error('Este lançamento ainda não tem comprovante: use "Nomear e guardar".');
    const x = registroDe(tabela, id);
    const nome = String(onde.nome).replace(/\.pdf$/i, '').replace(/ \(\d+\)$/, '');
    const r = await janelaComprovante(x, tabela, { soManual: true, nomeFixo: nome });
    if (!r) return;
    const blob = await pdfDaJanela(r);
    // tira o registro dos dois lados (movimentação e pagamento ligado) para o arquivo antigo ficar sem uso e ser apagado
    await alterarApagandoAnexos((db) => {
      const atual = R.buscar(db, tabela, x.id);
      const irmao = irmaoDe(db, atual, tabela);
      if (temComprovante(atual)) Z.removerComprovante(db, atual.id, login(), tabela);
      if (irmao && irmao.x && temComprovante(irmao.x) && [irmao.x.comprovante, irmao.x.comprovante_contador].includes(onde.nome)) Z.removerComprovante(db, irmao.x.id, login(), irmao.tabela);
    });
    await guardarComprovante(registroDe(tabela, id), tabela, nome, blob, 'manual');
    await mostrar();
  },

  /** Gera pela ponte, de uma vez, os comprovantes do mês que ainda faltam (entradas e saídas com destino). */
  async gerarComprovantesMes({ conta, mes }) {
    if (!opera()) throw new Error('Seu usuário não pode guardar comprovantes.');
    if (!bancoAtivo()) throw new Error(TITULO_AGUARDANDO);
    const doMes = movs().filter((m) => m.conta_id === conta && String(m.data).slice(0, 7) === mes);
    const semDestino = doMes.filter((m) => !m.classificacao).length;
    const faltam = doMes.filter((m) => precisaComprovante(m) && !comComprovante(m) && m.id_externo);
    if (!faltam.length) { aviso(`Nenhum comprovante faltando em ${compBr(mes)}${semDestino ? `; ${semDestino} movimentação(ões) sem destino (dê o destino antes)` : ''}.`, 'info'); return; }
    aviso(`Gerando ${faltam.length} comprovante(s)…`, 'info');
    let gerados = 0;
    const falhas = [];
    for (const m of faltam) {
      try {
        const blob = await P.baixarComprovantePonte(m.conta_id, m.id_externo, m.data);
        await guardarComprovante(mov(m.id), 'movimentacoes_banco', Z.nomePadraoComprovante(d(), m), blob, 'ponte', { avisar: false });
        gerados += 1;
      } catch (e) {
        falhas.push(`${dataBr(m.data)} ${reais(m.valor)}: ${e.message}`);
      }
    }
    aviso(`${gerados} comprovante(s) gerado(s), ${semDestino} sem destino (dê o destino antes).${falhas.length ? ` ${falhas.length} falhou(aram): ${falhas.join(' · ')}` : ''}`, falhas.length ? 'aviso' : 'ok');
    await mostrar();
  },

  async confirmarBoletoPeloBanco({ id, cobranca }) {
    const m = mov(id);
    const cb = buscar('cobrancas', Number(cobranca));
    if (!cb) throw new Error('Boleto não encontrado.');
    if (cb.data_pagamento) throw new Error('Este boleto já está pago.');
    const c = buscar('contratos', cb.contrato_id);
    const previsto = R.previstoNoPagamento(cb, m.data).valor_devido;
    const r = await janela({ titulo: 'Confirmar o pagamento do boleto', sim: 'Confirmar pagamento', forte: previsto !== m.valor,
      html: `<p>Boleto de <b>${compBr(cb.competencia)}</b> de <b>${esc(c ? c.inquilino_nome : '')}</b>, vencimento ${dataBr(cb.vencimento)}.</p>
        <p>Recebido <b>${reais(m.valor)}</b> em <b>${dataBr(m.data)}</b> · previsto para esta data: <b>${reais(previsto)}</b>
        ${previsto === m.valor ? etiqueta('bate certinho', 'ok') : `${etiqueta('valor diferente', 'aviso')}<br><span class="suave">Ao confirmar, o sistema pede a justificativa e o valor da NF na página do boleto.</span>`}</p>
        <p class="suave">O boleto fica "Pago" com a data em que o dinheiro entrou e esta movimentação fica ligada a ele.</p>` });
    if (!r) return;
    const res = await alterar((db) => Z.confirmarPagamentoPeloBanco(db, cb.id, m.id, login()));
    if (res.divergente) return abrirDivergencia(res, m);
    aviso(`Pagamento do boleto de ${compBr(cb.competencia)} confirmado.`);
    await mostrar();
  },

  async conferirBoletosBanco({ conta, mes }) {
    if (!bancoAtivo()) throw new Error(TITULO_AGUARDANDO);
    const [de, fim] = C.limitesCompetencia(mes);
    const r = await P.boletosPagos(conta, de, fim < C.hojeIso() ? fim : C.hojeIso());
    const pagos = Array.isArray(r) ? r : (r && (r.boletos || r.content)) || [];
    estado.conferencia = { conta, mes, recebidos: pagos.length, sugestoes: Z.conciliarBoletos(d(), conta, pagos) };
    aviso(`${pagos.length} boleto(s) pago(s) segundo o banco; ${estado.conferencia.sugestoes.length} correspondem a boletos em aberto aqui.`, 'info');
    await mostrar();
  },

  async lerNoBanco({ ids }) {
    if (!opera()) throw new Error('Seu usuário não pode preparar pagamentos.');
    if (!bancoAtivo()) throw new Error(TITULO_AGUARDANDO);
    // rascunho, erro de leitura ou aprovado sem lote (dados antigos): todos precisam da leitura do banco antes do envio
    const pags = String(ids).split(',').map((x) => pag(x)).filter((p) => PENDENTES.includes(p.situacao));
    if (!pags.length) throw new Error('Nenhum pagamento para o banco ler.');
    await lerNoBanco(pags[0].conta_id, pags);
    await mostrar();
  },

  /**
   * Administrador: numa janela só, confere o lote, digita o valor total e aprova; o lote vai ao banco e o que o banco disse fica
   * registrado. A outra confirmação é no app do C6 (duas ao todo, decisão do dono em 2026-11-07).
   */
  async enviarGrupoAprovacao({ conta, grupo }) {
    if (!podeUsuario('admin')) throw new Error('Só o administrador envia pagamentos para aprovação.');
    if (!bancoAtivo()) throw new Error(TITULO_AGUARDANDO);
    if (!config().permitir_pagamentos) throw new Error('Os pagamentos pelo banco estão desligados em Dados e backup → Banco: conciliação e pagamentos.');
    const pags = pagamentosDoLote(grupo);
    if (!pags.length) throw new Error('Nenhum pagamento deste lote está pronto para enviar (prepare de novo).');
    const { items } = await P.itensDoGrupo(conta, grupo);
    const lidos = (items || []).filter((it) => it.status === 'READ_DATA');
    const prontos = pags.filter((p) => lidos.some((it) => String(it.id) === String(p.id_externo)));
    if (!prontos.length) throw new Error('Nenhum item foi validado pelo banco. Confira os códigos e prepare de novo.');
    const total = prontos.reduce((t, p) => t + p.valor, 0);
    const comErro = (items || []).filter((it) => it.status !== 'READ_DATA' && it.status !== 'SCHEDULED' && it.status !== 'PROCESSING' && it.status !== 'PROCESSED');
    // uma janela só: o resumo completo e o valor total digitado (qualquer diferença cancela)
    const r2 = await janela({ titulo: 'Aprovar e enviar ao banco', sim: 'Aprovar e enviar', forte: true,
      html: `<p>Conta que paga: <b>${esc(nomeConta(conta))}</b></p><ul>${prontos.map((p) => { const i = p.imovel_id ? buscar('imoveis', p.imovel_id) : null; const codigo = CODIGO_PAG(p); return `<li>${i ? `${esc(i.nome)} · ` : ''}${esc(p.tipo_conta)} ${compBr(p.competencia)} · ${esc((p.beneficiario && p.beneficiario.nome) || '')} · <b>${reais(p.valor)}</b>${p.vencimento ? ` · vence ${dataBr(p.vencimento)}` : ''} · pagar em ${dataBr(p.data_pagamento)}${codigo ? `<br><span class="codigo-barras suave">${esc(codigo)}</span>` : ''}</li>`; }).join('')}</ul>
        ${comErro.length ? `<p class="texto-aviso">${comErro.length} item(ns) com erro de leitura ficam de fora (são tirados do lote no banco).</p>` : ''}
        <p>Para aprovar e enviar ${prontos.length} pagamento(s), digite o valor total exatamente como aparece: <b>${esc(reais(total, false))}</b></p>
        <p><input name="total" inputmode="decimal" placeholder="0,00" autocomplete="off" style="width:100%"></p>
        <p class="suave">Você está aprovando como administrador; qualquer diferença no valor cancela o envio e nada vai ao banco. Depois de enviado, o pagamento só acontece quando alguém autorizado aprovar no aplicativo do C6.</p>`,
      ligar(dlg) { const el = dlg.querySelector('[name="total"]'); if (el) el.focus(); } });
    if (!r2) return;
    const digitado = String((r2.total || [''])[0] || '').trim();
    if (!digitado || C.centavos(digitado) !== total) {
      aviso(`Envio cancelado: o valor digitado (${digitado || 'em branco'}) é diferente do total ${reais(total)}. Nada foi enviado ao banco.`, 'aviso');
      return;
    }
    await alterar((db) => prontos.forEach((p) => { if (R.buscar(db, 'pagamentos_banco', p.id).situacao === 'rascunho') Z.aprovarPagamento(db, p.id, login()); }));
    if (comErro.length) await P.removerItensDoGrupo(conta, grupo, comErro.map((it) => it.id));
    await P.enviarGrupoParaAprovacao(conta, grupo, E.usuario ? E.usuario.nome || login() : login());
    const depois = await P.itensDoGrupo(conta, grupo);
    await alterar((db) => Z.registrarGrupoEnviado(db, prontos.map((p) => p.id), grupo, depois.items || [], login()));
    aviso('Enviado ao banco. Agora aprove no aplicativo do C6; depois busque o extrato e confirme o pagamento.', 'aviso');
    await mostrar();
  },

  async descartarPagamentos({ ids }) {
    const pags = String(ids).split(',').map((x) => pag(x)).filter((p) => PENDENTES.includes(p.situacao));
    await alterar((db) => pags.forEach((p) => Z.cancelarPagamento(db, p.id, login(), { motivo: 'descartado antes de enviar' })));
    await tirarDoLote(pags);
    await mostrar();
  },

  /** Administrador: o pagamento enviado foi cancelado (ou recusado) no C6 e o banco não avisou; aqui passa a "Cancelado" e sai do alerta. */
  async canceladoNoBanco({ id }) {
    if (!podeUsuario('admin')) throw new Error('Só o administrador marca um pagamento como cancelado no banco.');
    const p = pag(id);
    const r = await janela({ titulo: 'Foi cancelado no C6', sim: 'Marcar como cancelado', forte: true,
      html: `<p>${esc(p.tipo_conta || '')} ${compBr(p.competencia)} · <b>${reais(p.valor)}</b> · pagar em ${dataBr(p.data_pagamento)} · conta ${esc(nomeConta(p.conta_id))}</p>
        <p>Confirme que este pagamento foi cancelado ou recusado no aplicativo do C6 (não vai ser pago). Aqui ele passa a "Cancelado" e deixa de aparecer no alerta do Painel. Nada é enviado ao banco.</p>
        <p>Se o dinheiro já saiu, não marque: use "Confirmar pelo extrato".</p>
        <label>Motivo (opcional)</label><input name="motivo" autocomplete="off" style="width:100%" placeholder="ex.: cancelado no app pelo gerente">` });
    if (!r) return;
    const motivo = String((r.motivo || [''])[0] || '').trim();
    await alterar((db) => Z.cancelarPagamento(db, p.id, login(), { noBanco: true, motivo: `cancelado no C6${motivo ? `: ${motivo}` : ''}` }));
    aviso('Pagamento marcado como cancelado no banco.');
    await mostrar();
  },

  async atualizarSituacaoPagamento({ conta, grupo }) {
    if (!bancoAtivo()) throw new Error(TITULO_AGUARDANDO);
    const { items } = await P.itensDoGrupo(conta, grupo);
    const mudados = await alterar((db) => Z.atualizarSituacaoPagamentos(db, items || [], login()));
    const n = mudados.length;
    aviso(n ? `${n} pagamento(s) com situação atualizada.` : 'Nada mudou no banco. Lembre: a confirmação final do pagamento sai no extrato.', n ? 'ok' : 'info');
    await mostrar();
  },

  async cancelarPagamentoBanco({ id }) {
    const p = pag(id);
    await alterar((db) => Z.cancelarPagamento(db, p.id, login()));
    await tirarDoLote([p]);
    await mostrar();
  },

  async confirmarPagamentoPeloExtrato({ id }) {
    const p = pag(id);
    const candidatas = movs().filter((m) => m.conta_id === p.conta_id && m.tipo === 'saida' && m.valor === p.valor && !m.classificacao)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));
    if (!candidatas.length) throw new Error(`Nenhuma saída de ${reais(p.valor)} sem destino na conta ${nomeConta(p.conta_id)}. Busque o extrato do mês na tela Banco e tente de novo.`);
    const r = await janela({ titulo: 'Qual saída do extrato é este pagamento?', sim: 'Confirmar pagamento',
      html: `<p>${esc(p.tipo_conta || '')} ${compBr(p.competencia)} · <b>${reais(p.valor)}</b> · pagar em ${dataBr(p.data_pagamento)}</p>
        ${candidatas.map((m, n) => `<p><label><input type="radio" name="mov" value="${m.id}" ${n === 0 ? 'checked' : ''}> ${dataBr(m.data)} · ${esc(m.titulo || '')} ${esc(m.descricao || '')} · ${reais(m.valor)}</label></p>`).join('')}
        <p class="suave">O pagamento fica "Pago" na data da saída e a movimentação ganha o destino da conta paga.</p>` });
    if (!r || !r.mov) return;
    await alterar((db) => Z.marcarPagoPeloExtrato(db, p.id, Number(r.mov[0]), login()));
    aviso('Pagamento confirmado pelo extrato.');
    await mostrar();
  },
};

export const FORMULARIOS_BANCO = {
  async registrarPagamentosBanco(form) {
    if (!opera()) throw new Error('Seu usuário não pode confirmar pagamentos.');
    const conf = estado.conferencia;
    const marcados = [...form.querySelectorAll('input[name="pag"]:checked')].map((el) => conf && conf.sugestoes[Number(el.value)]).filter(Boolean);
    if (!marcados.length) throw new Error('Marque pelo menos um boleto.');
    const total = marcados.reduce((t, s) => t + s.valor, 0);
    if (!confirm(`Registrar o pagamento de ${marcados.length} boleto(s), ${reais(total)} no total, com as datas em que o dinheiro entrou?`)) return;
    let n = 0;
    const divergentes = [];
    await alterar((db) => {
      for (const s of marcados) {
        const cb = R.buscar(db, 'cobrancas', s.cobranca_id);
        if (!cb || cb.data_pagamento) continue;
        // a entrada correspondente no extrato (mesmo valor e data de crédito, ainda sem destino) fica ligada ao boleto
        const m = (db.movimentacoes_banco || []).find((x) => x.conta_id === conf.conta && x.tipo === 'entrada' && x.valor === s.valor && x.data === s.data_credito && !x.classificacao);
        const origem = m ? m.id : { amount: s.valor / 100, payment_date: s.data_pagamento, credit_date: s.data_credito, external_payment_id: s.external_payment_id, payment_type: s.payment_type };
        const r = Z.confirmarPagamentoPeloBanco(db, cb.id, origem, login(), { pagouEmDia: s.pagouEmDia || null });
        if (r.divergente) divergentes.push(`${compBr(cb.competencia)} (recebido ${reais(r.recebido)}, previsto ${reais(r.previsto)})`);
        else n += 1;
      }
    });
    estado.conferencia = null;
    aviso(`${n} pagamento(s) registrado(s).${divergentes.length ? ` ${divergentes.length} com valor diferente do previsto não foi(ram) registrado(s): ${divergentes.join('; ')}. Confirme pela linha do extrato ("É o pagamento do boleto…"), que pede a justificativa e o valor da NF.` : ''}`, divergentes.length ? 'aviso' : 'ok');
    await mostrar();
  },

  async pagarPeloBanco(form) {
    if (!opera()) throw new Error('Seu usuário não pode preparar pagamentos.');
    if (!bancoAtivo()) throw new Error(`${TITULO_AGUARDANDO}: configure o banco em Dados e backup.`);
    const f = Object.fromEntries(new FormData(form));
    const i = buscar('imoveis', Number(f.imovel));
    if (!i) throw new Error('Imóvel não encontrado.');
    if (!f.conta) throw new Error('Escolha a conta que paga.');
    const itens = R.TIPOS_DESPESA.map((t, n) => ({ tipo_conta: f[`tipo_${n}`] || t, codigo: String(f[`codigo_${n}`] || '').trim(), valor: String(f[`valor_${n}`] || '').trim() ? C.centavos(f[`valor_${n}`]) : 0, data_pagamento: f[`data_${n}`] || C.hojeIso() }))
      .filter((x) => x.codigo || x.valor);
    if (!itens.length) throw new Error('Preencha o código e o valor de pelo menos uma conta.');
    for (const x of itens) {
      if (!x.codigo) throw new Error(`${x.tipo_conta}: informe o código de barras ou o Pix.`);
      if (!(x.valor > 0)) throw new Error(`${x.tipo_conta}: informe o valor.`);
      if (x.data_pagamento < C.hojeIso()) throw new Error(`${x.tipo_conta}: a data de pagamento não pode ser no passado.`);
    }
    // o código é conferido aqui, antes de ir ao banco: número só vira boleto com 44, 47 ou 48 dígitos (nunca chave Pix, salvo CPF/CNPJ)
    const prontos = itens.map((x) => {
      const r = lerCodigoPagamento(x.codigo);
      if (r.erro) throw new C.ErroUsuario(`${x.tipo_conta}: ${r.erro}`);
      return { conta_id: f.conta, imovel_id: i.id, origem: { tipo: 'avulso', id: null, n: null }, tipo_conta: x.tipo_conta, competencia: f.competencia, valor: x.valor, data_pagamento: x.data_pagamento,
        forma: r.forma, codigo_barras: r.codigo_barras || null, pix_copia_cola: r.pix_copia_cola || null, chave_pix: r.chave_pix || null, descricao: '' };
    });
    const pags = await alterar((db) => Z.prepararPagamentos(db, prontos, login()));
    await lerNoBanco(f.conta, pags);
    await mostrar();
  },

  async configBanco2(form) {
    if (!podeUsuario('admin')) throw new Error('Só o administrador altera a configuração do banco.');
    const f = Object.fromEntries(new FormData(form));
    const campos = { permitir_pagamentos: f.permitir_pagamentos === '1', copiar_para_contador: f.copiar_para_contador === '1',
      limite_pagamento: String(f.limite_pagamento || '').trim() ? C.centavos(f.limite_pagamento) : 0, tolerancia_dias: Number(f.tolerancia_dias) || 0,
      pasta_contador: String(f.pasta_contador || '').trim() || PASTA_CONTADOR, modelo_nome_comprovante: String(f.modelo_nome_comprovante || '').trim() || R.CONFIG_BANCO_FASE2.modelo_nome_comprovante };
    await alterar((db) => Z.salvarConfigBanco2(db, campos, login()));
    aviso(`Configuração do banco salva. Pagamentos pelo banco: ${campos.permitir_pagamentos ? 'permitidos' : 'desligados'}.`);
    await mostrar();
  },
};
