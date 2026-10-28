// ACOES: o que cada botão faz (data-acao="nome"), com os auxiliares de PDF, Excel, exclusão (TABELAS_EXCLUSAO) e reajuste.
import { alterar, aviso, backupCompletoSeguro, baixar, bibliotecasPdf, conectarSeguro, E, escolherPasta, excelJs, ir, janela, jsZip, login, mostrar, naFilaSegura, pastaSeguraDeTeste, podeUsuario, reabrirPastaLembrada, sair } from '../app.js';
import * as S from '../armazenamento.js';
import { PAPEIS } from '../auth.js';
import * as B from '../backup-seguro.js';
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import * as K from '../contratos.js';
import { pdfDeTudo, planilhaDeTudo } from '../exportar.js';
import { faturaExcel, faturaHtml } from '../fatura.js';
import { dinheiroTexto, esc } from '../formularios.js';
import { MODELOS_PADRAO } from '../modelos-contrato.js';
import * as R from '../regras.js';
import { REGRAS_TEXTO } from '../regras-texto.js';
import { desfazerItens } from './admin.js';
import { ANEXOS_COM_X, CADASTROS, nomeComprovante } from './cadastros.js';
import { CAMPOS_PESSOA_FORM, guardarRascunhoVistoria, indicesMensaisFci } from './campos.js';
import { alterarApagandoAnexos, anexosEmUso, apagarAnexos, arquivoApagadoNoFormulario, buscar, chavePasta, conferirArquivos, d, ehMatricula, extensao, memoria, nomePastaContrato, opera, ordenar, pastaDoEscopo, pastaPaiContrato, salvarAssinado, semAcentoArquivo, vinculoDoEscopo } from './comum.js';
import { documentoMontado, guardarCartaNaPasta, logoPng, MODELO_COMODOS, modelosNoBanco, pdfDoDocumento, roteiroTexto } from './documentos.js';
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

async function excelDoNumero(ExcelJS, modelo, numero) {
  const fs = E.d.faturas.filter((f) => f.numero === Number(numero) && f.situacao === 'Emitida').sort((a, b) => a.id - b.id);
  if (!fs.length) throw new Error('NF não encontrada.');
  const blob = await faturaExcel(ExcelJS, modelo, fs, E.d.emitentes);
  return { blob, nome: S.limparNome(`NF ${R.numeroFatura(numero)} - ${fs[0].tomador_nome}.xlsx`) };
}

const TABELAS_EXCLUSAO = {
  imoveis: { admin: true, checar: (db, r) => (db.contratos.some((c) => c.imovel_id === r.id) ? 'Este imóvel tem inquilinos. Exclua os contratos antes.' : null), voltar: () => '#/imoveis' },
  contratos: { admin: true, checar: (db, r) => (db.cobrancas.some((cb) => cb.contrato_id === r.id && R.faturasDe(db, 'cobranca', cb.id, false).length) ? 'Este contrato tem NFs emitidas e não pode ser excluído.' : null), voltar: (r) => (r.imovel_id ? `#/imovel/${r.imovel_id}` : '#/inquilinos') },
  cobrancas: { checar: (db, r) => (R.faturasDe(db, 'cobranca', r.id, false).length ? 'Este boleto tem NF. Desfaça o pagamento antes.' : null), voltar: (r) => `#/cobrancas?comp=${r.competencia}` },
  correcoes: { recalcular: (db, r) => (cb) => cb.contrato_id === r.contrato_id },
  iptus: { recalcular: (db, r) => (cb) => (R.buscar(db, 'contratos', cb.contrato_id) || {}).imovel_id === r.imovel_id },
  seguros: { recalcular: (db, r) => (cb) => cb.contrato_id === r.contrato_id },
  avulsas: { checar: (db, r) => (R.faturasDe(db, 'avulsa', r.id).length ? 'Esta NF avulsa já tem número.' : null) },
  encerramentos: { admin: true },
  vistorias: { admin: true, voltar: (r) => `#/contrato/${r.contrato_id}?ir=documentos` },
  aditivos: { depois: (db, r) => R.marcarAditivos(db, r.contrato_id, login()), voltar: (r) => `#/contrato/${r.contrato_id}?ir=aditivos` },
  fiadores: { voltar: (r) => `#/contrato/${r.contrato_id}?ir=garantia` },
  depositos_garantia: { depois: (db, r) => (r.complementar ? null : R.acertarGarantiaDepositada(db, r.contrato_id, r.qual, login())), voltar: (r) => `#/contrato/${r.contrato_id}?ir=garantia` },
  despesas: {},
  ressarcimentos: {
    checar: (db, r) => ((R.boletoDoMes(db, r.contrato_id, r.competencia_abatimento) || {}).data_pagamento
      ? 'Este ressarcimento já foi abatido num boleto pago. Desfaça o pagamento antes.' : null),
    depois: (db, r) => R.aplicarRessarcimentos(db, R.buscar(db, 'contratos', r.contrato_id), r.competencia_abatimento, login()),
    voltar: (r) => `#/contrato/${r.contrato_id}?ir=ressarcimentos`,
  },
};

