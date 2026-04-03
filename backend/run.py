from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import sqlite3
from pathlib import Path

app = Flask(__name__)
CORS(app)

@app.route("/")
def home():
    return {"message": "Backend is running!"}

RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST"
COMPARE_API_BASE = "http://127.0.0.1:5001/api"

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


def check_new_medication_against_saved(new_med_name, new_med_id):
    """
    Compare the newly added medication against every other saved medication
    using the Node/OpenFDA compare endpoint.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, rxcui, name, tty, synonym, score
        FROM medications
        WHERE id != ?
        ORDER BY id DESC
    """, (new_med_id,))

    other_meds = [dict(row) for row in cursor.fetchall()]
    conn.close()

    interaction_results = []
    compare_errors = []

    for med in other_meds:
        try:
            response = requests.get(
                f"{COMPARE_API_BASE}/compare-drugs",
                params={
                    "drugA": new_med_name,
                    "drugB": med["name"]
                },
                timeout=20,
            )

            data = response.json()

            if not response.ok:
                compare_errors.append({
                    "withMedication": med["name"],
                    "error": data.get("error", "Comparison failed")
                })
                continue

            comparison = data.get("comparison", {})
            possible_interaction = comparison.get("possibleInteraction", False)

            if possible_interaction:
                interaction_results.append({
                    "medicationId": med["id"],
                    "medicationName": med["name"],
                    "comparison": comparison,
                    "drugADetails": data.get("drugADetails"),
                    "drugBDetails": data.get("drugBDetails")
                })

        except requests.RequestException as e:
            compare_errors.append({
                "withMedication": med["name"],
                "error": f"Could not reach comparison service: {str(e)}"
            })

    return {
        "checkedAgainstCount": len(other_meds),
        "interactionsFoundCount": len(interaction_results),
        "interactions": interaction_results,
        "compareErrors": compare_errors
    }


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
        approx_url = f"{RXNAV_BASE}/approximateTerm.json"
        approx_response = requests.get(
            approx_url,
            params={"term": query, "maxEntries": 10},
            timeout=10,
        )
        approx_response.raise_for_status()
        approx_data = approx_response.json()

        candidates = approx_data.get("approximateGroup", {}).get("candidate", [])
        results = []

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

        cleaned_results = []
        seen_rxcuis = set()

        for item in results:
            item_rxcui = item.get("rxcui")
            name = item.get("name")

            if not item_rxcui or not name:
                continue

            if item_rxcui in seen_rxcuis:
                continue

            seen_rxcuis.add(item_rxcui)
            cleaned_results.append(item)

        return jsonify({"query": query, "results": cleaned_results})

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

        interaction_check = check_new_medication_against_saved(name, new_id)

        return jsonify({
            "message": "Medication saved successfully",
            "id": new_id,
            "medication": {
                "id": new_id,
                "rxcui": rxcui,
                "name": name,
                "tty": tty,
                "synonym": synonym,
                "score": score
            },
            "interactionCheck": interaction_check
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
