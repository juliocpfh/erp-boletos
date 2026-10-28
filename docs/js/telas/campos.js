// Preenchimento automático dos formulários: máscaras, CEP (ViaCEP), CNPJ (BrasilAPI), pessoa já cadastrada, troca de titular,
// garantia herdada, endereço do imóvel, caução calculada, rascunho da vistoria e índices acumulados do Banco Central (tela Reajustes).
// Tudo é ligado na tela por ligarCamposAutomaticos (chamado em TELAS._ligarDesconto).
import { janela } from '../app.js';
import * as C from '../calculos.js';
import { compBr, dataBr, pct, reais } from '../calculos.js';
import * as K from '../contratos.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { buscar, d, endereco, memoria } from './comum.js';

// --------------------------------------------------------------------------
// Campos que ajudam a preencher: máscara, CEP, CNPJ e pessoa já cadastrada
// --------------------------------------------------------------------------
export const CAMPOS_PESSOA_FORM = ['nome', 'rg', 'telefone', 'email', 'endereco', 'genero', 'nacionalidade', 'estado_civil', 'profissao', 'nascimento'];

export const titulo = (t) => String(t || '').toLocaleLowerCase('pt-BR').replace(/(^|[\s/(-])(\p{L})/gu, (x, a, b) => a + b.toLocaleUpperCase('pt-BR')).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());

function mensagemAuto(el, html) {
  const caixa = el.closest('div').querySelector('[data-auto-msg]');
  if (caixa) caixa.innerHTML = html;
}

/** Preenche só os campos vazios do formulário (ou ainda com o valor padrão); devolve os rótulos preenchidos. */
function preencherVazios(form, valores, padroes = {}) {
  const feitos = [];
  for (const [nome, valor] of Object.entries(valores)) {
    const alvo = nome && form.querySelector(`[name="${nome}"]`);
    if (!alvo || !valor || alvo.type === 'checkbox' || String(alvo.value) === String(valor)) continue;
    if (String(alvo.value).trim() && String(alvo.value) !== String(padroes[nome] ?? '')) continue;
    alvo.value = valor;
    alvo.dispatchEvent(new Event('change', { bubbles: true }));
    feitos.push(((form.querySelector(`label[for="${alvo.id}"]`) || {}).textContent || nome).replace(/\s*\*$/, ''));
  }
  return feitos;
}

async function consultarCep(el, cfg) {
  const n = F.soDigitos(el.value);
  if (n.length !== 8) return;
  mensagemAuto(el, 'Consultando o CEP…');
  try {
    const r = await (await fetch(`https://viacep.com.br/ws/${n}/json/`)).json();
    if (r.erro) return mensagemAuto(el, 'CEP não encontrado.');
    if (cfg.linha) return enderecoNaLinha(el, cfg, r);
    const feitos = preencherVazios(el.form, { [cfg.endereco]: r.logradouro ? `${r.logradouro}, ` : '', [cfg.bairro]: r.bairro, [cfg.cidade]: r.localidade });
    // o Estado sempre segue o CEP (mesmo se já estava preenchido)
    const uf = cfg.uf && el.form.querySelector(`[name="${cfg.uf}"]`);
    if (uf && r.uf && uf.value !== r.uf) { uf.value = r.uf; feitos.push('Estado'); }
    mensagemAuto(el, feitos.length ? `Preenchido pelo CEP: ${esc(feitos.join(', '))}. Complete o número.` : 'CEP conferido.');
    const end = el.form.querySelector(`[name="${cfg.endereco}"]`);
    if (feitos.length && end) end.focus();
  } catch {
    const uf = cfg.uf && el.form.querySelector(`[name="${cfg.uf}"]`);
    if (uf && C.ufDoCep(n)) uf.value = C.ufDoCep(n); // sem internet, o Estado sai das faixas de CEP
    mensagemAuto(el, 'Não deu para consultar o CEP agora (sem internet?). Preencha à mão.');
  }
}

/**
 * Endereço de uma linha da pessoa (inquilino, fiador...): o CEP escreve "Rua X, Bairro, Cidade/UF, CEP 00000-000" e deixa
 * o cursor depois do nome da rua, para digitar o número. Endereço já preenchido não muda.
 */
