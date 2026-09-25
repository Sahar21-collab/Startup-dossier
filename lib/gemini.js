// Sends the search results to Google Gemini and gets back a structured dossier.

export const NA = "Not enough public data found";

// Raise this whenever the dossier gains a section or its writing rules change:
// saved dossiers with an older number are searched again and replaced.
export const DOSSIER_VERSION = 4;

// Tried in order: if a model is busy or unavailable, the next one is used.
const DEFAULT_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];
// Google's free models are often busy for a few seconds at a time, so we try
// several models several times, but give up before the page times out.
const CALL_TIMEOUT_MS = 25000;
const TOTAL_BUDGET_MS = 70000;
const ATTEMPTS = 3;
// Google's free tier allows only 20 requests per model per day, so never spend
// more than this many requests on one search.
const MAX_CALLS = 6;
// A small thinking budget keeps answers fast; the task is extraction, not reasoning.
const THINKING_BUDGET = 512;
const STATUS_VALUES = ["active", "acquired", "shut down"];
const BUSINESS_MODEL_VALUES = ["B2B", "B2C", "B2B and B2C"];

const TEXT_FIELDS = [
  "startupName",
  "founderName",
  "foundingYear",
  "location",
  "founderBackground",
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
    founderBackground: { type: "STRING" },
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
    ambiguous: { type: "BOOLEAN" },
    candidates: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          founder: { type: "STRING" },
          description: { type: "STRING" },
        },
        required: ["name", "founder", "description"],
      },
    },
  },
  required: [
    ...TEXT_FIELDS,
    "status",
    "businessModel",
    "kpis",
    "website",
    "sourceIds",
    "ambiguous",
    "candidates",
  ],
};

