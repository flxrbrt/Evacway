"""Add the non-registered arrival table only. Usage: python migrate_non_registered_evacuees.py [up|down]."""
import argparse
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


UP = [
    """CREATE TABLE IF NOT EXISTS non_registered_evacuees (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(60) NOT NULL CHECK (length(first_name) BETWEEN 2 AND 60),
        middle_name VARCHAR(60) CHECK (middle_name IS NULL OR length(middle_name) BETWEEN 2 AND 60),
        last_name VARCHAR(60) NOT NULL CHECK (length(last_name) BETWEEN 2 AND 60),
        sex VARCHAR(6) NOT NULL CHECK (sex IN ('male','female','other')),
        age_years INTEGER NOT NULL CHECK (age_years BETWEEN 0 AND 120),
        birthdate DATE CHECK (birthdate IS NULL OR birthdate <= CURRENT_DATE),
        contact_number VARCHAR(13) CHECK (contact_number IS NULL OR contact_number ~ '^\\+639[0-9]{9}$'),
        address VARCHAR(200), is_pwd BOOLEAN NOT NULL DEFAULT FALSE,
        is_pregnant BOOLEAN NOT NULL DEFAULT FALSE CHECK (NOT is_pregnant OR sex='female'),
        needs_medical BOOLEAN NOT NULL DEFAULT FALSE, notes VARCHAR(200),
        group_code UUID NOT NULL, is_group_head BOOLEAN NOT NULL DEFAULT FALSE,
        operation_id INTEGER NOT NULL REFERENCES evacuation_operations(id) ON DELETE RESTRICT,
        center_id INTEGER NOT NULL REFERENCES evacuation_centers(id) ON DELETE RESTRICT,
        arrived_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        departed_at TIMESTAMPTZ CHECK (departed_at IS NULL OR departed_at >= arrived_at),
        recorded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT
    )""",
    'CREATE INDEX IF NOT EXISTS ix_nre_operation_center ON non_registered_evacuees(operation_id,center_id)',
    'CREATE INDEX IF NOT EXISTS ix_nre_group ON non_registered_evacuees(group_code)',
    'CREATE INDEX IF NOT EXISTS ix_nre_arrived_desc ON non_registered_evacuees(arrived_at DESC)',
    'CREATE INDEX IF NOT EXISTS ix_nre_present_center ON non_registered_evacuees(center_id) WHERE departed_at IS NULL',
    'CREATE INDEX IF NOT EXISTS ix_nre_name ON non_registered_evacuees(lower(last_name),lower(first_name))',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_nre_group_head ON non_registered_evacuees(group_code) WHERE is_group_head',
    """CREATE OR REPLACE FUNCTION check_non_registered_group() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE code UUID; heads INTEGER; places INTEGER; operations INTEGER;
    BEGIN
        FOR code IN SELECT DISTINCT v FROM unnest(ARRAY[
            CASE WHEN TG_OP <> 'DELETE' THEN NEW.group_code END,
            CASE WHEN TG_OP <> 'INSERT' THEN OLD.group_code END]) AS v WHERE v IS NOT NULL
        LOOP
            SELECT count(*) FILTER (WHERE is_group_head), count(DISTINCT center_id), count(DISTINCT operation_id)
              INTO heads, places, operations FROM non_registered_evacuees WHERE group_code=code;
            IF EXISTS(SELECT 1 FROM non_registered_evacuees WHERE group_code=code)
               AND (heads <> 1 OR places <> 1 OR operations <> 1) THEN
                RAISE EXCEPTION 'A group requires exactly one head, one shelter and one operation' USING ERRCODE='23514';
            END IF;
        END LOOP;
        RETURN NULL;
    END $$""",
    'DROP TRIGGER IF EXISTS nre_group_consistency ON non_registered_evacuees',
    """CREATE CONSTRAINT TRIGGER nre_group_consistency
       AFTER INSERT OR UPDATE OR DELETE ON non_registered_evacuees
       DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_non_registered_group()""",
]
DOWN = ['DROP TABLE IF EXISTS non_registered_evacuees', 'DROP FUNCTION IF EXISTS check_non_registered_group()']


def run_migration(database_url, direction='up'):
    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cursor:
            for statement in UP if direction == 'up' else DOWN:
                cursor.execute(statement)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('direction', nargs='?', choices=('up', 'down'), default='up')
    args = parser.parse_args()
    load_dotenv(Path(__file__).with_name('.env'))
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        parser.error('DATABASE_URL is required')
    run_migration(database_url, args.direction)
    print(f'Non-registered evacuees migration {args.direction} completed.')
