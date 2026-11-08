// Anexos na nuvem: uma "pasta virtual" com a mesma interface da pasta do computador (FileSystemDirectoryHandle), guardada no R2
// pelo Worker (nuvem/worker.mjs: lista/, arquivos/, mover, apagar). Assim armazenamento.js e as telas funcionam sem mudar.
// Sem internet: anexo novo fica guardado no aparelho e sobe quando a internet voltar; abrir, apagar e mover pedem internet.
// A raiz tem as pastas "arquivos", "modelos" e "backups" (só leitura), como a pasta dos dados de hoje.

import { erroDeRede, limiteDeTempo, passageiro, TEMPO_LIMITE, TEMPO_LIMITE_ANEXO } from './nuvem.js';

const RAIZES = ['arquivos', 'modelos', 'backups'];
const VALIDADE_LISTA = 60000; // ms: a lista de uma pasta é reaproveitada por pouco tempo (o painel percorre muitas pastas;
// a tela se redesenha a cada mudança de outro aparelho). O que este aparelho grava, apaga ou move já atualiza a lista na hora.

const naoAchou = (nome) => new DOMException(`"${nome}" não encontrado.`, 'NotFoundError');
const semInternet = (oQue) => Object.assign(new Error(`Sem internet: ${oQue} precisa de conexão. Tente de novo quando a internet voltar.`), { esperado: true });
const codificar = (partes) => partes.map(encodeURIComponent).join('/');

/**
 * Cliente dos anexos: chama a API, guarda as listas por pouco tempo e a fila de envios feitos sem internet.
 * `guardar` (IndexedDB no navegador) guarda a fila (com os arquivos) e as últimas listas, para ver os nomes sem internet.
 * Anexo da fila que a nuvem recusa (não é falta de internet) fica em `naoEnviados`, com o arquivo, para baixar pela tela de conflitos.
 */
export class AnexosNuvem {
  constructor({ base = 'api/', buscar = (...a) => fetch(...a), guardar, limite = TEMPO_LIMITE, limiteAnexo = TEMPO_LIMITE_ANEXO }) {
    this.base = base; this.buscar = buscar; this.guardar = guardar; this.limite = limite; this.limiteAnexo = limiteAnexo;
    this.listas = new Map(); // caminho → { em, pastas: Set, arquivos: Map(nome → tamanho) }
    this.buscando = new Map(); // caminho → pedido em andamento (várias caixas da tela pedindo a mesma pasta: um pedido só)
    this.criadas = new Set(); // pastas criadas vazias (o R2 não tem pasta sem arquivo)
    this.tudo = null; // { raiz, em }: a árvore inteira veio de uma vez (carregarTudo); pasta fora dela = vazia, sem pedir à nuvem
    this.carregandoTudo = null;
    this.fila = null; this.naoEnviados = []; this.avisos = []; this.enviando = null;
  }

  async pedir(metodo, rota, { corpo, cabecalhos = {} } = {}) {
    let r;
    try {
      r = await this.buscar(`${this.base}${rota}`, {
        method: metodo, cache: 'no-store', credentials: 'same-origin', body: corpo,
        signal: limiteDeTempo(metodo === 'PUT' ? this.limiteAnexo : this.limite),
        headers: metodo === 'GET' ? cabecalhos : { 'X-Sistema': 'imoveis', ...cabecalhos },
      });
    } catch (e) {
      throw erroDeRede(e);
    }
    if (r.redirected) throw Object.assign(new Error('Seu acesso pela internet venceu. Recarregue a página para entrar de novo.'), { status: 401, esperado: true });
    if (!r.ok) {
      const dados = await r.json().catch(() => ({}));
      throw Object.assign(new Error(dados.erro || `Erro ${r.status} na nuvem.`), { status: r.status, esperado: r.status < 500 });
    }
    return r;
  }

  async carregarFila() {
    if (!this.fila) {
      this.fila = (await this.guardar?.ler('fila-anexos')) || [];
      this.naoEnviados = (await this.guardar?.ler('anexos-nao-enviados')) || [];
    }
    return this.fila;
  }

  async gravarFila() { await this.guardar?.gravar('fila-anexos', this.fila); }

