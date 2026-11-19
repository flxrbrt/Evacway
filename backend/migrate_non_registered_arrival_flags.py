"""Add support flags to non-registered arrivals. Usage: python migrate_non_registered_arrival_flags.py."""
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


UP = [
    'ALTER TABLE non_registered_evacuees ADD COLUMN IF NOT EXISTS is_lactating BOOLEAN NOT NULL DEFAULT FALSE',
    'ALTER TABLE non_registered_evacuees ADD COLUMN IF NOT EXISTS is_solo_parent BOOLEAN NOT NULL DEFAULT FALSE',
    'ALTER TABLE non_registered_evacuees ADD COLUMN IF NOT EXISTS needs_assistance BOOLEAN NOT NULL DEFAULT FALSE',
]


def run_migration(database_url):
    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cursor:
            for statement in UP:
                cursor.execute(statement)


if __name__ == '__main__':
    load_dotenv(Path(__file__).with_name('.env'))
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise SystemExit('DATABASE_URL is required')
    run_migration(database_url)
    print('Non-registered arrival support flags migration completed.')
