// Telas do sistema: a tabela de rotas TELAS (endereço #/... → função que desenha a tela) e as telas de abertura e do painel.
// Cada assunto fica em docs/js/telas/ (mapa em documentacao/ARQUITETURA.md; ache funções com `node tools/mapa.mjs <trecho>`):
//   comum (componentes, pastas e anexos) · campos (preenchimento automático dos formulários) · imovel · contrato · cadastros (CADASTROS)
//   avisos (conferência antes de salvar) · fechamento · cobrancas · faturas · consultas · reajustes · financeiro · documentos · admin
//   envios (FORMULARIOS: envio de cada formulário) · acoes (ACOES: botões data-acao)
import { aviso, E, podeUsuario } from './app.js';
import * as S from './armazenamento.js';
import { PAPEIS, SENHA_MINIMA } from './auth.js';
import * as C from './calculos.js';
import { compBr, dataBr, reais } from './calculos.js';
import * as F from './formularios.js';
import { esc } from './formularios.js';
import * as R from './regras.js';
import { avisoBackupSeguro, telaBackupSeguro, telaDados, telaEmpresas, telaHistorico, telaRestaurarBackup } from './telas/admin.js';
import { telaBanco } from './telas/banco.js';
import { telaFormulario } from './telas/cadastros.js';
import { crescer, ligarCamposAutomaticos, ligarIndiceBancoCentral } from './telas/campos.js';
import { telaCobranca, telaCobrancas } from './telas/cobrancas.js';
import { ACEITA_DOCUMENTOS, acertarNomesUmaVez, apagarDocumentosVencidosDasFichas, alertaAdiado, alertaArquivosFaltando, botao, conferirArquivosUmaVez, buscar, caixaHistorico, classeAlerta, classeEstilo, competenciaPadrao, d, etiqueta, gruposDeAlertas, limparSemImovel, link, naoEncontrado, organizarPastasUmaVez, nomeAlerta, listaArquivos, opera, ordenar, PASTA_SEM_IMOVEL, pastasComArquivos, tabelaHistorico, trazerHerancasPendentes, ultimos } from './telas/comum.js';
import { calendarioDoPainel, SITUACOES_SOLICITACAO, telaBusca, telaInquilinos, telaIptu, telaSolicitacoes } from './telas/consultas.js';
import { telaContrato, valorBonificado } from './telas/contrato.js';
import { guardarCartasAntigas, telaAditivo, telaGerarContrato, telaImprimir, telaModelo, telaModelos, telaModeloVistoria, telaVistoria } from './telas/documentos.js';
import { telaFaturas } from './telas/faturas.js';
import { alertaFichas, telaFicha } from './telas/fichas.js';
import { alertaInformeIr, telaModeloEmail, telaModelosEmail } from './telas/emails.js';
import { cadastrosIncompletos, telaFechamento, telaPendencias } from './telas/fechamento.js';
import { telaContas, telaFinanceiro, telaImpostos, telaInadimplencia, telaLiquido, telaResultados } from './telas/financeiro.js';
import { telaImovel } from './telas/imovel.js';
import { telaBackupsNuvem, telaConflitos } from './telas/nuvem.js';
import { telaReajustes } from './telas/reajustes.js';
import { telaRegras } from './telas/regras-sistema.js';
import { avisoPrimeiraLogo, ligarEditorIcone } from './telas/icone.js';

// --------------------------------------------------------------------------
// Telas de abertura
// --------------------------------------------------------------------------
const LINK_RESTAURAR = '<p class="suave" style="margin-top:10px">Administrador: <a href="#/restaurar-backup">restaurar um backup seguro</a></p>';

