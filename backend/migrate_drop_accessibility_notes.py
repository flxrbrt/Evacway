"""
migrate_drop_accessibility_notes.py

Migration script to safely drop the legacy accessibility_notes column from evacuation_centers:
1. Backs up existing accessibility_notes data to evacuation_centers_accessibility_notes_backup.
2. Copies any amenity names found in the old text into center_amenities junction table
   only when they match the known amenity list, skipping duplicates.
3. Drops the accessibility_notes column from evacuation_centers.
4. Fully reversible via --rollback / --down flag.
5. Safe to run multiple times (idempotent).
"""

import os
import re
import sys
import argparse
import psycopg2
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


def get_connection(db_url=None):
    url = db_url or os.getenv("DATABASE_URL")
    if not url:
        raise ValueError("DATABASE_URL is not set in environment or arguments.")
    return psycopg2.connect(url)


def run_up(db_url=None):
    conn = get_connection(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # Check if accessibility_notes column exists
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'evacuation_centers' AND column_name = 'accessibility_notes';
        """)
        col_exists = bool(cur.fetchone())

        if not col_exists:
            print("[INFO] Column 'accessibility_notes' does not exist in 'evacuation_centers'. Migration already applied.")
            conn.rollback()
            return True

        print("[STEP 1] Backing up accessibility_notes data...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS evacuation_centers_accessibility_notes_backup (
                center_id INTEGER PRIMARY KEY,
                accessibility_notes TEXT,
                backed_up_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cur.execute("""
            INSERT INTO evacuation_centers_accessibility_notes_backup (center_id, accessibility_notes)
            SELECT id, accessibility_notes
            FROM evacuation_centers
            WHERE accessibility_notes IS NOT NULL AND TRIM(accessibility_notes) <> ''
            ON CONFLICT (center_id) DO UPDATE SET
                accessibility_notes = EXCLUDED.accessibility_notes,
                backed_up_at = CURRENT_TIMESTAMP;
        """)
        cur.execute("SELECT count(*) FROM evacuation_centers_accessibility_notes_backup;")
        backup_count = cur.fetchone()[0]
        print(f"  -> Backed up {backup_count} evacuation center notes.")

        print("[STEP 2] Copying matching amenities into center_amenities...")
        cur.execute("SELECT id, name, code FROM amenities;")
        all_amenities = cur.fetchall()

        cur.execute("""
            SELECT id, accessibility_notes 
            FROM evacuation_centers 
            WHERE accessibility_notes IS NOT NULL AND TRIM(accessibility_notes) <> '';
        """)
        centers_with_notes = cur.fetchall()

        matched_count = 0
        for center_id, raw_notes in centers_with_notes:
            notes_str = str(raw_notes or '').strip()
            if not notes_str:
                continue

            # Split by comma or semicolon
            chunks = [c.strip() for c in re.split(r'[,;]+', notes_str) if c.strip()]
            matched_amenity_ids = set()

            for am_id, am_name, am_code in all_amenities:
                name_clean = am_name.strip().lower()
                code_clean = (am_code or '').strip().lower()

                # Check if exact token matches name or code
                for chunk in chunks:
                    chunk_lower = chunk.lower()
                    if chunk_lower == name_clean or (code_clean and chunk_lower == code_clean):
                        matched_amenity_ids.add(am_id)
                        break

                # Also check whole-phrase match in notes text
                if am_id not in matched_amenity_ids:
                    pattern = r'(?:\b|^)' + re.escape(name_clean) + r'(?:\b|$)'
                    if re.search(pattern, notes_str.lower()):
                        matched_amenity_ids.add(am_id)

            for am_id in matched_amenity_ids:
                cur.execute("""
                    INSERT INTO center_amenities (center_id, amenity_id)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING;
                """, (center_id, am_id))
                matched_count += 1

        print(f"  -> Associated {matched_count} matching amenity junction rows (duplicates skipped).")

        print("[STEP 3] Dropping accessibility_notes column from evacuation_centers...")
        cur.execute("""
            ALTER TABLE evacuation_centers DROP COLUMN accessibility_notes;
        """)

        conn.commit()
        print("[SUCCESS] Column 'accessibility_notes' successfully dropped and data migrated to center_amenities!")
        return True

    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Migration failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def run_down(db_url=None):
    conn = get_connection(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        print("[ROLLBACK STEP 1] Re-adding column accessibility_notes to evacuation_centers...")
        cur.execute("""
            ALTER TABLE evacuation_centers ADD COLUMN IF NOT EXISTS accessibility_notes TEXT;
        """)

        print("[ROLLBACK STEP 2] Restoring backed up notes from evacuation_centers_accessibility_notes_backup...")
        cur.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_name = 'evacuation_centers_accessibility_notes_backup';
        """)
        if cur.fetchone():
            cur.execute("""
                UPDATE evacuation_centers ec
                SET accessibility_notes = b.accessibility_notes
                FROM evacuation_centers_accessibility_notes_backup b
                WHERE ec.id = b.center_id;
            """)
            print("  -> Restored accessibility_notes data from backup table.")

        conn.commit()
        print("[SUCCESS] Migration rollback completed successfully.")
        return True

    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Rollback failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate evacuation_centers: drop accessibility_notes")
    parser.add_argument("--down", "--rollback", dest="rollback", action="store_true", help="Reverse migration")
    parser.add_argument("--db-url", dest="db_url", type=str, default=None, help="Optional DB URL override")

    args = parser.parse_args()

    if args.rollback:
        run_down(args.db_url)
    else:
        run_up(args.db_url)
