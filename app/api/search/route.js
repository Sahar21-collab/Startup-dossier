import { findSaved, makeLookupKey, saveResult } from "@/lib/db";
import { emptyDossier, summarize, tidySavedResult } from "@/lib/gemini";
import { searchWeb } from "@/lib/tavily";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_LENGTH = 100;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const startupName = String(body?.startupName || "").trim();
  const founderName = String(body?.founderName || "").trim();

  // The founder name is optional. It is only asked for when several companies share a name.
  if (!startupName) {
    return Response.json({ error: "Please enter a startup name." }, { status: 400 });
  }
  if (startupName.length > MAX_LENGTH || founderName.length > MAX_LENGTH) {
    return Response.json({ error: "Names must be under 100 characters." }, { status: 400 });
  }

  const lookupKey = makeLookupKey(startupName, founderName);

  try {
    // 1. Already searched before? Return the saved result.
    const saved = await findSaved(lookupKey);
    if (saved) {
      return Response.json({ result: tidySavedResult(saved.result), cached: true, savedAt: saved.created_at });
    }

    // 2. Search the web.
    const pages = await searchWeb(startupName, founderName);

    // Nothing found: show an empty dossier, but don't save it (it may be a typo).
    if (pages.length === 0) {
      return Response.json({ result: emptyDossier(startupName, founderName), cached: false });
    }

    // 3. Ask Gemini to write the dossier from the search results.
    const result = await summarize(startupName, founderName, pages);

    // Several companies share this name: ask the visitor which one, and save nothing.
    if (result.needsFounder) {
      return Response.json({ needsFounder: true, candidates: result.candidates, startupName });
    }

    // 4. Save it for next time.
    await saveResult(lookupKey, startupName, founderName, result);

    return Response.json({ result, cached: false });
  } catch (err) {
    console.error("Search failed:", err);
    if (err?.busy) {
      return Response.json(
        { error: "The free AI service is busy at the moment. Please wait a minute and search again." },
        { status: 503 }
      );
    }
    return Response.json(
      { error: "Something went wrong while searching. Please try again in a minute." },
      { status: 500 }
    );
  }
}
