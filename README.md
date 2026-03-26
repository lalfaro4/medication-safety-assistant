# Medication Safety Assistant

A full-stack web application to help users manage medications, track allergies, and identify potential medication safety issues such as drug interactions, allergy conflicts, and scheduling problems.

## Tech Stack

- **Frontend:** React
- **Backend:** Flask
- **Database:** SQLite
- **Language(s):** JavaScript, Python

## Project Structure

```text
medication-safety-assistant/
├── backend/
│   ├── run.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── data/
├── docs/
└── README.md
```

## Backend Setup Instructions
- cd to backend
- pip install -r requirements.txt
- python run.py
-- to run the Flask backend at http://127.0.0.1:5000
- Can test the backend health route here: http://127.0.0.1:5000/api/health

## Frontend Setup Instructions
- cd to frontend
- npm install
- npm start (this starts the react frontend which should run at http://localhost:3000)
