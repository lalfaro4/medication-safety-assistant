import React, { useEffect, useState, useCallback, useRef } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

const API_BASE = (process.env.REACT_APP_API_BASE || "http://localhost:5000").trim().replace(/\/$/, "");
const COMPARE_API_BASE = (process.env.REACT_APP_COMPARE_API_BASE || "http://localhost:5001/api")
  .trim()
  .replace(/\/$/, "");

const DETAIL_TRIGGER_CONFIG = [
  {
    flag: "aMentionsBInInteractions",
    sectionKey: "drugInteractions",
    sectionLabel: "Drug interactions",
    sourceDetailKey: "drugADetails",
    targetDetailKey: "drugBDetails"
  },
  {
    flag: "bMentionsAInInteractions",
    sectionKey: "drugInteractions",
    sectionLabel: "Drug interactions",
    sourceDetailKey: "drugBDetails",
    targetDetailKey: "drugADetails"
  },
  {
    flag: "aMentionsBInWarnings",
    sectionKey: "warnings",
    sectionLabel: "Warnings",
    sourceDetailKey: "drugADetails",
    targetDetailKey: "drugBDetails"
  },
  {
    flag: "bMentionsAInWarnings",
    sectionKey: "warnings",
    sectionLabel: "Warnings",
    sourceDetailKey: "drugBDetails",
    targetDetailKey: "drugADetails"
  },
  {
    flag: "aMentionsBInContraindications",
    sectionKey: "contraindications",
    sectionLabel: "Contraindications",
    sourceDetailKey: "drugADetails",
    targetDetailKey: "drugBDetails"
  },
  {
    flag: "bMentionsAInContraindications",
    sectionKey: "contraindications",
    sectionLabel: "Contraindications",
    sourceDetailKey: "drugBDetails",
    targetDetailKey: "drugADetails"
  }
];

function collectNames(detail, fallbackName) {
  const matchedLabel = detail?.matchedLabel || {};
  const names = [
    fallbackName,
    detail?.drugQuery,
    matchedLabel.brandName,
    matchedLabel.genericName,
    ...(matchedLabel.substanceNames || [])
  ];

  return names
    .filter(Boolean)
    .map((name) => name.trim())
    .filter(Boolean);
}

function getPreferredDrugName(detail, fallbackName) {
  const matchedLabel = detail?.matchedLabel || {};
  return fallbackName || matchedLabel.brandName || matchedLabel.genericName || "Unknown medication";
}

