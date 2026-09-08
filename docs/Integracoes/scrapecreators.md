# ScrapeCreators \- Documentação de Integração

**Referência:** [https://docs.scrapecreators.com](https://docs.scrapecreators.com) **Base URL:** [`https://api.scrapecreators.com`](https://api.scrapecreators.com)

`Chave api HqMviGEiTqcctWoqFWTWSXKcvy53`

## Visão Geral

O ScrapeCreators é uma API REST para extração de dados públicos de **27+ plataformas de mídia social**, incluindo TikTok, Instagram, YouTube, LinkedIn, Facebook, Twitter, Reddit, e muito mais.

### Plataformas Suportadas

| Categoria | Plataformas |
| :---- | :---- |
| **Vídeo** | TikTok, YouTube, Instagram (Reels), Facebook (Reels), Twitch, Kick, Snapchat |
| **Social** | Instagram, Facebook, Twitter/X, LinkedIn, Threads, Bluesky, Reddit, Truth Social |
| **E-commerce** | TikTok Shop, Amazon Shop |
| **Ads Library** | Facebook Ad Library, Google Ad Library, LinkedIn Ad Library |
| **Bio Links** | Linktree, Komi, Pillar, Linkbio, Linkme |
| **Outros** | Pinterest, Google Search |

---

## Autenticação

Todas as requisições exigem o header `x-api-key`:

curl "https://api.scrapecreators.com/v1/tiktok/profile" \\

  \-H "x-api-key: SUA\_API\_KEY"

### Obtendo API Key

1. Acesse [https://app.scrapecreators.com](https://app.scrapecreators.com)  
2. Faça login ou crie uma conta  
3. Copie sua API key do dashboard

### Verificando Saldo de Créditos

curl "https://api.scrapecreators.com/v1/credit-balance" \\

  \-H "x-api-key: SUA\_API\_KEY"

**Custo:** 1 crédito por requisição

---

## Códigos de Resposta HTTP

| Código | Significado |
| :---- | :---- |
| `200` | Sucesso |
| `400` | Bad Request \- Parâmetros inválidos ou obrigatórios faltando |
| `401` | Unauthorized \- API key inválida ou ausente |
| `402` | Payment Required \- Créditos insuficientes |
| `500` | Server Error \- Tente novamente mais tarde |

---

## Endpoints Principais

**Nota:** Os custos abaixo são em créditos por requisição.

### TikTok

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/tiktok/profile` | Perfil público do usuário | 1 crédito |
| `GET /v3/tiktok/profile/videos` | Vídeos do perfil | 1 crédito |
| `GET /v2/tiktok/video` | Informações do vídeo | 1 crédito |
| `GET /v1/tiktok/video/transcript` | Transcrição do vídeo | 1 crédito |
| `GET /v1/tiktok/video/comments` | Comentários do vídeo | 1 crédito |
| `GET /v1/tiktok/user/followers` | Seguidores | 1 crédito |
| `GET /v1/tiktok/user/following` | Seguindo | 1 crédito |
| `GET /v1/tiktok/search/users` | Buscar usuários | 1 crédito |
| `GET /v1/tiktok/search/hashtag` | Buscar por hashtag | 1 crédito |
| `GET /v1/tiktok/search/keyword` | Buscar por palavra-chave | 1 crédito |
| `GET /v1/tiktok/get-trending-feed` | Feed de trends | 1 crédito |
| `GET /v1/tiktok/user/audience` | Demografia da audiência | 1 crédito |
| `GET /v1/tiktok/user/live` | Informações de live | 1 crédito |

#### TikTok Shop

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/tiktok/shop/search` | Buscar produtos | 1 crédito |
| `GET /v1/tiktok/shop/products` | Produtos da loja | 1 crédito |
| `GET /v1/tiktok/product` | Detalhes do produto | 1 crédito |
| `GET /v1/tiktok/shop/product/reviews` | Avaliações do produto | 1 crédito |

---

### Instagram

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/instagram/profile` | Perfil público | 1 crédito |
| `GET /v1/instagram/basic-profile` | Perfil básico | 1 crédito |
| `GET /v2/instagram/user/posts` | Posts do usuário | 1 crédito |
| `GET /v1/instagram/post` | Info do post/reel | 1 crédito |
| `GET /v2/instagram/media/transcript` | Transcrição (reels com áudio) | 1 crédito |
| `GET /v2/instagram/reels/search` | Buscar reels | 1 crédito |
| `GET /v2/instagram/post/comments` | Comentários | 1 crédito |
| `GET /v1/instagram/user/reels` | Reels do usuário | 1 crédito |
| `GET /v1/instagram/user/highlights` | Story highlights | 1 crédito |
| `GET /v1/instagram/user/highlight/detail` | Detalhes do highlight | 1 crédito |
| `GET /v1/instagram/user/embed` | HTML de embed | 1 crédito |

---

### YouTube

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/youtube/channel` | Detalhes do canal | 1 crédito |
| `GET /v1/youtube/channel-videos` | Vídeos do canal | 1 crédito |
| `GET /v1/youtube/channel/shorts` | Shorts do canal | 1 crédito |
| `GET /v1/youtube/video` | Detalhes do vídeo/short | 1 crédito |
| `GET /v1/youtube/video/transcript` | Transcrição do vídeo | 1 crédito |
| `GET /v1/youtube/video/comments` | Comentários | 1 crédito |
| `GET /v1/youtube/search` | Busca geral | 1 crédito |
| `GET /v1/youtube/search/hashtag` | Busca por hashtag | 1 crédito |
| `GET /v1/youtube/shorts/trending` | Shorts em trend | 1 crédito |
| `GET /v1/youtube/playlist` | Detalhes da playlist | 1 crédito |
| `GET /v1/youtube/community-post` | Post da comunidade | 1 crédito |

---

### LinkedIn

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/linkedin/profile` | Perfil pessoal | 1 crédito |
| `GET /v1/linkedin/company` | Página da empresa | 1 crédito |
| `GET /v1/linkedin/company/posts` | Posts da empresa | 1 crédito |
| `GET /v1/linkedin/post` | Detalhes do post | 1 crédito |

---

### Facebook

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/facebook/profile` | Perfil público | 1 crédito |
| `GET /v1/facebook/profile/reels` | Reels do perfil | 1 crédito |
| `GET /v1/facebook/profile/photos` | Fotos do perfil | 1 crédito |
| `GET /v1/facebook/profile/posts` | Posts do perfil | 1 crédito |
| `GET /v1/facebook/group/posts` | Posts do grupo | 1 crédito |
| `GET /v1/facebook/post` | Detalhes do post | 1 crédito |
| `GET /v1/facebook/post/transcript` | Transcrição (vídeos) | 1 crédito |
| `GET /v1/facebook/post/comments` | Comentários | 1 crédito |

---

### Facebook Ad Library

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/facebook/adLibrary/ad` | Detalhes do anúncio | 1 crédito |
| `GET /v1/facebook/adLibrary/search/ads` | Buscar anúncios | 1 crédito |
| `GET /v1/facebook/adLibrary/company/ads` | Anúncios da empresa | 1 crédito |
| `GET /v1/facebook/adLibrary/search/companies` | Buscar empresas | 1 crédito |

---

### Google Ad Library

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/google/company/ads` | Anúncios da empresa | 1 crédito |
| `GET /v1/google/ad` | Detalhes do anúncio | 1 crédito |
| `GET /v1/google/adLibrary/advertisers/search` | Buscar anunciantes | 1 crédito |

---

### LinkedIn Ad Library

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/linkedin/ads/search` | Buscar anúncios | 1 crédito |
| `GET /v1/linkedin/ad` | Detalhes do anúncio | 1 crédito |

---

### Twitter / X

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/twitter/profile` | Perfil público | 1 crédito |
| `GET /v1/twitter/user-tweets` | Tweets do usuário | 1 crédito |
| `GET /v1/twitter/tweet` | Detalhes do tweet | 1 crédito |
| `GET /v1/twitter/tweet/transcript` | Transcrição | 1 crédito |
| `GET /v1/twitter/community` | Comunidade | 1 crédito |
| `GET /v1/twitter/community/tweets` | Tweets da comunidade | 1 crédito |

---

### Reddit

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/reddit/subreddit/details` | Detalhes do subreddit | 1 crédito |
| `GET /v1/reddit/subreddit` | Posts do subreddit | 1 crédito |
| `GET /v1/reddit/subreddit/search` | Buscar no subreddit | 1 crédito |
| `GET /v1/reddit/post/comments` | Comentários do post | 1 crédito |
| `GET /v1/reddit/search` | Busca geral | 1 crédito |
| `GET /v1/reddit/ads/search` | Buscar anúncios | 1 crédito |
| `GET /v1/reddit/ad` | Detalhes do anúncio | 1 crédito |

---

### Truth Social

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/truthsocial/profile` | Perfil público | 1 crédito |
| `GET /v1/truthsocial/user/posts` | Posts do usuário | 1 crédito |
| `GET /v1/truthsocial/post` | Detalhes do post | 1 crédito |

---

### Threads

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/threads/profile` | Perfil público | 1 crédito |
| `GET /v1/threads/user/posts` | Posts do usuário | 1 crédito |
| `GET /v1/threads/post` | Detalhes do post | 1 crédito |
| `GET /v1/threads/search/users` | Buscar usuários | 1 crédito |

---

### Bluesky

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /bluesky/profile` | Perfil público | 1 crédito |
| `GET /bluesky/user/posts` | Posts do usuário | 1 crédito |
| `GET /bluesky/post` | Detalhes do post | 1 crédito |

---

### Pinterest

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/pinterest/search` | Buscar pins | 1 crédito |
| `GET /v1/pinterest/pin` | Detalhes do pin | 1 crédito |
| `GET /v1/pinterest/user/boards` | Boards do usuário | 1 crédito |
| `GET /v1/pinterest/board` | Detalhes do board | 1 crédito |

---

### Google Search

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/google/search` | Resultados de busca | 1 crédito |

---

### Twitch

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/twitch/profile` | Perfil do streamer | 1 crédito |
| `GET /v1/twitch/clip` | Detalhes do clip | 1 crédito |

---

### Kick

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/kick/clip` | Detalhes do clip | 1 crédito |

---

### Snapchat

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/snapchat/profile` | Perfil público | 1 crédito |

---

### Linktree

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/linktree` | Página do Linktree | 1 crédito |

---

### Komi

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/komi` | Página do Komi | 1 crédito |

---

### Pillar

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/pillar` | Página do Pillar | 1 crédito |

---

### Linkbio

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/linkbio` | Página do Linkbio | 1 crédito |

---

### Amazon Shop

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/amazon/shop` | Página da loja | 1 crédito |

---

### Age and Gender Detection

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/detect-age-gender` | Detectar idade e gênero | 1 crédito |

---

### Linkme

| Endpoint | Descrição | Custo |
| :---- | :---- | :---- |
| `GET /v1/linkme` | Perfil público | 1 crédito |

---

## Detalhes dos Endpoints Mais Utilizados

### TikTok Profile

GET /v1/tiktok/profile?handle=stoolpresidente

**Parâmetros:** | Parâmetro | Tipo | Obrigatório | Descrição | |-----------|------|-------------|-----------| | `handle` | string | ✅ | TikTok handle (sem @) |

**Resposta (200):**

{

  "user": {

    "id": "6659752019493208069",

    "uniqueId": "stoolpresidente",

    "nickname": "Dave Portnoy",

    "avatarLarger": "https://...",

    "signature": "El Presidente/Barstool Sports Founder.",

    "verified": true,

    "bioLink": {

      "link": "https://www.barstoolsports.com/bios/Surviving-Barstool",

      "risk": 0

    }

  },

  "stats": {

    "followerCount": 4100000,

    "followingCount": 74,

    "heartCount": 190400000,

    "videoCount": 2017

  }

}

---

### Instagram Profile

GET /v1/instagram/profile?handle=adrianhorning

**Parâmetros:** | Parâmetro | Tipo | Obrigatório | Descrição | |-----------|------|-------------|-----------| | `handle` | string | ✅ | Instagram username | | `trim` | boolean | ❌ | `true` para resposta reduzida |

**Resposta (200):**

{

  "success": true,

  "data": {

    "user": {

      "id": "2700692569",

      "username": "adrianhorning",

      "full\_name": "Adrian Horning",

      "biography": "Scraping the web",

      "bio\_links": \[...\],

      "edge\_followed\_by": { "count": 25116 },

      "edge\_follow": { "count": 101 },

      "is\_verified": true,

      "is\_business\_account": true,

      "profile\_pic\_url": "https://..."

    },

    "edge\_owner\_to\_timeline\_media": {

      "count": 71,

      "edges": \[...\]

    }

  },

  "status": "ok"

}

---

### YouTube Channel

GET /v1/youtube/channel?handle=ThePatMcAfeeShow

\# ou

GET /v1/youtube/channel?channelId=UCxcTeAKWJca6XyJ37\_ZoKIQ

\# ou

GET /v1/youtube/channel?url=https://www.youtube.com/@ThePatMcAfeeShow

**Parâmetros:** | Parâmetro | Tipo | Obrigatório | Descrição | |-----------|------|-------------|-----------| | `channelId` | string | ✅\* | YouTube channel ID | | `handle` | string | ✅\* | YouTube handle (sem @) | | `url` | string | ✅\* | URL completa do canal |

\*Pelo menos um dos três é obrigatório

**Resposta (200):**

{

  "channelId": "UCxcTeAKWJca6XyJ37\_ZoKIQ",

  "channel": "http://www.youtube.com/@ThePatMcAfeeShow",

  "name": "The Pat McAfee Show",

  "avatar": {

    "image": {

      "sources": \[

        { "url": "https://yt3.googleusercontent.com/...", "width": 72, "height": 72 }

      \]

    }

  },

  "description": "",

  "subscriberCount": 2750000,

  "subscriberCountText": "2.75M subscribers",

  "videoCountText": "9,221 videos",

  "viewCountText": "2,170,355,382 views",

  "joinedDateText": "Joined Aug 23, 2017",

  "tags": "pat mcafee, football, ...",

  "links": \["https://store.patmcafeeshow.com", "https://twitter.com/PatMcAfeeShow"\],

  "country": "United States"

}

---

### YouTube Transcript

GET /v1/youtube/video/transcript?url=https://www.youtube.com/watch?v=bjVIDXPP7Uk\&language=en

**Parâmetros:** | Parâmetro | Tipo | Obrigatório | Descrição | |-----------|------|-------------|-----------| | `url` | string | ✅ | URL do vídeo ou short | | `language` | string | ❌ | Código de 2 letras (en, es, pt, etc.) |

**Resposta (200):**

{

  "videoId": "bjVIDXPP7Uk",

  "type": "video",

  "url": "https://www.youtube.com/watch?v=bjVIDXPP7Uk",

  "transcript": \[

    {

      "text": "welcome back to the hell farm and the",

      "startMs": "160",

      "endMs": "1920",

      "startTimeText": "0:00"

    },

    {

      "text": "backyard trails we built these jumps two",

      "startMs": "1920",

      "endMs": "3919",

      "startTimeText": "0:01"

    }

  \],

  "transcript\_only\_text": "welcome back to the hell farm and the backyard trails we built these jumps two years ago...",

  "language": "English"

}

---

## Exemplos de Uso no Empire Site

### Fluxo 1: Gerar conteúdo a partir de vídeo do YouTube

1\. Usuário fornece URL do YouTube no painel de IA

2\. Backend chama /v1/youtube/video para obter metadados

3\. Backend chama /v1/youtube/video/transcript para obter transcrição

4\. Transcrição \+ metadados são enviados para OpenRouter

5\. OpenRouter gera conteúdo otimizado para blog post

**Custo total:** 2 créditos por geração

### Fluxo 2: Gerar conteúdo a partir de post do Instagram

1\. Usuário fornece URL do post/reel do Instagram

2\. Backend chama /v1/instagram/post para obter dados

3\. Se for reel com áudio, chama /v2/instagram/media/transcript

4\. Envia dados para OpenRouter gerar conteúdo

**Custo total:** 1-2 créditos por geração

---

## Configuração no Projeto

### Variáveis de Ambiente

Adicione ao `.env`:

\# ScrapeCreators

SCRAPECREATORS\_API\_KEY=your\_api\_key\_here

### Configuração de Secrets (Supabase Edge Functions)

supabase secrets set SCRAPECREATORS\_API\_KEY=your\_api\_key\_here

---

## Limites e Boas Práticas

### Rate Limiting

- Não há limite documentação explicitamente  
- Cada requisição custa 1 crédito  
- Monitore seu saldo via `/v1/credit-balance`

### Boas Práticas

1. **Cache dados frequentemente acessados** \- Perfil de usuário rarely muda  
2. **Use `trim=true`** no Instagram quando não precisar de todos os dados  
3. **Especifique idioma** nos transcripts para evitar retornos nulos  
4. **Guarde transcrições** \- não precisa buscar toda vez

### Tratamento de Erros

// Exemplo de tratamento

const response \= await fetch(url, {

  headers: { 'x-api-key': API\_KEY }

});

if (response.status \=== 402\) {

  throw new Error('Créditos insuficientes');

}

if (\!response.ok) {

  const error \= await response.json();

  throw new Error(error.message || 'Erro na API');

}

---

## Integração com Edge Functions

### Exemplo: Função para buscar transcrição

// supabase/functions/\_shared/scrapecreators.ts

export async function getTranscript(

  videoUrl: string,

  language: string \= 'en'

): Promise\<{ transcript: string; videoId: string }\> {

  const apiKey \= Deno.env.get('SCRAPECREATORS\_API\_KEY');

  const url \= new URL('https://api.scrapecreators.com/v1/youtube/video/transcript');

  url.searchParams.set('url', videoUrl);

  url.searchParams.set('language', language);

  const response \= await fetch(url.toString(), {

    headers: {

      'x-api-key': apiKey\!,

    },

  });

  if (\!response.ok) {

    throw new Error(\`ScrapeCreators error: ${response.status}\`);

  }

  const data \= await response.json();

  return {

    transcript: data.transcript\_only\_text,

    videoId: data.videoId,

  };

}

---

## Próximos Passos

- [ ] Implementar Edge Function `ai-content` com scraping  
- [ ] Criar painel de IA no editor para input de URL  
- [ ] Mapear campos retornados → prompts para OpenRouter  
- [ ] Testar com diferentes plataformas (YouTube, Instagram, TikTok)

---

## Referência

- **Dashboard:** [https://app.scrapecreators.com](https://app.scrapecreators.com)  
- **Docs oficial:** [https://docs.scrapecreators.com](https://docs.scrapecreators.com)  
- **Suporte:** [support@scrapecreators.com](mailto:support@scrapecreators.com)

