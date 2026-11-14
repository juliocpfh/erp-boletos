// Tela "Regras do sistema" (#/regras, em Dados e backup): o administrador escolhe as regras de aluguel, garantia, contrato e
// rotina; cada uma com a explicação, a consequência e a lei. Padrão do sistema (regras do dono) no código: config-regras.js.
// Também guarda versões das regras, baixa e carrega o arquivo das regras e volta tudo ao padrão.
import { alterar, aviso, baixar, login, mostrar, podeUsuario } from '../app.js';
import * as C from '../calculos.js';
import { dataHoraBr } from '../calculos.js';
import * as CR from '../config-regras.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao, d, etiqueta } from './comum.js';

/** Feriado gravado ("MM-DD" ou "AAAA-MM-DD") como aparece na tela ("20/01" ou "15/06/2028"). */
const feriadoTela = (x) => (x.length === 5 ? `${x.slice(3)}/${x.slice(0, 2)}` : C.dataBr(x));

/** Valor de uma regra como texto curto (para "Padrão do sistema: ..."). */
export function valorRegraTexto(def, v) {
  switch (def.tipo) {
    case 'opcao': return (def.opcoes.find(([x]) => x === v) || [, String(v)])[1].replace(/ \(padrão do sistema\)$/, '');
    case 'simnao': return v ? 'Sim' : 'Não';
    case 'pct': return v === null ? 'em branco' : C.pct(v);
    case 'dinheiro': return v === null ? 'em branco' : C.reais(v);
    case 'inteiro': return v === null ? 'em branco' : String(v);
    case 'indice': return v || 'em branco (escolher em cada contrato)';
    case 'feriados': return v.length ? v.map(feriadoTela).join(', ') : 'nenhum';
    case 'regua': return v.map((p) => `${p.dias} dia(s): ${p.passo}`).join('; ');
    default: return String(v ?? '');
  }
}

/**
 * Fim do TXT "regras para ler": as regras de "Regras do sistema" como estão hoje, grupo a grupo, com "MUDADA" nas que
 * diferem do padrão. O texto de cima do arquivo descreve o padrão; onde houver diferença, vale esta lista.
 */
export function textoDasRegrasEmUso(hoje = C.hojeIso()) {
  const regras = CR.regrasDe(d());
  const linhas = ['', '', `REGRAS EM USO EM ${C.dataBr(hoje)} (Dados e backup → Regras do sistema)`,
    'O texto acima descreve o padrão do sistema (ex.: boletos a partir do dia 20, reajuste no 13º mês). Onde o administrador mudou, vale o que está aqui.'];
  let mudadas = 0;
  for (const [g, titulo] of CR.GRUPOS_REGRAS) {
    linhas.push('', titulo.toLocaleUpperCase('pt-BR'));
    for (const def of CR.DEFINICOES_REGRAS.filter((x) => x.grupo === g)) {
      const mudou = !CR.mesmoValor(regras[def.chave], def.padrao);
      if (mudou) mudadas += 1;
      linhas.push(`- ${def.rotulo}: ${valorRegraTexto(def, regras[def.chave])}${mudou ? `  << MUDADA (padrão do sistema: ${valorRegraTexto(def, def.padrao)})` : ''}`);
    }
  }
  linhas.push('', mudadas ? `${mudadas} regra(s) diferente(s) do padrão do sistema.` : 'Todas as regras estão no padrão do sistema.');
  return linhas.join('\n');
}

function campoRegra(def, v, admin) {
  const nome = `r_${def.chave}`;
  const des = admin ? '' : ' disabled';
  switch (def.tipo) {
    case 'opcao': return def.opcoes.map(([x, rotulo, explica]) => `<label class="opcao-regra"><input type="radio" name="${nome}" value="${esc(x)}"${x === v ? ' checked' : ''}${des}>
      <span><b>${esc(rotulo)}</b>${explica ? `<br><span class="suave">${esc(explica)}</span>` : ''}</span></label>`).join('');
    case 'simnao': return `<select name="${nome}"${des}><option value="sim"${v ? ' selected' : ''}>Sim</option><option value="nao"${v ? '' : ' selected'}>Não</option></select>`;
    case 'pct': return `<input name="${nome}" value="${v === null ? '' : esc(F.pctTexto(v))}" inputmode="decimal" style="width:120px"${des}> %`;
    case 'dinheiro': return `R$ <input name="${nome}" value="${v === null ? '' : esc(F.dinheiroTexto(v))}" inputmode="decimal" style="width:140px"${des}>`;
    case 'inteiro': return `<input name="${nome}" value="${v === null ? '' : v}" inputmode="numeric" style="width:120px"${des}>`;
    case 'indice': {
      const lista = [...new Set(['', ...((d().listas && d().listas.indices) || []), v].filter((x) => x !== undefined))];
      return `<select name="${nome}"${des}>${lista.map((x) => `<option value="${esc(x)}"${x === v ? ' selected' : ''}>${x ? esc(x) : 'Escolher em cada contrato'}</option>`).join('')}</select>`;
    }
    case 'feriados': return `<textarea name="${nome}" rows="3" placeholder="20/01&#10;15/06/2028"${des}>${esc(v.map(feriadoTela).join('\n'))}</textarea>`;
    case 'regua': return `<textarea name="${nome}" rows="4"${des}>${esc(v.map((p) => `${p.dias}: ${p.passo}`).join('\n'))}</textarea>`;
    default: return '';
  }
}

