// Script: cria oportunidades no pipeline Cami para contatos com a tag [cp] evento-growth-mai-26-cami
// e atualiza utm_source=porg-8 e utm_campaign=41 nesses contatos.

const GHL_API_KEY = process.env.GHL_API_KEY;
if (!GHL_API_KEY) {
  console.error('Configure a variável de ambiente GHL_API_KEY antes de executar este script.');
  process.exit(1);
}
const LOCATION_ID = 'U8FTcw90CB5QELUnbGUu';
const BASE_URL = 'https://services.leadconnectorhq.com';

const CAMI_PIPELINE_ID = 'H7Nz08hgySOJ9upSYSPL';
const LEADS_RECEBIDOS_STAGE_ID = '144bb82a-e3aa-4eac-bdeb-302f665f08bd';
const LEADS_RECEBIDOS_STAGE_NAME = 'Leads Recebidos';

const TARGET_TAG = '[cp] evento-growth-mai-26-cami';
const UTM_SOURCE_VALUE = 'porg-8';
const UTM_CAMPAIGN_VALUE = '41';

// IDs dos custom fields no location
const FIELD_UTM_SOURCE   = 'BeZlZgTZedSXh7WOMb0W';
const FIELD_UTM_CAMPAIGN = 's49ocZH0HpfSmfGVKGeI';

const HEADERS = {
  'Authorization': `Bearer ${GHL_API_KEY}`,
  'Version': '2021-04-15',
  'Content-Type': 'application/json',
};

// Rate limiting respeitoso: ~6 req/s
const DELAY_MS = 170;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ghlGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function ghlPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function ghlPut(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Busca todos os contatos com a tag especificada via POST /contacts/search
async function getContactsByTag(tag) {
  console.log(`\n🔍 Buscando contatos com tag "${tag}"...`);
  const contacts = [];
  let page = 1;
  const pageLimit = 100;

  while (true) {
    const data = await ghlPost('/contacts/search', {
      locationId: LOCATION_ID,
      filters: [{ field: 'tags', operator: 'contains', value: tag }],
      pageLimit,
      page,
    });
    const batch = data.contacts || [];
    contacts.push(...batch);
    console.log(`   Página ${page}: ${batch.length} contatos (total: ${contacts.length})`);
    if (batch.length < pageLimit) break;
    page++;
    await sleep(DELAY_MS);
  }

  console.log(`✅ Total encontrado: ${contacts.length} contatos`);
  return contacts;
}

// Cria uma oportunidade no estágio "Leads Recebidos" do pipeline Cami
async function createOpportunity(contact) {
  const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
    || contact.email
    || contact.id;

  const body = {
    pipelineId:      CAMI_PIPELINE_ID,
    locationId:      LOCATION_ID,
    name,
    pipelineStageId: LEADS_RECEBIDOS_STAGE_ID,
    status:          'open',
    contactId:       contact.id,
  };
  const data = await ghlPost('/opportunities/', body);
  return data.opportunity || data;
}

// Atualiza utm_source e utm_campaign nos custom fields do contato
async function updateContactUTM(contactId) {
  const body = {
    customFields: [
      { id: FIELD_UTM_SOURCE,   field_value: UTM_SOURCE_VALUE },
      { id: FIELD_UTM_CAMPAIGN, field_value: UTM_CAMPAIGN_VALUE },
    ],
  };
  const data = await ghlPut(`/contacts/${contactId}`, body);
  return data.contact || data;
}

async function main() {
  console.log('🚀 Script: Cami Evento Growth Mai-26');
  console.log(`   Tag alvo:     ${TARGET_TAG}`);
  console.log(`   Pipeline:     Cami (${CAMI_PIPELINE_ID})`);
  console.log(`   Estágio:      ${LEADS_RECEBIDOS_STAGE_NAME}`);
  console.log(`   utm_source:   ${UTM_SOURCE_VALUE}`);
  console.log(`   utm_campaign: ${UTM_CAMPAIGN_VALUE}`);

  // 1. Buscar contatos com a tag
  const contacts = await getContactsByTag(TARGET_TAG);

  if (contacts.length === 0) {
    console.log('\n⚠️  Nenhum contato encontrado. Encerrando.');
    return;
  }

  // 2. Para cada contato: criar oportunidade + atualizar UTMs
  console.log(`\n⚙️  Processando ${contacts.length} contatos...`);
  console.log('');

  const results = { oppCreated: 0, utmUpdated: 0, errors: [] };

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
      || contact.email || contact.id;
    const label = `[${String(i + 1).padStart(2, '0')}/${contacts.length}]`;

    // Criar oportunidade
    try {
      await createOpportunity(contact);
      results.oppCreated++;
      await sleep(DELAY_MS);
    } catch (err) {
      const msg = `Oportunidade: ${err.message.slice(0, 120)}`;
      results.errors.push({ contact: name, error: msg });
      console.log(`${label} ❌ ${name} — ${msg}`);
      await sleep(DELAY_MS);
      continue;
    }

    // Atualizar UTMs
    try {
      await updateContactUTM(contact.id);
      results.utmUpdated++;
      await sleep(DELAY_MS);
    } catch (err) {
      const msg = `UTM update: ${err.message.slice(0, 120)}`;
      results.errors.push({ contact: name, error: msg });
      console.log(`${label} ⚠️  ${name} — opp criada mas UTM falhou: ${msg}`);
      await sleep(DELAY_MS);
      continue;
    }

    console.log(`${label} ✅ ${name}`);
  }

  // 3. Relatório final
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RELATÓRIO FINAL');
  console.log('═'.repeat(60));
  console.log(`✅ Oportunidades criadas:  ${results.oppCreated} / ${contacts.length}`);
  console.log(`✅ UTMs atualizados:       ${results.utmUpdated} / ${contacts.length}`);

  if (results.errors.length > 0) {
    console.log(`\n❌ Erros (${results.errors.length}):`);
    for (const e of results.errors) {
      console.log(`   • ${e.contact}: ${e.error}`);
    }
  }

  console.log('\n✅ Concluído!');
}

main().catch((err) => {
  console.error('\n💥 Erro fatal:', err.message);
  process.exit(1);
});
