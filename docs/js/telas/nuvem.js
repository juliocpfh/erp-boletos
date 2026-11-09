// Tela da nuvem: conflitos para escolher (mesmo campo mudado em dois aparelhos sem internet) e mudanças recusadas.
import { aviso, baixar, E, ir, janela, mostrar, podeUsuario, reabrirSessao } from '../app.js';
import * as S from '../armazenamento.js';
import { dataBr, hojeIso } from '../calculos.js';
import { levarParaNuvem } from '../migracao.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao } from './comum.js';

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
const quando = (t) => (t ? new Date(t).toLocaleString('pt-BR') : '');

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
  const conflitos = E.nuvem.conflitos;
  const recusas = await Promise.all(E.nuvem.recusas.map(async (r) => ({ ...r, id: r.id || r.lote, ops: await E.nuvem.lerRecusa(r.id || r.lote).catch(() => null) })));
  const naoEnviados = E.anexos?.naoEnviados || [];
  const pode = podeUsuario('admin'); // só o administrador escolhe (a nuvem também confere)
  const linhas = conflitos.map((c) => {
    if (c.tipo === 'campo') {
      return `<tr><td>${esc(nomeDoRegistro(c))}</td><td><b>${esc(c.campo)}</b></td>
        <td>${esc(valorTexto(c.atual))}<br><span class="suave">${esc(c.por_atual || '')}</span></td>
        <td>${esc(valorTexto(c.proposto))}<br><span class="suave">${esc(c.por_proposto || '')} · ${esc(quando(c.em))}</span></td>
        <td>${pode ? `${botao('resolverConflito', 'Fica o 1º', { conflito: c.id, escolha: 'atual' }, 'secundario pequeno')} ${botao('resolverConflito', 'Fica o 2º', { conflito: c.id, escolha: 'proposto' }, 'secundario pequeno')}` : ''}</td></tr>`;
    }
    const [a, b, txt] = c.tipo === 'exclusao'
      ? ['excluir', 'manter', `${c.por_proposto || 'Alguém'} excluiu, mas ${c.por_atual || 'outra pessoa'} tinha mudado antes`]
      : ['manter_excluido', 'recriar', `${c.por_proposto || 'Alguém'} mudou, mas ${c.por_atual || 'outra pessoa'} tinha excluído antes`];
    return `<tr><td>${esc(nomeDoRegistro(c))}</td><td colspan="3">${esc(txt)} (${esc(quando(c.em))})</td>
      <td>${pode ? `${botao('resolverConflito', a === 'excluir' ? 'Excluir' : 'Deixar excluído', { conflito: c.id, escolha: a }, 'secundario pequeno')} ${botao('resolverConflito', b === 'manter' ? 'Manter' : 'Recriar com a mudança', { conflito: c.id, escolha: b }, 'secundario pequeno')}` : ''}</td></tr>`;
  }).join('');
  return `<h1>Conflitos da nuvem</h1>
    <div class="caixa"><h2>Para escolher</h2>
      <p class="suave">O mesmo campo foi mudado em dois aparelhos sem internet. O sistema não escolhe sozinho: até o <b>administrador</b> escolher, vale o valor de antes.${pode ? '' : ' Avise o administrador.'}</p>
      ${conflitos.length ? `<div class="rolagem"><table class="responsiva"><tr><th>Registro</th><th>Campo</th><th>1º valor</th><th>2º valor</th><th></th></tr>${linhas}</table></div>` : '<p>Nenhum conflito. ✓</p>'}
    </div>
    ${recusas.length ? `<div class="caixa"><h2>Mudanças recusadas pela nuvem</h2>
      <p class="suave">Estas gravações feitas neste aparelho não foram aceitas e não valem (a tela já voltou ao que vale). Veja o que eram e o motivo; refaça o que ainda precisar. "Baixar" guarda o detalhe num arquivo.</p>
      ${recusas.map((r) => `<div class="cartao"><p><b>${esc(quando(r.em))}</b> · ${Number(r.mudancas) || 0} mudança(s)<br>Motivo: <b>${esc(r.erro)}</b></p>
        ${resumoDaRecusa(r.ops)}
        <div class="acoes">${r.ops ? botao('baixarRecusa', 'Baixar', { id: r.id }, 'secundario pequeno') : ''} ${botao('esquecerRecusa', 'Esquecer', { id: r.id }, 'secundario pequeno')}</div></div>`).join('')}
      ${recusas.length > 1 ? botao('esquecerRecusas', 'Esquecer todas', {}, 'secundario', 'Esquecer todas as mudanças recusadas? Elas não estão na nuvem e somem deste aparelho.') : ''}</div>` : ''}
    ${naoEnviados.length ? `<div class="caixa"><h2>Anexos que a nuvem não aceitou</h2>
      <p class="suave">Foram anexados sem internet e, ao enviar, a nuvem recusou. O arquivo continua neste aparelho: baixe e anexe de novo (ou esqueça).</p>
      <ul>${naoEnviados.map((f) => `<li>${esc(quando(f.em))}: <b>${esc(f.partes.join(' / '))}</b> · ${esc(f.erro)}
        ${botao('baixarNaoEnviado', 'Baixar', { id: f.id }, 'secundario pequeno')} ${botao('esquecerNaoEnviado', 'Esquecer', { id: f.id }, 'secundario pequeno')}</li>`).join('')}</ul></div>` : ''}`;
}

