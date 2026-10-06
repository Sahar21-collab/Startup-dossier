// Fetches 25 years of monthly prices for crude oil, gold and Bitcoin.
// Data: Yahoo Finance (free, no key). Cached in the database so the page
// does not call Yahoo on every visit.

export const REFRESH_HOURS = 12;

export const MARKETS = [
  { id: "oil", symbol: "CL=F", name: "Crude Oil (WTI)", unit: "USD per barrel", color: "#2d6a9f" },
  { id: "gold", symbol: "GC=F", name: "Gold", unit: "USD per ounce", color: "#c9a227" },
  { id: "bitcoin", symbol: "BTC-USD", name: "Bitcoin", unit: "USD per coin", color: "#f7931a" },
];

async function fetchSeries({ symbol }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=25y&interval=1mo`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; startup-stories/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Yahoo failed for ${symbol} (${res.status})`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);

  const times = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  const points = [];
  for (let i = 0; i < times.length; i++) {
    const value = closes[i];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    points.push({ t: times[i] * 1000, v: Number(value.toFixed(2)) });
  }
  if (points.length < 2) throw new Error(`Not enough data for ${symbol}`);
  return points;
}

export async function buildMarkets() {
  const series = await Promise.all(
    MARKETS.map(async (market) => {
      const points = await fetchSeries(market);
      const first = points[0];
      const last = points[points.length - 1];
      const previous = points[points.length - 2];
      const values = points.map((p) => p.v);

      return {
        ...market,
        points,
        last: last.v,
        lastDate: last.t,
        changeMonth: Number((((last.v - previous.v) / previous.v) * 100).toFixed(1)),
        changeAll: Number((((last.v - first.v) / first.v) * 100).toFixed(0)),
        low: Math.min(...values),
        high: Math.max(...values),
        from: first.t,
      };
    })
  );

  return { series, refreshedAt: new Date().toISOString() };
}
