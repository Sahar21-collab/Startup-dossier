// Sends the search results to Google Gemini and gets back a structured dossier.

export const NA = "Not enough public data found";

const FALLBACK_MODEL = "gemini-2.5-flash";
const STATUS_VALUES = ["active", "acquired", "shut down"];
const BUSINESS_MODEL_VALUES = ["B2B", "B2C", "B2B and B2C"];

const TEXT_FIELDS = [
  "startupName",
  "founderName",
  "foundingYear",
  "location",
  "problemSolved",
  "valueAdded",
  "sector",
  "fundingStage",
  "teamSize",
  "revenueModel",
];

const responseSchema = {
  type: "OBJECT",
  properties: {
    startupName: { type: "STRING" },
    founderName: { type: "STRING" },
    foundingYear: { type: "STRING" },
    location: { type: "STRING" },
    status: { type: "STRING", enum: [...STATUS_VALUES, NA] },
    problemSolved: { type: "STRING" },
    valueAdded: { type: "STRING" },
    businessModel: { type: "STRING", enum: [...BUSINESS_MODEL_VALUES, NA] },
    sector: { type: "STRING" },
    fundingStage: { type: "STRING" },
    teamSize: { type: "STRING" },
    revenueModel: { type: "STRING" },
    kpis: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          metric: { type: "STRING" },
          value: { type: "STRING" },
        },
        required: ["metric", "value"],
      },
    },
    website: { type: "STRING" },
    sourceIds: { type: "ARRAY", items: { type: "INTEGER" } },
  },
  required: [
    ...TEXT_FIELDS,
    "status",
    "businessModel",
    "kpis",
    "website",
    "sourceIds",
  ],
};

const SYSTEM_PROMPT = `You are a careful analyst who writes factual startup dossiers from web search results.

STRICT RULES
1. Use ONLY facts stated in the numbered search results provided. Never use outside knowledge, never guess, never estimate from vibes.
2. If a field is not supported by the search results, set it to exactly: "${NA}"
3. Apply rule 2 field by field. Fill every field you CAN support, even if many others are missing.
4. Be careful about name collisions: only use results that clearly refer to the startup and founder the user asked about. Ignore results about a different company with a similar name.
5. No marketing language. Do not use words like "revolutionary", "game-changing", "disruptive", "innovative", "cutting-edge", "seamless", "world-class", "leading". Write specific, concrete, plain sentences.

FIELD GUIDANCE
- startupName, founderName: the correct spelling as found in the results (fall back to the user's input if the results confirm it).
- foundingYear: a year like "2019".
- location: city and country of headquarters.
- status: "active", "acquired", or "shut down".
- problemSolved: 2-3 plain sentences on the real-world problem people or businesses had before this startup existed.
- valueAdded: 2-3 plain sentences on what they built and concretely why it is better than what existed before.
- businessModel: "B2B", "B2C", or "B2B and B2C".
- sector: short industry label, e.g. "Fintech - payments".
- fundingStage: latest known stage, e.g. "Seed", "Series A", "Series B". Include amount and year if stated, e.g. "Series A ($12M, 2023)".
- teamSize: approximate headcount as stated, e.g. "~50 employees (2024)".
- revenueModel: how they make money, e.g. "Subscription (SaaS)", "Commission on transactions", "Advertising".
- kpis: EXACTLY 4 items. Choose the 4 most important metrics for THIS type of business (e.g. for food delivery: order volume, average delivery time, repeat customer rate, gross merchandise value). The metric names depend on the business type, not on what data exists. For each, set value to the real number found in the results (with its date if given), otherwise "${NA}". Still choose sensible metric names even if the sector is unclear from the results.
- website: the startup's official website URL (starting with https://) if it appears in the results, otherwise "${NA}".
- sourceIds: the numbers of the search results you actually used for any fact. Empty list if you used none.`;

function buildUserPrompt(startupName, founderName, pages) {
  const sources = pages
    .map((p, i) => `[${i + 1}] ${p.title}\nURL: ${p.url}\n${p.content}`)
    .join("\n\n---\n\n");

  return `Startup name (user input): ${startupName}
Founder name (user input): ${founderName}

SEARCH RESULTS
${sources || "(no results)"}`;
}

async function callGemini(model, apiKey, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`Gemini (${model}) failed (${res.status}): ${detail.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!text) throw new Error(`Gemini (${model}) returned an empty answer.`);
  return JSON.parse(text);
}

function clean(value) {
  if (typeof value !== "string") return NA;
  const trimmed = value.trim();
  return trimmed ? trimmed : NA;
}

function normalize(raw, pages, startupName, founderName) {
  const out = {};
  for (const field of TEXT_FIELDS) out[field] = clean(raw[field]);
  if (out.startupName === NA) out.startupName = startupName;
  if (out.founderName === NA) out.founderName = founderName;

  out.status = STATUS_VALUES.includes(raw.status) ? raw.status : NA;
  out.businessModel = BUSINESS_MODEL_VALUES.includes(raw.businessModel) ? raw.businessModel : NA;

  const kpis = Array.isArray(raw.kpis) ? raw.kpis : [];
  out.kpis = kpis
    .filter((k) => k && clean(k.metric) !== NA)
    .slice(0, 4)
    .map((k) => ({ metric: k.metric.trim(), value: clean(k.value) }));

  const website = clean(raw.website);
  out.website = /^https?:\/\/\S+\.\S+/i.test(website) ? website : NA;

  // Only keep sources that really were in the search results.
  const ids = Array.isArray(raw.sourceIds) ? raw.sourceIds : [];
  const used = [...new Set(ids)]
    .filter((id) => Number.isInteger(id) && id >= 1 && id <= pages.length)
    .map((id) => ({ title: pages[id - 1].title, url: pages[id - 1].url }));
  out.sources = used;

  return out;
}

export async function summarize(startupName, founderName, pages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const primary = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const models = primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL];

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(startupName, founderName, pages) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  let lastError;
  for (const model of models) {
    try {
      const raw = await callGemini(model, apiKey, body);
      return normalize(raw, pages, startupName, founderName);
    } catch (err) {
      lastError = err;
      console.error(err.message);
      // Try the backup model if this one is unavailable, busy, or gave a broken answer.
    }
  }
  throw lastError;
}

// Used when the web search finds nothing at all.
export function emptyDossier(startupName, founderName) {
  const out = {};
  for (const field of TEXT_FIELDS) out[field] = NA;
  return {
    ...out,
    startupName,
    founderName,
    status: NA,
    businessModel: NA,
    kpis: [],
    website: NA,
    sources: [],
  };
}
