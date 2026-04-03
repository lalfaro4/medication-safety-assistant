from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import sqlite3
from pathlib import Path

app = Flask(__name__)
CORS(app)

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
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS medications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        rxcui TEXT NOT NULL,
        name TEXT NOT NULL,
        tty TEXT,
        synonym TEXT,
        score TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, rxcui)
    )
    """)


    

    conn.commit()
    conn.close()


def check_new_medication_against_saved(new_med_name, new_med_id, user_id):
    """
    Compare the newly added medication against every other saved medication
    using the Node/OpenFDA compare endpoint.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, rxcui, name, tty, synonym, score
        FROM medications
        WHERE id != ? AND user_id = ?
        ORDER BY id DESC
    """, (new_med_id, user_id))

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

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json()
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "").strip()

    if not name or not email or not password:
        return jsonify({"error": "All fields are required."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            (name, email, password)
        )
        conn.commit()
        return jsonify({"message": "Account successfully created."}), 201
    except Exception:
        return jsonify({"error": "User with that email already exists."}), 400
    finally:
        conn.close()

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data.get("email", "").strip()
    password = data.get("password", "").strip()

    conn = get_db_connection()
    cursor = conn.cursor()

    user = cursor.execute(
        "SELECT * FROM users WHERE email = ? AND password = ?",
        (email, password)
    ).fetchone()

    conn.close()

    if user:
        return jsonify({
            "message": "Login successful.",
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"]
            }
        })

    return jsonify({"error": "Invalid email or password."}), 401
    
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

        candidates = approx_data.get("approximateGroup", {}).get("candidate", [])

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

    user_id = data.get("user_id")
    rxcui = data.get("rxcui")
    name = data.get("name")
    tty = data.get("tty")
    synonym = data.get("synonym")
    score = data.get("score")
    print("PARSED VALUES:", user_id, rxcui, name)

    if not user_id or not rxcui or not name:
        return jsonify({"error": "user_id, rxcui, and name are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO medications (user_id, rxcui, name, tty, synonym, score)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, rxcui, name, tty, synonym, score))

        conn.commit()
        new_id = cursor.lastrowid

        return jsonify({
            "message": "Medication saved successfully",
            "id": new_id,
            "medication": {
                "user_id": user_id,
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
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is missing"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, user_id, rxcui, name, tty, synonym, score
        FROM medications
        WHERE user_id = ?
        ORDER BY id DESC
    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    medications = [dict(row) for row in rows]

    return jsonify({"medications": medications})
    
@app.route("/api/medications/<int:medication_id>", methods=["DELETE"])
def delete_medication(medication_id):
    user_id = request.args.get("user_id")
    if not user_id: return jsonify({"error": "user_id is missing"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM medications WHERE id = ? AND user_id = ?", (medication_id, user_id))
    medication = cursor.fetchone()

    if medication is None:
        conn.close()
        return jsonify({"error": "Medication not found"}), 404

    cursor.execute("DELETE FROM medications WHERE id = ? AND user_id = ?", (medication_id, user_id))
    conn.commit()
    conn.close()

    return jsonify({"message": "Medication deleted successfully"})
    
init_db()

if __name__ == "__main__":
    app.run(debug=True)
