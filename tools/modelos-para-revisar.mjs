// Gera "Modelos de documentos - para revisar.pdf" (na raiz do projeto; não vai para o Git): todos os documentos que o
// sistema produz, preenchidos com uma pessoa fictícia (CPF de teste 529.982.247-25), para o dono ler e anotar.
// Os novos de 24/11/2026 saem marcados NOVO. Uso: node tools/modelos-para-revisar.mjs [caminho do chrome.exe]
// Sem o caminho, procura o Chromium do Playwright (%LOCALAPPDATA%\ms-playwright) e o Chrome/Edge instalados.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as K from '../docs/js/contratos.js';
import { MODELOS_PADRAO } from '../docs/js/modelos-contrato.js';
import { TIPOS_DOCUMENTO } from '../docs/js/modelos-documentos.js';
import * as NT from '../docs/js/notificacoes.js';
import * as REC from '../docs/js/recibos.js';
import * as R from '../docs/js/regras.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(raiz, 'Modelos de documentos - para revisar.pdf');
const HOJE = '2026-11-24';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- documentos por modelo (contratos, termos aditivos e os novos) ----------
const { d: dx, c: cx } = K.exemploDeDocumento();
const secoes = [];
const novo = (m) => m.tipo in TIPOS_DOCUMENTO;
function porModelo(m) {
  const tipo = K.tipoDoModelo(m);
  let dados;
  if (tipo === 'contrato' || novo(m)) dados = K.dadosDoDocumento(dx, cx, tipo, K.valoresDeExemplo(tipo), { data: HOJE });
  else if (tipo === 'aditivo') dados = K.dadosDoAditivo(dx, cx, { numero: 2, data: HOJE, dia_anterior: 10, dia_novo: 5, primeiro_vencimento: '2027-01-05', testemunhas: [] });
  else if (tipo === 'aditivo_valor') dados = K.dadosDoAditivo(dx, cx, { tipo: K.TIPO_ADITIVO_VALOR, numero: 2, data: HOJE, data_vigencia: '2026-12-01', valor_anterior: 190000, valor_novo: 205000, percentual: 10 });
  else {
    // troca de titular: o contrato de quem sai (João) e o de quem entra (Maria), com fiador
    const ant = { ...cx, id: 2, inquilino_nome: 'João de Teste Pereira', inquilino_cpf: '111.444.777-35', data_saida: '2026-11-30' };
    const novoC = { ...cx, data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', herdado_de: 2, contrato_anterior_id: 2 };
    const d2 = { ...dx, contratos: [novoC, ant], aditivos: [], depositos_garantia: [], correcoes_garantia: [], aplicacoes: [], devolucoes_garantia: [], trocas_garantia: [], cobrancas: [], encerramentos: [] };
    dados = K.dadosDoAditivo(d2, novoC, { tipo: K.TIPO_ADITIVO_TROCA, numero: 1, data: HOJE, testemunhas: [] });
  }
  return K.contratoHtml(K.montarContrato(m.texto, dados), { logo: '', rodape: dados.rodape });
}
for (const m of MODELOS_PADRAO) {
  let html;
  try { html = porModelo(m); } catch (e) { html = `<p class="erro">Não montado com o exemplo (${esc(e.message)}). Veja em Sistema → Teste dos PDFs.</p><pre>${esc(m.texto)}</pre>`; }
  secoes.push({ titulo: m.nome, grupo: novo(m) ? 'Outros documentos da locação' : (m.tipo ? 'Termos aditivos' : 'Contratos'), novo: novo(m), onde: 'Editável: Sistema → Modelos de documentos', html });
}

// ---------- recibos, termos e ficha (texto fixo em recibos.js) ----------
function bancoDosRecibos() {
  const d = R.bancoVazio();
  R.normalizar(d);
  R.inserir(d, 'emitentes', { nome: 'Empresa Exemplo', razao_social: 'EMPRESA LOCADORA EXEMPLO LTDA', cnpj: '11.222.333/0001-81', endereco: 'Rua do Exemplo, 100, Centro, Curitiba/PR', ativo: true, assina_documentos: true }, 'exemplo');
  const i = R.inserir(d, 'imoveis', { nome: 'Casa Exemplo', endereco: 'Rua das Flores, 120', complemento: 'Casa 3', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }, 'exemplo');
  R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: 1, percentual: 100 }, 'exemplo');
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Maria de Teste Souza', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física', imoveis_ids: [i.id], situacao: 'Em análise',
    aluguel_inicial: 190000, desconto_pontualidade_percentual: 10, dia_vencimento: 10, garantia_tipo: 'Fiador', prazo_meses: 30,
    conta_iptu: 'Por conta do inquilino', iptu_estimado: 15300, conta_seguro: 'Por conta do inquilino', seguro_estimado: 25000,
    conta_agua: 'Por conta do inquilino', conta_energia: 'Por conta do inquilino', conta_condominio: 'Não tem',
    reserva_valor: 50000, reserva_data: '2026-11-10', comprovante_reserva: 'comprovante.pdf', fiadores: [{ nome: 'José de Teste Lima', cpf: '111.444.777-35' }] }, 'exemplo');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria de Teste Souza', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física',
    aluguel_inicial: 190000, desconto_pontualidade_percentual: 10, dia_vencimento: 10, data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', prazo_meses: 30, prazo_tipo: 'Determinado',
    garantia_tipo: 'Caução', caucao_meses: 2, caucao_valor: 380000, caucao_pago_em: '2026-06-01', comprovante_caucao: 'comprovante.pdf', cobranca_mes_seguinte: true, multa_percentual: 2, juros_mensal_percentual: 1 }, 'exemplo');
  return { d, f, c };
}
const recibos = [];
const tentar = (tipo, preparo) => {
  try {
    const { d, f, c } = bancoDosRecibos();
    const alvo = preparo(d, f, c);
    recibos.push({ tipo, r: REC.montarRecibo(d, tipo, alvo, HOJE) });
  } catch (e) { recibos.push({ tipo, erro: e.message }); }
};
tentar('reserva', (d, f) => ({ ficha: f }));
tentar('devolucao_reserva', (d, f) => { Object.assign(f, { situacao: 'Reprovada', devolucao_data: HOJE, comprovante_devolucao: 'x.pdf' }); return { ficha: f }; });
tentar('ficha', (d, f) => ({ ficha: f }));
tentar('ficha_fiador', (d, f) => ({ ficha: f, fiador: 1 }));
tentar('garantia', (d, f, c) => ({ contrato: c }));
tentar('devolucao_garantia', (d, f, c) => {
  const t = R.inserir(d, 'trocas_garantia', { contrato_id: c.id, data: '2026-12-01', tipo_anterior: 'Caução', tipo_novo: 'Fiador', valor_anterior: 380000, devolucao_movimentos: [{ data: '2026-06-01', valor: 380000 }] }, 'exemplo');
  const dev = R.inserir(d, 'devolucoes_garantia', { contrato_id: c.id, troca_id: t.id, data: '2026-12-05', garantia_valor: 380000, indice_percentual: 3.1, garantia_corrigida: 391780, debitos: 0, saldo: 391780, comprovante: 'x.pdf' }, 'exemplo');
  return { contrato: c, id: dev.id };
});
tentar('devolucao_chaves', (d, f, c) => { R.informarSaida(d, c.id, '2026-12-15', 'exemplo'); return { contrato: R.buscar(d, 'contratos', c.id) }; });
tentar('quitacao', (d, f, c) => {
  R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2026-12-15', garantia_valor: 380000, garantia_corrigida: 391780, debitos: 95000,
    debitos_descricao: 'Pintura da sala: R$ 700,00\nLimpeza: R$ 250,00', saldo: 296780, garantia_devolvida_em: '2026-12-20' }, 'exemplo');
  return { contrato: c };
});
tentar('acordo', (d, f, c) => {
  for (const comp of ['2026-06', '2026-07']) R.gerarCobrancas(d, comp, 'exemplo');
  R.registrarPagamento(d, R.boletoDoMes(d, c.id, '2026-06').id, '2026-07-10', null, 'exemplo');
  const { acordo } = R.fazerAcordo(d, { contrato_id: c.id, ids: [R.boletoDoMes(d, c.id, '2026-07').id], total: 210000, parcelas: 3, primeiro_vencimento: '2026-12-10' }, 'exemplo', '2026-09-19');
  return { contrato: c, acordo: acordo.id, id: acordo.id };
});
tentar('notificacao', (d, f, c) => {
  const n = { data: HOJE, prazo_dias: 10 };
  const t = NT.textoDoModelo(d, c, n, 'obra');
  const x = R.criarNotificacao(d, { contrato_id: c.id, modelo: 'obra', ...n, assunto: t.assunto, clausula: t.clausula, texto: t.texto.replace(/[preencher: [^]]*]/g, 'furo na fachada e tubulação aparente') }, 'exemplo');
  return { contrato: c, id: x.id };
});
function reciboHtml(r) {
  const e = r.emitente;
  const par = (t) => `<p>${esc(t)}</p>`;
  const linha = ([a, b]) => (b === null ? `<tr><th colspan="2">${esc(a)}</th></tr>` : `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`);
  return `<div class="recibo"><p class="c"><b>${esc(e.razao_social || e.nome || '')}</b>${e.cnpj ? `<br>CNPJ ${esc(e.cnpj)}` : ''}</p>
    <h2 class="c">${esc(r.titulo)}</h2>${r.paragrafos.map(par).join('')}
    ${r.tabela.length ? `<table class="tab">${r.tabela.map(linha).join('')}</table>` : ''}${r.depois.map(par).join('')}
    <p class="dir">${esc(r.cidade)}, ${K.dataPorExtenso(r.data, { zero: false })}.</p>
    ${r.assinaturas.map((a) => `<p class="ass">_______________________________________<br><b>${esc(a.nome)}</b>${a.linha ? `<br>${esc(a.linha)}` : ''}</p>`).join('')}</div>`;
}
for (const x of recibos) {
  secoes.push({ titulo: REC.TIPOS_RECIBO[x.tipo], grupo: 'Recibos, termos e ficha', onde: 'Texto fixo no sistema (recibos.js): anote o que mudar e peça ao Claude',
    html: x.r ? reciboHtml(x.r) : `<p class="erro">Não montado com o exemplo aqui (${esc(x.erro)}). Veja em Sistema → Teste dos PDFs.</p>` });
}
// termo de entrega das chaves (entrada)
{
  const chaves = K.reciboChavesBlocos(dx, cx, '02 Chaves da porta da frente\n01 Controle do portão', HOJE);
  secoes.push({ titulo: 'Recibo de entrega das chaves (entrada)', grupo: 'Recibos, termos e ficha', onde: 'Texto fixo no sistema (contratos.js): anote o que mudar e peça ao Claude',
    html: K.contratoHtml(chaves.blocos, { logo: '', rodape: chaves.rodape || [] }) });
}
// modelos das notificações ao inquilino (o texto é editado em cada notificação; o modelo é fixo)
secoes.push({ titulo: 'Notificações ao inquilino: os modelos', grupo: 'Notificações', onde: 'O texto pode ser mudado em cada notificação; os modelos são fixos (notificacoes.js). O que está entre chaves, como {prazo}, o sistema preenche ao gerar',
  html: [...NT.MODELOS_NOTIFICACAO].map((m) => `<h3>${esc(m.nome)}</h3><p class="pre">${esc(m.texto)}</p>`).join('') });

