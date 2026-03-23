import logo from './logo.svg';
import './App.css';
import { useEffect, useState } from "react";


function App() {
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    fetch("http://127.0.0.1:5000/api/health")
      .then((res) => res.json())
      .then((data) => setMessage(data.status))
      .catch(() => setMessage("Backend not connected"));
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <h1>Medication Safety Assistant</h1>
        <p>Frontend is running.</p>

        // button to test flask and cors is running and if frontend reaches backend
      <a href="http://127.0.0.1:5000/api/health" target="_blank" rel="noreferrer">
        <button
          style={{
            padding: "10px 16px",
            fontSize: "16px",
            cursor: "pointer"
          }}
        >
          Check Backend Health
        </button>
      </a>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React

        </a>
      </header>
    </div>
  );
}

export default App;