const mb = (b) => `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

/** Dia de um backup da nuvem pelo nome (`imoveis-dados-AAAA-MM-DD[-antes-da-substituicao].json`). */
const diaDoBackup = (nome) => (nome.match(/^imoveis-dados-(\d{4}-\d{2}-\d{2})(-(.+))?\.json$/) || []).slice(1);
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
    return `<tr><td>${dataBr(dia)}</td><td>${motivo ? 'cópia feita logo antes de substituir os dados' : 'como os dados estavam às 3h desse dia'}</td><td class="n">${a.tamanho >= 1048576 ? mb(a.tamanho) : `${Math.max(1, Math.round(a.tamanho / 1024))} KB`}</td>
      <td>${botao('baixarBackupNuvem', 'Baixar', { nome: a.nome }, 'secundario pequeno')} ${botao('restaurarBackupNuvem', 'Voltar para este dia', { nome: a.nome }, 'perigo pequeno')}</td></tr>`;
  }).join('');
  // exemplo com o backup do dia mais recente (ou hoje): "o de 09/11 é como os dados estavam às 3h de 09/11"
  const exemplo = dataBr(lista.map((a) => diaDoBackup(a.nome)).find(([, , motivo]) => !motivo)?.[0] || hojeIso()).slice(0, 5);
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Backups da nuvem</h1>
    <div class="cartao"><p>O servidor guarda uma cópia do banco de dados por dia (os 30 dias mais recentes), feita às 3h da manhã (horário de Brasília): o backup de ${exemplo} é como os dados estavam às 3h de ${exemplo}. Os anexos não entram: eles ficam guardados uma vez só e não mudam.</p>
      <p><b>Voltar para este dia</b> troca os dados da nuvem pelos daquele backup (antes, o servidor guarda uma cópia de como estava agora). Tudo o que foi lançado depois das 3h daquele dia se perde, em todos os aparelhos. Use só em caso de erro geral.</p>
      <div class="rolagem"><table><tr><th>Dia</th><th>O que é</th><th class="n">Tamanho</th><th></th></tr>${linhas || '<tr><td colspan="4" class="suave">Nenhum backup ainda (o primeiro é feito às 3h da manhã).</td></tr>'}</table></div></div>`;
}

/** Relatório da passagem da pasta para a nuvem (etapa 4). */
function relatorio(r) {
  const itens = [
    `${r.registros} registros do banco ${r.diferencas.length ? `<b>com diferença em: ${esc(r.diferencas.join(', '))}</b>` : 'conferidos: iguais à pasta ✓'}`,
    `${r.total} anexos (${mb(r.totalBytes)}) ${r.faltando.length ? `<b>${r.faltando.length} faltando na nuvem</b>: ${esc(r.faltando.slice(0, 10).join('; '))}` : 'conferidos: todos na nuvem com o mesmo tamanho ✓'}${r.pulados ? ` (${r.pulados} já estavam lá)` : ''}`,
    ...(r.recusados.length ? [`<b>${r.recusados.length} recusados</b>: ${esc(r.recusados.map((x) => `${x.caminho} (${x.motivo})`).join('; '))}`] : []),
  ];
  return `<div class="alerta ${r.ok && !r.recusados.length ? 'ok' : 'perigo'}"><b>${r.ok && !r.recusados.length ? 'Pronto: os dados estão na nuvem.' : 'Terminou, mas confira:'}</b><ul>${itens.map((i) => `<li>${i}</li>`).join('')}</ul></div>`;
}

