// Telas "Dados de uma pessoa" (LGPD, art. 18: ver e exportar tudo de um CPF) e "Pessoas com mais de 10 anos do fim do
// contrato" (decisão do dono, 17/11/2026: só depois de 10 anos do fim do último vínculo, apagar tudo da pessoa de uma vez).
// Só administrador. As regras ficam em pessoa.js; o CPF escolhido fica só na memória da tela (nunca no endereço).
import { alterar, aviso, baixar, E, ir, janela, jsZip, login, mostrar, podeUsuario } from '../app.js';
import * as S from '../armazenamento.js';
import * as C from '../calculos.js';
import { esc, mascarar } from '../formularios.js';
import * as P from '../pessoa.js';
import * as R from '../regras.js';
import { apagarPastaDaFicha, botao, d, link, nomePastaContrato, nomePastaFicha, pastaPaiContrato } from './comum.js';

let cpfEscolhido = '';
const SO_ADMIN = '<h1>Acesso só para administradores</h1>';
const topo = (titulo) => `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>${titulo}</h1>`;
const doc = (v) => mascarar('cpfcnpj', v);
const rotulo = (t) => R.TABELAS[t] || t;
const campoEmPalavras = (campo) => campo.replace(/\.\d+\./g, ' → ').replace(/_/g, ' ');

/** Contagem por tabela: "Boleto: 24 · NF: 24". */
const porTabela = (lista) => {
  const n = new Map();
  for (const x of lista) n.set(x.tabela, (n.get(x.tabela) || 0) + 1);
  return [...n].map(([t, q]) => `${rotulo(t)}: ${q}`).join(' · ');
};

