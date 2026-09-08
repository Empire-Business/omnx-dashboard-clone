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

  // Step 2: Get ads_catalog data
  const { data: adsData, error: adsError } = await supabase
    .from("ads_catalog")
    .select("utm_term, creative_id, objective_code, public_code, page_code");

  if (adsError) {
    console.error("❌ Erro ao buscar ads_catalog:", adsError.message);
    process.exit(1);
  }

  // Step 3: Get notion_creatives data
  const { data: creatives, error: creativesError } = await supabase
    .from("notion_creatives")
    .select("external_id, name");

  if (creativesError) {
    console.error("❌ Erro ao buscar notion_creatives:", creativesError.message);
    process.exit(1);
  }

  // Step 4: Create lookup maps
  const creativeMap = new Map<string, string>();
  (creatives || []).forEach((c: any) => {
    if (c.external_id && c.name) {
      creativeMap.set(c.external_id, c.name);
    }
  });

  const adMap = new Map<
    string,
    { creative_id?: string; objective_code?: string; creative_name?: string }
  >();
  (adsData || []).forEach((ad: any) => {
    if (ad.utm_term) {
      const creativeName = ad.creative_id ? creativeMap.get(ad.creative_id) : undefined;
      adMap.set(ad.utm_term, {
        creative_id: ad.creative_id,
        objective_code: ad.objective_code,
        creative_name: creativeName,
      });
    }
  });

  // Step 5: Count leads by utm_term
  const adCounts: Record<
    string,
    { count: number; creative_name?: string; objective_code?: string }
  > = {};
  (contacts || []).forEach((row: any) => {
    if (row.utm_term) {
      if (!adCounts[row.utm_term]) {
        const adInfo = adMap.get(row.utm_term) || {};
        adCounts[row.utm_term] = {
          count: 0,
          creative_name: adInfo.creative_name,
          objective_code: adInfo.objective_code,
        };
      }
      adCounts[row.utm_term].count += 1;
    }
  });

  // Step 6: Sort and display
  const sorted = Object.entries(adCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  console.log("🎯 TOP 20 Anúncios com mais leads em Fevereiro/2026:\n");
  console.log("Nº  | Código do Anúncio            | Criativo                     | Leads");
  console.log("----+------------------------------+------------------------------+-------");

  sorted.forEach(([code, info], i) => {
    const creativeName = info.creative_name
      ? info.creative_name.substring(0, 28).padEnd(28)
      : "(sem nome)".padEnd(28);
    const leadCount = info.count.toString().padStart(5);
    console.log(
      `${String(i + 1).padStart(2)}  | ${code.padEnd(28)} | ${creativeName} | ${leadCount}`
    );
  });

  // Step 7: Summary
  const total = Object.values(adCounts).reduce((sum, ad) => sum + ad.count, 0);
  const withCreativeNames = Object.values(adCounts).filter(
    (ad) => ad.creative_name
  ).length;

  console.log("\n────────────────────────────────────────────────────────────────────");
  console.log(`📊 Total de leads com utm_term: ${total}`);
  console.log(`📊 Total de anúncios distintos: ${Object.keys(adCounts).length}`);
  console.log(
    `📊 Anúncios com nome catalogado: ${withCreativeNames}/${Object.keys(adCounts).length}`
  );
}

run();
