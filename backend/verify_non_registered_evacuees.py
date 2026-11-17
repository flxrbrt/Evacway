"""Run integration tests in a new disposable PostgreSQL database; never migrate the live database."""
import os
import unittest
import uuid

import psycopg2
from psycopg2 import sql
from psycopg2.extensions import parse_dsn

from config import Config


def main():
    options = parse_dsn(Config.SQLALCHEMY_DATABASE_URI)
    name = 'evacway_test_non_registered_' + uuid.uuid4().hex[:12]
    connection = psycopg2.connect(**options)
    connection.autocommit = True
    created = False
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql.SQL('CREATE DATABASE {} TEMPLATE template0').format(sql.Identifier(name)))
        created = True
        options['dbname'] = name
        # SQLAlchemy expects a URL; preserve credentials privately, changing only the test database.
        from sqlalchemy.engine import make_url
        test_url = make_url(Config.SQLALCHEMY_DATABASE_URI).set(database=name).render_as_string(hide_password=False)
        os.environ['EVACWAY_TEST_DATABASE_URL'] = test_url
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromName('test_non_registered_evacuees'))
        return 0 if result.wasSuccessful() else 1
    finally:
        os.environ.pop('EVACWAY_TEST_DATABASE_URL', None)
        if created:
            assert name.startswith('evacway_test_non_registered_')
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=%s AND pid <> pg_backend_pid()', (name,))
                cursor.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(name)))
            print('Removed the disposable test database; the live database was not migrated.')
        connection.close()


if __name__ == '__main__':
    raise SystemExit(main())
