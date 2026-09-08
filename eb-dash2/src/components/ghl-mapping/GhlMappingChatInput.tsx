import { useState } from 'react'
import { Sparkles, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

interface GhlMappingChatInputProps {
  onSubmit: (description: string) => void
  isLoading?: boolean
  disabled?: boolean
  fieldName: string
}

export function GhlMappingChatInput({ onSubmit, isLoading, disabled, fieldName }: GhlMappingChatInputProps) {
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = description.trim()
    if (!trimmed || isLoading || disabled) return
    onSubmit(trimmed)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-empire-primary" />
              {`O que significa “${fieldName}”?`}
            </CardTitle>
            <CardDescription className="mt-1">
              Explique para que este campo é usado no seu GHL. A IA sugerirá somente a classificação dele.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            placeholder={`Exemplo: “${fieldName}” é preenchido quando...`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isLoading || disabled}
            className="min-h-[140px]"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-empire-subtle">
              {description.length}/2000 caracteres
            </span>
            <Button
              type="submit"
              disabled={!description.trim() || isLoading || disabled}
              className="gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Classificar este campo
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
