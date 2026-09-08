-- ============================================================
-- Diagnóstico: Por que Gabriel Campaner e Erik Cabral estão
-- sem closer no sistema?
-- ============================================================
-- Rode este script no SQL Editor do Supabase e envie os resultados

-- 1. Verificar cadastro de Larissa Theophilo em ghl_users
SELECT 
  '=== 1. GHL_USERS: Larissa Theophilo ===' as secao,
  ghl_id,
  nome,
  email,
  papeis,
  array_length(papeis, 1) as qtd_papeis,
  papeis @> ARRAY['closer'] as tem_papel_closer,
  deleted
FROM ghl_users
WHERE nome ILIKE '%Larissa%Theophilo%'
   OR email ILIKE '%larissatheophilo%';

-- 2. Verificar oportunidades de Gabriel Campaner
SELECT 
  '=== 2. OPORTUNIDADES: Gabriel Campaner ===' as secao,
  o.id,
  o.ghl_opportunity_id,
  o.pipeline_name,
  o.status,
  o.vendedor_closer,
  o.sdr_name,
  c.nome as contato_nome,
  c.email as contato_email,
  c.closer_name as contato_closer_name,
  c.owner_name as contato_owner_name
FROM oportunidades o
JOIN contatos c ON c.id = o.contato_id
WHERE c.email = 'gabriel@gcampaner.com.br'
   OR c.ghl_id = 'Z8kIDohMaNWNKXepW8ex'
   OR o.ghl_opportunity_id = '17DfKZe3Dvky7uDo1xMb';

-- 3. Verificar oportunidades de Erik Cabral
SELECT 
  '=== 3. OPORTUNIDADES: Erik Cabral ===' as secao,
  o.id,
  o.ghl_opportunity_id,
  o.pipeline_name,
  o.status,
  o.vendedor_closer,
  o.sdr_name,
  c.nome as contato_nome,
  c.email as contato_email,
  c.closer_name as contato_closer_name,
  c.owner_name as contato_owner_name
FROM oportunidades o
JOIN contatos c ON c.id = o.contato_id
WHERE c.email = 'erik@viagemcomestilo.com.br'
   OR c.ghl_id = 'PoOp3x3bFUM8urtmlU82'
   OR o.ghl_opportunity_id = 'KwsqtgLJWkkDpzmsnlbX';

-- 4. Verificar se há algum webhook recente que sobrescreveu vendedor_closer
SELECT 
  '=== 4. WEBHOOKS RECENTES (opportunities) ===' as secao,
  w.id,
  w.created_at,
  w.payload->>'id' as opportunity_id,
  w.payload->>'contact_id' as contact_id,
  w.payload->'customData'->>'{{opportunity.assignedToUsersName}}' as webhook_vendedor_closer,
  w.payload->'customData'->>'{{ opportunity.assignedToUsersName }}' as webhook_vendedor_closer_2
FROM webhooks_ghl w
WHERE w.payload->>'id' IN ('17DfKZe3Dvky7uDo1xMb', 'KwsqtgLJWkkDpzmsnlbX')
   OR w.payload->>'contact_id' IN ('Z8kIDohMaNWNKXepW8ex', 'PoOp3x3bFUM8urtmlU82')
ORDER BY w.created_at DESC
LIMIT 10;

-- 5. Verificar se o closer está cadastrado com nome diferente (espaços, acentos, etc)
SELECT 
  '=== 5. TODOS OS CLOSERS EM ghl_users ===' as secao,
  nome,
  papeis,
  papeis @> ARRAY['closer'] as tem_papel_closer,
  length(nome) as nome_length,
  replace(nome, ' ', '·') as nome_espacos_visiveis
FROM ghl_users
WHERE deleted = false
ORDER BY nome;

-- 6. Verificar se há oportunidades com vendedor_closer = 'Larissa Theophilo'
-- mas que não aparecem nos relatórios (contagem)
SELECT 
  '=== 6. OPORTUNIDADES COM LARISSA COMO CLOSER ===' as secao,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'won') as fechadas,
  COUNT(*) FILTER (WHERE vendedor_closer IS NULL) as sem_vendedor_closer,
  COUNT(*) FILTER (WHERE vendedor_closer = 'Larissa Theophilo') as com_larissa_exact,
  COUNT(*) FILTER (WHERE vendedor_closer ILIKE '%Larissa%Theophilo%') as com_larissa_fuzzy
FROM oportunidades;

-- 7. Verificar se contatos.closer_name está desatualizado
SELECT 
  '=== 7. CONTATOS: closer_name desatualizado? ===' as secao,
  c.id,
  c.nome,
  c.email,
  c.closer_name,
  c.owner_name,
  (
    SELECT o2.vendedor_closer 
    FROM oportunidades o2 
    WHERE o2.contato_id = c.id 
    ORDER BY o2.updated_at DESC 
    LIMIT 1
  ) as ultimo_vendedor_closer_da_opp
FROM contatos c
WHERE c.email IN ('gabriel@gcampaner.com.br', 'erik@viagemcomestilo.com.br');
