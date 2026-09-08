-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DEMO — 80. Resultado financeiro (perfil "forte e crível")
-- ═══════════════════════════════════════════════════════════════════════════
-- Rode DEPOIS de 10-crm-core.sql e 20-meta-ads.sql.
--
-- POR QUE ESTE ARQUIVO EXISTE
-- O seed original gerava ticket ~R$ 13.000, 80 vendas e entrada média de 46%
-- do faturado. Contra um investimento de ~R$ 695k/ano isso produzia:
--   · ROAS Caixa ABAIXO de 1x (a tela literalmente dizia que saiu mais
--     dinheiro do que entrou)
--   · meses com ROI negativo (Ago/25 −71%, Mar/26 −12%)
-- Ou seja: o tenant de demonstração demonstrava um negócio ruim.
--
-- Este script recalibra o resultado SEM tocar em investimento (o spend é o que
-- produz o CPL/CPMQL bonitos) — ele mexe em ticket, volume de vendas e mix de
-- pagamento. Alvo: ROAS ~3,1x · ROI ~+205% · ROAS Caixa ~2,6x · todo mês
-- positivo, com curva crescente ao longo do ano.
--
-- É IDEMPOTENTE: pode rodar quantas vezes quiser. Não depende da data de hoje.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Escada de produtos ─────────────────────────────────────────────────
-- Substitui o valor plano de ~R$ 13.000 por três produtos, com mix
-- 50% / 32% / 18% → ticket médio ≈ R$ 16.600.
--   Acelerador Anual    R$ 12.900
--   Acelerador Premium  R$ 17.900
--   Mentoria 1:1        R$ 24.900
-- A pipeline "Recuperação" fica 20% mais barata (é base fria reativada).
update oportunidades o
set valor = round(
      (case when (((hashtext('pv2'||o.id::text) % 100)+100)%100) < 50 then 12900
            when (((hashtext('pv2'||o.id::text) % 100)+100)%100) < 82 then 17900
            else 24900 end)
      * (case when o.pipeline_name = 'Recuperação' then 0.80 else 1.0 end)
    , 2)
where o.workspace_id = 'd0000000-0000-4000-8000-000000000001';

-- ─── 2. Volume de vendas ───────────────────────────────────────────────────
-- Converte oportunidades 'lost' de Vendas SQL em 'won' até bater a curva
-- mensal alvo (crescente: 6 → 16 vendas/mês). Sem isso a conversão
-- lead→venda fica em 0,9%, que é baixa demais para uma demonstração.
--
-- A quantidade abaixo é o INCREMENTO sobre o que o seed base já produz.
-- Ajuste aqui se mudar o volume de leads em 10-crm-core.sql.
with alvo(mes, qtd) as (values
  ('2025-08',5),('2025-10',2),('2025-11',3),('2025-12',2),('2026-01',5),
  ('2026-02',4),('2026-03',8),('2026-04',2),('2026-05',7),('2026-06',9),
  ('2026-07',6),('2026-08',3)
),
cand as (
  select o.id,
         to_char(coalesce(o.data_realizacao_vendas, o.data_perdido, o.data_lead_recebido::date),'YYYY-MM') mes,
         coalesce(o.data_realizacao_vendas, o.data_perdido, o.data_lead_recebido::date) base,
         row_number() over (
           partition by to_char(coalesce(o.data_realizacao_vendas, o.data_perdido, o.data_lead_recebido::date),'YYYY-MM')
           order by hashtext('conv'||o.id::text)
         ) rn
  from oportunidades o
  where o.workspace_id = 'd0000000-0000-4000-8000-000000000001'
    and o.status = 'lost' and o.pipeline_name = 'Vendas SQL'
    and o.vendedor_closer is not null
),
escolhidos as (
  select c.id, c.base, (((hashtext('df'||c.id::text) % 7)+7)%7) offset_dias
  from cand c join alvo a on a.mes = c.mes and c.rn <= a.qtd
)
update oportunidades o
set status = 'won',
    data_fechado = least(
      greatest(e.base + 1, e.base + e.offset_dias),
      (date_trunc('month', e.base) + interval '1 month - 1 day')::date
    ),
    data_negociacao = coalesce(o.data_negociacao, e.base),
    data_perdido = null,
    data_perdido_vendas = null,
    data_no_show_vendas = null,
    lost_reason = null
from escolhidos e
where o.id = e.id;

-- ─── 3. Vendas e mix de pagamento ──────────────────────────────────────────
-- ⚠️ `valor_faturado` é coluna GERADA (entrada + parcelas × valor_parcela):
--    não pode ser inserida diretamente — controla-se pelos três componentes.
--
-- Mix desenhado para caixa ≈ 58% do faturado (o seed antigo entregava 46%,
-- o que fazia o ROAS Caixa afundar):
--   35% PIX à vista        → entrada 100%
--   40% cartão 10x         → entrada  40%
--   25% boleto parcelado   → entrada  30%
delete from vendas_fechamento
where workspace_id = 'd0000000-0000-4000-8000-000000000001';

