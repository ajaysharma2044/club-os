import { db, id } from './db';

export function recordServerError() {
  const reference=id();
  // Deliberately omit URLs, request bodies, credentials and exception messages.
  console.error(JSON.stringify({event:'cec_api_error',reference}));
  try {
    db().exec('CREATE TABLE IF NOT EXISTS pipeline_status(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
    db().prepare(`INSERT INTO pipeline_status(key,value) VALUES('api_errors_total','1')
      ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1`).run();
    db().prepare("INSERT OR REPLACE INTO pipeline_status VALUES('last_api_error',?)").run(String(Date.now()/1000));
  }catch{/* The independent health monitor detects database failure. */}
}
