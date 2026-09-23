"use client";

import { useRef, useState } from "react";
import { INDUSTRIES } from "@/lib/industries";

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

      <section className="section section-lead">
        <h3>Founder background</h3>
        <p><Value text={result.founderBackground} /></p>
      </section>

      <section className="section section-divided">
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

function PickCompany({ startupName, candidates, onPick }) {
  return (
    <article className="card">
      <h2 className="pick-title">Which {startupName} do you mean?</h2>
      <p className="subtitle">
        Several different companies use this name. Pick one, or type the founder name in the box above and search again.
      </p>
      <ul className="pick-list">
        {candidates.map((c) => (
          <li className="pick-item" key={`${c.name}-${c.founder}-${c.description}`}>
            <div>
              <p className="pick-name">{c.name}</p>
              <p className="meta">{c.description}</p>
              <p className="meta">
                {c.founder !== NA ? `Founded by ${c.founder}` : <span className="na">Founder: {NA}</span>}
              </p>
            </div>
            {c.founder !== NA && (
              <button type="button" className="link-button" onClick={() => onPick(startupName, c.founder)}>
                This one
              </button>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

function IndustryPanel({ open, onToggle, checked, onCheck, lists }) {
  return (
    <aside className={open ? "panel panel-open" : "panel"}>
      <button type="button" className="panel-toggle" onClick={onToggle} aria-expanded={open}>
        <span className={open ? "panel-arrow panel-arrow-open" : "panel-arrow"} aria-hidden="true">▶</span>
        Industries
      </button>

      {open && (
        <div className="panel-body">
          <p className="panel-hint">Tick an industry to see 5 startups founded in the last 5 years.</p>
          <ul className="panel-list">
            {INDUSTRIES.map((industry) => (
              <li key={industry.id}>
                <label className="panel-option">
                  <input
                    type="checkbox"
                    checked={!!checked[industry.id]}
                    onChange={(e) => onCheck(industry.id, e.target.checked)}
                  />
                  <span>{industry.label}</span>
                  {lists[industry.id]?.loading && <span className="panel-spinner">…</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function IndustryResults({ industryId, state, onOpenDossier }) {
  const label = state.data?.label || INDUSTRIES.find((i) => i.id === industryId)?.label || industryId;

  if (state.loading) {
    return (
      <article className="card">
        <h2 className="industry-title">{label}</h2>
        <p className="hint">Looking for startups in {label}. The first time can take up to a minute.</p>
      </article>
    );
  }
  if (state.error) {
    return (
      <article className="card">
        <h2 className="industry-title">{label}</h2>
        <p className="error">{state.error}</p>
      </article>
    );
  }

  const startups = state.data?.startups || [];

  return (
    <article className="card">
      <h2 className="industry-title">{label}</h2>
      <p className="subtitle">Startups founded in the last 5 years, with public evidence that they are doing well.</p>

      {startups.length ? (
        <ol className="industry-list">
          {startups.map((s) => (
            <li className="industry-item" key={s.name}>
              <h3 className="industry-name">{s.name}</h3>
              <p className="meta">
                {[s.foundingYear, s.location].filter((v) => v && v !== NA).join(" · ")}
                {s.founder !== NA ? ` · Founded by ${s.founder}` : ""}
              </p>
              <p className="industry-text">{s.whatTheyDo}</p>
              <p className="industry-text"><strong>Traction:</strong> <Value text={s.evidenceOfSuccess} /></p>
              <p className="industry-links">
                <button type="button" className="link-button" onClick={() => onOpenDossier(s.name, s.founder)}>
                  Open full dossier
                </button>
                {s.sources?.map((src) => (
                  <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer" className="industry-source">
                    {hostname(src.url)}
                  </a>
                ))}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p><span className="na">No startups found with clear public evidence. Try another industry.</span></p>
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

  const founderInput = useRef(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [checked, setChecked] = useState({});
  const [lists, setLists] = useState({});

  async function runSearch(startup, founder) {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupName: startup, founderName: founder }),
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

  function handleSubmit(e) {
    e.preventDefault();
    runSearch(startupName, founderName);
  }

  function openDossier(startup, founder) {
    const known = founder && founder !== NA ? founder : "";
    setStartupName(startup);
    setFounderName(known);
    window.scrollTo({ top: 0, behavior: "smooth" });
    runSearch(startup, known);
  }

  async function handleCheck(id, isChecked) {
    setChecked((prev) => ({ ...prev, [id]: isChecked }));
    if (!isChecked || lists[id]?.data) return;

    setLists((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/industry?id=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setLists((prev) => ({ ...prev, [id]: { loading: false, data: json } }));
    } catch (err) {
      setLists((prev) => ({ ...prev, [id]: { loading: false, error: err.message } }));
    }
  }

  const checkedIds = INDUSTRIES.filter((i) => checked[i.id]).map((i) => i.id);

  return (
    <div className="layout">
      <IndustryPanel
        open={panelOpen}
        onToggle={() => setPanelOpen((v) => !v)}
        checked={checked}
        onCheck={handleCheck}
        lists={lists}
      />

      <main className="page page-with-panel">
        <h1 className="title">Startup Stories</h1>
        <p className="subtitle">Enter a startup name. We search the web and write a sourced summary. Add the founder only if we ask.</p>

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
            ref={founderInput}
            aria-label="Founder name (optional)"
            placeholder="Founder name (optional)"
            value={founderName}
            onChange={(e) => setFounderName(e.target.value)}
            maxLength={100}
          />
          <button type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</button>
        </form>

        {loading && <p className="hint">Searching the web and reading the results. This can take up to a minute.</p>}
        {error && <p className="error">{error}</p>}
        {data?.needsFounder && (
          <PickCompany startupName={data.startupName} candidates={data.candidates} onPick={runSearch} />
        )}
        {data?.result && <Dossier result={data.result} cached={data.cached} savedAt={data.savedAt} />}

        {checkedIds.map((id) => (
          <IndustryResults key={id} industryId={id} state={lists[id] || {}} onOpenDossier={openDossier} />
        ))}
      </main>
    </div>
  );
}
