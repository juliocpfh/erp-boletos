// Tela da nuvem: conflitos para escolher (mesmo campo mudado em dois aparelhos sem internet) e mudanças recusadas.
import { alterar, aviso, baixar, E, ir, janela, login, mostrar, podeUsuario, reabrirSessao } from '../app.js';
import * as S from '../armazenamento.js';
import * as B from '../backup-seguro.js';
import { dataBr, dataHoraBr, ErroUsuario, hojeIso } from '../calculos.js';
import { esc } from '../formularios.js';
import * as N from '../nuvem.js';
import * as R from '../regras.js';
import { botao, carregarParte, etiqueta, link, nomePastaContrato, pastaPaiContrato, renomearNoDisco } from './comum.js';

/**
 * Campo derivado: a pasta dos arquivos sai do nome do imóvel (e, no contrato, do nome e das datas do inquilino). Não é um
 * conflito à parte: acompanha a escolha dos outros campos e a pasta dos anexos é renomeada junto (antes, mudar o nome do
 * imóvel em dois aparelhos dava dois conflitos e dava para ficar com o nome de um e a pasta do outro).
 */
const PASTA_DERIVADA = { imoveis: (r) => S.limparNome(r.nome), contratos: (r) => nomePastaContrato(r) };
const ehPastaDerivada = (c) => c.tipo === 'campo' && c.campo === 'pasta' && !!PASTA_DERIVADA[c.tabela];

/** Depois de uma escolha: fecha os conflitos da pasta do registro, grava a pasta certa e renomeia a pasta dos anexos. */
async function acertarPastaDerivada(tabela, id, candidatos = []) {
  const calcular = PASTA_DERIVADA[tabela];
  if (!calcular) return;
  const doRegistro = (E.nuvem.conflitos || []).filter((x) => x.tipo === 'campo' && x.tabela === tabela && x.reg_id === String(id));
  if (doRegistro.some((x) => x.campo !== 'pasta')) return; // outro campo ainda em disputa: a pasta espera a escolha dele
  const antes = (E.d[tabela] || []).find((x) => x.id === id);
  if (!antes) return;
  const esperada = calcular(antes);
  const nomes = [antes.pasta, ...candidatos];
  for (const x of doRegistro) {
    nomes.push(x.atual, x.proposto);
    await E.nuvem.resolver(x.id, x.proposto === esperada ? 'proposto' : 'atual');
  }
  E.d = E.nuvem.atual();
  const r = (E.d[tabela] || []).find((x) => x.id === id);
  if (!r) return;
  if (r.pasta !== esperada) await alterar((db) => R.atualizar(db, tabela, id, { pasta: esperada }, login(), 'Pasta dos arquivos acertada pela escolha do conflito'));
  const velhos = [...new Set(nomes.filter((v) => typeof v === 'string' && v && v !== esperada))];
  if (!velhos.length || !E.pasta) return;
  const pai = tabela === 'contratos' ? pastaPaiContrato(r) : [];
  try {
    const dir = await S.subpasta(await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true }), pai);
    for (const nome of velhos) {
      let existe = true;
      try { await dir.getDirectoryHandle(nome); } catch { existe = false; }
      if (existe) { await renomearNoDisco(pai, nome, esperada); break; }
    }
  } catch (e) {
    aviso(`Não consegui acertar a pasta dos arquivos ("${esperada}"): ${e.message}`, 'aviso');
  }
}

const valorTexto = (v) => {
  if (v === null || v === undefined || v === '') return '(vazio)';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 200);
  return String(v);
};
const nomeDoRegistro = (c) => {
  if (c.tabela === '_raiz') return 'Configuração geral';
  const r = (E.d[c.tabela] || []).find((x) => String(x.id) === c.reg_id);
  const rotulo = R.TABELAS[c.tabela] || c.tabela;
  const nome = r && (r.nome || r.descricao || r.inquilino_nome || r.competencia || r.numero);
  return `${rotulo} nº ${c.reg_id}${nome ? ` (${valorTexto(nome)})` : ''}`;
};
const quando = (t) => (t ? dataHoraBr(t) : '');

/** Campos que não aparecem com o valor (senha e login lembrado): só o nome. */
const SEM_VALOR = new Set(['senha_hash', 'senha_sal', 'senha_iteracoes', 'sessoes']);
const MOSTRAR_MUDANCAS = 8;
const curto = (v) => { const t = valorTexto(v); return t.length > 60 ? `${t.slice(0, 60)}…` : t; };

