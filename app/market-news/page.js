"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const WIDTH = 520;
const HEIGHT = 250;
const PAD = { top: 18, right: 12, bottom: 28, left: 56 };
const INNER_W = WIDTH - PAD.left - PAD.right;
const INNER_H = HEIGHT - PAD.top - PAD.bottom;

// Short periods use daily prices, long ones use monthly prices.
const RANGES = [
  { id: "1m", label: "1M", days: 30, daily: true },
  { id: "6m", label: "6M", days: 182, daily: true },
  { id: "1y", label: "1Y", days: 365, daily: true },
  { id: "5y", label: "5Y", days: 365 * 5, daily: false },
  { id: "10y", label: "10Y", days: 365 * 10, daily: false },
  { id: "all", label: "Max", days: null, daily: false },
];

function money(value) {
  if (value >= 1000) return `$${Math.round(value).toLocaleString("en-US")}`;
  return `$${value.toFixed(2)}`;
}

function monthYear(ms) {
  return new Date(ms).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function dayMonthYear(ms) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function clockTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Chart({ market, quote }) {
  const { color } = market;
  const [range, setRange] = useState("all");
  const [startYear, setStartYear] = useState(null); // set by clicking a year label
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  // The points currently on screen, after the chosen period or clicked year.
  const points = useMemo(() => {
    const monthly = market.monthly || [];
    const daily = market.daily || [];

    if (startYear) {
      const from = new Date(startYear, 0, 1).getTime();
      // Daily detail if that year is inside the 2 years of daily prices we hold.
      const source = daily.length && daily[0].t <= from ? daily : monthly;
      const picked = source.filter((p) => p.t >= from);
      return picked.length > 1 ? picked : monthly;
    }

    const option = RANGES.find((r) => r.id === range);
    if (!option?.days) return monthly;
    const source = option.daily && daily.length ? daily : monthly;
    const from = Date.now() - option.days * 24 * 3600 * 1000;
    const picked = source.filter((p) => p.t >= from);
    return picked.length > 1 ? picked : monthly;
  }, [market.monthly, market.daily, range, startYear]);

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
    const spanDays = (points[points.length - 1].t - points[0].t) / (24 * 3600 * 1000);

    // Short period: show dates, which are not clickable (there is only one year).
    if (spanDays <= 400) {
      const count = Math.min(5, points.length);
      const step = Math.max(1, Math.floor((points.length - 1) / (count - 1)));
      const out = [];
      for (let i = 0; i < points.length; i += step) {
        const d = new Date(points[i].t);
        out.push({
          label: spanDays <= 70
            ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
            : d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
          i,
          year: null,
        });
      }
      return out;
    }

    const years = [...new Set(points.map((p) => new Date(p.t).getFullYear()))];
    const step = Math.max(1, Math.ceil(years.length / 6));
    return years
      .filter((_, i) => i % step === 0)
      .map((year) => ({ label: year, year, i: points.findIndex((p) => new Date(p.t).getFullYear() === year) }));
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
  const livePrice = quote?.price ?? last.v;
  const shown = hover != null ? points[hover] : { v: livePrice, t: quote?.at ?? last.t };
  const changeShown = Number((((livePrice - first.v) / first.v) * 100).toFixed(1));
  const dayChange =
    quote?.previousClose
      ? Number((((livePrice - quote.previousClose) / quote.previousClose) * 100).toFixed(2))
      : null;
  const useDays = points.length > 1 && points[1].t - points[0].t < 20 * 24 * 3600 * 1000;

  return (
    <article className="chart-card">
      <header className="chart-head">
        <div>
          <h2 className="chart-title" style={{ color }}>{market.name}</h2>
          <p className="chart-unit">{market.unit}</p>
        </div>
        <div className="chart-price">
          <span className="chart-last">{money(shown.v)}</span>
          {hover == null ? (
            <span className="chart-when">
              live price
              {dayChange != null && (
                <span className={dayChange >= 0 ? " up" : " down"}>
                  {" "}{dayChange >= 0 ? "▲" : "▼"} {Math.abs(dayChange)}% today
                </span>
              )}
            </span>
          ) : (
            <span className="chart-when">{useDays ? dayMonthYear(shown.t) : monthYear(shown.t)}</span>
          )}
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
            key={`${t.label}-${t.i}`}
            className={t.year ? "chart-year" : undefined}
            role={t.year ? "button" : undefined}
            tabIndex={t.year ? 0 : undefined}
            onMouseDown={t.year ? () => { setStartYear(t.year); setHover(null); } : undefined}
            onTouchStart={t.year ? () => { setStartYear(t.year); setHover(null); } : undefined}
            onKeyDown={t.year ? (e) => { if (e.key === "Enter" || e.key === " ") { setStartYear(t.year); setHover(null); } } : undefined}
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
        {useDays ? dayMonthYear(first.t) : monthYear(first.t)} → now: {changeShown >= 0 ? "+" : ""}{changeShown}%
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

    async function load() {
      try {
        const res = await fetch("/api/markets", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Something went wrong.");
        setData(json);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    load();
    // Keep the prices current while the page stays open.
    const timer = setInterval(load, 60000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
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
            {data.series.map((market) => (
              <Chart key={market.id} market={market} quote={data.quotes?.[market.id]} />
            ))}
          </div>
          {data.refreshedAt && (
            <p className="cache-note">
              Live prices checked at {data.quotedAt ? clockTime(data.quotedAt) : "—"}, refreshed every minute while this page is open ·
              {" "}history updated {new Date(data.refreshedAt).toLocaleDateString()} · source: Yahoo Finance
              {data.stale ? " (the latest history update failed, showing the previous one)" : ""}
            </p>
          )}
        </>
      )}
    </main>
  );
}