function enderecoNaLinha(el, cfg, r) {
  const campo = el.form.querySelector(`[name="${el.name.replace(/cep_busca$/, '')}${cfg.linha}"]`);
  if (!campo) return;
  if (campo.value.trim()) return mensagemAuto(el, 'O endereço já está preenchido e ficou como estava. Para usar o do CEP, apague o endereço e digite o CEP de novo.');
  const rua = r.logradouro ? `${r.logradouro}, ` : '';
  campo.value = rua + [r.bairro, r.localidade ? `${r.localidade}${r.uf ? `/${r.uf}` : ''}` : '', `CEP ${F.mascarar('cep', r.cep || el.value)}`].filter(Boolean).join(', ');
  campo.dispatchEvent(new Event('change', { bubbles: true }));
  mensagemAuto(el, rua ? 'Endereço preenchido pelo CEP. Digite o número (e o complemento) depois do nome da rua, seguido de vírgula.' : 'Este CEP é da cidade toda: digite a rua e o número no começo do endereço.');
  campo.focus();
  campo.setSelectionRange(rua.length, rua.length);
}

async function consultarCnpj(el, cfg) {
  const n = F.soDigitos(el.value);
  if (n.length !== 14 || !F.cnpjValido(n)) return;
  mensagemAuto(el, 'Consultando o CNPJ…');
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${n}`);
    if (!resp.ok) return mensagemAuto(el, 'CNPJ não encontrado na Receita.');
    const r = await resp.json();
    const endereco = [[r.descricao_tipo_de_logradouro, r.logradouro].filter(Boolean).join(' '), r.numero, r.complemento, r.bairro].filter(Boolean).map(titulo).join(', ')
      + (r.municipio ? `, ${titulo(r.municipio)}/${r.uf || ''}` : '');
    // representante: só quando a Receita mostra um único sócio administrador (ou um único sócio)
    const socios = r.qsa || [];
    const admins = socios.filter((x) => /administrador/i.test(x.qualificacao_socio || ''));
    const unico = admins.length === 1 ? admins[0] : socios.length === 1 ? socios[0] : null;
    const tel = F.soDigitos(r.ddd_telefone_1 || '');
    const feitos = preencherVazios(el.form, { [cfg.razao]: r.razao_social, [cfg.nome]: cfg.razao ? (r.nome_fantasia || r.razao_social) : r.razao_social, [cfg.fantasia]: r.nome_fantasia,
      [cfg.endereco]: endereco, [cfg.sede]: endereco, [cfg.telefone]: tel.length >= 10 ? F.mascarar('tel', tel) : '', [cfg.email]: String(r.email || '').toLowerCase(),
      [cfg.representante]: unico && unico.nome_socio ? titulo(unico.nome_socio) : '' });
    mensagemAuto(el, `${esc(r.razao_social || '')}${r.descricao_situacao_cadastral ? ` · situação na Receita: <b>${esc(r.descricao_situacao_cadastral)}</b>` : ''}${feitos.length ? `<br>Preenchido: ${esc(feitos.join(', '))}.` : ''}`);
  } catch {
    mensagemAuto(el, 'Não deu para consultar o CNPJ agora (sem internet?). Preencha à mão.');
  }
}

/** Pessoas já cadastradas com este CPF/CNPJ (inquilinos, solidários, representantes e fiadores). */
function pessoasComDocumento(doc) {
  const n = F.soDigitos(doc);
  if (n.length < 11) return [];
  const [, tabela, id] = (location.hash.split('?')[0].match(/editar\/(\w+)\/(\d+)/) || []);
  const proprio = (t, r) => tabela === t && Number(id) === r.id;
  const achados = [];
  for (const c of d().contratos) {
    for (const [pref, papel] of [['inquilino_', 'inquilino'], ['solidario_', 'inquilino solidário'], ['representante_', 'representante']]) {
      if (F.soDigitos(c[`${pref}cpf`]) === n && !(proprio('contratos', c) && pref === 'inquilino_')) {
        achados.push({ fonte: `contratos:${c.id}:${pref}`, nome: c[`${pref}nome`], papel: `${papel} de ${(buscar('imoveis', c.imovel_id) || {}).nome || 'sem imóvel'}` });
      }
    }
  }
  for (const f of d().fiadores) {
    if (F.soDigitos(f.cpf) === n && !proprio('fiadores', f)) achados.push({ fonte: `fiadores:${f.id}:`, nome: f.nome, papel: `fiador de ${(buscar('contratos', f.contrato_id) || {}).inquilino_nome || ''}` });
  }
  return achados;
}

function procurarPessoa(el) {
  const achados = pessoasComDocumento(el.value);
  if (!achados.length) return;
  const alvo = el.name.slice(0, -3); // "inquilino_cpf" → "inquilino_"; "cpf" → ""; "fiador1_cpf" → "fiador1_"
  const a = achados[0];
  mensagemAuto(el, `Este documento já está cadastrado: <b>${esc(a.nome)}</b> (${esc(a.papel)}${achados.length > 1 ? ` e mais ${achados.length - 1}` : ''}).
    <button type="button" class="secundario pequeno" data-acao="usarPessoa" data-fonte="${esc(a.fonte)}" data-alvo="${esc(alvo)}">Usar os dados cadastrados</button>`);
}

/** Troca de titular escolhida no novo contrato: { anteriorId, data, arquivo } (o termo aditivo é gravado depois de salvar). */

/**
 * Inquilino novo que continua o contrato de outro (troca de titular): confirma numa janela a data da alteração (novo início
 * do contrato e da vigência) e, se já tiver, o termo aditivo assinado da troca; as condições do contrato anterior entram
 * no formulário. Sem o termo, o contrato é salvo e fica o alerta "Aditivo da troca de titular" até anexar.
 */
function ligarContinuacaoDeContrato(raiz) {
  const sel = raiz.querySelector('form[data-form=cadastro] select[name=contrato_anterior_id]');
  if (!sel || !/^#\/novo\/contratos/.test(location.hash)) return;
  if (memoria.continuacao && String(memoria.continuacao.anteriorId) !== sel.value) memoria.continuacao = null;
  sel.addEventListener('change', async () => {
    const anterior = sel.value && buscar('contratos', sel.value);
    memoria.continuacao = null;
    if (!anterior) return mensagemAuto(sel, '');
    const r = await janela({ titulo: `Continuar o contrato de ${anterior.inquilino_nome}`, sim: 'Continuar o contrato',
      html: `<p>O novo inquilino assume o contrato de <b>${esc(anterior.inquilino_nome)}</b>: os inquilinos ficam ligados e as condições do contrato anterior entram no formulário.</p>
        <p><label>Data da alteração <span class="suave">(novo início do contrato e da vigência)</span></label><input type="date" name="data" value="${C.hojeIso()}" required></p>
        <p><label>Termo aditivo assinado da troca de titular <span class="suave">(opcional)</span></label><input type="file" name="arquivo" accept="application/pdf,image/*"></p>
        <p class="suave">Sem o termo agora: o contrato é registrado e fica o alerta "Aditivo da troca de titular" até anexar (em "Termos aditivos" na página do inquilino).</p>
        <p class="suave">Ao salvar, ${esc(anterior.inquilino_nome)} fica com <b>fim do vínculo</b> na véspera dessa data (não é saída: o contrato continua, com as mesmas regras e documentos).
        Os boletos continuam no nome de ${esc(anterior.inquilino_nome)} até a véspera (o último sai proporcional aos dias); a partir da data, saem no nome do novo inquilino.
        Data futura: garantia, seguro e reserva passam no dia.</p>` });
    if (!r) { sel.value = ''; return mensagemAuto(sel, ''); }
    const data = (r.data || [])[0] || C.hojeIso();
    const arq = (r.arquivo || [])[0];
    memoria.continuacao = { anteriorId: anterior.id, data, arquivo: arq && arq.size ? arq : null };
    const campos = F.CONTRATO.filter((c) => c.nome && c.tipo !== 'simnao');
    const cond = R.condicoesDoContrato(d(), anterior, data);
    const feitos = preencherVazios(sel.form, F.paraFormulario(campos, cond), F.paraFormulario(campos, null));
    // aluguel, bonificado, boleto e reserva: iguais aos do anterior (sobrescreve o que estiver digitado) e travados
    travarValoresHerdados(sel.form, F.paraFormulario(F.CONTRATO.filter((c) => c.nome), { bonificacao: anterior.bonificacao !== false,
      cobranca_mes_seguinte: anterior.cobranca_mes_seguinte !== false, ...cond }));
    if (anterior.garantia_tipo && anterior.garantia_tipo !== 'Sem garantia') travarGarantiaHerdada(sel.form, anterior, anterior.inquilino_nome);
    // a data da alteração é o novo início do contrato e da vigência (mesmo se já havia outra data no formulário)
    for (const nome of ['vigencia_inicio', 'data_entrada']) {
      const el = sel.form.querySelector(`[name=${nome}]`);
      if (el) { el.value = data; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    mensagemAuto(sel, `Continuação do contrato de ${esc(anterior.inquilino_nome)} a partir de ${dataBr(data)}${feitos.length ? `: ${esc(feitos.join(', '))} vieram do contrato anterior` : ''}.
      <b>Aluguel (${reais(cond.aluguel_inicial)}), bonificação, boleto, reserva e garantia são os do contrato e ficam travados</b>: mudanças depois, pelos botões da página do inquilino (correção, renovação, corrigir caução).
      ${memoria.continuacao.arquivo ? `Termo aditivo: ${esc(memoria.continuacao.arquivo.name)} (anexado ao salvar).` : 'Sem termo aditivo: fica o alerta para anexar.'}`);
  });
}

/** Campos da garantia que vêm do contrato anterior na troca de titular (não se digita uma garantia nova). */
export const CAMPOS_GARANTIA_HERDADA = ['garantia_tipo', 'caucao_meses', 'caucao_valor', 'caucao_data', 'deposito_valor', 'deposito_data'];

/** Valores e boleto e reserva que vêm iguais do contrato anterior na troca de titular (travados no formulário). */
export const CAMPOS_VALORES_HERDADOS = ['aluguel_inicial', 'aluguel_bonificado', 'desconto_pontualidade_percentual', 'bonificacao', 'dia_vencimento', 'cobranca_mes_seguinte',
  'taxa_boleto', 'fci_percentual', 'fci_indice', 'multa_percentual', 'juros_mensal_percentual', 'reserva_valor', 'reserva_data', 'reserva_competencia', 'comprovante_reserva'];

/** Trava campos do formulário (só leitura, em cinza); ``valores`` (já no formato da tela) troca o que estiver escrito. */
function travarCampos(form, nomes, valores = {}) {
  for (const nome of nomes) {
    const el = form.querySelector(`[name=${nome}]`);
    if (!el) continue;
    if (nome in valores) {
      if (el.type === 'checkbox') el.checked = valores[nome] === true || valores[nome] === '1' || valores[nome] === 1;
      else if (el.type !== 'file') el.value = valores[nome] ?? '';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (el.type === 'file') el.disabled = true;
    el.readOnly = true;
    el.classList.add('travado');
    el.tabIndex = -1;
  }
}

/** Troca de titular: aluguel, bonificado, vencimento, tarifa, multa, juros e reserva iguais aos do contrato anterior. */
function travarValoresHerdados(form, valores = {}) {
  travarCampos(form, CAMPOS_VALORES_HERDADOS, valores);
  const ajuda = (form.querySelector('[name=reserva_valor]') || { closest: () => null }).closest('div');
  const texto = ajuda && (ajuda.querySelector('.ajuda') || ajuda.appendChild(Object.assign(document.createElement('div'), { className: 'ajuda' })));
  if (texto) texto.textContent = 'Reserva do contrato (herdada do titular anterior); o que ele já usou não abate de novo.';
}

/**
 * Troca de titular: a garantia é a do contrato (não se digita uma caução nova). Os campos ficam travados com a caução
 * atual (o último valor corrigido) e um aviso; mudar a caução é em "Corrigir caução" na página do inquilino.
 * ``origem``: contrato de onde vem a garantia (o anterior no novo contrato; o próprio herdeiro na edição).
 */
function travarGarantiaHerdada(form, origem, nomeAnterior) {
  const valores = { garantia_tipo: origem.garantia_tipo || '', caucao_meses: origem.caucao_meses || '', caucao_data: origem.caucao_data || '',
    deposito_data: origem.deposito_data || '' };
  const atual = R.valorGarantia(d(), origem);
  if (R.temCaucao(origem)) valores.caucao_valor = F.dinheiroTexto(atual);
  if (R.temDeposito(origem)) valores.deposito_valor = F.dinheiroTexto(atual);
  for (const nome of CAMPOS_GARANTIA_HERDADA) {
    const el = form.querySelector(`[name=${nome}]`);
    if (!el) continue;
    if (nome in valores) el.value = valores[nome];
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.readOnly = true;
    el.classList.add('travado');
    el.tabIndex = -1;
  }
  // o aviso vai no campo do valor (que tem a linha de mensagem automática)
  const alvo = form.querySelector(`[name=${R.temDeposito(origem) && !R.temCaucao(origem) ? 'deposito_valor' : 'caucao_valor'}]`);
  if (alvo) {
    mensagemAuto(alvo, `<b>Garantia herdada de ${esc(nomeAnterior)}</b>${atual ? `: ${R.temCaucao(origem) ? 'caução' : 'depósito'} atual de ${reais(atual)} (último valor corrigido)` : ''}.
      Não se registra uma garantia nova na troca de titular: se precisar mudar o valor, use <b>"Corrigir caução"</b> na página do inquilino depois de salvar.`);
  }
}

/** Editar o contrato de quem continuou o de outro: a garantia fica travada (é a do contrato). */
function ligarGarantiaHerdada(raiz) {
  const form = raiz.querySelector('form[data-form=cadastro]');
  const [, id] = location.hash.match(/^#\/editar\/contratos\/(\d+)/) || [];
  const c = form && id && buscar('contratos', id);
  const ant = c && R.contratoHerdado(d(), c);
  if (!ant) return;
  travarValoresHerdados(form);
  travarGarantiaHerdada(form, c, ant.inquilino_nome);
}

/** Caixas "Usar o endereço do imóvel" do contrato: [caixa, campo de endereço que recebe] (inquilino, representante e solidário). */
export const ENDERECO_DO_IMOVEL = [['usar_endereco_imovel', 'inquilino_endereco'], ['representante_usar_endereco_imovel', 'representante_endereco'], ['solidario_usar_endereco_imovel', 'solidario_endereco']];

/** Novo contrato: "Usar o endereço do imóvel" copia o endereço do imóvel escolhido para o endereço do inquilino (ou do solidário). */
function ligarEnderecoDoImovel(raiz) {
  for (const [nomeCaixa, nomeCampo] of ENDERECO_DO_IMOVEL) {
    const caixa = raiz.querySelector(`form[data-form=cadastro] input[name=${nomeCaixa}]`);
    if (!caixa) continue;
    const form = caixa.form;
    const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
    const imovelId = () => (form.querySelector('[name=imovel_id]') || {}).value || q.imovel || q.vincular;
    const aplicar = () => {
      const i = imovelId() && buscar('imoveis', imovelId());
      const campo = form.querySelector(`[name=${nomeCampo}]`);
      if (!caixa.checked) return mensagemAuto(caixa, '');
      if (!i) return mensagemAuto(caixa, 'Escolha primeiro o imóvel deste contrato.');
      campo.value = enderecoInquilino(i);
      mensagemAuto(caixa, '');
    };
    caixa.addEventListener('change', aplicar);
    const sel = form.querySelector('[name=imovel_id]');
    if (sel) sel.addEventListener('change', aplicar);
  }
}

/**
 * Caução calculada: aluguéis × aluguel com bonificação (sem bonificação: o aluguel cheio). No novo contrato acompanha
 * sempre; na edição só preenche se estiver vazia (a caução já dada não muda sozinha).
 */
function ligarCaucao(raiz) {
  const form = raiz.querySelector('form[data-form=cadastro]');
  const valor = form && form.querySelector('[name=caucao_valor]');
  const meses = form && form.querySelector('[name=caucao_meses]');
  if (!valor || !meses || !form.querySelector('[name=aluguel_inicial]')) return;
  const novo = /^#\/novo\/contratos/.test(location.hash);
  const cent = (t) => { try { return String(t || '').trim() === '' ? NaN : C.centavos(t); } catch { return NaN; } };
  const calcular = () => {
    if (valor.readOnly || (!novo && valor.value.trim() !== '')) return;
    const n = Number(meses.value);
    const bonif = form.querySelector('[name=bonificacao]');
    const base = bonif && bonif.checked ? cent((form.querySelector('[name=aluguel_bonificado]') || {}).value) : cent(form.querySelector('[name=aluguel_inicial]').value);
    if (!(n > 0) || !Number.isFinite(base)) return;
    valor.value = F.dinheiroTexto(n * base);
    mensagemAuto(valor, `${n} × ${reais(base)} (aluguel ${bonif && bonif.checked ? 'com bonificação' : 'cheio'})`);
  };
  meses.addEventListener('input', calcular);
  for (const n of ['aluguel_inicial', 'aluguel_bonificado', 'desconto_pontualidade_percentual']) {
    const el = form.querySelector(`[name=${n}]`);
    // depois do cálculo do bonificado (que também escuta "input")
    if (el) el.addEventListener('input', () => setTimeout(calcular, 0));
  }
  ['bonificacao', 'garantia_tipo'].forEach((n) => { const el = form.querySelector(`[name=${n}]`); if (el) el.addEventListener('change', calcular); });
}

/** Endereço do imóvel para o cadastro do inquilino (ex.: "Rua X, 117, Ap 02, Bairro, Curitiba/PR, CEP 82210-050"). */
export const enderecoInquilino = (i) => endereco(i, ', ');

/** Caixa de texto de uma linha: a altura acompanha o texto (escondida, não mede: fica para quando aparecer). */
export function crescer(t) {
  if (!t.offsetParent) return;
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight + 2}px`;
}

