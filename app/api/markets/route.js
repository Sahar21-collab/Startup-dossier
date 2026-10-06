import { loadCache, saveCache } from "@/lib/db";
import { buildMarkets, REFRESH_HOURS } from "@/lib/markets";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CACHE_KEY = "markets";

export async function GET() {
  const cached = await loadCache(CACHE_KEY);
  const ageHours = cached ? (Date.now() - new Date(cached.savedAt).getTime()) / 3600000 : Infinity;

  if (cached && ageHours < REFRESH_HOURS) {
    return Response.json({ ...cached.value, fromCache: true });
  }

  try {
    const markets = await buildMarkets();
    await saveCache(CACHE_KEY, markets);
    return Response.json({ ...markets, fromCache: false });
  } catch (err) {
    console.error("Markets refresh failed:", err);
    if (cached) return Response.json({ ...cached.value, fromCache: true, stale: true });
    return Response.json({ error: "Could not load prices right now. Please try again later." }, { status: 500 });
  }
}
