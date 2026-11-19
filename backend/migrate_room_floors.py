"""Safely normalize existing building and room floor columns."""
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


def run_migration(database_url):
    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT table_name, column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND ( (table_name = 'evacuation_center_buildings' AND column_name = 'floors')
                     OR (table_name = 'evacuation_center_rooms' AND column_name = 'floor') )
            """)
            column_types = {(table, column): data_type for table, column, data_type in cursor.fetchall()}

            if ('evacuation_center_buildings', 'floors') not in column_types:
                raise RuntimeError('evacuation_center_buildings.floors does not exist')
            if ('evacuation_center_rooms', 'floor') not in column_types:
                raise RuntimeError('evacuation_center_rooms.floor does not exist')

            if column_types[('evacuation_center_buildings', 'floors')] != 'integer':
                cursor.execute("""
                    ALTER TABLE evacuation_center_buildings
                    ALTER COLUMN floors TYPE INTEGER USING (
                        CASE WHEN btrim(floors::text) ~ '^[0-9]+$'
                                  AND btrim(floors::text)::numeric BETWEEN 1 AND 20
                             THEN btrim(floors::text)::integer ELSE 1 END
                    )
                """)
            cursor.execute("""
                UPDATE evacuation_center_buildings
                SET floors = 1
                WHERE floors IS NULL OR floors < 1 OR floors > 20
            """)
            cursor.execute("""
                ALTER TABLE evacuation_center_buildings
                ALTER COLUMN floors SET DEFAULT 1,
                ALTER COLUMN floors SET NOT NULL
            """)

            if column_types[('evacuation_center_rooms', 'floor')] != 'integer':
                cursor.execute("""
                    ALTER TABLE evacuation_center_rooms
                    ALTER COLUMN floor TYPE INTEGER USING (
                        CASE WHEN floor IS NULL THEN NULL
                             WHEN btrim(floor::text) ~ '^[0-9]+$'
                                  AND btrim(floor::text)::numeric >= 1
                             THEN btrim(floor::text)::integer ELSE NULL END
                    )
                """)
            cursor.execute("""
                UPDATE evacuation_center_rooms
                SET floor = NULL
                WHERE floor IS NOT NULL AND floor < 1
            """)

            cursor.execute("""
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ec_building_floors_range') THEN
                        ALTER TABLE evacuation_center_buildings
                        ADD CONSTRAINT ck_ec_building_floors_range CHECK (floors BETWEEN 1 AND 20);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ec_room_floor_positive') THEN
                        ALTER TABLE evacuation_center_rooms
                        ADD CONSTRAINT ck_ec_room_floor_positive CHECK (floor IS NULL OR floor >= 1);
                    END IF;
                END $$;
            """)


if __name__ == '__main__':
    load_dotenv(Path(__file__).with_name('.env'))
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise SystemExit('DATABASE_URL is required')
    run_migration(database_url)
    print('Building and room floors migrated successfully.')