/** Uma mudança recusada em palavras (ex.: "Imóvel nº 1 (Apto 604): nome «Apto 604» → «Sala»"). Histórico: null (acompanha as outras). */
function descreverMudanca(o) {
  if (o.op === 'historico') return null;
  if (o.op === 'raiz') return `Configuração geral: ${o.campo}`;
  const reg = o.op === 'inserir' ? o.dados : (E.d[o.tabela] || []).find((x) => x.id === o.id) || o.base;
  const nome = reg && (reg.nome || reg.descricao || reg.inquilino_nome || reg.competencia || reg.numero);
  const quem = `${R.TABELAS[o.tabela] || o.tabela} nº ${o.id}${nome ? ` (${curto(nome)})` : ''}`;
  if (o.op === 'inserir') return `${quem}: incluído`;
  if (o.op === 'excluir') return `${quem}: excluído`;
  const campos = Object.entries(o.campos || {}).map(([c, v]) => (SEM_VALOR.has(c) || o.tabela === 'usuarios' ? c : `${c} «${curto(v.antes)}» → «${'depois' in v ? curto(v.depois) : '(apagado)'}»`));
  return `${quem}: ${campos.join('; ')}`;
}

/** O que a gravação recusada mudava, em até MOSTRAR_MUDANCAS linhas (sem as entradas do histórico, salvo se só houver elas). */
function resumoDaRecusa(ops) {
  if (!ops) return '<span class="suave">(recusada antes de o sistema guardar os detalhes)</span>';
  let linhas = ops.map(descreverMudanca).filter(Boolean);
  if (!linhas.length) linhas = ops.filter((o) => o.op === 'historico').map((o) => `Histórico: ${o.entrada?.descricao || o.entrada?.acao || ''}`);
  const mais = linhas.length - MOSTRAR_MUDANCAS;
  return `<ul>${linhas.slice(0, MOSTRAR_MUDANCAS).map((l) => `<li>${esc(l)}</li>`).join('')}${mais > 0 ? `<li class="suave">e mais ${mais} mudança(s) (baixe para ver todas)</li>` : ''}</ul>`;
}

