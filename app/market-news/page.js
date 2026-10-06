"use client";

import { useEffect, useState } from "react";

const WIDTH = 520;
const HEIGHT = 240;
const PAD = { top: 16, right: 10, bottom: 24, left: 52 };

function money(value) {
  if (value >= 1000) return `$${Math.round(value).toLocaleString("en-US")}`;
  return `$${value.toFixed(2)}`;
}

function year(ms) {
  return new Date(ms).getFullYear();
}

// Turns the price points into the two SVG shapes: the line and the area under it.
function buildPaths(points) {
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const x = (i) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v) => PAD.top + innerH - ((v - min) / span) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  return { line, area, min, max, x, y };
}

function Chart({ market }) {
  const { points, color } = market;
  const { line, area, min, max } = buildPaths(points);
  const gradientId = `fill-${market.id}`;

  // A year label every 5 years.
  const ticks = [];
  for (let i = 0; i < points.length; i++) {
    const y1 = year(points[i].t);
    if (y1 % 5 === 0 && !ticks.some((t) => t.label === y1)) {
      ticks.push({ label: y1, i });
    }
  }

  const { x } = buildPaths(points);
  const up = market.changeMonth >= 0;

  return (
    <article className="chart-card">
      <header className="chart-head">
        <div>
          <h2 className="chart-title" style={{ color }}>{market.name}</h2>
          <p className="chart-unit">{market.unit}</p>
        </div>
        <div className="chart-price">
          <span className="chart-last">{money(market.last)}</span>
          <span className={up ? "chart-change up" : "chart-change down"}>
            {up ? "▲" : "▼"} {Math.abs(market.changeMonth)}% this month
          </span>
        </div>
      </header>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="chart-svg" role="img"
           aria-label={`${market.name} price from ${year(market.from)} to today`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* top and bottom guide lines */}
        <line x1={PAD.left} y1={PAD.top} x2={WIDTH - PAD.right} y2={PAD.top} className="chart-grid" />
        <line x1={PAD.left} y1={HEIGHT - PAD.bottom} x2={WIDTH - PAD.right} y2={HEIGHT - PAD.bottom} className="chart-grid" />

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        <text x={PAD.left - 8} y={PAD.top + 4} className="chart-axis" textAnchor="end">{money(max)}</text>
        <text x={PAD.left - 8} y={HEIGHT - PAD.bottom + 4} className="chart-axis" textAnchor="end">{money(min)}</text>

        {ticks.map((t) => (
          <text key={t.label} x={x(t.i)} y={HEIGHT - 6} className="chart-axis" textAnchor="middle">{t.label}</text>
        ))}
      </svg>

      <p className="chart-foot">
        Since {year(market.from)}: {market.changeAll >= 0 ? "+" : ""}{market.changeAll}% · low {money(market.low)} · high {money(market.high)}
      </p>
    </article>
  );
}

export default function MarketNews() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/markets");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Something went wrong.");
        setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="page">
      <h1 className="title">Market news</h1>
      <p className="subtitle">Crude oil, gold and Bitcoin in US dollars, over the last 25 years.</p>

      {!data && !error && <p className="hint">Loading the prices…</p>}
      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <div className="chart-grid-wrap">
            {data.series.map((market) => <Chart key={market.id} market={market} />)}
          </div>
          {data.refreshedAt && (
            <p className="cache-note">
              Prices updated {new Date(data.refreshedAt).toLocaleString()} · monthly closing prices from Yahoo Finance
              {data.stale ? " (the latest update failed, showing the previous prices)" : ""}
            </p>
          )}
        </>
      )}
    </main>
  );
}
