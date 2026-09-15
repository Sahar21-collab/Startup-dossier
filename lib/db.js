// Saves and loads past searches in Supabase.
// If the database is not set up yet, the website still works; it just won't remember searches.

import { createClient } from "@supabase/supabase-js";

const TABLE = "startup_searches";

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// "  OpenAI ", "Sam  Altman" -> "openai|sam altman"
export function makeLookupKey(startupName, founderName) {
  const tidy = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return `${tidy(startupName)}|${tidy(founderName)}`;
}

export async function findSaved(lookupKey) {
  const db = getClient();
  if (!db) return null;

  const { data, error } = await db
    .from(TABLE)
    .select("result, created_at")
    .eq("lookup_key", lookupKey)
    .maybeSingle();

  if (error) {
    console.error("Supabase read failed:", error.message);
    return null;
  }
  return data;
}

export async function saveResult(lookupKey, startupName, founderName, result) {
  const db = getClient();
  if (!db) return;

  const { error } = await db.from(TABLE).upsert(
    {
      lookup_key: lookupKey,
      startup_name: startupName,
      founder_name: founderName,
      result,
    },
    { onConflict: "lookup_key" }
  );

  if (error) console.error("Supabase save failed:", error.message);
}