export async function telaConflitos() {
  if (!E.nuvem) return '<h1>Conflitos</h1><p class="suave">Só existem com os dados na nuvem.</p>';
  // a pasta dos arquivos acompanha o nome (não aparece como conflito à parte); sozinha (o nome num aparelho e as datas no
  // outro, por exemplo), vira uma linha só, que a acerta pelo que ficou gravado
  const todos = E.nuvem.conflitos;
  const comOutro = (c) => todos.some((x) => x.tipo === 'campo' && !ehPastaDerivada(x) && x.tabela === c.tabela && x.reg_id === c.reg_id);
  const pastasSoltas = new Map(todos.filter((c) => ehPastaDerivada(c) && !comOutro(c)).map((c) => [`${c.tabela}:${c.reg_id}`, c]));
  const conflitos = todos.filter((c) => !ehPastaDerivada(c));
  const linhaPasta = (c) => `<tr><td>${esc(nomeDoRegistro(c))}</td><td><b>pasta dos arquivos</b></td><td colspan="2">${esc(`Os dois aparelhos mudaram o que dá o nome da pasta (${valorTexto(c.atual)} / ${valorTexto(c.proposto)}). Ela acompanha o que ficou gravado no cadastro.`)}</td>
    <td>${podeUsuario('admin') ? botao('acertarPastaConflito', 'Acertar a pasta', { tabela: c.tabela, id: c.reg_id }, 'secundario pequeno') : ''}</td></tr>`;
  const recusas = await Promise.all(E.nuvem.recusas.map(async (r) => ({ ...r, id: r.id || r.lote, ops: await E.nuvem.lerRecusa(r.id || r.lote).catch(() => null) })));
  const naoEnviados = E.anexos?.naoEnviados || [];
  const pode = podeUsuario('admin'); // só o administrador escolhe (a nuvem também confere)
  const linhas = conflitos.map((c) => {
    if (c.tipo === 'campo') {
      const comPasta = PASTA_DERIVADA[c.tabela] && todos.some((x) => ehPastaDerivada(x) && x.tabela === c.tabela && x.reg_id === c.reg_id);
      return `<tr><td>${esc(nomeDoRegistro(c))}</td><td><b>${esc(c.campo)}</b>${comPasta ? '<br><span class="suave">a pasta dos arquivos acompanha</span>' : ''}</td>
        <td>${esc(valorTexto(c.atual))}<br><span class="suave">${esc(c.por_atual || '')}</span></td>
        <td>${esc(valorTexto(c.proposto))}<br><span class="suave">${esc(c.por_proposto || '')} · ${esc(quando(c.em))}</span></td>
        <td>${pode ? `${botao('resolverConflito', 'Fica o 1º', { conflito: c.id, escolha: 'atual' }, 'secundario pequeno')} ${botao('resolverConflito', 'Fica o 2º', { conflito: c.id, escolha: 'proposto' }, 'secundario pequeno')}` : ''}</td></tr>`;
    }
    if (c.tipo === 'lote') {
      // exclusão em grupo (ex.: o contrato e os boletos dele) que esbarrou em registro mudado em outro aparelho: nada dela valeu
      const mudados = (Array.isArray(c.atual) ? c.atual : []).map((x) => nomeDoRegistro({ tabela: x.tabela, reg_id: String(x.id) })).join('; ');
      const n = Number(c.proposto?.excluidos) || 0;
      return `<tr><td>${esc(nomeDoRegistro(c))}</td><td colspan="3">${esc(`${c.por_proposto || 'Alguém'} excluiu este registro junto com ${Math.max(0, n - 1)} outro(s), mas ${c.por_atual || 'outra pessoa'} tinha mudado antes: ${mudados}. Nada da exclusão valeu ainda (${quando(c.em)}).`)}</td>
        <td>${pode ? `${botao('resolverConflito', 'Excluir tudo', { conflito: c.id, escolha: 'excluir' }, 'secundario pequeno', 'Excluir o registro e todos os que iam junto, apesar da mudança feita no outro aparelho?')} ${botao('resolverConflito', 'Manter tudo', { conflito: c.id, escolha: 'manter' }, 'secundario pequeno')}` : ''}</td></tr>`;
    }
    const [a, b, txt] = c.tipo === 'exclusao'
      ? ['excluir', 'manter', `${c.por_proposto || 'Alguém'} excluiu, mas ${c.por_atual || 'outra pessoa'} tinha mudado antes`]
      : ['manter_excluido', 'recriar', `${c.por_proposto || 'Alguém'} mudou, mas ${c.por_atual || 'outra pessoa'} tinha excluído antes`];
    return `<tr><td>${esc(nomeDoRegistro(c))}</td><td colspan="3">${esc(txt)} (${esc(quando(c.em))})</td>
      <td>${pode ? `${botao('resolverConflito', a === 'excluir' ? 'Excluir' : 'Deixar excluído', { conflito: c.id, escolha: a }, 'secundario pequeno')} ${botao('resolverConflito', b === 'manter' ? 'Manter' : 'Recriar com a mudança', { conflito: c.id, escolha: b }, 'secundario pequeno')}` : ''}</td></tr>`;
  }).join('') + [...pastasSoltas.values()].map(linhaPasta).join('');
  return `<h1>Conflitos da nuvem</h1>
    <div class="caixa"><h2>Para escolher</h2>
      <p class="suave">O mesmo campo foi mudado em dois aparelhos sem internet. O sistema não escolhe sozinho: até o <b>administrador</b> escolher, fica o 1º valor (o que chegou primeiro à nuvem) e o 2º espera.${pode ? '' : ' Avise o administrador.'}</p>
      ${conflitos.length || pastasSoltas.size ? `<div class="rolagem"><table class="responsiva"><tr><th>Registro</th><th>Campo</th><th>1º valor</th><th>2º valor</th><th></th></tr>${linhas}</table></div>` : '<p>Nenhum conflito. ✓</p>'}
    </div>
    ${recusas.length ? `<div class="caixa"><h2>Mudanças recusadas pela nuvem</h2>
      <p class="suave">Estas gravações feitas neste aparelho não foram aceitas e não valem (a tela já voltou ao que vale). Veja o que eram e o motivo; refaça o que ainda precisar. "Baixar" guarda o detalhe num arquivo.</p>
      ${recusas.map((r) => `<div class="cartao"><p><b>${esc(quando(r.em))}</b> · ${Number(r.mudancas) || 0} mudança(s)<br>Motivo: <b>${esc(r.erro)}</b>${r.causa ? `<br>Isto aconteceu porque a gravação de ${esc(quando((recusas.find((x) => x.id === r.causa) || {}).em) || 'antes')} também foi recusada: ela criava o registro que esta mudava. Refaça aquela primeiro.` : ''}</p>
        ${resumoDaRecusa(r.ops)}
        <div class="acoes">${r.ops ? botao('baixarRecusa', 'Baixar', { id: r.id }, 'secundario pequeno') : ''} ${botao('esquecerRecusa', 'Esquecer', { id: r.id }, 'secundario pequeno')}</div></div>`).join('')}
      ${recusas.length > 1 ? botao('esquecerRecusas', 'Esquecer todas', {}, 'secundario', 'Esquecer todas as mudanças recusadas? Elas não estão na nuvem e somem deste aparelho.') : ''}</div>` : ''}
    ${naoEnviados.length ? `<div class="caixa"><h2>Anexos que a nuvem não aceitou</h2>
      <p class="suave">Foram anexados sem internet e, ao enviar, a nuvem recusou. O arquivo continua neste aparelho: baixe e anexe de novo (ou esqueça).</p>
      <ul>${naoEnviados.map((f) => `<li>${esc(quando(f.em))}: <b>${esc(f.partes.join(' / '))}</b> · ${esc(f.erro)}
        ${botao('baixarNaoEnviado', 'Baixar', { id: f.id }, 'secundario pequeno')} ${botao('esquecerNaoEnviado', 'Esquecer', { id: f.id }, 'secundario pequeno')}</li>`).join('')}</ul></div>` : ''}`;
}

