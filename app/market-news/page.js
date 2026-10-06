"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const WIDTH = 520;
const HEIGHT = 250;
const PAD = { top: 18, right: 12, bottom: 28, left: 56 };
const INNER_W = WIDTH - PAD.left - PAD.right;
const INNER_H = HEIGHT - PAD.top - PAD.bottom;

const RANGES = [
  { id: "1y", label: "1Y", years: 1 },
  { id: "5y", label: "5Y", years: 5 },
  { id: "10y", label: "10Y", years: 10 },
  { id: "all", label: "Max", years: null },
];

function money(value) {
  if (value >= 1000) return `$${Math.round(value).toLocaleString("en-US")}`;
  return `$${value.toFixed(2)}`;
}

function monthYear(ms) {
  return new Date(ms).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function Chart({ market }) {
  const { color } = market;
  const [range, setRange] = useState("all");
  const [startYear, setStartYear] = useState(null); // set by clicking a year label
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  // The points currently on screen, after the chosen period or clicked year.
  const points = useMemo(() => {
    const all = market.points;
    if (startYear) {
      const from = new Date(startYear, 0, 1).getTime();
      const picked = all.filter((p) => p.t >= from);
      return picked.length > 1 ? picked : all;
    }
    const years = RANGES.find((r) => r.id === range)?.years;
    if (!years) return all;
    const from = Date.now() - years * 365.25 * 24 * 3600 * 1000;
    const picked = all.filter((p) => p.t >= from);
    return picked.length > 1 ? picked : all;
  }, [market.points, range, startYear]);

  const view = useMemo(() => {
    const values = points.map((p) => p.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const x = (i) => PAD.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * INNER_W);
    const y = (v) => PAD.top + INNER_H - ((v - min) / span) * INNER_H;
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${PAD.top + INNER_H} L${x(0).toFixed(1)},${PAD.top + INNER_H} Z`;
    return { min, max, x, y, line, area };
  }, [points]);

  // Year labels under the chart. Clicking one starts the chart at that year.
  const ticks = useMemo(() => {
    const years = [...new Set(points.map((p) => new Date(p.t).getFullYear()))];
    const step = Math.max(1, Math.ceil(years.length / 6));
    const picked = years.filter((_, i) => i % step === 0);
    return picked.map((label) => {
      const i = points.findIndex((p) => new Date(p.t).getFullYear() === label);
      return { label, i };
    });
  }, [points]);

  function pointFromEvent(event) {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const clientX = event.touches?.[0]?.clientX ?? event.clientX;
    const svgX = ((clientX - box.left) / box.width) * WIDTH;
    const ratio = (svgX - PAD.left) / INNER_W;
    const index = Math.round(ratio * (points.length - 1));
    if (index < 0 || index >= points.length) return null;
    return index;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const shown = hover != null ? points[hover] : last;
  const changeShown = Number((((last.v - first.v) / first.v) * 100).toFixed(1));

  return (
    <article className="chart-card">
      <header className="chart-head">
        <div>
          <h2 className="chart-title" style={{ color }}>{market.name}</h2>
          <p className="chart-unit">{market.unit}</p>
        </div>
        <div className="chart-price">
          <span className="chart-last">{money(shown.v)}</span>
          <span className="chart-when">{monthYear(shown.t)}{hover == null ? " (latest)" : ""}</span>
        </div>
      </header>

      <div className="chart-ranges">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={!startYear && range === r.id ? "range-button range-active" : "range-button"}
            onClick={() => { setRange(r.id); setStartYear(null); setHover(null); }}
          >
            {r.label}
          </button>
        ))}
        {startYear && (
          <button type="button" className="range-button range-active" onClick={() => { setStartYear(null); setHover(null); }}>
            from {startYear} ✕
          </button>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart-svg"
        role="img"
        aria-label={`${market.name} price chart`}
        onMouseMove={(e) => setHover(pointFromEvent(e))}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => setHover(pointFromEvent(e))}
        onTouchMove={(e) => setHover(pointFromEvent(e))}
      >
        <defs>
          <linearGradient id={`fill-${market.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <line x1={PAD.left} y1={PAD.top} x2={WIDTH - PAD.right} y2={PAD.top} className="chart-grid" />
        <line x1={PAD.left} y1={PAD.top + INNER_H} x2={WIDTH - PAD.right} y2={PAD.top + INNER_H} className="chart-grid" />

        <path d={view.area} fill={`url(#fill-${market.id})`} />
        <path d={view.line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        <text x={PAD.left - 8} y={PAD.top + 4} className="chart-axis" textAnchor="end">{money(view.max)}</text>
        <text x={PAD.left - 8} y={PAD.top + INNER_H + 4} className="chart-axis" textAnchor="end">{money(view.min)}</text>

        {/* clickable years */}
        {ticks.map((t) => (
          <g
            key={t.label}
            className="chart-year"
            role="button"
            tabIndex={0}
            onMouseDown={() => { setStartYear(t.label); setHover(null); }}
            onTouchStart={() => { setStartYear(t.label); setHover(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setStartYear(t.label); setHover(null); } }}
          >
            {/* invisible box so the year is easy to click or tap */}
            <rect x={view.x(t.i) - 24} y={HEIGHT - 24} width="48" height="22" fill="transparent" />
            <text x={view.x(t.i)} y={HEIGHT - 8} className="chart-axis" textAnchor="middle">{t.label}</text>
          </g>
        ))}

        {/* marker following the cursor */}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={view.x(hover)} y1={PAD.top} x2={view.x(hover)} y2={PAD.top + INNER_H} className="chart-cursor" />
            <circle cx={view.x(hover)} cy={view.y(points[hover].v)} r="4" fill={color} stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
      </svg>

      <p className="chart-foot">
        {monthYear(first.t)} → {monthYear(last.t)}: {changeShown >= 0 ? "+" : ""}{changeShown}%
        <span className="chart-tip"> · click a year to start there, hover the chart for a price</span>
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
