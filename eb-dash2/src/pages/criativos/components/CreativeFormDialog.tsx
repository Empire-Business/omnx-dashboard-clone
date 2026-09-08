import { useState } from 'react'
import type { NotionCreative } from '@/types/creatives'
import { CREATIVE_STATUSES } from '@/types/creatives'
import { useCreateCreative, useUpdateCreativeFull, useCreativeCampaigns } from '@/hooks/useCriativos'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

const FORMAT_OPTIONS = [
  { value: 'reels', label: 'Reels' },
  { value: 'static', label: 'Static' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'stories', label: 'Stories' },
  { value: 'video', label: 'Vídeo' },
  { value: 'other', label: 'Outro' },
]

// Valor sentinela do seletor de campanha: não é uma campanha, é o comando
// "quero digitar uma que ainda não existe" (MEL-01 — o time cria campanha nova com
// frequência, e a lista só conhece as que já foram usadas em algum criativo).
const CAMPANHA_NOVA = '__nova__'

interface CreativeFormDialogProps {
  open: boolean
  onClose: () => void
  creative?: NotionCreative | null
}

export function CreativeFormDialog({ open, onClose, creative }: CreativeFormDialogProps) {
  const createMutation = useCreateCreative()
  const updateMutation = useUpdateCreativeFull()
  const { data: campaigns, isLoading: loadingCampaigns } = useCreativeCampaigns()

  const [name, setName] = useState('')
  const [format, setFormat] = useState('')
  // `objective` é a coluna onde a campanha é gravada (MEL-01/MEL-02).
  const [objective, setObjective] = useState('')
  const [digitandoCampanha, setDigitandoCampanha] = useState(false)
  const [status, setStatus] = useState('')
  const [profile, setProfile] = useState('')
  const [socialNetwork, setSocialNetwork] = useState('')
  const [copyText, setCopyText] = useState('')
  const [adCaption, setAdCaption] = useState('')
  const [contentPillar, setContentPillar] = useState('')
  const [funnelStage, setFunnelStage] = useState('')
  const [observations, setObservations] = useState('')
  const [videosFolderUrl, setVideosFolderUrl] = useState('')
  const [finalAssetUrl, setFinalAssetUrl] = useState('')
  const [rawAssetUrl, setRawAssetUrl] = useState('')

  const isEditing = !!creative
  const isPending = createMutation.isPending || updateMutation.isPending

  const [prevKey, setPrevKey] = useState<{ open: boolean; creative: typeof creative } | null>(null)
  if (prevKey === null || prevKey.open !== open || prevKey.creative !== creative) {
    setPrevKey({ open, creative })
    if (open) {
      if (creative) {
        setName(creative.name ?? '')
        setFormat(creative.format ?? '')
        setObjective(creative.objective ?? '')
        setDigitandoCampanha(false)
        setStatus(creative.status ?? '')
        setProfile(creative.profile ?? '')
        setSocialNetwork(creative.social_network ?? '')
        setCopyText(creative.copy_text ?? '')
        setAdCaption(creative.ad_caption ?? '')
        setContentPillar(creative.content_pillar ?? '')
        setFunnelStage(creative.funnel_stage ?? '')
        setObservations(creative.observations ?? '')
        setVideosFolderUrl(creative.videos_folder_url ?? '')
        setFinalAssetUrl(creative.final_asset_url ?? '')
        setRawAssetUrl(creative.raw_asset_url ?? '')
      } else {
        setName('')
        setFormat('')
        setObjective('')
        setDigitandoCampanha(false)
        setStatus('')
        setProfile('')
        setSocialNetwork('')
        setCopyText('')
        setAdCaption('')
        setContentPillar('')
        setFunnelStage('')
        setObservations('')
        setVideosFolderUrl('')
        setFinalAssetUrl('')
        setRawAssetUrl('')
      }
    }
  }

  // A campanha do criativo em edição pode não estar na lista (ex.: só ele usa aquele
  // valor, ou o sync ainda não trouxe). Sem isso, o seletor abriria em branco e a edição
  // apagaria a campanha existente sem o usuário perceber.
  const opcoesCampanha = Array.from(
    new Set([...(campaigns ?? []), ...(!digitandoCampanha && objective.trim() ? [objective.trim()] : [])]),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const handleCampanhaChange = (valor: string) => {
    if (valor === CAMPANHA_NOVA) {
      setDigitandoCampanha(true)
      setObjective('')
      return
    }
    setDigitandoCampanha(false)
    setObjective(valor)
  }

  const toNull = (value: string) => (value.trim() === '' ? null : value.trim())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const input = {
      name: name.trim(),
      format: toNull(format),
      objective: toNull(objective),
      profile: toNull(profile),
      social_network: toNull(socialNetwork),
      copy_text: toNull(copyText),
      ad_caption: toNull(adCaption),
      content_pillar: toNull(contentPillar),
      funnel_stage: toNull(funnelStage),
      observations: toNull(observations),
      videos_folder_url: toNull(videosFolderUrl),
      final_asset_url: toNull(finalAssetUrl),
      raw_asset_url: toNull(rawAssetUrl),
      status: toNull(status),
    }

    if (isEditing && creative) {
      await updateMutation.mutateAsync({ id: creative.id, input })
    } else {
      await createMutation.mutateAsync(input)
    }
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader onClose={onClose}>
          <DialogTitle>{isEditing ? 'Editar Criativo' : 'Novo Criativo'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Editando ${creative?.external_id ?? creative?.name ?? 'criativo'}`
              : 'Só o nome é obrigatório — preencha o resto quando fizer sentido.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="creative-name">Nome *</Label>
                <Input
                  id="creative-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do criativo"
                  disabled={isPending}
                  required
                />
              </div>

              <div>
                <Label htmlFor="creative-format">Formato</Label>
                <Select
                  value={format}
                  onValueChange={setFormat}
                  placeholder="Selecione o formato"
                  disabled={isPending}
                >
                  {FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="creative-status">Status</Label>
                <Select
                  value={status}
                  onValueChange={setStatus}
                  placeholder="Ideia (padrão)"
                  disabled={isPending}
                >
                  {CREATIVE_STATUSES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Se o criativo já está pronto, escolha o status certo aqui em vez de arrastar no Kanban depois.
                </p>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="creative-campaign">Campanha</Label>
                <Select
                  value={digitandoCampanha ? CAMPANHA_NOVA : objective}
                  onValueChange={handleCampanhaChange}
                  placeholder={loadingCampaigns ? 'Carregando...' : 'Selecione a campanha'}
                  disabled={isPending || loadingCampaigns}
                >
                  {opcoesCampanha.map((campanha) => (
                    <SelectItem key={campanha} value={campanha}>
                      {campanha}
                    </SelectItem>
                  ))}
                  <SelectItem value={CAMPANHA_NOVA}>Outra campanha…</SelectItem>
                </Select>
                {digitandoCampanha && (
                  <Input
                    id="creative-campaign"
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    placeholder="Nome da nova campanha"
                    disabled={isPending}
                    className="mt-2"
                  />
                )}
              </div>

              <div>
                <Label htmlFor="creative-profile">Perfil</Label>
                <Input
                  id="creative-profile"
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  placeholder="Perfil/avatar do criativo"
                  disabled={isPending}
                />
              </div>

              <div>
                <Label htmlFor="creative-social-network">Rede social</Label>
                <Input
                  id="creative-social-network"
                  value={socialNetwork}
                  onChange={(e) => setSocialNetwork(e.target.value)}
                  placeholder="Ex: Meta, Google, TikTok"
                  disabled={isPending}
                />
              </div>

              <div>
                <Label htmlFor="creative-funnel-stage">Estágio do funil</Label>
                <Input
                  id="creative-funnel-stage"
                  value={funnelStage}
                  onChange={(e) => setFunnelStage(e.target.value)}
                  placeholder="Ex: topo, meio, fundo"
                  disabled={isPending}
                />
              </div>

              <div>
                <Label htmlFor="creative-content-pillar">Pilar de conteúdo</Label>
                <Input
                  id="creative-content-pillar"
                  value={contentPillar}
                  onChange={(e) => setContentPillar(e.target.value)}
                  placeholder="Ex: educação, depoimento"
                  disabled={isPending}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="creative-copy">Copy (texto da postagem)</Label>
                <Textarea
                  id="creative-copy"
                  value={copyText}
                  onChange={(e) => setCopyText(e.target.value)}
                  placeholder="Texto que vai na postagem"
                  disabled={isPending}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  É o texto da postagem — não é o roteiro do vídeo nem a legenda do anúncio.
                </p>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="creative-ad-caption">Legenda do anúncio</Label>
                <Textarea
                  id="creative-ad-caption"
                  value={adCaption}
                  onChange={(e) => setAdCaption(e.target.value)}
                  placeholder="Texto que aparece acima do criativo no anúncio"
                  disabled={isPending}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="creative-observations">Observações</Label>
                <Textarea
                  id="creative-observations"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Notas internas sobre o criativo"
                  disabled={isPending}
                />
              </div>

              <div className="sm:col-span-2">
                <Label>Links</Label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    value={videosFolderUrl}
                    onChange={(e) => setVideosFolderUrl(e.target.value)}
                    placeholder="Pasta de vídeos"
                    disabled={isPending}
                  />
                  <Input
                    value={finalAssetUrl}
                    onChange={(e) => setFinalAssetUrl(e.target.value)}
                    placeholder="Asset final (já editado)"
                    disabled={isPending}
                  />
                  <Input
                    value={rawAssetUrl}
                    onChange={(e) => setRawAssetUrl(e.target.value)}
                    placeholder="Asset bruto (original)"
                    disabled={isPending}
                  />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Salvar alterações' : 'Criar criativo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
