import { loadCache, saveCache } from "@/lib/db";
import { buildNews, REFRESH_HOURS } from "@/lib/news";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const CACHE_KEY = "tech-news";

export async function GET() {
  const cached = await loadCache(CACHE_KEY);
  const ageHours = cached ? (Date.now() - new Date(cached.savedAt).getTime()) / 3600000 : Infinity;

  // Fresh enough: reuse it, no web search.
  if (cached && ageHours < REFRESH_HOURS) {
    return Response.json({ ...cached.value, fromCache: true });
  }

  try {
    const news = await buildNews();
    await saveCache(CACHE_KEY, news);
    return Response.json({ ...news, fromCache: false });
  } catch (err) {
    console.error("News refresh failed:", err);
    // Refresh failed: show the older list rather than an empty page.
    if (cached) return Response.json({ ...cached.value, fromCache: true, stale: true });
    return Response.json({ error: "Could not load the news right now. Please try again later." }, { status: 500 });
  }
}
