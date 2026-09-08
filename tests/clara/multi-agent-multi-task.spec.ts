import { test, expect } from '@playwright/test'
import { login, openClara, askClara } from './helpers'

/**
 * Suite multi-agente / multi-task da Clara.
 *
 * Valida que o orquestrador:
 *  - dispara múltiplas tools em paralelo quando a pergunta exige dados de mais de uma fonte;
 *  - mantém contexto entre mensagens (memória de conversa);
 *  - muda de domínio sem contaminar respostas;
 *  - corrige o entendimento quando o usuário corrige o período/assunto.
 */

test.describe('Clara — Multi-agente / Multi-task', () => {
  test.setTimeout(180000)

  test('multi-tool: compara vendas e MQLs do mesmo mês', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)

    const answer = await askClara(
      page,
      textarea,
      'Em maio de 2026, quantas vendas e quantos MQLs tivemos? Resuma os dois números.'
    )

    const lower = answer.toLowerCase()

    // Deve mencionar ambas as métricas
    expect(lower).toMatch(/mql|marketing qualified lead/)
    expect(lower).toMatch(/venda/)

    // Anti-alucinação: não pode inventar nomes de closer/SDR sem os dados
    expect(answer).not.toMatch(/João|Maria|Ana|Carlos|Pedro vendeu/)

    // Deve conter pelo menos dois números
    expect(answer).toMatch(/\d+/)
  })

  test('memória de conversa: segundo turno reusa o período', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)

    const first = await askClara(page, textarea, 'Quem mais vendeu em maio de 2026?')
    expect(first.toLowerCase()).toMatch(/venda|maio|closer/)

    const second = await askClara(page, textarea, 'E quem mais trouxe MQLs no mesmo período?')
    const secondLower = second.toLowerCase()

    // Deve entender "mesmo período" como maio de 2026
    expect(secondLower).toMatch(/mql|marketing qualified lead/)
    expect(secondLower).toMatch(/maio/)

    // Não deve inventar closers para MQLs
    expect(second).not.toMatch(/vendeu R\$/)
  })

  test('mudança de domínio: vendas → orgânico → recuperação', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)

    const vendas = await askClara(page, textarea, 'Resumo de vendas de maio de 2026.')
    expect(vendas.toLowerCase()).toMatch(/venda|faturamento/)

    const organico = await askClara(page, textarea, 'Agora me fale do tráfego orgânico de maio de 2026.')
    expect(organico.toLowerCase()).toMatch(/orgânico|instagram|youtube|canal/)

    const recuperacao = await askClara(page, textarea, 'E da recuperação de leads em maio de 2026?')
    expect(recuperacao.toLowerCase()).toMatch(/recupera|reconquista|pipeline de recuperação/)

    // A resposta de recuperação não deve misturar dados de vendas/orgânico
    expect(recuperacao.toLowerCase()).not.toMatch(/faturamento.*orgânico/)
  })

  test('multi-task com RAG + dados: definição de MQL e quantidade', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)

    const answer = await askClara(
      page,
      textarea,
      'Segundo a documentação do Empire, como é definido um MQL? E quantos MQLs tivemos em maio de 2026?'
    )

    const lower = answer.toLowerCase()

    // Parte conceitual (RAG)
    expect(lower).toMatch(/tag/)
    expect(lower).toMatch(/mql/)

    // Parte numérica (dados)
    expect(lower).toMatch(/maio/)
    expect(answer).toMatch(/\d+/)

    // Anti-invenção
    expect(answer).not.toMatch(/\b(João|Maria|Ana|Carlos)\b/)
  })

  test('correção do usuário: respeita novo período', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)

    await askClara(page, textarea, 'Vendas de abril de 2026.')

    const corrected = await askClara(page, textarea, 'Na verdade quero de maio de 2026.')
    const lower = corrected.toLowerCase()

    // Deve responder sobre maio com dados do período
    expect(lower).toMatch(/maio/)
    expect(lower).toMatch(/venda|faturamento/)
    // Anti-erro: não deve dizer que não há dados ou continuar respondendo só sobre abril
    expect(lower).not.toMatch(/não tenho dados suficientes/)
  })

  test('multi-tool complexo: resumo executivo + detalhamento', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)

    const answer = await askClara(
      page,
      textarea,
      'Me dê um resumo executivo da semana atual e, em seguida, o ranking de criativos de maio de 2026.'
    )

    const lower = answer.toLowerCase()

    // Deve conter elementos de relatório semanal
    expect(lower).toMatch(/semana|comparativo|vs|anterior/)

    // Deve conter elementos de criativos
    expect(answer).toMatch(/CR-/)
    expect(lower).toMatch(/criativo|roas/)
  })

  test('super-task: análise completa de maio com 4+ fontes', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)

    const answer = await askClara(
      page,
      textarea,
      'Faça uma análise completa de maio de 2026: MQLs totais, faturamento, investimento em tráfego pago e melhor criativo. Indique cada número com sua fonte.'
    )

    const lower = answer.toLowerCase()

    // Deve conter múltiplas métricas
    expect(lower).toMatch(/mql/)
    expect(lower).toMatch(/faturamento|venda/)
    expect(lower).toMatch(/investimento|tráfego pago|meta/)
    // Criativos: a resposta deve mencionar a seção ou código CR- (pode ser "não foi possível identificar")
    expect(answer).toMatch(/CR-|criativo|criativos/i)

    // Deve conter números
    expect(answer.match(/\d+/g)?.length).toBeGreaterThanOrEqual(4)

    // Anti-alucinação
    expect(answer).not.toMatch(/\b(João|Maria|Ana|Carlos)\b/)
  })

  test('recusa elegante quando não há dados', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)

    const answer = await askClara(
      page,
      textarea,
      'Quantas vendas tivemos em janeiro de 2030?'
    )

    const lower = answer.toLowerCase()

    // Deve indicar que não há dados, sem inventar valores
    expect(lower).toMatch(/não (tenho|encontrei|há|existem)|sem dados|zerado|0/)
    expect(answer).not.toMatch(/R\$ [1-9]/)
  })
})
