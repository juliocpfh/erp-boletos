// Lixeira dos anexos na nuvem: apagar um arquivo ou uma pasta pelo site (worker.mjs: DELETE arquivos/…, POST apagar) não some
// na hora do R2: vai para lixeira/AAAA-MM-DD/<caminho de antes> e fica DIAS_LIXEIRA dias (contra apagar por engano ou de má-fé:
// o R2 não tem versões). A faxina diária do cofre (alarme) apaga o que passou do prazo. lixeira/ fica fora das rotas do site
// (RAIZES do worker): só o administrador do Cloudflare recupera, pelo painel do R2.
// Arquivo gravado por cima (mesmo nome, sem "só se novo": substituir pelos de uma pasta, compactar no lugar) também deixa a
// versão de antes na lixeira (item 24 do mutirão 3000). O prazo é a regra `dias_lixeira_anexos` (padrão 30 = DIAS_LIXEIRA).
export const DIAS_LIXEIRA = 30;
export const PREFIXO_LIXEIRA = 'lixeira/';

/** Dia de hoje em Brasília (AAAA-MM-DD). */
const hoje = (agora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);

/** Caminho do arquivo na lixeira. */
export const caminhoNaLixeira = (chave, agora = new Date()) => `${PREFIXO_LIXEIRA}${hoje(agora)}/${chave}`;

/** Move um arquivo para a lixeira (copia e apaga). Devolve false se o arquivo não existia. */
export async function paraLixeira(r2, chave, { agora = new Date(), por = '' } = {}) {
  const obj = await r2.get(chave);
  if (!obj) return false;
  await r2.put(caminhoNaLixeira(chave, agora), obj.body, { httpMetadata: obj.httpMetadata, customMetadata: { ...(obj.customMetadata || {}), apagado_por: String(por).slice(0, 200), apagado_em: agora.toISOString() } });
  await r2.delete(chave);
  return true;
}

/**
 * Antes de gravar por cima: copia a versão de agora para a lixeira (sem apagar). Na lixeira fica a 1ª versão do dia (a de
 * antes de qualquer troca naquele dia). Devolve false se não havia arquivo.
 */
export async function guardarVersaoAnterior(r2, chave, { agora = new Date(), por = '' } = {}) {
  const obj = await r2.get(chave);
  if (!obj) return false;
  await r2.put(caminhoNaLixeira(chave, agora), obj.body, { onlyIf: new Headers({ 'If-None-Match': '*' }), httpMetadata: obj.httpMetadata,
    customMetadata: { ...(obj.customMetadata || {}), substituido_por: String(por).slice(0, 200), substituido_em: agora.toISOString() } });
  return true;
}

/** Apaga da lixeira o que tem mais de `dias` dias (pelo dia no caminho; padrão DIAS_LIXEIRA). Devolve quantos apagou. */
export async function faxinaDaLixeira(r2, agora = new Date(), dias = DIAS_LIXEIRA) {
  const limite = hoje(new Date(agora.getTime() - (Number.isInteger(dias) && dias > 0 ? dias : DIAS_LIXEIRA) * 86400000));
  let cursor; let apagados = 0;
  do {
    const r = await r2.list({ prefix: PREFIXO_LIXEIRA, cursor, limit: 1000 });
    const velhos = r.objects.map((o) => o.key).filter((k) => k.slice(PREFIXO_LIXEIRA.length, PREFIXO_LIXEIRA.length + 10) < limite);
    if (velhos.length) { await r2.delete(velhos); apagados += velhos.length; }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return apagados;
}
