from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import sqlite3
from pathlib import Path

app = Flask(__name__)
CORS(app)

RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST"

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "medications.db"


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS medications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rxcui TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        tty TEXT,
        synonym TEXT,
        score TEXT
        )
    """)
    

    conn.commit()
    conn.close()

 # test flask and cors is running
@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})
    
@app.route("/api/medications/search")
def search_medications():
    query = request.args.get("q", "").strip()

    if not query:
        return jsonify({"error": "Missing query parameter 'q'"}), 400

    try:
        # Step 1: find candidate RxCUIs from the search term
        approx_url = f"{RXNAV_BASE}/approximateTerm.json"
        approx_response = requests.get(
            approx_url,
            params={"term": query, "maxEntries": 10},
            timeout=10,
        )
        approx_response.raise_for_status()
        approx_data = approx_response.json()

        candidates = (
            approx_data.get("approximateGroup", {}).get("candidate", [])
        )

        results = []

        # Step 2: for each RxCUI, fetch readable details
        for candidate in candidates:
            rxcui = candidate.get("rxcui")
            score = candidate.get("score")

            if not rxcui:
                continue

            props_url = f"{RXNAV_BASE}/rxcui/{rxcui}/properties.json"
            props_response = requests.get(props_url, timeout=10)
            props_response.raise_for_status()
            props_data = props_response.json()

            properties = props_data.get("properties", {})

            results.append({
                "rxcui": rxcui,
                "name": properties.get("name"),
                "synonym": properties.get("synonym"),
                "tty": properties.get("tty"),
                "score": score,
            })
            
            # Remove results with no name and repeated rxcui values
            cleaned_results = []
            seen_rxcuis = set()

            for item in results:
                rxcui = item.get("rxcui")
                name = item.get("name")

            if not rxcui or not name:
                continue

            if rxcui in seen_rxcuis:
                continue

            seen_rxcuis.add(rxcui)
            cleaned_results.append(item)

        return jsonify({"query": query, "results": results})

    except requests.RequestException as e:
        return jsonify({
            "error": "Failed to reach RxNav",
            "details": str(e)
        }), 502
        
@app.route("/api/medications", methods=["POST"])
def add_medication():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    rxcui = data.get("rxcui")
    name = data.get("name")
    tty = data.get("tty")
    synonym = data.get("synonym")
    score = data.get("score")

    if not rxcui or not name:
        return jsonify({"error": "rxcui and name are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO medications (rxcui, name, tty, synonym, score)
            VALUES (?, ?, ?, ?, ?)
        """, (rxcui, name, tty, synonym, score))

        conn.commit()
        new_id = cursor.lastrowid

        return jsonify({
            "message": "Medication saved successfully",
            "id": new_id,
            "medication": {
                "rxcui": rxcui,
                "name": name,
                "tty": tty,
                "synonym": synonym,
                "score": score
            }
        }), 201

    except sqlite3.IntegrityError:
        return jsonify({
            "message": f"{name} is already saved."
        }), 200

    finally:
        conn.close()

@app.route("/api/medications", methods=["GET"])
def get_medications():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, rxcui, name, tty, synonym, score
        FROM medications
        ORDER BY id DESC
    """)

    rows = cursor.fetchall()
    conn.close()

    medications = [dict(row) for row in rows]

    return jsonify({"medications": medications})
    
@app.route("/api/medications/<int:medication_id>", methods=["DELETE"])
def delete_medication(medication_id):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM medications WHERE id = ?", (medication_id,))
    medication = cursor.fetchone()

    if medication is None:
        conn.close()
        return jsonify({"error": "Medication not found"}), 404

    cursor.execute("DELETE FROM medications WHERE id = ?", (medication_id,))
    conn.commit()
    conn.close()

    return jsonify({"message": "Medication deleted successfully"})
    
init_db()

if __name__ == "__main__":
    app.run(debug=True)
