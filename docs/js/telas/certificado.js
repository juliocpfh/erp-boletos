// Janela "Anexar o certificado digital" (Sistema → Empresas): acorda o programa deste computador e entrega o .pfx e a senha a ele.
// Tela rara: carregada só no clique (PARTES_ADIADAS, comum.js). A janela é própria, fora de form[data-form], para o arquivo e
// a senha não passarem pelo envio geral dos formulários.
import { podeUsuario, voltarFecha } from '../app.js';
import * as C from '../calculos.js';
import * as CP from '../certificado-pc.js';
import { esc } from '../formularios.js';

const DEMORA_AJUDA = 8000; // ms sem resposta até mostrar o que fazer
const INTERVALO = 1000;

const descricao = (c) => `<b>${esc(c.nome)}</b>${c.cnpj ? `, CNPJ ${esc(c.cnpj)}` : ''}${c.validade ? `, válido até ${esc(C.dataBr(c.validade))}` : ''}`;

function abrirJanela() {
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
    </div>
    <div class="acoes" style="justify-content:flex-end"><button type="button" class="secundario" data-fechar>Fechar</button></div>`;

  const estado = dlg.querySelector('[data-estado]');
  const ajuda = dlg.querySelector('[data-ajuda]');
  const form = dlg.querySelector('form');
  const campos = form.querySelector('fieldset');
  const senha = form.querySelector('[name="senha"]');
  const dizer = (html, tipo = 'info') => { estado.className = `alerta ${tipo}`; estado.innerHTML = html; };

  let aberta = true;
  dlg.querySelector('[data-fechar]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { aberta = false; form.reset(); dlg.remove(); });

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
      dizer(`Pronto: certificado de ${descricao(c)} guardado neste computador.${semCnpj}${tarefa}
        <br>Confira se a regra <b>Assinatura digital dos recibos e termos</b> está em Sim (Regras do sistema).`, c.tarefa && c.cnpj ? 'ok' : 'aviso');
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
        dizer(p.atual ? `Programa encontrado. Hoje está instalado: ${descricao(p.atual)}. Anexar outro troca o atual.` : 'Programa encontrado. Escolha o arquivo e digite a senha.', 'ok');
        campos.disabled = false;
        break;
      }
      await new Promise((ok) => { setTimeout(ok, INTERVALO); });
    }
    clearTimeout(mostrarAjuda);
  })();
}

export const ACOES_CERTIFICADO = {
  async anexarCertificado() {
    if (!podeUsuario('admin')) throw new C.ErroUsuario('Só o administrador anexa o certificado da empresa.');
    // o endereço não leva nada: só acorda o programa (o Chrome pergunta "Abrir Administracao de Imoveis?")
    const a = document.createElement('a');
    a.href = `${CP.PROTOCOLO}:abrir`;
    a.click();
    abrirJanela();
  },
};
