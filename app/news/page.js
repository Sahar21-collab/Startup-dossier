"use client";

import { useEffect, useState } from "react";

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

export default function News() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

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
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <h1 className="title">Tech News</h1>
      <p className="subtitle">The 10 latest AI stories across research, healthcare, robotics, chips and business. Updated daily.</p>

      {!data && !error && <p className="hint">Loading the news. The first load of the day can take up to a minute.</p>}
      {error && <p className="error">{error}</p>}

      {data && (
        <article className="card">
          {data.items?.length ? (
            <ol className="news">
              {data.items.map((item) => (
                <li className="news-item" key={item.url}>
                  {item.field && <span className="news-field">{item.field}</span>}
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
            <p><span className="na">No recent news found. Please check back later.</span></p>
          )}

          {data.refreshedAt && (
            <p className="cache-note">
              Updated {new Date(data.refreshedAt).toLocaleString()}
              {data.stale ? " (the latest refresh failed, showing the previous list)" : ""}
            </p>
          )}
        </article>
      )}
    </main>
  );
}