/** O que sai ao apagar a pessoa, em lista (para a tela e para a janela de confirmação). */
function listaDoQueSai(x) {
  const p = x.partes;
  const itens = [];
  const saem = [...p.proprios, ...p.ligados];
  if (saem.length) itens.push(`<b>${saem.length} registro(s)</b> saem inteiros: ${esc(porTabela(saem))}`);
  if (p.outros.length) itens.push(`<b>${p.outros.length} registro(s) de outras pessoas</b> ficam, mas sem os dados dela (${esc([...new Set(p.outros.map((o) => `${rotulo(o.tabela)} nº ${o.id}: ${campoEmPalavras(o.campo)}`))].join('; '))})`);
  if (p.destinos.length) itens.push(`<b>a resposta dela em ${p.destinos.length} comunicado(s)</b> (contatos, IP, aparelho e assinatura do aceite; o comunicado fica para os outros)`);
  if (p.contratos.length || p.fichas.length) itens.push(`<b>as pastas de arquivos</b> ${p.contratos.length ? `do(s) ${p.contratos.length} contrato(s)` : ''}${p.contratos.length && p.fichas.length ? ' e ' : ''}${p.fichas.length ? `da(s) ${p.fichas.length} ficha(s)` : ''}, com tudo dentro (${x.anexos.length} arquivo(s) ligados a lançamentos e o que mais estiver lá)`);
  itens.push(`<b>${x.historico.length} linha(s) do Histórico</b> desses registros${E.nuvem ? ', também no servidor da nuvem (os outros aparelhos baixam os dados de novo sozinhos)' : ''}`);
  return `<ul>${itens.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}

/** Dados de uma pessoa: procurar pelo CPF/CNPJ, ver onde aparece, baixar tudo (ZIP) e, depois de 10 anos, apagar tudo. */
export function telaPessoa() {
  if (!podeUsuario('admin')) return SO_ADMIN;
  const form = `<form class="cartao acoes" data-form="buscarPessoa"><label style="margin:0">CPF ou CNPJ</label><input name="cpf" inputmode="numeric" autocomplete="off" value="${esc(cpfEscolhido ? doc(cpfEscolhido) : '')}" style="width:200px" required><button class="secundario">Procurar</button></form>`;
  const explica = `<div class="cartao"><p>Pelo CPF (ou CNPJ), o sistema mostra onde a pessoa aparece: contratos, fichas, fiança, boletos, NFs, e-mails, o Histórico e os arquivos. <b>Baixar</b> junta tudo num arquivo ZIP (direito de acesso da LGPD, art. 18).</p>
    <p class="suave">Apagar tudo só ${P.ANOS_GUARDA} anos depois do fim do último contrato (ou da ficha sem contrato): antes disso a lei manda guardar. Lista de quem já pode: ${link('#/pessoas-antigas', 'Pessoas com mais de 10 anos do fim do contrato', '')}.</p></div>`;
  if (!cpfEscolhido) return `${topo('Dados de uma pessoa')}${explica}${form}`;
  const x = P.dadosDaPessoa(d(), cpfEscolhido);
  if (!x.achados.length) return `${topo('Dados de uma pessoa')}${explica}${form}<div class="alerta aviso">O ${esc(doc(cpfEscolhido))} não aparece em nenhum cadastro.</div>`;
  const s = P.situacaoParaApagar(d(), cpfEscolhido);
  const onde = x.achados.map((a) => { const r = R.buscar(d(), a.tabela, a.id); return `<li>${esc(rotulo(a.tabela))} nº ${a.id}${r && (r.inquilino_nome || r.nome) ? ` (${esc(r.inquilino_nome || r.nome)})` : ''}: ${esc(campoEmPalavras(a.campo))}</li>`; }).join('');
  const regs = Object.entries(x.registros).map(([t, l]) => `${rotulo(t)}: ${l.length}`).join(' · ');
  const anexos = x.anexos.length ? `<ul>${x.anexos.slice(0, 30).map((a) => `<li>${esc(a.nome)}</li>`).join('')}${x.anexos.length > 30 ? `<li class="suave">e mais ${x.anexos.length - 30}</li>` : ''}</ul>` : '<p class="suave">Nenhum arquivo ligado a lançamentos.</p>';
  const vinc = s.vinculos.length ? `<ul>${s.vinculos.map((v) => `<li>${esc(v.texto)}: ${v.fim ? `terminou em ${C.dataBr(v.fim)}` : '<b>ainda vale (sem data de fim)</b>'}</li>`).join('')}</ul>` : '';
  const apagar = s.pode
    ? `<div class="alerta perigo"><p><b>Já passaram ${P.ANOS_GUARDA} anos do fim do último vínculo</b> (pode desde ${C.dataBr(s.libera_em)}). Ao apagar, some de vez, sem volta:</p>${listaDoQueSai(x)}
        <p>Fica só uma linha no Histórico dizendo que os dados de uma pessoa foram apagados, sem o nome nem o CPF.</p>
        <p>${botao('apagarPessoa', 'Apagar tudo desta pessoa', {}, 'perigo')}</p></div>`
    : `<div class="alerta aviso"><p><b>Ainda não pode apagar.</b> ${esc(s.motivo)}</p>${s.libera_em ? `<p>O botão aparece a partir de <b>${C.dataBr(s.libera_em)}</b>.</p>` : ''}
        <p class="suave">Por quê: contratos, recibos, NFs e comprovantes servem de prova numa cobrança ou numa fiscalização; o prazo geral da lei é de ${P.ANOS_GUARDA} anos (Código Civil, art. 205; LGPD, art. 16).</p></div>`;
  return `${topo('Dados de uma pessoa')}${form}
    <div class="cartao"><h2>${esc(x.nome || 'Pessoa sem nome')} · ${esc(doc(cpfEscolhido))}</h2>
      <p><b>Onde aparece</b></p><ul>${onde}</ul>
      <p><b>Registros ligados</b>: ${esc(regs)}<br><b>Linhas do Histórico</b>: ${x.historico.length}</p>
      <p><b>Arquivos</b> (${x.anexos.length})</p>${anexos}
      <p>${botao('baixarDadosPessoa', 'Baixar os dados desta pessoa (ZIP)', {}, 'secundario')}</p></div>
    <div class="cartao"><h2>Apagar tudo desta pessoa</h2>${vinc}${apagar}</div>`;
}

/** Pessoas que já passaram dos 10 anos do fim do último vínculo (nada é apagado sozinho: o administrador escolhe). */
export function telaPessoasAntigas() {
  if (!podeUsuario('admin')) return SO_ADMIN;
  const lista = P.pessoasParaApagar(d());
  const linhas = lista.map((x) => `<tr><td>${esc(x.nome || '(sem nome)')}</td><td class="nw">${esc(doc(x.cpf))}</td><td>${x.vinculos.map((v) => `${esc(v.texto)} (até ${C.dataBr(v.fim)})`).join('<br>')}</td>
    <td class="nw">${C.dataBr(x.libera_em)}</td><td>${botao('escolherPessoa', 'Ver e apagar', { cpf: x.cpf }, 'secundario pequeno')}</td></tr>`).join('');
  return `${topo('Pessoas com mais de 10 anos do fim do contrato')}
    <div class="cartao"><p>Pessoas cujo último contrato (como inquilino, solidário ou fiador) ou ficha sem contrato terminou há mais de ${P.ANOS_GUARDA} anos. Ex.: contrato terminou em 31/03/2026 → aparece aqui a partir de 31/03/2036.</p>
      <p class="suave">Nada é apagado sozinho: em cada uma, "Ver e apagar" mostra tudo o que sai e pede para digitar APAGAR. Quem ainda tem contrato valendo, ou é usuário ou representante de empresa do cadastro, não aparece. Pessoas sem CPF no cadastro também não.</p>
      ${linhas ? `<div class="rolagem"><table><tr><th>Pessoa</th><th>CPF/CNPJ</th><th>Vínculos</th><th>Pode desde</th><th></th></tr>${linhas}</table></div>` : '<p>Ninguém por enquanto. ✓</p>'}</div>`;
}

export const FORMULARIOS_PESSOA = {
  buscarPessoa(form) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador vê os dados de uma pessoa.');
    const cpf = String(new FormData(form).get('cpf') || '');
    if (!P.documentoValido(cpf)) throw new C.ErroUsuario('Digite o CPF (11 números) ou o CNPJ (14 números).');
    cpfEscolhido = cpf.replace(/\D/g, '');
    return mostrar();
  },
};

export const ACOES_PESSOA = {
  escolherPessoa({ cpf }) {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador vê os dados de uma pessoa.');
    cpfEscolhido = String(cpf || '').replace(/\D/g, '');
    ir('#/pessoa');
  },

  /** ZIP com os registros (dados.json), o Histórico (historico.json), a lista dos arquivos (arquivos.txt) e um LEIA-ME. */
  async baixarDadosPessoa() {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador baixa os dados de uma pessoa.');
    const x = P.dadosDaPessoa(d(), cpfEscolhido);
    if (!x.achados.length) throw new C.ErroUsuario('Este CPF/CNPJ não aparece em nenhum cadastro.');
    const JSZip = await jsZip();
    const zip = new JSZip();
    const semSegredos = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !/^(senha_|sessoes$|links_ficha$)/.test(k)));
    const registros = Object.fromEntries(Object.entries(x.registros).map(([t, l]) => [rotulo(t), l.map(semSegredos)]));
    zip.file('dados.json', JSON.stringify({ pessoa: x.nome, documento: doc(cpfEscolhido), gerado_em: new Date().toISOString(), gerado_por: login(), onde_aparece: x.achados, registros }, null, 1));
    zip.file('historico.json', JSON.stringify(x.historico, null, 1));
    zip.file('arquivos.txt', x.anexos.length ? x.anexos.map((a) => `${a.escopo}\t${a.nome}`).join('\r\n') : 'Nenhum arquivo ligado a lançamentos.');
    zip.file('LEIA-ME.txt', `Dados de ${x.nome || 'uma pessoa'} (${doc(cpfEscolhido)}), gerados em ${C.dataHoraBr(new Date().toISOString())} por ${login()}.\r\n\r\n`
      + 'dados.json: os cadastros em que a pessoa aparece e os ligados a eles (contrato, boletos, NFs, garantia, vistorias...).\r\n'
      + 'historico.json: as linhas do Histórico desses cadastros (o que foi mudado, quando e por quem).\r\n'
      + 'arquivos.txt: os arquivos anexados (os arquivos em si ficam no sistema; peça-os se precisar).\r\n\r\n'
      + 'Lei Geral de Proteção de Dados (Lei 13.709/2018), art. 18: direito de acesso aos dados.\r\n');
    const nome = S.limparNome(`dados-${(x.nome || 'pessoa').normalize('NFD').replace(/[̀-ͯ]/g, '')}-${C.hojeIso()}.zip`);
    baixar(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), nome);
  },

  /** Apagar tudo desta pessoa (só depois de 10 anos do fim do último vínculo): dupla confirmação digitando APAGAR. */
  async apagarPessoa() {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador apaga os dados de uma pessoa.');
    const x = P.dadosDaPessoa(d(), cpfEscolhido);
    const s = P.situacaoParaApagar(d(), cpfEscolhido);
    if (!s.pode) throw new C.ErroUsuario(s.motivo || 'Esta pessoa ainda não pode ser apagada.');
    if (E.nuvem && E.nuvem.pendentesQtd()) throw new C.ErroUsuario('Ainda há mudanças deste aparelho esperando para ir à nuvem. Espere enviar (ou conecte à internet) e tente de novo.');
    const resp = await janela({ titulo: 'Apagar tudo desta pessoa?', forte: true, sim: 'Apagar tudo', nao: 'Cancelar',
      html: `<p>Apagar de vez tudo de <b>${esc(x.nome || 'esta pessoa')}</b> (${esc(doc(cpfEscolhido))})? Não tem como desfazer.</p>${listaDoQueSai(x)}
        <p>Digite <b>APAGAR</b> para confirmar: <input name="confirmo" autocomplete="off" required></p>` });
    if (!resp) return;
    if (String((resp.confirmo || [])[0] || '').trim().toUpperCase() !== 'APAGAR') throw new C.ErroUsuario('Digite APAGAR para confirmar. Nada foi apagado.');
    let feito = null;
    await alterar((db) => { feito = P.apagarPessoa(db, cpfEscolhido, login()); });
    // as pastas dos contratos e das fichas dela, com tudo dentro (na nuvem vão para a lixeira e somem em 30 dias)
    const falharam = [];
    for (const c of feito.contratos) {
      try {
        const pai = await S.subpasta(await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS), pastaPaiContrato(c), false);
        await pai.removeEntry(c.pasta || nomePastaContrato(c), { recursive: true });
      } catch (e) { if (e?.name !== 'NotFoundError') falharam.push(c.pasta || nomePastaContrato(c)); }
    }
    for (const f of feito.fichas) { try { await apagarPastaDaFicha(f.pasta || nomePastaFicha(f)); } catch (e) { if (e?.name !== 'NotFoundError') falharam.push(f.pasta || nomePastaFicha(f)); } }
    cpfEscolhido = '';
    // na nuvem: manda já e espera a volta (o servidor apaga o histórico guardado e os aparelhos baixam tudo de novo; o redesenho
    // dessa volta apagaria o aviso abaixo se viesse depois)
    if (E.nuvem) await E.nuvem.sincronizar().catch(() => {});
    aviso(falharam.length ? `Dados apagados, mas ${falharam.length} pasta(s) não saíram agora (${falharam.join('; ')}): apague à mão em Arquivos.` : `Dados apagados: ${feito.saem.length} registro(s), as pastas de arquivos e o Histórico deles.`, falharam.length ? 'aviso' : 'ok');
    ir('#/pessoas-antigas');
  },
};
