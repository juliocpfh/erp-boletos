// Janela "Anexar o certificado digital" (Sistema → Empresas): acorda o programa deste computador e entrega o .pfx e a senha a ele.
// Tela rara: carregada só no clique (PARTES_ADIADAS, comum.js). A janela é própria, fora de form[data-form], para o arquivo e
// a senha não passarem pelo envio geral dos formulários.
import { alterar, aviso, confirmar, login, mostrar, podeUsuario, voltarFecha } from '../app.js';
import * as C from '../calculos.js';
import * as CP from '../certificado-pc.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';

const DEMORA_AJUDA = 8000; // ms sem resposta até mostrar o que fazer
const INTERVALO = 1000;

const descricao = (c) => `<b>${esc(c.nome)}</b>${c.cnpj ? `, CNPJ ${esc(c.cnpj)}` : ''}${c.validade ? `, válido até ${esc(C.dataBr(c.validade))}` : ''}`;

/** `modo`: 'anexar' ou 'remover' (no remover, assim que o programa responde, já pergunta se pode apagar). */
function abrirJanela(modo = 'anexar') {
  const dlg = document.createElement('dialog');
  dlg.className = 'janela-erro janela-pergunta';
  dlg.innerHTML = `<h3>Certificado digital da empresa</h3>
    <div class="corpo">
      <div class="alerta info" data-estado role="status">Procurando o programa deste computador… Se o navegador perguntar, clique em <b>Abrir</b> e em <b>Permitir</b>.</div>
      <div class="alerta aviso" data-ajuda hidden>O programa ainda não respondeu. Se ele é de antes de 22/11/2026 ou não está instalado,
        <a href="${CP.URL_PROGRAMA}" target="_blank" rel="noopener noreferrer">baixe o programa atualizado</a>, abra com dois cliques, espere terminar e clique no botão de novo.
        Se você bloqueou o acesso a este computador, libere no cadeado ao lado do endereço do site.</div>
      <form>
        <fieldset disabled style="border:0;padding:0;margin:0">
          <label>Arquivo do certificado A1 (.pfx ou .p12)<input name="arquivo" type="file" accept=".pfx,.p12"></label>
          <label>Senha do certificado<input name="senha" type="password" autocomplete="off"></label>
          <p class="suave">O arquivo e a senha vão direto para o programa deste computador e ficam cifrados pelo Windows. Não vão para a nuvem nem para os backups.</p>
          <button>Guardar neste computador</button>
        </fieldset>
      </form>
      <p data-remover-area hidden><button type="button" class="perigo pequeno" data-remover>Remover o certificado deste computador</button></p>
    </div>
    <div class="acoes" style="justify-content:flex-end"><button type="button" class="secundario" data-fechar>Fechar</button></div>`;

  const estado = dlg.querySelector('[data-estado]');
  const ajuda = dlg.querySelector('[data-ajuda]');
  const form = dlg.querySelector('form');
  const campos = form.querySelector('fieldset');
  const senha = form.querySelector('[name="senha"]');
  const dizer = (html, tipo = 'info') => { estado.className = `alerta ${tipo}`; estado.innerHTML = html; };

  let aberta = true;
  const areaRemover = dlg.querySelector('[data-remover-area]');
  const remover = async () => {
    const botaoRemover = areaRemover.querySelector('button');
    if (!(await confirmar('O certificado sai deste computador e os recibos e termos deixam de ser assinados. A assinatura digital também é desligada. Para voltar, anexe o certificado de novo.', { titulo: 'Remover o certificado?', sim: 'Remover', forte: true }))) return;
    botaoRemover.disabled = true;
    campos.disabled = true;
    dizer('Removendo…');
    try {
      await CP.removerCertificado();
      if (R.regra('assinatura_digital')) await ligarAssinatura(false);
      form.hidden = true;
      areaRemover.hidden = true;
      dizer('Certificado removido deste computador. A assinatura digital está desligada.', 'ok');
    } catch (e) { dizer(esc(e.message), 'perigo'); botaoRemover.disabled = false; campos.disabled = false; }
  };
  areaRemover.querySelector('button').addEventListener('click', remover);
  dlg.querySelector('[data-fechar]').addEventListener('click', () => dlg.close());
  // ao fechar, a página se redesenha: a caixa mostra o certificado e a assinatura como ficaram
  dlg.addEventListener('close', () => { aberta = false; form.reset(); dlg.remove(); mostrar(); });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const arquivo = form.querySelector('[name="arquivo"]').files[0];
    const digitada = senha.value;
    campos.disabled = true;
    dizer('Conferindo o certificado…');
    try {
      const c = await CP.entregarCertificado(arquivo, digitada);
      form.reset();
      form.hidden = true;
      const tarefa = c.tarefa ? '<br>Este computador já pode assinar sozinho, a cada minuto.'
        : '<br><b>Atenção:</b> o Windows não deixou criar a tarefa que assina sozinha. Avise o suporte com esta mensagem.';
      const semCnpj = c.cnpj ? '' : '<br><b>Atenção:</b> não achei CNPJ neste certificado. Confira se é o e-CNPJ da empresa (e não o e-CPF de uma pessoa).';
      const ligar = R.regra('assinatura_digital') ? '<br>A assinatura digital já está ligada.'
        : '<br><span data-falta-ligar>Falta ligar a assinatura digital: <button type="button" class="pequeno" data-ligar-assinatura>Ligar a assinatura digital agora</button></span>';
      dizer(`Pronto: certificado de ${descricao(c)} guardado neste computador.${semCnpj}${tarefa}${ligar}`, c.tarefa && c.cnpj ? 'ok' : 'aviso');
      const ligarAgora = estado.querySelector('[data-ligar-assinatura]');
      ligarAgora?.addEventListener('click', async () => {
        ligarAgora.disabled = true;
        try {
          await ligarAssinatura(true);
          estado.querySelector('[data-falta-ligar]').replaceWith('Assinatura digital ligada: os recibos e termos passam a ir por e-mail só depois de assinados.');
        } catch (erro) { aviso(erro.message, 'erro'); ligarAgora.disabled = false; }
      });
    } catch (e) {
      dizer(esc(e.message), 'perigo');
      campos.disabled = false;
      senha.focus();
      senha.select();
    }
  });

  voltarFecha(dlg);
  document.body.appendChild(dlg);
  dlg.showModal();

  (async () => {
    const mostrarAjuda = setTimeout(() => { ajuda.hidden = false; }, DEMORA_AJUDA);
    while (aberta) {
      const p = await CP.programaEsperando();
      if (!aberta) break;
      if (p) {
        ajuda.hidden = true;
        if (!p.ligado) {
          dizer('Este computador ainda não está ligado ao sistema: abra o programa do PC com dois cliques, entre com o e-mail e a senha e clique no botão de novo.', 'perigo');
          break;
        }
        if (modo === 'remover' && !p.atual) { dizer('Este computador não tem certificado anexado. Nada a remover.', 'info'); break; }
        dizer(p.atual ? `Programa encontrado. Hoje está instalado: ${descricao(p.atual)}. Anexar outro troca o atual.` : 'Programa encontrado. Escolha o arquivo e digite a senha.', 'ok');
        campos.disabled = false;
        areaRemover.hidden = !p.atual;
        if (modo === 'remover') remover();
        break;
      }
      await new Promise((ok) => { setTimeout(ok, INTERVALO); });
    }
    clearTimeout(mostrarAjuda);
  })();
}

/** Liga ou desliga a regra `assinatura_digital` (a mesma de antes, só que pela caixa do certificado). */
async function ligarAssinatura(liga) {
  if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador liga e desliga a assinatura digital.');
  await alterar((db) => R.mudarRegraSistema(db, 'assinatura_digital', !!liga, login()));
}

function acordarPrograma(modo) {
  if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador anexa ou remove o certificado da empresa.');
  // o endereço não leva nada: só acorda o programa (o Chrome pergunta "Abrir Administracao de Imoveis?")
  const a = document.createElement('a');
  a.href = `${CP.PROTOCOLO}:abrir`;
  a.click();
  abrirJanela(modo);
}

export const ACOES_CERTIFICADO = {
  async assinaturaDigital({ liga }) {
    await ligarAssinatura(liga === '1');
    aviso(liga === '1' ? 'Assinatura digital ligada: os recibos e termos passam a ir por e-mail só depois de assinados pelo PC.' : 'Assinatura digital desligada: os recibos e termos voltam a sair sem a assinatura da empresa.', 'ok');
    await mostrar();
  },
  anexarCertificado() { acordarPrograma('anexar'); },
  removerCertificado() { acordarPrograma('remover'); },
};
