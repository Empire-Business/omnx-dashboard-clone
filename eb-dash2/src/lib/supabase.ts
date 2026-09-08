import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars')
}

// auth.lock: por padrão o supabase-js serializa getSession/getUser/refresh
// entre abas via navigator.locks (Web Locks API). Com múltiplas abas do
// dashboard abertas (ou uma aba que trava/recarrega no meio de uma
// operação), essa trava pode ser "roubada" e quebrar com o erro nativo do
// browser "Lock broken by another request with the 'steal' option" — isso
// derrubava a tela inteira (PermissionsContext relança o erro cru como
// "Nenhum app disponível"). Como cada aba já mantém seu próprio client e
// token, não precisamos dessa coordenação entre abas: um no-op aqui faz
// cada chamada rodar direto, sem lock nenhum.
const noopLock = async <T,>(_name: string, _acquireTimeout: number, fn: () => Promise<T>): Promise<T> => fn()

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: noopLock,
  },
})
