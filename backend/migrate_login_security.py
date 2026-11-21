"""Add configurable account lockout fields for resident and staff logins.

Idempotent migration. Run from backend/ with the project environment active:
    python migrate_login_security.py
"""

from sqlalchemy import text

from app import app
from models import db


STATEMENTS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_failed_attempts INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_failure_window_started_at TIMESTAMP",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMP",
    "ALTER TABLE resident_accounts ADD COLUMN IF NOT EXISTS login_failed_attempts INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE resident_accounts ADD COLUMN IF NOT EXISTS login_failure_window_started_at TIMESTAMP",
    "ALTER TABLE resident_accounts ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMP",
]


if __name__ == "__main__":
    with app.app_context():
        with db.engine.begin() as connection:
            for statement in STATEMENTS:
                connection.execute(text(statement))
        print("Login security migration completed.")
