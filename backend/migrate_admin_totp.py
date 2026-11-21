"""Add staff TOTP enrollment and admin-approved recovery storage.

Idempotent migration. Run from backend/ with the project environment active:
    python migrate_admin_totp.py
"""

from sqlalchemy import text

from app import app
from models import db


STATEMENTS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret_encrypted TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_setup_expires_at TIMESTAMP",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_used_step BIGINT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_backup_codes_hashes JSONB",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_version INTEGER NOT NULL DEFAULT 0",
    """
    CREATE TABLE IF NOT EXISTS admin_mfa_recovery_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_admin_mfa_recovery_requests_user_id ON admin_mfa_recovery_requests (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_admin_mfa_recovery_requests_status ON admin_mfa_recovery_requests (status)",
    "CREATE INDEX IF NOT EXISTS ix_admin_mfa_recovery_requests_expires_at ON admin_mfa_recovery_requests (expires_at)",
]


if __name__ == "__main__":
    with app.app_context():
        with db.engine.begin() as connection:
            for statement in STATEMENTS:
                connection.execute(text(statement))
        print("Admin TOTP migration completed.")
