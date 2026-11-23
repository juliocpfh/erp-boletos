// Certificado digital da empresa, do lado do site (pedido do dono de 22/11/2026): entrega o .pfx e a senha DIRETO ao programa
// do PC, em 127.0.0.1 (atualizador-pc/certificado-local.mjs). Nunca use a API da nuvem, `alterar`, `salvarArquivo` nem o
// armazenamento do navegador aqui: o arquivo e a senha só existem na memória até o envio. Não importe nada de telas/.
import * as C from './calculos.js';

export const PROTOCOLO = 'imoveis-certificado';
export const PORTA = 47631;
export const IDENTIDADE = 'imoveis-certificado';
/** O instalador na release (o mesmo de atualizador-pc/se-atualizar.mjs; o teste confere). */
export const URL_PROGRAMA = 'https://github.com/juliocpfh/erp-boletos/releases/download/programa-pc/Instalar-Administracao-de-Imoveis.exe';
export const MAX_PFX = 64 * 1024;
const BASE = `http://127.0.0.1:${PORTA}`;

/** O programa deste computador, se está esperando: { ligado, atual }, ou null. */
export async function programaEsperando({ buscar = fetch } = {}) {
  try {
    // espera longa: na 1ª vez o Chrome segura o pedido até a pessoa responder se o site pode falar com este computador
    const r = await buscar(`${BASE}/estado`, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(60000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.programa === IDENTIDADE ? { ligado: !!d.ligado, atual: d.atual || null } : null;
  } catch { return null; }
}

/** Recusa na tela o que não é um A1. Ex.: "contrato.pdf" → "Escolha o arquivo do certificado A1 (termina em .pfx ou .p12)." */
export function conferirEscolha(arquivo, senha) {
  if (!arquivo || !/\.(pfx|p12)$/i.test(arquivo.name || '')) throw new C.ErroUsuario('Escolha o arquivo do certificado A1 (termina em .pfx ou .p12).');
  if (!arquivo.size || arquivo.size > MAX_PFX) throw new C.ErroUsuario('Este arquivo não parece um certificado A1 (ele tem poucos KB, no máximo 64 KB).');
  if (!senha) throw new C.ErroUsuario('Digite a senha do certificado.');
}

/** Pede ao programa deste computador para apagar o certificado. Devolve { removido, tinha }. */
export async function removerCertificado({ buscar = fetch } = {}) {
  let r;
  try {
    r = await buscar(`${BASE}/remover`, { method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json' }, body: '{}' });
  } catch { throw new C.ErroUsuario('O programa do PC parou de responder. Feche esta janela e clique no botão de novo.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new C.ErroUsuario(d.erro || `O programa do PC não removeu o certificado (erro ${r.status}).`);
  return d;
}

/** Entrega ao programa. Devolve { nome, cnpj, validade, tarefa }. */
export async function entregarCertificado(arquivo, senha, { buscar = fetch } = {}) {
  conferirEscolha(arquivo, senha);
  const pfx = btoa(Array.from(new Uint8Array(await arquivo.arrayBuffer()), (b) => String.fromCharCode(b)).join(''));
  let r;
  try {
    r = await buscar(`${BASE}/instalar`, {
      method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pfx, senha }),
    });
  } catch {
    throw new C.ErroUsuario('O programa do PC parou de responder. Feche esta janela e clique no botão de novo.');
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new C.ErroUsuario(`${d.erro || `O programa do PC recusou o certificado (erro ${r.status}).`}${d.acabou ? ' Foram tentativas demais: feche esta janela e clique no botão de novo.' : ''}`);
  return d;
}
