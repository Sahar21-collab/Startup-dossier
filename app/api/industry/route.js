import { loadCache, saveCache } from "@/lib/db";
import { buildIndustryList, CACHE_DAYS, INDUSTRIES } from "@/lib/industries";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id") || "";
  const industry = INDUSTRIES.find((i) => i.id === id);
  if (!industry) return Response.json({ error: "Unknown industry." }, { status: 400 });

  const cacheKey = `industry-${id}`;
  const cached = await loadCache(cacheKey);
  const ageDays = cached ? (Date.now() - new Date(cached.savedAt).getTime()) / 86400000 : Infinity;

  if (cached && ageDays < CACHE_DAYS) {
    return Response.json({ ...cached.value, id, label: industry.label, fromCache: true });
  }

  try {
    const list = await buildIndustryList(id);
    await saveCache(cacheKey, list);
    return Response.json({ ...list, id, label: industry.label, fromCache: false });
  } catch (err) {
    console.error("Industry list failed:", err);
    if (cached) return Response.json({ ...cached.value, id, label: industry.label, fromCache: true, stale: true });
    return Response.json({ error: "Could not load this industry right now. Please try again." }, { status: 500 });
  }
}
