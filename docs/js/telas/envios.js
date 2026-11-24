// FORMULARIOS: o que acontece ao enviar cada formulário (data-form="nome"). O de cadastro genérico é FORMULARIOS.cadastro.
import { abrirPasta, alterar, aviso, confirmar, backupCompletoSeguro, baixar, conectarSeguro, criarBanco, E, entrar, excelJs, ir, janela, jsZip, ligarChaveNaNuvem, login, mandarVerificadorDoAparelho, mostrar, podeUsuario, renovarUsuario, tokenDaSessao } from '../app.js';
import * as S from '../armazenamento.js';
import { camposDeSenha, conferirSenha, ERRO_SENHA_CURTA, senhaCurta } from '../auth.js';
import * as B from '../backup-seguro.js';
import * as BANCO from '../banco.js';
import * as C from '../calculos.js';
import { compBr, dataBr, pct, reais } from '../calculos.js';
import * as K from '../contratos.js';
import * as F from '../formularios.js';
import * as R from '../regras.js';
import * as Z from '../conciliacao.js';
import { aplicarReajusteNaTela } from './acoes.js';
import { reduzirImagem } from './admin.js';
import { confirmarAvisos, dataMuitoAntiga, dataNoFuturo } from './avisos.js';
import { FORMULARIOS_BANCO } from './banco.js';
import { FORMULARIOS_EMAILS } from './emails.js';
import { FORMULARIOS_NOTIFICACOES } from './notificacoes.js';
import { FORMULARIOS_COMUNICACOES } from './comunicacoes.js';
import { CADASTROS, nomeComprovante } from './cadastros.js';
import { apagarRascunhoVistoria } from './campos.js';
import { acertarNomesDosComprovantes, adiados, alterarApagandoAnexos, buscar, cienciaDaTroca, d, memoria, pastaDoEscopo, registrarCiencia, salvarAssinado, SO_ADMIN_NUMERACAO, trazerHerancaAssinada } from './comum.js';
import { modelosNoBanco, reduzirFoto } from './documentos.js';

const REGISTRO_EXCLUIDO = 'Este registro foi excluído por outra pessoa; nada foi salvo.';

/**
 * Endereço de um formulário que só leva a outra tela: ``rota`` (o data-ir dele) com os campos preenchidos como parâmetros,
 * passando por sanearParametros (parâmetro fora do formato fica de fora e a tela usa o padrão). Campo vazio fica de fora.
 * Ex.: ('cobrancas', [['comp', '2026-11'], ['busca', ' Maria ']]) → '#/cobrancas?comp=2026-11&busca=Maria'.
 */
