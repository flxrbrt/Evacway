-- Room slot/space capacity migration.
-- Safe to run repeatedly: the legacy capacity values are copied only when the
-- people_spaces column is first introduced, so reruns never overwrite newer
-- people_spaces values.
DO $$
DECLARE
    people_spaces_column_was_missing boolean;
BEGIN
    SELECT NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'evacuation_center_rooms'
          AND column_name = 'people_spaces'
    )
    INTO people_spaces_column_was_missing;

    ALTER TABLE public.evacuation_center_rooms
        ADD COLUMN IF NOT EXISTS family_slots integer NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS people_spaces integer NOT NULL DEFAULT 25;

    IF people_spaces_column_was_missing THEN
        UPDATE public.evacuation_center_rooms
        SET people_spaces = capacity;
    END IF;
END;
$$;
