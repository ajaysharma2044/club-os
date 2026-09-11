import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
const dir = mkdtempSync(join(tmpdir(), "cec-sig-"));
const secret = randomBytes(32).toString("hex");
const port = "3111";
const origin = "http://localhost:" + port;
const env = { ...process.env, CEC_DATABASE: join(dir, "cec.sqlite"), CEC_BOOTSTRAP_TOKEN: secret,
  CEC_ORIGIN: origin, CEC_TEST_ORIGIN: origin, NEXT_TELEMETRY_DISABLED: "1", CEC_DIST_DIR: ".next-sig", WATCHPACK_POLLING: "1000" };
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", port], { env, stdio: ["ignore","pipe","pipe"] });
let logs = ""; server.stdout.on("data", b => logs += b); server.stderr.on("data", b => logs += b);
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error("server exited");
    try { const r = await fetch(origin + "/api/cec/state", { signal: AbortSignal.timeout(10000) }); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!ready) throw Error("server did not start");
  const t = spawn(process.execPath, ["tests/signals.mjs"], { env, stdio: "inherit" });
  const code = await new Promise(r => t.on("exit", r));
  if (code !== 0) throw Error("signal tests failed");
} catch (e) { console.error(e.message); console.error(logs.slice(-4000)); process.exitCode = 1; }
finally { server.kill("SIGTERM"); if (server.exitCode === null) await new Promise(r => server.on("exit", r)); rmSync(dir, { recursive: true, force: true }); }
