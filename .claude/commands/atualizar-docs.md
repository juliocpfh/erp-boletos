---
description: Atualiza a documentação (CLAUDE.md e documentacao/) com as mudanças feitas desde a última atualização
---
Atualize a documentação do projeto para refletir as alterações feitas desde a última versão dos arquivos de documentação
(`CLAUDE.md`, `.claude/` e `documentacao/`). Leia o histórico do git (`git log` e `git diff` desde o último commit que
alterou `documentacao/RESUMO.md`, `documentacao/ARQUITETURA.md`, `documentacao/GUIA_DE_MODIFICACAO.md`, `CLAUDE.md` ou `.claude/`)
e os arquivos que mudaram. Ignore `docs/offline/` (gerado).

Regras:
- Atualize só o que mudou. Não reescreva seções que continuam válidas.
- Em `documentacao/DECISOES.md`, acrescente as decisões novas no fim, no mesmo formato
  (data | decisão | motivo | alternativas descartadas). Não apague as antigas. Não repita decisão que já está lá.
- Se uma alteração parecer uma regra de negócio e o motivo não estiver no código, no histórico nem na conversa,
  marque como NÃO CONFIRMADO. Motivo vindo de pedido do usuário: escreva "Pedido do usuário".
- Mantenha os arquivos dentro do limite de linhas que já têm (só `DECISOES.md` cresce).
- Confira que as funções citadas nos documentos existem no código (`node tools/mapa.mjs <nome>`).
- Não faça commit ainda.

Ao final, liste:
1. Quais arquivos foram alterados e o que mudou em cada um (resumo curto)
2. Itens NÃO CONFIRMADO que precisam da resposta do usuário
3. Documentação que contradizia o código atual (e se foi corrigida)

$ARGUMENTS
