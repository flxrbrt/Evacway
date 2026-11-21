"""Add family lookup privacy preferences and safe lookup audit records.

Additive and idempotent. Run from backend/ with the project environment active:
    python migrate_resident_lookup_privacy.py
"""

from sqlalchemy import text

from app import app
from models import db


STATEMENTS = [
    "ALTER TABLE families ADD COLUMN IF NOT EXISTS find_someone_opt_out BOOLEAN NOT NULL DEFAULT FALSE",
    """
    CREATE TABLE IF NOT EXISTS resident_lookup_logs (
        id SERIAL PRIMARY KEY,
        lookup_type VARCHAR(32) NOT NULL,
        resident_account_id INTEGER REFERENCES resident_accounts(id) ON DELETE SET NULL,
        client_ip VARCHAR(64),
        query_name_masked VARCHAR(150),
        query_barangay_masked VARCHAR(100),
        query_birthdate_masked VARCHAR(16),
        found BOOLEAN NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_resident_lookup_logs_lookup_type ON resident_lookup_logs (lookup_type)",
    "CREATE INDEX IF NOT EXISTS ix_resident_lookup_logs_resident_account_id ON resident_lookup_logs (resident_account_id)",
    "CREATE INDEX IF NOT EXISTS ix_resident_lookup_logs_timestamp ON resident_lookup_logs (timestamp)",
]


if __name__ == "__main__":
    with app.app_context():
        with db.engine.begin() as connection:
            for statement in STATEMENTS:
                connection.execute(text(statement))
        print("Resident lookup privacy migration completed.")