/**
 * Rascunho da vistoria (neste navegador): o que já foi marcado fica guardado a cada mudança e volta ao reabrir a vistoria,
 * por exemplo depois de editar o modelo do imóvel. Os itens são guardados pelo cômodo e nome (o modelo pode mudar). Some ao salvar.
 */
const lerRascunho = (chave) => { try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch { return null; } };

export function guardarRascunhoVistoria() {
  const form = document.querySelector('form[data-rascunho]');
  if (!form) return;
  const f = Object.fromEntries([...new FormData(form)].filter(([, v]) => typeof v === 'string'));
  const itens = {};
  for (let n = 0; f[`ic_${n}`] !== undefined; n += 1) if (f[`is_${n}`] || f[`io_${n}`]) itens[`${f[`ic_${n}`]}|${f[`ii_${n}`]}`] = [f[`is_${n}`] || '', f[`io_${n}`] || ''];
  const campos = Object.fromEntries(['data', 'link_fotos', 'texto_abertura', 'chaves', 'descritivo', 'condicoes', 'texto_final'].filter((k) => k in f).map((k) => [k, f[k]]));
  try { localStorage.setItem(form.dataset.rascunho, JSON.stringify({ campos, itens })); } catch { /* navegador sem espaço: segue sem rascunho */ }
}