function blocoRegra(def, regras, admin) {
  const v = regras[def.chave];
  const mudada = !CR.mesmoValor(v, def.padrao);
  return `<div class="regra-sistema" id="regra-${def.chave}">
    <h3>${esc(def.rotulo)} ${mudada ? etiqueta('mudada', 'aviso') : etiqueta('padrão do sistema', 'neutra')}</h3>
    <p>${esc(def.explica)}</p>
    <div class="campo-regra">${campoRegra(def, v, admin)}</div>
    <p class="suave"><b>Consequência:</b> ${esc(def.consequencia)}</p>
    <p class="suave"><b>Lei:</b> ${esc(def.lei)}</p>
    ${mudada ? `<p class="suave">Padrão do sistema: <b>${esc(valorRegraTexto(def, def.padrao))}</b>.</p>` : ''}</div>`;
}

export function telaRegras() {
  const admin = podeUsuario('admin');
  const regras = R.regrasDe(d());
  const mudadas = CR.DEFINICOES_REGRAS.filter((x) => !CR.mesmoValor(regras[x.chave], x.padrao));
  const versoes = [...(d().versoes_regras || [])].sort((a, b) => String(b.salvo_em).localeCompare(String(a.salvo_em)));
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Regras do sistema</h1>
    <div class="alerta info">Cada regra mostra o que faz, a consequência de cada escolha e a lei. O <b>padrão do sistema</b> são as regras originais, gravadas no programa: elas valem enquanto nada for mudado e sempre dá para voltar a elas. O sistema avisa quando uma escolha tem risco legal, mas não proíbe.
      ${mudadas.length ? `<br>Hoje <b>${mudadas.length} regra(s)</b> diferente(s) do padrão: ${mudadas.map((x) => esc(x.rotulo)).join('; ')}.` : '<br>Hoje todas as regras estão no padrão do sistema.'}</div>
    ${admin ? '' : '<div class="alerta aviso">Só o administrador muda as regras.</div>'}
    <div class="cartao"><h2>Guardar e recuperar as regras</h2>
      <p>Salve uma versão antes de mudar: se algo der errado, volte a ela. O arquivo das regras guarda todas as regras em uso, para levar a outro sistema ou guardar fora.</p>
      ${admin ? `<form data-form="salvarVersaoRegras" class="acoes"><input name="nome" placeholder="Ex.: Regras de novembro de 2026" style="max-width:320px"><button class="secundario">Salvar versão das regras</button></form>` : ''}
      ${versoes.length ? `<table><tr><th>Versão</th><th>Salva em</th><th>Por</th><th></th></tr>${versoes.map((v) => `<tr><td><b>${esc(v.nome)}</b></td><td>${dataHoraBr(v.salvo_em)}</td><td>${esc(v.salvo_por || '-')}</td>
        <td class="n">${admin ? `${botao('restaurarVersaoRegras', 'Voltar a esta versão', { id: v.id }, 'secundario pequeno', `Voltar às regras da versão "${v.nome}"? As regras de agora são trocadas (salve uma versão antes, se quiser guardá-las).`)}
        ${botao('excluirVersaoRegras', 'Excluir', { id: v.id }, 'perigo pequeno', `Excluir a versão "${v.nome}"? As regras em uso não mudam.`)}` : ''}</td></tr>`).join('')}</table>` : '<p class="suave">Nenhuma versão salva.</p>'}
      <p class="acoes">${botao('baixarArquivoRegras', 'Baixar cópia das regras (para carregar depois)', {}, 'secundario pequeno')}
        ${admin ? `<label class="botao secundario pequeno enviar">Carregar arquivo das regras<input type="file" accept=".json,application/json" data-acao-arquivo="carregarArquivoRegras"></label>
        ${botao('voltarRegrasPadrao', 'Voltar tudo ao padrão do sistema', {}, 'perigo pequeno', 'Voltar todas as regras ao padrão do sistema? As regras de agora são trocadas (salve uma versão antes, se quiser guardá-las).')}` : ''}</p></div>
    <form data-form="regrasSistema">
      ${CR.GRUPOS_REGRAS.map(([g, titulo]) => `<div class="cartao"><h2>${esc(titulo)}</h2>
        ${CR.DEFINICOES_REGRAS.filter((x) => x.grupo === g).map((x) => blocoRegra(x, regras, admin)).join('')}</div>`).join('')}
      ${admin ? '<p class="acoes"><button>Salvar as regras</button></p>' : ''}
    </form>`;
}

/** Converte o texto digitado num feriado gravado: "20/01" → "01-20"; "15/06/2028" → "2028-06-15". */
function feriadoDigitado(t) {
  const m = String(t).trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) throw new C.ErroUsuario(`Feriado "${t}": escreva o dia e o mês (20/01) ou a data completa (15/06/2028).`);
  const dm = `${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return m[3] ? `${m[3]}-${dm}` : dm;
}

/** Lê o formulário da tela: { chave: valor } (os valores ainda passam pela conferência de `limparValorRegra`). */
export function lerFormularioRegras(dados) {
  const out = {};
  const numero = (t) => { const s = String(t ?? '').trim(); return s === '' ? null : Number(s.replace(/\./g, '').replace(',', '.')); };
  for (const def of CR.DEFINICOES_REGRAS) {
    const nome = `r_${def.chave}`;
    if (!(nome in dados)) continue;
    const t = dados[nome];
    switch (def.tipo) {
      case 'simnao': out[def.chave] = t === 'sim'; break;
      case 'pct': { const s = String(t ?? '').trim(); out[def.chave] = s === '' ? null : Number(s.replace(',', '.')); break; }
      case 'dinheiro': out[def.chave] = String(t ?? '').trim() === '' ? null : C.centavos(t); break;
      case 'inteiro': out[def.chave] = numero(t); break;
      case 'feriados': out[def.chave] = String(t || '').split(/[\n;,]+/).map((x) => x.trim()).filter(Boolean).map(feriadoDigitado); break;
      case 'regua': out[def.chave] = String(t || '').split('\n').map((x) => x.trim()).filter(Boolean).map((linha) => {
        const m = linha.match(/^(\d+)\s*(?:dias?)?\s*[:\-–]\s*(.+)$/i);
        if (!m) throw new C.ErroUsuario(`Régua de cobrança: escreva "dias: o que fazer" em cada linha (ex.: "10: Ligar para o inquilino"). Linha: "${linha}"`);
        return { dias: Number(m[1]), passo: m[2].trim() };
      }); break;
      default: out[def.chave] = t;
    }
  }
  return out;
}

const soAdmin = () => { if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador muda as regras do sistema.'); };

export const FORMULARIOS_REGRAS = {
  async regrasSistema(form) {
    soAdmin();
    const valores = lerFormularioRegras(Object.fromEntries(new FormData(form)));
    // confere tudo antes de gravar (a mensagem diz qual regra está errada)
    for (const [k, v] of Object.entries(valores)) valores[k] = CR.limparValorRegra(k, v);
    const n = await alterar((db) => R.salvarRegrasSistema(db, valores, login()));
    aviso(n ? `Regras salvas (${n} mudança(s)).` : 'Nada mudou nas regras.', n ? 'ok' : 'info');
    await mostrar();
  },
  async salvarVersaoRegras(form) {
    soAdmin();
    const nome = new FormData(form).get('nome');
    await alterar((db) => R.salvarVersaoRegras(db, nome, login()));
    aviso('Versão das regras salva.', 'ok');
    await mostrar();
  },
};

export const ACOES_REGRAS = {
  async restaurarVersaoRegras({ id }) {
    soAdmin();
    const n = await alterar((db) => R.restaurarVersaoRegras(db, id, login()));
    aviso(`Regras da versão de volta (${n} mudança(s)).`, 'ok');
    await mostrar();
  },
  async excluirVersaoRegras({ id }) {
    soAdmin();
    await alterar((db) => R.excluir(db, 'versoes_regras', Number(id), login(), 'Versão das regras excluída'));
    await mostrar();
  },
  async voltarRegrasPadrao() {
    soAdmin();
    const n = await alterar((db) => R.voltarRegrasAoPadrao(db, login()));
    aviso(n ? 'Todas as regras voltaram ao padrão do sistema.' : 'As regras já estavam no padrão do sistema.', 'ok');
    await mostrar();
  },
  baixarArquivoRegras() {
    const texto = JSON.stringify(CR.arquivoDasRegras(d(), login()), null, 2);
    baixar(new Blob([texto], { type: 'application/json' }), `Regras do sistema ${C.hojeIso()}.json`);
  },
  async carregarArquivoRegras(_dados, input) {
    soAdmin();
    const arquivo = input.files && input.files[0];
    input.value = '';
    if (!arquivo) return;
    const valores = CR.lerArquivoDasRegras(await arquivo.text());
    if (!confirm('Trocar as regras de agora pelas do arquivo? (Salve uma versão antes, se quiser guardar as de agora.)')) return;
    const n = await alterar((db) => R.salvarRegrasSistema(db, valores, login(), 'Regras do sistema (arquivo carregado)'));
    aviso(`Regras do arquivo carregadas (${n} mudança(s)).`, 'ok');
    await mostrar();
  },
};
