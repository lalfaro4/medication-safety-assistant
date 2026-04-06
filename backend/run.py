from flask import Flask, jsonify, request, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import requests
import sqlite3
from pathlib import Path
import os
import secrets

app = Flask(__name__)


FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "https://medication-safety-assistant-production.up.railway.app")
COMPARE_API_BASE = os.environ.get("COMPARE_API_BASE", "https://compare-api.up.railway.app/api")

CORS(app, supports_credentials=True, origins=[FRONTEND_ORIGIN])

# CORS(app, supports_credentials=True, origins=["http://localhost:3000"])

app.config["SECRET_KEY"] = "a93078317010017de2d299609e21c07972acb982531748c7da06c42635009e99"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = False  # True when using HTTPS


RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST"

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "medications.db"

# used to generate the secret key
# have it in here instead of env file sice not focus of project/simplicity
# print(secrets.token_hex(32))

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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS medication_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medication_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            day_of_week TEXT NOT NULL,
            time_of_day TEXT NOT NULL,
            FOREIGN KEY (medication_id) REFERENCES medications(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
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
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "").strip()

    if not name or not email or not password:
        return jsonify({"error": "All fields are required."}), 400

    password_hashed = generate_password_hash(password)

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            (name, email, password_hashed)
        )
        conn.commit()
        return jsonify({"message": "Account successfully created."}), 201
    except Exception:
        return jsonify({"error": "User with that email already exists."}), 400
    finally:
        conn.close()

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "").strip()

    conn = get_db_connection()
    cursor = conn.cursor()

    user = cursor.execute(
        "SELECT * FROM users WHERE email = ?",
        (email,)
    ).fetchone()

    conn.close()

    if user is None or not check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid email or password."}), 401

    session.clear()
    session["user_id"] = user["id"]

    if user:
        return jsonify({
            "message": "Login successful.",
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"]
            }
        })

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logout successful."}), 200


@app.route("/api/me", methods=["GET"])
def me():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"authenticated": False}), 401

    conn = get_db_connection()
    user = conn.execute(
        "SELECT id, name, email FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    conn.close()

    if not user:
        session.clear()
        return jsonify({"authenticated": False}), 401

    return jsonify({"authenticated": True, "user": dict(user)})

def get_logged_in_user():
    user_id = session.get("user_id")
    return user_id

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
    user_id = get_logged_in_user()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    rxcui = data.get("rxcui")
    name = data.get("name")
    tty = data.get("tty")
    synonym = data.get("synonym")
    score = data.get("score")

    print("PARSED VALUES:", user_id, rxcui, name)

    if not rxcui or not name:
        return jsonify({"error": "rxcui and name are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
                       INSERT INTO medications (user_id, rxcui, name, tty, synonym, score)
                       VALUES (?, ?, ?, ?, ?, ?)
                       """, (user_id, rxcui, name, tty, synonym, score))

        conn.commit()
        new_id = cursor.lastrowid

        interaction_check = check_new_medication_against_saved(name, new_id, user_id)

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
    user_id = get_logged_in_user()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

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
    user_id = get_logged_in_user()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

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

@app.route("/api/medications/<int:medication_id>/schedule", methods=["POST"])
def add_medication_schedule(medication_id):
    user_id = get_logged_in_user()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    day_of_week = data.get("day_of_week")
    time_of_day = data.get("time_of_day")

    if not day_of_week or not time_of_day:
        return jsonify({"error": "day_of_week and time_of_day required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    medication = cursor.execute("""
        SELECT id FROM medications
        WHERE id = ? AND user_id = ?
        """,(medication_id, user_id)).fetchone()

    if not medication:
        conn.close()
        return jsonify({"error": "Medication not found"}), 404

    cursor.execute("""
        INSERT INTO medication_schedules (medication_id, user_id, day_of_week, time_of_day)
        VALUES (?, ?, ?, ?)
         """, (medication_id, user_id, day_of_week, time_of_day))

    conn.commit()
    schedule_id = cursor.lastrowid
    conn.close()

    return jsonify({"message": "Schedule saved",
                    "Schedule": {
                        "id": schedule_id,
                        "medication_id": medication_id,
                        "day_of_week": day_of_week,
                        "time_of_day": time_of_day
                    }}), 201

@app.route("/api/medications/<int:medication_id>/schedule", methods=["GET"])
def get_medication_schedule(medication_id):
    user_id = get_logged_in_user()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    cursor = conn.cursor()

    medication = cursor.execute("""
        SELECT id FROM medications
        WHERE id = ? AND user_id = ?
        """, (medication_id, user_id)).fetchone()

    if not medication:
        conn.close()
        return jsonify({"error": "Medication not found"}), 404

    rows = cursor.execute("""
        SELECT id, day_of_week, time_of_day
        FROM medication_schedules
        WHERE medication_id = ? AND user_id = ?
        ORDER BY
            CASE day_of_week
                WHEN 'Monday' THEN 1
                WHEN 'Tuesday' THEN 2
                WHEN 'Wednesday' THEN 3
                WHEN 'Thursday' THEN 4
                WHEN 'Friday' THEN 5
                WHEN 'Saturday' THEN 6
                WHEN 'Sunday' THEN 7
            END,
            time_of_day
        """, (medication_id, user_id)).fetchall()

    conn.close()

    return jsonify({"schedule": [dict(row) for row in rows]})


@app.route("/api/medication-schedules/<int:schedule_id>", methods=["DELETE"])
def delete_medication_schedule(schedule_id):
    user_id = get_logged_in_user()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    cursor = conn.cursor()

    schedule = cursor.execute("""
        SELECT id FROM medication_schedules
        WHERE id = ? AND user_id = ?
    """, (schedule_id, user_id)).fetchone()

    if not schedule:
        conn.close()
        return jsonify({"error": "Schedule entry not found"}), 404

    cursor.execute("""
        DELETE FROM medication_schedules
        WHERE id = ? AND user_id = ?
    """, (schedule_id, user_id))

    conn.commit()
    conn.close()

    return jsonify({"message": "Schedule entry deleted successfully"})


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
