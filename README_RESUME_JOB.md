# Consulta e continuidade por Job ID

## Comportamento do frontend

- `datasets_uploaded`: inicia a geração usando o mesmo Job ID.
- `running`: conecta o painel ao Job ID existente e acompanha o status por polling.
- `completed`: dispara automaticamente o download do ZIP; o botão permite baixar novamente.
- `failed`: apresenta uma mensagem clara sobre a limitação atual do backend.

## Limitação importante: retomada exata após falha

O backend atualmente persiste o status do job, mas o `executar_pipeline` executa as células em memória e não persiste/restaura o namespace nem checkpoints de etapa. Por isso, o frontend não pode retomar com segurança exatamente da célula interrompida apenas com o Job ID. A retomada real exige alteração no backend/pipeline para persistir checkpoints e restaurar o contexto necessário; reiniciar o pipeline do zero não é equivalente a continuar de onde parou.

## Arquivos alterados

- `src/App.tsx` — consulta de Job ID, início quando os datasets já estão carregados, acompanhamento de jobs em execução e download automático para jobs concluídos.
- `README.md` — atualizado com o fluxo de consulta/continuidade.
- `README_RESUME_JOB.md` — documentação detalhada da limitação e do próximo passo no backend.
