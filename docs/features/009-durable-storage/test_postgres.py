"""Real-process PostgreSQL acceptance checks. See README.md; never loads .env."""
import os
from pathlib import Path
import subprocess
import unittest
import json
import tempfile
import shutil
import sys
import time
import urllib.request
import urllib.error
from local_postgres import Cluster, free_port

ROOT = Path(__file__).resolve().parents[3]
BACKEND = ROOT / 'repo/MovieNightBackend'
JAR = BACKEND / 'target/movienight-backend-0.0.1-SNAPSHOT.jar'
JAVA = str(Path(os.environ['JAVA_HOME']) / 'bin/java') if 'JAVA_HOME' in os.environ else 'java'


def isolated_env():
    return {k: v for k, v in os.environ.items()
            if k in ('PATH', 'HOME', 'JAVA_HOME', 'TMPDIR', 'LANG')}


class StartupConfiguration(unittest.TestCase):
    def test_missing_postgres_configuration_names_setting_without_values(self):
        values = dict(MN_DB_URL='jdbc:postgresql://127.0.0.1:1/isolated', MN_DB_USER='mn_runtime',
            MN_DB_PASSWORD='synthetic-db-secret', MN_MIGRATION_USER='mn_migrate',
            MN_MIGRATION_PASSWORD='synthetic-migration-secret', MN_JWT_SECRET='synthetic-signing-secret-at-least-32-bytes',
            MN_TMDB_KEY='synthetic-tmdb-secret', MN_OMDB_KEY='synthetic-omdb-secret')
        for missing in values:
            with self.subTest(setting=missing):
                env = isolated_env() | values
                del env[missing]
                result = subprocess.run([JAVA, '-jar', str(JAR),
                    '--spring.config.location=classpath:/application-postgres.properties',
                    '--spring.profiles.active=postgres'], env=env, capture_output=True, text=True, timeout=45)
                self.assertNotEqual(0, result.returncode)
                output = result.stdout + result.stderr
                self.assertIn('Required PostgreSQL setting: ' + missing, output)
                self.assertNotIn('Started Movienight', output)
                for key in ('MN_DB_PASSWORD', 'MN_MIGRATION_PASSWORD', 'MN_JWT_SECRET', 'MN_TMDB_KEY', 'MN_OMDB_KEY'):
                    self.assertNotIn(values[key], output)



