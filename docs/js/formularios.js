// Campos de cada cadastro, desenho dos formulários e leitura do que foi digitado.
import { centavos, numero } from './calculos.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const campo = (nome, rotulo, tipo = 'texto', extra = {}) => ({ nome, rotulo, tipo, ...extra });
const secao = (titulo) => ({ secao: titulo });

export const INDICES = ['IGP-M', 'IPCA', 'INPC', 'IVAR', 'IGP-DI', 'Poupança', 'Outro'];

export const IMOVEL = [
  secao('Identificação'),
  campo('nome', 'Nome do imóvel', 'texto', { obrig: true, ajuda: 'Ex.: Loja 1 - Nilo Brandão' }),
  campo('endereco', 'Endereço', 'texto', { obrig: true, largo: true }),
  campo('complemento', 'Complemento'),
  campo('bairro', 'Bairro'),
  campo('cidade', 'Cidade (município)'),
  campo('cep', 'CEP'),
  campo('grupo_id', 'Faz parte do grupo Airbnb', 'opcao', { opcoes: [], ajuda: 'Deixe em branco se não é Airbnb' }),
  secao('Registros'),
  campo('matricula', 'Matrícula'),
  campo('cartorio', 'Cartório de registro'),
  campo('inscricao_iptu', 'Inscrição imobiliária (IPTU)'),
  campo('copel_uc', 'Unidade consumidora Copel'),
  campo('sanepar_matricula', 'Matrícula Sanepar'),
  campo('condominio_nome', 'Condomínio'),
  campo('condominio_contato', 'Contato do condomínio'),
  campo('administradora_nome', 'Administradora do condomínio'),
  campo('administradora_contato', 'Contato da administradora'),
  secao('Último anúncio'),
  campo('anuncio_link', 'Link do último anúncio', 'url', { largo: true }),
  campo('anuncio_data', 'Data do anúncio', 'data'),
  secao('Observações'),
  campo('verificar', 'Pontos a verificar (aparece em amarelo)', 'area'),
  campo('observacoes', 'Observações', 'area'),
];

export const GRUPO_AIRBNB = [
  secao('Grupo Airbnb'),
  campo('nome', 'Nome do grupo', 'texto', { obrig: true, ajuda: 'Ex.: Airbnb' }),
  campo('endereco', 'Endereço', 'texto', { obrig: true, largo: true }),
  campo('cidade', 'Cidade (município)'),
  secao('Cliente que aparece na fatura (tomador)'),
  campo('cliente_nome', 'Nome do cliente', 'texto', { obrig: true, largo: true, ajuda: 'Ex.: AIRBNB PLATAFORMA DIGITAL LTDA' }),
  campo('cliente_documento', 'CPF / CNPJ do cliente'),
  campo('cliente_telefone', 'Telefone do cliente', 'tel'),
  campo('cliente_endereco', 'Endereço do cliente', 'texto', { largo: true, ajuda: 'Em branco: usa o endereço da unidade' }),
  secao('Observações'),
  campo('observacoes', 'Observações', 'area'),
];