export function enderecoDoFormulario(rota, campos) {
  if (!/^[a-z-]+$/.test(String(rota || ''))) throw new Error('Formulário sem a tela de destino (data-ir).');
  // navegador sem campo de mês (Safari do Mac, Firefox): "08/2026" vira "2026-08"; mês que não dá para entender avisa (antes sumia)
  const preenchidos = [...campos].map(([k, v]) => [k, String(v).trim().slice(0, 100)]).filter(([, v]) => v).map(([k, v]) => {
    if (!['comp', 'mes'].includes(k)) return [k, v];
    const m = /^(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(v);
    const mes = m ? `${m[2]}-${m[1].padStart(2, '0')}` : v;
    if (!C.competenciaValida(mes)) throw new C.ErroUsuario(`Mês inválido: "${v}". Digite como 08/2026 (mês/ano) ou 2026-08.`);
    return [k, mes];
  });
  const q = String(new URLSearchParams(Object.entries(C.sanearParametros(Object.fromEntries(preenchidos)))));
  return q ? `#/${rota}?${q}` : `#/${rota}`;
}

/** Anexos que não entraram no ZIP (aviso NAO-INCLUIDOS.txt de quando ele foi feito): texto para o aviso depois de importar. */
const foraDoZip = (lidos) => (lidos.naoIncluidos && lidos.naoIncluidos.length
  ? ` Atenção: ${C.plural(lidos.naoIncluidos.length, 'anexo ficou', 'anexos ficaram')} de fora deste ZIP quando ele foi feito (não deu para ler): ${lidos.naoIncluidos.slice(0, 10).join('; ')}${lidos.naoIncluidos.length > 10 ? '…' : ''}.` : '');

/** Testemunhas do contrato ou do termo aditivo: ficam lembradas neste navegador (o próximo já vem com elas) e vão no formato guardado. */
function testemunhasDo(f) {
  // CPF da testemunha: conferido e formatado como nos cadastros (ex.: 52998224725 → 529.982.247-25)
  for (const [t, k, n] of [['t1', 'c1', 1], ['t2', 'c2', 2]]) {
    const cpf = String(f[k] || '').trim();
    if (!cpf) continue;
    if (!F.cpfValido(cpf)) throw new C.ErroUsuario(`CPF da testemunha ${n}${f[t] ? ` (${String(f[t]).trim()})` : ''} inválido: confira os números.`);
    f[k] = F.mascarar('cpf', cpf);
  }
  try { localStorage.setItem('testemunhas_contrato', JSON.stringify({ t1: f.t1, c1: f.c1, t2: f.t2, c2: f.c2 })); } catch { /* sem lembrar */ }
  return [[f.t1, f.c1], [f.t2, f.c2]].map(([nome, cpf]) => ({ nome: String(nome || '').trim(), cpf: String(cpf || '').trim() }));
}

/** Pagamento confirmado num imóvel sem empresa emitente: avisa agora, para não descobrir só na hora de numerar a NF. */
function avisarImovelSemEmpresa(cb) {
  const c = cb && buscar('contratos', cb.contrato_id);
  const i = c && buscar('imoveis', c.imovel_id);
  if (!i || !R.geraNf(c) || R.ehComplementoCaucao(cb) || R.participacoesDo(d(), i.id).length) return;
  aviso(`O imóvel ${i.nome} ainda não tem empresa que emite a NF: defina na página do imóvel (caixa "Empresas que emitem a NF") antes de numerar.`, 'aviso');
}

export const FORMULARIOS = {
  async configurarSeguro(form) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador configura o backup seguro.');
    const dir = E.pastaSeguraNova;
    if (!dir) throw new C.ErroUsuario('Escolha a pasta segura primeiro.');
    const f = new FormData(form);
    const senha = String(f.get('senha') || '');
    let chave = await B.lerChave(dir);
    if (chave) {
      if (!(await B.conferirSenha(chave, senha))) throw new C.ErroUsuario('Senha do backup incorreta. Confira e digite de novo.');
    } else {
      if (senha !== String(f.get('senha2') || '')) throw new C.ErroUsuario('As duas senhas precisam ser iguais.');
      chave = await B.criarChave(senha);
      await B.gravarChave(dir, chave);
    }
    await S.lembrarPastaSegura(dir);
    E.pastaSeguraNova = null;
    await conectarSeguro(false);
    await alterar((db) => R.registrar(db, login(), 'Alteração', 'banco', null, 'Backup seguro ligado neste computador', null, {}, false));
    await backupCompletoSeguro();
    await ligarChaveNaNuvem(); // na nuvem: os backups diários do servidor passam a sair cifrados com esta chave
    aviso('Backup seguro ligado. Primeiro backup completo gravado.');
    await mostrar();
  },

  async restaurarSeguro(form) {
    const f = new FormData(form);
    const arq = f.get('arquivo');
    if (!arq || !arq.size) throw new C.ErroUsuario('Escolha o arquivo de backup antes de continuar.');
    const { info, dados } = await B.decifrar(await arq.arrayBuffer(), String(f.get('senha') || ''));
    const data = (info.criado_em || '').slice(0, 10);
    const JSZip = await jsZip();
    let blob;
    if (info.tipo === 'completo') blob = new Blob([dados], { type: 'application/zip' });
    else {
      const zip = new JSZip();
      zip.file(S.ARQUIVO_BANCO, dados);
      blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    }
    if (f.get('destino') !== 'pasta') {
      baixar(blob, `backup-restaurado-${info.tipo === 'completo' ? 'completo' : 'banco'}-${data}.zip`);
      // na nuvem não existe "Importar ZIP": o caminho é abrir numa pasta do computador e substituir os dados da nuvem (ou Backups da nuvem)
      aviso(E.nuvem ? `Backup de ${C.dataHoraBr(info.criado_em)} baixado como ZIP (para guardar). Para voltar os dados da nuvem a esse dia: use "Backups da nuvem" em Sistema ou, no computador (Chrome ou Edge), abra o backup numa pasta nova e depois "Substituir os dados da nuvem pelos de uma pasta".`
        : `Backup de ${C.dataHoraBr(info.criado_em)} aberto. Agora use "Importar ZIP" em Sistema com o arquivo baixado.`);
      return;
    }
    // abrir numa pasta do computador (versão PC com o site fora do ar): grava o banco e os anexos na pasta escolhida e abre
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'restaurar-backup', mode: 'readwrite' }); } catch (e) { if (e.name === 'AbortError') return; throw e; }
    if (await S.lerBanco(dir)) throw new C.ErroUsuario(`A pasta escolhida já tem um ${S.ARQUIVO_BANCO}. Escolha uma pasta nova e vazia, para não misturar os dados.`);
    const lidos = {};
    await S.importarZip(JSZip, dir, blob, null, lidos);
    await S.lembrarPasta(dir);
    await abrirPasta(dir);
    aviso(`Backup de ${C.dataHoraBr(info.criado_em)} aberto na pasta ${dir.name}. Entre com seu usuário e senha de sempre. Quando o site voltar, Sistema → "Substituir os dados da nuvem pelos de uma pasta" leva o que você fizer aqui para a nuvem.${foraDoZip(lidos)}`, lidos.naoIncluidos.length ? 'aviso' : 'ok');
  },

  async modeloVistoria(form) {
    const f = Object.fromEntries(new FormData(form));
    const i = buscar('imoveis', f.imovel);
    await alterar((db) => R.atualizar(db, 'imoveis', i.id, { modelo_vistoria: String(f.modelo || '').trim() }, login(), `${i.nome}: modelo de vistoria`));
    aviso('Modelo de vistoria salvo.');
    ir(/^#\/vistoria\//.test(f.voltar || '') ? f.voltar : `#/imovel/${i.id}`);
  },

  async baixaLote(form) {
    const fd = new FormData(form);
    const data = String(fd.get('data') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new C.ErroUsuario('Informe a data em que o dinheiro entrou.');
    const ids = fd.getAll('ids').map(Number);
    if (!ids.length) throw new C.ErroUsuario('Marque os boletos deste vencimento que foram pagos.');
    const vencs = new Set(ids.map((id) => (buscar('cobrancas', id) || {}).vencimento));
    if (vencs.size > 1) throw new C.ErroUsuario('Confirme juntos só boletos do mesmo vencimento.');
    // atrasados (D7): o grupo informa o dia em que pagaram; multa e juros até esse dia, como na confirmação um a um
    const atrasado = fd.get('atrasado') === '1';
    const dataPagou = atrasado ? String(fd.get('pagou') || '') || data : null;
    if (atrasado && !/^\d{4}-\d{2}-\d{2}$/.test(dataPagou)) throw new C.ErroUsuario('Informe o dia em que pagaram.');
    if (atrasado && dataPagou > data) throw new C.ErroUsuario('O dia em que pagaram não pode ser depois da data em que o dinheiro entrou.');
    // vencimento em dia não útil vale até o próximo dia útil (C.limitePagamento): pagar nesse dia é em dia, sem multa e juros
    const limiteLote = C.limitePagamento([...vencs][0]);
    if (atrasado && dataPagou <= limiteLote) throw new C.ErroUsuario(`Pagaram até ${dataBr(limiteLote)}${limiteLote !== [...vencs][0] ? ` (o vencimento ${dataBr([...vencs][0])} não é dia útil e vale até esse dia)` : ' (o vencimento)'}: é pagamento em dia, sem multa e juros. Use a baixa sem "pagaram atrasado".`);
    pagamentoNaoFuturo(data, dataPagou);
    await confirmarAvisos([dataMuitoAntiga(data)].filter(Boolean));
    let r;
    await alterar((db) => { r = R.baixarEmLote(db, ids, data, login(), { pagouEmDia: !atrasado, dataPagou }); });
    aviso(`${r.feitos.length} pagamento(s) confirmado(s) ${atrasado ? `com atraso (pagaram em ${dataBr(dataPagou)}, com multa e juros)` : 'em dia'}, com entrada em ${dataBr(data)}.${r.pulados.length ? ` ${r.pulados.length} já estavam pagos ou em carência e ficaram como estavam.` : ''}`, atrasado ? 'aviso' : 'ok');
    await mostrar();
  },

  async lancarContas(form) {
    const f = Object.fromEntries(new FormData(form));
    const linhas = R.TIPOS_DESPESA.map((t, n) => {
      const texto = String(f[`valor_${n}`] || '').trim();
      return { tipo: f[`tipo_${n}`], valor: texto ? C.centavos(texto) : null, data_pagamento: f[`data_${n}`], vencimento: f[`venc_${n}`] || null, observacoes: String(f[`obs_${n}`] || '').trim() };
    });
    if (!f.competencia) throw new C.ErroUsuario('Informe o mês de referência da conta.');
    // data do pagamento no futuro tira a conta dos Resultados do mês (entra pela data do pagamento): pergunta antes
    await confirmarAvisos(linhas.filter((l) => l.valor !== null).map((l) => dataNoFuturo(l.data_pagamento, `${l.tipo}: a data do pagamento`)).filter(Boolean));
    let n = 0;
    await alterar((db) => { n = R.lancarDespesas(db, Number(f.imovel), f.competencia, linhas, login()).length; });
    aviso(`${n} conta(s) lançada(s).`);
    await mostrar();
  },

  /** Financeiro → Resultado bruto: um custo (conta paga por nós) num imóvel. */
  async lancarCusto(form) {
    const f = Object.fromEntries(new FormData(form));
    const texto = String(f.valor || '').trim();
    if (!texto) throw new C.ErroUsuario('Informe o valor pago.');
    if (!/^\d{4}-\d{2}$/.test(f.competencia || '')) throw new C.ErroUsuario('Informe o mês de referência.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data_pagamento || '')) throw new C.ErroUsuario('Informe a data do pagamento.');
    await confirmarAvisos([dataNoFuturo(f.data_pagamento, 'A data do pagamento')].filter(Boolean));
    await alterar((db) => R.lancarDespesas(db, Number(f.imovel), f.competencia, [{ tipo: f.tipo, valor: C.centavos(texto), data_pagamento: f.data_pagamento,
      vencimento: f.vencimento || null, observacoes: String(f.observacoes || '').trim() }], login()));
    aviso(`${f.tipo} de ${compBr(f.competencia)} lançada.`);
    await mostrar();
  },

  /** Financeiro → Resultado bruto: um ganho do Airbnb num imóvel vago. */
  async lancarAirbnb(form) {
    const f = Object.fromEntries(new FormData(form));
    const texto = String(f.valor || '').trim();
    await alterar((db) => R.lancarGanhoAirbnb(db, Number(f.imovel), { data_recebimento: f.data_recebimento, competencia: f.competencia, valor: texto ? C.centavos(texto) : 0,
      observacoes: f.observacoes }, login()));
    aviso('Ganho do Airbnb lançado.');
    await mostrar();
  },

  async marcarDocumento(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.data) throw new C.ErroUsuario('Informe a data.');
    const doc = R.DOCUMENTOS_ENTRADA.find(([k]) => k === f.campo);
    const arquivo = form.querySelector('[name=arquivo]').files[0];
    if (!arquivo) throw new C.ErroUsuario(`Anexe o arquivo de "${doc[1]}" ${doc[2]} antes de marcar.`);
    const nome = await salvarAssinado('assinados', Number(f.contrato), arquivo, `${doc[1]} ${doc[2]} ${f.data}`);
    await alterar((db) => R.marcarDocumento(db, Number(f.contrato), f.campo, f.data, login(), nome));
    await mostrar();
  },

  /** Rotina de entrada: contra-vistoria do inquilino (data em que ele mandou e o arquivo, na pasta do inquilino). */
  async contraVistoria(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.data) throw new C.ErroUsuario('Informe a data em que o inquilino mandou a contra-vistoria.');
    const arq = form.querySelector('[name=arquivo]').files[0];
    if (!arq) throw new C.ErroUsuario('Escolha o arquivo da contra-vistoria (PDF, foto ou o e-mail salvo em PDF).');
    const nome = await S.salvarArquivo(await pastaDoEscopo('contrato', Number(f.contrato)), new File([arq], nomeComprovante('contra-vistoria', f.data, arq)));
    await alterarApagandoAnexos((db) => R.registrarContraVistoria(db, Number(f.contrato), { data: f.data, arquivo: nome }, login()));
    aviso('Contra-vistoria anexada.');
    await mostrar();
  },

  /** Rotina de entrada: marca a etapa como feita na data escolhida. */
  async etapaEntrada(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.data) throw new C.ErroUsuario('Informe a data.');
    await alterar((db) => R.marcarEtapaEntrada(db, Number(f.contrato), f.chave, { data: f.data }, login()));
    await mostrar();
  },

  /** Um depósito da caução ou do depósito de garantia (pode ser parcelado): data, valor e comprovante, gravado na pasta do inquilino. */
  async garantiaPaga(form) {
    const f = Object.fromEntries(new FormData(form));
    const arq = form.querySelector('[name=arquivo]').files[0];
    const g = R.GARANTIAS_DEPOSITADAS[f.qual];
    const valor = C.centavos(f.valor);
    // confere antes de gravar o arquivo na pasta (as mesmas mensagens de R.registrarDepositoGarantia); o comprovante pode vir depois
    if (!f.data) throw new C.ErroUsuario('Informe a data do depósito.');
    if (!(valor > 0)) throw new C.ErroUsuario('Informe o valor depositado.');
    const nome = arq ? await S.salvarArquivo(await pastaDoEscopo('contrato', Number(f.contrato)), new File([arq], nomeComprovante(g.arquivo, f.data, arq))) : null;
    let s;
    await alterar((db) => { s = R.registrarDepositoGarantia(db, Number(f.contrato), f.qual, { data: f.data, valor, arquivo: nome }, login()); });
    aviso(`${s.completou ? `Depósito de ${reais(valor)} registrado: ${g.nome} registrada.${s.falta > 0 ? ` Falta o complemento dos reajustes: ${reais(s.falta)}.` : ''}`
      : s.falta > 0 ? `Depósito de ${reais(valor)} registrado. Já depositado ${reais(s.depositado)}; falta ${reais(s.falta)}.` : `Depósito de ${reais(valor)} registrado: ${g.nome} completa (${reais(s.depositado)}).`}${nome ? '' : ' Sem comprovante: fica o aviso até anexar.'}`);
    await mostrar();
  },

  async aditivo(form) {
    const f = Object.fromEntries(new FormData(form));
    const arquivo = form.querySelector('[name=arquivo]').files[0];
    // confere antes de gravar o arquivo na pasta (as mesmas mensagens de R.registrarAditivo)
    if (!f.data) throw new C.ErroUsuario('Informe a data do termo aditivo.');
    if (!String(f.assunto || '').trim()) throw new C.ErroUsuario('Informe o assunto do termo aditivo (ex.: troca do dia do vencimento).');
    if (!arquivo) throw new C.ErroUsuario('Anexe o arquivo do termo aditivo assinado.');
    // novo titular esperando o termo da troca: a caixa diz se este é o termo da troca (só ele faz o contrato passar)
    const tipo = f.pergunta_troca ? (f.troca === '1' ? K.TIPO_ADITIVO_TROCA : 'Outro') : null;
    // termo da troca: antes de gravar, quem anexa dá ciência de que todo o vínculo passa ao novo titular
    const ciencia = tipo === K.TIPO_ADITIVO_TROCA ? await cienciaDaTroca(Number(f.contrato)) : {};
    if (!ciencia) return;
    const nome = await salvarAssinado('aditivos', Number(f.contrato), arquivo, `termo aditivo ${f.data} ${f.assunto}`.slice(0, 80));
    await alterar((db) => { const a = R.registrarAditivo(db, Number(f.contrato), { data: f.data, assunto: f.assunto, arquivo: nome, tipo }, login()); registrarCiencia(db, a, ciencia); });
    await trazerHerancaAssinada(Number(f.contrato));
    aviso('Termo aditivo registrado.');
    await mostrar();
  },

  async vistoria(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.data) throw new C.ErroUsuario('Informe a data da vistoria.');
    const c = buscar('contratos', f.contrato);
    // leitura dos relógios: obrigatória (regra leitura_relogios_obrigatoria, padrão) e registrada aqui (entrada ou saída do inquilino)
    const momento = f.tipo === 'Saída' ? 'Saída do inquilino' : 'Entrada do inquilino';
    const leitura = Object.fromEntries(F.LEITURAS.map(([k]) => [k, String(f[`leitura_${k}`] || '').trim()]));
    // leitura é o número do relógio: zero ou mais, com vírgula se tiver (ex.: 01234 ou 1234,5); letras e negativo não
    const leituraRuim = F.LEITURAS.filter(([k]) => leitura[k] && !/^\d[\d.]*(,\d+)?$/.test(leitura[k]));
    if (leituraRuim.length) throw new C.ErroUsuario(`Leitura do relógio só com números (ex.: 01234 ou 1234,5): confira ${leituraRuim.map(([k, t]) => `${t.replace('Relógio de ', '')} ("${leitura[k]}")`).join(' e ')}.`);
    const faltaLeitura = R.relogiosObrigatorios(c).filter((k) => !leitura[k]);
    if (faltaLeitura.length) throw new C.ErroUsuario(`Informe a leitura do relógio de ${faltaLeitura.map((k) => F.LEITURAS.find(([x]) => x === k)[1].replace('Relógio de ', '')).join(' e ')}.`);
    const dados = { contrato_id: c.id, imovel_id: c.imovel_id || null, tipo: f.tipo, data: f.data, link_fotos: (f.link_fotos || '').trim(),
      chaves: f.chaves || '', descritivo: f.descritivo || '', condicoes: f.condicoes || '',
      texto_abertura: String(f.texto_abertura || '').trim(), texto_final: f.tipo === 'Entrada' ? String(f.texto_final || '').trim() : '' };
    // B3: na saída, se o inquilino acompanhou (sem ele, o relatório vai por e-mail com 5 dias úteis para contestar)
    if (f.tipo === 'Saída') {
      if (!K.PRESENCA_VISTORIA_SAIDA.includes(f.inquilino_presente)) throw new C.ErroUsuario('Diga se o inquilino acompanhou a vistoria.');
      dados.inquilino_presente = f.inquilino_presente;
    }
    // texto igual ao padrão fica em branco: vale o padrão (a abertura muda sozinha com ou sem o link das fotos)
    const semEspacos = (x) => String(x).replace(/\s+/g, ' ').trim();
    if ([K.VISTORIA_ABERTURA, K.VISTORIA_ABERTURA_SEM_LINK].map(semEspacos).includes(semEspacos(dados.texto_abertura))) dados.texto_abertura = '';
    if ([K.vistoriaFinal(), K.VISTORIA_FINAL_ANTIGA].map(semEspacos).includes(semEspacos(dados.texto_final))) dados.texto_final = '';
    dados.itens = [];
    for (let n = 0; f[`ic_${n}`] !== undefined; n += 1) dados.itens.push({ comodo: f[`ic_${n}`], item: f[`ii_${n}`], situacao: f[`is_${n}`] || '', obs: String(f[`io_${n}`] || '').trim() });
    // todo item do modelo precisa de situação (o navegador já aponta o primeiro; aqui a lista completa)
    const semSituacao = dados.itens.filter((x) => !x.situacao);
    if (semSituacao.length) throw new C.ErroUsuario(`Falta a situação de ${semSituacao.length} item(ns): ${semSituacao.slice(0, 8).map((x) => `${x.comodo} – ${x.item}`).join('; ')}${semSituacao.length > 8 ? '…' : ''}. Marque a situação (ou "Não se aplica") antes de salvar.`);
    const tirados = dados.itens.filter((x) => x.situacao === K.NAO_SE_APLICA);
    dados.itens = dados.itens.filter((x) => x.situacao !== K.NAO_SE_APLICA);
    // fotos: reduzidas e guardadas na pasta do inquilino (mesmo nome = substitui a anterior)
    const anterior = Number(f.id) ? buscar('vistorias', f.id) : null;
    dados.fotos = { ...((anterior && anterior.fotos) || {}) };
    const novasFotos = K.FOTOS_VISTORIA.filter(([k]) => f[`foto_${k}`] && f[`foto_${k}`].size);
    if (novasFotos.length) {
      const dir = await pastaDoEscopo('contrato', c.id);
      for (const [k] of novasFotos) {
        const nome = `vistoria-${f.tipo === 'Saída' ? 'saida' : 'entrada'}-${f.data}-${k}.jpg`;
        await S.escreverTexto(dir, nome, await reduzirFoto(f[`foto_${k}`]));
        dados.fotos[k] = nome;
      }
    }
    if (f.tipo === 'Saída') {
      // a vistoria de entrada do contrato (na troca de titular, a do titular anterior)
      const entrada = K.vistoriaDeEntrada(d(), c);
      dados.comparar_com = entrada ? entrada.data : null;
    }
    let id = Number(f.id) || null;
    await alterar((db) => {
      const desc = `${c.inquilino_nome}: vistoria de ${f.tipo.toLocaleLowerCase('pt-BR')}`;
      if (id) R.atualizar(db, 'vistorias', id, dados, login(), desc);
      else id = R.inserir(db, 'vistorias', dados, login(), desc).id;
      R.gravarLeitura(db, c, momento, f.data, leitura, login());
      const im = c.imovel_id && R.buscar(db, 'imoveis', c.imovel_id);
      if (im && tirados.length) {
        const modelo = K.tirarDoModelo(im.modelo_vistoria, tirados);
        if (modelo !== (im.modelo_vistoria || '')) R.atualizar(db, 'imoveis', im.id, { modelo_vistoria: modelo }, login(), `Modelo de vistoria: tirado o que não se aplica (${tirados.map((x) => `${x.comodo} – ${x.item}`).join(', ')})`);
      }
      if (f.atualizar_imovel === '1' && c.imovel_id && dados.chaves.trim()) R.atualizar(db, 'imoveis', c.imovel_id, { chaves: dados.chaves.trim(), sem_chaves: false }, login(), 'Chaves e controles do imóvel');
      if (dados.link_fotos && f.tipo === 'Entrada' && !c.vistoria_link) R.atualizar(db, 'contratos', c.id, { vistoria_link: dados.link_fotos }, login(), `${c.inquilino_nome}: link das fotos da vistoria`);
    });
    apagarRascunhoVistoria(form.dataset.rascunho);
    aviso('Vistoria salva.');
    ir(`#/imprimir/vistoria?id=${id}`);
  },

  gerarContrato(form) {
    const f = Object.fromEntries(new FormData(form));
    testemunhasDo(f);
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== ''));
    ir(`#/imprimir/contrato?${q}`);
  },

  async reservaAbatida(form) {
    const f = Object.fromEntries(new FormData(form));
    const n = await alterar((db) => R.marcarReservaAbatida(db, Number(f.contrato), { competencia: f.competencia, valor: C.centavos(f.valor) }, login()));
    aviso(`Reserva marcada como já abatida${n ? `; saiu de ${n} boleto(s) em aberto` : ''}.`);
    await mostrar();
  },

  async aditivoVencimento(form) {
    const f = Object.fromEntries(new FormData(form));
    const testemunhas = testemunhasDo(f);
    const modelo = f.id ? null : K.modelosDe(d(), 'aditivo').find((m) => String(m.id) === f.modelo);
    if (!f.id && !modelo) throw new C.ErroUsuario('Escolha o modelo do termo aditivo.');
    // o termo muda o dia dos boletos a partir do mês dele: mês já passado não tem como valer (2026-11-20)
    if (/^\d{4}-\d{2}$/.test(f.mes || '') && f.mes < C.competenciaDe(C.hojeIso())) throw new C.ErroUsuario(`O 1º vencimento no dia novo (${compBr(f.mes)}) é antes deste mês: escolha ${compBr(C.competenciaDe(C.hojeIso()))} ou depois.`);
    const dados = { data: f.data, dia_novo: f.dia_novo, mes: f.mes, testemunhas,
      ...(modelo ? { modelo_id: modelo.id > 0 ? modelo.id : null, texto: modelo.texto } : { texto: f.texto }) };
    let a;
    await alterar((db) => { a = R.salvarAditivoVencimento(db, Number(f.contrato), dados, login(), f.id ? Number(f.id) : null); });
    aviso(f.id ? 'Termo aditivo salvo.' : 'Termo aditivo gerado: imprima ou baixe o PDF para assinar.');
    ir(`#/imprimir/aditivo?id=${a.id}`);
  },

  async aditivoTroca(form) {
    const f = Object.fromEntries(new FormData(form));
    const testemunhas = testemunhasDo(f);
    const modelo = f.id ? null : K.modelosDe(d(), 'aditivo_troca').find((m) => String(m.id) === f.modelo);
    if (!f.id && !modelo) throw new C.ErroUsuario('Escolha o modelo do termo aditivo.');
    const dados = { data: f.data, testemunhas, garantia_corrigida: String(f.garantia_corrigida || '').trim() ? C.centavos(f.garantia_corrigida) : null,
      ...(modelo ? { modelo_id: modelo.id > 0 ? modelo.id : null, texto: modelo.texto } : { texto: f.texto }) };
    let a;
    await alterar((db) => { a = R.salvarAditivoTroca(db, Number(f.contrato), dados, login(), f.id ? Number(f.id) : null); });
    aviso(f.id ? 'Termo aditivo salvo.' : 'Termo aditivo gerado: imprima ou baixe o PDF para assinar.');
    ir(`#/imprimir/aditivo?id=${a.id}`);
  },

  async assinarAditivo(form) {
    const f = Object.fromEntries(new FormData(form));
    const arquivo = form.querySelector('[name=arquivo]').files[0];
    const a = buscar('aditivos', f.id);
    if (!f.data) throw new C.ErroUsuario('Informe a data da assinatura.');
    if (!arquivo) throw new C.ErroUsuario('Anexe o arquivo do termo aditivo assinado.');
    const ciencia = a.tipo === K.TIPO_ADITIVO_TROCA ? await cienciaDaTroca(a.contrato_id) : {};
    if (!ciencia) return;
    const nome = await salvarAssinado('aditivos', a.contrato_id, arquivo, `termo aditivo ${f.data} ${a.assunto}`.slice(0, 80));
    await alterar((db) => { R.assinarAditivo(db, a.id, { data: f.data, arquivo: nome }, login()); registrarCiencia(db, a, ciencia); });
    await trazerHerancaAssinada(a.contrato_id);
    aviso(a.dia_novo && a.primeiro_vencimento ? `Termo aditivo assinado e registrado. O vencimento passou ao dia ${a.dia_novo}: os boletos a partir de ${C.dataBr(a.primeiro_vencimento)} já saem no dia novo.` : 'Termo aditivo assinado e registrado.');
    await mostrar();
  },

  async modeloContrato(form) {
    const f = new FormData(form);
    const nome = String(f.get('nome') || '').trim();
    const texto = String(f.get('texto') || '');
    if (!nome || !texto.trim()) throw new C.ErroUsuario('Preencha o nome e o texto do modelo.');
    const id = Number(f.get('id') || 0);
    const tipo = ['aditivo', 'aditivo_troca', 'aditivo_valor'].includes(f.get('tipo')) ? f.get('tipo') : 'contrato';
    // campo com nome errado sairia escrito "[campo?]" no contrato: avisa antes de gravar
    const fora = K.camposDesconhecidosDoModelo(texto);
    if (fora.length && !(await confirmar(`Estes campos não existem e vão sair no contrato como "[nome?]":\n\n${fora.map((x) => `• ${x}`).join('\n')}\n\nConfira o nome na ajuda "Como escrever um modelo" (abaixo do texto). Salvar assim mesmo?`,
      { titulo: 'Campo desconhecido no modelo', sim: 'Salvar assim mesmo', nao: 'Voltar e corrigir' }))) return;
    await alterar((db) => {
      // o modelo novo não esconde os padrões do mesmo tipo: eles vão para o banco antes
      const real = modelosNoBanco(db, id, tipo);
      if (real) R.atualizar(db, 'modelos_contrato', real, { nome, texto }, login(), `Modelo de contrato "${nome}"`);
      else R.inserir(db, 'modelos_contrato', { nome, texto, ...(tipo !== 'contrato' ? { tipo } : {}) }, login(), `Modelo de contrato "${nome}"`);
    });
    aviso('Modelo salvo.');
    ir('#/modelos-contrato');
  },

  async primeiroAcesso(form) {
    const f = new FormData(form);
    const nome = String(f.get('nome')).trim();
    const lg = String(f.get('login')).trim().toLowerCase();
    const senha = String(f.get('senha'));
    if (!nome || !lg) throw new C.ErroUsuario('Preencha o nome e o login.');
    if (senhaCurta(senha)) throw new C.ErroUsuario(ERRO_SENHA_CURTA);
    if (senha !== f.get('senha2')) throw new C.ErroUsuario('As duas senhas precisam ser iguais.');
    await criarBanco(nome, lg, senha);
    ir('#/');
  },

  async login(form) {
    const f = new FormData(form);
    // na nuvem a conferência da senha (PBKDF2, 2-3 vezes) leva segundos no celular: o botão avisa que está trabalhando
    const botao = form.querySelector('button');
    const texto = botao ? botao.textContent : '';
    if (botao) botao.textContent = 'Entrando…';
    try {
      await entrar(String(f.get('login')).trim().toLowerCase(), String(f.get('senha')));
    } catch (e) {
      if (botao) botao.textContent = texto;
      throw e;
    }
    await mostrar();
  },

  async pedirAcesso(form) {
    if (E.nuvem) throw new C.ErroUsuario('Na nuvem, o acesso é dado pelo administrador: peça para ele cadastrar você em Usuários → Novo usuário, com o seu e-mail.');
    const f = new FormData(form);
    const nome = String(f.get('nome') || '').trim();
    const lg = String(f.get('login') || '').trim().toLowerCase();
    const senha = String(f.get('senha') || '');
    if (!nome || !lg || /\s/.test(lg)) throw new C.ErroUsuario('Preencha o nome e um login sem espaços.');
    if (senhaCurta(senha)) throw new C.ErroUsuario(ERRO_SENHA_CURTA);
    if (senha !== f.get('senha2')) throw new C.ErroUsuario('As duas senhas precisam ser iguais.');
    if (E.d.usuarios.some((u) => u.login === lg)) throw new C.ErroUsuario('Já existe um usuário (ou pedido) com este login.');
    const campos = await camposDeSenha(senha);
    await alterar((db) => R.inserir(db, 'usuarios', { login: lg, nome, papel: 'consulta', ativo: false, pendente: true, ...campos,
      criado_em: new Date().toISOString() }, lg, `Pedido de acesso de ${nome}`));
    aviso('Pedido enviado. Assim que o administrador aprovar, entre com o seu login e senha.');
    ir('#/');
  },

  async minhaSenha(form) {
    const f = new FormData(form);
    if (!(await conferirSenha(E.usuario, String(f.get('atual'))))) throw new C.ErroUsuario('Senha atual incorreta.');
    const nova = String(f.get('nova'));
    if (senhaCurta(nova)) throw new C.ErroUsuario(ERRO_SENHA_CURTA);
    if (nova !== f.get('nova2')) throw new C.ErroUsuario('As duas senhas precisam ser iguais.');
    const campos = await camposDeSenha(nova);
    // as outras sessões lembradas (outros navegadores) caem: fica só a deste; na nuvem, os computadores ligados por este
    // usuário (crachá do programa do PC) também são desligados (o cofre faz, ao ver a senha trocada)
    const token = tokenDaSessao();
    await alterar((db) => R.atualizar(db, 'usuarios', E.usuario.id, { ...campos, sessoes: token ? [token] : [] }, login(), 'Trocou a própria senha'));
    E.usuario = R.buscar(E.d, 'usuarios', E.usuario.id);
    mandarVerificadorDoAparelho(E.usuario.login, nova, campos.senha_hash); // ligar o programa do PC com a senha nova
    aviso('Senha alterada. Os outros navegadores e computadores em que você estava entrado vão pedir a senha nova.');
    ir('#/');
  },

  async cadastro(form, rota) {
    const tabela = rota.partes[1];
    const cfg = CADASTROS[tabela];
    const registro = rota.partes[0] === 'editar' ? buscar(tabela, rota.partes[2]) : null;
    // editando um registro que outra pessoa excluiu enquanto o formulário estava aberto: nada de criar um novo solto
    if (rota.partes[0] === 'editar' && !registro) throw new C.ErroUsuario(REGISTRO_EXCLUIDO);
    const antigo = registro ? { ...registro } : null;
    const campos = cfg.campos(registro, rota.q);
    // documentos já salvos (CPF/CNPJ) e que não mudaram não são barrados; "valores" traz também os que aparecem no formulário (ex.: fiadores no contrato)
    const { dados, erros } = F.ler(campos, form, registro && cfg.valores ? cfg.valores(registro) : registro);
    if (cfg.ajustar && !Object.keys(erros).length) cfg.ajustar(dados, erros, registro, form, rota.q);
    else if (cfg.ajustar) {
      // já há erro: confere também o resto (ex.: dia do vencimento 35) numa volta só, sem usar o resultado
      const mais = {};
      try { cfg.ajustar({ ...dados }, mais, registro, form, rota.q); } catch { /* conferência que depende de campo errado */ }
      for (const [k, v] of Object.entries(mais)) if (!erros[k]) erros[k] = v;
    }
    if (cfg.confirmar && !Object.keys(erros).length && !(await cfg.confirmar(dados, registro))) throw new C.ErroUsuario('Nada foi salvo. Corrija o que precisar e salve de novo.');
    if (cfg.ajustarAsync && !Object.keys(erros).length) await cfg.ajustarAsync(dados, erros, registro, form, rota.q);
    if (Object.keys(erros).length) return { erros, valores: Object.fromEntries(new FormData(form)) };
    await confirmarAvisos(cfg.conferir ? cfg.conferir(dados, registro, rota.q) : []);
    Object.assign(dados, cfg.fixos ? cfg.fixos(registro, rota.q) : {});
    const descricao = cfg.descricao ? cfg.descricao(dados, registro, rota.q) : null;
    let recalculados = 0;
    let deOutro = [];
    const aberto = registro && memoria.formularioAberto?.chave === `${tabela}:${registro.id}` ? memoria.formularioAberto.valores : null;
    const salvo = await alterar((db) => {
      const agora = registro && R.buscar(db, tabela, registro.id);
      if (registro && !agora) throw new C.ErroUsuario(REGISTRO_EXCLUIDO); // excluído enquanto salvava
      // campo que esta pessoa não mexeu e outra mudou com o formulário aberto: fica o da outra (não volta ao valor antigo)
      if (aberto) deOutro = F.manterMudancasDeOutros(campos, dados, aberto, F.paraFormulario(campos, cfg.valores ? cfg.valores(agora, rota.q) : agora), agora);
      let r;
      if (cfg.salvar) r = cfg.salvar(db, dados, rota.q, registro);
      else if (registro) {
        R.atualizar(db, tabela, registro.id, dados, login(), descricao);
        r = R.buscar(db, tabela, registro.id);
      } else r = R.inserir(db, tabela, dados, login(), descricao);
      // boletos em aberto acompanham o cadastro (contrato, correção, IPTU, seguro)
      if (cfg.recalcular) recalculados = R.recalcularCobrancas(db, cfg.recalcular(r, db), login());
      return r;
    });
    if (cfg.depois) await cfg.depois(salvo, antigo);
    // data do lançamento editada: o nome do comprovante acompanha (comprovante-caucao-AAAA-MM-DD)
    if (['contratos', 'depositos_garantia', 'correcoes_garantia', 'aplicacoes', 'devolucoes_garantia'].includes(tabela)) await acertarNomesDosComprovantes(tabela === 'contratos' ? salvo.id : salvo.contrato_id);
    if (tabela === 'usuarios') renovarUsuario();
    if (registro) memoria.formularioAberto = null;
    aviso(recalculados ? `Salvo. ${recalculados} boleto(s) em aberto recalculado(s) com os valores novos.` : 'Salvo.');
    if (deOutro.length) aviso(`Enquanto o formulário estava aberto, outra pessoa mudou: ${deOutro.join(', ')}. Ficou o valor dela (você não tinha mexido nesses campos).`, 'info');
    const destino = tabela === 'imoveis' ? `#/imovel/${salvo.id}` : cfg.destino ? cfg.destino(salvo, rota.q) : cfg.voltar(salvo, rota.q);
    ir(destino);
    return null;
  },

  async participacao(form) {
    const f = new FormData(form);
    const imovelId = Number(form.dataset.imovel);
    const emitenteId = Number(f.get('emitente_id'));
    const percentual = C.numero(f.get('percentual'));
    if (!(percentual > 0 && percentual <= 100)) throw new C.ErroUsuario('Percentual inválido: use um número entre 0 e 100.');
    await alterar((db) => {
      const existente = db.participacoes.find((p) => p.imovel_id === imovelId && p.emitente_id === emitenteId);
      if (existente) R.atualizar(db, 'participacoes', existente.id, { percentual }, login());
      else R.inserir(db, 'participacoes', { imovel_id: imovelId, emitente_id: emitenteId, percentual }, login());
    });
    aviso('Salvo.', 'ok');
    await mostrar();
  },

  pagamento: (form) => confirmarPagamentoBoleto(Number(form.dataset.id), new FormData(form)),

  /** Pagamento com valor diferente do previsto: a NF sai com o valor digitado (diferente do calculado) e a justificativa fica no histórico. */
  async pagamentoNf(form) {
    const p = memoria.pagamentoDivergente;
    if (!p || String(p.id) !== form.dataset.id) throw new C.ErroUsuario('Confirme o pagamento de novo.');
    const f = new FormData(form);
    const texto = String(f.get('valor_nf') || '').trim();
    const valorNf = texto ? C.centavos(texto) : null;
    const justificativa = String(f.get('justificativa') || '').trim();
    const r = await alterar((db) => {
      // pagou a menos é recusado na regra (não existe pagamento em parte, 2026-11-20)
      const res = R.registrarPagamento(db, p.id, p.data, p.valor, login(), { pagouEmDia: p.pagouEmDia, dataPagou: p.dataPagou, valorNf, justificativa });
      // veio da tela Banco (entrada do extrato com valor diferente do previsto): a movimentação fica ligada ao boleto
      if (p.movimentacao_id) Z.ligarMovimentacaoAoBoleto(db, p.movimentacao_id, p.id, login());
      return res;
    });
    memoria.pagamentoDivergente = null;
    const aMais = p.valor > r.valor_devido && valorNf === r.valor_nf ? p.valor - r.valor_devido : 0;
    aviso(aMais ? `Pagamento confirmado. Recebido ${reais(p.valor)}; NF de ${reais(valorNf)}. Ficaram ${reais(aMais)} anotados para devolver ao inquilino. Data da NF: ${dataBr(p.data)}.`
      : `Pagamento confirmado com valor diferente do previsto. Recebido ${reais(p.valor)}; NF de ${reais(valorNf)} (calculada ${reais(r.valor_nf)}). Data da NF: ${dataBr(p.data)}.`, 'aviso');
  },

  /** Pago a mais devolvido por fora do extrato (outra conta, dinheiro): anota a devolução no boleto (mensal-009). */
  async devolvidoAMao(form) {
    const data = String(new FormData(form).get('data') || '');
    const v = await alterar((db) => R.marcarDevolvidoAMao(db, Number(form.dataset.id), data, login()));
    aviso(`Devolução de ${reais(v)} anotada.`, 'ok');
    await mostrar();
    await mostrar();
  },

  async ajuste(form) {
    const f = new FormData(form);
    const valor = Math.abs(C.centavos(String(f.get('valor') || '').trim()));
    if (!valor) throw new C.ErroUsuario('Informe o valor do ajuste.');
    const motivo = String(f.get('motivo') || '').trim();
    if (!motivo) throw new C.ErroUsuario('Informe o motivo do ajuste (fica no histórico).');
    const cb = buscar('cobrancas', Number(form.dataset.id));
    const ressarcimento = f.get('tipo') === 'ressarcimento';
    // "-30,00" em cobrança adicional virava +R$ 30,00 em silêncio: o sinal se escolhe no tipo
    if (String(f.get('valor') || '').trim().startsWith('-')) throw new C.ErroUsuario('Digite o valor sem o sinal de menos: para descontar, escolha "Ressarcimento (−)".');
    if (cb) {
      const aluguel = cb.aluguel_mensal || cb.aluguel || 0;
      if (!ressarcimento && aluguel && valor > 3 * aluguel && !(await confirmar(`A cobrança adicional de ${reais(valor)} é mais de 3 vezes o aluguel (${reais(aluguel)}). Confira o valor.`, { titulo: 'Valor muito acima do aluguel', sim: 'Está certo, salvar', forte: true }))) return;
    }
    // cada ajuste entra na lista do boleto (pode ter vários); ressarcimento maior que o boleto é recusado na regra
    await alterar((db) => R.adicionarAjuste(db, Number(form.dataset.id), ressarcimento ? -valor : valor, motivo, login()));
    aviso('Ajuste salvo e registrado no histórico.');
    await mostrar();
  },

  async desfazerNumeracao(form) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario(SO_ADMIN_NUMERACAO);
    const n = Number(new FormData(form).get('numero'));
    if (!(await confirmar(`Todas as NFs com este número ou maior saem da lista (ficam no Histórico), os pagamentos voltam para a fila e o próximo número volta a ser ${R.numeroFatura(n)}.`, { titulo: `Desfazer a numeração a partir da NF nº ${R.numeroFatura(n)}?`, sim: 'Desfazer a numeração', forte: true }))) return;
    const qtd = await alterar((db) => R.desfazerNumeracao(db, n, login()));
    aviso(`${qtd} número(s) desfeito(s). Corrija o que precisar e clique em "Numerar as NFs marcadas".`);
    await mostrar();
  },
  async nfExterna(form) {
    const f = new FormData(form);
    // número que passa do próximo da sequência faz a numeração pular: pergunta antes (2026-11-20)
    const num = Number(f.get('numero'));
    const prox = d().proxima_fatura;
    if (Number.isInteger(num) && prox && num > prox && !(await confirmar(`O próximo número da sequência é ${R.numeroFatura(prox)}. Registrando a NF nº ${R.numeroFatura(num)}, a numeração vai pular de ${R.numeroFatura(prox)} para ${R.numeroFatura(num + 1)}. Confira se o número foi digitado certo.`,
      { titulo: 'A numeração das NFs vai pular', sim: 'Registrar assim mesmo', nao: 'Voltar e corrigir' }))) return;
    const n = await alterar((db) => R.registrarNfExterna(db, form.dataset.tipo, Number(form.dataset.id), f.get('numero'), String(f.get('emissao') || ''), login()));
    aviso(`NF nº ${R.numeroFatura(n)} registrada (emitida fora do sistema).`);
    await mostrar();
  },

  async indiceAcumulado(form) {
    const f = new FormData(form);
    const indice = String(f.get('indice') || '');
    const mesRef = String(f.get('mes_ref') || '');
    if (!/^\d{4}-\d{2}$/.test(mesRef)) throw new C.ErroUsuario('Informe o mês até onde vai o acumulado.');
    const percentual = C.numero(f.get('percentual'));
    if (String(f.get('percentual') || '').trim() === '') throw new C.ErroUsuario('Informe o percentual acumulado em 12 meses.');
    // o acumulado só existe de mês que já terminou; e um zero a mais (45 em vez de 4,5) iria para o reajuste de todos os contratos
    const mesAtual = C.competenciaDe(C.hojeIso());
    if (mesRef >= mesAtual) throw new C.ErroUsuario(`O acumulado vai até um mês que já terminou: ${compBr(mesRef)} ainda não fechou (hoje é ${dataBr(C.hojeIso())}).`);
    if (percentual > 30 || percentual < -10) {
      if (!(await confirmar(`${indice} acumulado até ${compBr(mesRef)}: ${pct(percentual)}. É bem fora do normal: um aluguel de R$ 2.000,00 iria a ${reais(C.aplicarCorrecao(200000, percentual))} no reajuste. Confira o número antes de salvar.`, { titulo: 'Índice fora do normal', sim: 'Está certo, salvar', forte: true }))) return;
    }
    await alterar((db) => {
      const existente = db.indices_acumulados.find((x) => x.indice === indice && x.mes_ref === mesRef);
      if (existente) R.atualizar(db, 'indices_acumulados', existente.id, { percentual }, login(), `${indice} até ${compBr(mesRef)}: ${pct(percentual)}`);
      else R.inserir(db, 'indices_acumulados', { indice, mes_ref: mesRef, percentual }, login(), `${indice} até ${compBr(mesRef)}: ${pct(percentual)}`);
    });
    aviso('Índice salvo.');
    await mostrar();
  },
  /**
   * Reajuste (tela Reajustes): sem mexer, vale o índice cadastrado; com o % mudado, vale o %; com o aluguel cheio ou o
   * bonificado mudado, vale o aluguel cheio (o % é recalculado). Sem índice cadastrado, é preciso digitar um deles.
   */
  async aplicarReajusteManual(form) {
    const f = new FormData(form);
    const origem = form.dataset.origem || '';
    const pctIndice = form.dataset.pctIndice === '' || form.dataset.pctIndice === undefined ? null : Number(form.dataset.pctIndice);
    const temPct = String(f.get('percentual') || '').trim() !== '';
    const pctDigitado = temPct ? C.numero(f.get('percentual')) : null;
    const valor = String(f.get('valor_novo') || '').trim() ? C.centavos(f.get('valor_novo')) : 0;
    if (!temPct && !(valor > 0)) throw new C.ErroUsuario('Digite o % da correção ou o novo valor do aluguel.');
    // não mexeu (ou voltou ao % do índice): correção pelo índice cadastrado
    let manual = null;
    if (['valor_novo', 'bonificado'].includes(origem) && valor > 0) manual = valor === C.aplicarCorrecao(Number(form.dataset.atual), pctIndice ?? NaN) ? null : { valor_novo: valor };
    else if (pctIndice === null || (temPct && pctDigitado !== pctIndice)) manual = temPct ? { percentual: pctDigitado } : { valor_novo: valor };
    const bon = String(f.get('bonificado') || '').trim();
    const texto = manual === null ? `${pct(pctIndice)} (índice cadastrado)` : manual.valor_novo ? `o novo aluguel de ${reais(manual.valor_novo)}` : pct(manual.percentual);
    if (!(await confirmar(`Correção do aluguel de ${compBr(form.dataset.comp)} com ${texto}.${valor > 0 ? ` Aluguel cheio ${reais(valor)}${bon ? `, com bonificação R$ ${bon}` : ''}.` : ''} Os boletos em aberto são recalculados.`, { titulo: 'Registrar a correção do aluguel?', sim: 'Aplicar correção' }))) return;
    await aplicarReajusteNaTela(Number(form.dataset.contrato), form.dataset.comp, manual);
  },

  /** Valor da guia calculado pelo contador (vazio apaga). */
  async guiaImposto(form) {
    const texto = String(new FormData(form).get('valor') || '').trim();
    const valor = texto ? C.centavos(texto) : null;
    if (valor !== null && !(valor >= 0)) throw new C.ErroUsuario('Valor inválido. Digite só o valor, como 1.234,56 (ou deixe em branco para apagar).');
    const { emitente, imposto, periodo } = form.dataset;
    await alterar((db) => R.salvarGuiaImposto(db, Number(emitente), imposto, periodo, valor, login()));
    aviso(valor === null ? 'Valor do contador apagado.' : 'Valor do contador salvo.');
    await mostrar();
  },

  /**
   * Formulário que só leva a outra tela (mês, período, filtro, busca): <form data-form="ir" data-ir="cobrancas">.
   * Os campos preenchidos viram os parâmetros do endereço (enderecoDoFormulario).
   */
  ir: (form) => ir(enderecoDoFormulario(form.dataset.ir, new FormData(form))),

  async logo(form) {
    const arquivo = new FormData(form).get('arquivo');
    if (!arquivo || !arquivo.size) throw new C.ErroUsuario('Escolha o arquivo da logo.');
    const dataUrl = await reduzirImagem(arquivo);
    await alterar((db) => {
      R.registrar(db, login(), 'Alteração', null, null, db.logo ? 'Logo da empresa trocada' : 'Logo da empresa enviada');
      db.logo = dataUrl;
    });
    aviso(E.nuvem ? 'Logo salva. Agora enquadre o ícone do aplicativo logo abaixo.' : 'Logo salva.');
    await mostrar();
    document.getElementById('icone-app')?.scrollIntoView({ block: 'start' });
  },

  /** Página do inquilino → "Alertas deste inquilino": desliga o tipo escolhido para ele (R.desligarAlerta). */
  async desligarAlerta(form) {
    const tipo = String(new FormData(form).get('tipo') || '');
    const c = buscar('contratos', form.dataset.contrato);
    if (!c || !(await confirmar(`O sistema deixa de avisar "${tipo}" para ${c.inquilino_nome} até alguém religar.`, { titulo: 'Desligar o alerta?', sim: 'Desligar o alerta' }))) return;
    await alterar((db) => R.desligarAlerta(db, tipo, { contrato_id: c.id }, login(), { quem: E.usuario.nome }));
    aviso(`Alerta "${tipo}" desligado para ${c.inquilino_nome}. Para voltar a avisar, use "Religar" aqui ou no Painel.`);
    await mostrar();
  },

  async estilosAlertas(form) {
    const f = Object.fromEntries(new FormData(form));
    const estilos = {};
    for (let n = 0; f[`tipo_${n}`] !== undefined; n += 1) estilos[f[`tipo_${n}`]] = { cor: f[`cor_${n}`], enfase: f[`enfase_${n}`], prioridade: f[`prioridade_${n}`] };
    const antecedencias = {};
    for (let n = 0; f[`tipo_${n}`] !== undefined; n += 1) if (f[`antecedencia_${n}`] !== undefined) antecedencias[f[`tipo_${n}`]] = f[`antecedencia_${n}`];
    await alterar((db) => R.salvarEstilosAlertas(db, estilos, login(), antecedencias));
    aviso('Alertas salvos.');
    ir('#/');
  },

  async proximaFatura(form) {
    const n = Number(new FormData(form).get('numero'));
    if (!Number.isInteger(n) || n < 1) throw new C.ErroUsuario('Digite um número inteiro a partir de 1 para a próxima NF.');
    const ultima = R.ultimaFatura(E.d);
    if (ultima && n <= ultima.numero && !(await confirmar(`Já existe a NF nº ${R.numeroFatura(ultima.numero)}. Usar ${R.numeroFatura(n)} vai repetir números de NF.`, { titulo: 'Repetir número de NF?', sim: 'Usar mesmo assim', forte: true }))) return;
    await alterar((db) => {
      R.registrar(db, login(), 'Alteração', 'faturas', null, 'Próximo número de NF', { proxima_fatura: { de: db.proxima_fatura, para: n } });
      db.proxima_fatura = n;
    });
    aviso('Numeração atualizada.');
    await mostrar();
  },

  async importar(form) {
    const f = new FormData(form);
    const arq = f.get('zip');
    if (!arq || !arq.size) throw new C.ErroUsuario('Escolha o arquivo ZIP.');
    if (f.get('confirmo') !== '1') throw new C.ErroUsuario('Marque a confirmação: a importação substitui os dados desta pasta.');
    const JSZip = await jsZip();
    const lidos = {};
    const novos = await S.importarZip(JSZip, E.pasta, arq, E.d, lidos);
    E.d = novos;
    await alterar((db) => R.registrar(db, login(), 'Importação', 'banco', null, `Dados importados de ${arq.name}${lidos.naoIncluidos.length ? ` (${lidos.naoIncluidos.length} anexo(s) não estavam no ZIP)` : ''}`, null, {}, false));
    E.usuario = E.d.usuarios.find((u) => u.login === E.usuario.login && u.ativo) || null;
    renovarUsuario();
    aviso(`Dados importados. Uma cópia do banco anterior ficou na pasta backups.${foraDoZip(lidos)}`, lidos.naoIncluidos.length ? 'aviso' : 'ok');
    ir('#/');
  },

  /** Sistema: configuração geral da integração com o banco (ponte, senha, ativar, conta padrão). Só administrador. */
  async configBanco(form) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador altera a integração com o banco.');
    const f = new FormData(form);
    // endereço e senha da ponte: só neste navegador (IndexedDB); o que é compartilhado vai para o JSON
    await BANCO.salvarPonteLocal({ ponte_url: f.get('ponte_url'), senha_ponte: f.get('senha_ponte') });
    await alterar((db) => R.salvarConfigBanco(db, { ativo: f.get('ativo') === '1' }, login()));
    aviso(E.d.config_banco.ativo ? 'Integração com o C6 ativa: os botões "Emitir no C6" estão ligados neste computador.' : 'Configuração salva (integração desligada). A senha da ponte ficou só neste computador.');
    await mostrar();
  },

  /** Sistema → Banco: qual conta emite os boletos (sempre a padrão ou escolher boleto a boleto). */
  async modoContaBoleto(form) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador altera a integração com o banco.');
    const f = new FormData(form);
    await alterar((db) => R.salvarConfigBanco(db, { modo_conta_boleto: f.get('modo'), conta_padrao_id: f.get('conta_padrao_id') || undefined }, login()));
    aviso(f.get('modo') === 'escolher' ? 'Ao emitir, o sistema vai perguntar a empresa de cada boleto.' : 'Os boletos saem sempre pela empresa padrão.');
    await mostrar();
  },

  /** Sistema: inclui ou altera uma conta bancária da integração (uma por empresa). */
  async contaBanco(form) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador altera a integração com o banco.');
    const f = Object.fromEntries(new FormData(form));
    const conta = await alterar((db) => R.salvarContaBanco(db, f, login()));
    aviso(`Conta ${conta.apelido} salva. Lembre de pedir ao técnico para cadastrar a mesma conta (código "${conta.id}") na ponte.`);
    await mostrar();
  },

  /** Sistema: inclui ou altera uma conta de outro banco (só o extrato por arquivo OFX ou CSV, sem a ponte). */
  async contaArquivo(form) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador altera as contas do banco.');
    const f = Object.fromEntries(new FormData(form));
    const conta = await alterar((db) => R.salvarContaArquivo(db, f, login()));
    aviso(`Conta ${conta.apelido} salva. Na tela Banco, abra a aba dela e importe o arquivo do extrato (OFX ou CSV).`);
    await mostrar();
  },

  async modeloExcel(form) {
    const arq = new FormData(form).get('modelo');
    if (!arq || !arq.size) throw new C.ErroUsuario('Escolha a planilha (arquivo .xlsx) antes de continuar.');
    const ExcelJS = await excelJs();
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await arq.arrayBuffer());
    } catch {
      throw new C.ErroUsuario('Não consegui abrir este arquivo como planilha do Excel. Escolha um arquivo .xlsx (no Excel: Salvar como → Pasta de Trabalho do Excel).');
    }
    const dir = await E.pasta.getDirectoryHandle(S.PASTA_MODELOS, { create: true });
    await S.escreverTexto(dir, S.MODELO_FATURA, arq);
    await alterar((db) => R.registrar(db, login(), 'Alteração', 'banco', null, `Modelo Excel da NF enviado (abas: ${wb.worksheets.map((w) => w.name).join(', ')})`));
    aviso('Modelo salvo.');
    await mostrar();
  },
};

