// Telas de consulta: solicitações dos inquilinos, lista de inquilinos, IPTU do ano e calendário do painel.
import { podeUsuario } from '../app.js';
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao, buscar, d, etiqueta, idGuiasDoAno, link, opera, ordenar } from './comum.js';

/** Situações da solicitação, com o símbolo do resumo (tela Inquilinos) e da lista de solicitações. */
export const SITUACOES_SOLICITACAO = [
  { nome: 'Aberta', simbolo: '🟢', texto: 'abertas' },
  { nome: 'Em andamento', simbolo: '➡️', texto: 'em andamento' },
  { nome: 'Concluída', simbolo: '✅', texto: 'concluídas' },
  { nome: 'Não atendida', simbolo: '❌', texto: 'não atendidas' },
];

/** Todas as solicitações dos inquilinos, com filtro pela situação. */
export function telaSolicitacoes(q) {
  const resumo = R.resumoSolicitacoes(d());
  const filtro = SITUACOES_SOLICITACAO.find((s) => s.nome === q.situacao);
  const simbolo = (sit) => (SITUACOES_SOLICITACAO.find((s) => s.nome === sit) || SITUACOES_SOLICITACAO[0]).simbolo;
  const lista = d().solicitacoes.filter((x) => !filtro || (x.situacao || 'Aberta') === filtro.nome)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);
  return `<p class="suave"><a href="#/inquilinos">← Inquilinos</a></p>
    <div class="cabecalho"><h1>Solicitações dos inquilinos</h1>${opera() ? link('#/novo/solicitacoes?de=solicitacoes', 'Abrir nova solicitação', 'botao') : ''}</div>
    <div class="acoes" style="margin-bottom:12px;flex-wrap:wrap">${link('#/solicitacoes', `Todas (${d().solicitacoes.length})`, `botao ${filtro ? 'secundario ' : ''}pequeno`)}
      ${SITUACOES_SOLICITACAO.map((s) => link(`#/solicitacoes?situacao=${encodeURIComponent(s.nome)}`, `${s.simbolo} ${resumo[s.nome]} ${s.texto}`, `botao ${filtro === s ? '' : 'secundario '}pequeno`)).join(' ')}</div>
    <div class="cartao rolagem"><table><tr><th>Data</th><th>Inquilino / imóvel</th><th>O que pediu</th><th>O que foi feito</th><th>Situação</th><th class="n">Custo</th><th></th></tr>
    ${lista.map((x) => {
    const c = buscar('contratos', x.contrato_id);
    const i = c && c.imovel_id ? buscar('imoveis', c.imovel_id) : null;
    return `<tr><td class="nw">${dataBr(x.data)}</td>
      <td>${c ? `<a href="#/contrato/${c.id}?ir=solicitacoes"><b>${esc(c.inquilino_nome)}</b></a>` : '-'}${i ? `<br><span class="suave">${esc(i.nome)}</span>` : ''}</td>
      <td class="pre">${esc(x.descricao)}</td>
      <td class="pre">${esc(x.providencia || '')}${x.responsavel ? `<br><span class="suave">${esc(x.responsavel)}</span>` : ''}</td>
      <td class="nw">${simbolo(x.situacao || 'Aberta')} ${esc(x.situacao || 'Aberta')}${x.data_conclusao ? `<br><span class="suave">em ${dataBr(x.data_conclusao)}</span>` : ''}</td>
      <td class="n">${x.valor ? `${reais(x.valor)}${x.pago_por ? `<br><span class="suave">${esc(x.pago_por)}</span>` : ''}` : '-'}</td>
      <td class="n nw">${opera() ? link(`#/editar/solicitacoes/${x.id}?de=solicitacoes`, 'Editar') : ''}</td></tr>`;
  }).join('') || `<tr><td colspan="7" class="suave">Nenhuma solicitação${filtro ? ' nesta situação' : ''}.</td></tr>`}</table>
