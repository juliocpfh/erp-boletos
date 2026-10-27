// Documentos gerados: impressão, contrato por modelo, vistoria (e o modelo de vistoria), recibo de chaves, termo aditivo,
// modelos de contrato, PDF/Word e logo.
import { bibliotecasPdf, login, podeUsuario } from '../app.js';
import * as S from '../armazenamento.js';
import * as C from '../calculos.js';
import { dataBr } from '../calculos.js';
import * as K from '../contratos.js';
import { faturaHtml } from '../fatura.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import { MODELOS_PADRAO } from '../modelos-contrato.js';
import * as R from '../regras.js';
import { demonstrativo } from './cobrancas.js';
import { botao, buscar, d, link, opera, ordenar, pastaDoEscopo, urls } from './comum.js';
import { botoesReajuste, cartaReajuste } from './reajustes.js';

export async function telaImprimir(rota) {
  const tipo = rota.partes[1];
  // "Baixar PDF" da página: o que está em ``seletor``, com o nome do arquivo
  const voltar = (pdf = null) => `<div class="acoes nao-imprimir" style="margin:12px 0"><button data-acao="imprimir">Imprimir</button>${pdf ? botao('baixarPdfTela', 'Baixar PDF', pdf, 'secundario') : ''}<button class="secundario" data-acao="voltar">Voltar</button></div>`;
  if (tipo === 'carta') {
    const c = buscar('contratos', rota.q.contrato);
    if (!c) return '<p>Inquilino não encontrado.</p>';
    const r = R.reajusteNaCompetencia(d(), c, rota.q.comp);
    const carta = cartaReajuste(c, rota.q.comp);
    // sem o índice, não há carta (só o aviso): sem botão de PDF
    return `<div class="impressao">${voltar(carta.includes('class="carta"') ? { seletor: '.impressao .carta', nome: nomeArquivoDoc('Carta reajuste', c, rota.q.comp || '') } : null)}
      ${r && opera() ? `<div class="acoes nao-imprimir" style="margin-bottom:12px">${botoesReajuste(c, r, true)}</div>` : ''}
      ${carta}</div>`;
  }
  if (['contrato', 'vistoria', 'chaves', 'aditivo'].includes(tipo)) {
    const m = await documentoMontado(tipo, rota.q);
    if (!m) return '<p>Registro não encontrado.</p>';
    const falta = K.pendenciasDoContrato(d(), m.c);
    const volta = tipo === 'contrato' ? `#/contrato-gerar/${m.c.id}?modelo=${m.modelo.id}` : `#/contrato/${m.c.id}?ir=${tipo === 'aditivo' ? 'aditivos' : 'documentos'}`;
    return `<div class="impressao">
      <div class="acoes nao-imprimir" style="margin:12px 0"><button data-acao="imprimir">Imprimir / salvar em PDF</button>${botao('documentoPdf', 'Baixar PDF', {}, 'secundario')}${botao('documentoWord', 'Baixar Word', {}, 'secundario')}
        ${tipo === 'vistoria' && opera() ? link(`#/vistoria/${m.v.id}`, 'Editar a vistoria', 'botao secundario') : ''}
        ${tipo === 'aditivo' && opera() && !m.a.arquivo ? link(`#/aditivo/${m.a.id}`, 'Editar o aditivo', 'botao secundario') : ''}
        <a class="botao secundario" href="${volta}">Voltar</a></div>
      ${falta.length ? `<div class="alerta aviso nao-imprimir"><b>Faltam dados no cadastro:</b> ${falta.map(esc).join('; ')}.</div>` : ''}
      ${tipo === 'vistoria' && m.semSituacao ? `<div class="alerta aviso nao-imprimir">${m.semSituacao} item(ns) do modelo ficaram sem situação e não saem no documento.</div>` : ''}
      ${tipo === 'chaves' && !m.temChaves ? `<div class="alerta aviso nao-imprimir">Sem a relação de chaves: o recibo sai com linhas em branco. Informe as chaves no imóvel (Editar) ou na vistoria de entrada.</div>` : ''}
      ${K.contratoHtml(m.blocos, { logo: d().logo, rodape: m.rodape })}</div>`;
  }
  if (tipo === 'demonstrativos') {
    const ids = rota.q.ids ? new Set(rota.q.ids.split(',').map(Number)) : null;
    const nomeImovel = (cb) => ((buscar('imoveis', (buscar('contratos', cb.contrato_id) || {}).imovel_id) || {}).nome || '');
    const lista = d().cobrancas.filter((x) => x.competencia === rota.q.comp && (!ids || ids.has(x.id)))
      .sort((a, b) => nomeImovel(a).localeCompare(nomeImovel(b), 'pt-BR'));
    const um = lista.length === 1 && buscar('contratos', lista[0].contrato_id);
    const nome = um ? nomeArquivoDoc('Demonstrativo boleto', um, lista[0].competencia) : S.limparNome(`Demonstrativos boletos ${rota.q.comp || ''}`);
    return `<div class="impressao">${voltar(lista.length ? { seletor: '.lista-demonstrativos', nome } : null)}<div class="lista-demonstrativos">${lista.map(demonstrativo).join('') || '<p>Nenhum boleto.</p>'}</div></div>`;
  }
  let fs = d().faturas.filter((f) => f.situacao === 'Emitida');
  const numeros = rota.q.numeros ? new Set(rota.q.numeros.split(',').map(Number)) : null;
  fs = numeros ? fs.filter((f) => numeros.has(f.numero)) : rota.q.numero ? fs.filter((f) => f.numero === Number(rota.q.numero)) : fs.filter((f) => f.emissao.slice(0, 7) === rota.q.mes);
  fs.sort((a, b) => a.numero - b.numero || a.id - b.id);
  return `<div class="impressao">${voltar()}${rota.q.numero && fs.length ? `<p class="nao-imprimir acoes">${fs.map((f) => botao('pdf', `Baixar PDF${fs.length > 1 ? ` (${esc(buscar('emitentes', f.emitente_id).nome)})` : ''}`, { id: f.id }, 'secundario pequeno')).join('')}${botao('excel', 'Baixar este número em Excel', { numero: rota.q.numero })}</p>` : ''}
    ${fs.map((f) => faturaHtml(f, buscar('emitentes', f.emitente_id))).join('') || '<p>Nenhuma NF.</p>'}</div>`;
}

// --------------------------------------------------------------------------
// Contrato de locação gerado a partir de um modelo
// --------------------------------------------------------------------------
/** Testemunhas usadas da última vez (só neste computador). */
function testemunhasLembradas() {
  try { return JSON.parse(localStorage.getItem('testemunhas_contrato')) || {}; } catch { return {}; }
}

function contratoMontado(q) {
  const c = buscar('contratos', q.contrato);
  if (!c) return null;
  const modelos = K.modelosDe(d());
  const modelo = modelos.find((m) => m.id === Number(q.modelo)) || modelos[0];
  const testemunhas = [[q.t1, q.c1], [q.t2, q.c2]].map(([nome, cpf]) => ({ nome: nome || '', cpf: cpf || '' }));
  const dados = K.dadosDoContrato(d(), c, { data: q.data || c.vigencia_inicio || C.hojeIso(), testemunhas });
  return { c, modelo, dados, blocos: K.montarContrato(modelo.texto, dados) };
}

/**
 * PDF A4 do documento que está na tela: a imagem do documento é cortada em folhas, sempre entre um bloco e outro
 * (parágrafo, linha de tabela, foto, assinatura), com o rodapé das empresas e "Página X de Y" embaixo.
 */
export async function pdfDoDocumento(el, rodape = [], { margemLado = 0 } = {}) {
  const { html2canvas, jsPDF } = await bibliotecasPdf();
  const caixa = el.getBoundingClientRect();
  const topo = caixa.top;
  // o link das fotos continua clicável no PDF (área do link na folha certa)
  const links = [...el.querySelectorAll('.ct-link a')].map((a) => { const x = a.getBoundingClientRect(); return { url: a.href, x: x.left - caixa.left, y: x.top - topo, w: x.width, h: x.height }; });
  const cortes = [...el.querySelectorAll('.ct-pagina > * > tr > td > *, .ct-tabela tr, .ct-fotos figure, .ct-grupo-assina, .ct-assina, .demonstrativo, tr, p, li, h2, h3')]
    .map((x) => x.getBoundingClientRect().bottom - topo).sort((a, b) => a - b);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', onclone: (doc) => {
    doc.querySelectorAll('.ct-rodape').forEach((x) => x.remove());
    doc.querySelectorAll('.contrato').forEach((x) => { x.style.border = '0'; x.style.boxShadow = 'none'; });
  } });
  const escala = canvas.width / el.offsetWidth;
  const largura = 210 - 2 * margemLado;
  const pxMm = el.offsetWidth / largura;
  const [margemTopo, margemPe] = [12, 24];
  const alturaFolha = (297 - margemTopo - margemPe) * pxMm;
  const total = el.offsetHeight;
  const fatias = [];
  for (let ini = 0; ini < total - 1;) {
    if (fatias.length && !cortes.some((y) => y > ini + 2)) break; // depois do último bloco só há espaço em branco
    let fim = ini + alturaFolha;
    if (fim >= total) fim = total;
    else fim = cortes.filter((y) => y > ini + alturaFolha * 0.4 && y <= fim).pop() || fim;
    fatias.push([ini, fim]);
    ini = fim;
  }
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  fatias.forEach(([ini, fim], n) => {
    if (n) pdf.addPage();
    const pedaco = document.createElement('canvas');
    pedaco.width = canvas.width;
    pedaco.height = Math.round((fim - ini) * escala);
    pedaco.getContext('2d').drawImage(canvas, 0, Math.round(ini * escala), canvas.width, pedaco.height, 0, 0, canvas.width, pedaco.height);
    pdf.addImage(pedaco.toDataURL('image/jpeg', 0.92), 'JPEG', margemLado, margemTopo, largura, (fim - ini) / pxMm);
    for (const l of links.filter((x) => x.y >= ini && x.y < fim)) pdf.link(margemLado + l.x / pxMm, margemTopo + (l.y - ini) / pxMm, l.w / pxMm, l.h / pxMm, { url: l.url });
    pdf.setFontSize(8).setTextColor(102);
    pdf.text(`Página ${n + 1} de ${fatias.length}`, 190, 297 - margemPe + 6, { align: 'right' });
    pdf.setDrawColor(153).line(20, 297 - margemPe + 8, 190, 297 - margemPe + 8);
    rodape.forEach((linha, k) => pdf.text(linha, 105, 297 - margemPe + 12 + k * 3.5, { align: 'center' }));
  });
  return pdf.output('blob');
}

/** Nome dos arquivos baixados: "Documento Imóvel - Inquilino - ano de entrada" (ex.: "Contrato locação Loja 1 - Maria - 2026"). */
export function nomeArquivoDoc(documento, c, fim = String(c.data_entrada || c.vigencia_inicio || '').slice(0, 4)) {
  const i = buscar('imoveis', c.imovel_id);
  return S.limparNome(`${documento} ${i ? i.nome : 'sem imóvel'} - ${c.inquilino_nome}${fim ? ` - ${fim}` : ''}`);
}

/** Contrato, vistoria ou recibo das chaves, prontos para a tela, o PDF e o Word. */
export async function documentoMontado(tipo, q) {
  if (tipo === 'contrato') {
    const m = contratoMontado(q);
    return m && { ...m, rodape: m.dados.rodape, nome: 'Contrato', arquivo: nomeArquivoDoc('Contrato locação', m.c) };
  }
  if (tipo === 'vistoria') {
    const v = buscar('vistorias', q.id);
    const c = v && buscar('contratos', v.contrato_id);
    if (!c) return null;
    const momento = v.tipo === 'Saída' ? 'Saída do inquilino' : 'Entrada do inquilino';
    const leitura = R.leiturasDo(d(), c.id).find((l) => l.momento === momento) || null;
    const entrada = v.tipo === 'Saída' ? R.vistoriasDo(d(), c.id).find((x) => x.tipo === 'Entrada') : null;
    const fotos = await fotosDaVistoria(v);
    const semSituacao = (v.itens || []).filter((x) => !x.situacao).length;
    const arquivo = nomeArquivoDoc(`Vistoria ${v.tipo.toLocaleLowerCase('pt-BR')}`, c, String(c.data_entrada || v.data || '').slice(0, 4));
    return { c, v, semSituacao, arquivo, ...K.vistoriaBlocos(d(), c, v, leitura, fotos, entrada ? entrada.itens || [] : null), nome: `Vistoria de ${v.tipo.toLocaleLowerCase('pt-BR')}` };
  }
  if (tipo === 'aditivo') {
    const a = buscar('aditivos', q.id);
    const c = a && buscar('contratos', a.contrato_id);
    if (!c || !a.texto) return null;
    const dados = K.dadosDoAditivo(d(), c, a);
    return { c, a, blocos: K.montarContrato(a.texto, dados), rodape: dados.rodape, nome: 'Termo aditivo',
      arquivo: nomeArquivoDoc(`Termo aditivo ${a.numero || 1} vencimento`, c, String(a.data || '').slice(0, 4)) };
  }
  const c = buscar('contratos', q.contrato);
  if (!c) return null;
  const chaves = chavesDoContrato(c);
  return { c, temChaves: !!chaves.trim() || !!(buscar('imoveis', c.imovel_id) || {}).sem_chaves, ...K.reciboChavesBlocos(d(), c, chaves, q.data || ''), nome: 'Recibo de entrega das chaves', arquivo: nomeArquivoDoc('Recibo entrega chaves', c) };
}

/** Chaves do contrato: as da vistoria de entrada; senão, as cadastradas no imóvel. */
function chavesDoContrato(c) {
  const entrada = R.vistoriasDo(d(), c.id).find((v) => v.tipo === 'Entrada');
  return (entrada && entrada.chaves) || ((i) => (i.sem_chaves ? '' : i.chaves))(buscar('imoveis', c.imovel_id) || {}) || '';
}

/** Roteiro por cômodo: o que conferir em cada um (o que ficar sem preencher não sai no documento). */
const ROTEIRO_BASE = ['Piso e rodapé', 'Paredes e teto (pintura, manchas, fissuras, furos)', 'Porta, fechadura e chave', 'Janela, vidros, grade e trinco',
  'Tomadas e interruptores (quantidade e voltagem)', 'Iluminação (luminárias e lâmpadas)'];

const ROTEIROS = {
  Sala: [...ROTEIRO_BASE, 'Cortinas / persianas', 'Móveis e decoração (item, quantidade e estado)'],
  Quarto: [...ROTEIRO_BASE, 'Guarda-roupa / armários (portas, gavetas, trilhos)', 'Cortina / blackout', 'Cama, colchão e roupa de cama', 'Outros móveis e decoração'],
  Cozinha: [...ROTEIRO_BASE, 'Revestimento e rejunte', 'Pia, cuba e torneira', 'Armários (portas e gavetas)', 'Eletrodomésticos (marca, estado e funcionamento)', 'Utensílios (conforme fotos)'],
  Banheiro: [...ROTEIRO_BASE, 'Revestimento e rejunte', 'Vaso sanitário, assento e descarga', 'Pia, gabinete e torneira', 'Box e chuveiro (voltagem / potência)', 'Ducha higiênica',
    'Acessórios (papeleira, porta-toalhas, saboneteira, lixeira)', 'Espelho', 'Exaustor'],
  Lavanderia: [...ROTEIRO_BASE, 'Tanque e torneiras', 'Varal', 'Quadro de disjuntores', 'Máquina de lavar e outros itens'],
  Corredor: ['Piso e rodapé', 'Paredes e teto', 'Portas', 'Iluminação'],
  Escada: ['Piso / degraus', 'Paredes e teto', 'Corrimão', 'Porta de acesso e trancas', 'Iluminação'],
  'Área externa': ['Piso', 'Muros e pintura / textura', 'Tanque e torneiras externas', 'Tomadas externas', 'Iluminação', 'Caixa de gordura / esgoto'],
  Fachada: ['Muros, portão e pintura', 'Beiral, calhas e rufos', 'Telhado', 'Forro externo', 'Grades e janelas', 'Iluminação e tomadas externas', 'Jardim, vasos e outros itens'],
  Garagem: ['Piso', 'Portão eletrônico, controles e motor', 'Vagas (quantidade, marcadas ou não)', 'Iluminação', 'Depósito / outros'],
};

export const roteiroTexto = (comodo) => `## ${comodo}\n${ROTEIROS[comodo].map((x) => `- ${x}: `).join('\n')}\n`;

export function telaVistoria(rota) {
  const id = rota.partes[1];
  const v = id === 'novo' ? null : buscar('vistorias', id);
  if (id !== 'novo' && !v) return '<h1>Vistoria não encontrada</h1>';
  const c = buscar('contratos', v ? v.contrato_id : rota.q.contrato);
  if (!c) return '<h1>Inquilino não encontrado</h1>';
  const tipo = v ? v.tipo : (rota.q.tipo === 'Saída' ? 'Saída' : 'Entrada');
  const i = buscar('imoveis', c.imovel_id) || {};
  const entrada = R.vistoriasDo(d(), c.id).find((x) => x.tipo === 'Entrada');
  // ponto de partida: na saída, a vistoria de entrada deste inquilino; na entrada, a última vistoria do imóvel
  const base = v || (tipo === 'Saída' ? entrada : R.ultimaVistoriaDoImovel(d(), i.id)) || {};
  const valor = (k, padrao = '') => esc(v ? (v[k] ?? '') : (base[k] ?? padrao));
  const data = v ? v.data : (tipo === 'Saída' ? c.data_saida : c.data_entrada) || C.hojeIso();
  // editar o modelo do imóvel no meio da vistoria: ao salvar, volta para cá (o que já foi marcado fica no rascunho)
  const aqui = v ? `#/vistoria/${v.id}` : `#/vistoria/novo?contrato=${c.id}&tipo=${tipo === 'Saída' ? 'Sa%C3%ADda' : 'Entrada'}`;
  const linkModelo = (texto) => (opera() && i.id ? link(`#/modelo-vistoria/${i.id}?voltar=${encodeURIComponent(aqui)}`, texto) : '');
  const grade = gradeVistoria(i, v, base, tipo === 'Saída' ? entrada : null, linkModelo);
  // textos padrão que podem ser trocados: vêm desta vistoria, da anterior do imóvel ou do padrão
  const abertura = (v ? v.texto_abertura : base.texto_abertura) || (v && !v.link_fotos ? K.VISTORIA_ABERTURA_SEM_LINK : K.VISTORIA_ABERTURA);
  const textoFinal = (v ? v.texto_final : base.texto_final) || K.vistoriaFinal((v && v.prazo_dias) || 3);
  return `<p class="suave"><a href="#/contrato/${c.id}?ir=documentos">← ${esc(c.inquilino_nome)}</a></p>
    <h1>Vistoria de ${tipo.toLocaleLowerCase('pt-BR')} · ${esc(i.nome || '')}</h1>
    ${!v && base.id ? `<div class="alerta info">Texto inicial copiado da ${tipo === 'Saída' ? 'vistoria de entrada deste inquilino' : `última vistoria do imóvel (${esc(base.tipo.toLocaleLowerCase('pt-BR'))} de ${dataBr(base.data)})`}. Confira cômodo por cômodo e ajuste o que mudou.</div>` : ''}
    ${tipo === 'Saída' && !grade ? '<div class="alerta aviso">Na saída, compare item por item com a entrada. Onde houver dano ou falta, escreva <b>DIFERENÇA:</b> e o que mudou (ex.: "DIFERENÇA: parede da sala com furos de quadro"). Esses pontos são os que o inquilino paga.</div>' : ''}
    ${grade ? '' : `<div class="alerta info">Este imóvel ainda não tem <b>modelo de vistoria</b>. ${linkModelo('Montar o modelo do imóvel')} Montado uma vez, a vistoria vira só marcar a situação de cada item.</div>`}
    <form class="cartao" data-form="vistoria" data-rascunho="vistoria-${c.id}-${tipo === 'Saída' ? 'saida' : 'entrada'}-${v ? v.id : 'nova'}">
      <input type="hidden" name="id" value="${v ? v.id : ''}"><input type="hidden" name="contrato" value="${c.id}"><input type="hidden" name="tipo" value="${tipo}">
      <div class="formulario">
        <div><label>Data da vistoria</label><input type="date" name="data" value="${esc(data)}" required></div>
        <div><label>Link das fotos (pasta na nuvem)</label><input name="link_fotos" value="${esc(v ? v.link_fotos || '' : (tipo === 'Entrada' ? c.vistoria_link || '' : ''))}" placeholder="deixe vazio se as fotos vão em anexo"></div>
      </div>
      <p><label>Texto de abertura <span class="suave">(o link das fotos sai na linha de baixo)</span></label><textarea name="texto_abertura" rows="3">${esc(abertura)}</textarea></p>
      <p><label>Chaves e controles ${tipo === 'Saída' ? 'devolvidos' : 'que serão entregues'} <span class="suave">(um por linha, com a quantidade)</span></label>
        <textarea name="chaves" rows="5">${v ? esc(v.chaves || '') : (tipo === 'Saída' && entrada ? esc(entrada.chaves || '') : esc(i.sem_chaves ? '' : i.chaves || base.chaves || ''))}</textarea></p>
      ${tipo === 'Entrada' ? '<p class="check"><label><input type="checkbox" name="atualizar_imovel" value="1" checked> Guardar esta relação de chaves também no imóvel (para o recibo e as próximas vistorias)</label></p>' : ''}
      ${grade}
      <h2>Leitura dos relógios ${tipo === 'Saída' ? 'na saída' : 'na entrada'}</h2>
      <p class="suave">Obrigatória: é aqui que se registra a leitura ${tipo === 'Saída' ? 'da saída (o cálculo final usa a mesma)' : 'da entrada'}. Relógio que o contrato diz "Não tem" fica opcional.</p>
      <div class="formulario">${(() => { const lt = R.leituraDo(d(), c.id, tipo === 'Saída' ? 'Saída do inquilino' : 'Entrada do inquilino') || {}; const obrig = R.relogiosDoContrato(c);
    return F.LEITURAS.map(([k, t]) => `<div><label>${esc(t)}${obrig.includes(k) ? ' *' : ''}</label><input name="leitura_${k}" value="${esc(lt[k] || '')}" ${obrig.includes(k) ? 'required' : ''} placeholder="número do relógio"></div>`).join(''); })()}</div>
      <h2>Fotos que vão no documento</h2>
      <p class="suave">A fachada vai na capa; os relógios e o quadro de disjuntores, na página de registros. As fotos gerais e de detalhe continuam no link da nuvem. Enviar outra foto substitui a anterior.</p>
      <div class="formulario">${K.FOTOS_VISTORIA.map(([k, t]) => `<div><label>${esc(t)}</label><input type="file" name="foto_${k}" accept="image/*">${v && v.fotos && v.fotos[k] && opera() ? F.arquivoGuardado(k, v.fotos[k], 'excluirFotoVistoria', { vistoria: v.id }, { escopo: 'contrato', id: v.contrato_id }) : ''}</div>`).join('')}</div>
      <p><label>${grade ? 'Outras observações (opcional)' : 'Descritivo do imóvel'}</label>
        <span class="suave">Uma linha por item. <code>## SALA</code> abre um cômodo; <code>- item: estado</code> vira marcador. Item do roteiro que ficar sem preencher (termina em ":") não sai no documento.
        Use sempre as mesmas palavras para o estado: <b>novo · bom estado · com marcas de uso · com avaria (descrever) · não funciona</b>, e cite o nº da foto quando houver avaria.</span>
        <span class="acoes" style="margin:8px 0">Inserir roteiro: ${Object.keys(ROTEIROS).map((k) => `<button type="button" class="secundario pequeno" data-acao="inserirRoteiro" data-comodo="${esc(k)}">${esc(k)}</button>`).join('')}</span>
        <textarea name="descritivo" class="texto-modelo">${valor('descritivo')}</textarea></p>
      <p><label>Condições gerais</label><textarea name="condicoes" rows="6">${valor('condicoes', K.VISTORIA_CONDICOES)}</textarea></p>
      ${tipo === 'Entrada' ? `<p><label>Texto final <span class="suave">(prazo para o inquilino contestar e devolução do imóvel)</span></label><textarea name="texto_final" rows="4">${esc(textoFinal)}</textarea></p>` : ''}
      <div class="acoes"><button>Salvar e ver o documento</button><a class="botao secundario" href="#/contrato/${c.id}?ir=documentos">Cancelar</a></div></form>`;
}

/** Grade da vistoria pelo modelo do imóvel: situação de cada item, com observação. Vazio se o imóvel não tem modelo. */
function gradeVistoria(i, v, base, entrada, linkModelo = () => '') {
  const chave = (x) => `${x.comodo}|${x.item}`;
  const anteriores = new Map(((v && v.itens) || (entrada ? [] : base.itens) || []).filter((x) => x.situacao !== K.NAO_SE_APLICA).map((x) => [chave(x), x]));
  const naEntrada = new Map(((entrada && entrada.itens) || []).map((x) => [chave(x), x.situacao]));
  const comodos = K.lerModeloVistoria(i.modelo_vistoria);
  // itens já marcados que saíram do modelo continuam aparecendo
  for (const x of anteriores.values()) {
    let g = comodos.find((y) => y.comodo === x.comodo);
    if (!g) comodos.push((g = { comodo: x.comodo, itens: [] }));
    if (!g.itens.includes(x.item)) g.itens.push(x.item);
  }
  if (!comodos.length) return '';
  let k = 0;
  const opcoes = (sel) => `<option value=""></option>${[...K.SITUACOES_VISTORIA, ...(sel && !K.SITUACOES_VISTORIA.includes(sel) ? [sel] : [])].map((o) => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('')}`;
  return `<h2>Situação por cômodo</h2>
    <p class="suave">Marque a situação de cada item. Os botões do cômodo preenchem os itens ainda sem situação; depois mude só o que diverge e anote a observação e o nº da foto.
      "Apagar tudo" limpa o cômodo. "Não se aplica" tira o item da tabela e, ao salvar, também do modelo do imóvel. Item sem situação não sai no documento. O que você marcar fica guardado mesmo se sair para editar o modelo.
      ${entrada ? 'Na saída, o que ficar pior que na entrada sai destacado.' : ''} ${linkModelo('Editar o modelo do imóvel')}</p>
    ${comodos.map((g, ci) => `<div class="vistoria-comodo"><div class="cabecalho"><h3>${esc(g.comodo)}</h3><div class="acoes">
      ${ESTADOS_COMODO.map(([valor, texto]) => botao('vistoriaTudo', texto, { comodo: ci, valor })).join('')}${entrada ? botao('vistoriaTudo', 'Igual à entrada', { comodo: ci, valor: 'entrada' }) : ''}
      ${botao('vistoriaApagar', 'Apagar tudo', { comodo: ci }, 'perigo pequeno')}</div></div>
      <div class="rolagem"><table class="grade-vistoria"><tr><th>Item</th>${entrada ? '<th>Na entrada</th>' : ''}<th>Situação</th><th>Observação / nº da foto</th></tr>
      ${g.itens.map((item) => {
    const n = k++;
    const a = anteriores.get(`${g.comodo}|${item}`) || {};
    const ent = naEntrada.get(`${g.comodo}|${item}`) || '';
    return `<tr><td>${esc(item)}<input type="hidden" name="ic_${n}" value="${esc(g.comodo)}"><input type="hidden" name="ii_${n}" value="${esc(item)}"></td>
      ${entrada ? `<td class="suave">${esc(ent || '—')}</td>` : ''}
      <td><select name="is_${n}" data-comodo="${ci}" data-entrada="${esc(ent)}" class="${K.piorou(ent, a.situacao) ? 'piorou' : ''}">${opcoes(a.situacao)}</select></td>
      <td><input name="io_${n}" data-comodo="${ci}" value="${esc(a.obs || '')}"></td></tr>`;
  }).join('')}</table></div></div>`).join('')}`;
}

/** Botões do cômodo na vistoria: [situação, texto do botão]. */
const ESTADOS_COMODO = [['Novo', 'Estado de novo'], ['Bom', 'Bom estado'], ['Marcas de uso', 'Marcas de uso']];

/** Itens gerais de cada cômodo no modelo de vistoria. Linha terminada em ":" é só um lembrete (não vira item). */
const GERAIS = ['Teto', 'Paredes', 'Piso', 'Janelas', 'Portas', 'Elétrica'];

export const MODELO_COMODOS = {
  Sala: [...GERAIS, 'Móvel:'],
  Quarto: [...GERAIS, 'Móvel:'],
  Suíte: [...GERAIS, 'Móvel:'],
  Cozinha: [...GERAIS, 'Hidráulica', 'Cerâmica / revestimento', 'Armários', 'Eletrodoméstico:'],
  Banheiro: [...GERAIS, 'Hidráulica', 'Cerâmica / revestimento', 'Louças e metais (vaso, pia, torneiras, chuveiro)', 'Box e espelho'],
  Lavanderia: [...GERAIS, 'Hidráulica', 'Cerâmica / revestimento', 'Tanque', 'Eletrodoméstico:'],
  Corredor: ['Teto', 'Paredes', 'Piso', 'Portas', 'Elétrica'],
  Escada: ['Teto', 'Paredes', 'Piso / degraus', 'Corrimão', 'Porta de acesso', 'Elétrica'],
  'Área externa': ['Piso', 'Muros', 'Portão', 'Elétrica', 'Hidráulica'],
  Garagem: ['Piso', 'Portão eletrônico e controles', 'Elétrica'],
  Fachada: ['Muros e pintura', 'Telhado, beiral e calhas', 'Portão', 'Janelas e grades', 'Elétrica externa'],
};

export function telaModeloVistoria(rota) {
  const i = buscar('imoveis', rota.partes[1]);
  if (!i) return '<h1>Imóvel não encontrado</h1>';
  const outros = ordenar(d().imoveis.filter((x) => x.id !== i.id && x.modelo_vistoria), 'nome');
  const resumo = K.lerModeloVistoria(i.modelo_vistoria);
  // aberto pela vistoria: salvar e cancelar voltam para ela
  const voltar = /^#\/vistoria\//.test(rota.q.voltar || '') ? rota.q.voltar : `#/imovel/${i.id}`;
  return `<p class="suave"><a href="${esc(voltar)}">← ${voltar.startsWith('#/vistoria/') ? 'Voltar para a vistoria' : esc(i.nome)}</a></p>
    <h1>Modelo de vistoria · ${esc(i.nome)}</h1>
    <div class="alerta info">Monte uma vez os cômodos deste imóvel e o que verificar em cada um. Na vistoria, você só marca a situação de cada item (novo, bom, marcas de uso, avaria, não se aplica…).</div>
    <form class="cartao" data-form="modeloVistoria"><input type="hidden" name="imovel" value="${i.id}"><input type="hidden" name="voltar" value="${esc(voltar)}">
      <p class="suave">Uma linha por item. <code>## Nome do cômodo</code> abre um cômodo (ex.: <code>## Quarto fundos</code>). Para móveis e eletrodomésticos, um por linha com a descrição
        (ex.: <code>Móvel: sofá 2 lugares cinza</code>, <code>Eletrodoméstico: geladeira Electrolux</code>). Linhas terminadas em ":" são só lembretes e não viram item.</p>
      <div class="acoes" style="margin:8px 0">Inserir cômodo: ${Object.keys(MODELO_COMODOS).map((x) => `<button type="button" class="secundario pequeno" data-acao="inserirComodoModelo" data-comodo="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      ${outros.length ? `<div class="acoes" style="margin:8px 0"><label style="margin:0">Copiar de outro imóvel</label><select name="copiar_de" style="width:auto">${outros.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select>
        <button type="button" class="secundario pequeno" data-acao="copiarModeloVistoria">Copiar</button></div>` : ''}
      <textarea name="modelo" class="texto-modelo">${esc(i.modelo_vistoria || '')}</textarea>
      <p class="suave">${resumo.length ? `Salvo: ${resumo.length} cômodo(s), ${resumo.reduce((t, x) => t + x.itens.length, 0)} itens.` : 'Ainda sem modelo.'}</p>
      <div class="acoes"><button>Salvar modelo</button><a class="botao secundario" href="${esc(voltar)}">Cancelar</a></div></form>`;
}

/** Foto reduzida (até 1600 px, JPEG) para guardar na pasta e pôr no documento. */
export async function reduzirFoto(arquivo) {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82));
}

