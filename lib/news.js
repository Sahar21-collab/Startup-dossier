// Builds the Tech News lists: one list of AI stories per topic.
// Each topic gets its own web search (1 Tavily credit) and its own Gemini call.
// The result is stored in the database and reused for REFRESH_HOURS.

export const REFRESH_HOURS = 24;
const MAX_ITEMS = 10;
const MAX_ARTICLES = 20;
const CALL_TIMEOUT_MS = 30000;

// Share-tip and stock-picking sites: they flood AI searches with "3 stocks to buy"
// articles that are not news.
const EXCLUDED_SOURCES = [
  "fool.com", "zacks.com", "simplywall.st", "investing.com", "benzinga.com",
  "marketbeat.com", "insidermonkey.com", "barchart.com", "stocktwits.com",
  "tipranks.com", "247wallst.com", "finbold.com",
];

// Well-known technology and science outlets, used to steer the research search.
const TRUSTED_SOURCES = [
  "techcrunch.com", "theverge.com", "arstechnica.com", "wired.com",
  "technologyreview.com", "reuters.com", "ft.com", "nature.com",
  "science.org", "spectrum.ieee.org", "venturebeat.com", "semafor.com",
];

export const CATEGORIES = [
  {
    id: "research",
    label: "Research",
    scope: "AI research and new models: published results, benchmarks, new model releases, scientific papers",
    query: "artificial intelligence research results new model release benchmark paper",
    domains: TRUSTED_SOURCES,
  },
  {
    id: "healthcare",
    label: "Healthcare",
    scope: "AI used in medicine and health: diagnosis, drug discovery, hospitals, medical devices, biology",
    query: "artificial intelligence healthcare hospitals diagnosis drug discovery medical",
    domains: null,
  },
  {
    id: "robotics",
    label: "Robotics",
    scope: "AI in robots and physical machines: humanoid robots, factory and warehouse robots, self-driving vehicles, drones",
    query: "AI robotics humanoid robot autonomous vehicles drones factory automation",
    domains: null,
  },
  {
    id: "chips",
    label: "Chips",
    scope: "AI hardware: chips, GPUs, data centres, energy and the companies building them",
    query: "AI chip announcement GPU semiconductor data centre build energy supply deal",
    domains: null,
  },
  {
    id: "business",
    label: "Business",
    scope: "The business of AI: funding rounds, acquisitions, company strategy, adoption by companies, regulation",
    query: "AI company raises funding acquires startup launches product regulation rule",
    domains: null,
  },
];

const MODELS = [
  "gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.7-flash",
  "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite",
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
          category: { type: "STRING", enum: CATEGORIES.map((c) => c.id) },
          field: { type: "STRING" },
          headline: { type: "STRING" },
          summary: { type: "STRING" },
        },
        required: ["sourceId", "category", "field", "headline", "summary"],
      },
    },
  },
  required: ["items"],
};

const SYSTEM_PROMPT = `You build daily lists of artificial intelligence news, one list per topic, from raw search results.

TOPICS
${CATEGORIES.map((c) => `- ${c.id} (${c.label}): ${c.scope}`).join("\n")}

STRICT RULES
1. Use ONLY the numbered search results given. Never add facts from outside them, never guess.
2. Keep only genuine recent news about artificial intelligence. Drop adverts, sponsored posts, "top 10" or "best stocks" listicles, share-price commentary, opinion pieces without news, job posts, and undated or clearly old stories.
3. Put each item in the single topic that fits it best, using the topic list above. The search result was found under a topic, but judge by its content.
4. One item per search result. If two results cover the same story, keep the better one only.
5. Up to ${MAX_ITEMS} items per topic, most important first. Work through the topics one by one and fill EVERY topic as far as the results allow: a story about chips belongs in chips, a funding round or company strategy belongs in business. Only leave a topic empty if no result fits it.
6. Write in simple English for a reader whose first language is not English: short sentences of 12 to 18 words, everyday words, say who did what. Explain any technical term or abbreviation in brackets the first time.
7. No marketing language. Never use: revolutionary, game-changing, disruptive, innovative, cutting-edge, seamless, leading, powerful, unlock, transform.
8. field: one or two words for the sub-area, e.g. "Models", "Diagnosis", "Humanoids", "GPUs", "Funding".
9. headline: a short factual headline in your own words (max 90 characters). Name the organisation involved.
10. summary: 1 or 2 plain sentences saying what happened, including any number the result states.
11. sourceId: the number of the search result the item comes from.`;