export const CONTRATO = [
  secao('Inquilino (responsável pelo contrato)'),
  campo('inquilino_nome', 'Nome completo', 'texto', { obrig: true, largo: true }),
  campo('inquilino_apelido', 'Apelido'),
  campo('inquilino_telefone', 'Telefone', 'tel'),
  campo('inquilino_whatsapp', 'Este telefone é WhatsApp', 'simnao'),
  campo('inquilino_email', 'E-mail', 'email'),
  campo('inquilino_cpf', 'CPF / CNPJ'),
  campo('inquilino_rg', 'RG'),
  campo('responsavel_nome', 'Outro contato (se houver)'),
  campo('responsavel_telefone', 'Telefone do contato', 'tel'),
  campo('responsavel_email', 'E-mail do contato', 'email'),
  campo('contrato_anterior_id', 'Continua o contrato de', 'opcao', { opcoes: [], ajuda: 'Ex.: alteração de titular. Liga o histórico dos dois inquilinos' }),
  secao('Datas e prazo'),
  campo('data_entrada', 'Data de entrada', 'data', { obrig: true }),
  campo('data_saida', 'Data de saída', 'data', { ajuda: 'Use o botão "Registrar saída" na página do inquilino para fazer o cálculo final' }),
  campo('vigencia_inicio', 'Início do contrato', 'data', { obrig: true }),
  campo('prazo_tipo', 'Prazo', 'opcao', { obrig: true, padrao: 'Determinado', opcoes: ['Determinado', 'Indeterminado'] }),
  campo('vigencia_fim', 'Fim do contrato (prazo determinado)', 'data'),
  campo('renovacao_automatica', 'Renovação automática', 'simnao'),
  secao('Correção anual'),
  campo('indice_correcao', 'Índice de correção previsto no contrato', 'opcao', { opcoes: INDICES }),
  campo('data_base_correcao', 'Data-base da correção', 'data', { ajuda: 'O alerta de correção usa o aniversário desta data. Em branco: início do contrato' }),
  secao('Valores e cobrança'),
  campo('aluguel_inicial', 'Aluguel inicial (valor cheio, histórico)', 'dinheiro', { obrig: true }),
  campo('dia_vencimento', 'Dia do vencimento', 'inteiro', { obrig: true, padrao: 10 }),
  campo('cobranca_mes_seguinte', 'O aluguel do mês vence no mês seguinte', 'simnao', { padrao: true, ajuda: 'Marcado: aluguel de julho vence em agosto' }),
  campo('bonificacao', 'Tem bonificação (desconto) por pontualidade', 'simnao', { padrao: true }),
  campo('desconto_pontualidade_percentual', 'Bonificação (%)', 'pct', { vinculo: 'desconto' }),
  campo('desconto_pontualidade_valor', 'Bonificação (R$)', 'dinheiro', { virtual: true, vinculo: 'desconto', ajuda: 'Preencha o % ou o valor: um calcula o outro' }),
  campo('taxa_boleto', 'Taxa de emissão do boleto (R$)', 'dinheiro'),
  campo('multa_percentual', 'Multa por atraso (%)', 'pct', { padrao: 2 }),
  campo('juros_mensal_percentual', 'Juros por atraso (% ao mês)', 'pct', { padrao: 1 }),
  campo('cobrar_iptu', 'Cobrar IPTU do inquilino', 'simnao', { padrao: true }),
  secao('Garantia'),
  campo('garantia_tipo', 'Tipo de garantia', 'opcao', { obrig: true, opcoes: ['Caução', 'Depósito garantia', 'Fiador', 'Fiador + depósito', 'Seguro fiança', 'Sem garantia'],
    ajuda: 'Os fiadores são cadastrados na página do inquilino depois de salvar' }),
  campo('caucao_valor', 'Valor da caução', 'dinheiro', { mostrar: ['Caução'] }),
  campo('caucao_data', 'Data em que a caução foi dada', 'data', { mostrar: ['Caução'] }),
  campo('caucao_meses', 'Caução equivale a quantos aluguéis', 'inteiro', { mostrar: ['Caução'], ajuda: 'Usado para sugerir o novo valor quando o aluguel for corrigido' }),
  campo('deposito_valor', 'Valor do depósito de garantia', 'dinheiro', { mostrar: ['Depósito garantia', 'Fiador + depósito'] }),
  campo('deposito_data', 'Data do depósito', 'data', { mostrar: ['Depósito garantia', 'Fiador + depósito'] }),
  campo('deposito_uso', 'Quando e onde o depósito será usado', 'texto', { largo: true, mostrar: ['Depósito garantia', 'Fiador + depósito'], ajuda: 'Ex.: abatido nos dois últimos aluguéis do contrato' }),
  secao('Reserva dada na visita'),
  campo('reserva_valor', 'Valor da reserva', 'dinheiro'),
  campo('reserva_data', 'Data da reserva', 'data'),
  campo('reserva_competencia', 'Usar a reserva no aluguel de', 'mes', { ajuda: 'Em branco: usa no primeiro aluguel' }),
  secao('Observações'),
  campo('verificar', 'Pontos a verificar (aparece em amarelo)', 'area'),
  campo('observacoes', 'Observações', 'area'),
];

export const CORRECAO = [
  campo('data_vigencia', 'Vale a partir de', 'data', { obrig: true, ajuda: 'A cobrança de um mês usa o valor vigente no dia 1º daquele mês' }),
  campo('indice', 'Índice', 'opcao', { opcoes: INDICES }),
  campo('percentual', 'Percentual do índice (%)', 'pct', { ajuda: 'Informe o percentual ou o novo valor' }),
  campo('valor_novo', 'Novo valor do aluguel', 'dinheiro'),
  campo('observacoes', 'Observações', 'area'),
];

