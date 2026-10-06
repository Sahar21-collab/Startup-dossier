import { loadCache, saveCache } from "@/lib/db";
import { buildHistory, buildQuotes, HISTORY_HOURS, QUOTE_MINUTES } from "@/lib/markets";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const HISTORY_KEY = "markets-history";
const QUOTES_KEY = "markets-quotes";

async function freshHistory() {
  const cached = await loadCache(HISTORY_KEY);
  const ageHours = cached ? (Date.now() - new Date(cached.savedAt).getTime()) / 3600000 : Infinity;
  if (cached && ageHours < HISTORY_HOURS) return { ...cached.value, fromCache: true };

  try {
    const history = await buildHistory();
    await saveCache(HISTORY_KEY, history);
    return { ...history, fromCache: false };
  } catch (err) {
    console.error("History refresh failed:", err);
    if (cached) return { ...cached.value, fromCache: true, stale: true };
    throw err;
  }
}

async function freshQuotes() {
  const cached = await loadCache(QUOTES_KEY);
  const ageMinutes = cached ? (Date.now() - new Date(cached.savedAt).getTime()) / 60000 : Infinity;
  if (cached && ageMinutes < QUOTE_MINUTES) return { ...cached.value, quotesFromCache: true };

  try {
    const quotes = await buildQuotes();
    await saveCache(QUOTES_KEY, quotes);
    return { ...quotes, quotesFromCache: false };
  } catch (err) {
    console.error("Quotes refresh failed:", err);
    return cached ? { ...cached.value, quotesFromCache: true } : { quotes: {} };
  }
}

export async function GET() {
  try {
    const [history, quotes] = await Promise.all([freshHistory(), freshQuotes()]);
    return Response.json({ ...history, ...quotes });
  } catch (err) {
    console.error("Markets failed:", err);
    return Response.json({ error: "Could not load prices right now. Please try again later." }, { status: 500 });
  }
}
