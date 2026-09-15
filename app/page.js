"use client";

import { useState } from "react";

const NA = "Not enough public data found";

function Value({ text }) {
  if (!text || text === NA) return <span className="na">{NA}</span>;
  return <>{text}</>;
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function StatusLabel({ status }) {
  if (!status || status === NA) return <span className="status status-unknown">Status unknown</span>;
  const cls = status === "active" ? "status-active" : status === "acquired" ? "status-acquired" : "status-closed";
  return <span className={`status ${cls}`}>{status}</span>;
}

function Dossier({ result, cached, savedAt }) {
  const yearAndPlace = [result.foundingYear, result.location].filter((v) => v && v !== NA);

  const facts = [
    ["Business model", result.businessModel],
    ["Sector", result.sector],
    ["Funding stage", result.fundingStage],
    ["Team size", result.teamSize],
    ["Revenue model", result.revenueModel],
  ];

  return (
    <article className="card">
      <header className="card-header">
        <div>
          <h2 className="startup-name">{result.startupName}</h2>
          <p className="meta">
            {yearAndPlace.length ? yearAndPlace.join(" · ") : <span className="na">Founding year and location: {NA}</span>}
          </p>
          <p className="meta">Founded by {result.founderName}</p>
        </div>
        <StatusLabel status={result.status} />
      </header>

      <section className="section">
        <h3>Problem solved</h3>
        <p><Value text={result.problemSolved} /></p>
      </section>

      <section className="section">
        <h3>Value added</h3>
        <p><Value text={result.valueAdded} /></p>
      </section>

      <section className="facts">
        {facts.map(([label, value]) => (
          <div className="fact" key={label}>
            <span className="fact-label">{label}</span>
            <span className="fact-value"><Value text={value} /></span>
          </div>
        ))}
      </section>

      <section className="section">
        <h3>Key KPIs to watch</h3>
        {result.kpis?.length ? (
          <ul className="kpis">
            {result.kpis.map((kpi) => (
              <li key={kpi.metric}>
                <span className="kpi-name">{kpi.metric}</span>
                <span className="kpi-value"><Value text={kpi.value} /></span>
              </li>
            ))}
          </ul>
        ) : (
          <p><span className="na">{NA}</span></p>
        )}
      </section>

      <footer className="card-footer">
        <div>
          <h3>Sources</h3>
          {result.sources?.length ? (
            <ol className="sources">
              {result.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                  <span className="source-host">{hostname(s.url)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p><span className="na">{NA}</span></p>
          )}
        </div>
        <div>
          <h3>Website</h3>
          {result.website && result.website !== NA ? (
            <a href={result.website} target="_blank" rel="noopener noreferrer">{hostname(result.website)} ↗</a>
          ) : (
            <p><span className="na">{NA}</span></p>
          )}
        </div>
      </footer>

      {cached && (
        <p className="cache-note">
          Saved result{savedAt ? ` from ${new Date(savedAt).toLocaleDateString()}` : ""}, not re-searched.
        </p>
      )}
    </article>
  );
}

export default function Home() {
  const [startupName, setStartupName] = useState("");
  const [founderName, setFounderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupName, founderName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <h1 className="title">Startup Dossier</h1>
      <p className="subtitle">Enter a startup and its founder. We search the web and write a sourced summary.</p>

      <form className="search" onSubmit={handleSubmit}>
        <input
          aria-label="Startup name"
          placeholder="Startup name"
          value={startupName}
          onChange={(e) => setStartupName(e.target.value)}
          maxLength={100}
          required
        />
        <input
          aria-label="Founder name"
          placeholder="Founder name"
          value={founderName}
          onChange={(e) => setFounderName(e.target.value)}
          maxLength={100}
          required
        />
        <button type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</button>
      </form>

      {loading && <p className="hint">Searching the web and reading the results. This can take up to 30 seconds.</p>}
      {error && <p className="error">{error}</p>}
      {data && <Dossier result={data.result} cached={data.cached} savedAt={data.savedAt} />}
    </main>
  );
}
