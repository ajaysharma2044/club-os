"""Local pilot WSGI API. Tokens are server-configured, scoped, and never client-asserted."""
import hmac
import json
from urllib.parse import parse_qs
from .store import Store, Principal, Invalid, Denied
from .quant import forecast, evaluate, MODEL
from .planning import simulate


class App:
    def __init__(self, database, credentials):
        if not credentials or any(len(token) < 32 for token in credentials):
            raise ValueError('configure at least one random token of 32+ characters')
        self.database = database
        self.credentials = credentials

    def __call__(self, env, start_response):
        store = None
        try:
            authorization = env.get('HTTP_AUTHORIZATION', '')
            if not authorization.startswith('Bearer '):
                raise Denied('Bearer authentication required')
            token = authorization[7:]
            principal = next((Principal(**value) for key, value in self.credentials.items()
                              if hmac.compare_digest(token, key)), None)
            if principal is None:
                raise Denied('authentication required')
            principal.require()
            method, path = env['REQUEST_METHOD'], env.get('PATH_INFO', '')
            query = parse_qs(env.get('QUERY_STRING', ''), strict_parsing=True) if env.get('QUERY_STRING') else {}
            body = {}
            if method == 'POST':
                length = int(env.get('CONTENT_LENGTH') or 0)
                if not 0 < length <= 65536:
                    raise Invalid('body must be between 1 and 65536 bytes')
                body = json.loads(env['wsgi.input'].read(length))
                if not isinstance(body, dict):
                    raise Invalid('JSON object required')
            store = Store(self.database)
            status = '200 OK'
            if method == 'POST' and path == '/v1/sources':
                store.source(principal, **body)
                result = {'status': 'configured'}
            elif method == 'POST' and path == '/v1/records':
                result = store.ingest(principal, **body)
                status = '200 OK' if result['duplicate'] else '201 Created'
            elif method == 'GET' and path in ('/v1/records', '/v1/snapshot'):
                if set(query) - {'valid_at', 'known_at'}:
                    raise Invalid('unknown query parameter')
                params = {k: v[0] for k,v in query.items()}
                result = (store.history if path.endswith('records') else store.snapshot)(principal, **params)
            elif method == 'GET' and path == '/v1/graph':
                result = store.graph(principal)
            elif method == 'GET' and path == '/v1/models':
                result = [MODEL]
            elif method == 'POST' and path == '/v1/plans':
                result = simulate(**body)
            elif method == 'POST' and path == '/v1/forecasts':
                result = forecast(store, principal, **body)
            elif method == 'POST' and path == '/v1/evaluations':
                result = evaluate(store, principal, **body)
            elif method == 'POST' and path == '/v1/erase-subject':
                result = store.erase_subject(principal, **body)
            elif method == 'GET' and path.startswith('/v1/predictions/'):
                result = store.prediction(principal, path.rsplit('/', 1)[1])
            else:
                status, result = '404 Not Found', {'error': 'route not found'}
        except Denied as exc:
            status, result = '403 Forbidden', {'error': str(exc)}
        except (Invalid, ValueError, TypeError, KeyError) as exc:
            status, result = '400 Bad Request', {'error': str(exc)}
        except Exception:
            status, result = '500 Internal Server Error', {'error': 'internal error'}
        finally:
            if store:
                store.close()
        data = json.dumps(result, allow_nan=False).encode()
        start_response(status, [('Content-Type','application/json'), ('Content-Length',str(len(data))),
                                ('Cache-Control','no-store'), ('X-Content-Type-Options','nosniff')])
        return [data]
