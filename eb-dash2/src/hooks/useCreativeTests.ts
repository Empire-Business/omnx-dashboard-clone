import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { toast } from 'sonner'
import type { NotionCreative, CreativeTest, CreativeTestCriteria } from '@/types/creatives'

export type { CreativeTest, CreativeTestCriteria }

export type TestDecision = 'approved' | 'rejected' | 'scale' | 'kill'

export interface StartTestInput {
  creativeId: string
  criteriaId?: string | null
  budgetAllocated?: number | null
}

export interface DecideTestInput {
  testId: string
  creativeId: string
  decision: TestDecision
  reason: string
}

// ─── Queries ───────────────────────────────────────────────────

export function useCreativeTestCriteria() {
  return useQuery({
    queryKey: ['creative-tests', 'criteria'],
    queryFn: async () => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { data, error } = await supabase
        .from('creative_test_criteria')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle()

      if (error) throw error
      return data as CreativeTestCriteria | null
    },
  })
}

export function useCreativeTests(status?: 'em_andamento' | 'concluido' | 'cancelado') {
  return useQuery({
    queryKey: ['creative-tests', 'list', status ?? 'all'],
    queryFn: async () => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      let query = supabase
        .from('creative_tests')
        .select('*')
        .eq('workspace_id', workspaceId)

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as CreativeTest[]
    },
  })
}

// Status que significam "o criativo terminou a produção e pode ser testado".
//
// `pronto` era o único aceito antes, e isso quebrava o fluxo principal da aba
// (BUG-01 da reunião de 2026-08-28): o Kanban não tem coluna "Pronto" no caminho
// que o time usa — arrastar o card até o fim grava `status = 'aprovado'`, que a
// fila descartava. O usuário levava o criativo até o fim, marcava "Testado",
// preenchia a data de início, e a aba continuava dizendo "Fila vazia".
//
// `aprovado` e `pronto` são os dois estados de "produção concluída" no vocabulário
// de `CreativeStatus`; ambos entram. Os demais (ideia/roteiro/produzindo/revisao/
// ajustes) são trabalho em andamento, e reprovado/arquivado/escalar são fim de linha.
const READY_FOR_TEST_STATUSES = ['aprovado', 'pronto'] as const

export function useCreativeTestQueue() {
  return useQuery({
    queryKey: ['creative-tests', 'queue'],
    queryFn: async () => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { data, error } = await supabase
        .from('notion_creatives')
        .select('*')
        .eq('workspace_id', workspaceId)
        .or(`test_status.eq.em_teste,status.in.(${READY_FOR_TEST_STATUSES.join(',')})`)
        .order('updated_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as NotionCreative[]
    },
  })
}

export { READY_FOR_TEST_STATUSES }

/**
 * Filtra a fila exibida na aba Testes a partir do que veio do banco.
 *
 * Extraída da tela para poder ser testada sem montar componente — é a regra que
 * decide se um criativo aparece como "pronto para iniciar teste", e ela já
 * quebrou duas vezes (ver `test/creative-test-queue.test.ts`).
 *
 * Duas exclusões, por motivos diferentes:
 *  - `test_status === 'testado'`: o criativo já teve veredito. Como
 *    `useDecideCreativeTest` grava `status = 'aprovado'` na decisão "Aprovar", e
 *    `aprovado` é um dos status que entram na fila, sem isso todo criativo
 *    aprovado voltaria para o começo eternamente.
 *  - teste em andamento: esse aparece no bloco "Testes em andamento", não na fila.
 */
export function selectReadyQueue<T extends { id: string; test_status: string | null }>(
  queue: T[],
  activeTests: { creative_id: string }[],
): T[] {
  const activeCreativeIds = new Set(activeTests.map((t) => t.creative_id))
  return queue.filter((c) => c.test_status !== 'testado' && !activeCreativeIds.has(c.id))
}

// ─── Mutations ─────────────────────────────────────────────────

