import { spawnSync } from "node:child_process";
import { mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const mode = process.argv[2] || "fast";
if (!["fast", "full"].includes(mode)) {
  console.error("Usage: node scripts/verify.mjs [fast|full]");
  process.exit(2);
}
const root = fileURLToPath(new URL("../", import.meta.url));
const web = resolve(root, "web");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const python = process.env.PYTHON_BINARY || "python3";
const steps = [
  ["types", process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"], web],
  ["pure", npm, ["run", "test:pure"], web],
  ["python", python, ["-m", "unittest", "discover", "-s", "tests", "-v"], resolve(root, "services/quant")],
];
if (mode === "full") steps.push(
  ["api", npm, ["run", "test:api"], web],
  ["signals", npm, ["run", "test:signals"], web],
  ["build", npm, ["run", "build"], web],
);

const started = new Date().toISOString();
const output = resolve(root, "work/verification", `${started.replaceAll(":", "-")}-${process.pid}`);
mkdirSync(output, { recursive: true });
const report = { mode, started, node: process.version, status: "running", steps: [] };
const save = () => writeFileSync(resolve(output, "result.json"), JSON.stringify(report, null, 2) + "\n");
save();
console.log(`Verification: ${mode}\nLogs: ${output}`);
for (const [name, command, args, cwd] of steps) {
  const log = resolve(output, `${name}.log`);
  const fd = openSync(log, "w");
  const start = Date.now();
  console.log(`Running ${name}...`);
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  // Only synthetic test processes may bypass the production temporary-storage guard.
  if (["pure", "api", "signals"].includes(name)) env.CEC_ALLOW_EPHEMERAL = "1";
  const result = spawnSync(command, args, { cwd, env, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  const passed = result.status === 0 && !result.error;
  report.steps.push({ name, command: [command, ...args], status: passed ? "passed" : "failed",
    exitCode: result.status, signal: result.signal, seconds: (Date.now() - start) / 1000,
    log, ...(result.error ? { error: result.error.message } : {}) });
  save();
  console.log(`${name}: ${passed ? "PASS" : "FAIL"} (${report.steps.at(-1).seconds}s)`);
  if (!passed) {
    report.status = "failed";
    report.finished = new Date().toISOString();
    save();
    console.error(`Stopped at ${name}. Read ${log}. Remaining steps were not run.`);
    process.exit(1);
  }
}
report.status = "passed";
report.finished = new Date().toISOString();
save();
console.log(`All ${steps.length} steps passed. Evidence: ${resolve(output, "result.json")}`);