class PostgresRecovery(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cluster = Cluster(Path(tempfile.gettempdir()) / ('mn009-' + str(os.getpid())))
        cls.cluster.init()
        cls.port = free_port()
        cls.app = None
        cls.env = isolated_env() | cls.cluster.environment() | {'MN_TMDB_KEY': 'isolated-fixture', 'MN_OMDB_KEY': 'isolated-fixture'}
        cls.provider_port = free_port()
        cls.fixture_log = (cls.cluster.path / 'fixture.log').open('w')
        cls.fixture = subprocess.Popen(['python3', str(ROOT / 'docs/features/009-durable-storage/provider_fixture.py'),
                                        '--port', str(cls.provider_port)], env=isolated_env(), stdout=cls.fixture_log, stderr=subprocess.STDOUT)
        print('Retained disposable cluster:', cls.cluster.path, flush=True)

    @classmethod
    def tearDownClass(cls):
        cls.stop_app()
        cls.fixture.terminate()
        cls.fixture.wait(timeout=10)
        cls.fixture_log.close()
        cls.cluster.stop()

    @classmethod
    def stop_app(cls):
        if cls.app:
            cls.app.terminate()
            cls.app.wait(timeout=30)
            cls.app = None
            cls.app_log.close()

    @classmethod
    def start_app(cls, *extra, env=None, success=True):
        cls.stop_app()
        cls.log_number = getattr(cls, 'log_number', 0) + 1
        cls.last_log = cls.cluster.path / f'app-{cls.log_number}.log'
        cls.app_log = cls.last_log.open('w')
        cls.app = subprocess.Popen([JAVA, '-jar', str(JAR),
            '--spring.config.location=classpath:/application-postgres.properties', '--spring.profiles.active=postgres',
            '--server.address=127.0.0.1', f'--server.port={cls.port}',
            f'--app.tmdb.base-url=http://127.0.0.1:{cls.provider_port}/3',
            f'--app.omdb.base-url=http://127.0.0.1:{cls.provider_port}', *extra],
            env=env or cls.env, stdout=cls.app_log, stderr=subprocess.STDOUT)
        for _ in range(300):
            if cls.app.poll() is not None:
                if success:
                    raise AssertionError('Backend startup failed; inspect retained app.log')
                return
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{cls.port}/api/auth/check-name?displayName=probe', timeout=1):
                    if not success:
                        raise AssertionError('Invalid startup served HTTP')
                    log = cls.last_log.read_text()
                    if 'Successfully loaded' in log or 'MovieLens similarity backbone already initialized' in log:
                        return
                    time.sleep(.1)
            except (urllib.error.URLError, TimeoutError):
                time.sleep(.1)
        raise AssertionError('Backend startup timeout')

    def http(self, path, token=None, method='GET', body=None, expected=200):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        request = urllib.request.Request(f'http://127.0.0.1:{self.port}/api' + path,
            data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                status, data = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, data = error.code, error.read()
        self.assertEqual(expected, status, f'{method} {path}: status {status}')
        return json.loads(data) if data else None

    def login(self, name):
        return self.http('/auth/login', method='POST', body={'username': name, 'password': 'synthetic-password'})

    def create_state(self):
        users = {}
        for name in ('owner', 'friend', 'unrelated'):
            self.http('/auth/signup', method='POST', expected=201, body={'username': name,
                'password': 'synthetic-password', 'confirmPassword': 'synthetic-password'})
            users[name] = self.login(name)
        owner, friend = users['owner']['token'], users['friend']['token']
        self.http('/movies/tmdb/862?mediaType=MOVIE', owner)
        self.http('/movies/tmdb/864?mediaType=MOVIE', owner)
        self.assertEqual([], self.http('/movies/library', owner))
        # Shared disposable model inputs only; all personal data uses HTTP.
        with self.cluster.connect() as conn:
            conn.execute('DELETE FROM movienight.movie_similarity')
            conn.execute('INSERT INTO movienight.movie_similarity(tmdb_id,neighbor_tmdb_id,score) VALUES (137,864,0.9),(137,863,0.8),(137,862,0.7)')
        entries = []
        for provider, media, status, rating in [(862, 'MOVIE', 'WATCHED', 0),
                (862, 'TV', 'WATCHED', None), (900, 'ANIME', 'WATCHED', 7.5),
                (863, 'MOVIE', 'WATCHLIST', None), (137, 'MOVIE', 'WATCHED', 7.5)]:
            payload = dict(tmdbId=provider, title='Fixture title', mediaType=media,
                           status=status, personalRating=rating, notes='owner private ' + media)
            entry = self.http('/movies/library', owner, 'POST', payload, 201)
            duplicate = self.http('/movies/library', owner, 'POST', payload, 201)
            self.assertEqual(entry['id'], duplicate['id'])
            entries.append(entry)
        self.assertNotEqual(entries[0]['movie']['id'], entries[1]['movie']['id'])
        list_ids = []
        for title in ('Keep', 'Independent'):
            custom = self.http('/lists', owner, 'POST', {'title': title}, 201)
            list_ids.append(custom['id'])
            for entry in entries[:2]:
                for _ in range(2):
                    result = self.http(f"/lists/{custom['id']}/movies", owner, 'POST', {'movieId': entry['movie']['id']})
            self.assertEqual(2, len(result['entries']))
        self.http(f"/lists/{list_ids[1]}/movies/{entries[0]['movie']['id']}", owner, 'DELETE')
        self.http('/movies/library', friend, 'POST', dict(tmdbId=137, title='Friend title',
            mediaType='MOVIE', status='WATCHED', personalRating=7.5, notes='friend private'), 201)
        self.http('/friends/add', owner, 'POST', {'identifier': 'friend'}, 201)
        self.http(f"/friends/{users['owner']['id']}/library", friend, expected=403)
        self.http(f"/friends/{users['owner']['id']}/accept", friend, 'POST')
        self.http('/friends/add', friend, 'POST', {'identifier': 'unrelated'}, 201)
        self.users, self.entries, self.list_ids = users, entries, list_ids
        return self.read_state()

    def read_state(self):
        owner, friend, unrelated = [self.login(n)['token'] for n in ('owner', 'friend', 'unrelated')]
        self.http('/movies/library', expected=403)
        for custom_id in self.list_ids:
            self.http(f'/lists/{custom_id}', friend, expected=403)
            self.http(f'/lists/{custom_id}', unrelated, 'PUT', {'title': 'stolen'}, 404)
            self.http(f'/lists/{custom_id}', unrelated, 'DELETE', expected=404)
        self.http(f"/friends/{self.users['owner']['id']}/library", unrelated, expected=403)
        self.http(f"/friends/{self.users['friend']['id']}/library", unrelated, expected=403)
        shared = self.http(f"/friends/{self.users['owner']['id']}/library", friend)
        self.assertEqual(5, len(shared))
        self.assertTrue(all('notes' not in row for row in shared))
        other = self.http('/movies/library', unrelated)
        self.assertEqual([], other)
        personal = self.http('/suggestions/personal', owner)
        # Every available personal candidate must obey the existing typed library exclusions.
        self.assertNotIn('friend private', json.dumps(personal))
        excluded = {('MOVIE', 862), ('TV', 862), ('TV', 900), ('MOVIE', 863), ('MOVIE', 137)}
        self.assertTrue(any(movie['tmdbId'] == 864 for category in personal['categories'] for movie in category['movies']))
        for category in personal['categories']:
            for movie in category['movies']:
                self.assertNotIn(('MOVIE' if movie['mediaType'] == 'MOVIE' else 'TV', movie['tmdbId']), excluded)
        return dict(library=self.http('/movies/library', owner), shared=shared,
                    lists=[self.http(f'/lists/{i}', owner) for i in self.list_ids],
                    friends=self.http('/friends', owner), pending=self.http('/friends/invitations', unrelated))

    def assert_history(self, versions):
        with self.cluster.connect() as conn:
            self.assertEqual([(v, True) for v in versions], conn.execute(
                'SELECT version,success FROM movienight.flyway_schema_history WHERE version IS NOT NULL ORDER BY installed_rank').fetchall())

    def test_01_fresh_schema_and_http_retention(self):
        self.start_app()
        snapshot = self.create_state()
        self.assertEqual({('MOVIE', 862): 0, ('TV', 862): None, ('TV', 900): 7.5, ('MOVIE', 863): None, ('MOVIE', 137): 7.5},
            {(('MOVIE' if row['movie']['mediaType'] == 'MOVIE' else 'TV'), row['movie']['tmdbId']): row['personalRating'] for row in snapshot['library']})
        for database_restart in (False, True):
            self.stop_app()
            if database_restart:
                self.cluster.stop()
                self.cluster.start()
            self.start_app()
            self.assertEqual(snapshot, self.read_state())
        self.assert_history(['1', '2'])
        self.check_failed_writes_and_privacy()

    def check_failed_writes_and_privacy(self):
        owner, unrelated = self.login('owner')['token'], self.login('unrelated')['token']
        movie = self.entries[0]['movie']['id']
        self.http(f'/movies/library/{movie}', unrelated, 'PUT', {'status': 'WATCHED'}, 400)
        before = self.http('/movies/library', owner)
        with self.cluster.connect() as conn:
            conn.execute('REVOKE UPDATE ON movienight.user_movie_entries FROM mn_runtime')
        result = self.http(f'/movies/library/{movie}', owner, 'PUT', {'status': 'WATCHED', 'personalRating': 7.5}, 500)
        self.assertNotIn('SQL', json.dumps(result))
        self.assertEqual(before, self.http('/movies/library', owner))
        with self.cluster.connect() as conn:
            conn.execute('GRANT UPDATE ON movienight.user_movie_entries TO mn_runtime')
        self.http(f'/movies/library/{movie}', owner, 'PUT', {'status': 'WATCHED', 'personalRating': 7.5})
        self.assertEqual(5, len(self.http('/movies/library', owner)))
        self.http(f'/movies/library/{movie}', owner, 'PUT', {'status': 'WATCHED', 'personalRating': None})
        self.assertIsNone(next(e for e in self.http('/movies/library', owner) if e['movie']['id'] == movie)['personalRating'])
        watchlist_movie = self.entries[3]['movie']['id']
        self.http(f'/movies/library/{watchlist_movie}', owner, 'PUT', {'status': 'WATCHED', 'personalRating': 7.5})
        self.assertFalse(any(e['movie']['id'] == watchlist_movie for e in self.http('/movies/library?status=WATCHLIST', owner)))
        self.assertEqual(7.5, next(e for e in self.http('/movies/library?status=WATCHED', owner) if e['movie']['id'] == watchlist_movie)['personalRating'])
        with self.cluster.connect() as conn:
            conn.execute('REVOKE SELECT ON movienight.user_movie_entries FROM mn_runtime')
        self.http('/movies/library', owner, expected=500)
        self.http('/suggestions/personal', owner, expected=500)
        with self.cluster.connect() as conn:
            conn.execute('GRANT SELECT ON movienight.user_movie_entries TO mn_runtime')
        self.http(f"/friends/{self.users['friend']['id']}", owner, 'DELETE')
        friend = self.login('friend')['token']
        self.http(f"/friends/{self.users['owner']['id']}/library", friend, expected=403)
        self.start_app()
        friend = self.login('friend')['token']
        self.http(f"/friends/{self.users['owner']['id']}/library", friend, expected=403)

    def test_02_runtime_privileges_and_private_schema(self):
        self.stop_app()
        import psycopg
        with psycopg.connect(host='127.0.0.1', port=self.cluster.settings['port'], dbname='movienight_local',
                user='mn_runtime', password=self.cluster.settings['runtime'], autocommit=True) as conn:
            for statement in ('CREATE TABLE movienight.forbidden(id int)', 'CREATE TABLE public.forbidden(id int)',
                    'CREATE SCHEMA forbidden', 'CREATE TEMP TABLE forbidden(id int)',
                    'UPDATE movienight.flyway_schema_history SET success=false', 'ALTER TABLE movienight.users ADD COLUMN forbidden int'):
                with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                    conn.execute(statement)
        with self.cluster.connect() as conn:
            conn.execute('GRANT CREATE ON SCHEMA movienight TO mn_runtime')
        self.start_app(success=False)
        with self.cluster.connect() as conn:
            conn.execute('REVOKE CREATE ON SCHEMA movienight FROM mn_runtime')
        self.start_app()

    def test_03_prior_version_upgrade_failure_repair_and_rejection(self):
        self.stop_app()
        self.cluster.create_database('movienight_upgrade')
        type(self).env = self.env | {'MN_DB_URL': self.env['MN_DB_URL'].replace('/movienight_local', '/movienight_upgrade')}
        source = BACKEND / 'src/main/resources/db/postgres'
        migrations = self.cluster.path / 'upgrade-migrations'
        shutil.copytree(source, migrations)
        location = '--app.migrations.locations=filesystem:' + str(migrations)
        self.start_app(location, '--app.migrations.target=1')
        snapshot = self.create_state()
        self.assert_history(['1'])
        self.stop_app()
        v2 = migrations / 'V2__private_notes_and_rating_integrity.sql'
        original = v2.read_text()
        v2.write_text(original + '\nSELECT 1 / 0;\n')
        self.start_app(location, success=False)
        self.assert_history(['1'])
        with self.cluster.connect() as conn:
            self.assertEqual('character varying', conn.execute("SELECT data_type FROM information_schema.columns WHERE table_schema='movienight' AND table_name='user_movie_entries' AND column_name='notes'").fetchone()[0])
        v2.write_text(original)
        self.start_app(location)
        self.assert_history(['1', '2'])
        self.assertEqual(snapshot, self.read_state())
        # V2 actually changes supported behavior: long owner-only notes now persist.
        owner = self.login('owner')['token']
        movie = self.entries[0]['movie']['id']
        note = 'long private note ' * 40
        self.http(f'/movies/library/{movie}', owner, 'PUT', {'status': 'WATCHED', 'personalRating': 0, 'notes': note})
        self.start_app(location)
        library = self.http('/movies/library', self.login('owner')['token'])
        self.assertEqual(note, next(e for e in library if e['movie']['id'] == movie)['notes'])
        self.assert_history(['1', '2'])
        v1 = migrations / 'V1__application_schema.sql'
        v1_original = v1.read_text()
        v1.write_text(v1_original + '\nSELECT 1;\n')
        self.start_app(location, success=False)
        self.assert_history(['1', '2'])
        v1.write_text(v1_original)
        self.start_app(location)
        self.assertEqual(library, self.http('/movies/library', self.login('owner')['token']))
        self.stop_app()
        with self.cluster.connect() as conn:
            conn.execute('ALTER TABLE movienight.movies RENAME COLUMN title TO drifted_title')
        self.start_app(location, success=False)
        with self.cluster.connect() as conn:
            conn.execute('ALTER TABLE movienight.movies RENAME COLUMN drifted_title TO title')
        self.start_app(location)
        self.assertEqual(library, self.http('/movies/library', self.login('owner')['token']))
        self.stop_app()
        with self.cluster.connect() as conn:
            conn.execute('DROP INDEX movienight.idx_movie_tmdb_id')
        self.start_app(location, success=False)
        with self.cluster.connect() as conn:
            conn.execute('CREATE UNIQUE INDEX idx_movie_tmdb_id ON movienight.movies(resource_type,tmdb_id) WHERE false')
        self.start_app(location, success=False)
        with self.cluster.connect() as conn:
            conn.execute('DROP INDEX movienight.idx_movie_tmdb_id')
            conn.execute('CREATE UNIQUE INDEX idx_movie_tmdb_id ON movienight.movies(resource_type,tmdb_id)')
        self.start_app(location)
        self.stop_app()
        with self.cluster.connect() as conn:
            conn.execute('ALTER TABLE movienight.user_movie_entries DROP CONSTRAINT valid_personal_rating')
        self.start_app(location, success=False)
        with self.cluster.connect() as conn:
            conn.execute('ALTER TABLE movienight.user_movie_entries ADD CONSTRAINT valid_personal_rating CHECK (personal_rating IS NULL OR (personal_rating BETWEEN 0 AND 10 AND personal_rating * 2 = trunc(personal_rating * 2)))')
        self.start_app(location)
        self.check_failed_writes_and_privacy()

    def test_04_invalid_credentials_and_unavailable_database(self):
        for key in ('MN_DB_PASSWORD', 'MN_MIGRATION_PASSWORD'):
            self.start_app(env=self.env | {key: 'invalid-secret-must-not-appear'}, success=False)
            self.assertNotIn('invalid-secret-must-not-appear', self.last_log.read_text())
        self.start_app(env=self.env | {'MN_DB_URL': f'jdbc:postgresql://127.0.0.1:{free_port()}/movienight_upgrade'}, success=False)
        self.start_app()
        self.assertEqual(5, len(self.http('/movies/library', self.login('owner')['token'])))
        self.assert_history(['1', '2'])

    def test_05_explicit_local_tooling_and_cleanup(self):
        directory = Path('/tmp') / ('mn009-cli-' + str(os.getpid()))
        command = [sys.executable, str(Path(__file__).with_name('local_postgres.py'))]
        env = isolated_env() | {'PG_BIN': str(self.cluster.bin)}
        for action in ('init', 'stop', 'start', 'stop', 'cleanup'):
            result = subprocess.run(command + [action, str(directory)], env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(0, result.returncode, f'local tool {action} failed')
        self.assertFalse(directory.exists())
        self.assertTrue(self.cluster.marker.is_file())
        result = subprocess.run(command + ['cleanup', str(directory)], env=env, capture_output=True, text=True, timeout=10)
        self.assertNotEqual(0, result.returncode)


if __name__ == '__main__':
    if not JAR.is_file():
        raise SystemExit('Build the backend JAR first; do not run Maven clean during process checks')
    unittest.main(verbosity=2)
