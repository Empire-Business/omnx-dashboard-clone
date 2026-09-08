# Diagnóstico — Classificação de mensagens IA vs humano

> Data: 2026-07-09 BRT
> Projeto: Dash novo EmpireBusiness (OpenClaw) — Supabase `qzesffnkqgelmtfblzkr`
> Objetivo: decidir como identificar, direto da mensagem, quem foi atendido pela SDR IA.

---

## Conclusão executiva

- **A tag `[CP] SDR IA` está defasada.** Apenas **91 contatos** têm a tag; a IA atendeu **4.401 contatos distintos** nos últimos 90 dias.
- **A view `comunicacoes_com_remetente` já classifica corretamente a grande maioria das mensagens da IA.** O campo `autor='automacao'` cobre **35.820 mensagens outbound** (90 dias), vindas de `ghl_source='workflow'` e `'api'`.
- **O problema conhecido (`ghl_source='app'` = humano) não é crítico na prática:** os outbound `app` com volume são de usuários GHL reais (SDRs, closers, gestores). Apenas **91 contatos** receberam outbound `app` sem `usuario_ghl_id` nos últimos 90 dias — possíveis falsos-negativos, mas volume irrelevante.
- **Decisão:** usar `autor='automacao'` da view como critério de "mensagem da IA". Não criar configuração de `userIds IA/bot` nesta primeira rodada. Documentar a limitação.

---

## Dados

### 1. Distribuição de `direction` × `ghl_source` (últimos 90 dias)

| direction | ghl_source   | total |
|-----------|--------------|-------|
| inbound   | api          | 4.664 |
| inbound   | workflow     | 1     |
| inbound   | NULL         | 7.264 |
| outbound  | api          | 17.772 |
| outbound  | app          | 33.491 |
| outbound  | bulk_actions | 1     |
| outbound  | workflow     | 18.048 |
| NULL      | app          | 201   |
| NULL      | workflow     | 70    |

### 2. Outbound `ghl_source='app'` por usuário (top 10)

| usuário GHL | nome | papéis | msgs app (90d) | falhas |
|-------------|------|--------|----------------|--------|
| fmNfovWHhnE4I9VttMkw | Lucas Leonardo | [sdr] | 15.472 | 625 |
| CDBtW74CBeRUnTxV7lwh | Caroline Alves | [sdr] | 10.366 | 332 |
| 5lGQtGCMNJOpiEgVKTHR | Bruno Andrease | [sdr closer gestor] | 3.203 | 109 |
| QSj8OZzn4AhSk3DZmrW3 | Larissa Theophilo | [closer] | 1.416 | 53 |
| UCIxJ2kOp9SJKc00RviU | Fernanda Torres | [sdr] | 1.275 | 27 |
| Af6vCPLVP556lwzmPsk7 | Gabrielle Oliveira | [] | 698 | 11 |
| EHQ03sjHsJdl788zcK04 | Danusa de Paula Silva | [] | 287 | 46 |
| (NULL) | (NULL) | (NULL) | 277 | 0 |
| ZqUaWP5V2UV6frVkdIyw | André Eduardo Braz | [] | 201 | 0 |
| jchGm76ArLYrmtYcYE8v | Felipe Mazzola | [social_seller] | 84 | 10 |

> Os usuários com volume de `app` são humanos identificados. Não há userId de bot/IA com volume relevante.

### 3. Autor outbound segundo a view (últimos 90 dias)

| autor | total outbound |
|-------|----------------|
| automacao | 35.820 |
| sdr | 30.317 |
| closer | 1.416 |
| time | 277 |
| gestor | 97 |
| social_seller | 84 |
| (nomes individuais) | ~1.302 |

### 4. Tag SDR IA vs mensagem da IA

| Métrica | Valor |
|---------|-------|
| Contatos com tag `[CP] SDR IA` | 91 |
| Contatos com tag mas SEM msg `autor='automacao'` | 1 |
| Contatos SEM tag mas COM msg `autor='automacao'` (histórico) | 5.726 |
| Contatos atendidos pela IA nos últimos 90 dias (`autor='automacao'`) | 4.401 |
| Contatos com outbound `app` sem `usuario_ghl_id` (90d) | 91 |

---

## Decisão

Adotar a classificação da view `comunicacoes_com_remetente`:

```sql
autor = 'automacao'
```

como critério de "mensagem enviada pela IA".

### Por quê

1. **Cobertura:** 35.820 mensagens / 4.401 contatos nos últimos 90 dias — 99%+ do universo.
2. **Simplicidade:** não exige migration nem configuração extra.
3. **Os outbound `app` são humanos:** os top remetentes `app` têm papéis de SDR/closer/gestor em `ghl_users`.
4. **Tag está defasada:** cobre menos de 2% do universo real de atendimento IA.

### Limitação documentada

Mensagens de IA enviadas via API do WhatsApp podem vir com `ghl_source='app'` e, se tiverem `usuario_ghl_id`, serão classificadas como humano. O diagnóstico mostra que isso afeta volume pequeno (91 contatos sem userId; volume com userId desconhecido). Se futuramente a IA passar a usar essa rota em escala, reavaliar e adicionar config de `userIds IA/bot`.

---

## Próximos passos

1. Refatorar `useAuditoriaIA.ts` para definir o universo pelo `autor='automacao'` em vez da tag.
2. Tornar tag/pipeline/UTM filtros opcionais; remover default `[CP] SDR IA`.
3. Paginar todas as queries de `comunicacoes` para evitar truncamento em 1000.
4. Atualizar `docs/ABA-AUDITORIA-IA.md` com a nova regra.
5. Testar comparando contagem do painel com a query de validação.