// Banco (extrato, comprovantes e pagamentos pelo C6): formulários em telas/banco.js
Object.assign(FORMULARIOS, FORMULARIOS_BANCO, FORMULARIOS_EMAILS, FORMULARIOS_NOTIFICACOES, FORMULARIOS_COMUNICACOES, adiados('formularios'));


/** Pagamento no futuro (31/12/2027) passava com um OK e o sistema calculava multa e juros até lá: agora é recusado. */
export function pagamentoNaoFuturo(data, dataPagou = null) {
  const hoje = C.hojeIso();
  for (const x of [data, dataPagou]) if (x && x > hoje) throw new C.ErroUsuario(`A data do pagamento (${dataBr(x)}) é depois de hoje (${dataBr(hoje)}). Confira o dia em que o dinheiro entrou.`);
}

/**
 * Confirma o pagamento de um boleto (linha da tabela, página do boleto ou janela "Confirmar pagamento"). ``f``: FormData com
 * data (contábil), pagou (se atrasou), valor (opcional) e em_dia. Valor diferente do previsto abre a justificativa e segue na página do boleto.
 */
export async function confirmarPagamentoBoleto(id, f) {
  const data = String(f.get('data') || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new C.ErroUsuario('Informe a data do pagamento.');
  const valor = String(f.get('valor') || '').trim() ? C.centavos(f.get('valor')) : null;
  const pagouEmDia = f.get('em_dia') === '1';
  const dataPagou = String(f.get('pagou') || '') || null;
  const cb = buscar('cobrancas', id);
  pagamentoNaoFuturo(data, dataPagou);
  await confirmarAvisos([
    dataMuitoAntiga(data, 'A data do pagamento'),
    cb && data < C.somarDias(cb.vencimento, -40) ? `A data do pagamento (${dataBr(data)}) é bem antes do vencimento (${dataBr(cb.vencimento)}).` : '',
  ].filter(Boolean));
  // valor recebido diferente do previsto: justificativa e, na página do boleto, o valor da NF digitado à mão
  const previsto = cb && R.previstoNoPagamento(cb, data, { pagouEmDia, dataPagou });
  // zero, negativo ou menor que o devido (também no boleto de controle) é recusado: não existe pagamento em parte (2026-11-20);
  // o complemento da caução só pelo valor exato do boleto
  if (cb) R.conferirValorRecebido(cb, valor, previsto.valor_devido);
  if (cb && valor !== null && valor !== previsto.valor_devido && !R.ehComplementoCaucao(cb) && R.geraNf(buscar('contratos', cb.contrato_id))) {
    if (dataPagou && dataPagou > data) throw new C.ErroUsuario('O dia em que pagou não pode ser depois do dia em que o dinheiro entrou na conta.');
    const dif = valor - previsto.valor_devido;
    const resp = await janela({ titulo: 'Valor diferente do previsto',
      html: `<p>Previsto para ${dataBr(pagouEmDia ? cb.vencimento : dataPagou || data)}: <b>${reais(previsto.valor_devido)}</b><br>Recebido: <b>${reais(valor)}</b><br>
        Diferença: <b class="${dif < 0 ? 'negativo' : ''}">${dif > 0 ? '+' : '−'}${reais(Math.abs(dif))}</b></p>
        ${dif > 0 ? `<p>Pagou a mais: na página do boleto, confirmando com a NF no valor calculado, os ${reais(dif)} ficam anotados como <b>a devolver ao inquilino</b>.</p>` : ''}
        <p><label>Justificativa da divergência${dif > 0 ? ' (opcional)' : ''}</label><textarea name="justificativa" rows="3"${dif > 0 ? '' : ' required'}></textarea></p>
        <p class="suave">Fica só no sistema (não sai na NF nem no boleto). Em seguida, ${dif > 0 ? 'confira' : 'informe'} o valor da NF na página do boleto.</p>`,
      sim: 'Continuar', nao: 'Cancelar' });
    const justificativa = resp && String((resp.justificativa || [])[0] || '').trim();
    if (!resp) return;
    if (!justificativa && dif < 0) throw new C.ErroUsuario('Informe a justificativa da divergência. Nada foi salvo.');
    memoria.pagamentoDivergente = { id: cb.id, data, valor, pagouEmDia, dataPagou, justificativa };
    ir(`#/cobranca/${cb.id}?ir=pagamento`);
    return;
  }
  const r = await alterar((db) => R.registrarPagamento(db, id, data, valor, login(), { pagouEmDia, dataPagou }));
  const pago = buscar('cobrancas', id);
  const contratoPago = pago && buscar('contratos', pago.contrato_id);
  // a caução de verdade depois do pagamento (parcela paga fora da ordem: só ela entrou), não o "nova" gravado no boleto
  if (pago && R.ehComplementoCaucao(pago)) aviso(`Complemento da caução pago${r.pontual ? '' : ` com ${C.plural(r.dias_atraso, 'dia')} de atraso`}: a caução passou a ${reais(contratoPago ? R.valorGarantia(d(), contratoPago) : pago.caucao_nova)}. Sem NF.`, 'ok');
  // boleto de controle (inquilino sem NF): sem "valor da nota" nem "data da NF"
  else if (contratoPago && !R.geraNf(contratoPago)) aviso(r.pontual ? `Pagamento em dia confirmado${pagouEmDia ? ' (sem multa e juros)' : ''}: recebido ${reais(pago.valor_pago)} em ${dataBr(data)}. Boleto de controle: sem NF.`
    : `Pagamento com ${C.plural(r.dias_atraso, 'dia')} de atraso: multa ${reais(r.multa)} e juros ${reais(r.juros)}; recebido ${reais(pago.valor_pago)} em ${dataBr(data)}. Boleto de controle: sem NF.`, r.pontual ? 'ok' : 'aviso');
  else aviso(r.pontual ? `Pagamento em dia confirmado${pagouEmDia ? ' (sem multa e juros)' : ''}. Data da NF: ${dataBr(data)}. Valor da nota: ${reais(r.valor_nf)}.`
    : `Pagamento com ${C.plural(r.dias_atraso, 'dia')} de atraso: multa ${reais(r.multa)} e juros ${reais(r.juros)}. Valor da nota: ${reais(r.valor_nf)} (com multa e juros). Data da NF: ${dataBr(data)}.`, r.pontual ? 'ok' : 'aviso');
  avisarImovelSemEmpresa(pago);
  // pago à mão com o boleto ainda aberto no C6: o inquilino pode pagar de novo (ou ser negativado já tendo pago)
  if (pago && pago.banco && pago.banco.situacao === 'emitido' && !pago.pagamento_c6) aviso('Atenção: este boleto continua em aberto no C6. Se o pagamento foi por fora do boleto (Pix direto, dinheiro), cancele no banco na página do boleto ("Cancelar no banco"); se foi pelo boleto, use "Consultar situação no banco".', 'aviso');
  await mostrar();
}
