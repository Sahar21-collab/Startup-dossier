// Searches the web with Tavily and returns a de-duplicated list of pages.
// Each new lookup runs 2 "advanced" searches = 4 Tavily credits
// (the free plan includes 1,000 credits per month).

const TAVILY_URL = "https://api.tavily.com/search";
const MAX_PAGES = 15;
const MAX_CHARS_PER_PAGE = 2000;

async function tavilySearch(query, apiKey, depth = "advanced") {
  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: depth,
      max_results: 8,
      chunks_per_source: 3,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Tavily search failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.results || [];
}

export async function searchWeb(startupName, founderName) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set.");

  // Without a founder name the searches stay broader, so that two companies
  // sharing a name both show up and can be told apart.
  const queries = founderName
    ? [
        `"${startupName}" startup founded by ${founderName}`,
        `"${startupName}" ${founderName} funding round employees revenue customers`,
      ]
    : [
        `"${startupName}" startup company founded by`,
        `"${startupName}" startup funding round employees revenue what the company does`,
      ];

  // A cheaper extra search about the people, so the dossier can describe their background.
  const founderQuery = founderName
    ? `${founderName} ${startupName} founder linkedin profile education university degree previous jobs career`
    : `"${startupName}" founders co-founders linkedin profile education university degree worked previously`;

  const batches = await Promise.all([
    ...queries.map((q) => tavilySearch(q, apiKey)),
    tavilySearch(founderQuery, apiKey, "basic"),
  ]);

  const seen = new Set();
  const pages = [];
  for (const result of batches.flat().sort((a, b) => (b.score || 0) - (a.score || 0))) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    pages.push({
      title: result.title || result.url,
      url: result.url,
      content: (result.content || "").slice(0, MAX_CHARS_PER_PAGE),
    });
    if (pages.length >= MAX_PAGES) break;
  }
  return pages;
}