const SYSTEM_PROMPT = `You are a careful analyst who writes factual startup dossiers from web search results.

STRICT RULES
1. Use ONLY facts stated in the numbered search results provided. Never use outside knowledge, never guess, never estimate from vibes.
2. If a field is not supported by the search results, set it to exactly: "${NA}"
3. Apply rule 2 field by field. Fill every field you CAN support, even if many others are missing.
4. Be careful about name collisions. The founder name may be missing from the request.
   - If a founder name IS given: only use results about that startup AND that founder. Ignore results about a different company with a similar name.
   - If NO founder name is given: check whether the results describe two or more DIFFERENT companies using this name (different industries, countries or founders; a parent company and an unrelated namesake). If they do, set ambiguous to true, fill candidates with up to 4 of those companies (name as written, its founder if the results name one otherwise "${NA}", and a short description that tells them apart, such as industry and location), and set every other field to "${NA}".
   - If the results describe a single company (the usual case), set ambiguous to false, leave candidates empty, and fill the dossier normally.
   - Never set ambiguous to true just because some results are irrelevant or because information is missing. Only a genuine second company with the same name counts.
5. WRITE IN SIMPLE ENGLISH. Your reader is an adult whose first language is not English. Follow all of these:
   - Short sentences. Aim for 12 to 18 words. One idea per sentence. Never join three ideas with commas and "and".
   - Everyday words. Write "use" not "utilise", "help" not "facilitate", "spread out" not "fragmented", "different" not "disparate", "make better" not "optimise", "work together" not "collaborate seamlessly".
   - Say who does what: "Doctors book appointments in the app", not "appointment scheduling is facilitated for practitioners".
   - Explain any technical word, abbreviation or industry term in brackets the first time: "ERP (the software a company uses to track money, stock and staff)", "churn (the share of customers who leave)".
   - No marketing language and no slogans. Never use: revolutionary, game-changing, disruptive, innovative, cutting-edge, seamless, world-class, leading, empower, streamline, unlock, transform, end-to-end, next generation, holistic, robust, comprehensive, ecosystem.
   - Keep every fact and every number. Simple wording must never mean less information.

FIELD GUIDANCE
- startupName, founderName: the correct spelling as found in the results (fall back to the user's input if the results confirm it).
- foundingYear: a year like "2019".
- location: city and country of headquarters.
- status: "acquired" or "shut down" only if the results say so. "active" only if the results describe the company operating recently (e.g. a recent launch, funding round, hiring, or news in the last 2 years of the dates shown). Otherwise "${NA}".
- founderBackground: 2-4 plain sentences on the founder and co-founders as people: what they studied (degree and university) and what they did before this company (employers, roles, earlier companies they started). Name each person you describe. Include only what the results state; if the results say nothing about their studies or earlier work, write exactly "${NA}". Never guess a university or job from a name or nationality.
- problemSolved: a full paragraph of 4 to 6 sentences on the real-world problem that existed before this startup. Cover, as far as the results support it: who had the problem (which kind of person, business or profession), what they had to do instead (the manual workarounds, the older tools, the middlemen), and what that cost them in money, time, errors or missed opportunities. Use the concrete details and numbers stated in the results. Explain it so that a reader who has never heard of this industry understands the situation. Do not describe the startup's product here.
- valueAdded: a full paragraph of 4 to 6 sentences on what the company built. Cover, as far as the results support it: what the product actually is and does, how a customer uses it in practice, which parts of the old way it replaces or automates, and the concrete difference it makes (time saved, cost removed, errors avoided, something now possible that was not). Name specific features, integrations or customer types when the results mention them.
- Length rule for those two paragraphs: write as much as the search results genuinely support, up to 6 sentences. If the results only support two sentences, write two. Never pad with generalities, never repeat the same point in different words, and never add a sentence that the results do not support.
- businessModel: "B2B", "B2C", or "B2B and B2C".
- sector: short industry label, e.g. "Fintech - payments".
- fundingStage: latest known stage, e.g. "Seed", "Series A", "Series B". Include amount and year if stated, e.g. "Series A ($12M, 2023)".
- teamSize: approximate headcount as stated, e.g. "~50 employees (2024)".
- revenueModel: how they make money, e.g. "Subscription (SaaS)", "Commission on transactions", "Advertising".
- kpis: EXACTLY 4 items, chosen in two steps.
  Step A: decide what type of business this is, then pick the 4 operating metrics an investor would track for that type (e.g. food delivery: monthly order volume, average delivery time, repeat customer rate, gross merchandise value; B2B SaaS: annual recurring revenue, net revenue retention, number of paying customers, churn rate; marketplace: GMV, take rate, active buyers, active sellers). Decide the metric names BEFORE looking for numbers. Never pick a metric just because a number for it exists. Never use funding, valuation, team size, or founding year as KPIs (they are shown elsewhere).
  Step B: for each metric, set value to a number that is explicitly stated in the results for this company (add the date if given). Do not calculate, infer, or convert numbers. If no explicit number exists, set value to "${NA}".
- website: the startup's official website URL (starting with https://) if it appears in the results, otherwise "${NA}".
- sourceIds: the numbers of the search results you actually used for any fact. Empty list if you used none.`;

function buildUserPrompt(startupName, founderName, pages) {
  const sources = pages
    .map((p, i) => `[${i + 1}] ${p.title}\nURL: ${p.url}\n${p.content}`)
    .join("\n\n---\n\n");

  return `Startup name (user input): ${startupName}
Founder name (user input): ${founderName || "(not given - the visitor did not provide one)"}

SEARCH RESULTS
${sources || "(no results)"}`;
}

