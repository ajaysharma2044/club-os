"""Transactional event record with explicit knowledge-time replay and source ACLs."""
import hashlib
import json
import re
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone


class Invalid(ValueError):
    pass


class Denied(PermissionError):
    pass


def utc(value):
    if not isinstance(value, str):
        raise Invalid('timestamp must be an ISO 8601 string')
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise Invalid('invalid timestamp') from exc
    if dt.tzinfo is None:
        raise Invalid('timestamp must include timezone')
    return dt.astimezone(timezone.utc).isoformat(timespec='microseconds')


def now():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


def packed(value):
    try:
        return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)
    except (ValueError, TypeError) as exc:
        raise Invalid('payload must be finite JSON') from exc


@dataclass(frozen=True)
class Principal:
    club: str
    subject: str
    role: str
    sources: tuple

    def require(self, source=None, write=False):
        if self.role not in ('officer', 'researcher') or (write and self.role != 'officer'):
            raise Denied('role is not permitted')
        if source is not None and source not in self.sources:
            raise Denied('source not permitted')


# Closed schemas deliberately exclude message bodies, grades and unreviewed trait scores.
SCHEMAS = {
    'membership': {'status': ('active', 'left'), 'role': str},
    'event': {'status': ('draft', 'published', 'closed'), 'starts_at': 'timestamp', 'title': str},
    'rsvp': {'status': ('yes', 'no', 'waitlist')},
    'attendance': {'status': ('present', 'absent'), 'method': ('qr', 'officer')},
    'task': {'status': ('assigned', 'accepted', 'submitted', 'completed', 'cancelled'), 'title': str, 'due_at': 'timestamp'},
    'application': {'status': ('submitted', 'review', 'accepted', 'declined', 'withdrawn')},
    'coffee_chat': {'status': ('booked', 'completed', 'cancelled', 'missed'), 'starts_at': 'timestamp'},
    'artifact': {'status': ('submitted', 'reviewed'), 'url': str},
    'decision': {'status': ('proposed', 'confirmed'), 'title': str},
    'opportunity': {'status': ('lead', 'contacted', 'proposed', 'signed', 'fulfilled', 'lost'), 'title': str},
}


def validate(kind, payload):
    if kind not in SCHEMAS or not isinstance(payload, dict):
        raise Invalid('unknown kind or invalid payload')
    if payload.keys() != SCHEMAS[kind].keys():
        raise Invalid('payload must contain exactly: ' + ', '.join(SCHEMAS[kind]))
    result = dict(payload)
    for field, rule in SCHEMAS[kind].items():
        value = payload[field]
        if isinstance(rule, tuple):
            if value not in rule:
                raise Invalid('invalid ' + field)
        elif rule == 'timestamp':
            result[field] = utc(value)
        elif not isinstance(value, str) or not value.strip() or len(value) > 1000:
            raise Invalid('invalid ' + field)
    return result


