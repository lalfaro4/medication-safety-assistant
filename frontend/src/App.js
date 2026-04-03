import React, { useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [medications, setMedications] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [drugA, setDrugA] = useState("");
  const [drugB, setDrugB] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);

  const [newInteractionReport, setNewInteractionReport] = useState(null);

  const [showMessage, setShowMessage] = useState(false);
  const [showInteractionReport, setShowInteractionReport] = useState(false);

  const loadMedications = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/api/medications");
      const data = await res.json();
      setMedications(data.medications || []);
    } catch (err) {
      console.error(err);
      setError("Could not load saved medications.");
    }
  };

  useEffect(() => {
    loadMedications();
  }, []);

  useEffect(() => {
    if (message) {
      setShowMessage(true);

      const fadeTimer = setTimeout(() => {
        setShowMessage(false);
      }, 2500);

      const removeTimer = setTimeout(() => {
        setMessage("");
      }, 3300);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [message]);

  useEffect(() => {
    if (newInteractionReport) {
      setShowInteractionReport(true);
    }
  }, [newInteractionReport]);

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a medication name.");
      setResults([]);
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch(
        `http://127.0.0.1:5000/api/medications/search?q=${encodeURIComponent(query)}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Search failed.");
      }

      setResults(data.results || []);

      if (!data.results || data.results.length === 0) {
        setMessage("No medications found.");
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMedication = async (med) => {
    setError("");
    setMessage("");
    setNewInteractionReport(null);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/medications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(med),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not save medication.");
      }

      setMessage(data.message || `${med.name} saved.`);
      setNewInteractionReport(data.interactionCheck || null);

      await loadMedications();
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong while saving.");
    }
  };

  const handleDeleteMedication = async (id) => {
    setError("");
    setMessage("");

    try {
      const res = await fetch(`http://127.0.0.1:5000/api/medications/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Could not delete medication.");
      }

      await loadMedications();
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not delete medication.");
    }
  };

  const handleCompare = async () => {
    if (!drugA.trim() || !drugB.trim()) {
      setError("Please enter two medications to compare.");
      return;
    }

    setCompareLoading(true);
    setComparisonResult(null);
    setError("");

    try {
      const res = await fetch(
        `http://127.0.0.1:5001/api/compare-drugs?drugA=${encodeURIComponent(
          drugA
        )}&drugB=${encodeURIComponent(drugB)}`
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Comparison failed.");
      }

      setComparisonResult(data);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not compare medications.");
    } finally {
      setCompareLoading(false);
    }
  };

  const handleCloseInteractionReport = () => {
    setShowInteractionReport(false);
    setTimeout(() => {
      setNewInteractionReport(null);
    }, 350);
  };

  return (
    <div className="app-shell">
      <div className="container">
        <div className="dashboard-card mx-auto">
          <div className="hero-section">
            <p className="eyebrow">Medication Safety Assistant</p>
            <h1 className="app-title">Your medications, all in one place 💊</h1>
            <p className="hero-copy">
              Track, search, and compare medications with interaction awareness.
            </p>
          </div>

          {error && <div className="alert alert-danger mt-4">{error}</div>}

          {message && (
            <div
              className={`alert alert-success mt-4 fade-alert ${
                showMessage ? "fade-in" : "fade-out"
              }`}
            >
              {message}
            </div>
          )}

          {newInteractionReport && (
            <div
              className={`alert alert-warning mt-4 position-relative fade-alert ${
                showInteractionReport ? "fade-in" : "fade-out"
              }`}
            >
              <button
                className="alert-close-btn"
                onClick={handleCloseInteractionReport}
                aria-label="Close"
              >
                ×
              </button>

              <h5 className="mb-3">Interaction check for newly added medication</h5>

              <p className="mb-2">
                Checked against {newInteractionReport.checkedAgainstCount} saved medication
                {newInteractionReport.checkedAgainstCount === 1 ? "" : "s"}.
              </p>

              {newInteractionReport.interactionsFoundCount > 0 ? (
                <>
                  <p className="mb-2">
                    Found {newInteractionReport.interactionsFoundCount} possible interaction
                    {newInteractionReport.interactionsFoundCount === 1 ? "" : "s"}:
                  </p>
                  <ul className="mb-0">
                    {newInteractionReport.interactions.map((item, idx) => (
                      <li key={idx}>
                        <strong>{item.medicationName}</strong>
                        {item.comparison?.summary?.length > 0 && (
                          <>
                            {" — "}
                            {item.comparison.summary.join(" ")}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mb-0">
                  No possible interactions were found in the comparison check.
                </p>
              )}

              {newInteractionReport.compareErrors?.length > 0 && (
                <div className="mt-3">
                  <strong>Some comparisons could not be completed:</strong>
                  <ul className="mb-0">
                    {newInteractionReport.compareErrors.map((item, idx) => (
                      <li key={idx}>
                        {item.withMedication}: {item.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <h2 className="mt-4">Saved Medications</h2>

          <div className="med-grid">
            {medications.map((med) => (
              <div key={med.id} className="med-card">
                <div>
                  <h3 className="med-name">{med.name}</h3>
                  <div className="med-meta">RxCUI: {med.rxcui}</div>
                  {med.synonym && <div className="med-meta">Synonym: {med.synonym}</div>}
                  {med.tty && <div className="med-meta">Type: {med.tty}</div>}
                </div>

                <button
                  className="btn btn-delete"
                  onClick={() => handleDeleteMedication(med.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          <h2 className="mt-5">Search Medications</h2>

          <div className="search-bar-wrap">
            <input
              className="form-control"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
            <button className="btn btn-main" onClick={handleSearch} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
          </div>

          <div className="results-list mt-4">
            {results.map((med) => (
              <div key={med.rxcui} className="result-row">
                <div>
                  <div className="result-name">{med.name}</div>
                  <div className="result-meta">RxCUI: {med.rxcui}</div>
                  {med.synonym && <div className="result-meta">Synonym: {med.synonym}</div>}
                  {med.tty && <div className="result-meta">Type: {med.tty}</div>}
                </div>

                <button className="btn btn-add" onClick={() => handleAddMedication(med)}>
                  Add
                </button>
              </div>
            ))}
          </div>

          <h2 className="mt-5">Compare Medications</h2>

          <div className="compare-grid">
            <input
              className="form-control"
              placeholder="Drug A"
              value={drugA}
              onChange={(e) => setDrugA(e.target.value)}
            />
            <input
              className="form-control"
              placeholder="Drug B"
              value={drugB}
              onChange={(e) => setDrugB(e.target.value)}
            />
            <button className="btn btn-main" onClick={handleCompare} disabled={compareLoading}>
              {compareLoading ? "Comparing..." : "Compare"}
            </button>
          </div>

          {comparisonResult && (
            <div className="comparison-panel mt-4">
              <h4 className="mb-3">
                Possible Interaction:{" "}
                {comparisonResult.comparison?.possibleInteraction ? "Yes" : "No"}
              </h4>

              {comparisonResult.comparison?.summary?.length > 0 && (
                <ul className="mb-0">
                  {comparisonResult.comparison.summary.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
