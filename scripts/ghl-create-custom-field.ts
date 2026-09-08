// Script para criar campo customizado de contato no GHL
// Uso: deno run --allow-net --allow-env scripts/ghl-create-custom-field.ts
//
// Endpoints da API GHL v2021-04-15 usados:
//   - GET/POST /locations/{locationId}/customFields
//   - GET/POST /locations/{locationId}/customFields/folders

const GHL_API_KEY = Deno.env.get('GHL_API_KEY') || '';
const LOCATION_ID = 'U8FTcw90CB5QELUnbGUu';
const BASE_URL = 'https://services.leadconnectorhq.com';

const HEADERS = {
  'Authorization': `Bearer ${GHL_API_KEY}`,
  'Version': '2021-04-15',
  'Content-Type': 'application/json',
};

const ESTADOS = [
  { label: 'AC', value: 'AC' },
  { label: 'AL', value: 'AL' },
  { label: 'AP', value: 'AP' },
  { label: 'AM', value: 'AM' },
  { label: 'BA', value: 'BA' },
  { label: 'CE', value: 'CE' },
  { label: 'DF', value: 'DF' },
  { label: 'ES', value: 'ES' },
  { label: 'GO', value: 'GO' },
  { label: 'MA', value: 'MA' },
  { label: 'MT', value: 'MT' },
  { label: 'MS', value: 'MS' },
  { label: 'MG', value: 'MG' },
  { label: 'PA', value: 'PA' },
  { label: 'PB', value: 'PB' },
  { label: 'PR', value: 'PR' },
  { label: 'PE', value: 'PE' },
  { label: 'PI', value: 'PI' },
  { label: 'RJ', value: 'RJ' },
  { label: 'RN', value: 'RN' },
  { label: 'RS', value: 'RS' },
  { label: 'RO', value: 'RO' },
  { label: 'RR', value: 'RR' },
  { label: 'SC', value: 'SC' },
  { label: 'SP', value: 'SP' },
  { label: 'SE', value: 'SE' },
  { label: 'TO', value: 'TO' },
];

async function fetchGHL(path: string, method = 'GET', body?: unknown) {
  const url = `${BASE_URL}${path}`;
  const opts: RequestInit = {
    method,
    headers: HEADERS,
  };
  if (body && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    console.error(`❌ Erro HTTP ${res.status} em ${path}:`, data);
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function listFolders(): Promise<any[]> {
  console.log(`📁 Listando pastas de custom fields...`);
  const res = await fetchGHL(`/locations/${LOCATION_ID}/customFields/folders`) as any;
  return Array.isArray(res) ? res : (res.folders || res.data || []);
}

async function createFolder(name: string): Promise<any> {
  console.log(`📁 Criando pasta "${name}"...`);
  return fetchGHL(`/locations/${LOCATION_ID}/customFields/folders`, 'POST', {
    name,
    model: 'contact',
  });
}

async function findOrCreateFolder(name: string): Promise<string> {
  const folders = await listFolders();
  const existing = folders.find((f: any) => f.name === name);
  if (existing) {
    console.log(`✅ Pasta encontrada: ${existing.id}`);
    return existing.id;
  }
  const created = await createFolder(name);
  console.log(`✅ Pasta criada: ${created.id}`);
  return created.id;
}

async function listCustomFields(): Promise<any[]> {
  console.log(`🔍 Listando campos customizados...`);
  const res = await fetchGHL(`/locations/${LOCATION_ID}/customFields`) as any;
  return Array.isArray(res) ? res : (res.customFields || res.data || []);
}

async function createCustomField(folderId: string) {
  const fieldName = 'Qual estado você mora?';
  
  console.log(`🔍 Verificando se campo "${fieldName}" já existe...`);
  const fields = await listCustomFields();
  const existing = fields.find((f: any) => f.name === fieldName);
  if (existing) {
    console.log(`⚠️ Campo já existe: ${existing.id}`);
    return existing;
  }

  console.log(`📝 Criando campo "${fieldName}"...`);
  const body = {
    name: fieldName,
    dataType: 'SINGLE_OPTIONS',
    model: 'contact',
    parentId: folderId,
    picklistOptions: ESTADOS,
    placeholder: 'Selecione seu estado',
  };

  const created = await fetchGHL(`/locations/${LOCATION_ID}/customFields`, 'POST', body) as any;
  console.log(`✅ Campo criado com sucesso!`);
  console.log(`   ID: ${created.id}`);
  console.log(`   Nome: ${created.name}`);
  console.log(`   Tipo: ${created.dataType}`);
  console.log(`   Pasta: ${created.parentId}`);
  console.log(`   Opções: ${ESTADOS.length} estados`);
  return created;
}

// ========== MAIN ==========
if (!GHL_API_KEY) {
  console.error('❌ Variável GHL_API_KEY não encontrada no ambiente.');
  console.error('   Exporte antes de rodar: export GHL_API_KEY="sua_chave_aqui"');
  Deno.exit(1);
}

console.log('🚀 Iniciando criação de campo customizado no GHL...\n');

try {
  const folderId = await findOrCreateFolder('Checkin Evento');
  await createCustomField(folderId);
  console.log('\n🎉 Concluído!');
} catch (err) {
  console.error('\n💥 Falha:', (err as Error).message);
  Deno.exit(1);
}