class Store:
    def __init__(self, path=':memory:', clock=now):
        self.clock = clock
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA busy_timeout=5000')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS sources (
          club TEXT NOT NULL, id TEXT NOT NULL, provider TEXT NOT NULL,
          enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), PRIMARY KEY(club,id));
        CREATE TABLE IF NOT EXISTS records (
          seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
          club TEXT NOT NULL, source TEXT NOT NULL, external_id TEXT NOT NULL,
          fact_key TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT NOT NULL,
          object_id TEXT NOT NULL, occurred_at TEXT NOT NULL, known_at TEXT NOT NULL,
          payload TEXT NOT NULL, actor TEXT NOT NULL, supersedes TEXT,
          reason TEXT, digest TEXT NOT NULL, UNIQUE(club,source,external_id),
          FOREIGN KEY(club,source) REFERENCES sources(club,id),
          FOREIGN KEY(supersedes) REFERENCES records(id));
        CREATE INDEX IF NOT EXISTS replay ON records(club,known_at,occurred_at);
        CREATE UNIQUE INDEX IF NOT EXISTS one_correction ON records(supersedes)
          WHERE supersedes IS NOT NULL;
        CREATE TRIGGER IF NOT EXISTS immutable_record BEFORE UPDATE ON records
          BEGIN SELECT RAISE(ABORT, 'records are immutable'); END;
        CREATE TABLE IF NOT EXISTS suppressed (
          club TEXT NOT NULL, subject TEXT NOT NULL, PRIMARY KEY(club,subject));
        CREATE TABLE IF NOT EXISTS predictions (
          id TEXT PRIMARY KEY, club TEXT NOT NULL, created_at TEXT NOT NULL,
          body TEXT NOT NULL);
        ''')

    def close(self):
        self.db.close()

    def source(self, p, source, provider='native', enabled=True):
        p.require(source, write=True)
        if provider not in ('native', 'google_workspace', 'slack', 'canvas', 'calendar'):
            raise Invalid('unknown provider')
        if type(enabled) is not bool:
            raise Invalid('enabled must be boolean')
        with self.db:
            self.db.execute('INSERT INTO sources VALUES (?,?,?,?) ON CONFLICT(club,id) DO UPDATE SET enabled=excluded.enabled',
                            (p.club, source, provider, int(enabled)))

    def ingest(self, p, *, source, external_id, fact_key, kind, subject, object_id,
               occurred_at, payload, supersedes=None, reason=None):
        p.require(source, write=True)
        for value in (source, external_id, fact_key, subject, object_id):
            if not isinstance(value, str) or not value.strip() or len(value) > 200:
                raise Invalid('identifiers must be nonempty strings up to 200 characters')
        if any(not re.fullmatch(r'[A-Za-z0-9_.-]+', v) for v in (subject, object_id)):
            raise Invalid('subject and object identifiers must be alphanumeric with ._-')
        if fact_key != ':'.join((kind, subject, object_id)):
            raise Invalid('fact_key must equal kind:subject:object_id')
        if kind == 'event' and subject != p.club:
            raise Invalid('event subject must be the club')
        payload = validate(kind, payload)
        occurred_at, known_at = utc(occurred_at), utc(self.clock())
        if occurred_at > known_at:
            raise Invalid('occurrence cannot be in the future; put scheduled time in payload')
        if supersedes is not None and (not isinstance(reason, str) or not reason.strip() or len(reason) > 1000):
            raise Invalid('correction requires a reason')
        canonical = packed([fact_key, kind, subject, object_id, occurred_at, payload, supersedes, reason])
        digest = hashlib.sha256(canonical.encode()).hexdigest()
        try:
            self.db.execute('BEGIN IMMEDIATE')
            src = self.db.execute('SELECT enabled FROM sources WHERE club=? AND id=?', (p.club, source)).fetchone()
            if not src or not src['enabled']:
                raise Denied('source is not connected')
            if self.db.execute('SELECT 1 FROM suppressed WHERE club=? AND subject IN (?,?)', (p.club, subject, p.subject)).fetchone():
                raise Denied('subject has been erased; re-ingestion blocked')
            duplicate = self.db.execute('SELECT * FROM records WHERE club=? AND source=? AND external_id=?', (p.club, source, external_id)).fetchone()
            if duplicate:
                if duplicate['digest'] != digest:
                    raise Invalid('idempotency key reused with different content')
                self.db.commit()
                return {'id': duplicate['id'], 'known_at': duplicate['known_at'], 'duplicate': True}
            if supersedes:
                old = self.db.execute('SELECT * FROM records WHERE id=? AND club=? AND source=?', (supersedes, p.club, source)).fetchone()
                if not old or any(old[k] != v for k, v in [('fact_key', fact_key), ('kind', kind), ('subject', subject), ('object_id', object_id), ('occurred_at', occurred_at)]):
                    raise Invalid('correction must replace the same source fact and valid time')
            existing = self.db.execute('SELECT * FROM records WHERE club=? AND fact_key=? ORDER BY seq DESC LIMIT 1', (p.club, fact_key)).fetchone()
            if existing and any(existing[k] != v for k, v in [('source', source), ('kind', kind), ('subject', subject), ('object_id', object_id)]):
                raise Invalid('fact key belongs to a different record identity')
            record_id = str(uuid.uuid4())
            self.db.execute('INSERT INTO records(id,club,source,external_id,fact_key,kind,subject,object_id,occurred_at,known_at,payload,actor,supersedes,reason,digest) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (record_id, p.club, source, external_id, fact_key, kind, subject, object_id, occurred_at, known_at, packed(payload), p.subject, supersedes, reason, digest))
            self.db.commit()
        except sqlite3.IntegrityError as exc:
            self.db.rollback()
            raise Invalid('record conflicts with existing history') from exc
        except Exception:
            self.db.rollback()
            raise
        return {'id': record_id, 'known_at': known_at, 'duplicate': False}

    def history(self, p, valid_at=None, known_at=None):
        p.require()
        valid_at, known_at = utc(valid_at or self.clock()), utc(known_at or self.clock())
        rows = self.db.execute('''SELECT r.* FROM records r JOIN sources s
          ON r.club=s.club AND r.source=s.id WHERE r.club=? AND s.enabled=1
          AND r.occurred_at<=? AND r.known_at<=? ORDER BY r.seq''', (p.club, valid_at, known_at))
        return [{**dict(r), 'payload': json.loads(r['payload'])} for r in rows if r['source'] in p.sources]

    def snapshot(self, p, valid_at=None, known_at=None):
        rows = self.history(p, valid_at, known_at)
        replaced = {r['supersedes'] for r in rows if r['supersedes']}
        current = {}
        for r in sorted(rows, key=lambda r: (r['occurred_at'], r['seq'])):
            if r['id'] not in replaced:
                current[r['fact_key']] = r
        return list(current.values())

    def graph(self, p):
        """A typed evidence graph projection; no inferred friendship or personal ranking."""
        rows = self.snapshot(p)
        edges = [{'from': r['subject'], 'to': r['object_id'],
                  'relationship': r['kind'], 'state': r['payload']['status'],
                  'source_record': r['id'], 'source': r['source'],
                  'valid_at': r['occurred_at'], 'known_at': r['known_at']}
                 for r in rows]
        return {'nodes': sorted({e[k] for e in edges for k in ('from', 'to')}), 'edges': edges}

    def erase_subject(self, p, subject):
        """Privileged erasure overrides historical reproducibility; invalidate all derived runs."""
        p.require(write=True)
        all_sources = {r[0] for r in self.db.execute('SELECT id FROM sources WHERE club=?', (p.club,))}
        if not all_sources.issubset(set(p.sources)):
            raise Denied('erasure requires access to all club sources')
        with self.db:
            self.db.execute('INSERT OR IGNORE INTO suppressed VALUES (?,?)', (p.club, subject))
            # Remove correction leaves before parents to retain referential integrity.
            ids = self.db.execute('SELECT id FROM records WHERE club=? AND fact_key IN (SELECT fact_key FROM records WHERE club=? AND (subject=? OR actor=?)) ORDER BY seq DESC', (p.club, p.club, subject, subject)).fetchall()
            # Actor-only erasure may point to a remaining correction: reject instead of partial deletion.
            for row in ids:
                self.db.execute('DELETE FROM records WHERE id=?', (row[0],))
            self.db.execute('DELETE FROM predictions WHERE club=?', (p.club,))
        return {'erased_records': len(ids), 'derived_runs_invalidated': True}

    def save_prediction(self, p, body):
        p.require()
        ident = str(uuid.uuid4())
        with self.db:
            self.db.execute('INSERT INTO predictions VALUES (?,?,?,?)', (ident, p.club, utc(self.clock()), packed(body)))
        return {**body, 'id': ident}

    def prediction(self, p, ident):
        p.require()
        row = self.db.execute('SELECT body FROM predictions WHERE id=? AND club=?', (ident, p.club)).fetchone()
        if not row:
            raise Invalid('prediction not found')
        body = json.loads(row[0])
        readable = {r['id'] for r in self.history(p)}
        if not set(body['lineage']).issubset(readable):
            raise Denied('prediction evidence is no longer authorized')
        return {**body, 'id': ident}