const mb = (b) => `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

/**
 * Dia de um backup da nuvem pelo nome (`imoveis-dados-AAAA-MM-DD[-antes-da-substituicao].json`, ou `.bkp` quando o servidor já
 * tem a chave do backup seguro: cifrado, abre só com a senha do backup).
 */
const diaDoBackup = (nome) => (nome.match(/^imoveis-dados-(\d{4}-\d{2}-\d{2})(-(.+?))?\.(json|bkp)$/) || []).slice(1, 4);
const cifrado = (nome) => nome.endsWith(B.EXTENSAO);
const pastaBackups = () => E.pasta.getDirectoryHandle(S.PASTA_BACKUPS);
/** O momento que o backup guarda: o do dia é feito às 3h (horário de Brasília) e leva a data desse dia (o de 09/11 = como estava às 3h de 09/11). */
const momentoDoBackup = (dia, motivo) => (motivo ? `logo antes da substituição feita em ${dataBr(dia)}` : `às 3h de ${dataBr(dia)}`);

/** Backups diários dos dados da nuvem (30 dias, feitos pelo servidor): baixar ou voltar para um dia. Só administrador. */
export async function telaBackupsNuvem() {
  if (!E.nuvem) return '<h1>Backups da nuvem</h1><p class="suave">Só existem com os dados na nuvem.</p>';
  if (!podeUsuario('admin')) return '<h1>Acesso só para administradores</h1>';
  let lista;
  try { lista = (await S.listar(await pastaBackups())).filter((a) => diaDoBackup(a.nome).length); } catch (e) {
    return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Backups da nuvem</h1><div class="alerta erro">${esc(e.message)}</div>`;
  }
  lista.sort((a, b) => b.nome.localeCompare(a.nome));
  const linhas = lista.map((a) => {
    const [dia, , motivo] = diaDoBackup(a.nome);
    return `<tr><td>${dataBr(dia)}</td><td>${motivo ? 'cópia feita logo antes de substituir os dados' : 'como os dados estavam às 3h desse dia'}${cifrado(a.nome) ? ' · 🔒 cifrado' : ''}</td><td class="n">${a.tamanho >= 1048576 ? mb(a.tamanho) : `${Math.max(1, Math.round(a.tamanho / 1024))} KB`}</td>
      <td>${botao('baixarBackupNuvem', 'Baixar', { nome: a.nome }, 'secundario pequeno')} ${botao('restaurarBackupNuvem', 'Voltar para este dia', { nome: a.nome }, 'perigo pequeno')}</td></tr>`;
  }).join('');
  // exemplo com o backup do dia mais recente (ou hoje): "o de 09/11 é como os dados estavam às 3h de 09/11"
  const exemplo = dataBr(lista.map((a) => diaDoBackup(a.nome)).find(([, , motivo]) => !motivo)?.[0] || hojeIso()).slice(0, 5);
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Backups da nuvem</h1>
    <div class="cartao"><p>O servidor guarda uma cópia do banco de dados por dia (os 30 dias mais recentes), feita às 3h da manhã (horário de Brasília): o backup de ${exemplo} é como os dados estavam às 3h de ${exemplo}. Os anexos não entram: eles ficam guardados uma vez só e não mudam.</p>
      <p>${lista.some((a) => cifrado(a.nome)) ? '🔒 Os backups marcados como cifrados só abrem com a <b>senha do backup seguro</b> (a mesma da pasta segura): quem tiver acesso ao servidor não consegue ler os dados.' : 'Os backups estão <b>sem cifrar</b>. Ligue o backup seguro neste computador (Dados e backup → Backup seguro): os próximos backups da nuvem passam a sair cifrados com a senha do backup.'}</p>
      <p><b>Voltar para este dia</b> troca os dados da nuvem pelos daquele backup (antes, o servidor guarda uma cópia de como estava agora). Tudo o que foi lançado depois das 3h daquele dia se perde, em todos os aparelhos. Use só em caso de erro geral.</p>
      <div class="rolagem"><table><tr><th>Dia</th><th>O que é</th><th class="n">Tamanho</th><th></th></tr>${linhas || '<tr><td colspan="4" class="suave">Nenhum backup ainda (o primeiro é feito às 3h da manhã).</td></tr>'}</table></div></div>`;
}

/** Um acesso em palavras (ex.: "Abriu Apto 1/Inquilinos/Ana/rg.pdf"). */
export function descreverAcesso(rota) {
  const m = /^(PUT|DELETE|POST) (.*)$/.exec(String(rota || ''));
  const metodo = m ? m[1] : 'GET'; const r = m ? m[2] : String(rota || '');
  if (r === 'dados/tudo') return 'Baixou o banco de dados inteiro';
  if (r.startsWith('dados/importar')) return r.includes('voltar') ? 'Voltou os dados da nuvem para um backup' : r.includes('substituir') ? 'Substituiu os dados da nuvem' : 'Carga inicial dos dados na nuvem';
  if (r.startsWith('aparelho/entrar')) { const pc = (/\((.+)\)$/.exec(r) || [])[1]; return `Programa do PC: entrar${pc ? ` (computador ${pc})` : ''}`; }
  if (r.startsWith('arquivos/')) return `${{ PUT: 'Anexou', DELETE: 'Apagou' }[metodo] || 'Abriu'} ${r.slice(9)}`;
  if (r.startsWith('backups/')) return `Baixou o backup ${r.slice(8)}`;
  if (/^lista(-tudo)?\/backups/.test(r)) return 'Viu a lista dos backups';
  if (r === 'mover') return 'Moveu ou renomeou uma pasta de arquivos';
  if (r === 'apagar') return 'Apagou uma pasta de arquivos (vai para a lixeira por 30 dias)';
  if (r === 'email/enviar') return 'Mandou um e-mail pela conta da empresa';
  if (r.startsWith('ficha-online/')) return `Ficha pela internet: ${metodo === 'GET' ? 'consultou' : 'mexeu em'} ${r.slice(13)}`;
  return r;
}
const tamanho = (b) => (b === null || b === undefined ? '' : b >= 1048576 ? mb(b) : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const resultadoDoAcesso = (x) => (x >= 400 ? etiqueta(x === 401 ? 'Recusado (senha ou login)' : x === 403 ? 'Recusado (sem permissão)' : x === 429 ? 'Recusado (muitos pedidos)' : `Recusado (${x})`, 'perigo') : x === 304 ? '<span class="suave">já estava no aparelho</span>' : '');
/** Baixou mais que isto no período: aparece em destaque (pode ser alguém copiando os dados). */
const MUITO = 200 * 1048576;

/**
 * Registro de acessos da nuvem (só administrador): quem baixou o banco, abriu, anexou ou apagou arquivos, baixou backups, mandou
 * e-mail, mexeu na ficha pela internet e ligou o programa do PC. Filtros: período e pessoa (`de`, `ate`, `quem`); `antes` = mais velhos.
 */
export async function telaAcessos(q = {}) {
  const topo = '<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Acessos</h1>';
  if (!E.nuvem) return `${topo}<p class="suave">Só existe com os dados na nuvem.</p>`;
  if (!podeUsuario('admin')) return '<h1>Acesso só para administradores</h1>';
  const filtro = { de: q.de && /^\d{4}-\d{2}-\d{2}$/.test(q.de) ? q.de : '', ate: q.ate || '', email: q.quem || '', antes: q.antes || '' };
  let r;
  try {
    const busca = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v));
    r = await apiDados()('GET', `acessos${String(busca) ? `?${busca}` : ''}`);
  } catch (e) {
    return `${topo}<div class="alerta erro">Não deu para ver os acessos agora: ${esc(e.message)}</div>`;
  }
  const form = `<form class="cartao acoes" data-form="ir" data-ir="acessos"><label style="margin:0">De</label><input type="date" name="de" value="${esc(filtro.de)}" style="width:160px">
    <label style="margin:0">até</label><input type="date" name="ate" value="${esc(filtro.ate)}" style="width:160px">
    <label style="margin:0">Pessoa</label><select name="quem" style="width:auto"><option value="">Todas</option>${(r.emails || []).map((e) => `<option${e === filtro.email ? ' selected' : ''}>${esc(e)}</option>`).join('')}</select>
    <button class="secundario">Ver</button>${filtro.de || filtro.ate || filtro.email ? ` ${link('#/acessos', 'Limpar')}` : ''}</form>`;
  const resumo = (r.resumo || []).map((x) => `<tr><td>${esc(x.email)}</td><td class="n">${x.acessos}</td><td class="n">${tamanho(x.bytes)}${x.bytes > MUITO ? ` ${etiqueta('muito', 'aviso')}` : ''}</td><td class="n">${x.recusados ? etiqueta(String(x.recusados), 'perigo') : '0'}</td></tr>`).join('');
  const linhas = (r.acessos || []).map((a) => `<tr><td class="nw">${esc(dataHoraBr(a.em))}</td><td>${esc(a.email)}</td><td>${esc(descreverAcesso(a.rota))} ${resultadoDoAcesso(a.resultado)}</td>
    <td class="n">${tamanho(a.bytes)}</td><td>${a.origem === 'pc' ? 'Programa do PC' : 'Site'}${a.ip ? `<br><span class="suave">${esc(a.ip)}</span>` : ''}</td></tr>`).join('');
  const ultimo = (r.acessos || []).at(-1);
  const mais = r.mais && ultimo ? `<p>${link(`#/acessos?${new URLSearchParams(Object.entries({ de: filtro.de, ate: filtro.ate, quem: filtro.email, antes: String(ultimo.n) }).filter(([, v]) => v))}`, 'Ver os mais antigos')}</p>` : '';
  return `${topo}
    <div class="cartao"><p>O servidor da nuvem anota quem <b>baixou o banco inteiro</b>, <b>abriu, anexou ou apagou arquivos</b>, baixou <b>backups</b>, mandou <b>e-mail</b> pela conta da empresa, mexeu na <b>ficha pela internet</b> e ligou o <b>programa do PC</b>, com a data, o endereço de internet e o tamanho. Fica guardado por ${Number(r.dias) || 180} dias (<a href="#/regras">Regras do sistema</a>, "Registro de acessos").</p>
      <p class="suave">Use para conferir se alguém baixou dados demais ou tentou entrar sem poder (linhas "Recusado"). Abrir telas e listas de anexos não entra.</p></div>
    ${form}
    <div class="cartao"><h2>Por pessoa${filtro.de || filtro.ate ? ' no período' : ''}</h2>
      ${resumo ? `<table><tr><th>Pessoa</th><th class="n">Acessos</th><th class="n">Baixou ou enviou</th><th class="n">Recusados</th></tr>${resumo}</table>` : '<p class="suave">Nenhum acesso anotado.</p>'}</div>
    <div class="cartao"><h2>Acessos${filtro.antes ? ' (mais antigos)' : ''}</h2>
      ${linhas ? `<div class="rolagem"><table><tr><th>Quando</th><th>Quem</th><th>O quê</th><th class="n">Tamanho</th><th>De onde</th></tr>${linhas}</table></div>${mais}` : '<p class="suave">Nenhum acesso anotado.</p>'}</div>`;
}

/** Relatório da passagem da pasta para a nuvem (etapa 4). */
function relatorio(r) {
  const itens = [
    `${r.registros} registros do banco ${r.diferencas.length ? `<b>com diferença em: ${esc(r.diferencas.join(', '))}</b>` : 'conferidos: iguais à pasta ✓'}`,
    `${r.total} anexos (${mb(r.totalBytes)}) ${r.faltando.length ? `<b>${r.faltando.length} faltando na nuvem</b>: ${esc(r.faltando.slice(0, 10).join('; '))}` : 'conferidos: todos na nuvem com o mesmo tamanho ✓'}${r.pulados ? ` (${r.pulados} já estavam lá)` : ''}`,
    ...(r.recusados.length ? [`<b>${r.recusados.length} recusados</b>: ${esc(r.recusados.map((x) => `${x.caminho} (${x.motivo})`).join('; '))}`] : []),
    ...(r.trocados?.length ? [`<b>${r.trocados.length} trocados pelo da pasta</b> (a nuvem tinha outro arquivo com o mesmo nome; a versão de lá ficou guardada na lixeira da nuvem por ${esc(String(R.regra('dias_lixeira_anexos')))} dias): ${esc(r.trocados.slice(0, 20).join('; '))}${r.trocados.length > 20 ? '…' : ''}`] : []),
  ];
  return `<div class="alerta ${r.ok && !r.recusados.length ? 'ok' : 'perigo'}"><b>${r.ok && !r.recusados.length ? 'Pronto: os dados estão na nuvem.' : 'Terminou, mas confira:'}</b><ul>${itens.map((i) => `<li>${i}</li>`).join('')}</ul></div>`;
}

const apiDados = () => N.apiDoSite('api/dados/');

/**
 * A versão do programa do PC de um computador ("AAAA-MM-DD commit", atualizador-pc/se-atualizar.mjs): o dia em que foi
 * publicada. Sem versão = programa antigo, de antes de se atualizar sozinho (precisa baixar o novo uma vez).
 */
export const versaoDoProgramaHtml = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\S+)$/.exec(String(v || ''));
  if (!m) return '<span class="suave">antiga: baixe o programa novo uma vez (depois ele se atualiza sozinho)</span>';
  return `de ${m[3]}/${m[2]}/${m[1]} <span class="suave">(${esc(m[4])})</span>`;
};

/**
 * "Aparelhos ligados" (em Usuários): computadores com o programa do PC (atualizador-pc/), cada um com o crachá que só lê.
 * Só na nuvem (o crachá é dela). Desligar para o crachá na hora (nos anexos, em até 1 minuto).
 */
export async function aparelhosLigadosHtml() {
  if (!E.nuvem) return '';
  let lista;
  try { lista = (await apiDados()('GET', 'aparelhos')).aparelhos || []; } catch (e) {
    return `<div class="cartao"><h2>Aparelhos ligados</h2><div class="alerta erro">Não deu para ver os aparelhos agora: ${esc(e.message)}</div></div>`;
  }
  const linhas = lista.map((a) => `<tr><td>${esc(a.computador)}</td><td>${esc(a.nome)}${a.usuario_ativo ? '' : ' <span class="suave">(usuário bloqueado: o crachá não vale)</span>'}</td>
    <td>${dataHoraBr(a.ligado_em)}</td><td>${dataHoraBr(a.ultimo_uso)}${a.parado ? ' <span class="suave">(parado há mais de 90 dias: precisa ligar de novo)</span>' : ''}</td>
    <td>${versaoDoProgramaHtml(a.versao_programa)}</td>
    <td class="n">${botao('desligarAparelho', 'Desligar', { id: a.id }, 'perigo pequeno', `Desligar o computador ${a.computador}? Ele para de baixar os dados na hora; para voltar, é preciso entrar de novo nele com e-mail e senha.`)}</td></tr>`).join('');
  return `<div class="cartao"><h2>Aparelhos ligados</h2>
    <p class="suave">Computadores com o programa do PC (cópia diária dos dados, versão PC e cópia aberta dos arquivos). Cada um só <b>lê</b>, com o acesso de quem o ligou; se essa pessoa for bloqueada, o computador para também. Computador roubado ou de alguém que saiu: <b>Desligar</b>.
      O programa se atualiza sozinho (todo dia às 20h e ao entrar no Windows); a coluna <b>Programa</b> mostra a versão que cada computador está usando.</p>
    <table><tr><th>Computador</th><th>Ligado por</th><th>Quando</th><th>Última vez</th><th>Programa</th><th></th></tr>${linhas || '<tr><td colspan="6" class="suave">Nenhum computador ligado.</td></tr>'}</table></div>`;
}

export const ACOES_NUVEM = {
  async desligarAparelho({ id }) {
    await apiDados()('POST', 'desligar-aparelho', { id: Number(id) });
    aviso('Computador desligado.');
    await mostrar();
  },

  /** Etapa 4: escolhe a pasta de sempre e leva tudo para a nuvem (nuvem vazia; ou o administrador substitui). */
  async levarParaNuvem(ds) {
    if (!S.suportado()) throw Object.assign(new Error('Faça isto no computador (Chrome ou Edge), onde está a pasta do OneDrive.'), { esperado: true });
    const substituir = ds.substituir === '1';
    if (substituir && !(await janela({ titulo: 'Substituir os dados da nuvem?', html: '<p>Tudo o que está na nuvem é trocado pelo que está na pasta escolhida (fica uma cópia de antes nos backups da nuvem). Mudanças feitas por outros aparelhos depois da última vez que a pasta foi usada <b>se perdem</b>.</p>', sim: 'Substituir', forte: true }))) return;
    let pasta;
    // só leitura: a pasta de sempre não é alterada (e não fica lembrada como pasta dos dados)
    try { pasta = await window.showDirectoryPicker({ id: 'imoveis', mode: 'read' }); } catch (e) { if (e.name === 'AbortError') return; throw e; }
    const el = document.getElementById('progresso-nuvem');
    const migracao = await carregarParte(() => import('../migracao.js')); // só aqui (passagem para a nuvem ou "Substituir…")
    const r = await migracao.levarParaNuvem(pasta, {
      anexos: E.anexos, sinc: E.nuvem, substituir,
      aoAndar: (p) => {
        if (!el) return;
        const fase = { anexos: `Enviando anexos: ${p.feitos} de ${p.total} (${mb(p.bytes)} de ${mb(p.totalBytes)})`, dados: 'Enviando o banco de dados…', conferencia: 'Conferindo tudo…' }[p.fase];
        el.innerHTML = `<p><progress max="${p.totalBytes || 1}" value="${p.bytes}" style="width:100%"></progress><br>${esc(fase)}<br><span class="suave">${esc(p.nome || '')}</span></p>`;
      },
    });
    E.d = E.nuvem.atual();
    if (el) el.innerHTML = relatorio(r);
    else aviso(r.ok ? 'Dados levados para a nuvem e conferidos.' : 'Terminou com diferenças: confira.', r.ok ? 'ok' : 'aviso');
    if (r.ok && !substituir) setTimeout(() => mostrar(), 8000); // depois de ler o relatório, aparece o login
  },

  async resolverConflito(ds) {
    const c = E.nuvem.conflitos.find((x) => x.id === Number(ds.conflito));
    const antes = c && PASTA_DERIVADA[c.tabela] ? ((E.d[c.tabela] || []).find((x) => String(x.id) === c.reg_id) || {}).pasta : null;
    await E.nuvem.resolver(Number(ds.conflito), ds.escolha);
    E.d = E.nuvem.atual();
    if (c && c.tipo === 'campo' && PASTA_DERIVADA[c.tabela]) await acertarPastaDerivada(c.tabela, Number(c.reg_id), [antes]);
    aviso('Escolha gravada: vale em todos os aparelhos.');
    await mostrar();
  },
  async acertarPastaConflito(ds) {
    await acertarPastaDerivada(ds.tabela, Number(ds.id));
    aviso('Pasta dos arquivos acertada pelo cadastro.');
    await mostrar();
  },
  async esquecerRecusas() {
    await E.nuvem.esquecerRecusas();
    await mostrar();
  },
  /** Mudança recusada: o detalhe num arquivo (o que era, quando e o motivo), para conferir ou refazer. */
  async baixarRecusa(ds) {
    const r = E.nuvem.recusas.find((x) => (x.id || x.lote) === ds.id);
    const ops = r && (await E.nuvem.lerRecusa(ds.id));
    if (!ops) return aviso('Esta mudança não está mais neste aparelho.', 'erro');
    const texto = JSON.stringify({ recusada_em: r.em, motivo: r.erro, gravacao: r.lote, parte: ds.id, mudancas: ops }, null, 1);
    baixar(new Blob([texto], { type: 'application/json' }), `mudanca-recusada-${String(r.em || '').slice(0, 10)}-${ds.id.slice(-10).replace(/[^A-Za-z0-9-]/g, '')}.json`);
  },
  async esquecerRecusa(ds) {
    if (!(await janela({ titulo: 'Esquecer esta mudança?', html: '<p>Ela não está na nuvem e some deste aparelho. Se ainda precisar, baixe antes ou refaça na tela.</p>', sim: 'Esquecer', forte: true }))) return;
    await E.nuvem.esquecerRecusa(ds.id);
    await mostrar();
  },
  async baixarNaoEnviado(ds) {
    const f = await E.anexos.lerNaoEnviado(ds.id);
    if (!f) return aviso('Este anexo não está mais neste aparelho.', 'erro');
    baixar(f.blob, f.nome);
  },
  async baixarBackupNuvem({ nome }) {
    if (!podeUsuario('admin')) throw new ErroUsuario('Só o administrador baixa backups.');
    const [dia] = diaDoBackup(nome);
    if (!dia) throw new Error('Backup desconhecido.');
    baixar(await S.abrirArquivo(await pastaBackups(), nome), nome);
  },
  /** Volta os dados da nuvem para os de um dia (o servidor guarda antes uma cópia "antes-da-substituicao"). */
  async restaurarBackupNuvem({ nome }) {
    if (!podeUsuario('admin')) throw new ErroUsuario('Só o administrador volta os dados para um backup.');
    const [dia, , motivo] = diaDoBackup(nome);
    if (!dia) throw new Error('Backup desconhecido.');
    if (E.nuvem.pendentesQtd()) throw Object.assign(new Error('Ainda há mudanças deste aparelho esperando para ir à nuvem. Espere enviar (ou conecte à internet) antes de voltar para um backup.'), { esperado: true });
    const momento = momentoDoBackup(dia, motivo);
    const ok = await janela({ titulo: `Voltar os dados para ${dataBr(dia)}?`, forte: true, sim: 'Voltar para este dia',
      html: `<p>Os dados da nuvem voltam a ser como estavam <b>${esc(momento)}</b>, em todos os aparelhos. <b>Tudo o que foi lançado depois ${motivo ? 'dessa substituição' : `das 3h de ${dataBr(dia)}`} se perde</b> (os anexos ficam).</p><p>Antes, o servidor guarda uma cópia de como está agora (aparece na lista como "cópia feita logo antes de substituir").</p>` });
    if (!ok) return;
    const arquivo = await S.abrirArquivo(await pastaBackups(), nome);
    let dados;
    if (cifrado(nome)) {
      const resp = await janela({ titulo: 'Senha do backup seguro', html: '<p>Este backup está cifrado. Digite a senha do backup seguro (a mesma da pasta segura do administrador).</p><p><input type="password" name="senha" autocomplete="off" required></p>', sim: 'Abrir', nao: 'Cancelar' });
      if (!resp) return;
      let aberto;
      try { aberto = await B.decifrar(await arquivo.arrayBuffer(), String((resp.senha || [])[0] || '')); } catch (e) { throw Object.assign(new Error(`${e.message} Nada foi trocado.`), { esperado: true }); }
      dados = JSON.parse(new TextDecoder().decode(aberto.dados));
    } else dados = JSON.parse(await arquivo.text());
    if (!dados || dados.formato !== 'imoveis-v1' || !Array.isArray(dados.usuarios)) throw new ErroUsuario('Este arquivo de backup está com defeito (não é uma cópia do sistema). Escolha outro dia.');
    // os usuários ficam como estão hoje (quem foi desativado não volta ativo, senha trocada não volta à antiga): item 10
    E.d = await E.nuvem.importar(dados, { substituir: true, manterUsuarios: true });
    await reabrirSessao();
    // a volta fica no histórico (o log do servidor some em 60 dias): item 11
    await alterar((db) => R.registrar(db, login(), 'Alteração', null, null, `Dados voltaram a ser como estavam ${momento} (backup restaurado por ${login()})`));
    aviso(`Dados voltaram a ser como estavam ${momento}. Os outros aparelhos recebem a versão nova sozinhos.`);
    ir('#/');
  },
  async esquecerNaoEnviado(ds) {
    if (!(await janela({ titulo: 'Esquecer este anexo?', html: '<p>O arquivo some deste aparelho e não está na nuvem.</p>', sim: 'Esquecer', forte: true }))) return;
    await E.anexos.esquecerNaoEnviado(ds.id);
    await mostrar();
  },
};