export function useCreateCreativeTest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ creativeId, criteriaId, budgetAllocated }: StartTestInput) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const today = new Date().toISOString().split('T')[0]

      const { data: userData } = await supabase.auth.getUser()
      const performedBy = userData.user?.id ?? null

      const { data: testData, error: testError } = await supabase
        .from('creative_tests')
        .insert({
          workspace_id: workspaceId,
          creative_id: creativeId,
          status: 'em_andamento',
          started_at: today,
          criteria_id: criteriaId ?? null,
          budget_allocated: budgetAllocated ?? null,
        })
        .select('id')
        .single()

      if (testError) throw testError
      if (!testData?.id) throw new Error('Teste não foi criado')

      const { error: creativeError } = await supabase
        .from('notion_creatives')
        .update({
          status: 'em_teste',
          test_status: 'em_teste',
          test_started_at: today,
          updated_at: new Date().toISOString(),
        })
        .eq('id', creativeId)
        .eq('workspace_id', workspaceId)

      if (creativeError) throw creativeError

      const { error: historyError } = await supabase.from('creative_test_history').insert({
        workspace_id: workspaceId,
        creative_id: creativeId,
        test_id: testData.id,
        event_type: 'teste_iniciado',
        event_data: {
          criteria_id: criteriaId ?? null,
          budget_allocated: budgetAllocated ?? null,
          started_at: today,
        },
        performed_by: performedBy,
      })

      if (historyError) throw historyError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-tests'] })
      queryClient.invalidateQueries({ queryKey: ['criativos', 'list'] })
      toast.success('Teste iniciado')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar teste')
    },
  })
}

function mapDecisionToTestResult(decision: TestDecision): string {
  switch (decision) {
    case 'approved':
    case 'scale':
      return 'aprovado'
    case 'rejected':
      return 'reprovado'
    case 'kill':
      return 'cancelado'
    default:
      return 'pendente'
  }
}

function mapDecisionToCreativeTestResult(decision: TestDecision): string {
  switch (decision) {
    case 'approved':
    case 'scale':
      return 'aprovado'
    case 'rejected':
    case 'kill':
      return 'reprovado'
    default:
      return 'pendente'
  }
}

function mapDecisionToHistoryEvent(decision: TestDecision): string {
  switch (decision) {
    case 'approved':
    case 'scale':
      return 'aprovado'
    case 'rejected':
    case 'kill':
      return 'reprovado'
    default:
      return 'retestar'
  }
}

function mapDecisionToCreativeStatus(decision: TestDecision): string {
  switch (decision) {
    case 'approved':
      return 'aprovado'
    case 'scale':
      return 'escalar'
    case 'rejected':
      return 'reprovado'
    case 'kill':
      return 'arquivado'
    default:
      return 'testado'
  }
}

export function useDecideCreativeTest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ testId, creativeId, decision, reason }: DecideTestInput) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { data: userData } = await supabase.auth.getUser()
      const performedBy = userData.user?.id ?? null
      const now = new Date().toISOString()
      const today = now.split('T')[0]
      const testStatus = decision === 'kill' ? 'cancelado' : 'concluido'
      const testResult = mapDecisionToTestResult(decision)
      const creativeTestResult = mapDecisionToCreativeTestResult(decision)
      const historyEvent = mapDecisionToHistoryEvent(decision)
      const creativeStatus = mapDecisionToCreativeStatus(decision)
      const aprovado = decision === 'approved' || decision === 'scale' ? true : decision === 'rejected' || decision === 'kill' ? false : null

      const { error: testError } = await supabase
        .from('creative_tests')
        .update({
          status: testStatus,
          result: testResult,
          result_reason: reason,
          ended_at: today,
          decided_at: now,
          updated_at: now,
        })
        .eq('id', testId)
        .eq('workspace_id', workspaceId)

      if (testError) throw testError

      const { error: creativeError } = await supabase
        .from('notion_creatives')
        .update({
          status: creativeStatus,
          test_status: 'testado',
          test_result: creativeTestResult,
          test_ended_at: today,
          aprovado,
          data_avaliacao: now,
          updated_at: now,
        })
        .eq('id', creativeId)
        .eq('workspace_id', workspaceId)

      if (creativeError) throw creativeError

      const { error: historyError } = await supabase.from('creative_test_history').insert({
        workspace_id: workspaceId,
        creative_id: creativeId,
        test_id: testId,
        event_type: historyEvent,
        event_data: {
          decision,
          reason,
          test_status: testStatus,
          test_result: testResult,
          decided_at: now,
        },
        performed_by: performedBy,
      })

      if (historyError) throw historyError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-tests'] })
      queryClient.invalidateQueries({ queryKey: ['criativos', 'list'] })
      toast.success('Decisão registrada')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao decidir teste')
    },
  })
}