with o as (
  select o.id, o.contato_id, o.nome_contato, o.valor, o.data_fechado, o.vendedor_closer,
         coalesce((c.custom_fields->>'demo_i')::int, abs(hashtext(o.id::text)) % 90000) i,
         (((hashtext('pg2'||o.id::text) % 100)+100)%100) r_pg,
         (((hashtext('uf2'||o.id::text) % 12)+12)%12) r_uf
  from oportunidades o join contatos c on c.id = o.contato_id
  where o.workspace_id = 'd0000000-0000-4000-8000-000000000001'
    and o.status = 'won' and o.data_fechado is not null
    and o.vendedor_closer is not null
),
v as (
  select o.*,
    case when r_pg < 35 then 0 when r_pg < 75 then 10 else 12 end parcelas,
    round(valor * (case when r_pg < 35 then 1.0 when r_pg < 75 then 0.40 else 0.30 end), 2) entrada
  from o
)
insert into vendas_fechamento (
  oportunidade_id, contato_id, nome_contratante, cpf_cnpj_contratante,
  municipio, estado_uf, produto_vendido, forma_pagamento,
  valor_entrada, numero_parcelas, valor_parcela,
  data_pagamento_entrada, data_da_assinatura_do_contrato,
  op_link_do_contrato_assinado, link_gravacao_call_vendas,
  pagamentos, comprovantes, closer_nome, closer_email, origem, workspace_id
)
select
  id, contato_id, nome_contato,
  lpad(((i*37)%999)::text,3,'0')||'.'||lpad(((i*73)%999)::text,3,'0')||'.'||lpad(((i*17)%999)::text,3,'0')||'-'||lpad(((i*11)%99)::text,2,'0'),
  (array['São Paulo','Rio de Janeiro','Belo Horizonte','Curitiba','Porto Alegre','Salvador','Recife','Fortaleza','Goiânia','Florianópolis','Campinas','Brasília'])[1 + r_uf],
  (array['SP','RJ','MG','PR','RS','BA','PE','CE','GO','SC','SP','DF'])[1 + r_uf],
  case when valor in (12900, 10320) then 'Acelerador Acme — Anual'
       when valor in (17900, 14320) then 'Acelerador Acme — Premium'
       else 'Mentoria Acme 1:1' end,
  case when parcelas = 0 then 'PIX à vista'
       when parcelas = 10 then 'Cartão de crédito'
       else 'Boleto parcelado' end,
  entrada, parcelas,
  case when parcelas = 0 then 0 else round((valor - entrada) / parcelas, 2) end,
  (data_fechado + make_interval(hours => 10 + (r_pg % 8)))::timestamp at time zone 'America/Sao_Paulo',
  data_fechado,
  'https://demo.acme.test/contratos/'||lpad(i::text,6,'0')||'.pdf',
  'https://demo.acme.test/calls/'||lpad(i::text,6,'0'),
  jsonb_build_array(jsonb_build_object('data', data_fechado::text, 'valor', entrada, 'sinal', true))
    || case when parcelas = 0 then '[]'::jsonb
       else (select jsonb_agg(jsonb_build_object(
              'data', (data_fechado + (p * interval '1 month'))::date::text,
              'valor', round((valor - entrada)/parcelas, 2), 'sinal', false))
             from generate_series(1, parcelas) p) end,
  jsonb_build_array(jsonb_build_object('url','https://demo.acme.test/comprovantes/'||lpad(i::text,6,'0')||'.jpg','tipo','entrada')),
  vendedor_closer,
  lower(translate(split_part(vendedor_closer,' ',1),'áàâãéêíóôõúüç','aaaaeeiooouuc'))||'@acmedemo.test',
  'ghl', 'd0000000-0000-4000-8000-000000000001'
from v;

-- ─── 4. Conferência ────────────────────────────────────────────────────────
-- Esperado: todo mês com roi_pct > 0 e roas_caixa > 1,00.
-- with meta as (
--   select to_char(date,'YYYY-MM') mes, sum(spend) spend
--   from meta_ads_insights where workspace_id='d0000000-0000-4000-8000-000000000001' group by 1),
-- org as (select year_month mes, sum(amount) org from organic_investments
--         where workspace_id='d0000000-0000-4000-8000-000000000001' group by 1),
-- ven as (select to_char(data_pagamento_entrada,'YYYY-MM') mes, count(*) vendas,
--                sum(valor_faturado) fat, sum(valor_entrada) caixa
--         from vendas_fechamento where workspace_id='d0000000-0000-4000-8000-000000000001' group by 1)
-- select m.mes, round(m.spend+coalesce(o.org,0))::int investido, v.vendas,
--        round(v.fat)::int faturado,
--        round((v.fat/(m.spend+coalesce(o.org,0)))::numeric,2) roas,
--        round((100*(v.fat-(m.spend+coalesce(o.org,0)))/(m.spend+coalesce(o.org,0)))::numeric,0) roi_pct,
--        round((v.caixa/m.spend)::numeric,2) roas_caixa
-- from meta m left join org o on o.mes=m.mes left join ven v on v.mes=m.mes order by m.mes;
