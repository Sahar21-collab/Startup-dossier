// Builds the Tech News list: recent AI news from Tavily, summarized by Gemini.
// The result is stored in the database and reused for REFRESH_HOURS, so the page
// costs the same whether 1 or 1,000 people visit (about 3 Tavily credits per day).

export const REFRESH_HOURS = 24;
const MAX_ITEMS = 10;
const CALL_TIMEOUT_MS = 30000;
const MAX_ARTICLES = 24;

// Well-known technology and science outlets, used to steer one of the searches.
const TRUSTED_SOURCES = [
  "techcrunch.com",
  "theverge.com",
  "arstechnica.com",
  "wired.com",
  "technologyreview.com",
  "reuters.com",
  "ft.com",
  "nature.com",
  "science.org",
  "spectrum.ieee.org",
  "venturebeat.com",
  "semafor.com",
];

const QUERIES = [
  { q: "artificial intelligence research breakthrough new model release", domains: TRUSTED_SOURCES },
  { q: "AI applied in healthcare, science, robotics or manufacturing this week", domains: null },
  { q: "AI industry news: funding, chips, regulation, enterprise adoption this week", domains: null },
];

const MODELS = [
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];
const THINKING_BUDGET = 512;

const responseSchema = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sourceId: { type: "INTEGER" },
          field: { type: "STRING" },
          headline: { type: "STRING" },
          summary: { type: "STRING" },
        },
        required: ["sourceId", "field", "headline", "summary"],
      },
    },
  },
  required: ["items"],
};

const SYSTEM_PROMPT = `You build a daily list of the most important artificial intelligence news from raw search results.

STRICT RULES
1. Use ONLY the numbered search results given. Never add facts from outside them, never guess.
2. Keep only items about AI progress: new models and research results, AI applied in a specific field (healthcare, science, robotics, defence, energy, finance, education, manufacturing), AI chips and infrastructure, major AI funding or acquisitions, AI regulation. Drop anything that is not about AI, plus adverts, sponsored posts, "top 10" or "best tools" listicles, opinion pieces without news, job posts, and undated or clearly old stories.
3. One item per search result. Never merge two results. If two results cover the same story, keep only the better one.
4. Prefer, in this order: concrete technical or scientific progress, AI put to work in a specific field, then business and policy news. Cover DIFFERENT fields rather than 10 items about the same company.
5. No marketing language. Do not use words like "revolutionary", "game-changing", "disruptive", "innovative", "cutting-edge", "leading", "powerful". Write plain, concrete sentences.
6. field: one or two words naming the area, e.g. "Healthcare", "Robotics", "Chips", "Research", "Policy", "Enterprise", "Science".
7. headline: a short factual headline in your own words (max 90 characters). Name the organisation involved.
8. summary: 1 or 2 plain sentences saying what happened and what is new about it, including any number the result states (benchmark score, amount raised, number of users). No speculation about the future.
9. sourceId: the number of the search result the item comes from.
10. Return at most ${MAX_ITEMS} items, most important first. Return fewer rather than including weak or non-AI items.`;

async function tavilyNews({ q, domains }, apiKey) {
  const body = {
    query: q,
    topic: "news",
    time_range: "week",
    search_depth: "basic",
    max_results: 10,
    include_answer: false,
  };
  if (domains) body.include_domains = domains;

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
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

function publishedTime(value) {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export async function buildNews() {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!tavilyKey) throw new Error("TAVILY_API_KEY is not set.");
  if (!geminiKey) throw new Error("GEMINI_API_KEY is not set.");

  const batches = await Promise.all(QUERIES.map((query) => tavilyNews(query, tavilyKey)));

  const seen = new Set();
  const articles = [];
  // Newest first, so the list leans towards today's news.
  for (const r of batches.flat().sort((a, b) => publishedTime(b.published_date) - publishedTime(a.published_date))) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    articles.push({
      title: r.title || r.url,
      url: r.url,
      published: r.published_date || "",
      content: (r.content || "").slice(0, 1200),
    });
    if (articles.length >= MAX_ARTICLES) break;
  }
  if (articles.length === 0) return { items: [], refreshedAt: new Date().toISOString() };

  const prompt = articles
    .map((a, i) => `[${i + 1}] ${a.title}\nURL: ${a.url}\nPublished: ${a.published || "unknown"}\n${a.content}`)
    .join("\n\n---\n\n");

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: `SEARCH RESULTS\n${prompt}` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      thinkingConfig: { thinkingBudget: THINKING_BUDGET },
    },
  };

  let raw;
  let lastError;
  // Two passes over the models: Google's free models are sometimes busy for a moment.
  for (let attempt = 0; attempt < 3 && !raw; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    for (const model of MODELS) {
      try {
        raw = await callGemini(model, geminiKey, body);
        break;
      } catch (err) {
        lastError = err;
        console.error(err.message);
      }
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
        field: typeof item.field === "string" ? item.field.trim() : "",
        headline: item.headline.trim(),
        summary: item.summary.trim(),
        url: article.url,
        published: article.published,
      };
    });

  return { items, refreshedAt: new Date().toISOString() };
}
