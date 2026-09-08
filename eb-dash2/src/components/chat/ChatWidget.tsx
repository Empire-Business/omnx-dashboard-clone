import { useEffect, useRef, useState } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { useChatContext } from '@/contexts/ChatContext'
import { supabase } from '@/lib/supabase'
import { ChatPanel } from './ChatPanel'
import { cn } from '@/lib/utils'

export function ChatWidget() {
  const { isOpen, toggleChat, closeChat, messages, hasUnread } = useChatContext()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [claraEnabled, setClaraEnabled] = useState<boolean | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Verifica se o usuário tem acesso à Clara via workspace_members
  useEffect(() => {
    let cancelled = false
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setClaraEnabled(false); return }
      const { data } = await supabase
        .from('workspace_members')
        .select('clara_habilitado')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
      if (!cancelled) setClaraEnabled(data?.clara_habilitado ?? false)
    }
    checkAccess()
    return () => { cancelled = true }
  }, [])

  // Fechar com ESC (sai de fullscreen primeiro, depois fecha)
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (isFullscreen) setIsFullscreen(false)
        else closeChat()
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [isOpen, isFullscreen, closeChat])

  // Resetar fullscreen ao fechar
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (!isOpen) setIsFullscreen(false)
  }

  // Scroll lock em mobile quando chat aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Fechar clicando fora — só em modo normal (não fullscreen)
  useEffect(() => {
    if (!isOpen || isFullscreen) return
    const handle = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const btn = document.getElementById('chat-widget-btn')
        if (btn && btn.contains(e.target as Node)) return
        closeChat()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [isOpen, isFullscreen, closeChat])

  // Enquanto carrega ou sem acesso, não renderiza nada
  if (!claraEnabled) return null

  return (
    <>
      {/* Botão flutuante — esconde em fullscreen */}
      {!isFullscreen && (
        <button
          id="chat-widget-btn"
          onClick={toggleChat}
          title={isOpen ? 'Fechar Clara' : 'Abrir Clara'}
          aria-label="Clara"
          className={cn(
            'fixed z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95',
            'bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-[calc(1.5rem+env(safe-area-inset-right))]',
            isOpen ? 'bg-empire-subtle' : 'bg-empire-void',
            'text-empire-surface',
          )}
        >
          {isOpen ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}

          {/* Badge unread */}
          {!isOpen && hasUnread && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-empire-danger text-empire-surface text-[11px] font-bold">
              {messages.filter((m) => m.role === 'assistant').length > 9
                ? '9+'
                : messages.filter((m) => m.role === 'assistant').length}
            </span>
          )}
        </button>
      )}

      {/* Backdrop mobile */}
      {isOpen && !isFullscreen && (
        <div
          className="fixed inset-0 z-40 bg-empire-void/40 sm:hidden"
          onClick={closeChat}
          aria-hidden="true"
        />
      )}

      {/* Painel de chat */}
      <div
        ref={panelRef}
        className={cn(
          'fixed z-50 flex flex-col bg-empire-canvas transition-transform duration-300 ease-out',
          isFullscreen
            ? 'inset-0'
            : 'bottom-0 right-0 w-full sm:w-96 h-[80dvh] sm:h-[600px] max-h-dvh border-l border-empire-border shadow-xl',
          isOpen || isFullscreen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {isOpen && (
          <ChatPanel
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen((v) => !v)}
            onClose={closeChat}
          />
        )}
      </div>
    </>
  )
}
