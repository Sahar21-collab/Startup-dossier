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

function systemPrompt(category) {
  return `You build a daily list of artificial intelligence news about ONE topic, from raw search results.

TOPIC: ${category.label} — ${category.scope}

STRICT RULES
1. Use ONLY the numbered search results given. Never add facts from outside them, never guess.
2. Keep only genuine news about artificial intelligence from the last few weeks that belongs to the topic above. Drop adverts, sponsored posts, "top 10" or "best stocks" listicles, share-price commentary, opinion pieces without news, job posts, and undated or clearly old stories.
3. One item per search result. If two results cover the same story, keep the better one only.
4. Aim for ${MAX_ITEMS} items, newest first. Return fewer only if the results genuinely do not contain more.
5. Write in simple English for a reader whose first language is not English: short sentences of 12 to 18 words, everyday words, say who did what. Explain any technical term or abbreviation in brackets the first time.
6. No marketing language. Never use: revolutionary, game-changing, disruptive, innovative, cutting-edge, seamless, leading, powerful, unlock, transform.
7. field: one or two words for the sub-area, e.g. "Models", "Diagnosis", "Humanoids", "GPUs", "Funding".
8. headline: a short factual headline in your own words (max 90 characters). Name the organisation involved.
9. summary: 1 or 2 plain sentences saying what happened, including any number the result states.
10. sourceId: the number of the search result the item comes from.`;
}

async function tavilyNews(category, apiKey) {
  const body = {
    query: category.query,
    topic: "news",
    time_range: "month",
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

async function askGemini(body, geminiKey, label) {
  let raw;
  let lastError;
  const skip = new Set();
  let calls = 0;
  for (let attempt = 0; attempt < 2 && !raw; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
    for (const model of MODELS) {
      if (skip.has(model) || calls >= 4) continue;
      calls++;
      try {
        raw = await callGemini(model, geminiKey, body);
        break;
      } catch (err) {
        lastError = err;
        console.error(`${label}/${model}: ${err.message}`);
        if (err.name === "TimeoutError" || /\(429\)/.test(err.message)) skip.add(model);
      }
    }
  }
  if (!raw) throw lastError;
  return raw;
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

  const seenUrls = new Set();
  const categories = [];

  // One AI call per topic, one after another: five at once makes Google's free
  // service reply "high demand" and we lose most of the topics.
  for (let index = 0; index < CATEGORIES.length; index++) {
    const category = CATEGORIES[index];
    if (index > 0) await new Promise((r) => setTimeout(r, 1200));

    const articles = [];
    for (const r of batches[index].sort((a, b) => publishedTime(b.published_date) - publishedTime(a.published_date))) {
      if (!r.url || seenUrls.has(r.url) || articles.length >= MAX_ARTICLES) continue;
      seenUrls.add(r.url);
      articles.push({
        title: r.title || r.url,
        url: r.url,
        published: r.published_date || "",
        content: (r.content || "").slice(0, 900),
      });
    }

    if (articles.length === 0) {
      categories.push({ id: category.id, label: category.label, items: [] });
      continue;
    }

    const prompt = articles
      .map((a, i) => `[${i + 1}] ${a.title}\nURL: ${a.url}\nPublished: ${a.published || "unknown"}\n${a.content}`)
      .join("\n\n---\n\n");

    const body = {
      systemInstruction: { parts: [{ text: systemPrompt(category) }] },
      contents: [{ role: "user", parts: [{ text: `SEARCH RESULTS\n${prompt}` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      },
    };

    let raw;
    try {
      raw = await askGemini(body, geminiKey, category.id);
    } catch (err) {
      console.error(`Topic ${category.id} failed: ${err?.message}`);
      categories.push({ id: category.id, label: category.label, items: [] });
      continue;
    }

    const usedIds = new Set();
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .filter((item) => {
        const id = item?.sourceId;
        if (!Number.isInteger(id) || id < 1 || id > articles.length || usedIds.has(id)) return false;
        usedIds.add(id);
        return typeof item.headline === "string" && item.headline.trim();
      })
      .slice(0, MAX_ITEMS)
      .map((item) => {
        const article = articles[item.sourceId - 1];
        return {
          field: typeof item.field === "string" ? item.field.trim() : "",
          headline: item.headline.trim(),
          summary: typeof item.summary === "string" ? item.summary.trim() : "",
          url: article.url,
          published: article.published,
        };
      });

    categories.push({ id: category.id, label: category.label, items });
  }

  if (categories.every((c) => c.items.length === 0)) throw new Error("Every topic came back empty.");

  return { categories, refreshedAt: new Date().toISOString() };
}