async function callGemini(model, apiKey, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Marketing words the dossier must not contain. If they slip through, we ask once for a rewrite.
const JARGON = /\b(revolutionar\w*|game[- ]?chang\w*|disrupt\w*|innovat\w*|cutting[- ]edge|state[- ]of[- ]the[- ]art|seamless\w*|world[- ]class|streamlin\w*|empower\w*|unlock\w*|leverag\w*|end[- ]to[- ]end|next[- ]generation|best[- ]in[- ]class|one[- ]stop|all[- ]in[- ]one|holistic|synerg\w*|utilis\w*|utiliz\w*|facilitat\w*|optimis\w*|optimiz\w*|disparate|fragmented|ecosystem\w*|robust|comprehensive|myriad|plethora|thereby|whereby|moreover|furthermore|aforementioned|orchestrat\w*|paradigm|scalab\w*)\b/gi;

function jargonUsed(result) {
  const text = [result.problemSolved, result.valueAdded, result.founderBackground].join(" ");
  return [...new Set((text.match(JARGON) || []).map((w) => w.toLowerCase()))];
}

// The model sometimes picks these anyway; they belong in the facts row, not the KPIs.
const BANNED_KPI = /(funding|fundrais|raised|valuation|investment|investors|team size|employees|headcount|staff|founding year|founded)/i;

function clean(value) {
  if (typeof value !== "string") return NA;
  const trimmed = value.trim();
  return trimmed ? trimmed : NA;
}

function normalize(raw, pages, startupName, founderName) {
  const out = {};
  for (const field of TEXT_FIELDS) out[field] = clean(raw[field]);
  if (out.startupName === NA) out.startupName = startupName;
  if (out.founderName === NA && founderName) out.founderName = founderName;

  out.status = STATUS_VALUES.includes(raw.status) ? raw.status : NA;
  out.businessModel = BUSINESS_MODEL_VALUES.includes(raw.businessModel) ? raw.businessModel : NA;

  const kpis = Array.isArray(raw.kpis) ? raw.kpis : [];
  out.kpis = kpis
    .filter((k) => k && clean(k.metric) !== NA && !BANNED_KPI.test(k.metric))
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
  out.version = DOSSIER_VERSION;

  return out;
}

export async function summarize(startupName, founderName, pages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const preferred = process.env.GEMINI_MODEL;
  const models = preferred ? [preferred, ...DEFAULT_MODELS.filter((m) => m !== preferred)] : DEFAULT_MODELS;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(startupName, founderName, pages) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      thinkingConfig: { thinkingBudget: THINKING_BUDGET },
    },
  };

  let lastError;
  let retried = false;
  const skip = new Set(); // models that hung or ran out of daily quota
  let calls = 0;
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (Date.now() > deadline) break;
    if (attempt > 0) await sleep(2000 * attempt);
    for (const model of models) {
      if (Date.now() > deadline || skip.has(model) || calls >= MAX_CALLS) continue;
      calls++;
    try {
      const raw = await callGemini(model, apiKey, body);

      // Several different companies share this name: ask for the founder instead.
      const candidates = (Array.isArray(raw.candidates) ? raw.candidates : [])
        .filter((c) => c && typeof c.name === "string" && c.name.trim())
        .slice(0, 4)
        .map((c) => ({
          name: c.name.trim(),
          founder: clean(c.founder),
          description: clean(c.description),
        }));
      if (raw.ambiguous === true && !founderName && candidates.length >= 2) {
        return { needsFounder: true, candidates };
      }

      const result = normalize(raw, pages, startupName, founderName);

      // One free rewrite if marketing words slipped in.
      const words = jargonUsed(result);
      if (words.length && !retried && Date.now() + CALL_TIMEOUT_MS < deadline) {
        retried = true;
        body.contents.push(
          { role: "model", parts: [{ text: JSON.stringify({ problemSolved: result.problemSolved, valueAdded: result.valueAdded }) }] },
          {
            role: "user",
            parts: [{
              text: `Your answer used these words, which are banned because they are marketing language or too difficult: ${words.join(", ")}. Write the whole answer again. Keep every fact and every number exactly the same. Replace those words with simple everyday English, in short sentences an adult reading English as a second language can follow easily.`,
            }]
          }
        );
        continue;
      }

      return result;
    } catch (err) {
      lastError = err;
      console.error(`${model}: ${err.message}`);
      if (err.name === "TimeoutError") skip.add(model);
      // 429 means this model's free daily quota is gone: don't try it again today.
      if (err.status === 429) skip.add(model);
      // Try the backup model if this one is unavailable, busy, or gave a broken answer.
    }
    }
  }
  const busy = new Error(`All Gemini models were busy or too slow. Last error: ${lastError?.message}`);
  busy.busy = true;
  throw busy;
}

// Cleans a dossier that was saved earlier, so older saved results follow today's rules too.
export function tidySavedResult(result) {
  if (!result || !Array.isArray(result.kpis)) return result;
  return { ...result, kpis: result.kpis.filter((k) => k?.metric && !BANNED_KPI.test(k.metric)) };
}

// Used when the web search finds nothing at all.
export function emptyDossier(startupName, founderName) {
  const out = {};
  for (const field of TEXT_FIELDS) out[field] = NA;
  return {
    ...out,
    startupName,
    founderName: founderName || NA,
    status: NA,
    businessModel: NA,
    kpis: [],
    website: NA,
    sources: [],
  };
}
