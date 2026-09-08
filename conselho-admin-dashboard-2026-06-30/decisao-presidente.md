# Decisão do Presidente — Conselho Admin Dashboard

## Caminhos que emergiram

1. **GHL como protagonista absoluto**: transformar `/admin` em um command center onde a integração GHL ocupa o centro da tela com status visual binário, checklist de setup obrigatório e separação física entre configurações de negócio (GHL, integrações) e configurações de plataforma (usuários, permissões, apps). Defendido por Alex Hormozi, Marcel Marcondes e Sandro San.
2. **GHL dentro de um funil visual de configuração**: manter a integração GHL como passo central, mas envolvê-la em uma sequência de etapas visuais que guiam o usuário. Defendido por Russell Brunson.
3. **Observar antes de construir**: gravar sessões reais de onboarding com 3 clientes antes de qualquer grande iteração, priorizando empatia e clareza sobre pressa. Defendido por Gary Vaynerchuk.

## Minha decisão

Vamos fazer o caminho 1: **GHL protagonista absoluto no centro de `/admin`, com status binário, checklist obrigatório e separação física entre config de negócio e config de plataforma**.

A página de admin não precisa de mais funções. Precisa de foco. A integração GHL é a espinha dorsal do produto — se ela não estiver verde, nada do resto importa. Portanto, ela ocupa o centro da tela, com um card grande, status claro e um checklist que incomoda até estar completo. Os três cards atuais (Usuários, Apps, Permissões) não desaparecem, mas são movidos para uma seção secundária de "Plataforma", abaixo e visualmente subordinada à seção "Negócio".

Não vamos esperar pesquisa para tomar essa decisão. O problema é óbvio: a integração mais importante do produto está escondida em um dropdown. Isso não é hipótese — é um erro de prioridade gritante. Concordo com Gary em um ponto: a linguagem precisa ser humana. Mas discordo radicalmente de esperar três sessões gravadas antes de agir. A empatia não substitui o julgamento de produto. Vamos observar enquanto entregamos, não antes.

## O que incorporo e o que descarto

**Incorporo:**
- **Alex Hormozi**: GHL no centro, status binário, checklist obrigatório, separação entre config de negócio e plataforma, KPIs de tempo para setup verde e taxa de ativação em 7 dias.
- **Marcel Marcondes**: arquitetura de experiência, separação física entre configurações, medição de "tempo para configurar GHL sem suporte".
- **Sandro San**: GHL central, status visual, eliminação de complexidade, KPI tempo operacional sem suporte.
- **Russell Brunson**: a ideia de sequência clara vira uma camada secundária *dentro* do checklist, não um funil dominante.
- **Grant Cardone**: ação imediata, interface vendendo a próxima ação, nada passivo.
- **Gary Vaynerchuk**: validar em paralelo com 3 clientes reais, mas sem bloquear a entrega.

**Descarto:**
- **Gary**: a exigência de observação antes da ação. Em produto, você também decide pelo instinto afiado.
- **Russell**: o funil visual como estrutura principal. É ruído. Checklist limpo é melhor.
- **Grant**: a ideia de "impossível de ignorar" ao ponto de ser intrusivo. Clareza vende mais do que gritaria.

## Decisão final

**Vamos fazer `/admin` como um command center de negócio, não como um painel de configurações técnicas.** A integração GHL será o elemento dominante da página. Enquanto o checklist não estiver verde, o dashboard incomodará o usuário com clareza — sem pânico, sem gritaria. As configurações de plataforma (Usuários, Apps, Permissões) serão reorganizadas em uma seção inferior e visualmente secundária. Instalaremos os KPIs de tempo para setup verde e taxa de ativação em 7 dias. E validaremos com 3 clientes reais em paralelo, ajustando linguagem e ordem se necessário.

Não vamos construir tudo. Vamos construir a coisa certa.
