import React, { useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [savedMedications, setSavedMedications] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const fetchSavedMedications = async () => {
    try {
      const response = await fetch("http://127.0.0.1:5000/api/medications");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load saved medications.");
      }

      setSavedMedications(data.medications || []);
    } catch (err) {
      setError(err.message || "Failed to load saved medications.");
    }
  };

  useEffect(() => {
    fetchSavedMedications();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a medication name.");
      setResults([]);
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setResults([]);

    try {
      const response = await fetch(
        `http://127.0.0.1:5000/api/medications/search?q=${encodeURIComponent(query)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      setResults(data.results || []);
    } catch (err) {
      setError(err.message || "Failed to fetch medication results.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddMedication = async (medication) => {
    setError("");
    setMessage("");

    try {
      const response = await fetch("http://127.0.0.1:5000/api/medications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(medication),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save medication.");
      }

      setMessage(data.message || `Saved ${medication.name} successfully.`);
      fetchSavedMedications();
    } catch (err) {
      setError(err.message || "Failed to save medication.");
    }
  };
    
  const handleDeleteMedication = async (medicationId) => {
      setError("");
      setMessage("");

      try {
        const response = await fetch(
          `http://127.0.0.1:5000/api/medications/${medicationId}`,
          {
            method: "DELETE",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to delete medication.");
        }

        setMessage(data.message || "Medication deleted successfully.");
        fetchSavedMedications();
      } catch (err) {
        setError(err.message || "Failed to delete medication.");
      }
    };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="app-shell">
      <div className="container py-5">
        <div className="search-card mx-auto">
          <h1 className="mb-3">Medication Safety Assistant</h1>
          <p className="text-muted mb-4">
            Search for a medication using RxNav.
          </p>

          <div className="input-group mb-3">
            <input
              type="text"
              className="form-control"
              placeholder="Try Tylenol, ibuprofen, or Benadryl"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="btn btn-primary" onClick={handleSearch}>
              Search
            </button>
          </div>

          {loading && <p>Loading...</p>}

          {error && <div className="alert alert-danger">{error}</div>}

          {message && <div className="alert alert-success">{message}</div>}

          {!loading && !error && results.length > 0 && (
            <div className="mt-4">
              <h2 className="h4 mb-3">Search Results</h2>
              <ul className="list-group mb-4">
                {results.map((item) => (
                  <li
                    key={item.rxcui}
                    className="list-group-item d-flex justify-content-between align-items-start"
                  >
                    <div>
                      <div><strong>{item.name}</strong></div>
                      <div><small>RxCUI: {item.rxcui}</small></div>
                      <div><small>Type: {item.tty || "N/A"}</small></div>
                      <div><small>Score: {item.score}</small></div>
                    </div>

                    <button
                      className="btn btn-outline-success btn-sm"
                      onClick={() => handleAddMedication(item)}
                    >
                      Add Medication
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5">
            <h2 className="h4 mb-3">Saved Medications</h2>

            {savedMedications.length === 0 ? (
              <p className="text-muted mb-0">No medications saved yet.</p>
            ) : (
              <ul className="list-group">
                 {savedMedications.map((med) => (
                   <li
                     key={med.id}
                     className="list-group-item d-flex justify-content-between align-items-start"
                   >
                     <div>
                       <div><strong>{med.name}</strong></div>
                       <div><small>RxCUI: {med.rxcui}</small></div>
                       <div><small>Type: {med.tty || "N/A"}</small></div>
                       <div><small>Score: {med.score || "N/A"}</small></div>
                     </div>

                     <button
                       className="btn btn-outline-danger btn-sm"
                       onClick={() => handleDeleteMedication(med.id)}
                     >
                       Delete
                     </button>
                   </li>
                 ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