export const TELAS = {
  _previaAlerta: (el, cor, enfase) => { el.className = classeEstilo('aviso', { cor, enfase }); },
  _listaArquivos: listaArquivos,
  _naoEncontrado: naoEncontrado,
  restaurarBackup: () => telaRestaurarBackup(),
  'backup-seguro': () => telaBackupSeguro(),
  'backups-nuvem': () => telaBackupsNuvem(),

  _ligarDesconto(raiz) {
    ligarCamposAutomaticos(raiz);
    ligarEditorIcone(raiz);
    ligarIndiceBancoCentral(raiz);
    // campos que aparecem conforme outro campo (garantia, tipo de inquilino, prazo, IPTU à vista)
    const regras = [...raiz.querySelectorAll('[data-mostrar-se]')];
    const valorDe = (form, nome) => {
      const el = form && form.querySelector(`[name="${nome}"]`);
      if (!el) return null;
      return el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value;
    };
    const aplicar = () => regras.forEach((el) => {
      const [campoNome, ...valores] = el.dataset.mostrarSe.split('|');
      const v = valorDe(el.closest('form'), campoNome);
      if (v !== null) el.hidden = !(valores.includes(v) || (valores.includes('*') && v.trim() !== ''));
    });
    const nomes = new Set(regras.map((el) => el.dataset.mostrarSe.split('|')[0]));
    for (const n of nomes) raiz.querySelectorAll(`[name="${n}"]`).forEach((el) => el.addEventListener('change', aplicar));
    aplicar();
    // partes recolhidas (fiador a mais, solidário, carência): o botão expande e recolhe
    for (const b of raiz.querySelectorAll('[data-expandir]')) {
      b.addEventListener('click', () => {
        const abrir = b.dataset.aberto !== '1';
        b.closest('form').querySelectorAll(`[data-grupo="${b.dataset.expandir}"]`).forEach((el) => el.classList.toggle('recolhido', !abrir));
        b.dataset.aberto = abrir ? '1' : '';
        b.textContent = abrir ? 'Recolher' : b.dataset.texto;
        if (abrir) b.closest('form').querySelectorAll(`[data-grupo="${b.dataset.expandir}"] textarea.cresce`).forEach(crescer);
      });
    }
    // rótulos que mudam com outro campo (CPF ou CNPJ, RG ou inscrição estadual, conforme o tipo de inquilino)
    for (const lb of raiz.querySelectorAll('label[data-rotulo-se]')) {
      const [campoNome, valor, alt, normal] = lb.dataset.rotuloSe.split('|');
      const sel = lb.closest('form').querySelector(`[name="${campoNome}"]`);
      if (!sel) continue;
      const trocar = () => { lb.firstChild.textContent = (sel.value === valor ? alt : normal) + (lb.textContent.endsWith(' *') ? ' *' : ''); };
      sel.addEventListener('change', trocar);
    }
    // caixa de texto de uma linha que cresce com o texto digitado
    for (const t of raiz.querySelectorAll('textarea.cresce')) { t.addEventListener('input', () => crescer(t)); crescer(t); }
    const bonif = raiz.querySelector('input[name=bonificacao]');
    if (bonif) {
      const mostrarBonif = () => raiz.querySelectorAll('[data-vinculo="desconto"]').forEach((el) => { el.closest('div').hidden = !bonif.checked; });
      bonif.addEventListener('change', mostrarBonif);
      mostrarBonif();
    }
    // aluguel, aluguel bonificado e bonificação (%): preenchidos dois, o terceiro é calculado (pedido do dono, 2026-11-10).
    // Calcula-se o que foi mexido há mais tempo; sem mexer em nada, o calculado é o bonificado. Ex.: aluguel R$ 2.000,00 e
    // 10% → bonificado R$ 1.800,00; bonificado R$ 1.800,00 e 10% → aluguel R$ 2.000,00; aluguel e bonificado → 10%.
    const pctEl = raiz.querySelector('[data-vinculo="desconto"][data-tipo="pct"]');
    const valEl = raiz.querySelector('[data-vinculo="desconto"][data-tipo="dinheiro"]');
    if (!pctEl || !valEl) return;
    const form = pctEl.closest('form');
    const aluguel = raiz.querySelector('[name=aluguel_inicial]');
    const num = (t) => { try { return t.trim() === '' ? NaN : C.numero(t); } catch { return NaN; } };
    const cent = (t) => { try { return t.trim() === '' ? NaN : C.centavos(t); } catch { return NaN; } };
    // aluguel sobre o qual vale o %: o atual, quando já houve correção (fixo: o aluguel nunca é o calculado); senão, o cheio digitado
    const fixo = () => !!form.dataset.base || !aluguel || aluguel.readOnly;
    const base = () => (form.dataset.base ? Number(form.dataset.base) : aluguel ? cent(aluguel.value) : NaN);
    const avisar = (texto) => {
      valEl.classList.toggle('doc-invalido', !!texto);
      const caixa = valEl.closest('div').querySelector('.erro-bonif') || valEl.closest('div').appendChild(Object.assign(document.createElement('div'), { className: 'erro-campo erro-bonif' }));
      caixa.textContent = texto;
    };
    // nada aqui pode "travar" o formulário: qualquer valor estranho só deixa de calcular e avisa
    const calcularBonificado = () => {
      const b = base(); const p = num(pctEl.value);
      avisar(Number.isFinite(p) && (p < 0 || p > 100) ? 'O % precisa ficar entre 0 e 100' : '');
      if (Number.isFinite(b) && b > 0 && Number.isFinite(p) && p >= 0 && p <= 100) valEl.value = F.dinheiroTexto(b - C.descontoPorPercentual(b, p));
    };
    const calcularPct = () => {
      const b = base(); const v = cent(valEl.value);
      if (!Number.isFinite(b) || !(b > 0) || !Number.isFinite(v)) { avisar(''); return; }
      if (v < 0 || v > b) { avisar(`O aluguel com bonificação precisa ficar entre R$ 0,00 e ${reais(b)} (aluguel cheio)`); return; }
      pctEl.value = F.pctTexto(Math.round(C.percentualPorBonificado(b, v) * 10000) / 10000);
      avisar('');
    };
    const calcularAluguel = () => {
      const v = cent(valEl.value); const p = num(pctEl.value);
      avisar(Number.isFinite(p) && (p < 0 || p >= 100) ? 'O % precisa ficar entre 0 e 100 (menos de 100 para calcular o aluguel)' : '');
      if (Number.isFinite(v) && v > 0 && Number.isFinite(p) && p >= 0 && p < 100) aluguel.value = F.dinheiroTexto(C.cheioPorBonificado(v, p));
    };
    const CALCULO = { valor: calcularBonificado, pct: calcularPct, aluguel: calcularAluguel };
    const EL = { valor: valEl, pct: pctEl, aluguel };
    let ordem = ['aluguel', 'pct', 'valor']; // do mexido por último ao mais antigo
    // digitados pela pessoa (os que vieram preenchidos contam, menos o bonificado, que é calculado)
    const digitados = new Set(['aluguel', 'pct'].filter((k) => EL[k] && EL[k].value.trim() !== ''));
    const mexeu = (campo) => {
      ordem = [campo, ...ordem.filter((x) => x !== campo)];
      if (EL[campo].value.trim() === '') digitados.delete(campo); else digitados.add(campo);
      const outros = ordem.filter((x) => x !== campo);
      const livres = outros.filter((x) => !digitados.has(x));
      // calcula o que a pessoa não digitou; com os três digitados, o aluguel fica e muda o mais antigo entre o % e o bonificado
      const alvo = fixo() ? { pct: 'valor', valor: 'pct', aluguel: 'valor' }[campo]
        : livres.length === 1 ? livres[0] : livres.length === 2 ? { pct: 'valor', valor: 'pct', aluguel: 'valor' }[campo]
          : outros.filter((x) => x !== 'aluguel').pop();
      try { CALCULO[alvo](); } catch { /* digitando */ }
      digitados.delete(alvo);
    };
    pctEl.addEventListener('input', () => mexeu('pct'));
    valEl.addEventListener('input', () => mexeu('valor'));
    if (aluguel && !form.dataset.base) aluguel.addEventListener('input', () => mexeu('aluguel'));
    if (form.dataset.base) {
      const nota = valEl.closest('div').querySelector('.ajuda');
      if (nota) nota.textContent = `O % vale sobre o aluguel atual de ${reais(Number(form.dataset.base))} (já corrigido). Digite o valor que o inquilino paga em dia: o % é calculado.`;
    }
    if (pctEl.value !== '' && valEl.value === '') { try { calcularBonificado(); } catch { /* nada */ } }
  },

  arquivoSumiu: (copias) => `<main><div id="mensagens"></div><div class="cartao login" style="max-width:600px"><h1>Administração de Imóveis</h1>
    <div class="alerta perigo"><b>O arquivo ${esc(S.ARQUIVO_BANCO)} não está na pasta "${esc(E.pasta.name)}"</b>, mas há cópia(s) com outro nome: <b>${copias.map(esc).join('</b>, <b>')}</b>.
      Isso costuma acontecer quando o OneDrive encontra duas versões ao mesmo tempo. Nada foi perdido.</div>
    <p>Abra a pasta no computador, renomeie a cópia mais recente para <b>${esc(S.ARQUIVO_BANCO)}</b> e clique em Tentar de novo. Se houver mais de uma cópia, guarde as outras em outra pasta.</p>
    <p class="acoes">${botao('reabrir', 'Tentar de novo')} ${botao('escolherPasta', 'Escolher outra pasta', {}, 'secundario')}</p>${LINK_RESTAURAR}</div></main>`,

  semSuporte: () => `<main><div class="cartao login"><h1>Administração de Imóveis</h1>
    <div class="alerta aviso">Este navegador não consegue salvar numa pasta do computador. Abra este endereço no <b>Google Chrome</b> ou no <b>Microsoft Edge</b> (no computador, não no celular).</div></div></main>`,

  async inicio() {
    const lembrada = await S.pastaLembrada();
    return `<main><div id="mensagens"></div><div class="cartao login" style="max-width:560px">
      <h1>Administração de Imóveis</h1>
      <p>Os dados ficam numa pasta do seu computador, que pode estar dentro do <b>OneDrive</b> para sincronizar com outros computadores. Nada é guardado na internet.</p>
      ${lembrada ? `<p><button data-acao="reabrir">Abrir a pasta "${esc(lembrada.name)}"</button></p><p class="suave">ou</p>` : ''}
      <p><button class="${lembrada ? 'secundario' : ''}" data-acao="escolherPasta">Escolher a pasta dos dados</button></p>
      <p class="suave">Primeira vez? Crie uma pasta, por exemplo <b>OneDrive\\Imoveis</b>, e escolha ela. Para usar os mesmos dados em outro computador, escolha lá a mesma pasta do OneDrive.</p>
      ${LINK_RESTAURAR}
    </div></main>`;
  },

  primeiroAcesso: () => `<main><div id="mensagens"></div><div class="cartao login">
    <h1>Primeiro acesso</h1>
    <p class="suave">${E.nuvem ? '<b>Dados na nuvem</b>. A nuvem ainda não tem dados:' : `Pasta: <b>${esc(E.pasta.name)}</b>. Esta pasta ainda não tem dados:`} crie o usuário administrador. O nome, o login e a senha são você que escolhe agora (senha com pelo menos ${SENHA_MINIMA} caracteres: uma frase curta serve). Depois o administrador libera os demais em Usuários.</p>
    ${E.nuvem ? `<div class="alerta info"><b>Já usa o sistema?</b> Leve os dados e os anexos da pasta de sempre (OneDrive) para a nuvem. A pasta não é alterada; no fim, tudo é conferido.
      Depois cada um entra com o login e a senha de sempre.
      <p class="acoes" style="margin-top:8px">${botao('levarParaNuvem', 'Levar os dados da pasta para a nuvem', {}, '')}</p><div id="progresso-nuvem"></div></div>
      <p class="suave">Ou, para começar do zero:</p>` : ''}
    ${E.nuvem ? '' : `<div class="alerta info"><b>Já usa o sistema?</b> Usuários e senhas ficam guardados na pasta dos dados, não no programa.
      Se você já tem dados, clique em <b>Escolher outra pasta</b> e escolha a mesma pasta de sempre: aparece o login e você entra com a senha de sempre.
      Para levar tudo para esta pasta nova: crie aqui o administrador e depois use <b>Dados e backup → Importar ZIP</b> com o ZIP baixado no site (os usuários antigos voltam junto).</div>`}
    <form data-form="primeiroAcesso">
      <p><label>Seu nome</label><input name="nome" autofocus></p>
      <p><label>Login</label><input name="login" autocomplete="username"></p>
      <p><label>Senha (mínimo ${SENHA_MINIMA} caracteres)</label><input type="password" name="senha" autocomplete="new-password"></p>
      <p><label>Repita a senha</label><input type="password" name="senha2" autocomplete="new-password"></p>
      <button>Criar e entrar</button> ${E.nuvem ? '' : botao('escolherPasta', 'Escolher outra pasta')}
    </form>${LINK_RESTAURAR}</div></main>`,

  login: () => `<main><div id="mensagens"></div><div class="cartao login">
    <h1>Administração de Imóveis</h1><p class="suave">${E.nuvem ? 'Dados na nuvem' : `Pasta: <b>${esc(E.pasta.name)}</b>`}</p>
    <form data-form="login">
      <p><label>Login</label><input name="login" autofocus autocomplete="username"></p>
      <p><label>Senha</label><input type="password" name="senha" autocomplete="current-password"></p>
      <button>Entrar</button> ${E.nuvem ? '' : botao('escolherPasta', 'Trocar de pasta')}
    </form><p class="suave" style="margin-top:14px">Primeiro acesso? <a href="#/pedir-acesso">Pedir acesso ao administrador</a></p>${LINK_RESTAURAR}</div></main>`,

  pedirAcesso: () => `<main><div id="mensagens"></div><div class="cartao login">
    <h1>Pedir acesso</h1><p class="suave">${E.nuvem ? 'Dados na nuvem' : `Pasta: <b>${esc(E.pasta.name)}</b>`}. O administrador recebe o pedido em Usuários e libera o acesso.</p>
    <form data-form="pedirAcesso">
      <p><label>Seu nome</label><input name="nome" autofocus></p>
      <p><label>Login (sem espaços)</label><input name="login" autocomplete="username"></p>
      <p><label>Senha (mínimo ${SENHA_MINIMA} caracteres)</label><input type="password" name="senha" autocomplete="new-password"></p>
      <p><label>Repita a senha</label><input type="password" name="senha2" autocomplete="new-password"></p>
      <button>Enviar pedido</button> <a class="botao secundario" href="#/">Voltar</a>
    </form></div></main>`,

  // ------------------------------------------------------------------------
  painel(rota) {
    // primeiro as pastas vão para "Imóvel/Inquilinos" com o nome certo; depois a limpeza de "Sem imóvel"
    organizarPastasUmaVez().catch((e) => aviso(`Organização das pastas: ${e.message}`, 'aviso'))
      .then(() => limparSemImovel()).catch((e) => aviso(`Limpeza da pasta "${PASTA_SEM_IMOVEL}": ${e.message}`, 'aviso'))
      // cartas de reajuste marcadas como enviadas antes de o sistema guardar o PDF: vão para a pasta do inquilino
      .then(() => guardarCartasAntigas()).catch((e) => aviso(`Cartas de reajuste na pasta do inquilino: ${e.message}`, 'aviso'))
      // arquivos dos lançamentos: os que estão em outra pasta voltam; os que sumiram viram alerta
      .then(() => conferirArquivosUmaVez()).catch((e) => aviso(`Conferência dos arquivos: ${e.message}`, 'aviso'))
      // fichas reprovadas há 3 meses: os documentos pessoais saem da pasta
      .then(() => apagarDocumentosVencidosDasFichas()).catch((e) => aviso(`Documentos das fichas reprovadas: ${e.message}`, 'aviso'));
    // depois das heranças (que trazem comprovantes do contrato anterior), os nomes dos comprovantes
    trazerHerancasPendentes().catch((e) => aviso(`Contratos herdados: ${e.message}`, 'aviso'))
      .then(() => acertarNomesUmaVez()).catch((e) => aviso(`Nomes dos comprovantes: ${e.message}`, 'aviso'));
    const hoje = C.hojeIso();
    // alertas adiados ("adiar 7 dias" / "já estou cuidando") ficam recolhidos no fim da caixa, com quem marcou
    const todosOsAlertas = R.alertasComAdiamento(d(), hoje);
    const alertas = todosOsAlertas.filter((a) => !a.adiamento);
    const adiados = todosOsAlertas.filter((a) => a.adiamento);
    const adiar = (a) => (opera() ? `<span class="adiar-alerta nw">${botao('adiarAlerta', `Adiar ${R.DIAS_ADIAR_ALERTA} dias`, { chave: a.chave, modo: 'adiado', tipo: a.tipo }, 'secundario mini')} ${botao('adiarAlerta', 'Já estou cuidando', { chave: a.chave, modo: 'cuidando', tipo: a.tipo }, 'secundario mini')}</span>` : '');
    const pend = R.pendentesDeFatura(d());
    const n = (v, t, h) => `<a class="cartao" href="${h}"><div class="grande">${v}</div>${t}</a>`;
    const mesAtual = C.competenciaDe(hoje);
    // tudo o que ficou para trás nos meses anteriores (ex.: NFs de 10/2026 numeradas depois da virada, contas de 09/2026), mais as etapas do mês já liberadas e não feitas
    // os pagamentos sem NF (pend) servem a todos os meses; as etapas do mês atual são calculadas uma vez
    const etapasDoMes = R.etapasFechamento(d(), mesAtual, hoje, { pendentes: pend });
    const faltamEtapas = [...R.etapasAtrasadas(d(), mesAtual, hoje, { pendentes: pend }),
      ...etapasDoMes.filter((e) => !e.feito && !e.prevista).map((e) => ({ ...e, mes: mesAtual }))];
    const previstas = etapasDoMes.filter((e) => e.prevista && e.chave !== 'cartas');
    const incompletos = cadastrosIncompletos();
    // o tipo de alerta com mais avisos ativos (ex.: 4 de "Reajuste do aluguel")
    const porTipo = {};
    for (const a of alertas) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
    const [tipoMais, qtdMais] = Object.entries(porTipo).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    return `${avisoPrimeiraLogo()}<div class="cabecalho"><h1>Painel</h1>${opera() ? `<div class="acoes">${link('#/cobrancas?filtro=abertos', 'Registrar pagamento', 'botao')} ${link('#/cobrancas', 'Acompanhar boletos', 'botao secundario')}</div>` : ''}</div>
      <div class="numeros">
        ${n(d().imoveis.length, 'imóveis', '#/imoveis')}
        ${n(d().contratos.filter((c) => R.contratoAtivo(c, hoje)).length, 'contratos ativos', '#/inquilinos')}
        ${n(pend.length, 'pagamentos aguardando NF', '#/faturas')}
        <a class="cartao" href="#/?ir=alertas" title="Ver os alertas">${qtdMais ? `<div class="grande">${qtdMais}</div>alerta(s) de "${esc(tipoMais)}"<br><span class="suave">o aviso com mais alertas ativos (${alertas.length} no total${adiados.length ? `, ${adiados.length} adiado(s)` : ''})</span>` : `<div class="grande">0</div>alertas ativos${adiados.length ? `<br><span class="suave">${adiados.length} adiado(s)</span>` : ''}`}</a>
        ${(() => { const r = R.resumoSolicitacoes(d()); return `<a class="cartao resumo-painel" href="#/solicitacoes" title="Ver as solicitações dos inquilinos">
          <div class="simbolos">${SITUACOES_SOLICITACAO.map((s) => `<span title="${s.texto}">${s.simbolo} ${r[s.nome]}</span>`).join('')}</div>Solicitações de inquilinos</a>`; })()}
      </div>
      ${incompletos.length ? `<div class="alerta aviso"><b>${incompletos.length} cadastro(s) incompleto(s).</b> ${link('#/pendencias', 'Ver o que falta', 'botao pequeno')}</div>` : ''}
      ${d().contratos.filter((c) => R.dataApagarSemImovel(c)).map((c) => `<div class="alerta aviso"><b>Contrato sem imóvel:</b> <a href="#/contrato/${c.id}">${esc(c.inquilino_nome)}</a> será apagado em <b>${dataBr(R.dataApagarSemImovel(c))}</b> se não for vinculado a um imóvel (use "Editar" no contrato).</div>`).join('')}
      ${alertaArquivosFaltando()}
      ${pastasComArquivos.length ? `<div class="alerta aviso"><b>Pasta "${PASTA_SEM_IMOVEL}"</b> tem pasta(s) com arquivos e sem contrato: ${esc(pastasComArquivos.join(', '))}. Confira e apague à mão se não precisar mais.</div>` : ''}
      <div class="alerta ${faltamEtapas.length ? 'aviso' : 'ok'}"><b>Fechamento de ${compBr(mesAtual)}:</b> ${faltamEtapas.length ? `faltam ${faltamEtapas.length} etapa(s): ${esc(faltamEtapas.map((e) => `${e.titulo.split(/ \(|, a partir/)[0]}${e.mes !== mesAtual ? ` (de ${compBr(e.mes)})` : ''}`).join('; '))}.` : 'as etapas liberadas estão feitas.'}
        ${previstas.length ? `<span class="suave">Próximas: ${esc(previstas.map((e) => `${e.titulo.split(/ \(|, a partir/)[0]} a partir de ${dataBr(e.aPartirDe)}`).join('; '))}.</span>` : ''}
        ${link(`#/fechamento?mes=${faltamEtapas.length && faltamEtapas[0].mes !== mesAtual ? faltamEtapas[0].mes : mesAtual}`, 'Abrir o fechamento do mês', 'botao pequeno')}</div>
      ${podeUsuario('admin') && E.seguro && E.seguro.desconectado ? `<div class="alerta aviso"><b>Backup seguro</b> desconectado neste computador: o navegador pede para liberar a pasta de novo. ${botao('reconectarSeguro', 'Reconectar o backup seguro', {}, 'secundario pequeno')}</div>` : ''}
      ${podeUsuario('admin') && E.seguroErro ? `<div class="alerta erro"><b>Backup seguro:</b> a última cópia falhou (${esc(E.seguroErro)}). ${link('#/backup-seguro', 'Ver o backup seguro')}</div>` : ''}
      ${alertaFichas()}
      ${alertaInformeIr()}
      ${E.nuvem && E.nuvem.conflitos.length ? `<div class="alerta perigo"><b>${E.nuvem.conflitos.length} conflito(s) na nuvem:</b> o mesmo campo foi mudado em dois aparelhos sem internet. Até o administrador escolher, vale o valor de antes.
        ${link('#/conflitos', podeUsuario('admin') ? 'Escolher agora' : 'Ver (o administrador escolhe)', 'botao pequeno')}</div>` : ''}
      ${avisoBackupSeguro()}
      ${calendarioDoPainel(C.competenciaValida(rota.q.mes, C.competenciaDe(hoje)), hoje)}
      <div class="cartao" id="alertas"><div class="cabecalho"><h2>Alertas</h2>${podeUsuario('admin') ? link('#/alertas-config', 'Editar', 'botao secundario pequeno') : ''}</div>
        ${gruposDeAlertas(alertas).map(([tipo, lista]) => `<div class="grupo-alerta"><h3>${esc(tipo)} <span class="suave">(${lista.length})</span></h3>
          ${lista.map((a) => `<div class="${classeAlerta(a)} com-adiar">${nomeAlerta(a)} ${adiar(a)}</div>`).join('')}</div>`).join('') || '<p class="suave">Nenhum alerta no momento.</p>'}
        ${adiados.length ? `<details id="alertas-adiados"><summary class="suave">${adiados.length} alerta(s) adiado(s) ou em cuidado (clique para ver)</summary>
          ${adiados.map((a) => alertaAdiado(a, hoje)).join('')}</details>` : ''}
        <p class="suave" style="margin:10px 0 0">${link('#/pendencias', 'Ver tudo o que está pendente (alertas, fechamento e cadastros) numa lista só', '')}</p>
      </div>
      ${caixaHistorico('Últimas alterações', `${tabelaHistorico(ultimos(() => true, 12))}
        <p class="suave">Banco criado em ${C.dataHoraBr(d().criado_em)}. <a href="#/historico">Ver histórico completo</a></p>`)}`;
  },

  // ------------------------------------------------------------------------
  imoveis() {
    // contas embaixo do endereço, cada uma numa coluna sem título (alinhadas de cima a baixo; a coluna cresce com o número maior)
    // o endereço ocupa as colunas das contas e mais uma de sobra, sem quebrar; sem número, "vazio"
    const CONTAS = [['💧', 'sanepar_matricula'], ['⚡', 'copel_uc'], ['🔥', 'gas_relogio'], ['📶', 'internet'], ['🏢', 'administradora_nome']];
    const celulasContas = (i) => CONTAS.map(([t, k]) => `<td class="conta">${t} ${i[k] ? `<b>${esc(i[k])}</b>` : '<span class="vazio">vazio</span>'}</td>`).join('');
    // matrícula ao lado do nome (número ou vazio); embaixo do nome, os clipes dela (📎1, 📎2…, apagar em "✎ Editar") e o botão "Anexar"
    const numeroMatricula = (i) => `<span class="contas">📄 Matrícula ${i.matricula ? `nº <b>${esc(i.matricula)}</b>` : '<span class="vazio">vazio</span>'}</span>`;
    const anexosMatricula = (i) => `<span class="contas matricula"><span data-arquivos="matricula:${i.id}"></span>
      ${opera() ? `<label class="botao secundario mini enviar" title="Anexar o arquivo da matrícula (pode ser mais de um)">📎 Anexar<input type="file" multiple data-acao-arquivo="enviarArquivos" data-upload="matricula:${i.id}" accept="${ACEITA_DOCUMENTOS}"></label>` : ''}</span>`;
    const hoje = C.hojeIso();
    const linhas = R.imoveisPorEndereco(d().imoveis).map((i) => {
      const atuais = d().contratos.filter((c) => c.imovel_id === i.id && R.contratoAtivo(c, hoje) && !R.herancaAgendada(d(), c, hoje)).sort((a, b) => b.data_entrada.localeCompare(a.data_entrada));
      const aluguel = atuais.length ? atuais.map((c) => `${R.geraNf(c) ? '' : `${etiqueta('boleto de controle', 'controle')}<br>`}<span class="nw">${reais(R.aluguelAtual(d(), c))}</span>${c.bonificacao === false ? '' : ` <span class="suave nw">(${reais(valorBonificado(c))})</span>`}`).join('<br>') : etiqueta('Vago', 'aviso');
      return `<tr class="imovel-l1"><td class="nome"><a href="#/imovel/${i.id}"><b>${esc(i.nome)}</b></a> ${numeroMatricula(i)}</td>
        <td colspan="${CONTAS.length + 1}" class="end-imovel">${esc(R.enderecoCompleto(i))}${i.sublote ? ` <span class="sublote">${esc(/^sublote/i.test(i.sublote) ? i.sublote : `Sublote ${i.sublote}`)}</span>` : ''}</td><td class="n">${aluguel}</td></tr>
        <tr class="imovel-l2"><td class="anexos">${anexosMatricula(i)}</td>${celulasContas(i)}<td class="sobra"></td><td class="n nw valor-imovel" title="Valor do imóvel">${i.valor_imovel ? reais(i.valor_imovel) : '-'}</td></tr>`;
    }).join('');
    return `<div class="cabecalho"><h1>Imóveis</h1><div class="acoes">${link('#/iptu', "IPTU's", 'botao secundario')}${opera() ? link('#/novo/imoveis', 'Novo imóvel', 'botao') : ''}</div></div>
      <div class="cartao"><div class="rolagem"><table class="lista-imoveis"><tr><th>Imóvel</th><th colspan="6">Endereço</th><th class="n">Aluguel (bonif.)<br><span class="suave">Valor do imóvel</span></th></tr>
      ${linhas || '<tr><td colspan="8" class="suave">Nenhum imóvel cadastrado. Clique em "Novo imóvel".</td></tr>'}
      ${linhas ? (() => {
    const t = R.totaisImoveis(d(), hoje);
    return `<tr class="total"><td colspan="7">Total esperado por mês <span class="suave">(inquilinos atuais que emitem NF)</span></td><td class="n"><span class="nw">${reais(t.cheio)}</span> <span class="suave nw">(${reais(t.esperado)})</span></td></tr>
      <tr class="total"><td colspan="7">Total com 100% locado <span class="suave">(alugados + ${t.qtdVagos} vago(s) pelo último aluguel${t.vagosSemValor ? `; ${t.vagosSemValor} vago(s) sem aluguel anterior não entram` : ''})</span></td>
        <td class="n"><span class="nw">${reais(t.cemPorCento)}</span> <span class="suave nw">(+ ${reais(t.vagos)})</span></td></tr>
      <tr class="total"><td colspan="7">Valor total dos imóveis</td><td class="n nw">${reais(d().imoveis.reduce((s, i) => s + (i.valor_imovel || 0), 0))}</td></tr>`;
  })() : ''}</table></div>
      <p class="suave">Valores bonificados (o que o inquilino paga em dia); no total esperado, o valor cheio vem antes e o bonificado entre parênteses. O total com 100% locado soma os aluguéis atuais bonificados e o último aluguel bonificado de cada imóvel vago; entre parênteses, quanto falta para chegar nele. Boletos de controle não entram.</p></div>`;
  },

  imovel(rota) {
    const i = buscar('imoveis', rota.partes[1]);
    if (!i) return naoEncontrado('Imóvel não encontrado', '#/imoveis', 'Ver os imóveis');
    return telaImovel(i);
  },

  contrato(rota) {
    const c = buscar('contratos', rota.partes[1]);
    if (!c) return naoEncontrado('Contrato não encontrado', '#/inquilinos', 'Ver os inquilinos');
    return telaContrato(c);
  },

  novo: (rota, estado) => telaFormulario(rota.partes[1], null, rota.q, estado),
  editar(rota, estado) {
    const r = buscar(rota.partes[1], rota.partes[2]);
    if (!r) return naoEncontrado('Registro não encontrado');
    return telaFormulario(rota.partes[1], r, rota.q, estado);
  },

  // mês e ordem vêm do endereço: só valem no formato esperado (a validação final da ordem é em telaCobrancas)
  cobrancas: (rota) => telaCobrancas(C.competenciaValida(rota.q.comp, competenciaPadrao()), rota.q.ordem, rota.q.filtro, rota.q.busca),
  cobranca(rota) {
    const cb = buscar('cobrancas', rota.partes[1]);
    return cb ? telaCobranca(cb) : naoEncontrado('Boleto não encontrado', '#/cobrancas', 'Ver os boletos');
  },
  faturas: (rota) => telaFaturas(C.competenciaValida(rota.q.mes, C.competenciaDe(C.hojeIso()))),
  financeiro: (rota) => telaFinanceiro(rota.q),
  resultados: (rota) => telaResultados(rota.q),
  liquido: (rota) => telaLiquido(rota.q),
  impostos: (rota) => telaImpostos(C.competenciaValida(rota.q.mes, C.competenciaDe(C.hojeIso()))),
  contas: (rota) => telaContas(rota),
  banco: (rota) => telaBanco(rota),
  inadimplencia: () => telaInadimplencia(),
  reajustes: (rota) => telaReajustes(rota.q),
  imprimir: (rota) => telaImprimir(rota),
  'contrato-gerar': (rota) => telaGerarContrato(rota),
  aditivo: (rota) => telaAditivo(rota),
  'modelos-contrato': () => telaModelos(),
  'modelos-email': () => telaModelosEmail(),
  'modelo-email': (rota) => telaModeloEmail(String(rota.partes[1] || '')),
  vistoria: (rota) => telaVistoria(rota),
  'modelo-vistoria': (rota) => telaModeloVistoria(rota),
  fechamento: (rota) => telaFechamento(C.competenciaValida(rota.q.mes, C.competenciaDe(C.hojeIso()))),
  'alertas-config'() {
    if (!podeUsuario('admin')) return '<div class="alerta erro">Só administradores mudam a aparência dos alertas.</div>';
    const opcoes = (lista, v) => lista.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const linhas = R.TIPOS_ALERTA.map((t) => [t, R.estiloAlerta(d(), t)]).sort((a, b) => a[1].prioridade - b[1].prioridade).map(([t, e], n) => `<tr>
      <td><b>${esc(t)}</b><input type="hidden" name="tipo_${n}" value="${esc(t)}"></td>
      <td><select name="cor_${n}" data-previa="${n}">${opcoes(R.CORES_ALERTA, e.cor)}</select></td>
      <td><select name="enfase_${n}" data-previa="${n}">${opcoes(R.ENFASES_ALERTA, e.enfase)}</select></td>
      <td><input type="number" name="prioridade_${n}" min="1" max="99" value="${e.prioridade}" style="width:70px"></td>
      <td style="min-width:260px"><div class="${classeEstilo('aviso', e)}" id="previa_${n}" style="margin:0"><b>${esc(t)}</b> exemplo de aviso</div></td></tr>`).join('');
    return `<p class="suave"><a href="#/">← Painel</a></p><h1>Aparência dos alertas</h1>
      <p class="suave">Escolha a cor, a ênfase e a prioridade de cada tipo de aviso. Prioridade 1 aparece primeiro; com a mesma prioridade, vem antes o mais grave.
        Cor "Padrão": vermelho quando urgente, laranja quando aviso, azul quando informação.</p>
      <form data-form="estilosAlertas" class="cartao"><div class="rolagem"><table><tr><th>Tipo de aviso</th><th>Cor</th><th>Ênfase</th><th>Prioridade</th><th>Como fica</th></tr>${linhas}</table></div>
        <div class="acoes" style="margin-top:10px"><button>Salvar</button> ${botao('estilosAlertasPadrao', 'Voltar ao padrão do sistema', {}, 'secundario', 'Voltar todos os alertas para a aparência padrão?')} <a class="botao secundario" href="#/">Cancelar</a></div></form>`;
  },

  pendencias: () => telaPendencias(),
  'modelo-contrato': (rota) => telaModelo(rota),
  empresas: () => telaEmpresas(),
  regras: () => telaRegras(),
  inquilinos: (rota) => telaInquilinos(rota.q),
  ficha: (rota) => telaFicha(Number(rota.partes[1])),
  buscar: (rota) => telaBusca(rota.q),
  solicitacoes: (rota) => telaSolicitacoes(rota.q),
  iptu: (rota) => telaIptu(Number(rota.q.ano) || new Date().getFullYear()),
  historico: (rota) => telaHistorico(rota.q),
  dados: () => telaDados(),
  conflitos: () => telaConflitos(),
  usuarios() {
    if (!podeUsuario('admin')) return '<h1>Acesso só para administradores</h1>';
    const pendentes = d().usuarios.filter((u) => u.pendente);
    const papeis = Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${k === 'operador' ? 'selected' : ''}>${v}</option>`).join('');
    return `<div class="cabecalho"><h1>Usuários</h1>${link('#/novo/usuarios', 'Novo usuário', 'botao')}</div>
      ${pendentes.length ? `<div class="cartao destaque"><h2>Pedidos de acesso (${pendentes.length})</h2><table><tr><th>Nome</th><th>Login</th><th>Pedido em</th><th>Liberar como</th><th></th></tr>
        ${pendentes.map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.login)}</td><td>${u.criado_em ? C.dataHoraBr(u.criado_em) : '-'}</td>
          <td><select data-papel-de="${u.id}" style="width:auto">${papeis}</select></td>
          <td class="n nw">${botao('aprovarUsuario', 'Aprovar', { id: u.id }, 'pequeno')} ${botao('recusarUsuario', 'Recusar', { id: u.id }, 'perigo pequeno', `Recusar o pedido de ${u.nome}?`)}</td></tr>`).join('')}</table></div>` : ''}
      <div class="cartao"><table><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Situação</th><th></th></tr>
      ${ordenar(d().usuarios.filter((u) => !u.pendente), 'nome').map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.login)}</td><td>${PAPEIS[u.papel]}</td><td>${u.ativo ? etiqueta('Ativo', 'ok') : etiqueta('Bloqueado', 'perigo')}</td>
        <td class="n nw">${u.id === E.usuario.id ? '<span class="suave">você</span>' : botao('bloquearUsuario', u.ativo ? 'Bloquear' : 'Desbloquear', { id: u.id }, u.ativo ? 'perigo pequeno' : 'pequeno', u.ativo ? `Bloquear o acesso de ${u.nome}?` : '')} ${link(`#/editar/usuarios/${u.id}`, 'Editar')}</td></tr>`).join('')}</table>
      <p class="suave">Quem não tem usuário clica em "Pedir acesso" na tela de login, e o pedido aparece aqui para aprovar. Administrador: tudo, inclusive usuários e importação. Operador: cadastra, altera, confirma pagamentos e numera NFs. Consulta: só vê.</p></div>`;
  },
  'minha-senha': () => `<div class="cartao login"><h1>Trocar minha senha</h1><form data-form="minhaSenha">
    <p><label>Senha atual</label><input type="password" name="atual"></p>
    <p><label>Nova senha</label><input type="password" name="nova"></p>
    <p><label>Repita a nova senha</label><input type="password" name="nova2"></p><button>Salvar</button></form></div>`,
};

export { FORMULARIOS } from './telas/envios.js';
export { ACOES } from './telas/acoes.js';
