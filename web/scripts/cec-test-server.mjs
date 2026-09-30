import { createPostgresPool, postgresTransaction } from '../lib/cec/postgres/connection.ts';
import { migratePostgres, schemaIdentifier } from '../lib/cec/postgres/migrate.ts';
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
const postgres = process.argv.includes('--postgres');
if(postgres) process.loadEnvFile('.env.local');
const schema=postgres?'club_os_test_'+randomBytes(8).toString('hex'):null;
const pgPool=postgres?createPostgresPool():null;
if(postgres) await postgresTransaction(pgPool,c=>migratePostgres(c,schema));
const dir = mkdtempSync(join(tmpdir(), "cec-test-"));
const secret = randomBytes(32).toString("hex");
const port = process.env.CEC_TEST_PORT || "3100";
const origin = "http://localhost:" + port;
const env = {
  ...process.env,
  CEC_STORAGE: postgres ? "postgres" : "sqlite",
  ...(postgres ? {CEC_POSTGRES_SCHEMA:schema,CEC_QUANT_DATABASE:join(dir,"quant.sqlite"),CEC_WORKER_TEST_POLL:"1"} : {}),
  CEC_DATABASE: join(dir, "cec.sqlite"),
  CEC_QUANT_DATABASE: join(dir, "quant.sqlite"),
  CEC_EMAIL_MODE: process.argv.includes("--email") ? "capture" : "disabled",
  CEC_EMAIL_KEY: randomBytes(32).toString("hex"),
  CEC_EMAIL_FROM: "Club OS <test@example.test>",
  CEC_BOOTSTRAP_TOKEN: secret,
  CEC_ORIGIN: origin,
  CEC_TEST_ORIGIN: origin,
  NEXT_TELEMETRY_DISABLED: "1",
  CEC_DIST_DIR: postgres ? ".next-dbg" : ".next-test",
  WATCHPACK_POLLING: "1000",
};
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--port", port],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
const worker = postgres ? spawn(process.execPath,['--experimental-strip-types','scripts/postgres-worker.mjs','work'],{env,stdio:['ignore','ignore','pipe']}) : null;
let logs = "";
server.stdout.on("data", (b) => (logs += b));
server.stderr.on("data", (b) => {
  logs += b;
  process.stderr.write(b);
});
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error("Test server exited");
    try {
      const r = await fetch(env.CEC_ORIGIN + "/api/cec/state", {
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw Error("Server did not start");
  const suites = process.argv.includes("--email") ? ["tests/cec-email-api.mjs"] : process.argv.includes("--pilot") ? ["tests/cec-pilot-api.mjs"] : ["tests/cec-api.mjs", "tests/cec-pages.mjs", "tests/cec-organization-api.mjs"];
  for (const suite of suites) {
    const test = spawn(process.execPath, ['--experimental-strip-types','--import','./tests/ts-resolve-register.mjs',suite], { env, stdio: "inherit" });
    const code = await new Promise((r) => test.on("exit", r));
    if (code !== 0) throw Error(suite + " failed");
  }
} catch (e) {
  console.error(e.message);
  console.error(logs.slice(-12000));
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
  if (server.exitCode === null) await new Promise((r) => server.on("exit", r));
  if(worker){worker.kill('SIGTERM');if(worker.exitCode===null)await new Promise(r=>worker.on('exit',r));}
  if(pgPool){await pgPool.query('DROP SCHEMA '+schemaIdentifier(schema)+' CASCADE');await pgPool.end();}
  rmSync(dir, { recursive: true, force: true });
}
