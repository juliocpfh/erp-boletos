// Certificado digital anexado pelo sistema (pedido do dono de 22/11/2026): o botão em Dados e backup chama imoveis-certificado:,
// que roda o programa escondido com --certificado-sistema; ele escuta alguns minutos só em 127.0.0.1 e o site, aberto neste
// computador, entrega o .pfx e a senha direto a ele. Nada passa pela nuvem, pelo banco nem pelos backups.
// Segurança: só aceita o Host daqui e a origem exata do site em que o computador está ligado (um outro site pode até acordar o
// programa, mas não lê nem grava nada), só JSON pequeno, poucas tentativas, e fecha depois de instalar ou de ficar parado.
import http from 'node:http';
import { guardarCertificado, MAX_PFX, resumoDoCertificado } from './certificado.mjs';
import { SITE_PADRAO } from './ligar.mjs';

/** A mesma de docs/js/certificado-pc.js (tests/certificado-local.test.mjs confere). */
export const PORTA = 47631;
export const IDENTIDADE = 'imoveis-certificado';
export const TEMPO_PARADO = 10 * 60 * 1000;
export const MAX_TENTATIVAS = 10;

/**
 * Espera o site entregar o certificado. Devolve { situacao: 'instalado' | 'ocupado' | 'tempo' | 'tentativas' }.
 * `ligacao`: o lerLigacao ou null;
 * `relerLigacao`: lido de novo enquanto não estiver ligado (a pessoa liga o computador e clica de novo); `aoInstalar`: cria a tarefa da assinatura e devolve se conseguiu.
 */
export function receberDoSistema({ env = process.env, ligacao = null, relerLigacao = () => null, guardar = guardarCertificado, resumo = resumoDoCertificado,
  aoInstalar = () => true, porta = PORTA, parado = TEMPO_PARADO, aoAbrir = () => {} } = {}) {
  let lig = ligacao;
  const origemDoSite = () => {
    try { return new URL(lig?.site || SITE_PADRAO).origin; } catch { return new URL(SITE_PADRAO).origin; }
  };
  return new Promise((resolver, recusar) => {
    let aqui = '';
    let tentativas = 0;
    let acabou = false;
    let relogio = null;
    const fechar = (situacao) => {
      clearTimeout(relogio);
      servidor.close();
      servidor.closeAllConnections();
      resolver({ situacao });
    };
    const adiar = () => { clearTimeout(relogio); relogio = setTimeout(() => fechar('tempo'), parado); };

    const servidor = http.createServer(async (req, res) => {
      const responder = (status, dados, depois) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close' });
        res.end(JSON.stringify(dados), depois);
      };
      if (req.headers.host !== aqui) return responder(403, { erro: 'Recusado.' });
      if (!lig) { try { lig = relerLigacao(); } catch { /* ainda não ligado */ } }
      const origem = origemDoSite();
      if (req.headers.origin !== origem) return responder(403, { erro: 'Recusado.' });
      res.setHeader('Access-Control-Allow-Origin', origem);
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true' });
        return res.end();
      }
      if (acabou) return responder(409, { erro: 'O programa já terminou. Clique no botão de novo.' });
      if (req.method === 'GET' && req.url === '/estado') {
        adiar();
        let atual = null;
        try { atual = resumo(env); } catch { /* arquivo estragado: instalar de novo conserta */ }
        return responder(200, { programa: IDENTIDADE, ligado: !!lig, atual });
      }
      if (req.method !== 'POST' || req.url !== '/instalar' || !/^application\/json\b/.test(req.headers['content-type'] || '')) return responder(404, { erro: 'Não encontrado.' });
      if (!lig) return responder(409, { erro: 'Este computador ainda não está ligado ao sistema: abra o programa do PC com dois cliques e entre com o e-mail e a senha.' });
      let pedido;
      try {
        const partes = [];
        let tam = 0;
        for await (const p of req) {
          tam += p.length;
          if (tam > MAX_PFX * 2) throw new Error('grande');
          partes.push(p);
        }
        pedido = JSON.parse(Buffer.concat(partes).toString('utf8'));
        if (typeof pedido?.pfx !== 'string' || typeof pedido?.senha !== 'string') throw new Error('formato');
      } catch { return responder(400, { erro: 'Arquivo grande demais ou pedido inválido.' }); }
      // dois pedidos ao mesmo tempo: o primeiro que terminou vale
      if (acabou) return responder(409, { erro: 'O programa já terminou. Clique no botão de novo.' });
      adiar();
      tentativas += 1;
      let dados;
      try {
        dados = guardar({ pfx: pedido.pfx, senha: pedido.senha }, env);
      } catch (e) {
        acabou = tentativas >= MAX_TENTATIVAS;
        return responder(400, { erro: e.message, acabou }, acabou ? () => fechar('tentativas') : undefined);
      }
      acabou = true;
      let tarefa = false;
      try { tarefa = !!aoInstalar(); } catch { /* o site avisa que a tarefa não ficou criada */ }
      return responder(200, { ...dados, tarefa }, () => fechar('instalado'));
    });

    servidor.on('error', (e) => {
      clearTimeout(relogio);
      // segundo clique no botão: o que já está esperando atende
      if (e.code === 'EADDRINUSE') resolver({ situacao: 'ocupado' }); else recusar(e);
    });
    servidor.listen(porta, '127.0.0.1', () => {
      const real = servidor.address().port;
      aqui = `127.0.0.1:${real}`;
      adiar();
      aoAbrir(real);
    });
  });
}