  /** Anexo que a nuvem recusou: sai da fila mas o arquivo fica no aparelho até o usuário baixar ou esquecer. */
  async guardarNaoEnviado(f, erro) {
    this.naoEnviados.push({ ...f, erro });
    await this.guardar?.gravar('anexos-nao-enviados', this.naoEnviados);
  }

  async lerNaoEnviado(id) {
    const f = this.naoEnviados.find((x) => x.id === id);
    if (!f) return null;
    return { nome: f.partes.at(-1), blob: (await this.guardar?.ler(`anexo:${id}`)) || new Blob([]) };
  }

  async esquecerNaoEnviado(id) {
    this.naoEnviados = this.naoEnviados.filter((x) => x.id !== id);
    await this.guardar?.apagar?.(`anexo:${id}`);
    await this.guardar?.gravar('anexos-nao-enviados', this.naoEnviados);
  }

  /** Lista de uma pasta: { pastas: Set, arquivos: Map(nome → tamanho) }, juntando o que está na fila deste aparelho. */
  async lista(partes, { fresca = false } = {}) {
    const chave = partes.join('/');
    const fila = await this.carregarFila();
    let l = this.listas.get(chave);
    // a árvore inteira chegou há pouco e esta pasta não estava nela: não tem arquivo (pasta vazia ou que nem existe)
    if (!l && !fresca && this.tudoFresco(chave)) { l = { em: this.tudo.em, pastas: new Set(), arquivos: new Map() }; this.listas.set(chave, l); }
    if (!l || fresca || Date.now() - l.em > VALIDADE_LISTA) {
      try {
        let pedido = this.buscando.get(chave);
        if (!pedido) {
          pedido = this.pedir('GET', `lista/${codificar(partes)}/`).then((resp) => resp.json()).finally(() => this.buscando.delete(chave));
          this.buscando.set(chave, pedido);
        }
        const r = await pedido;
        l = { em: Date.now(), pastas: new Set(r.pastas), arquivos: new Map(r.arquivos.map((a) => [a.nome, a.tamanho])) };
        this.guardar?.gravar(`lista:${chave}`, { pastas: r.pastas, arquivos: r.arquivos }).catch(() => {});
      } catch (e) {
        if (!passageiro(e)) throw e;
        const salva = l || (await this.guardar?.ler(`lista:${chave}`)); // sem internet: a última lista vista
        l = salva?.pastas instanceof Set ? salva : { em: 0, pastas: new Set(salva?.pastas || []), arquivos: new Map((salva?.arquivos || []).map((a) => [a.nome, a.tamanho])) };
      }
      this.listas.set(chave, l);
    }
    const r = { pastas: new Set(l.pastas), arquivos: new Map(l.arquivos) };
    for (const c of this.criadas) {
      const p = c.split('/');
      if (p.length === partes.length + 1 && c.startsWith(`${chave}/`)) r.pastas.add(p.at(-1));
    }
    for (const f of fila) {
      if (f.partes.slice(0, partes.length).join('/') !== chave || f.partes.length <= partes.length) continue;
      if (f.partes.length === partes.length + 1) r.arquivos.set(f.partes.at(-1), f.tamanho);
      else r.pastas.add(f.partes[partes.length]);
    }
    return r;
  }