/** Fotos da vistoria, lidas da pasta do inquilino: { chave: { src, bytes, largura, altura } }. */
async function fotosDaVistoria(v) {
  const out = {};
  if (!v.fotos) return out;
  let dir;
  try { dir = await pastaDoEscopo('contrato', v.contrato_id); } catch { return out; }
  for (const [k, nome] of Object.entries(v.fotos)) {
    try {
      const arq = await (await dir.getFileHandle(nome)).getFile();
      const img = await createImageBitmap(arq);
      const src = URL.createObjectURL(arq);
      urls.push(src);
      out[k] = { src, bytes: new Uint8Array(await arq.arrayBuffer()), largura: img.width, altura: img.height };
    } catch { /* foto apagada da pasta */ }
  }
  return out;
}

export function telaGerarContrato(rota) {
  const c = buscar('contratos', rota.partes[1]);
  if (!c) return '<h1>Inquilino não encontrado</h1>';
  const modelos = K.modelosDe(d());
  const naoRes = c.finalidade === 'Não residencial';
  const sugerido = Number(rota.q.modelo) || (modelos.find((m) => /n[ãa]o residencial|comercial/i.test(m.nome) === naoRes) || modelos[0]).id;
  const t = testemunhasLembradas();
  const falta = K.pendenciasDoContrato(d(), c);
  const garantia = c.garantia_tipo || 'Sem garantia';
  return `<p class="suave"><a href="#/contrato/${c.id}">← ${esc(c.inquilino_nome)}</a></p>
    <h1>Gerar contrato de locação</h1>
    ${falta.length ? `<div class="alerta aviso"><b>Faltam dados no cadastro</b> (o contrato sai com o espaço em branco): ${falta.map(esc).join('; ')}.
      ${opera() ? ` ${link(`#/editar/contratos/${c.id}`, 'Completar o cadastro')}` : ''}</div>` : '<div class="alerta ok">Cadastro completo para o contrato.</div>'}
    <form class="cartao formulario" data-form="gerarContrato">
      <input type="hidden" name="contrato" value="${c.id}">
      <div><label>Modelo</label><select name="modelo">${modelos.map((m) => `<option value="${m.id}" ${m.id === sugerido ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
      <div><label>Data do contrato</label><input type="date" name="data" value="${esc(rota.q.data || c.vigencia_inicio || C.hojeIso())}"></div>
      <div><label>Testemunha 1 (opcional)</label><input name="t1" value="${esc(t.t1 || '')}"></div><div><label>CPF da testemunha 1</label><input name="c1" value="${esc(t.c1 || '')}"></div>
      <div><label>Testemunha 2 (opcional)</label><input name="t2" value="${esc(t.t2 || '')}"></div><div><label>CPF da testemunha 2</label><input name="c2" value="${esc(t.c2 || '')}"></div>
      <div class="check"><button>Ver contrato</button></div></form>
    <div class="cartao"><h2>O que entra automaticamente</h2>
      <p>Finalidade: <b>${esc(c.finalidade || 'Residencial')}</b> · Garantia: <b>${esc(garantia)}</b>${c.solidario_nome ? ' · com locatário solidário' : ''} ·
        Locadoras: <b>${esc(K.dadosDoContrato(d(), c).locadoras.map((e) => e.nome).join(' e '))}</b></p>
      <p class="suave">As partes, valores por extenso, prazo, índice, encargos, garantia e assinaturas vêm do cadastro. Na tela do contrato, use <b>Imprimir / salvar em PDF</b> ou <b>Baixar Word</b> para ajustar algum detalhe antes de assinar.
        Os textos ficam em ${link('#/modelos-contrato', 'Modelos de contrato', '')}.</p></div>`;
}

/** Termo aditivo de troca do dia do vencimento: gerar (escolhendo o modelo) ou alterar o que ainda não foi assinado (com o texto). */
export function telaAditivo(rota) {
  const id = rota.partes[1];
  const a = id === 'novo' ? null : buscar('aditivos', id);
  if (id !== 'novo' && !a) return '<h1>Termo aditivo não encontrado</h1>';
  const c = buscar('contratos', a ? a.contrato_id : rota.q.contrato);
  if (!c) return '<h1>Inquilino não encontrado</h1>';
  if (a && a.arquivo) return `<div class="alerta info">Este termo aditivo já foi assinado e não pode mais ser alterado. <a href="#/contrato/${c.id}?ir=aditivos">Voltar</a></div>`;
  if (!opera()) return '<h1>Sem permissão para gerar termos aditivos</h1>';
  const hoje = C.hojeIso();
  const modelos = K.modelosDe(d(), 'aditivo');
  const diaAtual = a ? a.dia_anterior : (c.dia_vencimento || 10);
  const t = a ? { t1: (a.testemunhas[0] || {}).nome, c1: (a.testemunhas[0] || {}).cpf, t2: (a.testemunhas[1] || {}).nome, c2: (a.testemunhas[1] || {}).cpf } : testemunhasLembradas();
  const falta = K.pendenciasDoContrato(d(), c);
  return `<p class="suave"><a href="#/contrato/${c.id}?ir=aditivos">← ${esc(c.inquilino_nome)}</a></p>
    <h1>${a ? `Termo aditivo nº ${a.numero || 1}: troca do dia do vencimento` : 'Gerar termo aditivo: troca do dia do vencimento'}</h1>
    ${falta.length ? `<div class="alerta aviso"><b>Faltam dados no cadastro</b> (o termo sai com o espaço em branco): ${falta.map(esc).join('; ')}.</div>` : ''}
    <div class="alerta info">Hoje o vencimento é no <b>dia ${diaAtual}</b>. Muda só o dia: o boleto continua se referindo ao mês ${c.cobranca_mes_seguinte !== false ? 'anterior' : 'do vencimento'}, sem cobrança proporcional.
      Este termo não muda o cadastro: depois de assinado, mude o dia do vencimento em "Editar" no inquilino.</div>
    <form class="cartao" data-form="aditivoVencimento">
      <input type="hidden" name="id" value="${a ? a.id : ''}"><input type="hidden" name="contrato" value="${c.id}">
      <div class="formulario">
        <div><label>Data do termo aditivo</label><input type="date" name="data" value="${esc(a ? a.data : hoje)}" required></div>
        <div><label>Novo dia do vencimento</label><input type="number" name="dia_novo" min="1" max="31" value="${esc(a ? a.dia_novo : '')}" required></div>
        <div><label>Mês do 1º vencimento no novo dia</label><input type="month" name="mes" value="${esc(a ? a.primeiro_vencimento.slice(0, 7) : C.somarMeses(C.competenciaDe(hoje), 1))}" required></div>
        ${a ? '' : `<div><label>Modelo</label><select name="modelo">${modelos.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select></div>`}
        <div><label>Testemunha 1 (opcional)</label><input name="t1" value="${esc(t.t1 || '')}"></div><div><label>CPF da testemunha 1</label><input name="c1" value="${esc(t.c1 || '')}"></div>
        <div><label>Testemunha 2 (opcional)</label><input name="t2" value="${esc(t.t2 || '')}"></div><div><label>CPF da testemunha 2</label><input name="c2" value="${esc(t.c2 || '')}"></div>
      </div>
      <p class="suave">Ex.: do dia 10 para o dia 20 a partir de novembro/2026: o aluguel de outubro vence em 20/11/2026, com o valor normal.
        Testemunhas: necessárias na assinatura em papel; na assinatura eletrônica, podem ficar em branco.</p>
      ${a ? `<p><label>Texto deste termo <span class="suave">(muda só este termo; o padrão fica em ${link('#/modelos-contrato', 'Modelos de contrato', '')})</span></label>
        <textarea name="texto" class="texto-modelo" spellcheck="true">${esc(a.texto)}</textarea></p>` : ''}
      <div class="acoes"><button>${a ? 'Salvar e ver o termo' : 'Gerar o termo'}</button><a class="botao secundario" href="#/contrato/${c.id}?ir=aditivos">Cancelar</a></div></form>
    ${a ? AJUDA_MODELO : ''}`;
}

const AJUDA_MODELO = `<details class="cartao"><summary><b>Como escrever um modelo</b></summary>
  <ul>
    <li><code>{campo}</code> coloca um dado do cadastro. Campos: <code>{locadoras} {locatarios} {solidario} {fiadores} {fiadores_imoveis} {inquilino_nome} {objeto} {imovel_nome} {endereco_imovel}
      {finalidade} {atividade} {prazo_meses} {data_inicio} {data_fim} {aluguel_cheio} {aluguel_bonificado} {bonificacao_percentual} {dia_vencimento} {indice}
      {multa} {juros} {tarifa_boleto} {fci_percentual} {fci_indice} {encargos_inquilino} {encargos_inclusos} {caucao_valor} {caucao_meses} {deposito_valor} {deposito_uso} {cidade} {data_assinatura}</code>.</li>
    <li><code>[se condição] texto [senão] outro texto [fim]</code>: o trecho só entra quando a condição vale (o [senão] é opcional; "[se não fiador]" também funciona). Condições:
      <code>fiador caucao deposito seguro_fianca sem_garantia solidario pj residencial nao_residencial bonificacao iptu_inquilino seguro_inquilino tem_incluso tarifa_boleto fci
      area_comum imovel_fiador varios_fiadores varias_locadoras indeterminado testemunhas</code>.</li>
    <li>Só nos termos aditivos de vencimento: <code>{numero_aditivo} {data_contrato} {dia_vencimento_anterior} {dia_vencimento_novo} {primeiro_vencimento} {mes_referencia}</code>
      e a condição <code>mes_seguinte</code> (o boleto se refere ao mês anterior ao do vencimento).</li>
    <li>Singular ou plural: <code>{l:a LOCADORA|as LOCADORAS}</code> (locadoras), <code>{f:o FIADOR|os FIADORES}</code> (fiadores), <code>{s:...|...}</code> (locatários).</li>
    <li><code>CLÁUSULA #</code> numera sozinha. <code>CLÁUSULA #multa</code> dá um nome à cláusula, e <code>{cl:multa}</code> escreve o número dela ("18ª (décima oitava)").
      <code>#i.</code> numera os itens do início.</li>
    <li>Linha começando com <code># </code>: título; <code>## </code>: seção; <code>&gt; </code>: alinhado à direita. <code>**texto**</code>: negrito.
      Uma linha em branco separa os parágrafos. A linha <code>[assinaturas]</code> põe o quadro de assinaturas.</li>
  </ul></details>`;

const TIPOS_MODELO = { contrato: 'Contratos', aditivo: 'Termos aditivos (troca do vencimento)' };

export function telaModelos() {
  const linha = (m, tipo) => `<tr><td><b>${esc(m.nome)}</b>${m.id < 0 || m.padrao ? ` <span class="suave">(padrão)</span>` : ''}</td><td class="n nw">
      ${opera() ? `${link(`#/modelo-contrato/${m.id}`, 'Editar')} ${botao('copiarModelo', 'Copiar', { id: m.id })}` : ''}
      ${opera() && m.padrao && MODELOS_PADRAO.some((x) => x.nome === m.padrao) ? botao('restaurarModelo', 'Voltar ao texto padrão', { id: m.id }, 'secundario pequeno', `Trocar o texto de "${m.nome}" pelo texto padrão? As alterações feitas nele se perdem.`) : ''}
      ${podeUsuario('admin') && m.id > 0 && K.modelosDe(d(), tipo).length > 1 ? botao('excluirModelo', 'Excluir', { id: m.id }, 'perigo pequeno', `Excluir o modelo "${m.nome}"?`) : ''}</td></tr>`;
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p>
    <div class="cabecalho"><h1>Modelos de contrato</h1>${opera() ? `<div class="acoes">${link('#/modelo-contrato/novo', 'Novo modelo de contrato', 'botao')} ${link('#/modelo-contrato/novo?tipo=aditivo', 'Novo modelo de aditivo', 'botao secundario')}</div>` : ''}</div>
    ${Object.entries(TIPOS_MODELO).map(([tipo, titulo]) => `<div class="cartao"><h2>${titulo}</h2><table><tr><th>Modelo</th><th></th></tr>
      ${K.modelosDe(d(), tipo).map((m) => linha(m, tipo)).join('')}</table></div>`).join('')}
    <p class="suave">Para gerar um contrato, abra o inquilino e clique em <b>Gerar contrato</b>; o termo aditivo, em <b>Gerar aditivo de vencimento</b> (em "Termos aditivos").
      Edite à vontade: os modelos ficam guardados no banco de dados.</p>
    ${AJUDA_MODELO}`;
}

export function telaModelo(rota) {
  const id = rota.partes[1];
  const m = id === 'novo' ? { id: '', nome: '', texto: '', tipo: rota.q.tipo === 'aditivo' ? 'aditivo' : 'contrato' }
    : Object.keys(TIPOS_MODELO).flatMap((t) => K.modelosDe(d(), t)).find((x) => String(x.id) === id);
  if (!m) return '<h1>Modelo não encontrado</h1>';
  const aditivo = K.tipoDoModelo(m) === 'aditivo';
  return `<p class="suave"><a href="#/modelos-contrato">← Modelos de contrato</a></p>
    <h1>${m.id === '' ? `Novo modelo de ${aditivo ? 'termo aditivo' : 'contrato'}` : `Modelo: ${esc(m.nome)}`}</h1>
    <form class="cartao" data-form="modeloContrato">
      <input type="hidden" name="id" value="${esc(m.id)}"><input type="hidden" name="tipo" value="${aditivo ? 'aditivo' : 'contrato'}">
      <p><label>Nome do modelo</label><input name="nome" value="${esc(m.nome)}" required></p>
      <p><label>Texto</label><textarea name="texto" class="texto-modelo" spellcheck="true">${esc(m.texto)}</textarea></p>
      <div class="acoes"><button>Salvar</button><a class="botao secundario" href="#/modelos-contrato">Cancelar</a></div></form>
    ${AJUDA_MODELO}`;
}

/**
 * Na primeira alteração de um tipo (contrato ou aditivo), os modelos padrão desse tipo passam a ficar no banco (e podem ser editados).
 * Devolve o id real.
 */
export function modelosNoBanco(db, id, tipo = 'contrato') {
  const p = id < 0 ? MODELOS_PADRAO[-id - 1] : null;
  const t = p ? K.tipoDoModelo(p) : tipo;
  if (!db.modelos_contrato.some((m) => K.tipoDoModelo(m) === t)) {
    for (const x of MODELOS_PADRAO.filter((y) => K.tipoDoModelo(y) === t)) {
      R.inserir(db, 'modelos_contrato', { nome: x.nome, texto: x.texto, padrao: x.nome, ...(x.tipo ? { tipo: x.tipo } : {}) }, login(), `Modelo "${x.nome}" (padrão)`);
    }
  }
  if (p) {
    const m = db.modelos_contrato.find((x) => x.padrao === p.nome);
    return m ? m.id : null;
  }
  return id;
}

/** Logo do banco (data URL) → PNG em bytes e tamanho, para o Word. */
export async function logoPng() {
  if (!d().logo) return null;
  const img = new Image();
  img.src = d().logo;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext('2d');
  g.drawImage(img, 0, 0);
  const png = async () => new Uint8Array(await (await new Promise((ok) => canvas.toBlob(ok, 'image/png'))).arrayBuffer());
  const bytes = await png();
  // marca-d'água: a mesma logo quase transparente (5%), para ficar suave em qualquer leitor de Word
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.globalAlpha = 0.05;
  g.drawImage(img, 0, 0);
  return { bytes, marca: await png(), largura: canvas.width, altura: canvas.height };
}
