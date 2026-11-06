// Tela da nuvem: conflitos para escolher (mesmo campo mudado em dois aparelhos sem internet) e mudanças recusadas.
import { aviso, E, mostrar, podeUsuario } from '../app.js';
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
      ${botao('esquecerRecusas', 'Já vi, limpar a lista', {}, 'secundario')}</div>` : ''}`;
}

export const ACOES_NUVEM = {
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
};