</div>`;
}

/** Inquilinos atuais e anteriores, com o resumo da saída. */
export function telaInquilinos(q) {
  const hoje = C.hojeIso();
  const busca = String(q.busca || '').trim().toLocaleLowerCase('pt-BR');
  let todos = d().contratos.map((c) => ({ c, i: c.imovel_id ? buscar('imoveis', c.imovel_id) : null, e: R.encerramentoDo(d(), c.id) }));
  if (busca) todos = todos.filter((x) => [x.c.inquilino_nome, x.c.inquilino_apelido, x.c.inquilino_cpf, x.i && x.i.nome].some((t) => String(t || '').toLocaleLowerCase('pt-BR').includes(busca)));
  const porNome = (a, b) => (a.i ? a.i.nome : '~').localeCompare(b.i ? b.i.nome : '~', 'pt-BR') || a.c.inquilino_nome.localeCompare(b.c.inquilino_nome, 'pt-BR');
  const atuais = todos.filter((x) => R.contratoAtivo(x.c, hoje)).sort(porNome);
  const anteriores = todos.filter((x) => !R.contratoAtivo(x.c, hoje)).sort((a, b) => String(b.c.data_saida || '9').localeCompare(String(a.c.data_saida || '9')));
  const anterior = (c) => (c.contrato_anterior_id ? buscar('contratos', c.contrato_anterior_id) : null);
  const nome = ({ c }) => `<a href="#/contrato/${c.id}"><b>${esc(c.inquilino_nome)}</b></a>${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}${R.geraNf(c) ? '' : ` ${etiqueta('boleto de controle', 'controle')}`}${anterior(c) ? `<br><span class="suave">continua ${esc(anterior(c).inquilino_nome)}</span>` : ''}`;
  // contrato sem imóvel (de antes do imóvel obrigatório): pode ser apagado (o vínculo é só no contrato novo)
  const imovel = (x) => (x.i ? `<a href="#/imovel/${x.i.id}">${esc(x.i.nome)}</a>` : `${etiqueta('Sem imóvel', 'aviso')}${podeUsuario('admin') ? ` ${botao('excluir', '×', { tabela: 'contratos', id: x.c.id }, 'x-excluir', `Apagar o contrato sem imóvel de ${x.c.inquilino_nome}? (Para alugar um imóvel, faça um novo contrato.)`)}` : ''}`);
  const situacao = (c) => (c.data_saida && c.data_saida < hoje ? etiqueta(R.fimDeVinculo(d(), c) ? 'Fim do vínculo' : 'Saiu', 'neutra') : c.ativo === false ? etiqueta('Inativo', 'neutra') : '');
  const registrar = (c) => (opera() ? `<td class="centro"><a class="botao secundario pequeno botao-icone" href="#/novo/solicitacoes?contrato=${c.id}&de=inquilinos" title="Registrar solicitação de ${esc(c.inquilino_nome)}" aria-label="Registrar solicitação"><svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="1" y="1" width="18" height="14" rx="2"/><path d="M1.5 2l8.5 7 8.5-7"/></svg></a></td>` : '');
  const resumo = R.resumoSolicitacoes(d());
  return `<div class="cabecalho"><h1>Inquilinos</h1>${opera() ? link('#/novo/contratos', 'Novo contrato', 'botao') : ''}</div>
    <div class="acoes" style="margin-bottom:12px;flex-wrap:wrap"><form class="acoes" data-form="buscaInquilinos" style="flex-wrap:nowrap"><input name="busca" value="${esc(q.busca || '')}" placeholder="Buscar por nome, CPF ou imóvel" style="width:300px"><button class="secundario">Buscar</button>${busca ? link('#/inquilinos', 'Limpar') : ''}</form>
      <a class="botao secundario resumo-solicitacoes" href="#/solicitacoes" title="Ver todas as solicitações dos inquilinos">Solicitações: ${SITUACOES_SOLICITACAO.map((s) => `<span>${s.simbolo} ${resumo[s.nome]} ${s.texto}</span>`).join(' ')}</a></div>
    <div class="cartao rolagem"><h2>Ativos (${atuais.length})</h2><table><tr><th>Imóvel</th><th>Inquilino</th>${opera() ? '<th class="centro">Registrar solicitação</th>' : ''}<th>Entrada</th><th>Vigência do contrato</th><th class="n">Aluguel atual</th><th>Garantia</th></tr>
      ${atuais.map((x) => `<tr class="${x.c.verificar ? 'amarelo' : ''}"><td>${imovel(x)}</td><td>${nome(x)}</td>${registrar(x.c)}<td class="nw">${dataBr(x.c.data_entrada)}</td>
        <td class="nw">${x.c.prazo_tipo === 'Indeterminado' ? `${(x.c.data_entrada || x.c.vigencia_inicio) ? `${dataBr((x.c.data_entrada || x.c.vigencia_inicio))} · ` : ''}${etiqueta('indeterminado', 'aviso')}` : `${dataBr((x.c.data_entrada || x.c.vigencia_inicio))} a ${dataBr(x.c.vigencia_fim)}`}</td><td class="n nw">${reais(R.aluguelAtual(d(), x.c))}</td>
        <td class="nw">${esc(x.c.garantia_tipo || '-')}${R.valorGarantia(d(), x.c) ? ` ${reais(R.valorGarantia(d(), x.c))}` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="suave">Nenhum.</td></tr>'}</table>
      <p class="suave">O inquilino deixa de ser ativo (e de gerar boleto) pela saída: na página dele, "Saída do inquilino".</p></div>
    <div class="cartao rolagem"><h2>Inativos e histórico de quem saiu (${anteriores.length})</h2><table><tr><th>Imóvel</th><th>Inquilino</th><th>Entrada</th><th>Saída</th><th class="n">Garantia corrigida</th><th class="n">Débitos</th><th class="n">Saldo</th></tr>
      ${anteriores.map((x) => `<tr><td>${imovel(x)}</td><td>${nome(x)} ${situacao(x.c)}</td><td class="nw">${dataBr(x.c.data_entrada)}</td><td class="nw">${dataBr(x.c.data_saida)}</td>
        ${x.e ? `<td class="n">${reais(x.e.garantia_corrigida)}</td><td class="n">${reais(x.e.debitos)}</td><td class="n"><b>${reais(x.e.saldo)}</b></td>` : `<td colspan="3" class="suave">${R.fimDeVinculo(d(), x.c) ? `contrato continua com ${esc(R.continuadoPor(d(), x.c).inquilino_nome)}` : opera() && x.c.data_saida ? link(`#/novo/encerramentos?contrato=${x.c.id}`, 'Fazer cálculo final') : x.c.data_saida ? 'sem cálculo final' : '-'}</td>`}
</tr>`).join('')
      || '<tr><td colspan="7" class="suave">Nenhum inquilino inativo.</td></tr>'}</table></div>`;
}

export function telaIptu(ano) {
  const hoje = C.hojeIso();
  const imoveis = ordenar(d().imoveis, 'nome');
  const doAno = (i) => d().iptus.find((p) => p.imovel_id === i.id && p.ano === ano);
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  // valor e forma numa coluna só; entre parênteses, o valor pago à vista com desconto (quando houver)
  const valor = (p) => `<b>${reais(p.valor_total)}</b> · ${p.pago_avista ? 'à vista' : `${p.num_parcelas}x`}${p.pago_avista && p.valor_avista ? ` <span class="suave">(à vista ${reais(p.valor_avista)})</span>` : ''}`;
  const primeira = (p) => { const m = !p.pago_avista && (p.primeiro_vencimento_boleto || (p.primeira_competencia && C.somarMeses(p.primeira_competencia, 1))); return m ? `<br><span class="suave">1ª no boleto de ${compBr(m)}</span>` : ''; };
  // um quadradinho por mês (mês do boleto), na cor da situação; o valor aparece ao passar o mouse; o vermelho marca a guia paga
  const quadrado = (pc, p, mes) => {
    const sep = mes === `${ano + 1}-01` ? '<span class="sep-ano"></span>' : '';
    return sep + quadradoDoMes(pc, p, mes);
  };
  const quadradoDoMes = (pc, p, mes) => {
    if (!pc) return `<span class="q q-vazio" title="${rotuloMes(mes)}: sem parcela"></span>`;
    const nome = `${rotuloMes(mes)} · ${pc.n === 0 ? 'cota única' : `${pc.rotulo} parcela`}`;
    if (!pc.proprietario) return `<span class="q q-inq" title="${nome}: inquilino paga ${reais(pc.valor)} no boleto"></span>`;
    const inq = pc.valorInquilino ? ` (inquilino ${reais(pc.valorInquilino)})` : '';
    const venc = pc.vencimento ? ` · vence ${dataBr(pc.vencimento)}` : '';
    if (pc.paga) return `<span class="q ${pc.valorInquilino ? 'q-div' : 'q-paga'}" title="${nome}: sua parte ${reais(pc.valorProprietario)}${inq} · paga em ${dataBr(pc.paga)}"></span>`;
    const titulo = `${nome}: sua parte ${reais(pc.valorProprietario)}${inq}${venc} · em aberto`;
    return opera() ? `<button type="button" class="q q-aberto" data-acao="iptuPagoRapido" data-id="${p.id}" data-n="${pc.n}" data-texto="${esc(titulo)}" title="${esc(titulo)} (clique para marcar como paga)"></button>`
      : `<span class="q q-aberto" title="${esc(titulo)}"></span>`;
  };
  const rotuloMes = (mes) => `${MESES[Number(mes.slice(5)) - 1]}${mes.startsWith(String(ano)) ? '' : `/${mes.slice(2, 4)}`}`;
  const mesDaParcela = (pc, p) => (pc.n === 0 ? (p.data_quitacao || p.vencimento_primeira || '').slice(0, 7) : pc.mesBoleto || (pc.comp && C.somarMeses(pc.comp, 1)) || '');
  const mapas = new Map(imoveis.filter(doAno).map((i) => {
    const p = doAno(i);
    return [i.id, new Map(R.parcelasIptu(d(), p).map((pc) => [mesDaParcela(pc, p), pc]))];
  }));
  // o ano todo e mais os meses do ano seguinte que ainda têm parcela deste IPTU (ex.: 10 parcelas a partir de abril vão até janeiro)
  const ultimo = [...mapas.values()].flatMap((m) => [...m.keys()]).filter((m) => m > `${ano}-12`).sort().pop() || `${ano}-12`;
  const meses = [];
  for (let m = `${ano}-01`; m <= ultimo; m = C.somarMeses(m, 1)) meses.push(m);
  const soma = { inquilino: 0, sua: 0, aberto: 0 };
  const linhas = imoveis.map((i) => {
    const p = doAno(i);
    const idGuias = idGuiasDoAno(i.id, ano);
    // guias do ano: 📎1 ×, 📎2 ×… e o clipe cinza para anexar mais uma
    const guias = `<span class="clipes-iptu"><span data-arquivos="iptuano:${idGuias}:clipe"></span>${opera() ? `<label class="clipe-anexar enviar" title="Anexar a guia do IPTU ${ano}">📎<input type="file" multiple data-upload="iptuano:${idGuias}"></label>` : ''}</span>`;
    const nome = `<a href="#/imovel/${i.id}?ir=iptu"><b>${esc(i.nome)}</b></a> ${guias}`;
    if (!p) return `<tr class="amarelo"><td>${nome}</td><td colspan="5">${etiqueta(`sem IPTU de ${ano} lançado`, 'aviso')} ${opera() ? link(`#/novo/iptus?imovel=${i.id}&ano=${ano}&de=iptu`, `Lançar ${ano}`, 'botao pequeno') : ''}</td></tr>`;
    const mapa = mapas.get(i.id);
    const t = R.totaisIptu(d(), p);
    soma.inquilino += t.inquilino; soma.sua += t.proprietario; soma.aberto += t.emAberto;
    return `<tr><td>${nome}</td><td class="nw">${valor(p)}${primeira(p)}</td><td class="nw">${meses.map((m) => quadrado(mapa.get(m), p, m)).join('')}</td>
      <td class="n nw">${t.inquilino ? reais(t.inquilino) : '-'}</td><td class="n nw">${t.proprietario ? `<b class="${t.emAberto ? 'texto-perigo' : ''}">${reais(t.proprietario)}</b>` : '-'}</td>
      <td class="n">${opera() ? link(`#/editar/iptus/${p.id}?de=iptu`, 'Editar') : ''}</td></tr>`;
  }).join('');
  const faltam = imoveis.filter((i) => !doAno(i)).length;
  const guias = R.guiasIptuAPagar(d(), hoje, 60);
  const legenda = [['q-inq', 'inquilino paga no boleto'], ['q-div', 'dividido (mês de entrada ou saída), sua parte paga'], ['q-aberto', 'sua parte, em aberto'], ['q-paga', 'sua parte, paga'], ['q-vazio', 'sem parcela']]
    .map(([c, t]) => `<span><span class="q ${c}"></span> ${t}</span>`).join('');
  return `<p class="suave"><a href="#/imoveis">← Imóveis</a></p>
    <div class="cabecalho"><h1>IPTU ${ano}</h1><div class="acoes">${link(`#/iptu?ano=${ano - 1}`, `← ${ano - 1}`, 'botao secundario')} ${link(`#/iptu?ano=${ano + 1}`, `${ano + 1} →`, 'botao secundario')}</div></div>
    ${faltam ? `<div class="alerta aviso">${faltam} imóvel(is) ainda sem o IPTU de ${ano} (em amarelo).</div>` : ''}
    <div class="cartao rolagem"><h2>Guias suas a pagar <span class="suave">(vencidas e dos próximos 60 dias)</span></h2>
      <table class="compacta"><tr><th>Vence</th><th>Imóvel</th><th>Parcela</th><th>Motivo</th><th class="n">Valor</th><th></th></tr>
      ${guias.map((g) => `<tr class="${g.faltam < 0 ? 'fora' : ''}"><td class="nw">${g.faltam < 0 ? `<b class="texto-perigo">${dataBr(g.venc)} · vencida</b>` : dataBr(g.venc)}${g.estimado ? ' <span class="suave">(estimado)</span>' : ''}</td>
        <td><a href="#/imovel/${g.imovel.id}?ir=iptu">${esc(g.imovel.nome)}</a></td><td>${g.iptu.ano} · ${g.parcela.n === 0 ? 'cota única' : `${g.parcela.rotulo} parcela`}</td>
        <td class="suave">${g.parcela.n === 0 ? 'pago à vista por você' : g.parcela.valorInquilino ? `entrada ou saída (inquilino paga ${reais(g.parcela.valorInquilino)})` : 'imóvel vazio ou contrato sem IPTU'}</td>
        <td class="n nw"><b>${reais(g.parcela.valorProprietario)}</b></td>
        <td class="n nw">${opera() ? `<form data-form="iptuPago" data-id="${g.iptu.id}" data-n="${g.parcela.n}" class="pagamento"><input type="date" name="data" value="${hoje}"><button class="pequeno">Paga</button></form>` : ''}</td></tr>`).join('')
      || '<tr><td colspan="6" class="suave">Nenhuma guia sua vencida ou vencendo nos próximos 60 dias.</td></tr>'}</table></div>
    <div class="cartao rolagem"><table class="compacta mapa-iptu"><tr><th>Imóvel</th><th>IPTU ${ano}</th><th class="nw meses-iptu">${meses.map((m) => `${m === `${ano + 1}-01` ? '<span class="sep-ano"></span>' : ''}<span>${rotuloMes(m)}</span>`).join('')}</th><th class="n">Inquilino</th><th class="n">Você paga</th><th></th></tr>
      ${linhas || '<tr><td colspan="6" class="suave">Nenhum imóvel cadastrado.</td></tr>'}
      ${linhas ? `<tr class="total"><td>Total</td><td></td><td></td><td class="n nw">${reais(soma.inquilino)}</td><td class="n nw">${reais(soma.sua)}${soma.aberto ? `<br><span class="texto-perigo">${reais(soma.aberto)} em aberto</span>` : ''}</td><td></td></tr>` : ''}</table>
    <div class="legenda-iptu">${legenda}</div>
    <p class="suave">Cada quadradinho é o boleto do mês em que a parcela entra; passe o mouse para ver o valor. Clique num vermelho para marcar a guia como paga. O inquilino paga pelo valor parcelado (mesmo quando você paga à vista com desconto); no mês de entrada ou de saída ele paga os dias em que ocupou e você o resto. Se a prefeitura atrasar o carnê, edite o primeiro mês de cobrança.</p></div>`;
}

/**
 * Calendário do mês no Painel: grade com os dias; em cada dia, os vencimentos e alertas (cor da situação).
 * Clicar no dia abre logo abaixo a agenda completa daquele dia.
 */
export function calendarioDoPainel(mes, hoje) {
  const eventos = R.eventosDoMes(d(), mes, hoje);
  const porDia = new Map();
  for (const e of eventos) { if (!porDia.has(e.data)) porDia.set(e.data, []); porDia.get(e.data).push(e); }
  const destino = (e) => (e.fechamento ? `#/fechamento?mes=${e.fechamento}` : e.cobranca_id ? `#/cobranca/${e.cobranca_id}` : e.tipo === 'Boleto' ? `#/cobrancas?comp=${C.somarMeses(e.data.slice(0, 7), -1)}`
    : e.tipo === 'IPTU' ? `#/imovel/${e.imovel_id}?ir=iptu` : e.tipo === 'Seguro' ? `#/contrato/${e.contrato_id}?ir=seguros` : `#/contrato/${e.contrato_id}`);
  const curto = (e) => `${e.tipo} ${e.texto.split(' · ')[0]}`;
  const [ini] = C.limitesCompetencia(mes);
  const vazios = C.paraData(ini).getUTCDay();
  const celulas = [...Array(vazios)].map(() => '<div class="cal-dia vazio"></div>');
  for (let n = 1; n <= C.diasNoMes(mes); n += 1) {
    const dia = `${mes}-${String(n).padStart(2, '0')}`;
    const evs = porDia.get(dia) || [];
    celulas.push(`<div class="cal-dia ${dia === hoje ? 'hoje' : ''} ${evs.length ? 'com-eventos' : ''}" ${evs.length ? `data-acao="abrirDia" data-dia="${dia}" title="Ver a agenda do dia"` : ''}>
      <div class="cal-num">${n}</div>
      ${evs.slice(0, 7).map((e) => `<div class="cal-ev ${e.situacao}" title="${esc(`${e.tipo}: ${e.texto} (${e.estado})`)}">${esc(curto(e))}</div>`).join('')}
      ${evs.length > 7 ? `<div class="cal-mais">+${evs.length - 7}</div>` : ''}</div>`);
  }
  const semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const agendas = [...porDia].map(([dia, evs]) => `<div class="agenda-dia" data-agenda="${dia}" ${dia === hoje ? '' : 'hidden'}>
      <h3>${dataBr(dia)} · ${semana[C.paraData(dia).getUTCDay()]}${dia === hoje ? ' · hoje' : ''}</h3>
      ${evs.map((e) => `<div class="evento-cal">${etiqueta(e.tipo, 'info')} <a href="${destino(e)}">${esc(e.texto)}</a> ${etiqueta(e.estado, e.situacao)}</div>`).join('')}</div>`).join('');
  return `<div class="cartao" id="calendario"><div class="cabecalho"><h2 style="margin:0">Calendário de ${compBr(mes)}</h2>
      <div class="acoes">${link(`#/?mes=${C.somarMeses(mes, -1)}`, `← ${compBr(C.somarMeses(mes, -1))}`)} ${link('#/', 'Mês atual')} ${link(`#/?mes=${C.somarMeses(mes, 1)}`, `${compBr(C.somarMeses(mes, 1))} →`)}</div></div>
    <div class="cal-grade">${semana.map((s) => `<div class="cal-sem">${s}</div>`).join('')}${celulas.join('')}</div>
    ${agendas || ''}
    <p class="suave">Cada dia mostra até 7 itens (passe o mouse para ler o texto inteiro); clique no dia para ver a agenda completa, com os links. Cores: vermelho vencido, amarelo a fazer, verde feito, cinza previsto ou no boleto do inquilino. Boletos: gerados e previstos pelos contratos; IPTU: pelo vencimento da guia.</p></div>`;
}
