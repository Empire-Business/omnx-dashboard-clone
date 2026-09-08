# Plano de Rollback

> Como desfazer a correção se algo der errado.

---

## Quando acionar o rollback

- `createdAt` das opps originais foi alterado (data de criação errada)
- Leads sumiram de pipelines inesperadamente
- Duplicatas foram criadas no pipeline errado
- Mais de 10% dos leads com erro no script

---

## O que o rollback precisa fazer

Para cada lead que foi processado:

1. **Mover a opp de volta para Recuperação** (desfazer o PUT)
   - `PUT /opportunities/{opp_id_original}` com `pipelineId: Sn1Guqcm6zwZNTVOOf5L`

2. **Deletar a duplicata criada** (desfazer o POST)
   - `DELETE /opportunities/{nova_opp_id}` ← *requer permissão Delete*

---

## Por isso o backup é obrigatório

O backup da Etapa 0 contém `opp_id_original` e `nova_opp_id` de cada lead processado.
Sem ele, o rollback é manual e muito mais arriscado.

---

## Rollback parcial

Se o script parou no meio (ex: rate limit, erro de rede):

- Checar o arquivo de log gerado pelo script
- Leads com status "sucesso" no log = foram processados (possível rollback)
- Leads sem entrada no log = não foram tocados (não precisa rollback)

---

## Permissão adicional necessária para rollback

| Permissão | Por que |
|-----------|---------|
| **Opportunities - Delete** | Deletar as duplicatas criadas em Recuperação |

> Adicionar essa permissão na API Key antes de rodar, para ter a opção de rollback disponível caso necessite.