export function apagarRascunhoVistoria(chave) { try { localStorage.removeItem(chave); } catch { /* nada */ } }

function ligarRascunhoVistoria(raiz) {
  const form = raiz.querySelector('form[data-rascunho]');
  if (!form) return;
  const r = lerRascunho(form.dataset.rascunho);
  if (r) {
    for (const [k, v] of Object.entries(r.campos || {})) { const el = form.querySelector(`[name="${k}"]`); if (el) el.value = v; }
    // situação e observação de cada item: o rascunho manda (inclusive o que foi apagado)
    for (const sel of form.querySelectorAll('select[name^="is_"]')) {
      const n = sel.name.slice(3);
      const chave = `${form.querySelector(`[name="ic_${n}"]`).value}|${form.querySelector(`[name="ii_${n}"]`).value}`;
      const [s, o] = r.itens[chave] || ['', ''];
      sel.value = s;
      form.querySelector(`[name="io_${n}"]`).value = o;
    }
    const nota = document.createElement('div');
    nota.className = 'alerta info';
    nota.innerHTML = 'O preenchimento que você tinha começado foi recuperado. Ele fica guardado até salvar a vistoria. <button type="button" class="link-botao">Descartar e começar de novo</button>';
    nota.querySelector('button').addEventListener('click', () => { apagarRascunhoVistoria(form.dataset.rascunho); location.reload(); });
    form.prepend(nota);
  }
  form.addEventListener('input', guardarRascunhoVistoria);
  form.addEventListener('change', guardarRascunhoVistoria);
}

