# Criativos — mapa de status Notion → plataforma (Q2) e decisões em aberto

| Campo | Valor |
|---|---|
| Status | **PROPOSTA — aguardando decisão do dono. Nada aplicado em código ou banco.** |
| Atualizado em | 2026-09-01 BRT |
| Origem | [`docs/reunioes/REUNIAO-CRIATIVOS-2026-08-28.md`](reunioes/REUNIAO-CRIATIVOS-2026-08-28.md), questões Q1 a Q4 |
| Depende de | Q1 (manter ou abandonar o Notion para a Empire) |

---

## 1. Por que este documento existe

A ata classificou a Q2 como **o nó central** de várias dúvidas da reunião. O
sintoma que o time viu na tela foi o funil do Dashboard somando 13 criativos
enquanto o resto da página falava em 976 e 1000.

A causa é simples de enunciar: a view `v_creative_status_counts` agrupa pelo
**texto cru** da coluna `notion_creatives.status`, e o sync do Notion grava esse
texto **literalmente** (`supabase/functions/notion-creatives-sync/index.ts:244`,
`extractStatus(props, "Status")`). Então convivem no mesmo campo dois
vocabulários que nunca se falaram:

| Vocabulário da plataforma (12 valores, `CreativeStatus`) | Vocabulário do Notion (observado na tela) |
|---|---|
| `ideia`, `roteiro`, `produzindo`, `revisao`, `ajustes`, `aprovado`, `reprovado`, `pronto`, `em_teste`, `testado`, `escalar`, `arquivado` | `Concluído`, `Não iniciado`, `Revisar edição`, `Postado`, `Postado no Trial`, **e registros sem status nenhum** |

**Situação atual (já em produção, 2026-09-01):** nada é traduzido. Tudo que não
está no vocabulário da plataforma cai num balde explícito **"Fora do fluxo da
plataforma"** no funil, e as porcentagens são calculadas sobre a base inteira —
o funil fecha com o card "Total de criativos". Isso resolveu a **contradição
numérica**, mas não resolve a **semântica**: os ~985 criativos do Notion seguem
todos num balde só, sem participar do fluxo de produção.

---

## 2. Mapa proposto

Confiança **alta** = há fala literal do time na reunião definindo o significado.
Confiança **baixa** = é inferência minha e precisa de confirmação.

| Status no Notion | → Status na plataforma | Confiança | Base |
|---|---|---|---|
| `Concluído` | **`pronto`** | 🟢 Alta | *"o status concluído é quando tá pronto. Vamos dizer assim, o vídeo tá pronto"* (00:23:08) |
| `Não iniciado` | **`ideia`** | 🟡 Média | Nome autoexplicativo; é o começo da esteira. Nenhuma fala confirma. |
| `Revisar edição` | **`ajustes`** | 🟡 Média | "Revisar edição" é o vídeo voltando para o editor. `revisao` na plataforma parece ser a etapa de *avaliar*, e `ajustes` a de *corrigir* — por isso `ajustes`. Vale confirmar com quem usa. |
| `Postado` | **`escalar`** ou não mapear | 🔴 Baixa | Ver §3: este é o caso que não fecha. |
| `Postado no Trial` | ? | 🔴 Baixa | **O próprio time não sabe o que significa:** *"eu não sei o que significa isso"* (00:13:15). Precisa de resposta antes de mapear. |
| *(sem status)* | **não mapear** | 🟢 Alta | Deixar explicitamente fora e visível como "sem status" — é sinal de cadastro incompleto no Notion, não um estado do fluxo. |

### O que NÃO é status e não entra neste mapa