/** Redesenha o formulário aberto mantendo o que já foi digitado (depois de editar uma lista de opções). */
async function redesenharFormulario(el, ajustes, lista) {
  const form = el.closest('form');
  const valores = { ...Object.fromEntries(new FormData(form)), ...ajustes };
  await mostrar({ valores, erros: {} });
  const editor = document.querySelector(`[data-editor="${lista}"]`);
  if (editor) editor.hidden = false;
}

const numerosSelecionados = () => {
  const ns = [...document.querySelectorAll('input[data-nf]:checked')].map((x) => Number(x.dataset.nf));
  if (!ns.length) throw new Error('Marque pelo menos uma NF na lista.');
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
  if (!fs.length) throw new Error('Nenhuma NF para exportar.');
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
async function mudarContrato(id, fn) {
  const antigo = { ...buscar('contratos', id) };
  await alterar((db) => {
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
  const resta = R.reajustesAbertos(d()).find((r) => r.contrato.id === contratoId && !r.corrigido && r.competencia <= C.competenciaDe(C.hojeIso()));
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
  if (s && tipo === 'apolice' && s.arquivo_apolice) throw new Error(`A apólice da vigência ${dataBr(s.vigencia_inicio)} a ${dataBr(s.vigencia_fim)} já tem arquivo: apague o atual (×) antes de anexar outro. Nada foi anexado.`);
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
  return [caminho.split('/')[1], Object.fromEntries(new URLSearchParams(consulta || ''))];
}

/** Contrato ou termo das chaves baixado ou impresso: marca "gerar" na rotina de entrada do inquilino (uma vez, com a data de hoje). */
async function marcarGeradoNaRotina(tipo, m) {
  const chave = { contrato: 'contrato_gerado', chaves: 'chaves_gerado' }[tipo];
  if (!chave || !m || !m.c || !opera() || (m.c.rotina_entrada || {})[chave]) return;
  await alterar((db) => R.marcarGeradoNaRotina(db, m.c.id, chave, login()));
}

export const ACOES = {
  escolherPasta: () => escolherPasta(),
  reabrir: () => reabrirPastaLembrada(),
  sair: () => sair(),
  async imprimir() {
    window.print();
    if (!/^#\/imprimir\/(contrato|chaves)\b/.test(location.hash)) return;
    const [tipo, q] = documentoDaTela();
    await marcarGeradoNaRotina(tipo, await documentoMontado(tipo, q));
  },

  async documentoWord() {
    const [tipo, q] = documentoDaTela();
    const m = await documentoMontado(tipo, q);
    if (!m) throw new Error('Registro não encontrado.');
    await marcarGeradoNaRotina(tipo, m);
    const [JSZip, logo] = await Promise.all([jsZip(), logoPng()]);
    const i = buscar('imoveis', m.c.imovel_id);
    const blob = await K.contratoDocx(JSZip, m.blocos, { logo, rodape: m.rodape, titulo: `${m.nome} - ${m.c.inquilino_nome}` });
    baixar(blob, `${m.arquivo || `${m.nome} - ${m.c.inquilino_nome}${i ? ` - ${i.nome}` : ''}`}.docx`.replace(/[\\/:*?"<>|]/g, '-'));
  },

  /** PDF de um trecho da página (carta de reajuste, demonstrativo do boleto), com margens e "Página X de Y". */
  async baixarPdfTela({ seletor, nome }) {
    const el = document.querySelector(seletor);
    if (!el) throw new Error('Documento não encontrado.');
    aviso('Gerando o PDF…', 'info');
    baixar(await pdfDoDocumento(el, [], { margemLado: 15 }), `${nome || 'Documento'}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
  },

  /** PDF do documento que está na tela (contrato, vistoria, recibo das chaves), com o rodapé e "Página X de Y" em todas as folhas. */
  async documentoPdf() {
    const [tipo, q] = documentoDaTela();
    const m = await documentoMontado(tipo, q);
    const el = document.querySelector('.impressao .contrato');
    if (!m || !el) throw new Error('Documento não encontrado.');
    await marcarGeradoNaRotina(tipo, m);
    const blob = await pdfDoDocumento(el, m.rodape);
    baixar(blob, `${m.arquivo || `${m.nome} - ${m.c.inquilino_nome}`}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
  },

  async escolherPastaSegura() {
    if (!podeUsuario('admin')) throw new Error('Só o administrador configura o backup seguro.');
    try {
      E.pastaSeguraNova = E.teste ? await pastaSeguraDeTeste() : await window.showDirectoryPicker({ id: 'backup-seguro', mode: 'readwrite' });
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw e;
    }
    if (E.pasta && (await E.pasta.isSameEntry(E.pastaSeguraNova))) {
      E.pastaSeguraNova = null;
      throw new Error('Escolha uma pasta diferente da pasta dos dados.');
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

  async backupCompletoAgora() {
    aviso('Gravando o backup completo…', 'info');
    await backupCompletoSeguro();
    if (E.seguroErro) throw new Error(E.seguroErro);
    aviso('Backup completo gravado na pasta segura.');
    await mostrar();
  },

  async desconectarSeguro() {
    await S.esquecerPastaSegura();
    E.seguro = null;
    aviso('Backup seguro desligado neste computador.');
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

  copiarModeloVistoria() {
    const sel = document.querySelector('select[name=copiar_de]');
    const t = document.querySelector('textarea[name=modelo]');
    const outro = buscar('imoveis', sel.value);
    if (t.value.trim() && !confirm('Substituir o texto atual pelo modelo do outro imóvel?')) return;
    t.value = outro.modelo_vistoria || '';
  },

  /** Contas pagas por nós: preenche cada valor vazio com o último lançado. */
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

  async ressarcimentoNaNf({ valor }) {
    if (!podeUsuario('admin')) throw new Error('Só administradores mudam esta opção.');
    await alterar((db) => {
      db.ressarcimento_abate_nf = valor === '1';
      R.registrar(db, login(), 'Alteração', 'banco', null, `Ressarcimento de condomínio ${valor === '1' ? 'abate o valor da NF' : 'não abate a NF (conta como gasto)'}`, null, {}, false);
      // boletos em aberto com ressarcimento passam a seguir a opção nova
      for (const cb of db.cobrancas.filter((x) => !x.data_pagamento && x.ressarcimento > 0)) R.atualizar(db, 'cobrancas', cb.id, { ressarcimento_na_nf: valor === '1' }, login(), 'Ressarcimento na NF');
    });
    await mostrar();
  },

  async condominioConferido({ id, mes }) {
    await alterar((db) => R.marcarCondominioConferido(db, Number(id), mes, login()));
    await mostrar();
  },

  async estilosAlertasPadrao() {
    await alterar((db) => R.salvarEstilosAlertas(db, {}, login()));
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
    if (!data) throw new Error('Informe a data.');
    if (!arquivo) throw new Error(`Anexe o arquivo de "${doc[1]}" (mesmo sem todas as assinaturas) antes de clicar em "Falta assinatura".`);
    const partes = R.partesDoContrato(d(), buscar('contratos', contrato));
    const r = await janela({ titulo: `De quem falta a assinatura? (${doc[1]})`,
      html: `<p class="suave">Só aparecem as pessoas e empresas cadastradas neste contrato. Marque todas que faltam.</p>
        ${partes.map((p) => `<label class="check"><input type="checkbox" name="falta" value="${esc(R.textoParte(p))}"> <b>${esc(p.nome)}</b> <span class="suave">(${esc(p.papel)})</span></label>`).join('')}`,
      sim: 'Anexar com assinatura faltante' });
    if (!r) return;
    if (!r.falta || !r.falta.length) throw new Error('Marque de quem falta a assinatura. Nada foi salvo.');
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
    if (!podeUsuario('admin')) throw new Error('Só o administrador analisa.');
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
    const nome = await S.salvarArquivo(await pastaDoEscopo('contrato', Number(contrato)), new File([arq], nomeComprovante(tipo, data, arq)));
    await alterar((db) => R.anexarComprovante(db, tabela, Number(id), campo, nome, login()));
    aviso('Comprovante anexado.');
    await mostrar();
  },

  /** Histórico (administrador): desfaz uma alteração ou as marcadas, recalculando os boletos em aberto quando for o caso. */
  async desfazerAlteracao({ itens }) {
    await desfazerItens(String(itens).split(','));
  },

  async desfazerMarcados() {
    const itens = [...document.querySelectorAll('input[data-desfazer]:checked')].map((x) => x.value);
    if (!itens.length) throw new Error('Marque as alterações que quer desfazer.');
    if (!confirm(`Desfazer ${itens.length} alteração(ões) marcada(s)? Cada campo volta ao valor anterior.`)) return;
    await desfazerItens(itens);
  },

  /**
   * "Excluir" do arquivo já guardado num formulário de edição (#/editar/tabela/id): tira do registro e apaga da pasta.
   * A página não é redesenhada: o que já foi digitado no formulário continua lá (ao salvar, o registro é lido de novo).
   */
  async excluirAnexoDoCampo({ campo }, el) {
    if (!opera()) throw new Error('Seu usuário não pode excluir arquivos.');
    const [, acao, tabela, id] = location.hash.split('?')[0].split('/');
    const r = acao === 'editar' ? buscar(tabela, id) : null;
    if (!r || !r[campo]) throw new Error('Arquivo não encontrado neste registro.');
    // comprovante de depósito, correção, aplicação ou reserva: as mesmas contas do "×" da página do inquilino
    await alterarApagandoAnexos((db) => ((ANEXOS_COM_X[tabela] || []).includes(campo) ? R.removerAnexo(db, tabela, r.id, campo, login())
      : R.atualizar(db, tabela, r.id, { [campo]: null }, login(), `Arquivo excluído: ${r[campo]}`)));
    arquivoApagadoNoFormulario(el, r[campo]);
  },

  /** Nome do arquivo já guardado num formulário de edição (#/editar/tabela/id): abre o arquivo (na pasta do inquilino; o seguro, na subpasta das apólices). */
  async abrirAnexoDoCampo({ campo }) {
    const [, , tabela, id] = location.hash.split('?')[0].split('/');
    const r = buscar(tabela, id);
    if (!r || !r[campo]) throw new Error('Arquivo não encontrado neste registro.');
    const [escopo, dono] = tabela === 'seguros' ? ['seguro', r.contrato_id] : tabela === 'contratos' ? ['contrato', r[`${campo}_contrato`] || r.id] : ['contrato', r.contrato_id];
    await ACOES.abrirArquivo({ escopo, id: dono, nome: r[campo] });
  },

  /** "Excluir" de uma foto já guardada da vistoria (fachada, relógios, quadro de disjuntores). */
  async excluirFotoVistoria({ campo, vistoria }, el) {
    if (!opera()) throw new Error('Seu usuário não pode excluir arquivos.');
    const v = buscar('vistorias', vistoria);
    if (!v || !(v.fotos || {})[campo]) throw new Error('Foto não encontrada.');
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

  async removerComprovanteGarantia({ contrato, qual }) {
    await alterarApagandoAnexos((db) => R.removerComprovanteGarantia(db, Number(contrato), qual, login()));
    aviso('Comprovante removido: anexe o certo em "Incluir … e anexar comprovante".');
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

  /** "×" no arquivo do termo aditivo: o termo volta a "aguardando assinatura". */
  async removerArquivoAditivo({ id }) {
    await alterarApagandoAnexos((db) => R.removerArquivoAditivo(db, Number(id), login()));
    aviso('Arquivo apagado: o termo aditivo voltou a "aguardando assinatura".');
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
    if (!podeUsuario('admin')) throw new Error('Só administradores podem excluir modelos.');
    await alterar((db) => {
      const m = R.buscar(db, 'modelos_contrato', Number(id));
      if (m) R.excluir(db, 'modelos_contrato', m.id, login(), `Modelo de contrato "${m.nome}" excluído`);
    });
    await mostrar();
  },
  voltar: () => history.back(),

  async excluir({ tabela, id }) {
    const cfg = TABELAS_EXCLUSAO[tabela] || {};
    if (cfg.admin && !podeUsuario('admin')) throw new Error('Só administradores podem excluir.');
    const r = buscar(tabela, id);
    const destino = cfg.voltar ? cfg.voltar(r) : null;
    // lançamento com anexo (aditivo, comprovante, apólice, fotos da vistoria): o arquivo sai junto. Contrato e imóvel guardam a pasta.
    await (['contratos', 'imoveis'].includes(tabela) ? alterar : alterarApagandoAnexos)((db) => {
      const reg = R.buscar(db, tabela, id);
      const problema = cfg.checar ? cfg.checar(db, reg) : null;
      if (problema) throw new Error(problema);
      if (tabela === 'imoveis') {
        for (const t of ['participacoes', 'seguros', 'leituras', 'reformas', 'iptus', 'titularidades', 'despesas', 'vistorias']) db[t].filter((p) => p.imovel_id === reg.id).forEach((p) => R.excluir(db, t, p.id, login()));
      }
      if (tabela === 'contratos') R.excluirContrato(db, reg.id, login());
      else R.excluir(db, tabela, reg.id, login(), reg.nome || reg.descricao || null);
      if (cfg.recalcular) R.recalcularCobrancas(db, cfg.recalcular(db, reg), login());
      if (cfg.depois) cfg.depois(db, reg);
    });
    // contrato excluído: a pasta dele sai junto se estiver vazia (pasta com documentos fica guardada)
    if (tabela === 'contratos') {
      try { await S.apagarPastaVazia(await S.subpasta(await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS), pastaPaiContrato(r), false), r.pasta || nomePastaContrato(r)); } catch { /* pasta nem existia */ }
    }
    aviso('Excluído.');
    if (destino) ir(destino); else await mostrar();
  },

  /** Arquivos que sobraram de lançamentos excluídos antes (comprovantes, fotos da vistoria, assinados, aditivos): lista e apaga. */
  async limparAnexosSoltos() {
    if (!podeUsuario('admin')) throw new Error('Só o administrador apaga arquivos sem lançamento.');
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
    if (!soltos.length) { aviso('Nenhum arquivo sobrando: todos os anexos têm lançamento.', 'info'); return; }
    const ok = await janela({ titulo: `${soltos.length} arquivo(s) sem lançamento`, forte: true,
      html: `<p>Estes arquivos ficaram na pasta depois que o lançamento foi excluído. Serão <b>apagados de vez</b>:</p>
        <ul style="max-height:300px;overflow:auto">${soltos.map((a) => `<li>${esc(a.quem)}: ${esc(a.nome)}</li>`).join('')}</ul>`,
      sim: `Apagar ${soltos.length} arquivo(s)`, nao: 'Cancelar' });
    if (!ok) return;
    const n = await apagarAnexos(soltos, 'Arquivo sem lançamento apagado na limpeza');
    aviso(`${n} arquivo(s) apagado(s).`);
    await mostrar();
  },

  async removerLogo() {
    if (!podeUsuario('admin')) throw new Error('Só administradores podem alterar a logo.');
    await alterar((db) => {
      R.registrar(db, login(), 'Exclusão', null, null, 'Logo da empresa removida');
      delete db.logo;
    });
    await mostrar();
  },

  async tirarAjuste({ id }) {
    if (!opera()) throw new Error('Seu usuário não pode alterar.');
    await alterar((db) => R.ajustarBoleto(db, Number(id), 0, '', login()));
    await mostrar();
  },

  /** FCI: traz do Banco Central os índices de cada mês desde o primeiro pagamento e guarda no contrato (o saldo corrigido sai deles). */
  async calcularFci({ id }) {
    if (!opera()) throw new Error('Seu usuário não pode alterar.');
    const c = buscar('contratos', id);
    if (!c.fci_indice) throw new Error('Escolha antes o índice de correção do FCI em "Editar" (O que está incluso no contrato).');
    const deps = R.depositosFci(d(), c);
    if (!deps.length) throw new Error('Ainda não há pagamento do FCI para corrigir.');
    const de = C.somarMeses(deps[0].data.slice(0, 7), 1);
    const ate = C.competenciaDe(C.hojeIso());
    if (de > ate) { aviso('Os pagamentos são deste mês: a correção começa no mês que vem.', 'info'); return; }
    const indices = await indicesMensaisFci(c.fci_indice, de, ate);
    if (!Object.keys(indices).length) throw new Error(`O ${c.fci_indice} de ${compBr(de)} em diante ainda não saiu no Banco Central.`);
    await alterar((db) => R.atualizar(db, 'contratos', c.id, { fci_indices: indices, fci_calculado_em: C.hojeIso() }, login(),
      `FCI corrigido pelo ${c.fci_indice} (Banco Central): ${reais(R.saldoFci(db, R.buscar(db, 'contratos', c.id), indices).corrigido)}`));
    const s = R.saldoFci(d(), buscar('contratos', id));
    aviso(`FCI: pago ${reais(s.total)}, corrigido ${reais(s.corrigido)}${s.ate ? ` (índices até ${compBr(s.ate)})` : ''}.`, 'info');
    await mostrar();
  },

  /** Grava os depósitos do FCI de antes do sistema (caixa do FCI); a correção antiga fica para refazer no "Calcular atualização". */
  async salvarFciPrevios({ id }, el) {
    if (!opera()) throw new Error('Seu usuário não pode alterar.');
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
    if (!opera()) throw new Error('Seu usuário não pode alterar.');
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
    const r = await janela({ titulo: `Data de saída - ${c.inquilino_nome}`, sim: 'Salvar', nao: 'Cancelar',
      html: `<p>Dia em que o inquilino sai (devolve as chaves). O boleto do último mês sai proporcional aos dias. O cálculo final vem depois.</p>
        <label>Data de saída</label><input type="date" name="data" value="${esc(c.data_saida || C.hojeIso())}" required>` });
    if (!r) return;
    const data = String((r.data || [])[0] || '');
    await mudarContrato(c.id, (db) => R.informarSaida(db, c.id, data, login()));
    aviso(`Saída em ${dataBr(data)}. Depois que ele sair: vistoria de saída e cálculo final.`);
    await mostrar();
  },

  async desfazerSaida({ id }) {
    await mudarContrato(Number(id), (db) => R.desfazerSaida(db, Number(id), login()));
    aviso('Inquilino ativo de novo (sem data de saída).');
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
    await navigator.clipboard.writeText(texto);
    const antes = el.textContent;
    el.textContent = 'Copiado ✓';
    setTimeout(() => { el.textContent = antes; }, 1500);
  },

  async cancelarAvulsa({ id }) {
    await alterar((db) => R.cancelarFaturas(db, 'avulsa', Number(id), login()));
    aviso('NF cancelada. O número não será reaproveitado.');
    await mostrar();
  },

  async gerarCobrancas({ comp }) {
    const r = await alterar((db) => R.gerarCobrancas(db, comp, login()));
    aviso(`${r.geradas} boleto(s) gerado(s) para ${compBr(comp)}.`);
    await mostrar();
  },

  async estornar({ id }) {
    await alterar((db) => R.estornarPagamento(db, Number(id), login()));
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
      R.atualizar(db, 'cobrancas', Number(id), { editado_manual: false }, login(), 'Boleto volta a ser calculado pelo cadastro');
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
    if (!f) throw new Error('Fiador não encontrado.');
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

  async iptuPago({ id, n, data }) {
    await alterar((db) => R.marcarIptuPago(db, Number(id), Number(n), data || null, login()));
    await mostrar();
  },

  /** Quadradinho vermelho na tela IPTU do ano: pergunta a data e marca a guia como paga. */
  async iptuPagoRapido({ id, n, texto }) {
    const r = await janela({ titulo: 'Marcar a guia do IPTU como paga', sim: 'Marcar como paga', nao: 'Cancelar',
      html: `<p>${esc(texto)}</p><label>Pago em</label><input type="date" name="data" value="${C.hojeIso()}" required>` });
    if (!r) return;
    const data = String((r.data || [])[0] || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data do pagamento.');
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
    const sel = el.closest('[data-editor]').parentElement.querySelector('select');
    await redesenharFormulario(el, sel ? { [sel.name]: valor } : {}, lista);
    aviso(`"${valor}" incluído na lista.`);
  },

  async removerDaLista({ lista, valor }, el) {
    if (!confirm(`Remover "${valor}" da lista?`)) return;
    try {
      await alterar((db) => R.removerDaLista(db, lista, valor, login()));
    } catch (e) {
      window.alert(e.message);
      return;
    }
    await redesenharFormulario(el, {}, lista);
  },

  async desfazerUltimaNumeracao() {
    const ciclo = await alterar((db) => R.desfazerUltimaNumeracao(db, login()));
    aviso(`Numeração nº ${R.numeroFatura(ciclo.de)} a ${R.numeroFatura(ciclo.ate)} desfeita. Corrija o que precisar, inclua o que faltou e clique em "Numerar estas NFs".`);
    await mostrar();
  },

  async cancelarNumero({ numero }) {
    await alterar((db) => R.cancelarNumero(db, Number(numero), login()));
    aviso(`NF nº ${R.numeroFatura(numero)} cancelada. O pagamento voltou para a fila: corrija se precisar e numere de novo.`);
    await mostrar();
  },

  async apagarCanceladas({ numero }) {
    if (!podeUsuario('admin')) throw new Error('Só administradores podem apagar NFs.');
    await alterar((db) => R.apagarCanceladas(db, Number(numero), login()));
    aviso(`NF nº ${R.numeroFatura(numero)} apagada da lista.`);
    await mostrar();
  },

  async aplicarReajuste({ contrato, comp }) {
    await aplicarReajusteNaTela(Number(contrato), comp);
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
        <label>Data do depósito</label><input type="date" name="data" value="${C.hojeIso()}" required>
        <label>Comprovante (opcional)</label><input type="file" name="arquivo" accept="application/pdf,image/*">
        <p class="suave">Sem o comprovante, fica o aviso "anexar" até ele chegar.</p>` });
    if (!r) return;
    const data = String((r.data || [])[0] || '');
    const arq = (r.arquivo || [])[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data do depósito.');
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
    if (!ids.length) throw new Error('Marque pelo menos um imóvel na lista (ou "selecionar todos").');
    ir(`#/imprimir/demonstrativos?comp=${comp}&ids=${ids.join(',')}`);
  },

  /** Exclui os boletos marcados na lista. Pagos não saem: desfaça o pagamento antes (com NF, cancele a NF antes). */
  async excluirBoletosSelecionados({ comp }) {
    const ids = [...document.querySelectorAll('input[data-boleto]:checked')].map((x) => Number(x.dataset.boleto));
    if (!ids.length) throw new Error('Marque pelo menos um boleto na lista (ou "selecionar todos").');
    const nome = (cb) => { const c = buscar('contratos', cb.contrato_id); return c ? c.inquilino_nome : `boleto ${cb.id}`; };
    const pagos = ids.map((id) => buscar('cobrancas', id)).filter((cb) => cb && cb.data_pagamento);
    if (pagos.length) throw new Error(`Boleto(s) já pago(s) não podem ser excluídos: ${pagos.map(nome).join(', ')}. Desmarque ou desfaça o pagamento antes.`);
    if (!confirm(`Excluir ${ids.length} boleto(s) de ${compBr(comp)}? Eles podem ser gerados de novo depois.`)) return;
    await alterar((db) => {
      for (const id of ids) {
        const cb = R.buscar(db, 'cobrancas', id);
        const problema = TABELAS_EXCLUSAO.cobrancas.checar(db, cb);
        if (problema) throw new Error(`${nome(cb)}: ${problema}`);
        R.excluir(db, 'cobrancas', id, login(), `Boleto de ${compBr(cb.competencia)} - ${nome(cb)} (exclusão em lote)`);
      }
    });
    aviso(`${ids.length} boleto(s) excluído(s).`);
    await mostrar();
  },

  imprimirSelecionadas() {
    const ns = numerosSelecionados();
    ir(`#/imprimir/faturas?numeros=${ns.join(',')}`);
  },

  async pdf({ id }) {
    const f = buscar('faturas', id);
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
    if (!podeUsuario('admin')) throw new Error('Só administradores aprovam acessos.');
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
    if (!podeUsuario('admin')) throw new Error('Só administradores recusam acessos.');
    await alterar((db) => R.excluir(db, 'usuarios', Number(id), login(), 'Pedido de acesso recusado'));
    await mostrar();
  },

  async bloquearUsuario({ id }) {
    if (!podeUsuario('admin')) throw new Error('Só administradores bloqueiam usuários.');
    if (Number(id) === E.usuario.id) throw new Error('Você não pode bloquear o seu próprio acesso.');
    await alterar((db) => {
      const u = R.buscar(db, 'usuarios', id);
      R.atualizar(db, 'usuarios', u.id, { ativo: !u.ativo }, login(), u.ativo ? `Usuário ${u.login} bloqueado` : `Usuário ${u.login} desbloqueado`);
    });
    await mostrar();
  },

  async numerar() {
    let r = await alterar((db) => R.numerarFaturas(db, login()));
    if (r.foraDeOrdem.length) {
      const lista = r.foraDeOrdem.map((p) => `${dataBr(p.data)}`).join(', ');
      if (!confirm(`A última NF (nº ${R.numeroFatura(r.ultima.numero)}) é de ${dataBr(r.ultima.emissao)}, e há pagamento(s) com data anterior: ${lista}.\n\nNumerar mesmo assim? Eles receberão os próximos números, com a data do próprio pagamento.`)) return;
      r = await alterar((db) => R.numerarFaturas(db, login(), { forcar: true }));
    }
    if (r.numeradas.length) aviso(`NFs numeradas: ${r.numeradas.map((n) => R.numeroFatura(n.numero)).join(', ')}.`);
    if (r.problema) aviso(r.problema, 'erro');
    await mostrar();
  },

  async excel({ numero }) {
    const ExcelJS = await excelJs();
    const { blob, nome } = await excelDoNumero(ExcelJS, await modeloFatura(), numero);
    baixar(blob, nome);
  },

  /** Resultados financeiros do período em Excel: uma aba com o ranking e outra com as contas pagas por nós. */
  async excelResultados({ de, ate }) {
    const ExcelJS = await excelJs();
    const lista = R.resultadosFinanceiros(E.d, de, ate).sort((a, b) => a.controle - b.controle);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Resultados');
    const moeda = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    ws.addRow([`Resultados financeiros de ${dataBr(de)} a ${dataBr(ate)}`]).font = { bold: true, size: 14 };
    ws.addRow([`Gerado em ${new Date().toLocaleString('pt-BR')}`]).font = { italic: true, color: { argb: 'FF666666' } };
    ws.addRow([]);
    const colunas = [['Posição', 9], ['Imóvel', 30], ['Valor do imóvel + reformas', 22], ['Aluguel recebido', 18], ['NFs avulsas', 15], ['IPTU pago pelo proprietário', 22],
      ['Contas pagas por nós', 20], ['Resultado', 18], ['Retorno ao ano', 15], ['Reformas no período', 18], ['Pagamentos', 12], ['Observação', 30]];
    const cab = ws.addRow(colunas.map(([t]) => t));
    cab.font = { bold: true };
    cab.alignment = { wrapText: true, vertical: 'middle' };
    cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; });
    colunas.forEach(([, w], i) => { ws.getColumn(i + 1).width = w; });
    const r = (v) => v / 100;
    lista.forEach((x, n) => ws.addRow([x.retornoAnual !== null && !x.controle ? n + 1 : '', x.imovel.nome, r(x.base), r(x.aluguel), r(x.avulsas), -r(x.iptu), -r(x.contas), r(x.resultado),
      x.retornoAnual === null ? '' : x.retornoAnual / 100, r(x.reformasPeriodo), x.mesesPagos, x.controle ? 'boleto de controle: não conta' : (x.base ? '' : 'informe o valor do imóvel')]));
    const conta = lista.filter((x) => !x.controle);
    const soma = (k) => r(conta.reduce((t, x) => t + x[k], 0));
    const base = conta.reduce((t, x) => t + x.base, 0);
    const resultado = conta.reduce((t, x) => t + x.resultado, 0);
    const meses = lista[0] ? lista[0].meses : 12;
    const tot = ws.addRow(['', 'Total', soma('base'), soma('aluguel'), soma('avulsas'), -soma('iptu'), -soma('contas'), soma('resultado'), base ? (resultado * 12 / meses / base) : '', soma('reformasPeriodo'), '', '']);
    tot.font = { bold: true };
    tot.eachCell((c) => { c.border = { top: { style: 'medium' } }; });
    for (const col of [3, 4, 5, 6, 7, 8, 10]) ws.getColumn(col).numFmt = moeda;
    ws.getColumn(9).numFmt = '0.00%';
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    // contas pagas por nós no período, uma por linha
    const wc = wb.addWorksheet('Contas pagas por nós');
    wc.addRow(['Imóvel', 'Mês da conta', 'Conta', 'Valor', 'Pago em', 'Observação']).font = { bold: true };
    [30, 14, 14, 15, 13, 40].forEach((w, i) => { wc.getColumn(i + 1).width = w; });
    E.d.despesas.filter((x) => x.data_pagamento >= de && x.data_pagamento <= ate)
      .sort((a, b) => String(a.data_pagamento).localeCompare(String(b.data_pagamento)))
      .forEach((x) => wc.addRow([(buscar('imoveis', x.imovel_id) || {}).nome || '', compBr(x.competencia), x.tipo, r(x.valor), new Date(`${x.data_pagamento}T12:00:00`), x.observacoes || '']));
    // ressarcimentos de condomínio abatidos em boletos pagos no período (quando não saíram da NF)
    E.d.cobrancas.filter((cb) => cb.ressarcimento > 0 && !cb.ressarcimento_na_nf && cb.data_pagamento >= de && cb.data_pagamento <= ate).forEach((cb) => {
      const c = buscar('contratos', cb.contrato_id) || {};
      wc.addRow([(buscar('imoveis', c.imovel_id) || {}).nome || '', compBr(cb.competencia), 'Ressarcimento condomínio', r(cb.ressarcimento), new Date(`${cb.data_pagamento}T12:00:00`), cb.ressarcimento_descricao || '']);
    });
    wc.getColumn(4).numFmt = moeda;
    wc.getColumn(5).numFmt = 'dd/mm/yyyy';
    const buf = await wb.xlsx.writeBuffer();
    baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Resultados ${de} a ${ate}.xlsx`);
  },

  async excelMes({ mes }) {
    const [ExcelJS, JSZip] = await Promise.all([excelJs(), jsZip()]);
    const modelo = await modeloFatura();
    const numeros = [...new Set(E.d.faturas.filter((f) => f.situacao === 'Emitida' && f.emissao.slice(0, 7) === mes).map((f) => f.numero))].sort((a, b) => a - b);
    const zip = new JSZip();
    for (const n of numeros) {
      const { blob, nome } = await excelDoNumero(ExcelJS, modelo, n);
      zip.file(nome, blob);
    }
    baixar(await zip.generateAsync({ type: 'blob' }), `NFs ${mes}.zip`);
  },

  async exportar() {
    const JSZip = await jsZip();
    const blob = await S.exportarZip(JSZip, E.pasta, E.d);
    baixar(blob, `imoveis-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.zip`);
    await alterar((db) => R.registrar(db, login(), 'Exportação', 'banco', null, 'Banco e arquivos exportados em ZIP', null, {}, false));
  },

  async exportarPlanilhaPdf() {
    const [ExcelJS, { jsPDF }] = await Promise.all([excelJs(), bibliotecasPdf()]);
    const quando = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    baixar(await planilhaDeTudo(ExcelJS, E.d), `imoveis-dados-${quando}.xlsx`);
    baixar(pdfDeTudo(jsPDF, E.d), `imoveis-dados-${quando}.pdf`);
    await alterar((db) => R.registrar(db, login(), 'Exportação', 'banco', null, 'Todos os dados exportados em planilha e PDF', null, {}, false));
  },

  baixarRegras() {
    baixar(new Blob(['﻿', REGRAS_TEXTO], { type: 'text/plain;charset=utf-8' }), 'Regras do sistema.txt');
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
    if (!opera()) throw new Error('Seu usuário não pode excluir arquivos.');
    const s = buscar('seguros', seguro);
    if (!s) throw new Error('Apólice não encontrada.');
    if (conferir) {
      const resp = await janela({ titulo: 'Apagar a apólice de uma vigência anterior', forte: true, sim: 'Apagar o arquivo', nao: 'Cancelar',
        html: `<p>Este arquivo é a apólice da vigência <b>${dataBr(s.vigencia_inicio)} a ${dataBr(s.vigencia_fim)}</b>. Abra e confira se é mesmo o arquivo errado antes de apagar:</p>
          <p><a href="#" data-acao="abrirArquivo" data-escopo="seguro" data-id="${esc(contrato)}" data-nome="${esc(nome)}">📎 ${esc(nome)}</a></p>
          <p><label class="check"><input type="checkbox" name="conferi" value="1"> Abri o arquivo e confirmo que quero apagar</label></p>
          <p class="suave">Depois, anexe o certo em "Anexar arquivos" dos documentos do seguro, escolhendo "Apólice" e esta vigência.</p>` });
      if (!resp) return;
      if (!resp.conferi) throw new Error('Marque "Abri o arquivo e confirmo" para apagar. Nada foi apagado.');
    }
    await alterarApagandoAnexos((db) => R.tirarArquivoSeguro(db, s.id, nome, login()));
    aviso(`Arquivo apagado: ${nome}.`);
    await mostrar();
  },

  async enviarArquivos({ upload }, el) {
    const [escopo, id] = upload.split(':');
    if (escopo === 'seguro') return enviarArquivosSeguro(Number(id), el);
    const dir = await pastaDoEscopo(escopo, Number(id));
    const nomes = [];
    for (const f of el.files) nomes.push(await S.salvarArquivo(dir, escopo === 'matricula' && !ehMatricula(f.name) ? new File([f], `Matricula ${f.name}`, { type: f.type }) : f));
    const vinc = vinculoDoEscopo(escopo, id);
    await alterar((db) => R.registrar(db, login(), 'Inclusão', 'arquivos', null, `${nomes.length} arquivo(s) anexado(s)`, { arquivos: nomes.join(', ') }, vinc));
    aviso(`${nomes.length} arquivo(s) anexado(s).`);
    await mostrar();
  },

  async abrirArquivo({ escopo, id, nome }) {
    const arq = await S.abrirArquivo(await pastaDoEscopo(escopo, Number(id)), nome);
    window.open(URL.createObjectURL(arq), '_blank');
  },

  async baixarArquivo({ escopo, id, nome }) {
    baixar(await S.abrirArquivo(await pastaDoEscopo(escopo, Number(id)), nome), nome);
  },

  /** Dados e backup: confere agora os arquivos dos lançamentos (devolve os que estavam em outra pasta; alerta os que sumiram). */
  async conferirArquivos() {
    aviso('Conferindo os arquivos…', 'info');
    const r = await conferirArquivos();
    aviso(`${r.conferidos} arquivo(s) conferido(s).${r.devolvidos.length ? ` ${r.devolvidos.length} estavam em outra pasta e voltaram ao lugar.` : ''}${r.faltando.length ? ` ${r.faltando.length} não foram encontrados: veja o alerta no Painel.` : ' Nenhum faltando.'}`, r.faltando.length ? 'aviso' : 'ok');
  },

  async excluirArquivo({ escopo, id, nome }) {
    if (!opera()) throw new Error('Seu usuário não pode excluir arquivos.');
    // arquivo ligado a um lançamento (inclusive o herdado na troca de titular): só sai pelo × do lançamento
    const dono = R.rotulosDosArquivos(d()).get(`${escopo}:${id}|${nome}`) || (anexosEmUso().has(`${chavePasta(escopo, id)}|${nome}`) ? 'arquivo de um lançamento' : '');
    if (dono) throw new Error(`Este arquivo é o ${dono}: para apagar, use o "×" ao lado do lançamento (volta o aviso para anexar).`);
    const dir = await pastaDoEscopo(escopo, Number(id));
    await dir.removeEntry(nome);
    const vinc = vinculoDoEscopo(escopo, id);
    await alterar((db) => R.registrar(db, login(), 'Exclusão', 'arquivos', null, `Arquivo excluído: ${nome}`, null, vinc));
    await mostrar();
  },
};
