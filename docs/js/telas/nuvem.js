// Tela da nuvem: conflitos para escolher (mesmo campo mudado em dois aparelhos sem internet) e mudanças recusadas.
import { aviso, baixar, E, janela, mostrar, podeUsuario } from '../app.js';
import * as S from '../armazenamento.js';
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

export function telaConflitos() {
  if (!E.nuvem) return '<h1>Conflitos</h1><p class="suave">Só existem com os dados na nuvem.</p>';
  const conflitos = E.nuvem.conflitos;
  const recusas = E.nuvem.recusas;
  const naoEnviados = E.anexos?.naoEnviados || [];
  const pode = podeUsuario('operador');
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
      <p class="suave">O mesmo campo foi mudado em dois aparelhos sem internet. Até alguém escolher, vale o valor de antes.</p>
      ${conflitos.length ? `<div class="rolagem"><table class="responsiva"><tr><th>Registro</th><th>Campo</th><th>1º valor</th><th>2º valor</th><th></th></tr>${linhas}</table></div>` : '<p>Nenhum conflito. ✓</p>'}
    </div>
    ${recusas.length ? `<div class="caixa"><h2>Mudanças recusadas pela nuvem</h2>
      <p class="suave">Estas mudanças feitas neste aparelho não foram aceitas e não valem. Refaça se ainda precisar.</p>
      <ul>${recusas.map((r) => `<li>${esc(quando(r.em))}: ${esc(r.erro)} (${r.mudancas} mudança(s))</li>`).join('')}</ul>
      ${botao('esquecerRecusas', 'Já vi, limpar a lista', {}, 'secundario')}</div>` : ''}
    ${naoEnviados.length ? `<div class="caixa"><h2>Anexos que a nuvem não aceitou</h2>
      <p class="suave">Foram anexados sem internet e, ao enviar, a nuvem recusou. O arquivo continua neste aparelho: baixe e anexe de novo (ou esqueça).</p>
      <ul>${naoEnviados.map((f) => `<li>${esc(quando(f.em))}: <b>${esc(f.partes.join(' / '))}</b> · ${esc(f.erro)}
        ${botao('baixarNaoEnviado', 'Baixar', { id: f.id }, 'secundario pequeno')} ${botao('esquecerNaoEnviado', 'Esquecer', { id: f.id }, 'secundario pequeno')}</li>`).join('')}</ul></div>` : ''}`;
}

const mb = (b) => `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

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
  async baixarNaoEnviado(ds) {
    const f = await E.anexos.lerNaoEnviado(ds.id);
    if (!f) return aviso('Este anexo não está mais neste aparelho.', 'erro');
    baixar(f.blob, f.nome);
  },
  async esquecerNaoEnviado(ds) {
    if (!(await janela({ titulo: 'Esquecer este anexo?', html: '<p>O arquivo some deste aparelho e não está na nuvem.</p>', sim: 'Esquecer', forte: true }))) return;
    await E.anexos.esquecerNaoEnviado(ds.id);
    await mostrar();
  },
};