/** Vistoria: item marcado "Não se aplica" sai da tabela (fica uma linha para desfazer); ao salvar, sai também do modelo do imóvel. */
function ligarNaoSeAplica(raiz) {
  for (const sel of raiz.querySelectorAll('.grade-vistoria select[name^="is_"]')) {
    const tr = sel.closest('tr');
    const aplicar = () => {
      const fora = sel.value === K.NAO_SE_APLICA;
      tr.hidden = fora;
      const aviso = tr.nextElementSibling && tr.nextElementSibling.classList.contains('nao-aplica') ? tr.nextElementSibling : null;
      if (fora && !aviso) {
        const nome = tr.querySelector('input[name^="ii_"]').value;
        tr.insertAdjacentHTML('afterend', `<tr class="nao-aplica"><td colspan="${tr.children.length}" class="suave">${esc(nome)}: não se aplica (sai da vistoria e do modelo ao salvar) <button type="button" class="link-botao">Desfazer</button></td></tr>`);
        tr.nextElementSibling.querySelector('button').addEventListener('click', () => { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      }
      if (!fora && aviso) aviso.remove();
    };
    sel.addEventListener('change', aplicar);
    aplicar();
  }
}

/**
 * Reajuste (tela Reajustes): índice, aluguel cheio e bonificado ligados. Mudar o % recalcula os dois aluguéis; mudar o
 * cheio recalcula o % e o bonificado; mudar o bonificado recalcula o cheio e o %. Ex.: aluguel R$ 1.500,00, 10% de
 * bonificação, índice 4,37% → cheio R$ 1.565,55; digitar o bonificado R$ 1.400,00 → cheio R$ 1.555,56 e índice 3,704%.
 * ``data-origem`` guarda o último campo mexido (é o que vale ao aplicar).
 */
function ligarReajusteManual(raiz) {
  for (const form of raiz.querySelectorAll('form[data-form=aplicarReajusteManual]')) {
    const atual = Number(form.dataset.atual);
    const pctB = Number(form.dataset.bonif) || 0;
    const pctEl = form.querySelector('[name=percentual]');
    const valEl = form.querySelector('[name=valor_novo]');
    const bonEl = form.querySelector('[name=bonificado]');
    const ler = (el) => { try { return el && el.value.trim() !== '' ? C.centavos(el.value) : null; } catch { return null; } };
    const escrever = (cheio, exceto) => {
      if (exceto !== 'valor_novo') valEl.value = cheio > 0 ? reais(cheio, false) : '';
      if (bonEl && exceto !== 'bonificado') bonEl.value = cheio > 0 ? reais(cheio - C.descontoPorPercentual(cheio, pctB), false) : '';
      if (exceto !== 'percentual') pctEl.value = cheio > 0 && atual ? C.percentualPorDesconto(atual, cheio - atual).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '';
    };
    pctEl.addEventListener('input', () => {
      form.dataset.origem = 'percentual';
      let p = null;
      try { p = pctEl.value.trim() === '' ? null : C.numero(pctEl.value); } catch { /* digitando */ }
      escrever(p === null ? 0 : C.aplicarCorrecao(atual, p), 'percentual');
    });
    valEl.addEventListener('input', () => { form.dataset.origem = 'valor_novo'; escrever(ler(valEl) || 0, 'valor_novo'); });
    if (bonEl) bonEl.addEventListener('input', () => { form.dataset.origem = 'bonificado'; const b = ler(bonEl); escrever(b > 0 ? C.cheioPorBonificado(b, pctB) : 0, 'bonificado'); });
  }
}

// --------------------------------------------------------------------------
// Índices acumulados trazidos do Banco Central (séries do SGS); o usuário confere e clica em "Incluir"
// --------------------------------------------------------------------------
/** Número da série mensal de cada índice no Banco Central. Os que não estão aqui (ex.: IVAR, Poupança) são digitados. */
const SERIES_BC = { 'IGP-M': 189, IPCA: 433, INPC: 188, 'IGP-DI': 190 };

/** Acumulado de 12 meses até ``mesRef`` ('AAAA-MM'): { percentual, de } ou { falta } quando o mês ainda não saiu. */
async function acumuladoNoBancoCentral(serie, mesRef) {
  const de = C.somarMeses(mesRef, -11);
  const br = (m) => `01/${m.slice(5, 7)}/${m.slice(0, 4)}`;
  const resp = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${br(de)}&dataFinal=${br(mesRef)}`);
  const lista = resp.ok ? await resp.json() : [];
  // a resposta traz "01/MM/AAAA"; só vale com os 12 meses publicados
  const meses = new Map((Array.isArray(lista) ? lista : []).map((x) => [`${x.data.slice(6, 10)}-${x.data.slice(3, 5)}`, Number(x.valor)]));
  const todos = Array.from({ length: 12 }, (_, k) => C.somarMeses(de, k));
  const falta = todos.filter((m) => !Number.isFinite(meses.get(m)));
  return falta.length ? { falta } : { percentual: C.acumuladoDosMeses(todos.map((m) => meses.get(m))), de };
}

/** Séries mensais para corrigir o FCI: as do reajuste mais a poupança (rendimento do mês) e a SELIC do mês. */
const SERIES_FCI = { ...SERIES_BC, Poupança: 196, SELIC: 4390 };

/**
 * FCI: % de cada mês do índice, de ``de`` a ``ate`` ('AAAA-MM'), no Banco Central: { 'AAAA-MM': % }.
 * Os meses que ainda não saíram ficam de fora (a correção para no último mês publicado).
 */
export async function indicesMensaisFci(indice, de, ate) {
  const serie = SERIES_FCI[indice];
  if (!serie) throw new Error(`O índice "${indice}" não está no Banco Central. Escolha outro índice do FCI em "Editar".`);
  const br = (m) => `01/${m.slice(5, 7)}/${m.slice(0, 4)}`;
  // o Banco Central às vezes recusa consultas seguidas: tenta até 3 vezes, com uma pausa entre elas
  let lista = null;
  for (let n = 1; n <= 3 && !lista; n += 1) {
    try {
      const resp = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${br(de)}&dataFinal=${br(ate)}`);
      if (resp.ok) lista = await resp.json();
    } catch { /* sem internet ou Banco Central ocupado */ }
    if (!lista && n < 3) await new Promise((ok) => { setTimeout(ok, 2000 * n); });
  }
  if (!lista) throw new Error('Não deu para consultar o Banco Central agora (sem internet ou o site deles está ocupado). Tente de novo em alguns minutos.');
  const out = {};
  for (const x of Array.isArray(lista) ? lista : []) if (Number.isFinite(Number(x.valor))) out[`${x.data.slice(6, 10)}-${x.data.slice(3, 5)}`] = Number(x.valor);
  return out;
}