export const SEGURO = [
  campo('seguradora', 'Seguradora'),
  campo('apolice', 'Nº da apólice'),
  campo('data_contratacao', 'Data de contratação', 'data'),
  campo('vigencia_inicio', 'Início da vigência', 'data', { obrig: true }),
  campo('vigencia_fim', 'Fim da vigência', 'data', { obrig: true }),
  campo('valor_total', 'Valor total', 'dinheiro', { obrig: true }),
  campo('num_parcelas', 'Número de parcelas', 'inteiro', { obrig: true, padrao: 1 }),
  campo('primeira_competencia', 'Cobrar 1ª parcela no aluguel de', 'mes', { obrig: true }),
  campo('observacoes', 'Observações', 'area'),
];

export const IPTU = [
  campo('ano', 'Ano', 'inteiro', { obrig: true }),
  campo('valor_total', 'Valor total do IPTU', 'dinheiro', { obrig: true }),
  campo('num_parcelas', 'Número de parcelas', 'inteiro', { obrig: true, padrao: 10 }),
  campo('valor_parcela', 'Valor fixo cobrado por parcela (opcional)', 'dinheiro', { ajuda: 'Ex.: arredondar para R$ 213,00. Em branco: total ÷ parcelas' }),
  campo('primeira_competencia', 'Cobrar 1ª parcela no aluguel de', 'mes', { obrig: true }),
  campo('observacoes', 'Observações', 'area'),
];

export const TITULARIDADE = [
  campo('concessionaria', 'Concessionária', 'opcao', { obrig: true, opcoes: ['Copel', 'Sanepar', 'Supergasbras', 'Condomínio', 'Outra'] }),
  campo('contrato_id', 'Inquilino', 'opcao', { opcoes: [], ajuda: 'Em branco se a conta voltou para o proprietário' }),
  campo('tipo', 'Tipo', 'opcao', { opcoes: ['Para o inquilino', 'Volta para o proprietário'] }),
  campo('protocolo', 'Nº do protocolo'),
  campo('data', 'Data', 'data'),
  campo('situacao', 'Situação', 'opcao', { opcoes: ['Solicitado', 'Concluído', 'Pendente'] }),
  campo('observacoes', 'Observações', 'area'),
];

export const RECEBIMENTO = [
  campo('data_pagamento', 'Data em que o dinheiro entrou', 'data', { obrig: true }),
  campo('valor', 'Valor recebido', 'dinheiro', { obrig: true }),
  campo('unidade_id', 'Unidade', 'opcao', { opcoes: [] }),
  campo('periodo_inicio', 'Período: de', 'data'),
  campo('periodo_fim', 'Período: até', 'data'),
  campo('tomador_nome', 'Cliente na fatura', 'texto', { obrig: true, largo: true }),
  campo('tomador_documento', 'CPF / CNPJ do cliente'),
  campo('tomador_telefone', 'Telefone do cliente', 'tel'),
  campo('tomador_endereco', 'Endereço na fatura', 'texto', { largo: true, ajuda: 'Em branco: endereço da unidade' }),
  campo('observacoes', 'Observações', 'area'),
];

export const FIADOR = [
  campo('nome', 'Nome', 'texto', { obrig: true, largo: true }),
  campo('cpf', 'CPF'),
  campo('rg', 'RG'),
  campo('telefone', 'Telefone', 'tel'),
  campo('email', 'E-mail', 'email'),
  campo('endereco', 'Endereço', 'texto', { largo: true }),
  campo('observacoes', 'Observações', 'area'),
];

export const APLICACAO = [
  campo('data', 'Data da aplicação', 'data', { obrig: true }),
  campo('emitente_id', 'Empresa onde foi aplicado', 'opcao', { obrig: true, opcoes: [] }),
  campo('valor', 'Valor aplicado', 'dinheiro', { obrig: true }),
  campo('observacoes', 'Observações (banco, aplicação)', 'area'),
];

export const CORRECAO_GARANTIA = [
  campo('data', 'Data', 'data', { obrig: true }),
  campo('valor_novo', 'Novo valor da caução', 'dinheiro', { obrig: true }),
  campo('complemento', 'Complemento pago pelo inquilino', 'dinheiro', { ajuda: 'Em branco: diferença entre o novo e o anterior' }),
  campo('observacoes', 'Observações', 'area'),
];

export const RENOVACAO = [
  campo('data', 'Data', 'data', { obrig: true, ajuda: 'O novo valor (se houver) vale a partir desta data' }),
  campo('tipo', 'O que aconteceu', 'opcao', { obrig: true, opcoes: ['Renovado com nova data de término', 'Passou a prazo indeterminado', 'Novo valor negociado'] }),
  campo('nova_vigencia_fim', 'Nova data de término', 'data', { ajuda: 'Só para renovação com prazo determinado' }),
  campo('novo_valor', 'Novo valor do aluguel negociado (valor cheio)', 'dinheiro'),
  campo('observacoes', 'Observações', 'area'),
];

