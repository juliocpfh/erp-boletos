// As páginas de dentro de "Sistema" (#/dados, a antiga "Dados e backup"), pedido do dono de 22/11/2026: Banco
// (#/sistema-banco), Comunicação E-mail (#/sistema-email), Modelos de documentos (#/sistema-modelos) e LGPD (#/lgpd).
// As caixas continuam nos arquivos do assunto delas (banco-c6.js, banco.js, emails.js).
import { E, podeUsuario } from '../app.js';
import * as S from '../armazenamento.js';
import { caixaConfigBanco, caixaContaDosBoletos } from './banco-c6.js';
import { caixaConfigBanco2 } from './banco.js';
import { botao, etiqueta, link, opera } from './comum.js';
import { caixaGmailHtml } from './emails.js';

const topo = (titulo, acoes = '') => `<p class="suave"><a href="#/dados">← Sistema</a></p><div class="cabecalho"><h1>${titulo}</h1>${acoes ? `<div class="acoes">${acoes}</div>` : ''}</div>`;
const soAdministrador = (titulo) => `${topo(titulo)}<div class="alerta aviso">Só o administrador vê esta página.</div>`;

/** Os botões das páginas no topo de Sistema (Banco e LGPD só têm coisas do administrador). */
export function botoesDoSistema() {
  const admin = podeUsuario('admin');
  return [['#/empresas', 'Empresas'], admin && ['#/sistema-banco', 'Banco'], ['#/sistema-email', 'Comunicação E-mail'],
    ['#/sistema-modelos', 'Modelos de documentos'], admin && ['#/lgpd', 'LGPD']]
    .filter(Boolean).map(([endereco, nome]) => link(endereco, nome, 'botao secundario')).join('');
}

/**
 * Endereço de antes de 22/11/2026 (favorito, aviso aberto, volta do Google) → a página em que a caixa está agora, ou ''.
 * Ex.: ('dados', { ir: 'banco' }) → '#/sistema-banco?ir=banco'; ('dados', {}) → '' (continua sendo Sistema).
 */
export function enderecoMudado(tela, q = {}) {
  if (tela === 'dados' && q.gmail) return `#/sistema-email?gmail=${q.gmail}`;
  const mudaram = { dados: ['banco', 'config-banco2'], empresas: ['conta-boletos'] }[tela] || [];
  return mudaram.includes(q.ir) ? `#/sistema-banco?ir=${q.ir}` : '';
}

/** Banco (configuração): a ponte e as contas do C6, quem emite os boletos, conciliação e pagamentos. */
export function telaSistemaBanco() {
  if (!podeUsuario('admin')) return soAdministrador('Banco (configuração)');
  return `${topo('Banco (configuração)', link('#/banco', 'Ver extrato e movimentações', 'botao secundario'))}
    ${caixaConfigBanco()}
    ${caixaContaDosBoletos()}
    ${caixaConfigBanco2()}`;
}

/** Comunicação E-mail: o Gmail da empresa e os modelos de e-mail. `q.gmail`: aviso da volta do Google ao conectar. */
export async function telaSistemaEmail(q = {}) {
  return `${topo('Comunicação E-mail')}
    ${await caixaGmailHtml(q.gmail)}
    <div class="cartao" id="modelos-de-email"><h2>Modelos de e-mail</h2><p>Um e-mail para cada etapa da ficha, da entrada e da saída do inquilino, a régua de cobrança (lembretes antes e no dia do vencimento, boleto em atraso), as notificações ao inquilino, o novo valor do aluguel, os termos aditivos e o informe anual do Imposto de Renda (botão <b>✉ E-mail</b> em cada etapa).</p>${link('#/modelos-email', 'Ver e editar os modelos de e-mail')}</div>`;
}

/** Modelos de documentos: contrato, termos aditivos, outros documentos da locação e o Excel da NF. */
export async function telaSistemaModelos() {
  let modeloProprio = false;
  try {
    await (await E.pasta.getDirectoryHandle(S.PASTA_MODELOS)).getFileHandle(S.MODELO_FATURA);
    modeloProprio = true;
  } catch { /* usa o modelo padrão */ }
  return `${topo('Modelos de documentos')}
    <div class="cartao" id="modelos-de-contrato"><h2>Modelos de contrato</h2><p>Textos usados no botão <b>Gerar contrato</b> do inquilino (residencial, não residencial e os que você criar).</p>${link('#/modelos-contrato', 'Ver e editar os modelos de contrato')}</div>
    <div class="cartao" id="modelos-de-aditivo"><h2>Termos aditivos</h2><p>Textos usados no botão <b>Gerar termo aditivo</b> do inquilino: troca do vencimento, troca de inquilino e novo valor do aluguel.</p>${link('#/modelos-contrato?ir=modelos-aditivo', 'Ver e editar os termos aditivos')}</div>
    <div class="cartao" id="outros-documentos"><h2>Outros documentos da locação</h2><p>Prorrogação do prazo, troca de garantia, distrato (rescisão amigável), aviso de desocupação do inquilino, notificação para desocupação, autorização de obra, declaração de pagamentos em dia e aviso ao fiador. Cada um tem o <b>Exemplo em PDF</b> para ler e ajustar o texto; para gerar, botão <b>Outros documentos</b> na página do inquilino.</p>${link('#/modelos-contrato?ir=modelos-outros', 'Ver e editar os outros documentos')}</div>
    <div class="cartao" id="modelo-excel"><h2>Modelo Excel da NF</h2>
      <p>${modeloProprio ? `${etiqueta('Modelo próprio', 'ok')} usando o arquivo enviado (${S.PASTA_MODELOS}/${S.MODELO_FATURA}).` : 'Usando o modelo padrão do sistema (uma NF por empresa, com os dados do cadastro de Empresas).'}</p>
      <p class="suave">Para trocar, envie um .xlsx com uma aba por empresa no mesmo desenho. Os dados são preenchidos nas mesmas células da planilha original (peça ao técnico se precisar do detalhe).</p>
      ${opera() ? `<form data-form="modeloExcel" class="acoes"><input type="file" name="modelo" accept=".xlsx" style="max-width:380px"><button class="secundario">Enviar modelo</button>${modeloProprio ? botao('removerModelo', 'Voltar ao modelo padrão', {}, 'perigo pequeno', 'Voltar ao modelo padrão?') : ''}</form>` : ''}</div>`;
}

/** LGPD: os dados de uma pessoa e quem já passou dos 10 anos de guarda. */
export function telaLgpd() {
  if (!podeUsuario('admin')) return soAdministrador('LGPD');
  return `${topo('LGPD')}
    <div class="cartao" id="dados-de-uma-pessoa"><h2>Dados de uma pessoa</h2><p>Pelo CPF: onde a pessoa aparece e um arquivo com tudo dela (quando ela pedir). Dez anos depois do fim do último contrato, apagar tudo dela de uma vez.</p>
      <p class="acoes">${link('#/pessoa', 'Dados de uma pessoa', 'botao secundario pequeno')} ${link('#/pessoas-antigas', 'Pessoas com mais de 10 anos do fim do contrato', 'botao secundario pequeno')}</p></div>`;
}