// ---------- inventário (item 1) ----------
const INVENTARIO = [
  ['Contrato de locação residencial e não residencial', 'Sim, em Modelos de documentos', ''],
  ['Termos aditivos: vencimento, troca de inquilino, novo valor', 'Sim, em Modelos de documentos', ''],
  ...Object.values(TIPOS_DOCUMENTO).map((t) => [t.nome, 'Sim, em Modelos de documentos', 'NOVO']),
  ...Object.values(REC.TIPOS_RECIBO).map((n) => [n, 'Não: texto fixo (recibos.js)', '']),
  ['Recibo de entrega das chaves (entrada)', 'Não: texto fixo (contratos.js)', ''],
  ['Vistoria de entrada e de saída', 'Em parte: itens em "Modelo de vistoria"; textos fixos', ''],
  ['Carta de reajuste', 'Não: texto fixo (Reajustes)', ''],
  ['Declaração anual de aluguéis (IR)', 'Não: texto fixo', ''],
  ['Demonstrativo do boleto e NF', 'NF: modelo Excel em Modelos de documentos; demonstrativo fixo', ''],
  ['E-mails de cada etapa e régua de cobrança', 'Sim, em Sistema → Comunicação E-mail', ''],
  ['Comunicados a todos (contatos)', 'Não: texto fixo (comunicados.js)', ''],
  ['Termo de aceite da reserva', 'Em preparo em outra frente (decisões do dono de 24/11)', ''],
];
const inventario = `<h1>Modelos de documentos: para revisar</h1>
  <p>Gerado em 24/11/2026 com dados de exemplo (Maria de Teste Souza, CPF de teste 529.982.247-25; fiador José de Teste Lima, CPF de teste 111.444.777-35). Os marcados <span class="novo">NOVO</span> foram criados agora: leia, anote o que mudar e mande ao Claude, ou mude você mesmo em <b>Sistema → Modelos de documentos → Outros documentos da locação</b> (botão Editar; "Voltar ao texto padrão" desfaz).</p>
  <table class="tab"><tr><th>Documento</th><th>Dá para editar no sistema?</th><th></th></tr>${INVENTARIO.map(([a, b, n]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td>${n ? '<span class="novo">NOVO</span>' : ''}</td></tr>`).join('')}</table>
  <h2>Índice</h2><ol>${secoes.map((s) => `<li>${s.novo ? '<span class="novo">NOVO</span> ' : ''}${esc(s.titulo)} <span class="suave">(${esc(s.grupo)})</span></li>`).join('')}</ol>`;

const css = pathToFileURL(path.join(raiz, 'docs/css/estilo.css')).href;
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Modelos de documentos - para revisar</title>
<link rel="stylesheet" href="${css}">
<style>
  @page { size: A4; margin: 15mm 15mm 18mm; }
  body { background: #fff; font-family: Arial, sans-serif; font-size: 11pt; }
  .secao { break-before: page; }
  .faixa { border: 2px solid #555; padding: 6px 10px; margin-bottom: 10px; font-family: Arial, sans-serif; }
  .faixa.novo-doc { border-color: #c60; background: #fff4e5; }
  .novo { background: #c60; color: #fff; padding: 1px 6px; border-radius: 4px; font-weight: bold; font-size: 9pt; }
  .tab { width: 100%; border-collapse: collapse; margin: 8px 0; } .tab td, .tab th { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
  .c { text-align: center; } .dir { text-align: right; margin-top: 18px; } .ass { text-align: center; margin-top: 40px; }
  .pre { white-space: pre-wrap; } .erro { color: #a00; } .suave { color: #666; }
  .contrato .ct-rodape { position: static !important; }
  .contrato .ct-marca, .contrato .ct-capa { display: none; }
  pre { white-space: pre-wrap; font-size: 9pt; }
</style></head><body><div class="impressao">${inventario}
${secoes.map((s) => `<div class="secao"><div class="faixa${s.novo ? ' novo-doc' : ''}">${s.novo ? '<span class="novo">NOVO</span> ' : ''}<b>${esc(s.titulo)}</b><br><span class="suave">${esc(s.grupo)} · ${esc(s.onde)}</span></div>${s.html}</div>`).join('\n')}
</div></body></html>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'modelos-'));
const arqHtml = path.join(tmp, 'modelos.html');
fs.writeFileSync(arqHtml, html);
const candidatos = [process.argv[2], 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ...(() => { const b = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'); try { return fs.readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)).map((x) => path.join(b, x, 'chrome-win64', 'chrome.exe')); } catch { return []; } })()].filter(Boolean);
const chrome = candidatos.find((x) => fs.existsSync(x));
if (!chrome) { console.log(`Sem navegador para gerar o PDF. HTML em ${arqHtml}`); process.exit(1); }
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--no-pdf-header-footer', `--user-data-dir=${path.join(tmp, 'perfil')}`, `--print-to-pdf=${SAIDA}`, pathToFileURL(arqHtml).href], { stdio: 'ignore', timeout: 120000 });
console.log(`PDF: ${SAIDA}`);
console.log(`${secoes.length} documentos; não montados: ${recibos.filter((x) => x.erro).map((x) => `${x.tipo} (${x.erro})`).join('; ') || 'nenhum'}`);
if (process.env.MANTER_HTML) fs.copyFileSync(arqHtml, process.env.MANTER_HTML);
fs.rmSync(tmp, { recursive: true, force: true });