A coluna **"Aprovação"** da Biblioteca (`notion_creatives.aprovado`, boolean) é
outra coisa: significa que **o time de tráfego pegou o criativo e subiu no
anúncio** (*"aprovação é quando o pessoal do tráfego pegou esse vídeo e já botou
pra rodar no tráfego"*, 00:23:14). Está sendo renomeada para **"Publicado"**
(MEL-15). Não confundir com o status `aprovado` do fluxo de produção — a colisão
de nome entre os dois é justamente o que causou a confusão na reunião.

---

## 3. A contradição que a reunião deixou aberta

Estas duas falas, separadas por 30 segundos, não fecham:

> **(A)** *"A regra é tudo que não está em escalar nem em arquivado."* (00:12:30)
> — definição do WIP.
>
> **(B)** *"Postado já não entra nessa lista, concluído também já não entra […]
> se não tiver status algum criativo, também não vai entrar aqui."* (00:12:58)

A fala **(B)** descreve o comportamento **atual e acidental** — `Postado` e
`Concluído` ficam fora do WIP só porque não são reconhecidos, não porque alguém
decidiu isso. Se o mapa da §2 for aplicado, `Concluído` vira `pronto`, que pela
regra **(A)** **entra no WIP**. O card WIP saltaria de ~976 para perto do total
da base.

**Isso não é defeito do mapa — é a pergunta de negócio que precisa ser
respondida:** um criativo já produzido e ainda não testado é "trabalho em
andamento"? Pela definição do próprio time (*"o estoque; os criativos que
começaram e não foram terminados"*, 00:07:33), **sim**. Mas o número vai
assustar, e é melhor combinar antes de aparecer na tela.

O caso de `Postado` é pior: postado é fim de linha (o criativo foi ao ar) ou é um
estado paralelo ao fluxo de teste? Se `Postado` → `escalar`, sai do WIP; se não
mapear, continua no balde. **Não tenho base para decidir isso** — é a pergunta 2
da §5.

---

## 4. Como implementar, se aprovado

O mapa **não deve** ser aplicado reescrevendo a coluna `status`. Duas razões: o
dado do Notion é a fonte, e o cron o reescreve 2× por dia — qualquer UPDATE seria
sobrescrito na passada seguinte (mesma armadilha já documentada no `docs/UML.md`
a respeito de `telefone` em `contatos`).

**Opção A — tradução na leitura (recomendada, se o Notion continuar).**
Tabela `creative_status_mappings (workspace_id, notion_status, platform_status)`
+ tradução na view `v_creative_status_counts` e nos hooks. Reversível, auditável,
configurável por conta (serve para o próximo cliente), e o dado cru continua
intacto em `status`. Custo: 1 migration + ajuste da view + UI de configuração.

**Opção B — tradução na escrita, no sync.**
`notion-creatives-sync` traduz antes de gravar, e o texto cru vai para
`raw_properties` (que já é gravado). Mais simples, mas perde o original na coluna
consultada e exige re-sync completo a cada mudança de mapa.

**Se a decisão da Q1 for abandonar o Notion para a Empire, nenhuma das duas se
justifica** — o balde "Fora do fluxo da plataforma" já contém o problema, e os
criativos legados viram histórico. É por isso que a Q2 não deve ser executada
antes da Q1.

---

## 5. Perguntas que precisam do dono (não decido sozinho)

1. **Q1 — O Notion continua para a Empire?** Para clientes novos já está decidido
   que não (*"eles cadastram direto na plataforma"*, 00:11:10). Para a Empire, o
   argumento contra é forte: *"a gente tem vários anúncios lá no Notion, mas a
   maioria não está sendo usada"* (00:11:52), e há o precedente ruim do Cami —
   parte do time num sistema, parte no outro. **Esta resposta destrava ou cancela
   toda a Q2.**
2. **`Postado` sai do fluxo ou é estado paralelo?** (§3)
3. **O que é `Postado no Trial`?** O próprio time não soube dizer.
4. **`Concluído` entrando no WIP é aceitável?** O número vai subir muito (§3).
5. **Q3 — Como o time de tráfego entra no fluxo?** A plataforma pressupõe operação
   a quatro mãos: criativos cadastra e produz, tráfego preenche início do teste,
   publicação, CPL e investimento. Duas propostas surgiram — webhook puxando da
   Meta, ou treinar o time. Há histórico de divergência de números entre a Meta e
   a plataforma (*"às vezes bate lá, não bate aqui"*, 00:06:40), o que pesa a
   favor do webhook.
6. **Q4 — Qual a adoção real hoje?** Sabe-se que o Davi usa e que o tráfego
   consulta, mas não a frequência (*"eu não sei quantas pessoas estão usando […]
   constantemente"*, 00:46:30). **Isto é levantamento, não código** — dá para
   medir pelos logs de acesso do Supabase, se você quiser que eu faça.

---

## 6. Recomendação

Deixar como está — com o balde "Fora do fluxo da plataforma" — **até a Q1 ser
respondida**. A contradição numérica que motivou a reclamação já foi corrigida, e
o balde é honesto: mostra o número certo e nomeia os status crus na tela, em vez
de esconder ou de inventar uma tradução que ninguém aprovou.

Aplicar o mapa da §2 sem responder as perguntas da §5 trocaria um problema
visível (um balde grande, explicado) por um invisível (números de WIP e de funil
que mudam sozinhos, por uma regra que o time não combinou).
