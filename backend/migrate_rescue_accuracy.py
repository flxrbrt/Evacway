"""
migrate_rescue_accuracy.py - Adds accuracy, is_manual_pin, and location_source columns to rescue_requests.
"""
from sqlalchemy import inspect, text

from app import app
from models import db

STATEMENTS = [
    "ALTER TABLE rescue_requests ADD COLUMN IF NOT EXISTS accuracy FLOAT",
    "ALTER TABLE rescue_requests ADD COLUMN IF NOT EXISTS is_manual_pin BOOLEAN DEFAULT FALSE",
    "ALTER TABLE rescue_requests ADD COLUMN IF NOT EXISTS location_source VARCHAR(50) DEFAULT 'gps'",
]

if __name__ == "__main__":
    with app.app_context():
        with db.engine.begin() as conn:
            for stmt in STATEMENTS:
                try:
                    conn.execute(text(stmt))
                except Exception as e:
                    print("Error executing:", stmt, e)

        cols = [c["name"] for c in inspect(db.engine).get_columns("rescue_requests")]
        print("rescue_requests columns:", cols)
        missing = {"accuracy", "is_manual_pin", "location_source"} - set(cols)
        print("Missing:", sorted(missing) if missing else "none - migration complete.")
