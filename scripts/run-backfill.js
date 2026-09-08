// Script para executar backfill de dados Meta Ads
// Uso: node scripts/run-backfill.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qzesffnkqgelmtfblzkr.supabase.co';
const SUPABASE_SERVICE_KEY = '<SERVICE_ROLE_KEY_REDACTED>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runBackfill() {
    console.log('========================================');
    console.log('🚀 Iniciando backfill Meta Ads');
    console.log('========================================');
    
    // Datas para recuperar (20/02 a 24/02)
    const dataInicio = '2026-02-20';
    const dataFim = '2026-02-24';
    
    console.log(`📅 Período: ${dataInicio} até ${dataFim}`);
    
    try {
        // Chamar a função SQL que faz o backfill
        const { data, error } = await supabase.rpc('backfill_meta_ads_job', {
            p_data_inicio: dataInicio,
            p_data_fim: dataFim
        });
        
        if (error) {
            console.error('❌ Erro ao executar backfill:', error);
            return;
        }
        
        console.log('✅ Backfill iniciado:', data);
        
        // Aguardar um pouco e verificar status
        console.log('\n⏳ Aguardando processamento...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Verificar status
        const { data: status, error: statusError } = await supabase
            .rpc('verificar_status_backfill');
        
        if (statusError) {
            console.error('Erro ao verificar status:', statusError);
        } else {
            console.log('\n📊 Status do backfill:');
            console.table(status);
        }
        
    } catch (err) {
        console.error('❌ Erro:', err);
    }
}

runBackfill();
