# Startup Dossier

Type a startup name and founder name; the site searches the web (Tavily), writes a sourced summary (Google Gemini), and saves it (Supabase) so repeat searches are instant and free.

## How a search works

1. `app/page.js` sends the two names to `app/api/search/route.js`.
2. The route checks Supabase for a saved result (`lib/db.js`).
3. If none, it searches the web (`lib/tavily.js`), 4 Tavily credits per new search.
4. Gemini turns the results into the dossier (`lib/gemini.js`). Any field not backed by the results says "Not enough public data found".
5. The result is saved and shown.

## Setup

- Database: run `supabase/schema.sql` once in the Supabase SQL Editor.
- Keys: see `.env.example`. Locally put them in `.env.local`; online they live in Vercel's Environment Variables.

## Run on your computer

```bash
npm install
npm run dev
```

Then open http://localhost:3000.
