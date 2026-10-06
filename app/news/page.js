"use client";

import { useEffect, useMemo, useState } from "react";

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// For "All topics": take the first story of each topic, then the second, and so on.
function mixed(categories, limit = 10) {
  const out = [];
  for (let round = 0; out.length < limit; round++) {
    let added = false;
    for (const category of categories) {
      const item = category.items[round];
      if (!item) continue;
      out.push({ ...item, topic: category.label });
      added = true;
      if (out.length >= limit) break;
    }
    if (!added) break;
  }
  return out;
}

export default function News() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/news");
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

  const categories = data?.categories || [];

  const items = useMemo(() => {
    if (!categories.length) return [];
    if (tab === "all") return mixed(categories);
    const category = categories.find((c) => c.id === tab);
    return (category?.items || []).map((item) => ({ ...item, topic: category.label }));
  }, [categories, tab]);

  return (
    <main className="page">
      <h1 className="title">Tech News</h1>
      <p className="subtitle">The latest AI stories, by topic. Updated every day.</p>

      {!data && !error && <p className="hint">Loading the news. The first load of the day can take up to a minute.</p>}
      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <div className="topic-tabs">
            <button
              type="button"
              className={tab === "all" ? "topic-button topic-active" : "topic-button"}
              onClick={() => setTab("all")}
            >
              All topics
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={tab === category.id ? "topic-button topic-active" : "topic-button"}
                onClick={() => setTab(category.id)}
                disabled={category.items.length === 0}
              >
                {category.label}
                <span className="topic-count">{category.items.length}</span>
              </button>
            ))}
          </div>

          <article className="card">
            {items.length ? (
              <ol className="news">
                {items.map((item) => (
                  <li className="news-item" key={item.url}>
                    <span className="news-field">{tab === "all" ? item.topic : item.field || item.topic}</span>
                    <h2 className="news-headline">
                      <a href={item.url} target="_blank" rel="noopener noreferrer">{item.headline}</a>
                    </h2>
                    <p className="news-summary">{item.summary}</p>
                    <p className="news-meta">
                      {hostname(item.url)}
                      {formatDate(item.published) && ` · ${formatDate(item.published)}`}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p><span className="na">No stories found for this topic today. Please check back tomorrow.</span></p>
            )}

            {data.refreshedAt && (
              <p className="cache-note">
                Updated {new Date(data.refreshedAt).toLocaleString()}
                {data.stale ? " (the latest refresh failed, showing the previous list)" : ""}
              </p>
            )}
          </article>
        </>
      )}
    </main>
  );
}
