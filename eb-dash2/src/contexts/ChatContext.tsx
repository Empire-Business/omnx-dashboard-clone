/* eslint-disable react-refresh/only-export-components -- arquivo exporta Provider+hook/variantes por padrão de projeto */
import { createContext, useContext, useState, useCallback } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatContextValue {
  isOpen: boolean
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
  messages: ChatMessage[]
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => string
  updateMessage: (id: string, content: string) => void
  conversationId: string | null
  setConversationId: (id: string) => void
  clearMessages: () => void
  loadConversation: (convId: string, msgs: Omit<ChatMessage, 'id'>[]) => void
  hasUnread: boolean
  markRead: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [hasUnread, setHasUnread] = useState(false)

  const openChat = useCallback(() => {
    setIsOpen(true)
    setHasUnread(false)
  }, [])

  const closeChat = useCallback(() => setIsOpen(false), [])

  const toggleChat = useCallback(() => {
    setIsOpen((v) => {
      if (!v) setHasUnread(false)
      return !v
    })
  }, [])

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>): string => {
    const id = crypto.randomUUID()
    const full: ChatMessage = { ...msg, id, timestamp: new Date() }
    setMessages((prev) => [...prev, full])
    return id
  }, [])

  const updateMessage = useCallback((id: string, content: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, content } : m))
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setConversationId(null)
  }, [])

  const loadConversation = useCallback((convId: string, msgs: Omit<ChatMessage, 'id'>[]) => {
    setConversationId(convId)
    setMessages(msgs.map((m) => ({ ...m, id: crypto.randomUUID() })))
  }, [])

  const markRead = useCallback(() => setHasUnread(false), [])

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        openChat,
        closeChat,
        toggleChat,
        messages,
        addMessage,
        updateMessage,
        conversationId,
        setConversationId,
        clearMessages,
        loadConversation,
        hasUnread,
        markRead,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatContext must be used inside ChatProvider')
  return ctx
}
