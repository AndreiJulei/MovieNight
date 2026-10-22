"""Reuse demo provider data with one known recommendation outside the test library."""
import argparse
import importlib.util
from pathlib import Path
from http.server import ThreadingHTTPServer

source = Path(__file__).resolve().parents[1] / '008-production-readiness/provider_fixture.py'
spec = importlib.util.spec_from_file_location('demo_provider', source)
demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(demo)
demo.MOVIES[864] = dict(id=864, title='Storage candidate', media_type='movie',
                        release_date='2023-01-01', vote_average=8.0, vote_count=1500)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, required=True)
    args = parser.parse_args()
    ThreadingHTTPServer(('127.0.0.1', args.port), demo.Handler).serve_forever()
