const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://qzesffnkqgelmtfblzkr.supabase.co',
    '<SERVICE_ROLE_KEY_REDACTED>'
);

async function checkStatus() {
    console.log('=== VERIFICANDO STATUS DO BACKFILL ===\n');
    
    // 1. Verificar tabela de controle
    console.log('1. Tabela meta_ads_backfill_controle:');
    const { data: controle, error: e1 } = await supabase
        .from('meta_ads_backfill_controle')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log('   Registros:', controle?.length || 0);
    if (controle && controle.length > 0) {
        console.log('   Último:', JSON.stringify(controle[0], null, 2));
    }
    if (e1) console.log('   Error:', e1);
    
    // 2. Verificar tabela de log
    console.log('\n2. Tabela meta_ads_backfill_log:');
    const { data: log, error: e2 } = await supabase
        .from('meta_ads_backfill_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
    console.log('   Registros:', log?.length || 0);
    if (log && log.length > 0) {
        log.forEach(l => console.log(`   - ${l.data}: ${l.status} (${l.registros || 0} registros)`));
    }
    if (e2) console.log('   Error:', e2);
    
    // 3. Verificar insights por data
    console.log('\n3. Insights por data:');
    const { data: insights, error: e3 } = await supabase
        .from('meta_ads_insights')
        .select('fetched_at')
        .order('fetched_at', { ascending: false });
    
    if (insights && insights.length > 0) {
        // Agrupar por data
        const porData = {};
        insights.forEach(i => {
            const data = i.fetched_at?.split('T')[0];
            if (data) porData[data] = (porData[data] || 0) + 1;
        });
        
        Object.entries(porData)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 10)
            .forEach(([data, count]) => console.log(`   - ${data}: ${count} registros`));
    }
    if (e3) console.log('   Error:', e3);
    
    // 4. Verificar se tem dados de 20-24/02
    console.log('\n4. Dados de 20-24/02:');
    const { data: periodo, error: e4 } = await supabase
        .from('meta_ads_insights')
        .select('id')
        .gte('fetched_at', '2026-02-20')
        .lt('fetched_at', '2026-02-25');
    console.log('   Registros no período:', periodo?.length || 0);
    if (e4) console.log('   Error:', e4);
    
    // 5. Total de registros
    const { count } = await supabase
        .from('meta_ads_insights')
        .select('*', { count: 'exact', head: true });
    console.log('\n5. Total de registros na tabela insights:', count);
}

checkStatus();
