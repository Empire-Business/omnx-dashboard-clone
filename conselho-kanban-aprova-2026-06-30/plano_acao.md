# Plano de Ação — Aprovação de Roteiro no Kanban

## Decisão do Presidente

Adicionar aprovação de **roteiro** no Kanban sem criar novas colunas:

- Tag visível no card: **"Roteiro em aprovação"**.
- Dois botões diretos no card: **"Aprovar roteiro"** e **"Pedir revisão"**.
- Ao aprovar: tag vira **"Roteiro aprovado"**, card continua na mesma coluna.
- Ao pedir revisão: tag vira **"Revisão solicitada"** e abre campo de observação obrigatório.
- Sem automação, sem mover colunas automaticamente.
- Métricas por uma semana antes de expandir para edição.

## Modelo de dados

Usar o campo `tags` (string[]) da tabela `notion_creatives` para armazenar os substatus de aprovação:

- `roteiro-em-aprovacao`
- `roteiro-aprovado`
- `revisao-solicitada`

Usar o campo `observations` da tabela para armazenar o motivo da revisão.

## Tarefas

- [ ] Criar constantes e helpers para approval tags em `types/creatives.ts`.
- [ ] Criar `useUpdateCreativeApproval` em `hooks/useCriativos.ts` para atualizar tags + observação.
- [ ] Atualizar `KanbanCard.tsx`:
  - exibir tag de aprovação quando presente;
  - mostrar botões "Aprovar roteiro" e "Pedir revisão" quando tag for `roteiro-em-aprovacao`;
  - mostrar input de observação ao clicar em "Pedir revisão";
  - exibir observação quando tag for `revisao-solicitada`.
- [ ] Atualizar `KanbanBoard.tsx`/`KanbanColumn.tsx` para passar a mutation e invalidar lista.
- [ ] Adicionar teste Playwright para fluxo de aprovação de roteiro.
- [ ] Rodar build, lint e testes.

## Expansão futura

Depois de uma semana de métricas, replicar o mesmo padrão para aprovação de edição (`edicao-em-aprovacao`, `edicao-aprovada`, `revisao-solicitada`).