export const ACOES_NUVEM = {
  /** Etapa 4: escolhe a pasta de sempre e leva tudo para a nuvem (nuvem vazia; ou o administrador substitui). */
  async levarParaNuvem(ds) {
    if (!S.suportado()) throw Object.assign(new Error('Faça isto no computador (Chrome ou Edge), onde está a pasta do OneDrive.'), { esperado: true });
    const substituir = ds.substituir === '1';
    if (substituir && !(await janela({ titulo: 'Substituir os dados da nuvem?', html: '<p>Tudo o que está na nuvem é trocado pelo que está na pasta escolhida (fica uma cópia de antes nos backups da nuvem). Mudanças feitas por outros aparelhos depois da última vez que a pasta foi usada <b>se perdem</b>.</p>', sim: 'Substituir', forte: true }))) return;
    let pasta;
    // só leitura: a pasta de sempre não é alterada (e não fica lembrada como pasta dos dados)
    try { pasta = await window.showDirectoryPicker({ id: 'imoveis', mode: 'read' }); } catch (e) { if (e.name === 'AbortError') return; throw e; }
    const el = document.getElementById('progresso-nuvem');
    const r = await levarParaNuvem(pasta, {
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
    await E.nuvem.resolver(Number(ds.conflito), ds.escolha);
    E.d = E.nuvem.atual();
    aviso('Escolha gravada: vale em todos os aparelhos.');
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
    if (!podeUsuario('admin')) throw new Error('Só o administrador baixa backups.');
    const [dia] = diaDoBackup(nome);
    if (!dia) throw new Error('Backup desconhecido.');
    baixar(await S.abrirArquivo(await pastaBackups(), nome), nome);
  },
  /** Volta os dados da nuvem para os de um dia (o servidor guarda antes uma cópia "antes-da-substituicao"). */
  async restaurarBackupNuvem({ nome }) {
    if (!podeUsuario('admin')) throw new Error('Só o administrador restaura backups.');
    const [dia, , motivo] = diaDoBackup(nome);
    if (!dia) throw new Error('Backup desconhecido.');
    if (E.nuvem.pendentesQtd()) throw Object.assign(new Error('Ainda há mudanças deste aparelho esperando para ir à nuvem. Espere enviar (ou conecte à internet) antes de voltar para um backup.'), { esperado: true });
    const momento = momentoDoBackup(dia, motivo);
    const ok = await janela({ titulo: `Voltar os dados para ${dataBr(dia)}?`, forte: true, sim: 'Voltar para este dia',
      html: `<p>Os dados da nuvem voltam a ser como estavam <b>${esc(momento)}</b>, em todos os aparelhos. <b>Tudo o que foi lançado depois ${motivo ? 'dessa substituição' : `das 3h de ${dataBr(dia)}`} se perde</b> (os anexos ficam).</p><p>Antes, o servidor guarda uma cópia de como está agora (aparece na lista como "cópia feita logo antes de substituir").</p>` });
    if (!ok) return;
    const dados = JSON.parse(await (await S.abrirArquivo(await pastaBackups(), nome)).text());
    if (!dados || dados.formato !== 'imoveis-v1' || !Array.isArray(dados.usuarios)) throw new Error('Este backup não está no formato esperado.');
    E.d = await E.nuvem.importar(dados, { substituir: true });
    await reabrirSessao();
    aviso(`Dados voltaram a ser como estavam ${momento}. Os outros aparelhos recebem a versão nova sozinhos.`);
    ir('#/');
  },
  async esquecerNaoEnviado(ds) {
    if (!(await janela({ titulo: 'Esquecer este anexo?', html: '<p>O arquivo some deste aparelho e não está na nuvem.</p>', sim: 'Esquecer', forte: true }))) return;
    await E.anexos.esquecerNaoEnviado(ds.id);
    await mostrar();
  },
};
