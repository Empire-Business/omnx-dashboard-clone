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
  // Check notion_creatives sample
  const { data: creatives, error } = await supabase
    .from("notion_creatives")
    .select("external_id, name, database_type")
    .limit(10);

  if (error) {
    console.error("Erro:", error.message);
    process.exit(1);
  }

  console.log("📋 Sample notion_creatives:\n");
  console.log(JSON.stringify(creatives, null, 2));

  // Check ads_catalog sample
  const { data: ads } = await supabase
    .from("ads_catalog")
    .select("utm_term, creative_id")
    .limit(10);

  console.log("\n\n📋 Sample ads_catalog:\n");
  console.log(JSON.stringify(ads, null, 2));
}

run();
