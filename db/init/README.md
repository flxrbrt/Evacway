# Database initialization

Export the current database as a plain SQL dump from the running Compose database:

```powershell
docker compose exec -T db pg_dump -U <DB_USER> -d evacway2 --no-owner --no-privileges > db/init/evacway2.sql
```

Replace `<DB_USER>` with the `DB_USER` value from `.env`, then keep the dump at `db/init/evacway2.sql`. PostgreSQL runs files in `/docker-entrypoint-initdb.d` only when the `pgdata` volume is empty. Existing volumes are not reinitialized automatically.
