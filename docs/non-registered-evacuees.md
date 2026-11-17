# Non-registered evacuee arrivals

## Scope and permissions

One `non_registered_evacuees` row represents one person. There are no account,
password, identity-document, or record-type columns. A UUID groups people arriving
together. Each nonempty group has exactly one head and one operation/shelter.

Administrators and LGU personnel may create, list, update and depart people or
groups. Only administrators may delete. Both staff roles may explicitly reveal
contact numbers, medical needs and notes; that access is audited. Ordinary list
responses omit those fields. Residents and anonymous requests cannot access the
new endpoints. Public occupancy responses contain aggregate counts only.

Selecting **Use this record** copies an existing resident's demographic details
into the form. It does not create an account or modify the resident. Duplicate
suggestions are warnings, never blocks. Staff should avoid recording a resident
who is already present through the assigned-household flow.

Closed/archived operations are read-only except for administrator deletion.
Deleting a group head promotes the first remaining member, in the same transaction.
No existing table is altered by this migration.

## Deployment

Back up the live database before applying the migration. Verification uses a new
disposable database and does not migrate or insert fake people into the live database.
The migration is required even if Flask's existing `db.create_all()` has already
created the new table: the migration also installs the deferred group constraint.

From the repository root, for Docker:

```powershell
rtk proxy docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/evacway-before-nre.dump'
rtk proxy docker compose cp db:/tmp/evacway-before-nre.dump ./evacway-before-nre.dump
rtk proxy docker compose up -d --build backend frontend
rtk proxy docker compose exec backend python migrate_non_registered_evacuees.py up
rtk proxy docker compose restart backend
```

The command executes in the backend container and connects to the **running
database container** using `DATABASE_URL`. It does not depend on `db/init` or an
empty database volume. Keep the backup private: it contains resident data.

For the local Windows virtual environment, from the repository root:

```powershell
rtk proxy backend\venv\Scripts\python.exe backend\migrate_non_registered_evacuees.py up
```

Then restart the backend. Rebuild the frontend for a production deployment.
During rollout, the public center metrics retain existing behavior if the new table
is missing, while the new API returns a clear migration-required response.

Rollback removes the **new table and its data**; restore the backup if those
records must be recovered. It does not alter existing tables:

```powershell
rtk proxy docker compose exec backend python migrate_non_registered_evacuees.py down
```

## API

All paths start with `/api/non-registered-evacuees` and require a staff JWT.

| Method and suffix | Behavior |
| --- | --- |
| POST `/` | `{center_id, operation_id?, people:[...]}`; 1–30 people, first is head; atomic save |
| GET `/` | Grouped results; `operation_id=active`, `center_id`, `status=all/present/departed`, `q`, `page`, `per_page=1..100` |
| GET `/groups/<uuid>` | Members without protected details by default |
| GET `/groups/<uuid>?include_sensitive=true` | Staff-only protected details; records an access log |
| PATCH `/<person_id>` | Edit personal fields; operation, shelter, group and recorder cannot be reassigned |
| POST `/groups/<uuid>/members` | Add one person, with a maximum of 30 in the group |
| POST `/<person_id>/departure` | `{departed:true/false, departed_at?: ISO timestamp with timezone}` |
| POST `/groups/<uuid>/departure` | Same operation for the entire group |
| DELETE `/<person_id>` | Administrator only; promotes head if necessary |
| GET `/duplicates?q=...&operation_id=...` | At most five suggestions from this operation and registered residents |
| GET `/export` | XLSX with the same operation/shelter/search/status filters |

Validation errors return HTTP 422 with `error` and a `fields` mapping. Group-create
keys use `people.0.first_name`, etc. Closed operations/conflicts return 409.
Contacts normalize to `+639XXXXXXXXX`. Timestamps are timezone-aware.

The existing Arrival Export Report also includes a **Non-registered arrivals**
worksheet. Existing assigned-household sheets and counts remain separate.
User-provided spreadsheet strings are stored as text, not formulas.

## Occupancy

Current occupancy combines present assigned residents with non-registered people
whose `departed_at` is empty, for the same shelter/operation. Non-registered people
are not assigned to rooms and do not enter barangay statistics. Existing assigned
household cards remain unchanged; the new card counts non-registered people/groups.
Capacity warnings are amber at 90% and **Shelter full** at 100%.

## Verification

The PostgreSQL verifier creates a random `evacway_test_non_registered_*` database,
creates fake fixtures, checks migration up/down/up, and removes only that database
in a `finally` block. The configured database user must have CREATEDB and permission
to install the existing PostGIS extension in that disposable database.

```powershell
rtk proxy backend\venv\Scripts\python.exe backend\verify_non_registered_evacuees.py
rtk proxy npm --prefix frontend run build
```

From `frontend/`, with Vite available on port 5173:

```powershell
rtk proxy node scripts/verify-non-registered.mjs
```

The headless browser uses an isolated context, fake users and mocked API responses.
It checks desktop/mobile placement, the bottom sheet, duplicate selection, field
errors, saving, 100-group pagination and operation locking. It writes screenshots
under `frontend/artifacts/`. No real user session or live database is used.