export const ENCERRAMENTO = [
  campo('data_saida', 'Data de saída', 'data', { obrig: true }),
  campo('garantia_valor', 'Valor da garantia a devolver (caução ou depósito)', 'dinheiro'),
  campo('indice_percentual', 'Correção da garantia: índice da poupança no período (%)', 'pct'),
  campo('debitos', 'Débitos do inquilino a descontar', 'dinheiro', { ajuda: 'Aluguéis e encargos em aberto, reparos da vistoria etc.' }),
  campo('debitos_descricao', 'Descrição dos débitos', 'area'),
  campo('vistoria_saida', 'Vistoria de saída', 'opcao', { opcoes: ['Sem pendências', 'Com pendências', 'Contestada', 'Não feita'] }),
  campo('observacoes', 'Observações', 'area'),
];

export const AVULSA = [
  campo('data_pagamento', 'Data em que o dinheiro entrou', 'data', { obrig: true }),
  campo('valor', 'Valor da fatura', 'dinheiro', { obrig: true }),
  campo('descricao', 'Descrição', 'texto', { largo: true, ajuda: 'Ex.: Airbnb outubro, aluguel de vaga, reembolso' }),
  campo('imovel_id', 'Imóvel (opcional)', 'opcao', { opcoes: [], ajuda: 'Se escolher, usa as empresas e o endereço do imóvel' }),
  campo('periodo_inicio', 'Período: de', 'data'),
  campo('periodo_fim', 'Período: até', 'data'),
  campo('tomador_nome', 'Cliente na fatura', 'texto', { obrig: true, largo: true }),
  campo('tomador_documento', 'CPF / CNPJ do cliente'),
  campo('tomador_telefone', 'Telefone do cliente', 'tel'),
  campo('tomador_endereco', 'Endereço na fatura', 'texto', { largo: true }),
  campo('municipio', 'Município', 'texto', { padrao: 'CURITIBA' }),
  campo('observacoes', 'Observações', 'area'),
];

export const EMITENTE = [
  campo('nome', 'Nome no topo da fatura', 'texto', { obrig: true, ajuda: 'Ex.: ANK ADMINISTRADORA' }),
  campo('razao_social', 'Razão social', 'texto', { obrig: true, largo: true }),
  campo('cnpj', 'CNPJ'),
  campo('endereco', 'Endereço (como aparece na fatura)', 'texto', { largo: true }),
  campo('municipio', 'Município do serviço', 'texto', { padrao: 'CURITIBA' }),
  campo('aba_modelo', 'Aba no modelo Excel', 'texto', { ajuda: 'Nome da aba do modelo para esta empresa (ex.: ANK)' }),
  campo('ativo', 'Ativa', 'simnao', { padrao: true }),
];

export const USUARIO = [
  campo('login', 'Login', 'texto', { obrig: true }),
  campo('nome', 'Nome', 'texto', { obrig: true }),
  campo('papel', 'Perfil', 'opcao', { obrig: true, opcoes: [['admin', 'Administrador'], ['operador', 'Operador (edita)'], ['consulta', 'Consulta (só vê)']] }),
  campo('ativo', 'Ativo', 'simnao', { padrao: true }),
];

export const COBRANCA = [
  campo('vencimento', 'Vencimento', 'data', { obrig: true }),
  campo('aluguel', 'Aluguel', 'dinheiro', { obrig: true }),
  campo('desconto', 'Desconto de pontualidade', 'dinheiro'),
  campo('iptu', 'IPTU', 'dinheiro'),
  campo('seguro', 'Seguro', 'dinheiro'),
  campo('taxa_boleto', 'Taxa do boleto', 'dinheiro'),
  campo('outros', 'Outros valores', 'dinheiro'),
  campo('outros_descricao', 'Descrição de outros valores'),
  campo('reserva_utilizada', 'Reserva utilizada', 'dinheiro'),
  campo('multa_percentual', 'Multa por atraso (%)', 'pct'),
  campo('juros_mensal_percentual', 'Juros por atraso (% ao mês)', 'pct'),
  campo('observacoes', 'Observações', 'area'),
];

// --------------------------------------------------------------------------
export function dinheiroTexto(c) {
  if (c === null || c === undefined || c === '') return '';
  return (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pctTexto(n) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false });
}

