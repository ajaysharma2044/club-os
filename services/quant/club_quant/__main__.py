import argparse
import json
from pathlib import Path
from wsgiref.simple_server import make_server
from .api import App

parser = argparse.ArgumentParser(description='Club OS local backend pilot')
parser.add_argument('--database', default='club-os.sqlite3')
parser.add_argument('--credentials', required=True, help='Path to private token-to-principal JSON')
parser.add_argument('--port', type=int, default=8080)
args = parser.parse_args()
app = App(args.database, json.loads(Path(args.credentials).read_text()))
with make_server('127.0.0.1', args.port, app) as server:
    print('Club OS pilot listening on http://127.0.0.1:%s' % args.port)
    server.serve_forever()
