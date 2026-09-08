import { createClient } from 'jsr:@supabase/supabase-js@2'

const TELEGRAM_API = 'https://api.telegram.org'
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// ─── Tipos do Telegram ────────────────────────────────────────────────────────
interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
}

interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: { id: number; type: string }
  text?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

// ─── Enviar mensagem para o Telegram ─────────────────────────────────────────
async function sendMessage(chatId: number, text: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  })
}

// ─── Verificar se usuário está na allowlist ───────────────────────────────────
async function getAllowedWorkspace(telegramUserId: number): Promise<string | null> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data, error } = await supabase
    .from('telegram_allowed_users')
    .select('workspace_id')
    .eq('telegram_user_id', telegramUserId)
    .eq('ativo', true)
    .maybeSingle()

  if (error) {
    console.error('Erro ao verificar allowlist:', error)
    return null
  }
  return data?.workspace_id ?? null
}

// ─── Chamar bot-chat internamente via fetch (sem timeout curto do invoke) ─────
async function callBotChat(message: string, chatId: number, workspaceId: string): Promise<string> {
  const nowSP = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

  const res = await fetch(`${SUPABASE_URL}/functions/v1/bot-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      message,
      workspace_id: workspaceId,
      context: {
        current_date_sp: nowSP,
        current_module: 'telegram',
      },
      _internal_secret: Deno.env.get('BOT_INTERNAL_SECRET') ?? '',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Erro ao chamar bot-chat:', res.status, err)
    return 'Erro ao consultar os dados. Tente novamente em alguns instantes.'
  }

  const json = await res.json() as { answer: string }
  return json.answer ?? 'Sem resposta.'
}

// ─── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Verificar token do Telegram no header X-Telegram-Bot-Api-Secret-Token (opcional mas recomendado)
  // O Telegram envia este header quando configurado no setWebhook com secret_token
  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token')
  const expectedSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (expectedSecret && secretHeader !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 })
  }

  let update: TelegramUpdate
  try {
    update = await req.json() as TelegramUpdate
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const msg = update.message
  if (!msg || !msg.from || !msg.text) {
    // Ignorar updates sem mensagem de texto (ex: edições, reações, etc.)
    return new Response('OK', { status: 200 })
  }

  const chatId = msg.chat.id
  const userId = msg.from.id
  const text = msg.text.trim()
  const firstName = msg.from.first_name

  // Ignorar comandos de sistema
  if (text === '/start') {
    await sendMessage(chatId, `Olá, ${firstName}! 👋\n\nEste é o Assistente OMNX. Faça uma pergunta sobre leads, MQLs, faturamento ou SDRs.`)
    return new Response('OK', { status: 200 })
  }

  // Verificar allowlist
  const workspaceId = await getAllowedWorkspace(userId)
  if (!workspaceId) {
    await sendMessage(
      chatId,
      `⛔ Acesso não autorizado.\n\nSeu ID Telegram: \`${userId}\`\n\nPeça ao administrador para liberar seu acesso.`
    )
    return new Response('OK', { status: 200 })
  }

  // Processar em background para não estourar o timeout do webhook do Telegram
  const process = async () => {
    // Indicador de digitando...
    await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    })

    // Chamar o bot
    const answer = await callBotChat(text, chatId, workspaceId)

    // Telegram tem limite de 4096 caracteres por mensagem
    if (answer.length <= 4096) {
      await sendMessage(chatId, answer)
    } else {
      const parts = answer.match(/[\s\S]{1,4000}/g) ?? [answer]
      for (const part of parts) {
        await sendMessage(chatId, part)
      }
    }
  }

  // Manter a função viva em background após retornar 200
  // @ts-ignore — EdgeRuntime disponível no ambiente Supabase/Deno
  if (typeof EdgeRuntime !== 'undefined') {
    // @ts-ignore
    EdgeRuntime.waitUntil(process())
  } else {
    // Fallback local: await normal
    await process()
  }

  return new Response('OK', { status: 200 })
})
