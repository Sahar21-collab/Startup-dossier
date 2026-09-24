// Builds a short list of successful startups founded in the last 5 years,
// for one industry. Cached in the database for CACHE_DAYS, so ticking a box
// costs about 2 Tavily credits once a week per industry.

export const CACHE_DAYS = 7;
const YEARS_BACK = 5;
const COUNT = 5;
const CALL_TIMEOUT_MS = 30000;
const MAX_ARTICLES = 20;

export const INDUSTRIES = [
  { id: "ai", label: "AI", terms: "artificial intelligence" },
  { id: "finance", label: "Finance", terms: "fintech, banking and financial services" },
  { id: "healthcare", label: "Healthcare", terms: "healthcare, digital health and medtech" },
  { id: "ecommerce", label: "E-commerce", terms: "e-commerce, online retail and marketplaces" },
  { id: "consumer", label: "Consumer", terms: "consumer apps and consumer products" },
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

const NA = "Not enough public data found";

const responseSchema = {
  type: "OBJECT",
  properties: {
    startups: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          founder: { type: "STRING" },
          foundingYear: { type: "STRING" },
          location: { type: "STRING" },
          whatTheyDo: { type: "STRING" },
          evidenceOfSuccess: { type: "STRING" },
          sourceIds: { type: "ARRAY", items: { type: "INTEGER" } },
        },
        required: ["name", "founder", "foundingYear", "location", "whatTheyDo", "evidenceOfSuccess", "sourceIds"],
      },
    },
  },
  required: ["startups"],
};

function systemPrompt(industryLabel, minYear, thisYear) {
  return `You list startups in one industry, using only the numbered search results provided.

STRICT RULES
1. Use ONLY facts stated in the search results. Never use outside knowledge, never guess, never estimate.
2. Only include a startup if the results state a founding year between ${minYear} and ${thisYear}. If the founding year is not stated in the results, do not include that startup.
3. Only include startups that work in ${industryLabel}.
4. Only include startups the results show are doing well: a funding round with an amount, a stated valuation, stated revenue, or stated user or customer numbers. "Doing well" must be a fact from the results, not your impression.
5. Return at most ${COUNT} startups, strongest evidence first. Return fewer, or none, rather than inventing or padding the list. Never repeat the same company twice.
6. No marketing language. Do not use words like "revolutionary", "game-changing", "disruptive", "innovative", "cutting-edge", "leading". Write plain, concrete sentences.

FIELDS (per startup)
- name: the company name as written in the results.
- founder: the founder name(s) as stated anywhere in the results, including in a sentence like "founded by ...". If several founders are named, give the first one only. If no result names a founder, write exactly "${NA}".
- foundingYear: the year as stated, e.g. "2022".
- location: city and country as stated, otherwise "${NA}".
- whatTheyDo: one plain sentence on what the company builds and who uses it.
- evidenceOfSuccess: one short sentence with the number that shows traction (amount raised and round, valuation, revenue, or users), with its year if stated.
- sourceIds: the numbers of the search results used for this startup.`;
}

async function tavilySearch(query, apiKey) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 10,
      chunks_per_source: 3,
      include_answer: false,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Tavily failed (${res.status}): ${detail.slice(0, 200)}`);
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

function clean(value) {
  if (typeof value !== "string") return NA;
  const trimmed = value.trim();
  return trimmed ? trimmed : NA;
}

export async function buildIndustryList(industryId) {
  const industry = INDUSTRIES.find((i) => i.id === industryId);
  if (!industry) throw new Error(`Unknown industry: ${industryId}`);

  const tavilyKey = process.env.TAVILY_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!tavilyKey) throw new Error("TAVILY_API_KEY is not set.");
  if (!geminiKey) throw new Error("GEMINI_API_KEY is not set.");

  const thisYear = new Date().getFullYear();
  const minYear = thisYear - YEARS_BACK;

  const queries = [
    `fastest growing ${industry.terms} startups founded ${minYear} ${minYear + 1} ${minYear + 2} funding round raised`,
    `successful ${industry.terms} startups launched since ${minYear} valuation revenue customers founders`,
    `${industry.terms} startups founded since ${minYear} "founded by" founder name headquarters`,
  ];

  const batches = await Promise.all(queries.map((q) => tavilySearch(q, tavilyKey)));

  const seen = new Set();
  const articles = [];
  for (const r of batches.flat().sort((a, b) => (b.score || 0) - (a.score || 0))) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    articles.push({
      title: r.title || r.url,
      url: r.url,
      content: (r.content || "").slice(0, 1800),
    });
    if (articles.length >= MAX_ARTICLES) break;
  }
  if (articles.length === 0) return { startups: [], refreshedAt: new Date().toISOString() };

  const prompt = articles
    .map((a, i) => `[${i + 1}] ${a.title}\nURL: ${a.url}\n${a.content}`)
    .join("\n\n---\n\n");

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(industry.label, minYear, thisYear) }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `Industry: ${industry.label}\nFounded between ${minYear} and ${thisYear}.\n\nSEARCH RESULTS\n${prompt}` }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      thinkingConfig: { thinkingBudget: THINKING_BUDGET },
    },
  };

  let raw;
  let lastError;
  const skip = new Set();
  let calls = 0; // the free tier allows only 20 requests per model per day
  // Two passes over the models: Google's free models are sometimes busy for a moment.
  for (let attempt = 0; attempt < 3 && !raw; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    for (const model of MODELS) {
      if (skip.has(model) || calls >= 6) continue;
      calls++;
      try {
        raw = await callGemini(model, geminiKey, body);
        break;
      } catch (err) {
        lastError = err;
        console.error(`${model}: ${err.message}`);
        if (err.name === "TimeoutError" || /\(429\)/.test(err.message)) skip.add(model);
      }
    }
  }
  if (!raw) throw lastError;

  const usedNames = new Set();
  const startups = (Array.isArray(raw.startups) ? raw.startups : [])
    .filter((s) => {
      const name = clean(s?.name);
      if (name === NA || usedNames.has(name.toLowerCase())) return false;
      // Keep the founding-year rule even if the model ignores it.
      const year = parseInt(String(s?.foundingYear).match(/\d{4}/)?.[0] || "", 10);
      if (!year || year < minYear || year > thisYear) return false;
      usedNames.add(name.toLowerCase());
      return true;
    })
    .slice(0, COUNT)
    .map((s) => {
      const ids = Array.isArray(s.sourceIds) ? s.sourceIds : [];
      const sources = [...new Set(ids)]
        .filter((id) => Number.isInteger(id) && id >= 1 && id <= articles.length)
        .map((id) => ({ title: articles[id - 1].title, url: articles[id - 1].url }));
      return {
        name: clean(s.name),
        founder: clean(s.founder),
        foundingYear: clean(s.foundingYear),
        location: clean(s.location),
        whatTheyDo: clean(s.whatTheyDo),
        evidenceOfSuccess: clean(s.evidenceOfSuccess),
        sources,
      };
    });

  return { startups, refreshedAt: new Date().toISOString() };
}
