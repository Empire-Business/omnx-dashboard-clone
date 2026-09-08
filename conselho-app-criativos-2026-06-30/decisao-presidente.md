# Decisão do Presidente — Conselho dos Mestres

**Data:** 2026-06-30  
**Presidente:** Steve Jobs  
**Assunto:** Separação do app dedicado de controle e teste de criativos de anúncios

---

O debate revelou três caminhos. O primeiro, defendido pelo Marcel, propõe definir o processo inteiro no papel ou no Notion antes de tocar código — hipótese, persona, promessa, governança, cadência. O segundo, do Russell, quer desenhar um funil estruturado do criativo com cinco estágios: ideia, teste, aprovação, escala e reaproveitamento. O terceiro, liderado pelo Grant e pelo Sandro, defende separar o domínio, ativar RLS e entregar um MVP imediato usando `notion_creatives`, com poucos campos, status claros, dono nomeado e métrica de morte visível.

Escolho o terceiro caminho. Não porque os outros não tenham razão, mas porque produto só é real quando alguém senta na frente dele e decide. O cliente — aqui, o time de tráfego — não precisa de mais uma planilha ou de um funil teatral com cinco portas. Ele precisa ver o criativo, ver o número que decide e puxar o gatilho. A experiência importa mais que o processo perfeito.

Incorporo do Alex a clareza da métrica única: CPLQ, CPA e ROAS são os termômetros que decidem viver, morrer ou escalar. Do Sandro, pego a exigência de domínio separado, RLS ativado e zero `service_role` no frontend. Do Marcel, absorvo a governança mínima: dono com poder real, métrica de morte definida e cadência de revisão semanal. Do Gary, guardo apenas a ideia de que cada criativo deve carregar um campo de aprendizado — uma linha sobre o que a peça tentou dizer e qual reação gerou. Do Russell, fico com a estrutura mínima: ideia → teste → aprova/reprova → escala.

Descarto as duas semanas exclusivas de Notion. Descarto o funil de cinco estágios como requisito de lançamento. Descarto reaproveitamento orgânico e brand como prioridade do MVP — isso é consequência, não entrada. Descarto qualquer solução que misture criativo de volta ao Traqueamento ou que complique o Painel de Tráfego.

**Vamos fazer assim:** separar o sub-app "Criativos" com workspace próprio, RLS ativado e sem `service_role` no frontend. MVP com cadastro simples, associação a campanha, tipo de criativo (copy, imagem, vídeo, hook, CTA), status (testando/aprovado/reprovado), dono nomeado, campo de aprendizado e métricas de morte/escala (CPLQ/CPA/ROAS). Link limpo com os números do Painel de Tráfego, sem quebrar o que já funciona. Uma semana de definição de processo mínimo e, em paralelo, o MVP entra em uso real. Dados históricos são preservados.

A decisão é tomada. Agora executem.
