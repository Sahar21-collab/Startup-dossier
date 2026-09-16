// Builds the Tech News list: recent articles from Tavily, summarized by Gemini.
// The result is stored in the database and reused for REFRESH_HOURS, so a busy
// day costs the same as a quiet one (about 2 Tavily credits per refresh).

export const REFRESH_HOURS = 12;
const MAX_ITEMS = 8;
const CALL_TIMEOUT_MS = 45000;

const QUERIES = [
  "startup funding rounds and acquisitions this week",
  "technology industry news this week",
];

const MODELS = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite"];

const responseSchema = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sourceId: { type: "INTEGER" },
          headline: { type: "STRING" },
          summary: { type: "STRING" },
        },
        required: ["sourceId", "headline", "summary"],
      },
    },
  },
  required: ["items"],
};

const SYSTEM_PROMPT = `You turn raw search results into a short tech news list.

STRICT RULES
1. Use ONLY the numbered search results given. Never add facts from outside them, never guess.
2. Keep only items that are genuine recent news about startups or the technology industry (funding rounds, acquisitions, launches, shutdowns, regulation, major product or company news). Drop adverts, listicles, "top 10" pages, job posts, generic company home pages, and anything undated or clearly old.
3. One item per search result. Never merge two results, never repeat the same story twice.
4. No marketing language. Do not use words like "revolutionary", "game-changing", "disruptive", "innovative", "cutting-edge", "leading". Write plain, concrete sentences.
5. headline: a short factual headline in your own words (max 90 characters). Name the company involved.
6. summary: 1 or 2 plain sentences saying what happened and, if the result states it, the number that matters (amount raised, price, users). No speculation about what it means.
7. sourceId: the number of the search result the item comes from.
8. Return at most ${MAX_ITEMS} items, most newsworthy first. Return fewer, or none, rather than including weak items.`;

async function tavilyNews(query, apiKey) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      topic: "news",
      time_range: "week",
      search_depth: "basic",
      max_results: 10,
      include_answer: false,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Tavily news failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.results || [];
}

async function callGemini(model, apiKey, body) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    }
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini (${model}) failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
  if (!text) throw new Error(`Gemini (${model}) returned an empty answer.`);
  return JSON.parse(text);
}

export async function buildNews() {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!tavilyKey) throw new Error("TAVILY_API_KEY is not set.");
  if (!geminiKey) throw new Error("GEMINI_API_KEY is not set.");

  const batches = await Promise.all(QUERIES.map((q) => tavilyNews(q, tavilyKey)));

  const seen = new Set();
  const articles = [];
  for (const r of batches.flat().sort((a, b) => (b.score || 0) - (a.score || 0))) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    articles.push({
      title: r.title || r.url,
      url: r.url,
      published: r.published_date || "",
      content: (r.content || "").slice(0, 1200),
    });
    if (articles.length >= 20) break;
  }
  if (articles.length === 0) return { items: [], refreshedAt: new Date().toISOString() };

  const prompt = articles
    .map((a, i) => `[${i + 1}] ${a.title}\nURL: ${a.url}\nPublished: ${a.published || "unknown"}\n${a.content}`)
    .join("\n\n---\n\n");

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: `SEARCH RESULTS\n${prompt}` }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema },
  };

  let raw;
  let lastError;
  for (const model of MODELS) {
    try {
      raw = await callGemini(model, geminiKey, body);
      break;
    } catch (err) {
      lastError = err;
      console.error(err.message);
    }
  }
  if (!raw) throw lastError;

  const usedIds = new Set();
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((item) => {
      const id = item?.sourceId;
      if (!Number.isInteger(id) || id < 1 || id > articles.length || usedIds.has(id)) return false;
      usedIds.add(id);
      return typeof item.headline === "string" && item.headline.trim() && typeof item.summary === "string";
    })
    .slice(0, MAX_ITEMS)
    .map((item) => {
      const article = articles[item.sourceId - 1];
      return {
        headline: item.headline.trim(),
        summary: item.summary.trim(),
        url: article.url,
        published: article.published,
      };
    });

  return { items, refreshedAt: new Date().toISOString() };
}
