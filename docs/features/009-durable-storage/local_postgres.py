"""Dedicated native PostgreSQL 17.6 cluster; never connects to a hosted/existing DB.
Requires PG_BIN (directory with initdb, pg_ctl, postgres) and psycopg[binary]==3.2.10.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess

import psycopg
from psycopg import sql


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class Cluster:
    def __init__(self, path):
        self.path = Path(path).resolve()
        self.bin = Path(os.environ['PG_BIN']).resolve()
        self.marker = self.path / 'movienight-disposable.json'

    def command(self, *args):
        return subprocess.run([str(self.bin / args[0]), *map(str, args[1:])],
                              check=True, capture_output=True, text=True)

    def init(self):
        if self.path.exists():
            raise RuntimeError('Target exists; choose a NEW dedicated disposable directory')
        version = self.command('postgres', '--version').stdout.strip()
        if version != 'postgres (PostgreSQL) 17.6':
            raise RuntimeError('PostgreSQL 17.6 required')
        self.path.mkdir(mode=0o700, parents=True)
        self.settings = dict(kind='MovieNight-feature009-disposable-v1', port=free_port(), runtime=secrets.token_urlsafe(32),
                             migration=secrets.token_urlsafe(32), jwt=secrets.token_urlsafe(48))
        self.marker.write_text(json.dumps(self.settings))
        self.marker.chmod(0o600)
        self.command('initdb', '-D', self.path / 'data', '-U', 'mn_local_admin', '--auth-local=trust',
                     '--auth-host=scram-sha-256', '--encoding=UTF8', '--locale=C')
        with (self.path / 'data/postgresql.conf').open('a') as config:
            config.write(f"\nlisten_addresses='127.0.0.1'\nport={self.settings['port']}\n"
                         f"unix_socket_directories='{self.path}'\n")
        self.start()
        with self.connect('postgres') as conn:
            conn.autocommit = True
            conn.execute(sql.SQL('CREATE ROLE mn_migrate LOGIN PASSWORD {}').format(sql.Literal(self.settings['migration'])))
            conn.execute(sql.SQL('CREATE ROLE mn_runtime LOGIN PASSWORD {}').format(sql.Literal(self.settings['runtime'])))
        self.create_database('movienight_local')
        env = self.environment()
        # This is an ignored, generated, shell-compatible configuration with local-only random values.
        (self.path / '.env.postgres').write_text(''.join(f'{k}={v}\n' for k, v in env.items()))
        (self.path / '.env.postgres').chmod(0o600)

    def load(self):
        if not self.marker.is_file() or self.path == Path('/'):
            raise RuntimeError('Not a marked MovieNight disposable cluster')
        self.settings = json.loads(self.marker.read_text())
        if self.settings.get('kind') != 'MovieNight-feature009-disposable-v1':
            raise RuntimeError('Unrecognized disposable cluster marker')

    def create_database(self, name):
        with self.connect('postgres') as conn:
            conn.autocommit = True
            conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        with self.connect(name) as conn:
            conn.execute(sql.SQL('REVOKE ALL ON DATABASE {} FROM PUBLIC').format(sql.Identifier(name)))
            conn.execute(sql.SQL('GRANT CONNECT ON DATABASE {} TO mn_runtime, mn_migrate').format(sql.Identifier(name)))
            conn.execute('REVOKE ALL ON SCHEMA public FROM PUBLIC')
            conn.execute('CREATE SCHEMA movienight AUTHORIZATION mn_migrate')
            conn.execute('GRANT USAGE ON SCHEMA movienight TO mn_runtime')

        self.database = name

    def start(self):
        self.load()
        self.command('pg_ctl', '-D', self.path / 'data', '-l', self.path / 'postgres.log', '-w', 'start')

    def stop(self):
        self.load()
        self.command('pg_ctl', '-D', self.path / 'data', '-m', 'fast', '-w', 'stop')

    def connect(self, database=None):
        self.load()
        return psycopg.connect(host=str(self.path), port=self.settings['port'],
                               user='mn_local_admin', dbname=database or getattr(self, 'database', 'movienight_local'))

    def environment(self):
        self.load()
        return dict(MN_DB_URL=f"jdbc:postgresql://127.0.0.1:{self.settings['port']}/movienight_local",
                    MN_DB_USER='mn_runtime', MN_DB_PASSWORD=self.settings['runtime'],
                    MN_MIGRATION_USER='mn_migrate', MN_MIGRATION_PASSWORD=self.settings['migration'],
                    MN_JWT_SECRET=self.settings['jwt'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['init', 'start', 'stop', 'cleanup'])
    parser.add_argument('directory', help='Explicit dedicated disposable cluster directory')
    args = parser.parse_args()
    cluster = Cluster(args.directory)
    if args.action == 'cleanup':
        cluster.load()
        # Refuse deletion while running; stop first. Never follows an arbitrary JDBC URL.
        if (cluster.path / 'data/postmaster.pid').exists():
            raise RuntimeError('Stop this cluster before cleanup')
        shutil.rmtree(cluster.path)
    else:
        getattr(cluster, args.action)()
    print(f'{args.action}: {cluster.path}')