/** Tela Reajustes: ao escolher o índice ou o mês, traz o acumulado do Banco Central para o campo do % (sem salvar). */
export function ligarIndiceBancoCentral(raiz) {
  const form = raiz.querySelector('form[data-form=indiceAcumulado]');
  if (!form) return;
  const msg = form.parentElement.querySelector('[data-indice-msg]');
  const pctEl = form.querySelector('[name=percentual]');
  let pedido = 0;
  let trazido = null; // % que veio do Banco Central: sai do campo quando o índice ou o mês muda e não há valor novo
  const limpar = () => { if (trazido !== null && pctEl.value === trazido) pctEl.value = ''; trazido = null; };
  const buscar = async () => {
    const indice = form.querySelector('[name=indice]').value;
    const mes = form.querySelector('[name=mes_ref]').value;
    const serie = SERIES_BC[indice];
    const n = (pedido += 1);
    if (!serie) { limpar(); msg.className = 'alerta aviso'; msg.innerHTML = `O ${esc(indice)} não está no Banco Central: não será automático. Digite o % acumulado em 12 meses (ex.: do site da FGV).`; return; }
    if (!/^\d{4}-\d{2}$/.test(mes)) return;
    msg.className = 'suave'; msg.textContent = `Buscando o ${indice} no Banco Central…`;
    try {
      const r = await acumuladoNoBancoCentral(serie, mes);
      if (n !== pedido) return; // o usuário já trocou o índice ou o mês
      if (r.falta) { limpar(); msg.className = 'alerta aviso'; msg.innerHTML = `O ${esc(indice)} de ${esc(r.falta.map(compBr).join(', '))} ainda não saiu no Banco Central. Escolha o mês anterior ou digite o %.`; return; }
      pctEl.value = String(r.percentual).replace('.', ',');
      trazido = pctEl.value;
      msg.className = 'alerta info';
      msg.innerHTML = `${esc(indice)} acumulado de ${compBr(r.de)} a ${compBr(mes)}: <b>${pct(r.percentual)}</b> (Banco Central). Confira, corrija se precisar e clique em <b>Incluir</b>.`;
    } catch {
      if (n !== pedido) return;
      limpar();
      msg.className = 'alerta aviso'; msg.textContent = 'Não deu para consultar o Banco Central agora (sem internet?). Digite o %.';
    }
  };
  form.querySelector('[name=indice]').addEventListener('change', buscar);
  form.querySelector('[name=mes_ref]').addEventListener('change', buscar);
  buscar();
}

