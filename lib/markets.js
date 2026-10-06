// Prices for crude oil, gold and Bitcoin, from Yahoo Finance (free, no key).
//
// Two separate pieces, cached for different lengths of time:
//   - history: 25 years of monthly prices + 2 years of daily prices (slow to
//     fetch, barely changes) -> kept for HISTORY_HOURS
//   - quotes: the latest price of each (small and fast) -> kept for QUOTE_MINUTES

export const HISTORY_HOURS = 12;
export const QUOTE_MINUTES = 5;

export const MARKETS = [
  { id: "oil", symbol: "CL=F", name: "Crude Oil (WTI)", unit: "USD per barrel", color: "#2d6a9f" },
  { id: "gold", symbol: "GC=F", name: "Gold", unit: "USD per ounce", color: "#c9a227" },
  { id: "bitcoin", symbol: "BTC-USD", name: "Bitcoin", unit: "USD per coin", color: "#f7931a" },
];

async function yahooChart(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; startup-stories/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Yahoo failed for ${symbol} ${range}/${interval} (${res.status})`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);
  return result;
}

function toPoints(result) {
  const times = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const points = [];
  for (let i = 0; i < times.length; i++) {
    const value = closes[i];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    points.push({ t: times[i] * 1000, v: Number(value.toFixed(2)) });
  }
  return points;
}

export async function buildHistory() {
  const series = await Promise.all(
    MARKETS.map(async (market) => {
      const [monthly, daily] = await Promise.all([
        yahooChart(market.symbol, "25y", "1mo").then(toPoints),
        yahooChart(market.symbol, "2y", "1d").then(toPoints),
      ]);
      if (monthly.length < 2) throw new Error(`Not enough history for ${market.symbol}`);
      return { ...market, monthly, daily };
    })
  );
  return { series, refreshedAt: new Date().toISOString() };
}

// The latest traded price of each market.
export async function buildQuotes() {
  const quotes = {};
  await Promise.all(
    MARKETS.map(async (market) => {
      try {
        const result = await yahooChart(market.symbol, "1d", "5m");
        const meta = result.meta || {};
        const price = meta.regularMarketPrice ?? toPoints(result).at(-1)?.v;
        if (typeof price !== "number") return;
        quotes[market.id] = {
          price: Number(price.toFixed(2)),
          previousClose: typeof meta.chartPreviousClose === "number" ? Number(meta.chartPreviousClose.toFixed(2)) : null,
          at: (meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now()),
        };
      } catch (err) {
        console.error(`Quote failed for ${market.symbol}: ${err.message}`);
      }
    })
  );
  return { quotes, quotedAt: new Date().toISOString() };
}
