import { databaseRequest } from "../lib/cec/postgres/runtime.ts";
import { seedPortal } from "./portal-demo-data.mjs";
if (!process.argv.includes("--apply") || process.env.CEC_STORAGE !== "postgres")
  throw Error("Use --apply with configured PostgreSQL.");
process.env.CEC_EMAIL_MODE = "disabled";
try {
  const r = await databaseRequest(seedPortal);
  console.log(
    JSON.stringify({
      batch: r.batch,
      replayed: !!r.replayed,
      counts: Object.fromEntries(
        Object.entries(r)
          .filter(([, v]) => Array.isArray(v))
          .map(([k, v]) => [k, v.length]),
      ),
    }),
  );
} catch (e) {
  console.error("Portal seed failed: " + e.message);
  process.exitCode = 1;
}
