#!/usr/bin/env node
const GHL_API_KEY = process.env.GHL_API_KEY || '';
const LOCATION_ID = 'U8FTcw90CB5QELUnbGUu';
const BASE_URL = 'https://services.leadconnectorhq.com';

const HEADERS = {
  'Authorization': `Bearer ${GHL_API_KEY}`,
  'Version': '2021-04-15',
  'Content-Type': 'application/json',
};

const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
];

async function fetchGHL(path, method = 'GET', body) {
  const url = `${BASE_URL}${path}`;
  const opts = { method, headers: HEADERS };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    console.error(`❌ Erro HTTP ${res.status} em ${path}:`, data);
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function listCustomFields() {
  console.log(`🔍 Listando campos customizados...`);
  const res = await fetchGHL(`/locations/${LOCATION_ID}/customFields`);
  return Array.isArray(res) ? res : (res.customFields || res.data || []);
}

async function createCustomField() {
  const fieldName = 'Qual estado você mora?';
  
  console.log(`🔍 Verificando se campo "${fieldName}" já existe...`);
  const fields = await listCustomFields();
  const existing = fields.find((f) => f.name === fieldName);
  if (existing) {
    console.log(`⚠️ Campo já existe: ${existing.id}`);
    return { created: false, field: existing };
  }

  console.log(`📝 Criando campo "${fieldName}"...`);
  const body = {
    name: fieldName,
    dataType: 'SINGLE_OPTIONS',
    model: 'contact',
    options: ESTADOS,
    placeholder: 'Selecione seu estado',
  };

  const created = await fetchGHL(`/locations/${LOCATION_ID}/customFields`, 'POST', body);
  console.log(`✅ Campo criado com sucesso!`);
  console.log(`   ID: ${created.id}`);
  console.log(`   Nome: ${created.name}`);
  console.log(`   Tipo: ${created.dataType}`);
  console.log(`   Opções: ${ESTADOS.length} estados`);
  return { created: true, field: created };
}

if (!GHL_API_KEY) {
  console.error('❌ GHL_API_KEY não encontrada');
  process.exit(1);
}

console.log('🚀 Iniciando criação de campo customizado no GHL...\n');

try {
  await createCustomField();
  console.log('\n🎉 Concluído!');
} catch (err) {
  console.error('\n💥 Falha:', err.message);
  process.exit(1);
}