async function tavilyNews(category, apiKey) {
  const body = {
    query: `${category.query} this week`,
    topic: "news",
    time_range: "week",
    search_depth: "basic",
    max_results: 20,
    include_answer: false,
  };
  if (category.domains) body.include_domains = category.domains;
  else body.exclude_domains = EXCLUDED_SOURCES;

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
    throw new Error(`Gemini (${model}) failed (${res.status}): ${detail.slice(0, 200)}`);
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

  // One web search per topic (1 Tavily credit each), all at once.
  const batches = await Promise.all(
    CATEGORIES.map((category) =>
      tavilyNews(category, tavilyKey).catch((err) => {
        console.error(`Search failed for ${category.id}: ${err.message}`);
        return [];
      })
    )
  );

  const seen = new Set();
  const articles = [];
  batches.forEach((results, index) => {
    const category = CATEGORIES[index];
    const sorted = results.sort((a, b) => publishedTime(b.published_date) - publishedTime(a.published_date));
    let kept = 0;
    for (const r of sorted) {
      if (!r.url || seen.has(r.url) || kept >= MAX_ARTICLES) continue;
      seen.add(r.url);
      kept++;
      articles.push({
        foundUnder: category.id,
        title: r.title || r.url,
        url: r.url,
        published: r.published_date || "",
        content: (r.content || "").slice(0, 900),
      });
    }
  });

  if (articles.length === 0) throw new Error("No search results for any topic.");

  const prompt = articles
    .map((a, i) => `[${i + 1}] (found under: ${a.foundUnder}) ${a.title}\nURL: ${a.url}\nPublished: ${a.published || "unknown"}\n${a.content}`)
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

  // A single AI call for the whole page, retried across models if one is busy.
  let raw;
  let lastError;
  const skip = new Set();
  let calls = 0;
  for (let attempt = 0; attempt < 3 && !raw; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    for (const model of MODELS) {
      if (skip.has(model) || calls >= 8) continue;
      calls++;
      try {
        raw = await callGemini(model, geminiKey, body);
        break;
      } catch (err) {
        lastError = err;
        console.error(`news/${model}: ${err.message}`);
        if (err.name === "TimeoutError" || /\(429\)/.test(err.message)) skip.add(model);
      }
    }
  }
  if (!raw) throw lastError;

  const usedIds = new Set();
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, []]));

  for (const item of Array.isArray(raw.items) ? raw.items : []) {
    const id = item?.sourceId;
    if (!Number.isInteger(id) || id < 1 || id > articles.length || usedIds.has(id)) continue;
    if (!byCategory[item.category]) continue;
    if (typeof item.headline !== "string" || !item.headline.trim()) continue;
    if (byCategory[item.category].length >= MAX_ITEMS) continue;
    usedIds.add(id);

    const article = articles[id - 1];
    byCategory[item.category].push({
      field: typeof item.field === "string" ? item.field.trim() : "",
      headline: item.headline.trim(),
      summary: typeof item.summary === "string" ? item.summary.trim() : "",
      url: article.url,
      published: article.published,
    });
  }

  const categories = CATEGORIES.map((c) => ({ id: c.id, label: c.label, items: byCategory[c.id] }));
  if (categories.every((c) => c.items.length === 0)) throw new Error("Every topic came back empty.");

  return { categories, refreshedAt: new Date().toISOString() };
}
