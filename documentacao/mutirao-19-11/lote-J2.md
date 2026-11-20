# Lote J2: Regras de negócio (regras.js) (2/2)

5 itens (0 graves, 0 médios, 5 leves). Arquivos: `regras.js`.
Como trabalhar: ver `../MUTIRAO_19_11.md`. Marque `[x]` ao corrigir. G = grave, M = médio, L = leve.

- [ ] **financeiro-banco-023** [L] Com mais de um inquilino a conferir, o botão "Abrir" da etapa leva à lista geral de Inquilinos
  - Vê-se: A etapa diz "a conferir: Maria, Pedro". Com um só, o botão abre direto os ressarcimentos dele; com dois ou mais, abre #/inquilinos (todos os inquilinos, sem filtro), e é preciso procurar cada nome e descer até os ressarcimentos.
  - Causa: `docs/js/regras.js:6450 (link '#/inquilinos' quando há mais de um)`
  - Fazer: Mandar na etapa a lista dos contratos e desenhar um botão por inquilino (#/contrato/<id>?ir=ressarcimentos), como em telas/fechamento.js:25 para as contas.
- [ ] **comunicacoes-033** [L] A Busca não acha interessados de fichas em análise
  - Vê-se: A busca geral procura imóveis, inquilinos (contratos), fiadores, NFs e boletos. O interessado de uma ficha em análise (nome, CPF, telefone) não aparece: "Nada encontrado", embora a ficha exista em Inquilinos.
  - Causa: `docs/js/regras.js:7477-7529 (buscarGlobal não lê d.fichas); filtros em docs/js/telas/consultas.js:12-18`
  - Fazer: Acrescentar em buscarGlobal um grupo "Fichas em análise" (nome, CPF, telefone, e-mail do interessado) com link para a página da ficha, e o filtro correspondente na tela da busca.
  - Atenção (conferente): Li a função da busca do começo ao fim: ela procura em imóveis, contratos (inquilino, fiador, solidário, representante), NFs e boletos. Não olha as fichas em análise; quem só tem solicitação de reserva (ex.: "Carlos Teste") dá "Nada encontrado". A busca foi feita em 07/11 e as fichas chegaram em 09/11: ficou de fora po…
- [ ] **admin-013** [L] "Salvar versão", "Baixar cópia das regras" e "Voltar tudo ao padrão" não incluem as regras especiais, e a tela não avisa
  - Vê-se: A caixa diz "Salve uma versão antes de mudar: se algo der errado, volte a ela" e "O arquivo das regras guarda todas as regras em uso". Mas a versão e o arquivo só guardam as regras do sistema: as regras especiais (ex.: "Regra especial A", com o proporcional p…
  - Causa: `docs/js/regras.js:7933-7948 (versão e volta ao padrão) e docs/js/config-regras.js:425 (arquivoDasRegras); texto em docs/js/telas/regras-sistema.js:160`
  - Fazer: Ou guardar também as regras especiais na versão e no arquivo, ou dizer na caixa que valem só para as regras do sistema (as especiais não mudam).
  - Atenção (conferente): A versão salva e o arquivo das regras guardam só regrasDe(d) (regras do sistema); "Voltar ao padrão" grava só as do sistema. As regras especiais (perfis_regras) não entram, e o texto da caixa diz "todas as regras em uso" sem avisar. Não achei decisão do dono dizendo que é para ficar de fora.
- [ ] **admin-019** [L] Desfazer no Histórico a troca da regra especial de um contrato não vale para a multa dos boletos até recarregar a página
  - Vê-se: Com os dados numa pasta do computador (não na nuvem): o contrato passou a seguir a "Regra especial A" (multa só sobre o aluguel) e o administrador desfaz essa alteração no Histórico. O cadastro volta a "Regras do sistema", mas a base da multa e dos juros dos …
  - Causa: `docs/js/regras.js:625 (grava direto) x docs/js/regras.js:489 e docs/js/config-regras.js:385-397; docs/js/calculos.js:407`
  - Fazer: No Desfazer, depois de voltar perfil_regras_id de um contrato, chamar CR.lembrarContrato(r) (ou CR.usarRegras(d) no fim).
- [ ] **admin-023** [L] O prazo do alerta "Notificação ao inquilino" aparece como "dias antes", mas a regra é em dias úteis
  - Vê-se: Na coluna "Aparece", a linha "Notificação ao inquilino" mostra o campo seguido de "dias antes". A regra que esse campo grava é "lembrete quantos dias úteis antes do fim do prazo": 3 ali são 3 dias úteis (uma sexta-feira conta até a quarta seguinte), não 3 dia…
  - Causa: `docs/js/regras.js:4949-4953 (antecedenciaAlerta) e docs/js/telas.js:417`
  - Fazer: Em antecedenciaAlerta, unidade "dias úteis" quando o rótulo da regra disser "dias úteis".
