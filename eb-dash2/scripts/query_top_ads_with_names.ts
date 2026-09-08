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

  // Step 2: Get ads_catalog with creative names
  const { data: adsData, error: adsError } = await supabase
    .from("ads_catalog")
    .select(
      `
      utm_term,
      objective_code,
      public_code,
      page_code,
      creative_id,
      notion_creatives(
        external_id,
        name
      )
    `
    );

  if (adsError) {
    console.error("❌ Erro ao buscar ads_catalog:", adsError.message);
    process.exit(1);
  }

  // Step 3: Create a lookup map from utm_term to full ad info
  const adMap = new Map<
    string,
    {
      utm_term: string;
      creative_name?: string;
      objective_code?: string;
      public_code?: string;
    }
  >();

  (adsData || []).forEach((ad: any) => {
    if (ad.utm_term) {
      adMap.set(ad.utm_term, {
        utm_term: ad.utm_term,
        creative_name: ad.notion_creatives?.name,
        objective_code: ad.objective_code,
        public_code: ad.public_code,
      });
    }
  });

  // Step 4: Count leads by utm_term
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

  // Step 5: Sort and display
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

  // Step 6: Summary
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