export function ligarCamposAutomaticos(raiz) {
  ligarReajusteManual(raiz);
  ligarRascunhoVistoria(raiz);
  ligarNaoSeAplica(raiz);
  for (const el of raiz.querySelectorAll('input[data-calculado]')) el.addEventListener('input', () => el.classList.toggle('valor-calculado', el.value.trim() === el.dataset.calculado));
  ligarContinuacaoDeContrato(raiz);
  ligarGarantiaHerdada(raiz);
  ligarEnderecoDoImovel(raiz);
  ligarCaucao(raiz);
  for (const el of raiz.querySelectorAll('input[data-mascara]')) {
    el.addEventListener('input', () => {
      const novo = F.mascarar(el.dataset.mascara, el.value);
      if (novo !== el.value) el.value = novo;
    });
    el.addEventListener('change', () => {
      // o mesmo valor de novo (ex.: ao sair do campo para clicar no botão da mensagem) não refaz a consulta
      if (el.dataset.conferido === el.value) return;
      el.dataset.conferido = el.value;
      const tipo = el.dataset.mascara;
      const erro = el.value && tipo !== 'tel' ? F.conferirDocumento(tipo, el.value) : '';
      el.classList.toggle('doc-invalido', !!erro);
      el.title = erro;
      if (erro) return mensagemAuto(el, `<span class="erro-campo">${esc(erro)}</span>`);
      // CPF/CNPJ certo: confirma logo (a consulta do CNPJ e a pessoa já cadastrada trocam a mensagem depois)
      const n = F.soDigitos(el.value);
      mensagemAuto(el, tipo !== 'cep' && tipo !== 'tel' && n ? `<span class="etiqueta ok">✓ ${n.length === 11 ? 'CPF' : 'CNPJ'} válido</span>` : '');
      if (el.dataset.preencher) {
        const cfg = JSON.parse(el.dataset.preencher);
        if (cfg.fonte === 'cep') consultarCep(el, cfg);
        else consultarCnpj(el, cfg);
      }
      if (el.hasAttribute('data-buscar-pessoa')) procurarPessoa(el);
    });
  }
}