function truncateExcerpt(text, maxLength = 220) {
  if (!text || text.length <= maxLength) return text || "";
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function findRelevantSectionEntry(sectionEntries, targetNames) {
  if (!Array.isArray(sectionEntries) || sectionEntries.length === 0) return "";

  const normalizedNames = targetNames
    .filter(Boolean)
    .map((name) => name.toLowerCase());

  const matchedEntry = sectionEntries.find((entry) => {
    const lowered = entry.toLowerCase();
    return normalizedNames.some((name) => lowered.includes(name));
  });

  return matchedEntry || sectionEntries[0] || "";
}

function buildInteractionDetails(item) {
  const evidence = item?.comparison?.evidence || {};

  return DETAIL_TRIGGER_CONFIG.filter((config) => evidence[config.flag]).map((config) => {
    const sourceDetail = item?.[config.sourceDetailKey];
    const targetDetail = item?.[config.targetDetailKey];

    const sourceName = getPreferredDrugName(
      sourceDetail,
      config.sourceDetailKey === "drugADetails" ? item?.comparison?.drugA : item?.comparison?.drugB
    );
    const targetName = getPreferredDrugName(
      targetDetail,
      config.targetDetailKey === "drugADetails" ? item?.comparison?.drugA : item?.comparison?.drugB
    );

    const fullLabelText = findRelevantSectionEntry(
      sourceDetail?.interactionEvidence?.[config.sectionKey] || [],
      collectNames(targetDetail, targetName)
    );

    return {
      id: `${config.flag}-${sourceName}-${targetName}`,
      sectionLabel: config.sectionLabel,
      sourceName,
      targetName,
      excerpt: truncateExcerpt(fullLabelText),
      sourceFullLabel: buildFullCompareLabel(sourceDetail),
      targetFullLabel: buildFullCompareLabel(targetDetail)
    };
  });
}

function buildFullCompareLabel(detail) {
  const sections = detail?.interactionEvidence || {};
  const sectionOrder = [
    ["boxedWarning", "Boxed warning"],
    ["contraindications", "Contraindications"],
    ["warnings", "Warnings"],
    ["warningsAndCautions", "Warnings and cautions"],
    ["drugInteractions", "Drug interactions"],
    ["labInteractions", "Lab interactions"]
  ];

  return sectionOrder
    .map(([key, label]) => {
      const entries = sections[key] || [];
      if (!entries.length) return "";
      return `${label}:\n${entries.join("\n\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

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
  const [expandedInteractionDetails, setExpandedInteractionDetails] = useState({});
  const [expandedFullLabels, setExpandedFullLabels] = useState({});

  const [showMessage, setShowMessage] = useState(false);
  const [showInteractionReport, setShowInteractionReport] = useState(false);

  const [schedules, setSchedules] = useState({});
  const [scheduleForm, setScheduleForm] = useState({});
  const [medicationDetailsForm, setMedicationDetailsForm] = useState({});
  const [savingMedicationDetails, setSavingMedicationDetails] = useState({});
  const [expandedMedicationDetails, setExpandedMedicationDetails] = useState({});
  const latestSearchRequestRef = useRef(0);
  const [expandedCompareLabels, setExpandedCompareLabels] = useState({});

  const [profile, setProfile] = useState({
    name: "",
    age: "",
    allergies: "",
    conditions: "",
    notes: "",
    favorite_pharmacy_name: "",
    favorite_pharmacy_address: "",
    favorite_pharmacy_phone: "",
    favorite_pharmacy_place_id: ""
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [currentView, setCurrentView] = useState("dashboard");

  const [pharmacyQuery, setPharmacyQuery] = useState("");
  const [pharmacyResults, setPharmacyResults] = useState([]);
  const [pharmacyLoading, setPharmacyLoading] = useState(false);


  const loadProfile = useCallback(async () => {
    try {
      setError("");
      setProfileMessage("");

      const res = await fetch(`${API_BASE}/api/profile`, {
        credentials: "include"
      });

      const contentType = res.headers.get("content-type") || "";
      let data;

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Expected JSON, got: ${text.slice(0, 200)}`);
      }

      if (!res.ok) {
        throw new Error(data.error || "Could not load profile.");
      }

      setProfile({
        name: data.profile?.name || "",
        age: data.profile?.age ?? "",
        allergies: data.profile?.allergies || "",
        conditions: data.profile?.conditions || "",
        notes: data.profile?.notes || "",
        favorite_pharmacy_name: data.profile?.favorite_pharmacy_name || "",
        favorite_pharmacy_address: data.profile?.favorite_pharmacy_address || "",
        favorite_pharmacy_phone: data.profile?.favorite_pharmacy_phone || "",
        favorite_pharmacy_place_id: data.profile?.favorite_pharmacy_place_id || ""
      });
    } catch (err) {
      console.error("Could not load profile:", err);
      setError(err.message || "Could not load profile.");
    }
  }, []);

    const loadSchedule = useCallback(async (medicationId) => {
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
  }, []);

  const loadMedications = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/medications`, {
        credentials: "include"
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not load saved medications.");
      }

      const meds = data.medications || [];
      setMedications(meds);
      setMedicationDetailsForm(
        meds.reduce((acc, med) => {
          acc[med.id] = {
            dosage: med.dosage || "",
            notes: med.notes || ""
          };
          return acc;
        }, {})
      );

      for (const med of meds) {
        loadSchedule(med.id);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not load saved medications.");
    }
  }, [loadSchedule]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log("API_BASE:", API_BASE);
        console.log("Calling:", `${API_BASE}/api/me`);
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
      loadMedications();
      loadProfile();
    }
  }, [loggedIn, currentUser, loadMedications, loadProfile]);

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
      setExpandedInteractionDetails({});
      setExpandedFullLabels({});
    }
  }, [newInteractionReport]);

  useEffect(() => {
  if (loggedIn && currentUser && currentView === "profile") {
    loadProfile();
  }
}, [loggedIn, currentUser, currentView, loadProfile]);

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
    setExpandedInteractionDetails({});
    setExpandedFullLabels({});
    setExpandedCompareLabels({});
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a medication name.");
      setResults([]);
      return;
    }

    const searchRequestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = searchRequestId;

    setLoading(true);
    setError("");
    setMessage("");
    setResults([]);

    try {
      const res = await fetch(
        `${API_BASE}/api/medications/search?q=${encodeURIComponent(query)}`
      );
      const data = await res.json();

      if (latestSearchRequestRef.current !== searchRequestId) {
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Search failed.");
      }

      setResults(data.results || []);

      if (!data.results || data.results.length === 0) {
        setMessage("No medications found.");
      }
    } catch (err) {
      if (latestSearchRequestRef.current !== searchRequestId) {
        return;
      }

      console.error(err);
      setError(err.message || "Search failed.");
      setResults([]);
    } finally {
      if (latestSearchRequestRef.current === searchRequestId) {
        setLoading(false);
      }
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
      await loadMedications();
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not delete medication.");
    }
  };

  const handleMedicationDetailsChange = (medicationId, field, value) => {
    setMedicationDetailsForm((prev) => ({
      ...prev,
      [medicationId]: {
        ...(prev[medicationId] || { dosage: "", notes: "" }),
        [field]: value
      }
    }));
  };

  const handleSaveMedicationDetails = async (medicationId) => {
    const form = medicationDetailsForm[medicationId] || { dosage: "", notes: "" };

    setError("");
    setSavingMedicationDetails((prev) => ({
      ...prev,
      [medicationId]: true
    }));

    try {
      const res = await fetch(`${API_BASE}/api/medications/${medicationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          dosage: form.dosage,
          notes: form.notes
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not update medication details.");
      }

      const updatedMedication = data.medication;

      setMedications((prev) =>
        prev.map((med) => (med.id === medicationId ? updatedMedication : med))
      );
      setMedicationDetailsForm((prev) => ({
        ...prev,
        [medicationId]: {
          dosage: updatedMedication.dosage || "",
          notes: updatedMedication.notes || ""
        }
      }));
      setExpandedMedicationDetails((prev) => ({
        ...prev,
        [medicationId]: false
      }));
      setMessage(data.message || "Medication details updated.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not update medication details.");
    } finally {
      setSavingMedicationDetails((prev) => ({
        ...prev,
        [medicationId]: false
      }));
    }
  };

  const toggleMedicationDetails = (medicationId) => {
    setExpandedMedicationDetails((prev) => ({
      ...prev,
      [medicationId]: !prev[medicationId]
    }));
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
      const compareUrl = new URL(`${COMPARE_API_BASE}/compare-drugs`);
      compareUrl.searchParams.set("drugA", drugA.trim());
      compareUrl.searchParams.set("drugB", drugB.trim());

      const res = await fetch(compareUrl.toString());

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Comparison failed.");
      }

      setComparisonResult(data);
      setExpandedCompareLabels({});
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
      setExpandedInteractionDetails({});
      setExpandedFullLabels({});
    }, 350);
  };

  const toggleInteractionDetails = (key) => {
    setExpandedInteractionDetails((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleFullLabel = (key) => {
    setExpandedFullLabels((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleCompareLabel = (key) => {
    setExpandedCompareLabels((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
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
      setExpandedMedicationDetails((prev) => ({
        ...prev,
        [medicationId]: false
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

  const handleSaveProfile = async () => {
  setProfileLoading(true);
  setError("");
  setProfileMessage("");

  try {
    const res = await fetch(`${API_BASE}/api/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(profile)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Could not save profile.");
    }

    setProfile(data.profile);
    setProfileMessage(data.message || "Profile saved successfully.");
  } catch (err) {
    console.error(err);
    setError(err.message || "Could not save profile.");
  } finally {
    setProfileLoading(false);
  }
};

  const handlePharmacySearch = async () => {
    if (!pharmacyQuery.trim()) {
      setError("Please enter a pharmacy name, city, or ZIP code.");
      setPharmacyResults([]);
      return;
    }

    setError("");
    setPharmacyLoading(true);

    try {
      const res = await fetch(
        `${API_BASE}/api/pharmacies/search?query=${encodeURIComponent(pharmacyQuery)}`,
        { credentials: "include" }
      );

      const contentType = res.headers.get("content-type") || "";
      let data;

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Expected JSON, got: ${text.slice(0, 200)}`);
      }

      if (!res.ok) {
        throw new Error(data.error || "Could not search pharmacies.");
      }

      setPharmacyResults(data.results || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not search pharmacies.");
      setPharmacyResults([]);
    } finally {
      setPharmacyLoading(false);
    }
  };

  const handleSelectFavoritePharmacy = (pharmacy) => {
    setProfile((prev) => ({
      ...prev,
      favorite_pharmacy_name: pharmacy.name || "",
      favorite_pharmacy_address: pharmacy.address || "",
      favorite_pharmacy_phone: pharmacy.phone || "",
      favorite_pharmacy_place_id: pharmacy.place_id || ""
    }));

    setProfileMessage("Favorite pharmacy selected. Click Save Profile to keep it.");
  };

  const handleClearFavoritePharmacy = () => {
    setProfile((prev) => ({
      ...prev,
      favorite_pharmacy_name: "",
      favorite_pharmacy_address: "",
      favorite_pharmacy_phone: "",
      favorite_pharmacy_place_id: ""
    }));

    setProfileMessage("Favorite pharmacy cleared. Click Save Profile to keep this change.");
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

            <div className="d-flex gap-2">
              <button
                className={`btn btn-sm ${currentView === "dashboard" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setCurrentView("dashboard")}
              >
                Dashboard
              </button>

              <button
                className={`btn btn-sm ${currentView === "profile" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setCurrentView("profile")}
              >
                Profile
              </button>

              <button className="btn btn-outline-secondary btn-sm" onClick={handleLogout}>
                Log Out
              </button>
            </div>
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

              <h5 className="mb-3">Medication check complete</h5>

              <p className="mb-2">
                Checked against {newInteractionReport.checkedAgainstCount} saved medication
                {newInteractionReport.checkedAgainstCount === 1 ? "" : "s"}.
              </p>

              {newInteractionReport.interactionsFoundCount > 0 ? (
                <>
                <p className="mb-2">
                {newInteractionReport.interactionsFoundCount} medication pairing
                {newInteractionReport.interactionsFoundCount === 1 ? "" : "s"} should be reviewed:
                </p>
                  <ul className="mb-0">
                    {newInteractionReport.interactions.map((item, idx) => {
                      const detailsKey = `${item.medicationId || item.medicationName || idx}`;
                      const detailRows = buildInteractionDetails(item);
                      const isExpanded = Boolean(expandedInteractionDetails[detailsKey]);

                      return (
                        <li key={detailsKey} className="interaction-warning-item">
                          <div className="interaction-warning-summary">
                            <div>
                              <strong>{item.medicationName}</strong>
                              {item.comparison?.summary?.length > 0 && (
                                <>
                                  {" — "}
                                  {item.comparison.summary.join(" ")}
                                </>
                              )}
                            </div>

                            {detailRows.length > 0 && (
                              <button
                                type="button"
                                className="btn btn-link interaction-details-toggle"
                                onClick={() => toggleInteractionDetails(detailsKey)}
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? "Hide label details" : "View label details"}
                              </button>
                            )}
                          </div>

                          {isExpanded && detailRows.length > 0 && (
                            <div className="interaction-details-panel">
                              {detailRows.map((detail) => (
                                <div key={detail.id} className="interaction-detail-row">
                                  <div>
                                    <strong>Section:</strong> {detail.sectionLabel}
                                  </div>
                                  <div>
                                    <strong>Matched drug pair:</strong> {detail.sourceName} + {detail.targetName}
                                  </div>
                                  {detail.excerpt && (
                                    <div>
                                      <strong>Label excerpt:</strong> {detail.excerpt}
                                      <div className="interaction-full-label-wrap">
                                        {[
                                          {
                                            key: `${detailsKey}-${detail.id}-source`,
                                            label: detail.sourceName,
                                            fullLabel: detail.sourceFullLabel
                                          },
                                          {
                                            key: `${detailsKey}-${detail.id}-target`,
                                            label: detail.targetName,
                                            fullLabel: detail.targetFullLabel
                                          }
                                        ].map((labelItem) => {
                                          if (!labelItem.fullLabel) return null;

                                          return (
                                            <div key={labelItem.key} className="compare-label-block">
                                              <button
                                                type="button"
                                                className="btn btn-link interaction-full-label-toggle"
                                                onClick={() => toggleFullLabel(labelItem.key)}
                                                aria-expanded={Boolean(
                                                  expandedFullLabels[labelItem.key]
                                                )}
                                              >
                                                {expandedFullLabels[labelItem.key]
                                                  ? `Hide full warning label for ${labelItem.label}`
                                                  : `Show full warning label for ${labelItem.label}`}
                                              </button>

                                              {expandedFullLabels[labelItem.key] && (
                                                <div className="interaction-full-label-text">
                                                  {labelItem.fullLabel}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="mb-0">
                   No direct interaction-related mentions were found in the fetched labels.
                </p>
              )}

              {newInteractionReport.compareErrors?.length > 0 && (
                <div className="mt-3">
                  <strong>Some medications could not be checked right now:</strong>
                  <ul className="mb-0">
                    {newInteractionReport.compareErrors.map((item, idx) => (
                      <li key={idx}>
                        {item.withMedication}: {item.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="comparison-note mt-3">
                <p className="mb-2">
                  This label information comes from FDA drug labeling text returned through
                  OpenFDA and compared for matching interaction-related language.
                </p>
                <p className="mb-0">
                  It should not be used as medical advice because label text can be incomplete,
                  context-specific, and not tailored to a person&apos;s dose, history, or other
                  medications.
                </p>
              </div>
            </div>
          )}

          {currentView === "profile" ? (
            <>
              <h2 className="mt-4">Profile</h2>

              {profileMessage && (
                <div className="alert alert-success mt-3">
                  {profileMessage}
                </div>
              )}

              <div className="search-card mt-3">
                <div className="mb-3">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={profile.name}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Enter your name"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Age</label>
                  <input
                    type="number"
                    className="form-control"
                    value={profile.age}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, age: e.target.value }))
                    }
                    placeholder="Enter your age"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Allergies</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    value={profile.allergies}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, allergies: e.target.value }))
                    }
                    placeholder="Example: penicillin, peanuts"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Conditions</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    value={profile.conditions}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, conditions: e.target.value }))
                    }
                    placeholder="Example: asthma, diabetes"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={profile.notes}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Add any personal notes"
                  />
                </div>

                <div className="mt-4">
                  <h5>Favorite Pharmacy</h5>
                  {profile.favorite_pharmacy_name ? (
                    <div className="border rounded p-3 bg-light">
                      <div><strong>{profile.favorite_pharmacy_name}</strong></div>
                      {profile.favorite_pharmacy_address && (
                        <div>{profile.favorite_pharmacy_address}</div>
                      )}
                      {profile.favorite_pharmacy_phone && (
                        <div>{profile.favorite_pharmacy_phone}</div>
                      )}
                      <button
                        className="btn btn-sm btn-outline-danger mt-3"
                        onClick={handleClearFavoritePharmacy}
                      >
                        Remove Favorite Pharmacy
                      </button>
                    </div>
                  ) : (
                    <p className="text-muted">No favorite pharmacy selected yet.</p>
                  )}
                </div>

                <div className="mt-4">
                  <h5>Search for a Pharmacy</h5>

                  <div className="d-flex gap-2 flex-wrap">
                    <input
                      type="text"
                      className="form-control"
                      style={{ maxWidth: "420px" }}
                      value={pharmacyQuery}
                      onChange={(e) => setPharmacyQuery(e.target.value)}
                      placeholder="Search by pharmacy name, city, or ZIP"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handlePharmacySearch();
                      }}
                    />

                    <button
                      className="btn btn-outline-primary"
                      onClick={handlePharmacySearch}
                      disabled={pharmacyLoading}
                    >
                      {pharmacyLoading ? "Searching..." : "Search"}
                    </button>
                  </div>

                  {pharmacyResults.length > 0 && (
                    <div className="mt-3">
                      {pharmacyResults.map((pharmacy) => (
                        <div
                          key={pharmacy.place_id}
                          className="border rounded p-3 mb-2 d-flex justify-content-between align-items-start"
                        >
                          <div>
                            <div><strong>{pharmacy.name}</strong></div>
                            {pharmacy.address && <div>{pharmacy.address}</div>}
                            {pharmacy.phone && <div>{pharmacy.phone}</div>}
                          </div>

                          <button
                            className="btn btn-sm btn-outline-success"
                            onClick={() => handleSelectFavoritePharmacy(pharmacy)}
                          >
                            Set Favorite
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  className="btn btn-main mt-3"
                  onClick={handleSaveProfile}
                  disabled={profileLoading}
                >
                  {profileLoading ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4">
                <h2>Quick Profile Summary</h2>

                <div className="search-card mt-3">
                  <div className="mb-2">
                    <strong>Name:</strong> {profile.name || "Not set"}
                  </div>
                  <div className="mb-2">
                    <strong>Favorite Pharmacy:</strong> {profile.favorite_pharmacy_name || "Not set"}
                  </div>
                  {profile.favorite_pharmacy_address && (
                    <div className="text-muted">{profile.favorite_pharmacy_address}</div>
                  )}

                  <button
                    className="btn btn-outline-primary btn-sm mt-3"
                    onClick={() => setCurrentView("profile")}
                  >
                    View Profile
                  </button>
                </div>
              </div>
              <h2 className="mt-4">Saved Medications</h2>

              <div className="med-grid">
                {medications.length === 0 ? (
                  <p className="text-muted">No medications saved yet.</p>
                ) : (
                  medications.map((med) => {
                    const detailsForm = medicationDetailsForm[med.id] || { dosage: "", notes: "" };
                    const medicationSchedule = schedules[med.id] || [];
                    const hasSavedPersonalDetails = Boolean(
                      (med.dosage && med.dosage.trim()) || (med.notes && med.notes.trim())
                    );
                    const hasSavedSchedule = medicationSchedule.length > 0;
                    const isDetailsExpanded = Boolean(expandedMedicationDetails[med.id]);

                    return (
                      <div key={med.id} className="med-card">
                        <div>
                          <h3 className="med-name">{med.name}</h3>
                          <div className="med-meta">RxCUI: {med.rxcui}</div>
                          {med.synonym && <div className="med-meta">Synonym: {med.synonym}</div>}
                          {med.tty && <div className="med-meta">Type: {med.tty}</div>}

                          <div className="mt-3 medication-details-block">
                            <button
                              type="button"
                              className="btn btn-sm med-detail-toggle-btn"
                              onClick={() => toggleMedicationDetails(med.id)}
                              aria-expanded={isDetailsExpanded}
                            >
                              {isDetailsExpanded
                                ? "Hide personal details"
                                : hasSavedPersonalDetails || hasSavedSchedule
                                  ? "Edit personal details"
                                  : "Add personal details"}
                            </button>

                            {(hasSavedPersonalDetails || hasSavedSchedule) && !isDetailsExpanded && (
                              <div className="med-detail-preview">
                                {med.dosage && <div><strong>Dosage:</strong> {med.dosage}</div>}
                                {med.notes && <div><strong>Notes:</strong> {med.notes}</div>}
                                {hasSavedSchedule && (
                                  <div>
                                    <strong>Schedule:</strong> {medicationSchedule
                                      .map((entry) => `${entry.day_of_week} - ${entry.time_of_day}`)
                                      .join(", ")}
                                  </div>
                                )}
                              </div>
                            )}

                            {isDetailsExpanded && (
                              <div className="med-detail-panel">
                                <label className="med-detail-label" htmlFor={`dosage-${med.id}`}>
                                  Dosage
                                </label>
                                <input
                                  id={`dosage-${med.id}`}
                                  type="text"
                                  className="form-control med-detail-input"
                                  placeholder="Ex: 10 mg once daily"
                                  value={detailsForm.dosage}
                                  onChange={(e) =>
                                    handleMedicationDetailsChange(med.id, "dosage", e.target.value)
                                  }
                                />

                                <label className="med-detail-label mt-3" htmlFor={`notes-${med.id}`}>
                                  Notes
                                </label>
                                <textarea
                                  id={`notes-${med.id}`}
                                  className="form-control med-notes-input"
                                  placeholder="Add reminders, side effects, or anything else to track"
                                  value={detailsForm.notes}
                                  onChange={(e) =>
                                    handleMedicationDetailsChange(med.id, "notes", e.target.value)
                                  }
                                />

                                <button
                                  className="btn btn-sm btn-outline-secondary med-detail-save-btn mt-3"
                                  onClick={() => handleSaveMedicationDetails(med.id)}
                                  disabled={Boolean(savingMedicationDetails[med.id])}
                                >
                                  {savingMedicationDetails[med.id] ? "Saving..." : "Save details"}
                                </button>

                                <div className="med-schedule-section">
                                  <h5 className="mb-2">Schedule</h5>

                                  {medicationSchedule.length > 0 ? (
                                    <ul className="list-unstyled mb-3">
                                      {medicationSchedule.map((entry) => (
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
                            )}
                          </div>
                        </div>

                        <button
                          className="btn btn-delete"
                          onClick={() => handleDeleteMedication(med.id)}
                        >
                          Delete
                        </button>
                      </div>
                    );
                  })
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
                Review recommended:{" "}
                {comparisonResult.comparison?.possibleInteraction ? "Yes" : "No"}
              </h4>

              {comparisonResult.comparison?.summary?.length > 0 && (
                <ul className="mb-0">
                  {comparisonResult.comparison.summary.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}

              <div className="comparison-note mt-3">
                <p className="mb-2">
                  This label information comes from FDA drug labeling text returned through
                  OpenFDA and compared for matching interaction-related language.
                </p>
                <p className="mb-0">
                  It should not be used as medical advice because label text can be incomplete,
                  context-specific, and not tailored to a person&apos;s dose, history, or other
                  medications.
                </p>
              </div>

              <div className="compare-label-actions mt-3">
                {[
                  {
                    key: "drugA",
                    label: comparisonResult.comparison?.drugA || "Drug A",
                    detail: comparisonResult.drugADetails
                  },
                  {
                    key: "drugB",
                    label: comparisonResult.comparison?.drugB || "Drug B",
                    detail: comparisonResult.drugBDetails
                  }
                ].map(({ key, label, detail }) => {
                  const fullLabel = buildFullCompareLabel(detail);

                  if (!fullLabel) return null;

                  return (
                    <div key={key} className="compare-label-block">
                      <button
                        type="button"
                        className="btn btn-link interaction-full-label-toggle"
                        onClick={() => toggleCompareLabel(key)}
                        aria-expanded={Boolean(expandedCompareLabels[key])}
                      >
                        {expandedCompareLabels[key]
                          ? `Hide full warning label for ${label}`
                          : `Show full warning label for ${label}`}
                      </button>

                      {expandedCompareLabels[key] && (
                        <div className="comparison-full-label-text">
                          {fullLabel}
                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
