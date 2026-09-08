import { useState } from 'react'
import { X, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DisparoWithTags, DisparoSignificado, TipoMensagemWhatsapp } from '@/types/disparos'
import { DISPARO_SIGNIFICADOS } from '@/types/disparos'
import { useAllGhlTags } from '@/hooks/useDisparos'
import { TagCombobox } from './TagCombobox'
import { DisparoCamposCustomEditor } from './DisparoCamposCustomEditor'

interface Props {
  disparo: DisparoWithTags | null
  onSave: (payload: {
    nome: string
    descricao: string
    cor: string
    tipoMensagem: TipoMensagemWhatsapp
    tags: Record<DisparoSignificado, string | undefined>
  }) => void
  onDelete?: () => void
  onCancel: () => void
  loading?: boolean
}

export function DisparoConfigForm({ disparo, onSave, onDelete, onCancel, loading }: Props) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [cor, setCor] = useState('#6366f1')
  const [tipoMensagem, setTipoMensagem] = useState<TipoMensagemWhatsapp>('marketing')
  const [tags, setTags] = useState<Record<DisparoSignificado, string | undefined>>({
    trigger: '',
    respondeu: '',
    parou: '',
    erro: '',
    nao_respondeu: '',
    converteu: '',
  })
  const [tagError, setTagError] = useState<string | null>(null)
  const { tags: allGhlTags, loading: tagsLoading } = useAllGhlTags()

  const [prevDisparo, setPrevDisparo] = useState<{ value: DisparoWithTags | null } | null>(null)
  if (prevDisparo === null || prevDisparo.value !== disparo) {
    setPrevDisparo({ value: disparo })
    if (disparo) {
      setNome(disparo.nome)
      setDescricao(disparo.descricao ?? '')
      setCor(disparo.cor)
      setTipoMensagem(disparo.tipo_mensagem ?? 'marketing')
      const map: Record<DisparoSignificado, string | undefined> = {
        trigger: '',
        respondeu: '',
        parou: '',
        erro: '',
        nao_respondeu: '',
        converteu: '',
      }
      for (const t of disparo.tags) {
        map[t.significado] = t.tag
      }
      setTags(map)
    } else {
      setNome('')
      setDescricao('')
      setCor('#6366f1')
      setTipoMensagem('marketing')
      setTags({
        trigger: '',
        respondeu: '',
        parou: '',
        erro: '',
        nao_respondeu: '',
        converteu: '',
      })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // disparo_tags tem UNIQUE(workspace_id, disparo_id, tag) além do
    // UNIQUE(..., significado) — se o mesmo valor de tag for usado em dois
    // significados diferentes, o upsert quebra com erro de constraint cru.
    // Valida aqui pra dar uma mensagem clara antes de submeter.
    const seen = new Map<string, string>()
    for (const s of DISPARO_SIGNIFICADOS) {
      const value = (tags[s.value] ?? '').trim().toLowerCase()
      if (!value) continue
      const dupLabel = seen.get(value)
      if (dupLabel) {
        setTagError(`A tag "${tags[s.value]}" está repetida em "${dupLabel}" e "${s.label}" — cada campo precisa de uma tag diferente.`)
        return
      }
      seen.set(value, s.label)
    }
    setTagError(null)

    onSave({ nome, descricao, cor, tipoMensagem, tags })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium text-empire-void">
          {disparo ? 'Editar Campanha' : 'Nova Campanha'}
        </h3>
        <button type="button" onClick={onCancel} className="text-empire-muted hover:text-empire-void">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="nome">Nome da campanha</Label>
          <Input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Black Friday 2026"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cor">Cor</Label>
          <div className="flex items-center gap-2">
            <input
              id="cor"
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              className="h-9 w-9 rounded border border-empire-border cursor-pointer"
            />
            <Input value={cor} onChange={(e) => setCor(e.target.value)} className="flex-1" />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tipo_mensagem">Tipo de mensagem (WhatsApp)</Label>
        <select
          id="tipo_mensagem"
          value={tipoMensagem}
          onChange={(e) => setTipoMensagem(e.target.value as TipoMensagemWhatsapp)}
          className="flex h-9 w-full rounded-md border border-empire-border bg-empire-surface px-3 text-sm text-empire-void focus:border-empire-primary focus:outline-none"
        >
          <option value="marketing">Marketing</option>
          <option value="utility">Utility</option>
        </select>
        <p className="text-xs text-empire-muted">
          Categoria do template usado nesta campanha — define o preço por mensagem entregue (configurável em "Custo por mensagem").
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Input
          id="descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Objetivo da campanha"
        />
      </div>

      <div className="space-y-3">
        <Label>Tags</Label>
        <p className="text-xs text-empire-muted">
          Informe a tag exatamente como aparece no GHL. Apenas a tag de <strong>Disparo</strong> é obrigatória.
        </p>
        {DISPARO_SIGNIFICADOS.map((s) => (
          <div key={s.value} className="grid grid-cols-[140px_1fr] items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-empire-void">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.cor }} />
              {s.label}
            </div>
            <TagCombobox
              value={tags[s.value] ?? ''}
              onChange={(v) => setTags((prev) => ({ ...prev, [s.value]: v }))}
              options={allGhlTags}
              loading={tagsLoading}
              placeholder={s.value === 'trigger' ? 'Obrigatório' : 'Opcional'}
              required={s.value === 'trigger'}
            />
          </div>
        ))}
        {tagError && (
          <p className="text-xs text-empire-danger">{tagError}</p>
        )}
      </div>

      {disparo && <DisparoCamposCustomEditor disparoId={disparo.id} />}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={loading} className="gap-2">
          <Save className="h-4 w-4" />
          {disparo ? 'Salvar alterações' : 'Criar campanha'}
        </Button>
        {disparo && onDelete && (
          <Button type="button" variant="destructive" onClick={onDelete} disabled={loading} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        )}
      </div>
    </form>
  )
}