/** Valores de um registro no formato que aparece nos campos da tela. */
export function paraFormulario(campos, registro) {
  const v = {};
  for (const c of campos) {
    if (!c.nome) continue;
    let x = registro ? registro[c.nome] : c.padrao;
    if (x === undefined || x === null) x = '';
    if (c.tipo === 'dinheiro' && x !== '') x = dinheiroTexto(x);
    else if (c.tipo === 'pct' && x !== '') x = pctTexto(x);
    v[c.nome] = x;
  }
  return v;
}

/** Converte o formulário enviado. Devolve { dados, erros }. */
export function ler(campos, form) {
  const fd = form instanceof FormData ? form : new FormData(form);
  const dados = {};
  const erros = {};
  for (const c of campos) {
    if (!c.nome || c.virtual) continue;
    const bruto = String(fd.get(c.nome) ?? '').trim();
    if (c.tipo === 'simnao') {
      dados[c.nome] = fd.get(c.nome) === '1';
      continue;
    }
    if (!bruto) {
      if (c.obrig) erros[c.nome] = 'Campo obrigatório';
      dados[c.nome] = null;
      continue;
    }
    try {
      if (c.tipo === 'dinheiro') dados[c.nome] = centavos(bruto);
      else if (c.tipo === 'pct') dados[c.nome] = numero(bruto);
      else if (c.tipo === 'inteiro') {
        const n = numero(bruto);
        if (!Number.isInteger(n)) throw new Error();
        dados[c.nome] = n;
      } else if (c.tipo === 'data') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) throw new Error();
        dados[c.nome] = bruto;
      } else if (c.tipo === 'mes') {
        if (!/^\d{4}-\d{2}$/.test(bruto)) throw new Error();
        dados[c.nome] = bruto;
      } else if (c.tipo === 'url') {
        const u = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
        if (/\s/.test(u) || !u.includes('.')) throw new Error();
        dados[c.nome] = u;
      } else if (c.tipo === 'opcao' && c.nome.endsWith('_id')) dados[c.nome] = Number(bruto);
      else dados[c.nome] = bruto;
    } catch {
      erros[c.nome] = 'Valor inválido';
    }
  }
  return { dados, erros };
}

/** HTML dos campos de um formulário. */
export function camposHtml(campos, valores = {}, erros = {}) {
  const partes = campos.map((c) => {
    if (c.secao) return `<h3>${esc(c.secao)}</h3>`;
    const v = valores[c.nome] ?? '';
    const id = `f_${c.nome}`;
    let entrada;
    if (c.tipo === 'simnao') {
      const marcado = v === true || v === '1' || v === 1;
      return `<div class="${erros[c.nome] ? 'com-erro' : ''}"><label class="check"><input type="checkbox" name="${c.nome}" value="1" ${marcado ? 'checked' : ''}> ${esc(c.rotulo)}</label>${c.ajuda ? `<div class="ajuda">${esc(c.ajuda)}</div>` : ''}</div>`;
    }
    if (c.tipo === 'area') entrada = `<textarea id="${id}" name="${c.nome}">${esc(v)}</textarea>`;
    else if (c.tipo === 'opcao') {
      const ops = c.opcoes.map((o) => (Array.isArray(o) ? o : [o, o]));
      if (v !== '' && !ops.some(([k]) => String(k) === String(v))) ops.push([v, v]);
      entrada = `<select id="${id}" name="${c.nome}"><option value=""></option>${ops.map(([k, t]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    } else {
      const tipo = { data: 'date', mes: 'month', email: 'email', url: 'url', tel: 'tel' }[c.tipo] || 'text';
      const extra = ['dinheiro', 'pct', 'inteiro'].includes(c.tipo) ? 'inputmode="decimal"' : '';
      const vinc = c.vinculo ? `data-vinculo="${c.vinculo}" data-tipo="${c.tipo}"` : '';
      entrada = `<input id="${id}" name="${c.nome}" type="${tipo}" value="${esc(v)}" ${extra} ${vinc} ${c.tipo === 'mes' ? 'placeholder="AAAA-MM"' : ''}>`;
    }
    return `<div class="${c.largo ? 'largo' : ''} ${erros[c.nome] ? 'com-erro' : ''}" ${c.mostrar ? `data-mostrar="${esc(c.mostrar.join('|'))}"` : ''}>
      <label for="${id}">${esc(c.rotulo)}${c.obrig ? ' *' : ''}</label>${entrada}
      ${c.ajuda ? `<div class="ajuda">${esc(c.ajuda)}</div>` : ''}
      ${erros[c.nome] ? `<div class="erro-campo">${esc(erros[c.nome])}</div>` : ''}</div>`;
  });
  return `<div class="formulario">${partes.join('')}</div>`;
}
