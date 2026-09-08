import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf-8");
const env: Record<string, string> = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const supabase = createClient(
  env["VITE_SUPABASE_URL"] || "",
  env["VITE_SUPABASE_ANON_KEY"] || ""
);

// Extract creative ID from utm_term (ex: "M1_O1_P29_CR-248_PG12" → "CR-248")
function extractCreativeId(utm_term: string): string | null {
  const match = utm_term.match(/CR-(\d+)/);
  return match ? `CR-${match[1]}` : null;
}

async function run() {
  console.log("⏳ Buscando dados de fevereiro/26 com nomes de anúncios...\n");

  // Step 1: Get all contacts with utm_term from February
  const { data: contacts, error: contactsError } = await supabase
    .from("contatos")
    .select("utm_term")
    .not("utm_term", "is", null)
    .gte("date_created", "2026-02-01T00:00:00-03:00")
    .lte("date_created", "2026-02-28T23:59:59-03:00")
    .limit(10000);

  if (contactsError) {
    console.error("❌ Erro ao buscar contatos:", contactsError.message);
    process.exit(1);
  }

  // Step 2: Get notion_creatives data
  const { data: creatives, error: creativesError } = await supabase
    .from("notion_creatives")
    .select("external_id, name, database_type")
    .eq("database_type", "paid");

  if (creativesError) {
    console.error("❌ Erro ao buscar notion_creatives:", creativesError.message);
    process.exit(1);
  }

  // Step 3: Create creative lookup map
  const creativeMap = new Map<string, string>();
  (creatives || []).forEach((c: any) => {
    if (c.external_id && c.name) {
      creativeMap.set(c.external_id, c.name);
    }
  });

  // Step 4: Count leads by utm_term + extract creative names
  const adCounts: Record<
    string,
    { count: number; creative_name?: string; creative_id?: string }
  > = {};
  (contacts || []).forEach((row: any) => {
    if (row.utm_term) {
      if (!adCounts[row.utm_term]) {
        const creativeId = extractCreativeId(row.utm_term);
        const creativeName = creativeId ? creativeMap.get(creativeId) : undefined;
        adCounts[row.utm_term] = {
          count: 0,
          creative_id: creativeId || undefined,
          creative_name: creativeName,
        };
      }
      adCounts[row.utm_term].count += 1;
    }
  });

  // Step 5: Sort and display
  const sorted = Object.entries(adCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  console.log("🎯 TOP 20 Anúncios com mais leads em Fevereiro/2026:\n");
  console.log("Nº  | Código do Anúncio            | Criativo                             | Leads");
  console.log("----+------------------------------+-------------------------------------+-------");

  sorted.forEach(([code, info], i) => {
    const creativeName = info.creative_name
      ? info.creative_name.substring(0, 36).padEnd(36)
      : "(sem nome catalogado)".padEnd(36);
    const leadCount = info.count.toString().padStart(5);
    console.log(
      `${String(i + 1).padStart(2)}  | ${code.padEnd(28)} | ${creativeName} | ${leadCount}`
    );
  });

  // Step 6: Summary
  const total = Object.values(adCounts).reduce((sum, ad) => sum + ad.count, 0);
  const withCreativeNames = Object.values(adCounts).filter(
    (ad) => ad.creative_name
  ).length;

  console.log(
    "────+------------------------------+-------------------------------------+-------"
  );
  console.log(`\n📊 Total de leads com utm_term: ${total}`);
  console.log(`📊 Total de anúncios distintos: ${Object.keys(adCounts).length}`);
  console.log(
    `📊 Anúncios com nome catalogado: ${withCreativeNames}/${Object.keys(adCounts).length}`
  );

  // List missing creative IDs (for catalog audit)
  const missingCreatives = [...new Set(
    Object.values(adCounts)
      .filter(ad => !ad.creative_name && ad.creative_id)
      .map(ad => ad.creative_id)
  )] as string[];

  if (missingCreatives.length > 0) {
    console.log(`\n⚠️  Criativos não encontrados em notion_creatives:`);
    missingCreatives.slice(0, 10).forEach(cid => {
      console.log(`   - ${cid}`);
    });
    if (missingCreatives.length > 10) {
      console.log(`   ... e ${missingCreatives.length - 10} mais`);
    }
  }
}

run();
