import React, { useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

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

  const [schedules, setSchedules] = useState({});
  const [scheduleForm, setScheduleForm] = useState({});

  const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";

  const COMPARE_API_BASE = process.env.REACT_APP_COMPARE_API_BASE || "http://localhost:5001";

  const loadMedications = async () => {
    try {
      const res = await fetch(
         `${API_BASE}/api/medications`, {
            credentials: "include"
          });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not load saved medications.");
      }
      const meds = data.medications || [];
      setMedications(meds);

      for (const med of meds) {
      loadSchedule(med.id);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not load saved medications.");
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/me`, {
          credentials: "include"
        });
        const data = await response.json();

        if (response.ok && data.authenticated) {
          setCurrentUser(data.user);
          setLoggedIn(true);
        }
      } catch (err) {
        console.error("Session check failed:", err);
      } finally {
        setAuthChecked(true);
      }
    };

    checkSession();
  }, []);

  useEffect(() => {
    if (loggedIn && currentUser) {
      loadMedications(currentUser.id);
    }
  }, [loggedIn, currentUser]);

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

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed.");
      }

      setCurrentUser(data.user);
      setLoggedIn(true);
      setMessage(data.message || "Login successful.");
    } catch (err) {
      setError(err.message || "Login failed.");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Registration failed.");
      }

      setMessage(data.message || "Account created successfully.");
      setIsRegistering(false);
      setName("");
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err.message || "Registration failed.");
    }
  };

  const handleLogout = async () => {
    await fetch(`${API_BASE}/api/logout`, {
      method: "POST",
      credentials: "include",
    })
    setLoggedIn(false);
    setCurrentUser(null);
    setEmail("");
    setPassword("");
    setName("");
    setQuery("");
    setResults([]);
    setMedications([]);
    setMessage("");
    setError("");
    setDrugA("");
    setDrugB("");
    setComparisonResult(null);
    setNewInteractionReport(null);
  };

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
        `${API_BASE}/api/medications/search?q=${encodeURIComponent(query)}`
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

    if (!currentUser?.id) {
      setError("No logged-in user found.");
      return;
    }

    const payload = {
      rxcui: med.rxcui,
      name: med.name,
      tty: med.tty,
      synonym: med.synonym,
      score: med.score,
    };

    try {
      const res = await fetch(`${API_BASE}/api/medications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not save medication.");
      }

      setMessage(data.message || `${med.name} saved.`);
      setNewInteractionReport(data.interactionCheck || null);

      await loadMedications(currentUser.id);
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong while saving.");
    }
  };

  const handleDeleteMedication = async (id) => {
    setError("");
    setMessage("");

    try {
      const res = await fetch(
        `${API_BASE}/api/medications/${id}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not delete medication.");
      }

      setMessage(data.message || "Medication deleted successfully.");
      await loadMedications(currentUser.id);
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
        `${COMPARE_API_BASE}/api/compare-drugs?drugA=${encodeURIComponent(
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
  const handleAddSchedule = async (medicationId) => {
    const form = scheduleForm[medicationId] || {};
    const day_of_week = form.day_of_week || "";
    const time_of_day = form.time_of_day || "";

    if (!day_of_week || !time_of_day) {
      setError("Please choose a day and time.");
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/api/medications/${medicationId}/schedule`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: "include",
          body: JSON.stringify({ day_of_week, time_of_day })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not add schedule.");
      }

      setMessage(data.message || "Schedule added.");
      setScheduleForm((prev) => ({
        ...prev,
        [medicationId]: { day_of_week: "", time_of_day: "" }
      }));

      await loadSchedule(medicationId);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not add schedule.");
    }
  };

  const handleDeleteSchedule = async (medicationId, scheduleId) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/medication-schedules/${scheduleId}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not delete schedule.");
      }

      setMessage(data.message || "Schedule deleted.");
      await loadSchedule(medicationId);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not delete schedule.");
    }
  };


  const loadSchedule = async (medicationId) => {
  try {
    const res = await fetch(
      `${API_BASE}/api/medications/${medicationId}/schedule`,
      { credentials: "include" }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Could not load schedule.");
    }

    setSchedules((prev) => ({
      ...prev,
      [medicationId]: data.schedule || []
    }));
  } catch (err) {
    console.error(err);
  }
};

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleSearch();
    }
  };

if (!authChecked) {
  return (
    <div className="app-shell">
      <div className="container py-5">
        <div
          className="search-card mx-auto text-center"
          style={{ maxWidth: "450px" }}
        >
          <h1 className="mb-3">Medication Safety Assistant</h1>
          <p className="text-muted mb-4">Loading...</p>

          <div className="spinner-border text-primary"
               style={{ width: "5rem", height: "5rem" }}
               role="status"
          >
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

if (!loggedIn) {
    return (
      <div className="app-shell">
        <div className="container py-5">
          <div className="search-card mx-auto" style={{ maxWidth: "450px" }}>
            <h1 className="mb-3">Medication Safety Assistant</h1>
            <p className="text-muted mb-4">
              {isRegistering ? "Create an account." : "Log in to continue."}
            </p>

            {error && <div className="alert alert-danger">{error}</div>}
            {message && <div className="alert alert-success">{message}</div>}

            <form onSubmit={isRegistering ? handleRegister : handleLogin}>
              {isRegistering && (
                <div className="mb-3">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              <div className="mb-3">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary w-100">
                {isRegistering ? "Create Account" : "Log In"}
              </button>
            </form>

            <button
              className="btn btn-link w-100 mt-3"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError("");
                setMessage("");
              }}
            >
              {isRegistering
                ? "Already have an account? Log in"
                : "Need an account? Create one"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="container">
        <div className="dashboard-card mx-auto">
          <div className="hero-section d-flex justify-content-between align-items-start">
            <div>
              <p className="eyebrow">Medication Safety Assistant</p>
              <h1 className="app-title">Your medications, all in one place 💊</h1>
              <p className="hero-copy">
                Track, search, and compare medications with interaction awareness.
              </p>
              {currentUser && (
                <p className="text-muted mb-0">Logged in as {currentUser.name}</p>
              )}
            </div>

            <button className="btn btn-outline-secondary btn-sm" onClick={handleLogout}>
              Log Out
            </button>
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
            {medications.length === 0 ? (
              <p className="text-muted">No medications saved yet.</p>
            ) : (
              medications.map((med) => (
                <div key={med.id} className="med-card">
                  <div>
                    <h3 className="med-name">{med.name}</h3>
                    <div className="med-meta">RxCUI: {med.rxcui}</div>
                    {med.synonym && <div className="med-meta">Synonym: {med.synonym}</div>}
                    {med.tty && <div className="med-meta">Type: {med.tty}</div>}

                    <div className="mt-3">
                      <h5 className="mb-2">Schedule</h5>

                      {schedules[med.id]?.length > 0 ? (
                        <ul className="list-unstyled mb-3">
                          {schedules[med.id].map((entry) => (
                            <li
                              key={entry.id}
                              className="d-flex justify-content-between align-items-center mb-2"
                            >
                              <span>
                                {entry.day_of_week} — {entry.time_of_day}
                              </span>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleDeleteSchedule(med.id, entry.id)}
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted mb-3">No schedule added yet.</p>
                      )}

                      <div className="d-flex gap-2 flex-wrap">
                        <select
                          className="form-select schedule-select"
                          style={{ maxWidth: "160px" }}
                          value={scheduleForm[med.id]?.day_of_week || ""}
                          onChange={(e) =>
                            setScheduleForm((prev) => ({
                              ...prev,
                              [med.id]: {
                                ...prev[med.id],
                                day_of_week: e.target.value
                              }
                            }))
                          }
                        >
                          <option value="">Day</option>
                          <option value="Monday">Monday</option>
                          <option value="Tuesday">Tuesday</option>
                          <option value="Wednesday">Wednesday</option>
                          <option value="Thursday">Thursday</option>
                          <option value="Friday">Friday</option>
                          <option value="Saturday">Saturday</option>
                          <option value="Sunday">Sunday</option>
                        </select>

                        <input
                          type="time"
                          className="form-control schedule-time-input"
                          value={scheduleForm[med.id]?.time_of_day || ""}
                          onChange={(e) =>
                            setScheduleForm((prev) => ({
                              ...prev,
                              [med.id]: {
                                ...prev[med.id],
                                time_of_day: e.target.value
                              }
                            }))
                          }
                        />

                        <button
                          className="btn btn-sm btn-outline-success"
                          onClick={() => handleAddSchedule(med.id)}
                        >
                          Add Schedule
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    className="btn btn-delete"
                    onClick={() => handleDeleteMedication(med.id)}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
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