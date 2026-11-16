"""
Idempotent helper / standalone migration to add reporter foreign keys to `hazard_reports`
(`reported_by_user_id`, `reported_by_resident_account_id`) and backfill historical rows
where an existing uploader folder or staff notification uniquely identifies the account.
"""
import re
from sqlalchemy import inspect, text
from werkzeug.utils import secure_filename


_UPLOAD_FOLDER_RE = re.compile(r"/static/uploads/hazard/([^/]+)/")


def ensure_hazard_report_reporter_columns(db_instance):
    """Ensure `hazard_reports` has reporter columns + indexes and backfill matched legacy rows."""
    engine = db_instance.engine
    inspector = inspect(engine)
    if not inspector.has_table('hazard_reports'):
        return

    cols = {col['name'] for col in inspector.get_columns('hazard_reports')}
    with engine.begin() as conn:
        if 'reported_by_user_id' not in cols:
            conn.execute(
                text(
                    "ALTER TABLE hazard_reports "
                    "ADD COLUMN reported_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_hazard_reports_reported_by_user_id "
                    "ON hazard_reports (reported_by_user_id)"
                )
            )

        if 'reported_by_resident_account_id' not in cols:
            conn.execute(
                text(
                    "ALTER TABLE hazard_reports "
                    "ADD COLUMN reported_by_resident_account_id INTEGER REFERENCES resident_accounts(id) ON DELETE SET NULL"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_hazard_reports_reported_by_resident_account_id "
                    "ON hazard_reports (reported_by_resident_account_id)"
                )
            )

        # Backfill only legacy rows that have neither reporter FK set yet
        unlinked = conn.execute(
            text(
                "SELECT id, photo_url FROM hazard_reports "
                "WHERE reported_by_user_id IS NULL AND reported_by_resident_account_id IS NULL"
            )
        ).fetchall()

        if not unlinked:
            return

        # Build deterministic folder -> account lookup maps (only unique names)
        res_folder_map = {}
        ambiguous_res_folders = set()
        res_rows = conn.execute(
            text(
                "SELECT ra.id, r.first_name, r.middle_name, r.last_name, r.suffix "
                "FROM resident_accounts ra "
                "JOIN residents r ON r.id = ra.resident_id"
            )
        ).fetchall()
        for acct_id, first_name, middle_name, last_name, suffix in res_rows:
            base = " ".join(
                str(p).strip() for p in (first_name, middle_name, last_name) if p and str(p).strip()
            )
            full_name = " ".join(p for p in (base, suffix) if p and str(p).strip())
            folder = secure_filename(full_name)
            if not folder or folder == 'anonymous':
                continue
            if folder in res_folder_map and res_folder_map[folder] != acct_id:
                ambiguous_res_folders.add(folder)
            else:
                res_folder_map[folder] = acct_id
        for k in ambiguous_res_folders:
            res_folder_map.pop(k, None)

        user_folder_map = {}
        ambiguous_user_folders = set()
        user_rows = conn.execute(text("SELECT id, name FROM users")).fetchall()
        for uid, uname in user_rows:
            folder = secure_filename(str(uname or '').strip())
            if not folder or folder == 'anonymous':
                continue
            if folder in user_folder_map and user_folder_map[folder] != uid:
                ambiguous_user_folders.add(folder)
            else:
                user_folder_map[folder] = uid
        for k in ambiguous_user_folders:
            user_folder_map.pop(k, None)

        for report_id, photo_url in unlinked:
            m = _UPLOAD_FOLDER_RE.search(photo_url or "")
            if not m:
                continue
            folder = m.group(1)
            if not folder or folder == 'anonymous':
                continue
            if folder in res_folder_map and folder not in user_folder_map:
                conn.execute(
                    text(
                        "UPDATE hazard_reports SET reported_by_resident_account_id = :aid "
                        "WHERE id = :rid"
                    ),
                    {"aid": res_folder_map[folder], "rid": report_id},
                )
            elif folder in user_folder_map and folder not in res_folder_map:
                conn.execute(
                    text(
                        "UPDATE hazard_reports SET reported_by_user_id = :uid "
                        "WHERE id = :rid"
                    ),
                    {"uid": user_folder_map[folder], "rid": report_id},
                )


if __name__ == '__main__':
    from app import app
    from models import db

    with app.app_context():
        ensure_hazard_report_reporter_columns(db)
        print('hazard_reports reporter columns ensured successfully.')