  /**
   * Carrega de uma vez as listas de todas as pastas dentro de `partes` (uma ida à nuvem, em partes se for grande), para a
   * conferência dos arquivos do Painel não pedir pasta por pasta. Depois, `lista` de cada pasta sai da memória por VALIDADE_LISTA.
   * Sem internet: não faz nada (as listas guardadas continuam valendo). Devolve quantos arquivos vieram.
   */
  async carregarTudo(partes) {
    const raiz = partes.join('/');
    const arvore = new Map([[raiz, { pastas: new Set(), arquivos: new Map() }]]);
    const pasta = (chave) => { let l = arvore.get(chave); if (!l) { l = { pastas: new Set(), arquivos: new Map() }; arvore.set(chave, l); } return l; };
    let total = 0;
    try {
      let cursor;
      for (let n = 0; n < 1000; n += 1) {
        const r = await (await this.pedir('GET', `lista-tudo/${codificar(partes)}/${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)).json();
        for (const a of r.arquivos) {
          const p = a.caminho.split('/');
          let chave = raiz;
          for (let i = 0; i < p.length - 1; i += 1) { pasta(chave).pastas.add(p[i]); chave = `${chave}/${p[i]}`; }
          pasta(chave).arquivos.set(p.at(-1), a.tamanho);
          total += 1;
        }
        if (!r.mais) break;
        cursor = r.cursor;
      }
    } catch (e) {
      if (passageiro(e)) return 0;
      throw e;
    }
    const em = Date.now();
    for (const [chave, l] of arvore) this.listas.set(chave, { em, pastas: l.pastas, arquivos: l.arquivos });
    this.tudo = { raiz, em };
    return total;
  }

  /** A árvore de ``raiz`` (ou acima dela) veio por inteiro há menos de VALIDADE_LISTA? */
  tudoFresco(chave) {
    return !!this.tudo && Date.now() - this.tudo.em <= VALIDADE_LISTA && (chave === this.tudo.raiz || chave.startsWith(`${this.tudo.raiz}/`));
  }

  /**
   * Telas com muitas listas de anexos (ex.: Imóveis, uma matrícula por imóvel; IPTU's, as guias de cada um): carrega a árvore
   * inteira numa ida (como a conferência do Painel) em vez de duas ou três idas por imóvel. Só se a última tiver passado da validade;
   * várias caixas pedindo ao mesmo tempo esperam o mesmo pedido.
   */
  async carregarSeVelho(partes) {
    if (this.tudoFresco(partes.join('/'))) return 0;
    if (!this.carregandoTudo) this.carregandoTudo = this.carregarTudo(partes).finally(() => { this.carregandoTudo = null; });
    return this.carregandoTudo;
  }

  /** A lista dessas pastas precisa ser buscada de novo (mas fica guardada para quando estiver sem internet). */
  esquecerLista(partes) {
    for (let i = partes.length; i >= 1; i -= 1) { const l = this.listas.get(partes.slice(0, i).join('/')); if (l) l.em = 0; }
    this.tudo = null; // a árvore inteira deixou de valer (algo mudou neste aparelho)
  }

  /** Acrescenta à lista guardada o arquivo que acabou de subir (para aparecer mesmo se a internet cair logo depois). */
  anotarNaLista(partes, tamanho) {
    const chave = partes.slice(0, -1).join('/');
    this.tudo = null; // pasta que ganhou arquivo não pode mais sair "vazia" da árvore antiga
    const l = this.listas.get(chave);
    if (!l) return;
    l.arquivos.set(partes.at(-1), tamanho); l.em = 0;
    this.guardar?.gravar(`lista:${chave}`, { pastas: [...l.pastas], arquivos: [...l.arquivos].map(([nome, t]) => ({ nome, tamanho: t })) }).catch(() => {});
  }

  async ler(partes) {
    const fila = await this.carregarFila();
    const naFila = fila.find((f) => f.partes.join('/') === partes.join('/'));
    if (naFila) return (await this.guardar.ler(`anexo:${naFila.id}`)) || new Blob([]);
    try {
      return await (await this.pedir('GET', codificar(partes))).blob();
    } catch (e) {
      if (passageiro(e)) throw semInternet('abrir o arquivo');
      throw e;
    }
  }

  /** Grava um arquivo; sem internet, guarda no aparelho e sobe depois (`enviarFila`). */
  async gravar(partes, blob) {
    try {
      await this.pedir('PUT', codificar(partes), { corpo: blob });
      this.anotarNaLista(partes, blob.size);
    } catch (e) {
      if (!passageiro(e) || !this.guardar) throw e;
      const fila = await this.carregarFila();
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await this.guardar.gravar(`anexo:${id}`, blob);
      fila.push({ id, partes, tamanho: blob.size, em: new Date().toISOString() });
      await this.gravarFila();
    }
  }

  async apagar(partes, { pasta = false } = {}) {
    const fila = await this.carregarFila();
    const chave = partes.join('/');
    const naFila = fila.filter((f) => f.partes.join('/') === chave || (pasta && f.partes.join('/').startsWith(`${chave}/`)));
    for (const f of naFila) await this.guardar?.apagar?.(`anexo:${f.id}`);
    if (naFila.length) { this.fila = fila.filter((f) => !naFila.includes(f)); await this.gravarFila(); }
    for (const c of [...this.criadas]) if (c === chave || c.startsWith(`${chave}/`)) this.criadas.delete(c);
    try {
      if (pasta) {
        for (let n = 0; n < 1000; n += 1) {
          const r = await (await this.pedir('POST', 'apagar', { corpo: JSON.stringify({ caminho: chave }), cabecalhos: { 'Content-Type': 'application/json' } })).json();
          if (!r.mais) break;
        }
      } else await this.pedir('DELETE', codificar(partes));
    } catch (e) {
      if (passageiro(e)) throw semInternet('apagar');
      if (e.status !== 404) throw e;
    }
    this.esquecerLista(pasta ? partes : partes.slice(0, -1));
  }

  async mover(de, para) {
    try {
      for (let n = 0; n < 1000; n += 1) {
        const r = await (await this.pedir('POST', 'mover', { corpo: JSON.stringify({ de: de.join('/'), para: para.join('/') }), cabecalhos: { 'Content-Type': 'application/json' } })).json();
        if (!r.mais) break;
      }
    } catch (e) {
      if (passageiro(e)) throw semInternet('mover a pasta');
      if (e.status !== 404) throw e; // pasta só criada (vazia) ou só na fila deste aparelho: nada na nuvem para mover
    }
    // a fila deste aparelho acompanha a pasta movida
    const fila = await this.carregarFila();
    const k = de.join('/');
    for (const f of fila) if (f.partes.join('/').startsWith(`${k}/`)) f.partes = [...para, ...f.partes.slice(de.length)];
    if (fila.length) await this.gravarFila();
    for (const c of [...this.criadas]) if (c === k || c.startsWith(`${k}/`)) { this.criadas.delete(c); this.criadas.add(para.join('/') + c.slice(k.length)); }
    this.esquecerLista(de); this.esquecerLista(para);
  }

  /**
   * Sobe os anexos guardados sem internet. Se outro aparelho gravou um arquivo com o mesmo nome no meio tempo,
   * este sobe com "(deste aparelho)" no nome e vira aviso (o lançamento continua apontando para o nome antigo: conferir).
   */
  async enviarFila() {
    if (this.enviando) return this.enviando;
    this.enviando = (async () => {
      const fila = await this.carregarFila();
      for (const f of [...fila]) {
        const blob = await this.guardar.ler(`anexo:${f.id}`);
        let recusado = false;
        try {
          if (blob) await this.pedir('PUT', codificar(f.partes), { corpo: blob, cabecalhos: { 'If-None-Match': '*' } });
        } catch (e) {
          if (passageiro(e)) break;
          if (e.status === 412 && blob) {
            const nome = f.partes.at(-1); const ponto = nome.lastIndexOf('.');
            const outro = ponto > 0 ? `${nome.slice(0, ponto)} (deste aparelho)${nome.slice(ponto)}` : `${nome} (deste aparelho)`;
            await this.pedir('PUT', codificar([...f.partes.slice(0, -1), outro]), { corpo: blob });
            this.avisos.push(`O anexo "${nome}" já existia na nuvem (outro aparelho): o deste aparelho foi guardado como "${outro}". Confira.`);
          } else {
            // recusado de vez (sem permissão, nome barrado…): o arquivo não se perde, fica para baixar em Conflitos
            recusado = true;
            await this.guardarNaoEnviado(f, e.message);
            this.avisos.push(`O anexo "${f.partes.at(-1)}" não pôde ser enviado (${e.message}). Ele ficou guardado neste aparelho: veja em Conflitos da nuvem.`);
          }
        }
        if (!recusado) await this.guardar.apagar?.(`anexo:${f.id}`);
        this.fila = this.fila.filter((x) => x.id !== f.id);
        await this.gravarFila();
        this.esquecerLista(f.partes.slice(0, -1));
      }
    })();
    try { await this.enviando; } finally { this.enviando = null; }
  }

  async pendentes() { return (await this.carregarFila()).length; }

  raiz() { return new PastaNuvem(this, []); }
}

class ArquivoNuvem {
  constructor(cliente, partes, tamanho) { this.cliente = cliente; this.partes = partes; this.kind = 'file'; this.name = partes.at(-1); this.tamanho = tamanho; }
  async getFile() {
    const blob = await this.cliente.ler(this.partes);
    return new File([blob], this.name, { type: blob.type || '' });
  }
  async createWritable() {
    const pedacos = [];
    const cliente = this.cliente; const partes = this.partes;
    return {
      async write(dado) { pedacos.push(dado instanceof Blob || typeof dado === 'string' || dado instanceof ArrayBuffer || ArrayBuffer.isView(dado) ? dado : dado?.data ?? ''); },
      async close() { await cliente.gravar(partes, new Blob(pedacos)); },
      async abort() { pedacos.length = 0; },
    };
  }
  async isSameEntry(outro) { return outro?.kind === 'file' && outro.partes?.join('/') === this.partes.join('/'); }
  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }
}

export class PastaNuvem {
  constructor(cliente, partes) { this.cliente = cliente; this.partes = partes; this.kind = 'directory'; this.name = partes.at(-1) || 'nuvem'; }

  async conteudo() {
    if (!this.partes.length) return { pastas: new Set(RAIZES), arquivos: new Map() };
    return this.cliente.lista(this.partes);
  }

  async getDirectoryHandle(nome, { create = false } = {}) {
    const filho = [...this.partes, nome];
    if (!this.partes.length) {
      if (!RAIZES.includes(nome)) throw naoAchou(nome);
      return new PastaNuvem(this.cliente, filho);
    }
    const c = await this.conteudo();
    if (c.arquivos.has(nome)) throw new DOMException(`"${nome}" é um arquivo.`, 'TypeMismatchError');
    if (!c.pastas.has(nome)) {
      if (!create) throw naoAchou(nome);
      this.cliente.criadas.add(filho.join('/'));
    }
    return new PastaNuvem(this.cliente, filho);
  }

  async getFileHandle(nome, { create = false } = {}) {
    if (!this.partes.length) throw naoAchou(nome); // o banco não é arquivo na nuvem (fica no cofre)
    const c = await this.conteudo();
    if (c.pastas.has(nome)) throw new DOMException(`"${nome}" é uma pasta.`, 'TypeMismatchError');
    if (!c.arquivos.has(nome) && !create) throw naoAchou(nome);
    return new ArquivoNuvem(this.cliente, [...this.partes, nome], c.arquivos.get(nome) ?? 0);
  }

  async* entries() {
    const c = await this.conteudo();
    for (const p of [...c.pastas].sort()) yield [p, new PastaNuvem(this.cliente, [...this.partes, p])];
    for (const [n, t] of [...c.arquivos].sort(([a], [b]) => a.localeCompare(b))) yield [n, new ArquivoNuvem(this.cliente, [...this.partes, n], t)];
  }
  async* keys() { for await (const [n] of this.entries()) yield n; }
  async* values() { for await (const [, h] of this.entries()) yield h; }
  [Symbol.asyncIterator]() { return this.entries(); }

  async removeEntry(nome, { recursive = false } = {}) {
    if (!this.partes.length) throw new DOMException('As pastas principais não podem ser apagadas.', 'InvalidModificationError');
    const c = await this.conteudo();
    if (c.arquivos.has(nome)) return this.cliente.apagar([...this.partes, nome]);
    if (!c.pastas.has(nome)) throw naoAchou(nome);
    if (!recursive) {
      const dentro = await this.cliente.lista([...this.partes, nome]);
      if (dentro.pastas.size || dentro.arquivos.size) throw new DOMException(`A pasta "${nome}" não está vazia.`, 'InvalidModificationError');
    }
    return this.cliente.apagar([...this.partes, nome], { pasta: true });
  }

  async isSameEntry(outro) { return outro?.kind === 'directory' && outro.partes?.join('/') === this.partes.join('/'); }

  /** Caminho de `outro` dentro desta pasta (lista de nomes), ou null se não estiver dentro. */
  async resolve(outro) {
    const a = this.partes; const b = outro?.partes || [];
    if (b.length < a.length || a.some((p, i) => b[i] !== p)) return null;
    return b.slice(a.length);
  }

  /** Move (ou renomeia) esta pasta para dentro de `pai`, com o nome `novo`. */
  async move(pai, novo) {
    if (!this.partes.length) throw new DOMException('A raiz não se move.', 'InvalidModificationError');
    const para = [...pai.partes, novo];
    if (para.join('/') === this.partes.join('/')) return;
    await this.cliente.mover(this.partes, para);
    this.partes = para; this.name = novo;
  }

  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }
}
